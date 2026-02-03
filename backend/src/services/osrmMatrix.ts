/**
 * OSRM Table API: duration/distance matrix for driving between coordinates.
 * Durations are in seconds; distances are in metres.
 *
 * In-memory cache (v1): key = getMatrixCacheKey(coords, dayKey), TTL 10 minutes.
 */

export type Coord = { lat: number; lng: number };

export type MatrixResult = {
  /** Duration matrix in seconds. durations[i][j] = travel time from coord i to coord j. */
  durations: number[][];
  /** Distance matrix in metres. distances[i][j] = driving distance from coord i to coord j. */
  distances: number[][];
};

const MIN_COORDS = 2;
const MAX_COORDS = 200;
const DEFAULT_BASE_URL = process.env.OSRM_BASE_URL ?? "https://router.project-osrm.org";
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

const DECIMALS = 5;
function round5(n: number): number {
  const m = 10 ** DECIMALS;
  return Math.round(n * m) / m;
}

type CacheEntry = { result: MatrixResult; expiresAt: number };
const matrixCache = new Map<string, CacheEntry>();

/**
 * Build a stable cache key from coordinates (rounded to 5 decimals) and a day key (e.g. date string).
 */
export function getMatrixCacheKey(coords: Coord[], dayKey: string): string {
  const rounded = coords.map((c) => ({ lat: round5(c.lat), lng: round5(c.lng) }));
  return `${dayKey}:${JSON.stringify(rounded)}`;
}

/**
 * Build the coordinate string for OSRM: semicolon-separated "lng,lat" pairs.
 */
export function toOsrmCoordString(coords: Coord[]): string {
  return coords.map((c) => `${c.lng},${c.lat}`).join(";");
}

/**
 * Request a duration and distance matrix from OSRM table service (driving profile).
 * Coordinates must be in lng,lat order in the request; we accept { lat, lng } and convert.
 *
 * - durations[i][j] = travel time from coord i to coord j, in seconds.
 * - distances[i][j] = driving distance from coord i to coord j, in metres.
 *
 * When opts.dayKey is set, results are cached in memory for 10 minutes (same coords + dayKey = cache hit).
 *
 * @throws Error if coords.length < 2, or > 200 (batch into multiple requests), or OSRM returns non-200
 */
export async function osrmTableMatrix(
  coords: Coord[],
  opts?: { baseUrl?: string; dayKey?: string }
): Promise<MatrixResult> {
  if (coords.length < MIN_COORDS) {
    throw new Error(
      `OSRM table requires at least ${MIN_COORDS} coordinates; got ${coords.length}.`
    );
  }
  if (coords.length > MAX_COORDS) {
    throw new Error(
      `OSRM table is capped at ${MAX_COORDS} coordinates; got ${coords.length}. Split into batches of up to ${MAX_COORDS} and call the API per batch.`
    );
  }

  const dayKey = opts?.dayKey;
  if (dayKey != null && dayKey !== "") {
    const key = getMatrixCacheKey(coords, dayKey);
    const entry = matrixCache.get(key);
    if (entry) {
      if (entry.expiresAt > Date.now()) return entry.result;
      matrixCache.delete(key);
    }
  }

  const baseUrl = (opts?.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  const coordString = toOsrmCoordString(coords);
  const url = `${baseUrl}/table/v1/driving/${coordString}?annotations=duration,distance`;

  let res: Response;
  try {
    res = await fetch(url, { method: "GET", headers: { Accept: "application/json" } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`OSRM table request failed: ${msg}`);
  }

  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `OSRM table returned ${res.status} ${res.statusText}. Body: ${text || "(empty)"}`
    );
  }

  let body: { code?: string; durations?: number[][]; distances?: number[][] };
  try {
    body = JSON.parse(text) as typeof body;
  } catch {
    throw new Error(`OSRM table returned invalid JSON. Body: ${text.slice(0, 200)}`);
  }

  if (body.code !== "Ok" || !Array.isArray(body.durations) || !Array.isArray(body.distances)) {
    throw new Error(
      `OSRM table error: ${body.code ?? "unknown"}. Body: ${JSON.stringify(body).slice(0, 500)}`
    );
  }

  const result: MatrixResult = {
    durations: body.durations,
    distances: body.distances,
  };

  if (dayKey != null && dayKey !== "") {
    const key = getMatrixCacheKey(coords, dayKey);
    matrixCache.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS });
  }

  return result;
}
