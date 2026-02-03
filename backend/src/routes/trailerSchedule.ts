import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../db";
import type { AuthRequest } from "../middleware/auth";

const TRAILER_SCHEDULE_TYPES = ["on_road", "off_road", "storage", "spare"] as const;

const createTrailerScheduleSchema = z.object({
  trailerId: z.string().trim().min(1),
  type: z.enum(TRAILER_SCHEDULE_TYPES),
  startAt: z.string().trim().min(1),
  endAt: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
});

const updateTrailerScheduleSchema = z.object({
  type: z.enum(TRAILER_SCHEDULE_TYPES).optional(),
  startAt: z.string().trim().min(1).optional(),
  endAt: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
});

function parseDateTime(s: string): Date {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw new Error("Invalid date");
  return d;
}

export const trailerScheduleRouter = Router();

trailerScheduleRouter.get("/api/trailer-schedule", async (req: AuthRequest, res: Response) => {
  try {
    const trailerId = typeof req.query.trailerId === "string" ? req.query.trailerId.trim() : undefined;
    const from = typeof req.query.from === "string" ? req.query.from.trim() : undefined;
    const to = typeof req.query.to === "string" ? req.query.to.trim() : undefined;

    const where: { trailerId?: string; startAt?: { gte?: Date; lte?: Date } } = {};
    if (trailerId) where.trailerId = trailerId;
    if (from || to) {
      where.startAt = {};
      if (from) where.startAt.gte = parseDateTime(from);
      if (to) where.startAt.lte = parseDateTime(to);
    }

    const entries = await prisma.trailerSchedule.findMany({
      where: Object.keys(where).length ? where : undefined,
      orderBy: { startAt: "asc" },
      include: { trailer: { select: { id: true, number: true } } },
    });

    res.json({ ok: true, entries });
  } catch (err) {
    console.error("List trailer schedule error:", err);
    res.status(500).json({ ok: false, error: "Failed to list trailer schedule" });
  }
});

trailerScheduleRouter.post("/api/trailer-schedule", async (req: AuthRequest, res: Response) => {
  try {
    const parsed = createTrailerScheduleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: "Invalid input: trailerId, type, startAt required" });
      return;
    }

    const trailer = await prisma.trailer.findUnique({ where: { id: parsed.data.trailerId } });
    if (!trailer) {
      res.status(400).json({ ok: false, error: "Trailer not found" });
      return;
    }

    const startAt = parseDateTime(parsed.data.startAt);
    const endAt = parsed.data.endAt ? parseDateTime(parsed.data.endAt) : null;

    const entry = await prisma.trailerSchedule.create({
      data: {
        trailerId: parsed.data.trailerId,
        type: parsed.data.type,
        startAt,
        endAt,
        notes: parsed.data.notes ?? null,
      },
      include: { trailer: { select: { id: true, number: true } } },
    });

    res.status(201).json({ ok: true, entry });
  } catch (err) {
    console.error("Create trailer schedule error:", err);
    res.status(500).json({ ok: false, error: "Failed to create schedule entry" });
  }
});

trailerScheduleRouter.patch("/api/trailer-schedule/:id", async (req: AuthRequest, res: Response) => {
  try {
    const parsed = updateTrailerScheduleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: "Invalid input" });
      return;
    }

    const { id } = req.params;
    const existing = await prisma.trailerSchedule.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ ok: false, error: "Schedule entry not found" });
      return;
    }

    const data: { type?: string; startAt?: Date; endAt?: Date | null; notes?: string | null } = {};
    if (parsed.data.type !== undefined) data.type = parsed.data.type;
    if (parsed.data.startAt !== undefined) data.startAt = parseDateTime(parsed.data.startAt);
    if (parsed.data.endAt !== undefined) data.endAt = parsed.data.endAt ? parseDateTime(parsed.data.endAt) : null;
    if (parsed.data.notes !== undefined) data.notes = parsed.data.notes;

    const entry = await prisma.trailerSchedule.update({
      where: { id },
      data,
      include: { trailer: { select: { id: true, number: true } } },
    });

    res.json({ ok: true, entry });
  } catch (err) {
    console.error("Update trailer schedule error:", err);
    res.status(500).json({ ok: false, error: "Failed to update schedule entry" });
  }
});

trailerScheduleRouter.delete("/api/trailer-schedule/:id", async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const existing = await prisma.trailerSchedule.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ ok: false, error: "Schedule entry not found" });
      return;
    }

    await prisma.trailerSchedule.delete({ where: { id } });
    res.status(204).send();
  } catch (err) {
    console.error("Delete trailer schedule error:", err);
    res.status(500).json({ ok: false, error: "Failed to delete schedule entry" });
  }
});
