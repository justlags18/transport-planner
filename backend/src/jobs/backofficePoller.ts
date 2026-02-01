import cron from "node-cron";
import { fetchAndUpsertConsignments } from "../services/backofficeScraper";

const CRON_SCHEDULE = process.env.PML_BACKOFFICE_CRON ?? "*/10 * * * *";

export const startBackofficePoller = () => {
  const run = async () => {
    try {
      const count = await fetchAndUpsertConsignments();
      console.log(`Backoffice poll complete: ${count} rows processed`);
    } catch (err) {
      console.error("Backoffice poll failed:", err);
    }
  };

  run();
  cron.schedule(CRON_SCHEDULE, run);
  console.log(`Backoffice poller scheduled: ${CRON_SCHEDULE}`);
};
