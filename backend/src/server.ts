import express from "express";
import cors from "cors";
import path from "path";
import { routesRouter } from "./routes";

export const createApp = () => {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.use("/", routesRouter);

  if (process.env.SERVE_FRONTEND === "1") {
    const distPath = path.resolve(__dirname, "..", "..", "frontend", "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api/")) {
        return next();
      }
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("Unhandled error:", err instanceof Error ? err.stack : err);
    res.status(500).json({ ok: false, error: message });
  });

  return app;
};
