import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../db";
import type { AuthRequest } from "../middleware/auth";
import { syncTrailerStatusFromSchedule } from "../services/trailerStatusSync";

const TRAILER_STATUSES = ["on_road", "off_road", "storage", "spare"] as const;

function canManageTrailers(role: string): boolean {
  return role === "Management" || role === "Developer";
}

function canManageSchedule(role: string): boolean {
  return role === "Management" || role === "Developer";
}

const createTrailerSchema = z.object({
  number: z.string().trim().min(1),
  status: z.enum(TRAILER_STATUSES).optional().default("spare"),
  lorryId: z.string().trim().optional().nullable(),
});

const updateTrailerSchema = z.object({
  number: z.string().trim().min(1).optional(),
  status: z.enum(TRAILER_STATUSES).optional(),
  lorryId: z.string().trim().optional().nullable(),
});

export const trailersRouter = Router();

trailersRouter.get("/api/trailers", async (_req, res, next) => {
  try {
    const statusByTrailerId = await syncTrailerStatusFromSchedule();
    const trailers = await prisma.trailer.findMany({
      orderBy: { number: "asc" },
      include: { lorry: { select: { id: true, name: true } } },
    });
    const items = trailers.map((trailer) => ({
      ...trailer,
      status: statusByTrailerId.get(trailer.id) ?? trailer.status,
    }));
    res.json(items);
  } catch (err) {
    next(err);
  }
});

trailersRouter.post("/api/trailers", async (req: AuthRequest, res: Response, next) => {
  try {
    if (!canManageTrailers(req.user?.role ?? "")) {
      res.status(403).json({ ok: false, error: "Forbidden: Management or Developer role required" });
      return;
    }
    const parsed = createTrailerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: "Invalid payload" });
      return;
    }
    const { number, status, lorryId } = parsed.data;
    if (lorryId) {
      const lorry = await prisma.lorry.findUnique({
        where: { id: lorryId },
        select: { truckClass: true },
      });
      if (!lorry) {
        res.status(400).json({ ok: false, error: "Lorry not found" });
        return;
      }
      if ((lorry.truckClass ?? "Class1") !== "Class1") {
        res.status(400).json({ ok: false, error: "Trailers can only be assigned to Class 1 trucks" });
        return;
      }
    }
    const trailer = await prisma.trailer.create({
      data: {
        number,
        status: status ?? "spare",
        lorryId: lorryId || null,
      },
    });
    res.status(201).json(trailer);
  } catch (err) {
    next(err);
  }
});

trailersRouter.patch("/api/trailers/:id", async (req: AuthRequest, res: Response, next) => {
  try {
    if (!canManageTrailers(req.user?.role ?? "")) {
      res.status(403).json({ ok: false, error: "Forbidden: Management or Developer role required" });
      return;
    }
    const parsed = updateTrailerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: "Invalid payload" });
      return;
    }
    const { id } = req.params;
    const existing = await prisma.trailer.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ ok: false, error: "Trailer not found" });
      return;
    }
    if (parsed.data.status !== undefined && !canManageSchedule(req.user?.role ?? "")) {
      const scheduleCount = await prisma.trailerSchedule.count({ where: { trailerId: id } });
      if (scheduleCount > 0) {
        res.status(403).json({ ok: false, error: "Schedule exists: Management required to change status" });
        return;
      }
    }
    if (parsed.data.lorryId != null && parsed.data.lorryId !== "") {
      const lorry = await prisma.lorry.findUnique({
        where: { id: parsed.data.lorryId },
        select: { truckClass: true },
      });
      if (!lorry) {
        res.status(400).json({ ok: false, error: "Lorry not found" });
        return;
      }
      if ((lorry.truckClass ?? "Class1") !== "Class1") {
        res.status(400).json({ ok: false, error: "Trailers can only be assigned to Class 1 trucks" });
        return;
      }
    }
    const trailer = await prisma.trailer.update({
      where: { id },
      data: {
        ...(parsed.data.number !== undefined && { number: parsed.data.number }),
        ...(parsed.data.status !== undefined && { status: parsed.data.status }),
        ...(parsed.data.lorryId !== undefined && { lorryId: parsed.data.lorryId || null }),
        ...(parsed.data.status === "off_road" && { lorryId: null }),
      },
    });
    res.json(trailer);
  } catch (err) {
    next(err);
  }
});

trailersRouter.delete("/api/trailers/:id", async (req: AuthRequest, res: Response, next) => {
  try {
    if (!canManageTrailers(req.user?.role ?? "")) {
      res.status(403).json({ ok: false, error: "Forbidden: Management or Developer role required" });
      return;
    }
    const { id } = req.params;
    const existing = await prisma.trailer.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ ok: false, error: "Trailer not found" });
      return;
    }
    await prisma.trailer.delete({ where: { id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
