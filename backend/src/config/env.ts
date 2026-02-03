/**
 * Environment validation. Runs at import time; throws if required or invalid env is detected.
 * No runtime behaviour change beyond failing fast at startup.
 */

function validateEnv(): void {
  if (process.env.DATABASE_URL == null || String(process.env.DATABASE_URL).trim() === "") {
    throw new Error("DATABASE_URL is required. Set it in .env or the environment.");
  }

  const port = process.env.PORT;
  if (port != null && port !== "") {
    const n = Number(port);
    if (!Number.isFinite(n) || n < 1 || n > 65535) {
      throw new Error(`PORT must be a number between 1 and 65535; got: ${port}`);
    }
  }
}

validateEnv();

export type DepotLocation = { lat: number; lng: number; postcode?: string };

export function getDepotEnv(): DepotLocation | null {
  const latRaw = process.env.DEPOT_LAT;
  const lngRaw = process.env.DEPOT_LNG;
  if (latRaw == null || lngRaw == null) return null;
  const lat = parseFloat(latRaw);
  const lng = parseFloat(lngRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const postcode = process.env.DEPOT_POSTCODE?.trim();
  return { lat, lng, ...(postcode !== undefined && postcode !== "" && { postcode }) };
}
