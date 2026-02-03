import { getDepotEnv, type DepotLocation } from "../config/env";

/**
 * Returns the depot location from env (DEPOT_LAT, DEPOT_LNG, optional DEPOT_POSTCODE).
 * No routing logic. Returns null if depot is not configured.
 */
export function getDepotLocation(): DepotLocation | null {
  return getDepotEnv();
}
