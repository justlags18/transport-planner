import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";

export const lorriesRouter = Router();

const defaultCapacityPallets = (() => {
  const fromEnv = Number(process.env.TRAILER_CAPACITY_PALLETS);
  return Number.isFinite(fromEnv) ? fromEnv : 26;
})();

const createLorrySchema = z.object({
  name: z.string().trim().min(1),
  capacityPallets: z.coerce.number().int().positive().optional(),
});

lorriesRouter.get("/api/lorries", async (_req, res, next) => {
  try {
    const lorries = await prisma.lorry.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        assignments: {
          orderBy: { sortOrder: "asc" },
          include: {
            consignment: {
              include: {
                palletOverride: true,
              },
            },
          },
        },
      },
    });

    const items = lorries.map((lorry) => {
      const assignments = lorry.assignments.map((assignment) => {
        const { consignment } = assignment;
        const effectivePallets =
          consignment.palletOverride?.pallets ?? consignment.palletsFromSite ?? 0;

        const { rawJson: _rawJson, palletOverride: _palletOverride, ...consignmentDto } =
          consignment;

        return {
          ...assignment,
          consignment: consignmentDto,
          effectivePallets,
        };
      });

      const usedPallets = assignments.reduce((sum, assignment) => sum + assignment.effectivePallets, 0);

      return {
        ...lorry,
        assignments,
        usedPallets,
      };
    });

    res.json(items);
  } catch (err) {
    next(err);
  }
});

lorriesRouter.post("/api/lorries", async (req, res, next) => {
  try {
    const parsed = createLorrySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: "Invalid payload" });
      return;
    }

    const { name, capacityPallets } = parsed.data;

    const lorry = await prisma.lorry.create({
      data: {
        name,
        capacityPallets: capacityPallets ?? defaultCapacityPallets,
      },
    });

    res.status(201).json(lorry);
  } catch (err) {
    next(err);
  }
});
