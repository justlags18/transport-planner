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

const normalizeHeader = (value: string) =>
  value.replace(/\s+/g, " ").trim().toLowerCase();

const parseNumber = (value: string): number | null => {
  const cleaned = value.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  if (!cleaned) return null;
  const num = Number(cleaned[0]);
  return Number.isFinite(num) ? num : null;
};

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

  const colonMatch = fragmentText.match(/\b([01]?\d|2[0-3])[: ]([0-5]\d)\b/);
  if (colonMatch) {
    const hh = colonMatch[1].padStart(2, "0");
    const mm = colonMatch[2].padStart(2, "0");
    return `${hh}:${mm}`;
  }

  const keywordMatch = fragmentText.match(/\b(?:ETA|Arrival)\b[^0-9]{0,12}([01]\d|2[0-3])([0-5]\d)\b/i);
  if (keywordMatch) {
    return `${keywordMatch[1]}:${keywordMatch[2]}`;
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

const fetchFlightInfoMap = async (
  client: ReturnType<typeof wrapper>,
  baseUrl: string,
  recordIds: string[],
): Promise<Map<string, string>> => {
  const uniqueIds = Array.from(new Set(recordIds)).filter(Boolean);
  if (!uniqueIds.length) return new Map();

  const now = Date.now();
  const fetchOne = async (recordId: string) => {
    const url = new URL(`getflight.asp?ID=${encodeURIComponent(recordId)}&time=${now}`, baseUrl).toString();
    const res = await client.get(url);
    const fragment = res.data as string;
    const eta = extractEtaFromFragment(fragment);
    return { recordId, eta };
  };

  const results = await asyncPool(5, uniqueIds, fetchOne);
  const map = new Map<string, string>();
  for (const result of results) {
    if (result.eta) {
      map.set(result.recordId, result.eta);
    }
  }
  return map;
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
      const value =
        preferDataTime && dataTime
          ? dataTime.trim()
          : (selectedTime ?? (cellText || titleText.trim()));
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
    const $ = cheerio.load(html);
    const table = pickTable($);
    if (!table) {
      continue;
    }
    const pageRows = extractRows(table, $);
    const recordIds = pageRows.map((row) => row["_recordid"]).filter(Boolean);
    const etaMap = await fetchFlightInfoMap(client, url, recordIds);
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
    const mawb =
      row["mawb"]
      ?? row["mawb no"]
      ?? row["mawb no."]
      ?? row["awb"]
      ?? row["awb no"]
      ?? row["awb no."]
      ?? "";
    const etaIso = parseEtaIso(
      row["consignment date"] ?? "",
      row["eta"] ?? "",
    );

    const packages = row["packages"] ?? "";
    const palletsFromSite = packages ? parseNumber(packages) : null;
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
