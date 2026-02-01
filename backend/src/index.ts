import "dotenv/config";
import { createApp } from "./server";
import { ensureInitialUser } from "./seed";
import { startBackofficePoller } from "./jobs/backofficePoller";
import { startFleetStatusSync } from "./jobs/fleetStatusSync";

const app = createApp();
const port = Number(process.env.PORT) || 3001;

const start = async () => {
  try {
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
