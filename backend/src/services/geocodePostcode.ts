/**
 * UK postcode geocoding via Postcodes.io with optional DB-level caching.
 */

export class PostcodeNotFoundError extends Error {
  constructor(
    public readonly postcode: string,
    message?: string
  ) {
    super(message ?? `Postcode not found: ${postcode}`);
    this.name = "PostcodeNotFoundError";
    Object.setPrototypeOf(this, PostcodeNotFoundError.prototype);
  }
}

/**
 * Normalize a UK postcode for display/API: trim, uppercase, collapse multiple
 * spaces, and ensure a single space before the last 3 characters (incode) when
 * possible. Does not over-reject invalid formats.
 */
export function normalizeUKPostcode(input: string): string {
  if (typeof input !== "string") return "";
  let s = input.trim().toUpperCase().replace(/\s+/g, " ").replace(/\s*$/, "");
  if (!s) return s;
  // Ensure single space before last 3 characters (UK incode) if we have enough length and no space there already
  if (s.length >= 5 && s[s.length - 4] !== " ") {
    s = s.slice(0, -3) + " " + s.slice(-3);
  }
  return s;
}

const POSTCODES_IO_BASE = "https://api.postcodes.io";

export type GeocodeResult = {
  lat: number;
  lng: number;
  normalized: string;
};

/**
 * Geocode a UK postcode using Postcodes.io. Returns latitude, longitude, and
 * the API-normalized postcode string. Throws PostcodeNotFoundError on 404.
 */
export async function geocodeUKPostcode(postcode: string): Promise<GeocodeResult> {
  const normalized = normalizeUKPostcode(postcode);
  if (!normalized) {
    throw new Error("Geocode failed: postcode is empty after normalization.");
  }

  const encoded = encodeURIComponent(normalized.replace(/\s/g, ""));
  const url = `${POSTCODES_IO_BASE}/postcodes/${encoded}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Geocode failed: could not reach Postcodes.io (${msg}).`);
  }

  if (res.status === 404) {
    throw new PostcodeNotFoundError(
      normalized,
      `Postcode not found: "${normalized}". Check the postcode or use a valid UK postcode.`
    );
  }

  if (!res.ok) {
    throw new Error(
      `Geocode failed: Postcodes.io returned ${res.status} ${res.statusText} for postcode "${normalized}".`
    );
  }

  let body: { status?: number; result?: { latitude?: number; longitude?: number; postcode?: string } };
  try {
    body = (await res.json()) as typeof body;
  } catch {
    throw new Error(`Geocode failed: invalid JSON from Postcodes.io for postcode "${normalized}".`);
  }

  const result = body?.result;
  if (!result || typeof result.latitude !== "number" || typeof result.longitude !== "number") {
    throw new Error(
      `Geocode failed: Postcodes.io did not return latitude/longitude for postcode "${normalized}".`
    );
  }

  return {
    lat: result.latitude,
    lng: result.longitude,
    normalized: typeof result.postcode === "string" && result.postcode.trim()
      ? result.postcode.trim()
      : normalized,
  };
}

export type CachedLocation = {
  postcode: string | null;
  lat: number | null;
  lng: number | null;
};

/**
 * Geocode a UK postcode with DB-level caching: if the existing location already
 * has lat/lng and the normalized postcode is unchanged, return the cached
 * coordinates without calling the API.
 */
export async function geocodeUKPostcodeWithCache(
  postcode: string,
  existing: CachedLocation | null
): Promise<GeocodeResult> {
  const normalized = normalizeUKPostcode(postcode);
  if (!normalized) {
    throw new Error("Geocode failed: postcode is empty after normalization.");
  }

  const existingNormalized = existing?.postcode ? normalizeUKPostcode(existing.postcode) : null;
  const hasCachedCoords =
    existing != null &&
    existing.lat != null &&
    existing.lng != null &&
    typeof existing.lat === "number" &&
    typeof existing.lng === "number";

  if (hasCachedCoords && existingNormalized !== null && existingNormalized === normalized) {
    return {
      lat: existing.lat,
      lng: existing.lng,
      normalized: existingNormalized,
    };
  }

  return geocodeUKPostcode(postcode);
}
