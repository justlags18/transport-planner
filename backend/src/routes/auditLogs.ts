import { Router, Response } from "express";
import { prisma } from "../db";
import type { AuthRequest } from "../middleware/auth";

export const auditLogsRouter = Router();

auditLogsRouter.get("/api/audit-logs", async (req: AuthRequest, res: Response) => {
  try {
    const logs = await prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    res.json({ ok: true, logs });
  } catch (err) {
    console.error("List audit logs error:", err);
    res.status(500).json({ ok: false, error: "Failed to load audit logs" });
  }
});
