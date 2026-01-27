import { Router } from "express";
import type { Consignment } from "@prisma/client";
import { prisma } from "../db";

export const consignmentsRouter = Router();

type ConsignmentDTO = Omit<Consignment, "rawJson">;

consignmentsRouter.get("/api/consignments", async (req, res, next) => {
  try {
    const activeParam = typeof req.query.active === "string" ? req.query.active : undefined;
    const searchParam = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const dateParam = typeof req.query.date === "string" ? req.query.date.trim() : "";

    const andFilters = [];

    if (activeParam === "1") {
      andFilters.push({ archivedAt: null });
    }

    if (searchParam) {
      andFilters.push({
        OR: [
          { id: { contains: searchParam, mode: "insensitive" } },
          { customerNameRaw: { contains: searchParam, mode: "insensitive" } },
          { destinationRaw: { contains: searchParam, mode: "insensitive" } },
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
        etaIso: true,
        status: true,
        palletsFromSite: true,
        lastSeenAt: true,
        archivedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.json({ items: items as ConsignmentDTO[] });
  } catch (err) {
    next(err);
  }
});
