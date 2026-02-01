import cron from "node-cron";
import { syncLorryStatusFromSchedule } from "../services/lorryStatusSync";

/** Cron: default every minute. Override with PML_FLEET_STATUS_CRON (e.g. "*/5 * * * *" for every 5 min). */
const CRON_SCHEDULE = process.env.PML_FLEET_STATUS_CRON ?? "* * * * *";

export const startFleetStatusSync = () => {
  const run = async () => {
    try {
      await syncLorryStatusFromSchedule();
    } catch (err) {
      console.error("Fleet status sync failed:", err);
    }
  };

  run();
  cron.schedule(CRON_SCHEDULE, run);
  console.log(`Fleet status sync scheduled: ${CRON_SCHEDULE}`);
};
