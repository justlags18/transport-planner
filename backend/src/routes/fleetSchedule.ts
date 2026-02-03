import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../db";
import type { AuthRequest } from "../middleware/auth";

const SCHEDULE_TYPES = ["off_road", "service"] as const;

const createFleetScheduleSchema = z.object({
  lorryId: z.string().trim().min(1),
  type: z.enum(SCHEDULE_TYPES),
  startAt: z.string().trim().min(1),
  endAt: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
});

const updateFleetScheduleSchema = z.object({
  type: z.enum(SCHEDULE_TYPES).optional(),
  startAt: z.string().trim().min(1).optional(),
  endAt: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
});

function parseDateTime(s: string): Date {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw new Error("Invalid date");
  return d;
}

export const fleetScheduleRouter = Router();

function canManageSchedule(role: string): boolean {
  return role === "Management" || role === "Developer";
}

fleetScheduleRouter.get("/api/fleet-schedule", async (req: AuthRequest, res: Response) => {
  try {
    const lorryId = typeof req.query.lorryId === "string" ? req.query.lorryId.trim() : undefined;
    const from = typeof req.query.from === "string" ? req.query.from.trim() : undefined;
    const to = typeof req.query.to === "string" ? req.query.to.trim() : undefined;

    const where: { lorryId?: string; startAt?: { gte?: Date; lte?: Date } } = {};
    if (lorryId) where.lorryId = lorryId;
    if (from || to) {
      where.startAt = {};
      if (from) where.startAt.gte = parseDateTime(from);
      if (to) where.startAt.lte = parseDateTime(to);
    }

    const entries = await prisma.fleetSchedule.findMany({
      where: Object.keys(where).length ? where : undefined,
      orderBy: { startAt: "asc" },
      include: { lorry: { select: { id: true, name: true } } },
    });

    res.json({ ok: true, entries });
  } catch (err) {
    console.error("List fleet schedule error:", err);
    res.status(500).json({ ok: false, error: "Failed to list fleet schedule" });
  }
});

fleetScheduleRouter.post("/api/fleet-schedule", async (req: AuthRequest, res: Response) => {
  try {
    if (!canManageSchedule(req.user?.role ?? "")) {
      res.status(403).json({ ok: false, error: "Forbidden: Management or Developer role required" });
      return;
    }
    const parsed = createFleetScheduleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: "Invalid input: lorryId, type, startAt required" });
      return;
    }

    const lorry = await prisma.lorry.findUnique({ where: { id: parsed.data.lorryId } });
    if (!lorry) {
      res.status(400).json({ ok: false, error: "Lorry not found" });
      return;
    }

    const startAt = parseDateTime(parsed.data.startAt);
    const endAt = parsed.data.endAt ? parseDateTime(parsed.data.endAt) : null;

    const entry = await prisma.fleetSchedule.create({
      data: {
        lorryId: parsed.data.lorryId,
        type: parsed.data.type,
        startAt,
        endAt,
        notes: parsed.data.notes ?? null,
      },
      include: { lorry: { select: { id: true, name: true } } },
    });

    res.status(201).json({ ok: true, entry });
  } catch (err) {
    console.error("Create fleet schedule error:", err);
    res.status(500).json({ ok: false, error: "Failed to create schedule entry" });
  }
});

fleetScheduleRouter.patch("/api/fleet-schedule/:id", async (req: AuthRequest, res: Response) => {
  try {
    if (!canManageSchedule(req.user?.role ?? "")) {
      res.status(403).json({ ok: false, error: "Forbidden: Management or Developer role required" });
      return;
    }
    const parsed = updateFleetScheduleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: "Invalid input" });
      return;
    }

    const { id } = req.params;
    const existing = await prisma.fleetSchedule.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ ok: false, error: "Schedule entry not found" });
      return;
    }

    const data: { type?: string; startAt?: Date; endAt?: Date | null; notes?: string | null } = {};
    if (parsed.data.type !== undefined) data.type = parsed.data.type;
    if (parsed.data.startAt !== undefined) data.startAt = parseDateTime(parsed.data.startAt);
    if (parsed.data.endAt !== undefined) data.endAt = parsed.data.endAt ? parseDateTime(parsed.data.endAt) : null;
    if (parsed.data.notes !== undefined) data.notes = parsed.data.notes;

    const entry = await prisma.fleetSchedule.update({
      where: { id },
      data,
      include: { lorry: { select: { id: true, name: true } } },
    });

    res.json({ ok: true, entry });
  } catch (err) {
    console.error("Update fleet schedule error:", err);
    res.status(500).json({ ok: false, error: "Failed to update schedule entry" });
  }
});

fleetScheduleRouter.delete("/api/fleet-schedule/:id", async (req: AuthRequest, res: Response) => {
  try {
    if (!canManageSchedule(req.user?.role ?? "")) {
      res.status(403).json({ ok: false, error: "Forbidden: Management or Developer role required" });
      return;
    }
    const { id } = req.params;
    const existing = await prisma.fleetSchedule.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ ok: false, error: "Schedule entry not found" });
      return;
    }

    await prisma.fleetSchedule.delete({ where: { id } });
    res.status(204).send();
  } catch (err) {
    console.error("Delete fleet schedule error:", err);
    res.status(500).json({ ok: false, error: "Failed to delete schedule entry" });
  }
});
