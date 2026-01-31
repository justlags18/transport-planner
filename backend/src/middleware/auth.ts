import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../db";

export type Role = "Clerk" | "Planner" | "Management" | "Developer";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-in-production";

export type JwtPayload = {
  userId: string;
  email: string;
  role: Role;
  forcePasswordChange: boolean;
};

export type AuthRequest = Request & {
  user?: JwtPayload;
};

export function createToken(payload: JwtPayload, rememberMe: boolean): string {
  const expiresIn = rememberMe ? "7d" : "24h";
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    return decoded;
  } catch {
    return null;
  }
}

export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
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

  req.user = {
    userId: user.id,
    email: user.email,
    role: user.role,
    forcePasswordChange: user.forcePasswordChange,
  };
  next();
}
