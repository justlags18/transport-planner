import { prisma } from "../db";

/**
 * Syncs lorry status from active fleet schedule entries (off_road → "off", service → "service").
 * Lorries with no active entry get "on". Updates the database and returns the status map.
 */
export async function syncLorryStatusFromSchedule(): Promise<Map<string, string>> {
  const now = new Date();

  const activeEntries = await prisma.fleetSchedule.findMany({
    where: {
      startAt: { lte: now },
      OR: [{ endAt: null }, { endAt: { gte: now } }],
    },
    orderBy: { startAt: "desc" },
  });

  const statusByLorryId = new Map<string, string>();
  for (const entry of activeEntries) {
    if (!statusByLorryId.has(entry.lorryId)) {
      statusByLorryId.set(entry.lorryId, entry.type === "off_road" ? "off" : "service");
    }
  }

  if (statusByLorryId.size === 0) return statusByLorryId;

  const lorries = await prisma.lorry.findMany({ orderBy: { createdAt: "asc" } });
  for (const lorry of lorries) {
    const scheduledStatus = statusByLorryId.get(lorry.id);
    if (scheduledStatus && lorry.status !== scheduledStatus) {
      await prisma.lorry.update({
        where: { id: lorry.id },
        data: { status: scheduledStatus },
      });
    }
  }

  return statusByLorryId;
}
