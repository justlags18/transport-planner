import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../db";
import type { AuthRequest } from "../middleware/auth";

const createDeliveryLocationSchema = z.object({
  displayName: z.string().trim().min(1),
  destinationKey: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

const updateDeliveryLocationSchema = z.object({
  displayName: z.string().trim().min(1).optional(),
  destinationKey: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
});

export const deliveryLocationsRouter = Router();

deliveryLocationsRouter.get("/api/delivery-locations", async (_req: AuthRequest, res: Response) => {
  try {
    const locations = await prisma.deliveryLocation.findMany({
      orderBy: { displayName: "asc" },
    });
    res.json({ ok: true, locations });
  } catch (err) {
    console.error("List delivery locations error:", err);
    res.status(500).json({ ok: false, error: "Failed to list delivery locations" });
  }
});

deliveryLocationsRouter.post("/api/delivery-locations", async (req: AuthRequest, res: Response) => {
  try {
    const parsed = createDeliveryLocationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: "Invalid input: displayName required" });
      return;
    }

    const { displayName, destinationKey, notes } = parsed.data;

    const location = await prisma.deliveryLocation.create({
      data: {
        displayName,
        destinationKey: destinationKey ?? null,
        notes: notes ?? null,
      },
    });

    res.status(201).json({ ok: true, location });
  } catch (err) {
    console.error("Create delivery location error:", err);
    res.status(500).json({ ok: false, error: "Failed to create delivery location" });
  }
});

deliveryLocationsRouter.patch("/api/delivery-locations/:id", async (req: AuthRequest, res: Response) => {
  try {
    const parsed = updateDeliveryLocationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: "Invalid input" });
      return;
    }

    const { id } = req.params;
    const existing = await prisma.deliveryLocation.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ ok: false, error: "Delivery location not found" });
      return;
    }

    const location = await prisma.deliveryLocation.update({
      where: { id },
      data: {
        ...(parsed.data.displayName !== undefined && { displayName: parsed.data.displayName }),
        ...(parsed.data.destinationKey !== undefined && { destinationKey: parsed.data.destinationKey }),
        ...(parsed.data.notes !== undefined && { notes: parsed.data.notes }),
      },
    });

    res.json({ ok: true, location });
  } catch (err) {
    console.error("Update delivery location error:", err);
    res.status(500).json({ ok: false, error: "Failed to update delivery location" });
  }
});

deliveryLocationsRouter.delete("/api/delivery-locations/:id", async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const existing = await prisma.deliveryLocation.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ ok: false, error: "Delivery location not found" });
      return;
    }

    await prisma.deliveryLocation.delete({ where: { id } });
    res.status(204).send();
  } catch (err) {
    console.error("Delete delivery location error:", err);
    res.status(500).json({ ok: false, error: "Failed to delete delivery location" });
  }
});
