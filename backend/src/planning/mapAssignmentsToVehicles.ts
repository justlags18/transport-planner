import { prisma } from "../db";

export type PlanningVehicleRow = {
  assignmentId: string;
  vehicleType: string;
  palletCapacity: number;
};

/** Human-readable vehicle type for planner (same as planner UI). */
const VEHICLE_TYPE_LABELS: Record<string, string> = {
  Class1: "Class 1",
  Class2: "18T",
  Vans: "Van",
};

/**
 * Fallback pallet capacity by truck class when lorry.capacityPallets is missing.
 * TODO: align with defaultCapacityPallets / TRAILER_CAPACITY_PALLETS from lorries route if needed.
 */
const CAPACITY_PALLETS_BY_CLASS: Record<string, number> = {
  Class1: 26,
  Class2: 16,
  Vans: 3,
};

/** Lorries that have an off_road FleetSchedule entry overlapping the given day are excluded (same as planner UI). */
async function getAvailableLorryIdsForDate(dayStart: Date, dayEnd: Date): Promise<Set<string>> {
  const offRoadEntries = await prisma.fleetSchedule.findMany({
    where: {
      type: "off_road",
      startAt: { lte: dayEnd },
      OR: [{ endAt: null }, { endAt: { gte: dayStart } }],
    },
    select: { lorryId: true },
  });
  const excludedLorryIds = new Set(offRoadEntries.map((e) => e.lorryId));
  const allLorries = await prisma.lorry.findMany({ select: { id: true } });
  const available = allLorries.filter((l) => !excludedLorryIds.has(l.id)).map((l) => l.id);
  return new Set(available);
}

/**
 * Returns planning vehicles for the given date: one row per assignment on that day,
 * restricted to lorries that are available (not off-road), using the same filter as the planner UI.
 */
export async function mapAssignmentsToPlanningVehicles(date: Date): Promise<PlanningVehicleRow[]> {
  const dateStr = date.toISOString().slice(0, 10);
  const dayStart = new Date(dateStr + "T00:00:00.000Z");
  const dayEnd = new Date(dateStr + "T23:59:59.999Z");

  const availableLorryIds = await getAvailableLorryIdsForDate(dayStart, dayEnd);
  if (availableLorryIds.size === 0) return [];

  const assignments = await prisma.assignment.findMany({
    where: {
      lorryId: { in: Array.from(availableLorryIds) },
      consignment: { etaIso: { startsWith: dateStr } },
    },
    include: {
      lorry: { select: { truckClass: true, capacityPallets: true } },
    },
    orderBy: [{ lorryId: "asc" }, { sortOrder: "asc" }],
  });

  return assignments.map((a) => {
    const truckClass = a.lorry.truckClass ?? "Class1";
    const vehicleType = VEHICLE_TYPE_LABELS[truckClass] ?? truckClass;
    const palletCapacity =
      a.lorry.capacityPallets ??
      CAPACITY_PALLETS_BY_CLASS[truckClass] ??
      CAPACITY_PALLETS_BY_CLASS.Class1;

    return {
      assignmentId: a.id,
      vehicleType,
      palletCapacity,
    };
  });
}
