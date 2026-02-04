import "dotenv/config";
import "./config/env";
import { createApp } from "./server";
import { prisma } from "./db";
import { ensureInitialUser } from "./seed";
import { startBackofficePoller } from "./jobs/backofficePoller";
import { startFleetStatusSync } from "./jobs/fleetStatusSync";

const app = createApp();
const port = Number(process.env.PORT) || 3001;

const start = async () => {
  try {
    const normalized = await prisma.$executeRaw`
      UPDATE DeliveryLocation
      SET address = 'Unknown'
      WHERE address IS NULL OR TRIM(address) = ''
    `;
    if (Number(normalized) > 0) {
      console.log(`Normalized ${normalized} delivery locations with empty address.`);
    }
    await ensureInitialUser();
  } catch (err) {
    console.error("Seed failed:", err);
  }

  if (process.env.PML_BACKOFFICE_POLL === "1") {
    startBackofficePoller();
  }

  startFleetStatusSync();

  app.listen(port, () => {
    console.log(`API listening on port ${port}`);
  });
};

start().catch((err) => {
  console.error("Startup failed:", err);
  process.exit(1);
});
