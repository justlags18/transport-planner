import "dotenv/config";
import { createApp } from "./server";
import { ensureInitialUser } from "./seed";

const app = createApp();
const port = Number(process.env.PORT) || 3001;

const start = async () => {
  try {
    await ensureInitialUser();
  } catch (err) {
    console.error("Seed failed:", err);
  }

  app.listen(port, () => {
    console.log(`API listening on port ${port}`);
  });
};

start().catch((err) => {
  console.error("Startup failed:", err);
  process.exit(1);
});
