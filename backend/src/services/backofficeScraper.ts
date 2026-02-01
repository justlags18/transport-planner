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
const USERNAME = process.env.PML_BACKOFFICE_USER ?? "";
const PASSWORD = process.env.PML_BACKOFFICE_PASS ?? "";
const DEBUG = process.env.PML_BACKOFFICE_DEBUG === "1";

const normalizeHeader = (value: string) =>
  value.replace(/\s+/g, " ").trim().toLowerCase();

const parseNumber = (value: string): number | null => {
  const cleaned = value.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  if (!cleaned) return null;
  const num = Number(cleaned[0]);
  return Number.isFinite(num) ? num : null;
};

/**
 * Compute pallet count from a backoffice row (same rules as scraper).
 * Used when scraping and when recomputing from stored rawJson for consignments
 * that have missing pallets (e.g. scraped before rules existed or different column names).
 */
export function computePalletsFromRow(row: Record<string, string>): number | null {
  const productDescription =
    row["product description"]
    ?? row["pr desc"]
    ?? row["product"]
    ?? row["description"]
    ?? row["goods description"]
    ?? "";
  const packages =
    row["packages"]
    ?? row["package"]
    ?? row["pkgs"]
    ?? row["packages qty"]
    ?? row["pc"]
    ?? row["pcs"]
    ?? row["no. of packages"]
    ?? row["no of packages"]
    ?? row["number of packages"]
    ?? row["quantity"]
    ?? row["qty"]
    ?? row["pieces"]
    ?? "";
  const weightRaw =
    row["weight"]
    ?? row["weight kg"]
    ?? row["weight (kg)"]
    ?? row["weight (kgs)"]
    ?? row["weight kgs"]
    ?? row["total weight"]
    ?? row["gross weight"]
    ?? row["net weight"]
    ?? row["actual weight"]
    ?? row["kgs"]
    ?? "";
  const pieces = packages ? parseNumber(packages) : null;
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

export const fetchAndUpsertConsignments = async (): Promise<number> => {
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

  const rows: BackofficeRow[] = [];
  for (const url of urls) {
    const dataRes = await client.get(url);
    const html = dataRes.data as string;
    const listingPageUrl =
      dataRes.request?.res?.responseUrl
      ?? dataRes.config?.url
      ?? url;
    const $ = cheerio.load(html);
    const table = pickTable($);
    if (!table) {
      continue;
    }
    const recordIds = $("td[data-id='flightinfo'][data-recordid]")
      .map((_, el) => $(el).attr("data-recordid") ?? "")
      .get()
      .filter(Boolean);
    if (DEBUG) {
      console.debug(`[backoffice] flight record IDs=${recordIds.length}`);
      console.debug(`[backoffice] flight record IDs sample=${recordIds.slice(0, 5).join(",")}`);
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
  }
  if (!rows.length) {
    throw new Error("Could not find consignments table");
  }
  let upserted = 0;
  const now = new Date();

  for (const row of rows) {
    const pmlRef = row["pml ref"] ?? "";
    if (!pmlRef) continue;

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

  return upserted;
};
