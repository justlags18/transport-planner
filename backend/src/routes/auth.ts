import { Router, Response } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../db";
import { createToken, normalizeRole, verifyToken, type AuthRequest } from "../middleware/auth";

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  rememberMe: z.boolean().optional().default(false),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});

authRouter.post("/api/auth/login", async (req, res: Response) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: "Invalid email or password" });
      return;
    }

    const { email, password, rememberMe } = parsed.data;

    const user = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });

    if (!user) {
      res.status(401).json({ ok: false, error: "Invalid email or password" });
      return;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ ok: false, error: "Invalid email or password" });
      return;
    }

    const payload = {
      userId: user.id,
      email: user.email,
      role: normalizeRole(user.role),
      forcePasswordChange: user.forcePasswordChange,
    };

    const token = createToken(payload, rememberMe);

    res.json({
      ok: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        forcePasswordChange: user.forcePasswordChange,
      },
    });
  } catch (err) {
    let message = "Login failed";
    if (err instanceof Error) {
      message = err.message;
    } else if (err && typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string") {
      message = (err as { message: string }).message;
    }
    if (!message || message.trim() === "") message = "Login failed";
    console.error("Login error:", err instanceof Error ? err.stack : err);
    res.status(500).json({ ok: false, error: message });
  }
});

authRouter.get("/api/auth/me", async (req, res: Response) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    res.status(401).json({ ok: false, error: "Unauthorized" });
    return;
  }

  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ ok: false, error: "Invalid or expired token" });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, email: true, role: true, forcePasswordChange: true },
  });

  if (!user) {
    res.status(401).json({ ok: false, error: "User not found" });
    return;
  }

  res.json({
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      forcePasswordChange: user.forcePasswordChange,
    },
  });
});

authRouter.post("/api/auth/change-password", async (req: AuthRequest, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      res.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }

    const payload = verifyToken(token);
    if (!payload) {
      res.status(401).json({ ok: false, error: "Invalid or expired token" });
      return;
    }

    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? "Invalid request";
      res.status(400).json({ ok: false, error: msg });
      return;
    }

    const { currentPassword, newPassword } = parsed.data;

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
    });

    if (!user) {
      res.status(401).json({ ok: false, error: "User not found" });
      return;
    }

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      res.status(400).json({ ok: false, error: "Current password is incorrect" });
      return;
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, forcePasswordChange: false },
    });

    const newPayload = {
      userId: user.id,
      email: user.email,
      role: normalizeRole(user.role),
      forcePasswordChange: false,
    };

    const newToken = createToken(newPayload, true);

    res.json({
      ok: true,
      token: newToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        forcePasswordChange: false,
      },
    });
  } catch (err) {
    console.error("Change password error:", err);
    res.status(500).json({ ok: false, error: "Failed to change password" });
  }
});
