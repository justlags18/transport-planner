import bcrypt from "bcryptjs";
import { prisma } from "./db";

const INITIAL_EMAIL = "jamie@pml-ltd.com";
const INITIAL_PASSWORD = "Password123";

export const ensureInitialUser = async (): Promise<void> => {
  const email = INITIAL_EMAIL.toLowerCase();
  const existing = await prisma.user.findUnique({
    where: { email },
  });

  if (existing) {
    if (existing.role !== "Developer") {
      await prisma.user.update({
        where: { email },
        data: { role: "Developer" },
      });
      console.log("Updated initial user role to Developer:", INITIAL_EMAIL);
    }
    return;
  }

  const passwordHash = await bcrypt.hash(INITIAL_PASSWORD, 10);
  await prisma.user.create({
    data: {
      email,
      passwordHash,
      role: "Developer",
      forcePasswordChange: true,
    },
  });

  console.log("Created initial user:", INITIAL_EMAIL, "(Developer, must change password on first login)");
};
