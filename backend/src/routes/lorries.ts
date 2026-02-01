import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../db";
import type { AuthRequest } from "../middleware/auth";
import { syncLorryStatusFromSchedule } from "../services/lorryStatusSync";
import { computePalletsFromRow } from "../services/backofficeScraper";

const TRUCK_CLASSES = ["Class1", "Class2", "Vans"] as const;

function canManageLorries(role: string): boolean {
  return role === "Management" || role === "Developer";
}

function canToggleStatus(role: string): boolean {
  return role === "Planner" || role === "Management" || role === "Developer";
}

export const lorriesRouter = Router();

const defaultCapacityPallets = (() => {
  const fromEnv = Number(process.env.TRAILER_CAPACITY_PALLETS);
  return Number.isFinite(fromEnv) ? fromEnv : 26;
})();

const createLorrySchema = z.object({
  name: z.string().trim().min(1),
  truckClass: z.enum(TRUCK_CLASSES).optional().default("Class1"),
  capacityPallets: z.coerce.number().int().positive().optional(),
});

const updateLorrySchema = z.object({
  name: z.string().trim().min(1).optional(),
  truckClass: z.enum(TRUCK_CLASSES).optional(),
  capacityPallets: z.coerce.number().int().positive().optional(),
});

const updateStatusSchema = z.object({
  status: z.enum(["on", "off", "service"]),
});

lorriesRouter.get("/api/lorries", async (_req, res, next) => {
  try {
    const statusByLorryId = await syncLorryStatusFromSchedule();

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
      const effectiveStatus = statusByLorryId.get(lorry.id) ?? lorry.status ?? "on";
      const assignments = lorry.assignments.map((assignment) => {
        const { consignment } = assignment;
        let effectivePallets =
          consignment.palletOverride?.pallets ?? consignment.palletsFromSite ?? 0;
        if (effectivePallets === 0 && consignment.rawJson) {
          try {
            const row = JSON.parse(consignment.rawJson) as Record<string, string>;
            const computed = computePalletsFromRow(row);
            if (computed != null && computed > 0) effectivePallets = computed;
          } catch {
            // ignore
          }
        }

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
        status: effectiveStatus,
        assignments,
        usedPallets,
      };
    });

    res.json(items);
  } catch (err) {
    next(err);
  }
});

lorriesRouter.post("/api/lorries", async (req: AuthRequest, res: Response, next) => {
  try {
    if (!canManageLorries(req.user?.role ?? "")) {
      res.status(403).json({ ok: false, error: "Forbidden: Management or Developer role required" });
      return;
    }
    const parsed = createLorrySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: "Invalid payload" });
      return;
    }

    const { name, truckClass, capacityPallets } = parsed.data;

    const lorry = await prisma.lorry.create({
      data: {
        name,
        truckClass: truckClass ?? "Class1",
        capacityPallets: capacityPallets ?? defaultCapacityPallets,
      },
    });

    res.status(201).json(lorry);
  } catch (err) {
    next(err);
  }
});

lorriesRouter.patch("/api/lorries/:id", async (req: AuthRequest, res: Response, next) => {
  try {
    if (!canManageLorries(req.user?.role ?? "")) {
      res.status(403).json({ ok: false, error: "Forbidden: Management or Developer role required" });
      return;
    }
    const parsed = updateLorrySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: "Invalid payload" });
      return;
    }

    const { id } = req.params;
    const existing = await prisma.lorry.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ ok: false, error: "Lorry not found" });
      return;
    }

    const lorry = await prisma.lorry.update({
      where: { id },
      data: {
        ...(parsed.data.name !== undefined && { name: parsed.data.name }),
        ...(parsed.data.truckClass !== undefined && { truckClass: parsed.data.truckClass }),
        ...(parsed.data.capacityPallets !== undefined && { capacityPallets: parsed.data.capacityPallets }),
      },
    });

    res.json(lorry);
  } catch (err) {
    next(err);
  }
});

lorriesRouter.patch("/api/lorries/:id/status", async (req: AuthRequest, res: Response, next) => {
  try {
    if (!canToggleStatus(req.user?.role ?? "")) {
      res.status(403).json({ ok: false, error: "Forbidden: Planner or higher role required" });
      return;
    }

    const parsed = updateStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: "Invalid status" });
      return;
    }

    const { id } = req.params;
    const existing = await prisma.lorry.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ ok: false, error: "Lorry not found" });
      return;
    }

    const { status } = parsed.data;
    const updated = await prisma.lorry.update({
      where: { id },
      data: { status },
    });

    const statusLabel = status === "on" ? "ON ROAD" : status === "service" ? "SERVICE" : "OFF ROAD";
    const actionName = status === "on" ? "lorry.status.on" : status === "service" ? "lorry.status.service" : "lorry.status.off";
    await prisma.auditLog.create({
      data: {
        actorId: req.user?.userId ?? null,
        actorEmail: req.user?.email ?? null,
        actorRole: req.user?.role ?? null,
        action: actionName,
        entityType: "lorry",
        entityId: id,
        message: `Set ${existing.name} ${statusLabel}`,
      },
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

lorriesRouter.delete("/api/lorries/:id", async (req: AuthRequest, res: Response, next) => {
  try {
    if (!canManageLorries(req.user?.role ?? "")) {
      res.status(403).json({ ok: false, error: "Forbidden: Management or Developer role required" });
      return;
    }
    const { id } = req.params;
    const existing = await prisma.lorry.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ ok: false, error: "Lorry not found" });
      return;
    }

    await prisma.lorry.delete({ where: { id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
