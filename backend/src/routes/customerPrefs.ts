import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../db";
import type { AuthRequest } from "../middleware/auth";

const DELIVERY_TYPES = ["deliver", "self_collect"] as const;

const createCustomerPrefSchema = z.object({
  displayName: z.string().trim().min(1),
  customerKey: z.string().trim().optional(),
  deliveryType: z.enum(DELIVERY_TYPES),
  notes: z.string().trim().optional(),
  deliveryLocationIds: z.array(z.string()).optional(),
});

const updateCustomerPrefSchema = z.object({
  displayName: z.string().trim().min(1).optional(),
  customerKey: z.string().trim().optional().nullable(),
  deliveryType: z.enum(DELIVERY_TYPES).optional(),
  notes: z.string().trim().optional().nullable(),
  deliveryLocationIds: z.array(z.string()).optional(),
});

export const customerPrefsRouter = Router();

customerPrefsRouter.get("/api/customer-prefs", async (_req: AuthRequest, res: Response) => {
  try {
    const prefs = await prisma.customerPref.findMany({
      orderBy: [{ deliveryType: "asc" }, { displayName: "asc" }],
      include: {
        locations: { include: { deliveryLocation: true } },
      },
    });
    const prefsWithLocations = prefs.map((p) => ({
      ...p,
      deliveryLocationIds: p.locations.map((l) => l.deliveryLocationId),
      deliveryLocations: p.locations.map((l) => ({ id: l.deliveryLocation.id, displayName: l.deliveryLocation.displayName })),
      locations: undefined,
    }));
    res.json({ ok: true, prefs: prefsWithLocations });
  } catch (err) {
    console.error("List customer prefs error:", err);
    res.status(500).json({ ok: false, error: "Failed to list customer preferences" });
  }
});

/** Unique client names from consignments (scraper) that are not yet in CustomerPref. One per client; once selected they drop out of this list. */
customerPrefsRouter.get("/api/customer-prefs/available-customers", async (_req: AuthRequest, res: Response) => {
  try {
    const rows = await prisma.consignment.findMany({
      where: { customerKey: { not: null } },
      select: { customerKey: true, customerNameRaw: true },
    });
    const byKey = new Map<string, string>();
    for (const r of rows) {
      if (r.customerKey && !byKey.has(r.customerKey)) {
        byKey.set(r.customerKey, r.customerNameRaw ?? r.customerKey);
      }
    }
    const usedKeys = await prisma.customerPref.findMany({
      where: { customerKey: { not: null } },
      select: { customerKey: true },
    });
    const usedSet = new Set(usedKeys.map((p) => p.customerKey).filter(Boolean) as string[]);
    const customers = Array.from(byKey.entries())
      .filter(([key]) => !usedSet.has(key))
      .map(([customerKey, displayName]) => ({ customerKey, displayName }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" }));
    res.json({ ok: true, customers });
  } catch (err) {
    console.error("Available customers error:", err);
    res.status(500).json({ ok: false, error: "Failed to load available customers" });
  }
});

customerPrefsRouter.post("/api/customer-prefs", async (req: AuthRequest, res: Response) => {
  try {
    const parsed = createCustomerPrefSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: "Invalid input: displayName and deliveryType required" });
      return;
    }

    const { displayName, customerKey, deliveryType, notes, deliveryLocationIds } = parsed.data;

    const pref = await prisma.customerPref.create({
      data: {
        displayName,
        customerKey: customerKey ?? null,
        deliveryType,
        notes: notes ?? null,
      },
    });

    if (deliveryLocationIds && deliveryLocationIds.length > 0) {
      await prisma.customerPrefDeliveryLocation.createMany({
        data: deliveryLocationIds.map((deliveryLocationId) => ({
          customerPrefId: pref.id,
          deliveryLocationId,
        })),
      });
    }

    const prefWithLocations = await prisma.customerPref.findUnique({
      where: { id: pref.id },
      include: { locations: { include: { deliveryLocation: true } } },
    });
    const prefResponse = prefWithLocations
      ? {
          ...prefWithLocations,
          deliveryLocationIds: prefWithLocations.locations.map((l) => l.deliveryLocationId),
          deliveryLocations: prefWithLocations.locations.map((l) => ({ id: l.deliveryLocation.id, displayName: l.deliveryLocation.displayName })),
          locations: undefined,
        }
      : { ...pref, deliveryLocationIds: [], deliveryLocations: [] };

    res.status(201).json({ ok: true, pref: prefResponse });
  } catch (err) {
    console.error("Create customer pref error:", err);
    res.status(500).json({ ok: false, error: "Failed to create customer preference" });
  }
});

customerPrefsRouter.patch("/api/customer-prefs/:id", async (req: AuthRequest, res: Response) => {
  try {
    const parsed = updateCustomerPrefSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: "Invalid input" });
      return;
    }

    const { id } = req.params;
    const existing = await prisma.customerPref.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ ok: false, error: "Customer preference not found" });
      return;
    }

    if (parsed.data.deliveryLocationIds !== undefined) {
      await prisma.customerPrefDeliveryLocation.deleteMany({ where: { customerPrefId: id } });
      if (parsed.data.deliveryLocationIds.length > 0) {
        await prisma.customerPrefDeliveryLocation.createMany({
          data: parsed.data.deliveryLocationIds.map((deliveryLocationId) => ({
            customerPrefId: id,
            deliveryLocationId,
          })),
        });
      }
    }

    const pref = await prisma.customerPref.update({
      where: { id },
      data: {
        ...(parsed.data.displayName !== undefined && { displayName: parsed.data.displayName }),
        ...(parsed.data.customerKey !== undefined && { customerKey: parsed.data.customerKey }),
        ...(parsed.data.deliveryType !== undefined && { deliveryType: parsed.data.deliveryType }),
        ...(parsed.data.notes !== undefined && { notes: parsed.data.notes }),
      },
      include: {
        locations: { include: { deliveryLocation: true } },
      },
    });

    const prefResponse = {
      ...pref,
      deliveryLocationIds: pref.locations.map((l) => l.deliveryLocationId),
      deliveryLocations: pref.locations.map((l) => ({ id: l.deliveryLocation.id, displayName: l.deliveryLocation.displayName })),
      locations: undefined,
    };

    res.json({ ok: true, pref: prefResponse });
  } catch (err) {
    console.error("Update customer pref error:", err);
    res.status(500).json({ ok: false, error: "Failed to update customer preference" });
  }
});

customerPrefsRouter.delete("/api/customer-prefs/:id", async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const existing = await prisma.customerPref.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ ok: false, error: "Customer preference not found" });
      return;
    }

    await prisma.customerPref.delete({ where: { id } });
    res.status(204).send();
  } catch (err) {
    console.error("Delete customer pref error:", err);
    res.status(500).json({ ok: false, error: "Failed to delete customer preference" });
  }
});

/** Returns a map of customerKey → deliveryLocationIds[] for filtering consignments by delivery location. */
customerPrefsRouter.get("/api/customer-prefs/delivery-location-map", async (_req: AuthRequest, res: Response) => {
  try {
    const prefs = await prisma.customerPref.findMany({
      where: { customerKey: { not: null }, deliveryType: "deliver" },
      include: { locations: true },
    });
    const map: Record<string, string[]> = {};
    for (const p of prefs) {
      if (p.customerKey) {
        map[p.customerKey] = p.locations.map((l) => l.deliveryLocationId);
      }
    }
    res.json({ ok: true, map });
  } catch (err) {
    console.error("Delivery location map error:", err);
    res.status(500).json({ ok: false, error: "Failed to load delivery location map" });
  }
});
