import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../db";
import type { AuthRequest } from "../middleware/auth";

function canManageDrivers(role: string): boolean {
  return role === "Management" || role === "Developer";
}

const createDriverSchema = z.object({
  name: z.string().trim().min(1),
  phoneNumber: z.string().trim().optional(),
  agency: z.string().trim().optional(),
  idNumber: z.string().trim().optional(),
});

const updateDriverSchema = z.object({
  name: z.string().trim().min(1).optional(),
  phoneNumber: z.string().trim().optional().nullable(),
  agency: z.string().trim().optional().nullable(),
  idNumber: z.string().trim().optional().nullable(),
});

export const driversRouter = Router();

driversRouter.get("/api/drivers", async (_req: AuthRequest, res: Response) => {
  try {
    const drivers = await prisma.driver.findMany({
      orderBy: { name: "asc" },
    });
    res.json({ ok: true, drivers });
  } catch (err) {
    console.error("List drivers error:", err);
    res.status(500).json({ ok: false, error: "Failed to list drivers" });
  }
});

driversRouter.post("/api/drivers", async (req: AuthRequest, res: Response) => {
  try {
    if (!canManageDrivers(req.user?.role ?? "")) {
      res.status(403).json({ ok: false, error: "Management or Developer role required to add drivers" });
      return;
    }
    const parsed = createDriverSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: "Invalid input: name required" });
      return;
    }

    const driver = await prisma.driver.create({
      data: {
        name: parsed.data.name,
        phoneNumber: parsed.data.phoneNumber ?? null,
        agency: parsed.data.agency ?? null,
        idNumber: parsed.data.idNumber ?? null,
      },
    });
    res.status(201).json({ ok: true, driver });
  } catch (err) {
    console.error("Create driver error:", err);
    res.status(500).json({ ok: false, error: "Failed to create driver" });
  }
});

driversRouter.patch("/api/drivers/:id", async (req: AuthRequest, res: Response) => {
  try {
    if (!canManageDrivers(req.user?.role ?? "")) {
      res.status(403).json({ ok: false, error: "Management or Developer role required to edit drivers" });
      return;
    }
    const parsed = updateDriverSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: "Invalid input" });
      return;
    }

    const { id } = req.params;
    const existing = await prisma.driver.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ ok: false, error: "Driver not found" });
      return;
    }

    const driver = await prisma.driver.update({
      where: { id },
      data: {
        ...(parsed.data.name !== undefined && { name: parsed.data.name }),
        ...(parsed.data.phoneNumber !== undefined && { phoneNumber: parsed.data.phoneNumber }),
        ...(parsed.data.agency !== undefined && { agency: parsed.data.agency }),
        ...(parsed.data.idNumber !== undefined && { idNumber: parsed.data.idNumber }),
      },
    });
    res.json({ ok: true, driver });
  } catch (err) {
    console.error("Update driver error:", err);
    res.status(500).json({ ok: false, error: "Failed to update driver" });
  }
});

driversRouter.delete("/api/drivers/:id", async (req: AuthRequest, res: Response) => {
  try {
    if (!canManageDrivers(req.user?.role ?? "")) {
      res.status(403).json({ ok: false, error: "Management or Developer role required to delete drivers" });
      return;
    }
    const { id } = req.params;
    const existing = await prisma.driver.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ ok: false, error: "Driver not found" });
      return;
    }
    await prisma.driver.delete({ where: { id } });
    res.status(204).send();
  } catch (err) {
    console.error("Delete driver error:", err);
    res.status(500).json({ ok: false, error: "Failed to delete driver" });
  }
});
