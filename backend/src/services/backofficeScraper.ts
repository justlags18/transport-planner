import axios from "axios";
import { wrapper } from "axios-cookiejar-support";
import { CookieJar } from "tough-cookie";
import * as cheerio from "cheerio";
import { prisma } from "../db";
import { normalizeCustomer, normalizeDestination } from "../utils/normalize";

type BackofficeRow = Record<string, string>;

const LOGIN_URL = process.env.PML_BACKOFFICE_LOGIN_URL
  ?? "https://www.pmlconsignment.co.uk/backoffice/content/manager/index.asp";
const DATA_URL = process.env.PML_BACKOFFICE_DATA_URL ?? LOGIN_URL;
const DATA_URLS = process.env.PML_BACKOFFICE_DATA_URLS ?? "";
const PAGE_PARAM = process.env.PML_BACKOFFICE_PAGE_PARAM ?? ""; // e.g. "page" or "PageNum" to try page=2,3,...
const MAX_PAGES = Math.min(Math.max(parseInt(process.env.PML_BACKOFFICE_MAX_PAGES ?? "20", 10) || 20, 1), 100);
const USERNAME = process.env.PML_BACKOFFICE_USER ?? "";
const PASSWORD = process.env.PML_BACKOFFICE_PASS ?? "";
const DEBUG = process.env.PML_BACKOFFICE_DEBUG === "1";

const normalizeHeader = (value: string) =>
  value.replace(/\s+/g, " ").trim().toLowerCase();

const parseNumber = (value: string | number | null | undefined): number | null => {
  if (value == null) return null;
  const s = typeof value === "number" ? String(value) : String(value).trim();
  if (!s) return null;
  const cleaned = s.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  if (!cleaned) return null;
  const num = Number(cleaned[0]);
  return Number.isFinite(num) ? num : null;
};

/**
 * Parse pieces from packages field, handling formats like "0 of 2" (use 2), "2 X SKID" (use 2).
 * Returns the total piece count.
 */
function parsePieces(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  const s = typeof value === "number" ? String(value) : String(value).trim();
  if (!s) return null;
  // Handle "X of Y" (e.g. "0 of 2") -> use Y (total)
  const ofMatch = s.match(/\d+\s+of\s+(\d+)/i);
  if (ofMatch) return Number(ofMatch[1]);
  // Handle "X x Y" or "X X Y" (e.g. "2 X SKID") -> use X
  const xMatch = s.match(/^(\d+)\s*[xX×]\s+/);
  if (xMatch) return Number(xMatch[1]);
  // Default: parse first number
  return parseNumber(s);
}

function str(row: Record<string, unknown>, key: string): string {
  const v = row[key];
  if (v == null) return "";
  return String(v).trim();
}

/** Find first value in row where key matches one of the patterns (case-insensitive). */
function firstMatch(row: Record<string, unknown>, patterns: RegExp[]): string {
  for (const [key, value] of Object.entries(row)) {
    if (key.startsWith("_")) continue;
    const k = key.toLowerCase();
    if (patterns.some((p) => p.test(k)) && value != null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return "";
}

/** PML ref pattern: digits-sep-digits (e.g. 618-41477155, 618/41477155, 618.41477155). */
const PML_REF_PATTERN = /^\d+\s*[\-/.]\s*\d+$/;

/** Normalize PML ref to a canonical form (e.g. 618-41477155). */
function normalizePmlRef(s: string): string {
  return s.trim().replace(/\s*[\-/.]\s*/, "-");
}

/** Resolve PML ref from a backoffice row; tries multiple column names so refs aren't missed. */
function getPmlRef(row: BackofficeRow): string {
  const direct = row["pml ref"] ?? row["pmlref"] ?? row["ref"] ?? row["pml ref no"] ?? row["reference"] ?? row["ref no"] ?? row["ref no."] ?? "";
  if (typeof direct === "string" && direct.trim()) return normalizePmlRef(direct);
  const byKey = firstMatch(row as Record<string, unknown>, [
    /pml\s*ref|pmlref|^ref\s*no|consignment\s*id|reference\s*no|job\s*ref|consignment\s*ref/i,
  ]);
  if (byKey) return normalizePmlRef(byKey);
  const recordId = row["_recordid"];
  if (typeof recordId === "string" && recordId.trim() && PML_REF_PATTERN.test(recordId.trim())) {
    return normalizePmlRef(recordId);
  }
  const dataRef = row["_dataref"];
  if (typeof dataRef === "string" && dataRef.trim()) return normalizePmlRef(dataRef);
  for (const val of Object.values(row)) {
    if (typeof val === "string" && PML_REF_PATTERN.test(val.trim())) return normalizePmlRef(val);
  }
  return "";
}

/** Last resort: find any key containing quantity- or weight-like substring with a parseable number. */
function scanAllKeysForNumber(
  row: Record<string, unknown>,
  substrings: string[],
): string {
  for (const [key, value] of Object.entries(row)) {
    if (key.startsWith("_")) continue;
    const k = key.toLowerCase();
    if (!substrings.some((s) => k.includes(s))) continue;
    const v = value == null ? "" : String(value).trim();
    if (!v) continue;
    const n = parseNumber(v);
    if (n != null) return v;
  }
  return "";
}

/** Skid = pallet. Extract pallet count from "X skid(s)" or "X X SKID" etc. */
function parseSkidPallets(row: Record<string, unknown>): number | null {
  const unitDetails = str(row, "unit details") || str(row, "units") || str(row, "observation")
    || str(row, "product description") || str(row, "pr desc") || "";
  const text = unitDetails.toLowerCase();
  if (!text.includes("skid")) return null;
  const match = text.match(/(\d+)\s*(?:x\s*)?skids?/i) || unitDetails.match(/(\d+)\s*[xX×]\s*skid/i);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Compute pallet count from a backoffice row.
 * - Skid = pallet: "X skid(s)" or "X X SKID" → pallets = X.
 * - Total PCs (not delivered): "0 of 2" → use 2 for rules.
 * - Flowers, PMC, AKE, then pieces.
 */
export function computePalletsFromRow(row: Record<string, unknown>): number | null {
  const skidPallets = parseSkidPallets(row);
  if (skidPallets != null) return skidPallets;

  const productDescription =
    str(row, "product description") || str(row, "pr desc") || str(row, "product")
    || str(row, "description") || str(row, "goods description")
    || firstMatch(row, [/product|description|goods|pr desc/]);
  let packages =
    str(row, "packages") || str(row, "package") || str(row, "pkgs") || str(row, "packages qty")
    || str(row, "pc") || str(row, "pcs") || str(row, "no. of packages") || str(row, "no of packages")
    || str(row, "number of packages") || str(row, "quantity") || str(row, "qty") || str(row, "pieces")
    || str(row, "unit details") || str(row, "units")
    || firstMatch(row, [/package|pkgs?|pcs?|qty|piece|quantity|no\.?\s*of|unit/]);
  if (!packages) packages = scanAllKeysForNumber(row, ["pc", "pack", "pkg", "qty", "piece", "quantity", "no. of", "no of", "unit"]);
  let weightRaw =
    str(row, "weight") || str(row, "weight kg") || str(row, "weight (kg)") || str(row, "weight (kgs)")
    || str(row, "weight kgs") || str(row, "total weight") || str(row, "gross weight") || str(row, "net weight")
    || str(row, "actual weight") || str(row, "kgs")
    || firstMatch(row, [/weight|kgs?|gross|net\s*weight|actual/]);
  if (!weightRaw) weightRaw = scanAllKeysForNumber(row, ["weight", "kg", "gross", "net weight", "actual weight"]);
  const pieces = packages ? parsePieces(packages) : null;
  const weightKg = weightRaw ? parseNumber(weightRaw) : null;

  const isFlowers =
    productDescription.trim().toLowerCase().includes("flowers") &&
    pieces != null &&
    pieces > 0;

  const weightPerPiece =
    pieces != null && pieces > 0 && weightKg != null && weightKg > 0
      ? weightKg / pieces
      : null;
  const isPmc = weightPerPiece != null && weightPerPiece > 1500;
  const isAke =
    weightPerPiece != null &&
    weightPerPiece >= 650 &&
    weightPerPiece <= 1500;

  if (isFlowers) return Math.ceil(pieces! / 24);
  if (isPmc && pieces != null) return 6 * pieces;
  if (isAke && pieces != null) return 3 * pieces;
  return pieces;
}

const parseEtaIso = (dateStr: string, timeStr: string): string | null => {
  const timeLabel = timeStr.trim();
  if (timeLabel) {
    const numeric = timeLabel.replace(/[^\d]/g, "");
    if (numeric.length === 10 || numeric.length === 13) {
      const epoch = Number(numeric.length === 10 ? `${numeric}000` : numeric);
      const epochDate = new Date(epoch);
      if (!Number.isNaN(epochDate.getTime())) {
        return epochDate.toISOString();
      }
    }
  }
  const combined = `${dateStr} ${timeLabel}`.trim();
  const dt = new Date(combined);
  if (!Number.isNaN(dt.getTime())) {
    return dt.toISOString();
  }
  if (timeLabel && timeLabel.toLowerCase() !== "n/a") {
    return timeLabel;
  }
  return null;
};

export const extractEtaFromFragment = (fragmentHtml: string): string | null => {
  const $ = cheerio.load(fragmentHtml);
  const fragmentText = $.text().replace(/\s+/g, " ").trim();
  if (!fragmentText) return null;

  const keywordMatch = fragmentText.match(
    /\b(?:ETA|Arrival)\b[^0-9]{0,12}([01]\d|2[0-3])[: ]?([0-5]\d)\b/i,
  );
  if (keywordMatch) {
    return `${keywordMatch[1]}:${keywordMatch[2]}`;
  }

  const colonMatch = fragmentText.match(/\b([01]?\d|2[0-3])[: ]([0-5]\d)\b/);
  if (colonMatch) {
    const hh = colonMatch[1].padStart(2, "0");
    const mm = colonMatch[2].padStart(2, "0");
    return `${hh}:${mm}`;
  }

  return null;
};

const readSelectValue = ($select: cheerio.Cheerio<any>): string => {
  if (!$select.length) return "";
  const selected = $select.find("option:selected").attr("value")
    ?? $select.find("option[selected]").attr("value")
    ?? "";
  if (selected) return selected;
  const attrValue = $select.attr("value") ?? "";
  if (attrValue) return attrValue;
  const firstOption = $select.find("option").first();
  return firstOption.attr("value") ?? firstOption.text().trim();
};

const parseSelectTime = ($cell: cheerio.Cheerio<any>): string | null => {
  const hourSelect = $cell.find("select[name='hours']").first();
  const minuteSelect =
    $cell.find("select[name='minutes']").first()
    .add($cell.find("select[name='mins']").first())
    .add($cell.find("select[name='minute']").first());

  const hour = readSelectValue(hourSelect);
  let minute = readSelectValue(minuteSelect);

  if (!minute) {
    const fallbackSelects = $cell.find("select[name='hours']");
    minute = readSelectValue(fallbackSelects.eq(1));
  }

  if (!hour && !minute) return null;
  const hh = hour.padStart(2, "0");
  const mm = minute.padStart(2, "0");
  return `${hh}:${mm}`;
};

const asyncPool = async <T, R>(
  limit: number,
  items: T[],
  iterator: (item: T) => Promise<R>,
): Promise<R[]> => {
  const results: R[] = [];
  let nextIndex = 0;

  const workers = new Array(Math.min(limit, items.length)).fill(null).map(async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await iterator(items[currentIndex]);
    }
  });

  await Promise.all(workers);
  return results;
};

type FlightInfoResult = {
  recordid: string;
  eta: string | null;
  loginDetected: boolean;
  fragmentPreview: string;
};

const fetchFlightInfoResults = async (
  client: ReturnType<typeof wrapper>,
  listingPageUrl: string,
  recordIds: string[],
): Promise<FlightInfoResult[]> => {
  const uniqueIds = Array.from(new Set(recordIds)).filter(Boolean);
  if (!uniqueIds.length) return [];

  const fetchOne = async (recordId: string) => {
    const now = Date.now();
    const base = new URL("getflight.asp", listingPageUrl);
    base.searchParams.set("ID", recordId);
    base.searchParams.set("time", String(now));
    const url = base.toString();
    const res = await client.get(url);
    const fragment = res.data as string;
    const contentType = res.headers?.["content-type"] ?? "";
    const preview = fragment.slice(0, 200);
    const loginDetected =
      /<form/i.test(fragment) && /(password|login)/i.test(fragment);
    if (DEBUG) {
      console.debug(`[backoffice] getflight ${recordId} status=${res.status} type=${contentType}`);
      console.debug(`[backoffice] getflight ${recordId} preview=${preview}`);
    }
    if (loginDetected) {
      return {
        recordid: recordId,
        eta: null,
        loginDetected: true,
        fragmentPreview: preview,
      };
    }
    const eta = extractEtaFromFragment(fragment);
    return {
      recordid: recordId,
      eta,
      loginDetected: false,
      fragmentPreview: preview,
    };
  };

  return asyncPool(5, uniqueIds, fetchOne);
};

const getHeaderMap = (
  $table: cheerio.Cheerio<any>,
  $: cheerio.CheerioAPI,
): string[] => {
  const headerCells = $table.find("thead tr").first().find("th");
  if (headerCells.length) {
    return headerCells.map((_, el) => normalizeHeader($(el).text())).get();
  }
  const firstRow = $table.find("tr").first().find("th,td");
  return firstRow.map((_, el) => normalizeHeader($(el).text())).get();
};

const extractRows = (
  $table: cheerio.Cheerio<any>,
  $: cheerio.CheerioAPI,
): BackofficeRow[] => {
  const headers = getHeaderMap($table, $);
  const rows: BackofficeRow[] = [];

  const bodyRows = $table.find("tbody tr");
  const targetRows = bodyRows.length ? bodyRows : $table.find("tr").slice(1);

  targetRows.each((_, row) => {
    const cells = $(row).find("td");
    if (!cells.length) return;
    const record: BackofficeRow = {};
    cells.each((idx: number, cell: any) => {
      const key = headers[idx] ?? `col_${idx}`;
      const cellText = $(cell).text().replace(/\s+/g, " ").trim();
      const titleText =
        $(cell).attr("title")
        ?? $(cell).attr("data-title")
        ?? $(cell).attr("aria-label")
        ?? $(cell).find("[title]").attr("title")
        ?? "";
      const dataTime = $(cell).children().first().attr("data-time")
        ?? $(cell).find("[data-time]").first().attr("data-time")
        ?? "";
      const selectedTime = key.includes("eta") ? parseSelectTime($(cell)) : null;
      const preferDataTime = key.includes("eta") && (cellText.toLowerCase() === "in" || !cellText);
      const dataText = $(cell).attr("data-text")
        ?? $(cell).attr("data-desc")
        ?? $(cell).attr("data-description")
        ?? $(cell).find("[data-text]").first().attr("data-text")
        ?? "";
      const value =
        preferDataTime && dataTime
          ? dataTime.trim()
          : (selectedTime ?? (cellText || dataText.trim() || titleText.trim()));
      record[key] = value;

      if ($(cell).attr("data-id") === "flightinfo") {
        const recordId = $(cell).attr("data-recordid") ?? "";
        if (recordId) {
          record["_recordid"] = recordId;
        }
      }
      const dataRef = $(cell).attr("data-ref") ?? $(cell).attr("data-id");
      if (dataRef && typeof dataRef === "string" && /^\d+\s*[\-/.]\s*\d+$/.test(dataRef.trim())) {
        record["_dataref"] = dataRef.trim();
      }
    });
    rows.push(record);
  });

  return rows;
};

const pickTable = ($: cheerio.CheerioAPI): cheerio.Cheerio<any> | null => {
  const tables = $("table");
  if (!tables.length) return null;
  const match = tables.filter((_, table) => {
    const headerText = $(table).find("th").map((_, th) => normalizeHeader($(th).text())).get();
    return headerText.includes("pml ref") && headerText.includes("client");
  }).first();
  return match.length ? match : $(tables.get(0));
};

/** Find the next pagination URL from the current page, or null if none. */
const getNextPageUrl = ($: cheerio.CheerioAPI, currentPageUrl: string): string | null => {
  const base = currentPageUrl;
  // rel="next"
  const relNext = $('a[rel="next"]').first().attr("href");
  if (relNext && relNext.trim() && !relNext.startsWith("#")) {
    try {
      const nextUrl = new URL(relNext.trim(), base).toString();
      if (nextUrl !== base) return nextUrl;
    } catch {
      // ignore
    }
  }
  // Link text "Next", ">", "»", or "next page"
  const candidates = $("a[href]").filter((_, el) => {
    const text = $(el).text().replace(/\s+/g, " ").trim().toLowerCase();
    const href = $(el).attr("href") ?? "";
    if (!href || href.startsWith("#") || href.startsWith("javascript:")) return false;
    return (
      text === "next" ||
      text === ">" ||
      text === "»" ||
      text === "next page" ||
      text === "page next" ||
      /^next\s*$/i.test(text)
    );
  });
  if (candidates.length > 0) {
    const href = candidates.first().attr("href")?.trim();
    if (href) {
      try {
        const nextUrl = new URL(href, base).toString();
        if (nextUrl !== base) return nextUrl;
      } catch {
        // ignore
      }
    }
  }
  return null;
};

/** Build URL for next page by incrementing numeric page param (e.g. page=2). */
const buildNextPageUrl = (currentPageUrl: string, pageParam: string, currentPageNum: number): string | null => {
  const nextNum = currentPageNum + 1;
  if (nextNum > MAX_PAGES) return null;
  try {
    const u = new URL(currentPageUrl);
    u.searchParams.set(pageParam, String(nextNum));
    return u.toString();
  } catch {
    return null;
  }
};

const COMMON_PAGE_PARAMS = ["PageNum", "page", "p", "pg", "Page", "pageNumber", "pagenum", "currentPage"]; // try these if PML_BACKOFFICE_PAGE_PARAM not set

const looksLikeLogin = ($: cheerio.CheerioAPI): boolean => {
  return $("input[type='password']").length > 0;
};

const performLogin = async (client: ReturnType<typeof wrapper>, html: string) => {
  const $ = cheerio.load(html);
  const form = $("form").first();
  if (!form.length) return;

  const action = form.attr("action") ?? LOGIN_URL;
  const method = (form.attr("method") ?? "post").toLowerCase();
  const url = new URL(action, LOGIN_URL).toString();

  const inputs = form.find("input");
  const body = new URLSearchParams();
  inputs.each((_, input) => {
    const name = $(input).attr("name");
    if (!name) return;
    const type = ($(input).attr("type") ?? "").toLowerCase();
    if (type === "password") {
      body.set(name, PASSWORD);
      return;
    }
    const value = $(input).attr("value") ?? "";
    body.set(name, value);
  });

  if (!PASSWORD || !USERNAME) {
    throw new Error("PML_BACKOFFICE_USER/PML_BACKOFFICE_PASS not set");
  }

  const userField = inputs
    .map((_, input) => $(input).attr("name"))
    .get()
    .find((name) => name && /user|email|login/i.test(name));
  if (userField) {
    body.set(userField, USERNAME);
  }

  if (method === "get") {
    await client.get(url, { params: body });
  } else {
    await client.post(url, body, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
  }
};

export type FetchAndUpsertOptions = { forceArchive?: boolean };

/** Last scrape run info for developer debug panel (only exposed to Developer role). */
export type ScrapeLog = {
  timestamp: string;
  totalRows: number;
  upserted: number;
  detectedPageParam: string | null;
  nextPageCount: number;
  skippedRows: number;
  sampleSkippedKeys: string[];
  errors: string[];
};

let lastScrapeLog: ScrapeLog | null = null;

export function getLastScrapeLog(): ScrapeLog | null {
  return lastScrapeLog;
}

/** Persist scrape log to DB so all instances / restarts can read it. */
async function saveScrapeLogToDb(log: ScrapeLog): Promise<void> {
  try {
    await prisma.scrapeLogEntry.upsert({
      where: { id: "latest" },
      create: {
        id: "latest",
        timestamp: log.timestamp,
        totalRows: log.totalRows,
        upserted: log.upserted,
        detectedPageParam: log.detectedPageParam ?? null,
        nextPageCount: log.nextPageCount,
        skippedRows: log.skippedRows,
        sampleSkippedKeys: JSON.stringify(log.sampleSkippedKeys),
        errors: JSON.stringify(log.errors),
      },
      update: {
        timestamp: log.timestamp,
        totalRows: log.totalRows,
        upserted: log.upserted,
        detectedPageParam: log.detectedPageParam ?? null,
        nextPageCount: log.nextPageCount,
        skippedRows: log.skippedRows,
        sampleSkippedKeys: JSON.stringify(log.sampleSkippedKeys),
        errors: JSON.stringify(log.errors),
      },
    });
  } catch (e) {
    if (DEBUG) console.debug("[backoffice] failed to save scrape log to DB:", e);
  }
}

export const fetchAndUpsertConsignments = async (options?: FetchAndUpsertOptions): Promise<number> => {
  const logErrors: string[] = [];
  const startedAt = new Date().toISOString();
  let logDetectedPageParam: string | null = PAGE_PARAM.trim() || null;
  let logNextPageCount = 0;
  let rows: BackofficeRow[] = [];
  let skippedRows: BackofficeRow[] = [];

  try {
  const jar = new CookieJar();
  const client = wrapper(
    axios.create({
      jar,
      withCredentials: true,
      headers: {
        "User-Agent": "TransportPlannerBot/1.0",
      },
    }),
  );

  const initial = await client.get(LOGIN_URL);
  const initialHtml = initial.data as string;

  if (looksLikeLogin(cheerio.load(initialHtml))) {
    await performLogin(client, initialHtml);
  }

  const urls = DATA_URLS
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (!urls.length) {
    urls.push(DATA_URL);
  }

  rows = [];
  for (const url of urls) {
    let pageUrl: string | null = url;
    let detectedPageParam: string | null = PAGE_PARAM.trim() || null;
    while (pageUrl) {
      const dataRes = await client.get(pageUrl);
      const html = dataRes.data as string;
      const listingPageUrl =
        dataRes.request?.res?.responseUrl
        ?? dataRes.config?.url
        ?? pageUrl;
      const $ = cheerio.load(html);
      const table = pickTable($);
      if (!table) {
        break;
      }
      const recordIds = $("td[data-id='flightinfo'][data-recordid]")
        .map((_, el) => $(el).attr("data-recordid") ?? "")
        .get()
        .filter(Boolean);
      if (DEBUG) {
        console.debug(`[backoffice] page ${listingPageUrl} flight record IDs=${recordIds.length}`);
      }
      const pageRows = extractRows(table, $);
      const flightResults = await fetchFlightInfoResults(client, listingPageUrl, recordIds);
      const etaMap = new Map(flightResults.map((result) => [result.recordid, result.eta]));
      for (const row of pageRows) {
        const recordId = row["_recordid"];
        if (recordId && etaMap.has(recordId)) {
          row["eta"] = etaMap.get(recordId) ?? row["eta"];
        }
      }
      rows.push(...pageRows);
      pageUrl = getNextPageUrl($, listingPageUrl);
      if (!pageUrl && detectedPageParam) {
        try {
          const u = new URL(listingPageUrl);
          const val = u.searchParams.get(detectedPageParam);
          const currentPage = val ? parseInt(val, 10) : 1;
          pageUrl = buildNextPageUrl(listingPageUrl, detectedPageParam, currentPage);
        } catch {
          // ignore
        }
      }
      if (!pageUrl && !detectedPageParam) {
        for (const param of COMMON_PAGE_PARAMS) {
          const nextUrl = buildNextPageUrl(listingPageUrl, param, 1);
          if (!nextUrl) continue;
          try {
            const nextRes = await client.get(nextUrl);
            const nextHtml = nextRes.data as string;
            const nextListingUrl =
              nextRes.request?.res?.responseUrl ?? nextRes.config?.url ?? nextUrl;
            const $next = cheerio.load(nextHtml);
            const nextTable = pickTable($next);
            if (!nextTable) continue;
            const nextRecordIds = $next("td[data-id='flightinfo'][data-recordid]")
              .map((_, el) => $next(el).attr("data-recordid") ?? "")
              .get()
              .filter(Boolean);
            const nextPageRows = extractRows(nextTable, $next);
            const nextFlightResults = await fetchFlightInfoResults(client, nextListingUrl, nextRecordIds);
            const nextEtaMap = new Map(nextFlightResults.map((r) => [r.recordid, r.eta]));
            for (const row of nextPageRows) {
              const recordId = row["_recordid"];
              if (recordId && nextEtaMap.has(recordId)) {
                row["eta"] = nextEtaMap.get(recordId) ?? row["eta"];
              }
            }
            if (nextPageRows.length > 0) {
              rows.push(...nextPageRows);
              detectedPageParam = param;
              logDetectedPageParam = param;
              pageUrl = buildNextPageUrl(nextListingUrl, param, 2);
              if (DEBUG) {
                console.debug(`[backoffice] detected page param "${param}", got ${nextPageRows.length} rows, following to page 3`);
              }
            }
          } catch {
            // ignore and try next param
          }
          if (pageUrl) break;
        }
      }
      if (pageUrl) logNextPageCount += 1;
      if (DEBUG && pageUrl) {
        console.debug(`[backoffice] following next page: ${pageUrl}`);
      }
    }
  }
  if (DEBUG) {
    console.debug(`[backoffice] total rows scraped: ${rows.length}`);
  }
  if (!rows.length) {
    const msg = "Could not find consignments table";
    logErrors.push(msg);
    const emptyLog: ScrapeLog = {
      timestamp: startedAt,
      totalRows: 0,
      upserted: 0,
      detectedPageParam: logDetectedPageParam,
      nextPageCount: logNextPageCount,
      skippedRows: 0,
      sampleSkippedKeys: [],
      errors: logErrors,
    };
    lastScrapeLog = emptyLog;
    saveScrapeLogToDb(emptyLog).catch(() => {});
    throw new Error(msg);
  }
  let upserted = 0;
  const now = new Date();
  const seenIds: string[] = [];
  skippedRows = [];

  for (const row of rows) {
    const pmlRef = getPmlRef(row);
    if (!pmlRef) {
      skippedRows.push(row);
      continue;
    }
    seenIds.push(pmlRef);

    const customer = row["client"] ?? "";
    const destination = row["airport"] ?? row["route"] ?? "";
    const observation = row["observation"] ?? row["observations"] ?? row["notes"] ?? "";
    const productDescription =
      row["product description"]
      ?? row["pr desc"]
      ?? row["product"]
      ?? row["description"]
      ?? row["goods description"]
      ?? "";
    const mawb =
      row["mawb"]
      ?? row["mawb no"]
      ?? row["mawb no."]
      ?? row["airway bill number"]
      ?? row["airwaybill number"]
      ?? row["airway bill no"]
      ?? row["airway bill no."]
      ?? row["awb"]
      ?? row["awb no"]
      ?? row["awb no."]
      ?? "";
    const hawb =
      row["hawb"]
      ?? row["hawb no"]
      ?? row["hawb no."]
      ?? row["house airway bill"]
      ?? row["house airway bill number"]
      ?? row["house awb"]
      ?? row["house awb no"]
      ?? "";
    const etaIso = parseEtaIso(
      row["consignment date"] ?? "",
      row["eta"] ?? "",
    );

    const packages =
      row["packages"]
      ?? row["package"]
      ?? row["pkgs"]
      ?? row["packages qty"]
      ?? row["pc"]
      ?? row["pcs"]
      ?? "";
    const palletsFromSite = computePalletsFromRow(row);

    const status = row["status 1"] ?? row["status"] ?? "";

    await prisma.consignment.upsert({
      where: { id: pmlRef },
      update: {
        customerNameRaw: customer || null,
        customerKey: customer ? normalizeCustomer(customer) : null,
        destinationRaw: destination || null,
        destinationKey: destination ? normalizeDestination(destination) : null,
        observationRaw: observation || null,
        mawbRaw: mawb || null,
        hawbRaw: hawb || null,
        packagesRaw: packages || null,
        productDescriptionRaw: productDescription || null,
        etaIso,
        status: status || null,
        palletsFromSite,
        rawJson: JSON.stringify(row),
        lastSeenAt: now,
        archivedAt: null,
      },
      create: {
        id: pmlRef,
        customerNameRaw: customer || null,
        customerKey: customer ? normalizeCustomer(customer) : null,
        destinationRaw: destination || null,
        destinationKey: destination ? normalizeDestination(destination) : null,
        observationRaw: observation || null,
        mawbRaw: mawb || null,
        hawbRaw: hawb || null,
        packagesRaw: packages || null,
        productDescriptionRaw: productDescription || null,
        etaIso,
        status: status || null,
        palletsFromSite,
        rawJson: JSON.stringify(row),
        lastSeenAt: now,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      },
    });
    upserted += 1;
  }

  if (DEBUG && skippedRows.length > 0) {
    const sample = skippedRows[0];
    const keys = Object.keys(sample).filter((k) => !k.startsWith("_"));
    console.debug(`[backoffice] skipped ${skippedRows.length} rows (no PML ref); sample row keys: ${keys.join(", ")}`);
  }

  const sampleSkippedKeys = skippedRows.length > 0
    ? Object.keys(skippedRows[0]).filter((k) => !k.startsWith("_"))
    : [];
  const successLog: ScrapeLog = {
    timestamp: startedAt,
    totalRows: rows.length,
    upserted,
    detectedPageParam: logDetectedPageParam,
    nextPageCount: logNextPageCount,
    skippedRows: skippedRows.length,
    sampleSkippedKeys,
    errors: logErrors,
  };
  lastScrapeLog = successLog;
  saveScrapeLogToDb(successLog).catch(() => {});

  // Archive only consignments not seen today (lastSeenAt < start of today) and not assigned.
  // This way dayboard jobs stay on Active even if the scrape missed them this run; we never
  // archive anything that was seen today.
  const archiveOnEveryScrape = process.env.PML_ARCHIVE_ON_EVERY_SCRAPE === "1";
  const archiveHour = process.env.PML_ARCHIVE_HOUR != null ? parseInt(process.env.PML_ARCHIVE_HOUR, 10) : 6;
  const shouldArchive =
    options?.forceArchive === true ||
    archiveOnEveryScrape ||
    (typeof archiveHour === "number" && !Number.isNaN(archiveHour) && now.getHours() === archiveHour);

  if (shouldArchive) {
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const assigned = await prisma.assignment.findMany({
      select: { consignmentId: true },
      distinct: ["consignmentId"],
    });
    const assignedIds = assigned.map((a) => a.consignmentId);
    const toArchive = await prisma.consignment.findMany({
      where: {
        archivedAt: null,
        lastSeenAt: { lt: startOfToday },
        id: { notIn: assignedIds },
      },
      select: { id: true },
    });
    if (toArchive.length > 0) {
      await prisma.consignment.updateMany({
        where: { id: { in: toArchive.map((c) => c.id) } },
        data: { archivedAt: now },
      });
      if (DEBUG) {
        console.debug(`[backoffice] archived ${toArchive.length} consignments not seen today (kept ${assignedIds.length} assigned)`);
      }
    }
  }

  return upserted;
  } catch (err) {
    const errorLog: ScrapeLog = {
      timestamp: startedAt,
      totalRows: rows.length,
      upserted: 0,
      detectedPageParam: logDetectedPageParam,
      nextPageCount: logNextPageCount,
      skippedRows: skippedRows.length,
      sampleSkippedKeys: [],
      errors: [...logErrors, err instanceof Error ? err.message : String(err)],
    };
    lastScrapeLog = errorLog;
    saveScrapeLogToDb(errorLog).catch(() => {});
    throw err;
  }
};
