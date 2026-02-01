import { Router } from "express";
import { Prisma, type Consignment } from "@prisma/client";
import { prisma } from "../db";
import { computePalletsFromRow } from "../services/backofficeScraper";

export const consignmentsRouter = Router();

type ConsignmentDTO = Omit<Consignment, "rawJson">;

consignmentsRouter.get("/api/consignments", async (req, res, next) => {
  try {
    const activeParam = typeof req.query.active === "string" ? req.query.active : undefined;
    const searchParam = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const dateParam = typeof req.query.date === "string" ? req.query.date.trim() : "";
    const deliveryOnlyParam = req.query.deliveryOnly === "1";

    const andFilters: Prisma.ConsignmentWhereInput[] = [];

    if (activeParam === "1") {
      andFilters.push({ archivedAt: null });
    }

    if (deliveryOnlyParam) {
      const deliverPrefs = await prisma.customerPref.findMany({
        where: { deliveryType: "deliver", customerKey: { not: null } },
        select: { customerKey: true },
      });
      const customerKeys = deliverPrefs.map((p) => p.customerKey).filter(Boolean) as string[];
      if (customerKeys.length === 0) {
        res.json({ items: [] });
        return;
      }
      andFilters.push({ customerKey: { in: customerKeys } });
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
        deliveryLocationId: true,
        rawJson: true,
        lastSeenAt: true,
        archivedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // When palletsFromSite is missing, recompute from stored backoffice row and persist so DB is updated
    // Also auto-assign deliveryLocationId if customer has exactly one location and none is set
    const updates: { id: string; palletsFromSite: number }[] = [];
    const locationUpdates: { id: string; deliveryLocationId: string }[] = [];
    
    // Fetch customer→location mappings for auto-assignment
    const customerPrefs = await prisma.customerPref.findMany({
      where: { customerKey: { not: null }, deliveryType: "deliver" },
      include: { locations: true },
    });
    const customerToLocations = new Map<string, string[]>();
    for (const pref of customerPrefs) {
      if (pref.customerKey) {
        customerToLocations.set(pref.customerKey, pref.locations.map((l) => l.deliveryLocationId));
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
      
      return { ...rest, palletsFromSite, deliveryLocationId };
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
