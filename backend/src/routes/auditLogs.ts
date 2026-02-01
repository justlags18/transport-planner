import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../db";
import type { AuthRequest } from "../middleware/auth";

export const auditLogsRouter = Router();

const querySchema = z.object({
  role: z.string().optional(),
  action: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  archived: z.enum(["0", "1"]).optional(),
});

const archiveOldLogs = async () => {
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  await prisma.auditLog.updateMany({
    where: {
      archivedAt: null,
      createdAt: { lt: cutoff },
    },
    data: { archivedAt: new Date() },
  });
};

auditLogsRouter.get("/api/audit-logs", async (req: AuthRequest, res: Response) => {
  try {
    await archiveOldLogs();
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: "Invalid filters" });
      return;
    }

    const { role, action, from, to, archived } = parsed.data;
    const where = {
      ...(role ? { actorRole: role } : {}),
      ...(action ? { action } : {}),
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(to) } : {}),
            },
          }
        : {}),
      ...(archived === "1" ? { archivedAt: { not: null } } : { archivedAt: null }),
    };

    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    res.json({ ok: true, logs });
  } catch (err) {
    console.error("List audit logs error:", err);
    res.status(500).json({ ok: false, error: "Failed to load audit logs" });
  }
});
