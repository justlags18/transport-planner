import { prisma } from "../db";

/**
 * Syncs trailer status from active trailer schedule entries.
 * When an entry is active, its type becomes the trailer status.
 * Trailers without an active entry keep their current status.
 */
export async function syncTrailerStatusFromSchedule(): Promise<Map<string, string>> {
  const now = new Date();

  const activeEntries = await prisma.trailerSchedule.findMany({
    where: {
      startAt: { lte: now },
      OR: [{ endAt: null }, { endAt: { gte: now } }],
    },
    orderBy: { startAt: "desc" },
  });

  const statusByTrailerId = new Map<string, string>();
  for (const entry of activeEntries) {
    if (!statusByTrailerId.has(entry.trailerId)) {
      statusByTrailerId.set(entry.trailerId, entry.type);
    }
  }

  if (statusByTrailerId.size === 0) return statusByTrailerId;

  const trailers = await prisma.trailer.findMany({ orderBy: { createdAt: "asc" } });
  for (const trailer of trailers) {
    const scheduledStatus = statusByTrailerId.get(trailer.id);
    if (scheduledStatus && trailer.status !== scheduledStatus) {
      await prisma.trailer.update({
        where: { id: trailer.id },
        data: {
          status: scheduledStatus,
          ...(scheduledStatus === "off_road" ? { lorryId: null } : {}),
        },
      });
    }
  }

  return statusByTrailerId;
}
