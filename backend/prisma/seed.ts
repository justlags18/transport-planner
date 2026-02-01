import { prisma } from "../src/db";
import { ensureInitialUser } from "../src/seed";

async function main() {
  await ensureInitialUser();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
