import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const INITIAL_EMAIL = "jamie@pml-ltd.com";
const INITIAL_PASSWORD = "Password123";

async function main() {
  const existing = await prisma.user.findUnique({
    where: { email: INITIAL_EMAIL.toLowerCase() },
  });

  if (existing) {
    console.log("Initial user already exists:", INITIAL_EMAIL);
    return;
  }

  const passwordHash = await bcrypt.hash(INITIAL_PASSWORD, 10);

  await prisma.user.create({
    data: {
      email: INITIAL_EMAIL.toLowerCase(),
      passwordHash,
      role: "Developer",
      forcePasswordChange: true,
    },
  });

  console.log("Created initial user:", INITIAL_EMAIL, "(Developer, must change password on first login)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
