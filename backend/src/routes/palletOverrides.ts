import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";

export const palletOverridesRouter = Router();

const palletOverrideSchema = z.object({
  consignmentId: z.string().trim().min(1),
  pallets: z.coerce.number().int().nonnegative(),
});

palletOverridesRouter.post("/api/pallet-overrides", async (req, res, next) => {
  try {
    const parsed = palletOverrideSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: "Invalid payload" });
      return;
    }

    const { consignmentId, pallets } = parsed.data;

    const consignment = await prisma.consignment.findUnique({
      where: { id: consignmentId },
      select: { id: true },
    });

    if (!consignment) {
      res.status(404).json({ ok: false, error: "Consignment not found" });
      return;
    }

    const override = await prisma.palletOverride.upsert({
      where: { consignmentId },
      update: { pallets },
      create: { consignmentId, pallets },
    });

    res.status(200).json(override);
  } catch (err) {
    next(err);
  }
});
