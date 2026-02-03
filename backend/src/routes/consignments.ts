import { Router } from "express";
import { Prisma, type Consignment } from "@prisma/client";
import { prisma } from "../db";
import { computePalletsFromRow, fetchAndUpsertConsignments, getLastScrapeLog } from "../services/backofficeScraper";
import type { AuthRequest } from "../middleware/auth";

export const consignmentsRouter = Router();

type ConsignmentDTO = Omit<Consignment, "rawJson">;

consignmentsRouter.get("/api/consignments", async (req, res, next) => {
  try {
    const activeParam = typeof req.query.active === "string" ? req.query.active : undefined;
    const archivedParam = typeof req.query.archived === "string" ? req.query.archived : undefined;
    const archivedOnParam = typeof req.query.archivedOn === "string" ? req.query.archivedOn.trim() : ""; // YYYY-MM-DD: show only consignments archived on this date
    const searchParam = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const dateParam = typeof req.query.date === "string" ? req.query.date.trim() : "";
    const deliveryOnlyParam = req.query.deliveryOnly === "1";

    const andFilters: Prisma.ConsignmentWhereInput[] = [];

    if (activeParam === "1") {
      andFilters.push({ archivedAt: null });
    } else if (archivedParam === "1") {
      andFilters.push({ archivedAt: { not: null } });
      if (archivedOnParam) {
        const start = new Date(archivedOnParam + "T00:00:00.000Z");
        const end = new Date(start);
        end.setUTCDate(end.getUTCDate() + 1);
        andFilters.push({ archivedAt: { gte: start, lt: end } });
      }
    }

    if (deliveryOnlyParam) {
      const deliverPrefs = await prisma.customerPref.findMany({
        where: { deliveryType: { in: ["deliver", "collection"] }, customerKey: { not: null } },
        select: { customerKey: true },
      });
      const deliverCustomerKeys = deliverPrefs.map((p) => p.customerKey).filter(Boolean) as string[];
      if (deliverCustomerKeys.length === 0) {
        res.json({ items: [] });
        return;
      }
      andFilters.push({ customerKey: { in: deliverCustomerKeys } });
    }

    if (searchParam) {
      andFilters.push({
        OR: [
          { id: { contains: searchParam } },
          { customerNameRaw: { contains: searchParam } },
          { destinationRaw: { contains: searchParam } },
        ],
      });
    }

    if (dateParam) {
      andFilters.push({
        etaIso: { startsWith: dateParam },
      });
    }

    const items = await prisma.consignment.findMany({
      where: andFilters.length ? { AND: andFilters } : undefined,
      select: {
        id: true,
        customerNameRaw: true,
        customerKey: true,
        destinationRaw: true,
        destinationKey: true,
        observationRaw: true,
        mawbRaw: true,
        hawbRaw: true,
        packagesRaw: true,
        productDescriptionRaw: true,
        etaIso: true,
        status: true,
        palletsFromSite: true,
        weightFromSite: true,
        deliveryLocationId: true,
        rawJson: true,
        lastSeenAt: true,
        archivedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const assignedConsignmentIds = await prisma.assignment.findMany({
      select: { consignmentId: true },
      distinct: ["consignmentId"],
    });
    const plannedIds = new Set(assignedConsignmentIds.map((a) => a.consignmentId));

    // When palletsFromSite is missing, recompute from stored backoffice row and persist so DB is updated
    // Also auto-assign deliveryLocationId if customer has exactly one location and none is set
    const updates: { id: string; palletsFromSite: number }[] = [];
    const locationUpdates: { id: string; deliveryLocationId: string }[] = [];
    
    // Fetch customer→location mappings for auto-assignment and customer→deliveryType for labels
    const customerPrefs = await prisma.customerPref.findMany({
      where: { customerKey: { not: null } },
      include: { locations: true },
    });
    const customerToLocations = new Map<string, string[]>();
    const customerToDeliveryType = new Map<string, string>();
    for (const pref of customerPrefs) {
      if (pref.customerKey) {
        customerToLocations.set(pref.customerKey, pref.locations.map((l) => l.deliveryLocationId));
        customerToDeliveryType.set(pref.customerKey, pref.deliveryType);
      }
    }

    const itemsWithComputedPallets: ConsignmentDTO[] = items.map((item) => {
      const { rawJson, ...rest } = item;
      let palletsFromSite = rest.palletsFromSite;
      let deliveryLocationId = rest.deliveryLocationId;
      
      // Compute pallets if missing
      if ((palletsFromSite == null || palletsFromSite === 0) && rawJson) {
        try {
          const row = JSON.parse(rawJson) as Record<string, unknown>;
          const computed = computePalletsFromRow(row);
          if (computed != null) palletsFromSite = computed;
          if (computed != null && computed > 0) updates.push({ id: item.id, palletsFromSite: computed });
        } catch {
          // ignore
        }
      }
      
      // Auto-assign deliveryLocationId if customer has exactly one location and none is set
      if (!deliveryLocationId && rest.customerKey) {
        const locs = customerToLocations.get(rest.customerKey);
        if (locs && locs.length === 1) {
          deliveryLocationId = locs[0];
          locationUpdates.push({ id: item.id, deliveryLocationId: locs[0] });
        }
      }
      
      const deliveryType = item.customerKey ? customerToDeliveryType.get(item.customerKey) ?? null : null;
      const isPlanned = plannedIds.has(item.id);
      return { ...rest, palletsFromSite, deliveryLocationId, deliveryType: deliveryType ?? undefined, isPlanned };
    });

    // Persist computed pallets and auto-assigned locations
    if (updates.length > 0 || locationUpdates.length > 0) {
      await Promise.all([
        ...updates.map(({ id, palletsFromSite }) =>
          prisma.consignment.update({ where: { id }, data: { palletsFromSite } }),
        ),
        ...locationUpdates.map(({ id, deliveryLocationId }) =>
          prisma.consignment.update({ where: { id }, data: { deliveryLocationId } }),
        ),
      ]);
    }

    res.json({ items: itemsWithComputedPallets });
  } catch (err) {
    next(err);
  }
});

/** Lightweight count for active (or all) consignments. Used by Management Consignments tab. */
consignmentsRouter.get("/api/consignments/count", async (req, res, next) => {
  try {
    const activeOnly = req.query.active === "1";
    const count = await prisma.consignment.count({
      where: activeOnly ? { archivedAt: null } : undefined,
    });
    res.json({ ok: true, count });
  } catch (err) {
    next(err);
  }
});

/** Update a consignment's delivery location override. */
consignmentsRouter.patch("/api/consignments/:id/delivery-location", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { deliveryLocationId } = req.body;
    const consignment = await prisma.consignment.findUnique({ where: { id } });
    if (!consignment) {
      res.status(404).json({ ok: false, error: "Consignment not found" });
      return;
    }
    const updated = await prisma.consignment.update({
      where: { id },
      data: { deliveryLocationId: deliveryLocationId || null },
      select: {
        id: true,
        customerNameRaw: true,
        customerKey: true,
        destinationRaw: true,
        destinationKey: true,
        observationRaw: true,
        mawbRaw: true,
        hawbRaw: true,
        packagesRaw: true,
        productDescriptionRaw: true,
        etaIso: true,
        status: true,
        palletsFromSite: true,
        weightFromSite: true,
        deliveryLocationId: true,
        lastSeenAt: true,
        archivedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    res.json({ ok: true, consignment: updated });
  } catch (err) {
    next(err);
  }
});

/** Unarchive a consignment so it appears on Active again (e.g. if it was archived by mistake). */
consignmentsRouter.patch("/api/consignments/:id/unarchive", async (req, res, next) => {
  try {
    const { id } = req.params;
    const c = await prisma.consignment.findUnique({ where: { id }, select: { id: true } });
    if (!c) {
      res.status(404).json({ ok: false, error: "Consignment not found" });
      return;
    }
    await prisma.consignment.update({
      where: { id },
      data: { archivedAt: null },
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/**
 * Force refresh: starts full backoffice scrape and archive in the background.
 * Returns 202 immediately so gateways don't 504 (the scrape can take 60s+).
 * Run and check Developer log or Consignments page after a short wait.
 */
consignmentsRouter.post("/api/consignments/refresh", async (req: AuthRequest, res, next) => {
  try {
    res.status(202).json({ ok: true, message: "Refresh started in background. Check Developer log or Consignments in a moment." });

    fetchAndUpsertConsignments({ forceArchive: true }).catch((err) => {
      console.error("[consignments/refresh] background scrape failed:", err);
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Last backoffice scrape log (total rows, detected page param, skipped, errors). Developer only.
 * Reads from DB so all instances see the same log.
 */
consignmentsRouter.get("/api/consignments/scrape-log", async (req: AuthRequest, res, next) => {
  try {
    if (req.user?.role !== "Developer") {
      res.status(403).json({ ok: false, error: "Forbidden: Developer role required" });
      return;
    }
    let row: { timestamp: string; totalRows: number; upserted: number; detectedPageParam: string | null; nextPageCount: number; skippedRows: number; sampleSkippedKeys: string; errors: string } | null = null;
    try {
      row = await prisma.scrapeLogEntry.findUnique({ where: { id: "latest" } });
    } catch {
      // Table may not exist yet (migration not run); fall back to in-memory
    }
    if (row) {
      const log = {
        timestamp: row.timestamp,
        totalRows: row.totalRows,
        upserted: row.upserted,
        detectedPageParam: row.detectedPageParam,
        nextPageCount: row.nextPageCount,
        skippedRows: row.skippedRows,
        sampleSkippedKeys: JSON.parse(row.sampleSkippedKeys) as string[],
        errors: JSON.parse(row.errors) as string[],
      };
      res.json({ ok: true, log });
      return;
    }
    const memLog = getLastScrapeLog();
    res.json({ ok: true, log: memLog ?? null });
  } catch (err) {
    next(err);
  }
});

/**
 * Archive old consignments: archive consignments not seen since before today (lastSeenAt < start of today)
 * and not assigned to any lorry. Does not run a scrape; use Force refresh to scrape first if needed.
 */
consignmentsRouter.post("/api/consignments/archive-old", async (_req, res, next) => {
  try {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const assigned = await prisma.assignment.findMany({
      select: { consignmentId: true },
      distinct: ["consignmentId"],
    });
    const assignedIds = assigned.map((a) => a.consignmentId);
    const toArchive = await prisma.consignment.findMany({
      where: {
        archivedAt: null,
        lastSeenAt: { lt: startOfToday },
        id: { notIn: assignedIds },
      },
      select: { id: true },
    });
    if (toArchive.length > 0) {
      await prisma.consignment.updateMany({
        where: { id: { in: toArchive.map((c) => c.id) } },
        data: { archivedAt: now },
      });
    }
    res.json({ ok: true, archived: toArchive.length });
  } catch (err) {
    next(err);
  }
});

/**
 * Backfill palletsFromSite from rawJson for all consignments that have missing pallets.
 * Call once (e.g. after deploy) to persist computed pallets for every consignment that has rawJson.
 * Returns counts so you can see how many were fixed vs had no rawJson vs compute returned null.
 */
consignmentsRouter.post("/api/consignments/backfill-pallets", async (_req, res, next) => {
  try {
    const all = await prisma.consignment.findMany({
      where: {
        OR: [{ palletsFromSite: null }, { palletsFromSite: 0 }],
      },
      select: { id: true, rawJson: true, palletsFromSite: true },
    });

    let updated = 0;
    let noRawJson = 0;
    let computeNull = 0;
    let sampleRow: Record<string, string> | null = null;

    for (const c of all) {
      if (!c.rawJson || c.rawJson.trim() === "" || c.rawJson === "{}") {
        noRawJson += 1;
        continue;
      }
      try {
        const row = JSON.parse(c.rawJson) as Record<string, unknown>;
        const computed = computePalletsFromRow(row);
        if (computed != null && computed > 0) {
          await prisma.consignment.update({
            where: { id: c.id },
            data: { palletsFromSite: computed },
          });
          updated += 1;
        } else {
          computeNull += 1;
          if (sampleRow == null) {
            sampleRow = {};
            for (const [k, v] of Object.entries(row)) {
              if (k.startsWith("_")) continue;
              const s = v == null ? "" : String(v).trim();
              sampleRow[k] = s.length > 120 ? s.slice(0, 120) + "…" : s;
            }
          }
        }
      } catch {
        computeNull += 1;
      }
    }

    res.json({
      ok: true,
      totalMissing: all.length,
      updated,
      noRawJson,
      computeReturnedNull: computeNull,
      sampleRowKeys: sampleRow ? Object.keys(sampleRow) : undefined,
      sampleRow: sampleRow ?? undefined,
    });
  } catch (err) {
    next(err);
  }
});
