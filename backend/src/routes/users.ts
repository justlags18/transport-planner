import { Router, Response } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "../db";
import type { AuthRequest } from "../middleware/auth";

const ROLES = ["Clerk", "Planner", "Management", "Developer"] as const;
const PROTECTED_EMAIL = "jamie@pml-ltd.com";

function generateRandomPassword(length = 12): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.randomBytes(length);
  let result = "";
  for (let i = 0; i < length; i++) result += chars[bytes[i]! % chars.length];
  return result;
}

function canSetRole(requestorRole: string, targetRole: string): boolean {
  // Only Developers can create or assign Developer role
  if (targetRole === "Developer") {
    return requestorRole === "Developer";
  }
  // Management and Developer can set other roles
  return requestorRole === "Developer" || requestorRole === "Management";
}

export const usersRouter = Router();

const createUserSchema = z.object({
  email: z.string().email(),
  role: z.enum(ROLES),
  password: z.string().min(8).optional(),
});

const updateRoleSchema = z.object({
  role: z.enum(ROLES),
});

usersRouter.get("/api/users", async (req: AuthRequest, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        email: true,
        role: true,
        forcePasswordChange: true,
        createdAt: true,
      },
    });
    res.json({ ok: true, users });
  } catch (err) {
    console.error("List users error:", err);
    res.status(500).json({ ok: false, error: "Failed to list users" });
  }
});

usersRouter.post("/api/users", async (req: AuthRequest, res: Response) => {
  try {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: "Invalid input: email and role required; password must be 8+ characters if provided" });
      return;
    }

    const { email, role, password: rawPassword } = parsed.data;
    const emailNorm = email.trim().toLowerCase();

    // Check if requestor can set this role
    if (!canSetRole(req.user?.role ?? "", role)) {
      res.status(403).json({ ok: false, error: "You cannot create users with Developer role" });
      return;
    }

    const existing = await prisma.user.findUnique({
      where: { email: emailNorm },
    });
    if (existing) {
      res.status(409).json({ ok: false, error: "A user with this email already exists" });
      return;
    }

    const password = rawPassword ?? generateRandomPassword(12);
    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email: emailNorm,
        role,
        passwordHash,
        forcePasswordChange: true,
      },
      select: {
        id: true,
        email: true,
        role: true,
        forcePasswordChange: true,
        createdAt: true,
      },
    });

    res.status(201).json({
      ok: true,
      user,
      temporaryPassword: rawPassword ? undefined : password,
    });
  } catch (err) {
    console.error("Create user error:", err);
    res.status(500).json({ ok: false, error: "Failed to create user" });
  }
});

usersRouter.patch("/api/users/:id/reset-password", async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      res.status(404).json({ ok: false, error: "User not found" });
      return;
    }

    const temporaryPassword = generateRandomPassword(12);
    const passwordHash = await bcrypt.hash(temporaryPassword, 10);

    await prisma.user.update({
      where: { id },
      data: { passwordHash, forcePasswordChange: true },
    });

    res.json({
      ok: true,
      message: "Password reset; user must change on next login",
      temporaryPassword,
    });
  } catch (err) {
    console.error("Reset password error:", err);
    res.status(500).json({ ok: false, error: "Failed to reset password" });
  }
});

usersRouter.patch("/api/users/:id/role", async (req: AuthRequest, res: Response) => {
  try {
    const parsed = updateRoleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: "Invalid role" });
      return;
    }

    const { id } = req.params;
    const { role } = parsed.data;

    // Check if requestor can set this role
    if (!canSetRole(req.user?.role ?? "", role)) {
      res.status(403).json({ ok: false, error: "You cannot assign Developer role" });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      res.status(404).json({ ok: false, error: "User not found" });
      return;
    }

    if (user.email === PROTECTED_EMAIL && role !== "Developer") {
      res.status(403).json({ ok: false, error: "Primary developer account role cannot be changed" });
      return;
    }

    // Management cannot change a Developer's role
    if (user.role === "Developer" && req.user?.role !== "Developer") {
      res.status(403).json({ ok: false, error: "You cannot change a Developer's role" });
      return;
    }

    const updated = await prisma.user.update({
      where: { id },
      data: { role },
      select: {
        id: true,
        email: true,
        role: true,
        forcePasswordChange: true,
        createdAt: true,
      },
    });

    res.json({ ok: true, user: updated });
  } catch (err) {
    console.error("Update role error:", err);
    res.status(500).json({ ok: false, error: "Failed to update role" });
  }
});
