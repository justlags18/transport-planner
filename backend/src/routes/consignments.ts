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
        rawJson: true,
        lastSeenAt: true,
        archivedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // When palletsFromSite is missing, recompute from stored backoffice row so UI gets a value
    const itemsWithComputedPallets: ConsignmentDTO[] = items.map((item) => {
      const { rawJson, ...rest } = item;
      let palletsFromSite = rest.palletsFromSite;
      if ((palletsFromSite == null || palletsFromSite === 0) && rawJson) {
        try {
          const row = JSON.parse(rawJson) as Record<string, string>;
          const computed = computePalletsFromRow(row);
          if (computed != null) palletsFromSite = computed;
        } catch {
          // ignore
        }
      }
      return { ...rest, palletsFromSite };
    });

    res.json({ items: itemsWithComputedPallets });
  } catch (err) {
    next(err);
  }
});
