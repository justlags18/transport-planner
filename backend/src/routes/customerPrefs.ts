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
});

const updateCustomerPrefSchema = z.object({
  displayName: z.string().trim().min(1).optional(),
  customerKey: z.string().trim().optional().nullable(),
  deliveryType: z.enum(DELIVERY_TYPES).optional(),
  notes: z.string().trim().optional().nullable(),
});

export const customerPrefsRouter = Router();

customerPrefsRouter.get("/api/customer-prefs", async (_req: AuthRequest, res: Response) => {
  try {
    const prefs = await prisma.customerPref.findMany({
      orderBy: [{ deliveryType: "asc" }, { displayName: "asc" }],
    });
    res.json({ ok: true, prefs });
  } catch (err) {
    console.error("List customer prefs error:", err);
    res.status(500).json({ ok: false, error: "Failed to list customer preferences" });
  }
});

customerPrefsRouter.post("/api/customer-prefs", async (req: AuthRequest, res: Response) => {
  try {
    const parsed = createCustomerPrefSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: "Invalid input: displayName and deliveryType required" });
      return;
    }

    const { displayName, customerKey, deliveryType, notes } = parsed.data;

    const pref = await prisma.customerPref.create({
      data: {
        displayName,
        customerKey: customerKey ?? null,
        deliveryType,
        notes: notes ?? null,
      },
    });

    res.status(201).json({ ok: true, pref });
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

    const pref = await prisma.customerPref.update({
      where: { id },
      data: {
        ...(parsed.data.displayName !== undefined && { displayName: parsed.data.displayName }),
        ...(parsed.data.customerKey !== undefined && { customerKey: parsed.data.customerKey }),
        ...(parsed.data.deliveryType !== undefined && { deliveryType: parsed.data.deliveryType }),
        ...(parsed.data.notes !== undefined && { notes: parsed.data.notes }),
      },
    });

    res.json({ ok: true, pref });
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
