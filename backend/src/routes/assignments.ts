import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";

export const assignmentsRouter = Router();

const assignSchema = z.object({
  consignmentId: z.string().trim().min(1),
  lorryId: z.string().trim().min(1),
  index: z.coerce.number().int().nonnegative().optional(),
});

const unassignSchema = z.object({
  consignmentId: z.string().trim().min(1),
});

const reorderSchema = z.object({
  lorryId: z.string().trim().min(1),
  orderedConsignmentIds: z.array(z.string().trim().min(1)),
});

assignmentsRouter.post("/api/assignments/assign", async (req, res, next) => {
  try {
    const parsed = assignSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: "Invalid payload" });
      return;
    }

    const { consignmentId, lorryId, index } = parsed.data;

    await prisma.$transaction(async (tx) => {
      await tx.assignment.deleteMany({ where: { consignmentId } });

      const existing = await tx.assignment.findMany({
        where: { lorryId },
        orderBy: { sortOrder: "asc" },
        select: { consignmentId: true },
      });

      const ordered = existing.map((row) => row.consignmentId);
      const insertIndex = index === undefined ? ordered.length : Math.min(index, ordered.length);
      ordered.splice(insertIndex, 0, consignmentId);

      for (let i = 0; i < ordered.length; i += 1) {
        const id = ordered[i];
        await tx.assignment.upsert({
          where: { lorryId_consignmentId: { lorryId, consignmentId: id } },
          update: { sortOrder: i },
          create: { lorryId, consignmentId: id, sortOrder: i },
        });
      }
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

assignmentsRouter.post("/api/assignments/unassign", async (req, res, next) => {
  try {
    const parsed = unassignSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: "Invalid payload" });
      return;
    }

    const { consignmentId } = parsed.data;
    await prisma.assignment.deleteMany({ where: { consignmentId } });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

assignmentsRouter.post("/api/assignments/reorder", async (req, res, next) => {
  try {
    const parsed = reorderSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: "Invalid payload" });
      return;
    }

    const { lorryId, orderedConsignmentIds } = parsed.data;

    await prisma.$transaction(async (tx) => {
      const existing = await tx.assignment.findMany({
        where: { lorryId },
        select: { consignmentId: true },
      });

      const existingSet = new Set(existing.map((row) => row.consignmentId));
      if (existingSet.size !== orderedConsignmentIds.length) {
        throw new Error("Consignment list mismatch");
      }

      for (const id of orderedConsignmentIds) {
        if (!existingSet.has(id)) {
          throw new Error("Consignment list mismatch");
        }
      }

      for (let i = 0; i < orderedConsignmentIds.length; i += 1) {
        const consignmentId = orderedConsignmentIds[i];
        await tx.assignment.update({
          where: { lorryId_consignmentId: { lorryId, consignmentId } },
          data: { sortOrder: i },
        });
      }
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
