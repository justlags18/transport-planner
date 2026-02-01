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

const parseEtaIso = (dateStr: string, timeStr: string, deliveryStr: string): string | null => {
  const delivery = deliveryStr.trim();
  if (delivery && delivery.toLowerCase() !== "n/a") {
    const asDate = new Date(delivery);
    if (!Number.isNaN(asDate.getTime())) {
      return asDate.toISOString();
    }
  }

  const combined = `${dateStr} ${timeStr}`.trim();
  const dt = new Date(combined);
  if (!Number.isNaN(dt.getTime())) {
    return dt.toISOString();
  }
  return null;
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
      const value = $(cell).text().replace(/\s+/g, " ").trim();
      record[key] = value;
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
    rows.push(...extractRows(table, $));
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
    const etaIso = parseEtaIso(
      row["consignment date"] ?? "",
      row["eta"] ?? "",
      row["delivery date & eta"] ?? "",
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
