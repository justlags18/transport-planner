import { prisma } from "../db";
import { computePalletsFromRow } from "../services/backofficeScraper";

export type PlanningJobRow = {
  consignmentId: string;
  pallets: number;
  lat: number | null;
  lng: number | null;
  locationId: string | null;
};

/**
 * Effective pallets for a consignment: same logic as UI (palletOverride ?? palletsFromSite ?? computed from rawJson ?? 1).
 */
function effectivePallets(
  palletOverridePallets: number | null | undefined,
  palletsFromSite: number | null,
  rawJson: string | null
): number {
  if (palletOverridePallets != null && palletOverridePallets > 0) return palletOverridePallets;
  if (palletsFromSite != null && palletsFromSite > 0) return palletsFromSite;
  if (rawJson) {
    try {
      const row = JSON.parse(rawJson) as Record<string, unknown>;
      const computed = computePalletsFromRow(row);
      if (computed != null && computed > 0) return computed;
      if (computed != null) return computed;
    } catch {
      // ignore
    }
  }
  return 1;
}

/**
 * Returns planning jobs for the given date: consignments in the planning pool (unplanned, deliver/collection, that date).
 * Joins DeliveryLocation for lat/lng/postcode. Does not filter out missing geo; returns nulls for lat/lng so the planner can split them.
 */
export async function mapConsignmentsToPlanningJobs(date: Date): Promise<PlanningJobRow[]> {
  const dateStr = date.toISOString().slice(0, 10);

  const deliverPrefs = await prisma.customerPref.findMany({
    where: { deliveryType: { in: ["deliver", "collection"] }, customerKey: { not: null } },
    select: { customerKey: true },
  });
  const deliverCustomerKeys = deliverPrefs.map((p) => p.customerKey).filter(Boolean) as string[];

  const assignedConsignmentIds = await prisma.assignment.findMany({
    select: { consignmentId: true },
    distinct: ["consignmentId"],
  });
  const assignedSet = new Set(assignedConsignmentIds.map((a) => a.consignmentId));

  const consignments = await prisma.consignment.findMany({
    where: {
      archivedAt: null,
      ...(deliverCustomerKeys.length > 0 && { customerKey: { in: deliverCustomerKeys } }),
      etaIso: { startsWith: dateStr },
      id: { notIn: Array.from(assignedSet) },
    },
    include: {
      palletOverride: { select: { pallets: true } },
      deliveryLocation: { select: { id: true, lat: true, lng: true, postcode: true } },
    },
    orderBy: { etaIso: "asc" },
  });

  return consignments.map((c) => {
    const loc = c.deliveryLocation;
    const pallets = effectivePallets(
      c.palletOverride?.pallets,
      c.palletsFromSite,
      c.rawJson
    );

    return {
      consignmentId: c.id,
      pallets,
      lat: loc?.lat ?? null,
      lng: loc?.lng ?? null,
      locationId: loc?.id ?? null,
    };
  });
}
