/**
 * Normalize postcode for storage: optional; if provided, trim and uppercase.
 * Returns null for empty, null, or undefined input.
 */
export function normalizePostcode(
  value: string | null | undefined
): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed === "" ? null : trimmed.toUpperCase();
}
