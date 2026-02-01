import { Response } from "express";
import type { AuthRequest } from "./auth";

export function requireDeveloper(req: AuthRequest, res: Response, next: () => void): void {
  if (req.user?.role !== "Developer") {
    res.status(403).json({ ok: false, error: "Forbidden: Developer role required" });
    return;
  }
  next();
}

export function requireManagementOrDeveloper(req: AuthRequest, res: Response, next: () => void): void {
  if (req.user?.role !== "Developer" && req.user?.role !== "Management") {
    res.status(403).json({ ok: false, error: "Forbidden: Management or Developer role required" });
    return;
  }
  next();
}

export function requirePlannerOrAbove(req: AuthRequest, res: Response, next: () => void): void {
  const role = req.user?.role;
  if (role !== "Developer" && role !== "Management" && role !== "Planner") {
    res.status(403).json({ ok: false, error: "Forbidden: Planner, Management or Developer role required" });
    return;
  }
  next();
}
