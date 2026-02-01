import { Router } from "express";
import { authMiddleware } from "../middleware/auth";
import { requireDeveloper, requireManagementOrDeveloper } from "../middleware/requireDeveloper";
import { healthRouter } from "./health";
import { authRouter } from "./auth";
import { usersRouter } from "./users";
import { consignmentsRouter } from "./consignments";
import { lorriesRouter } from "./lorries";
import { palletOverridesRouter } from "./palletOverrides";
import { assignmentsRouter } from "./assignments";
import pkg from "../../package.json";

export const routesRouter = Router();

routesRouter.use("/", healthRouter);
routesRouter.use("/", authRouter);

routesRouter.get("/api/version", (_req, res) => {
  res.json({ name: pkg.name, version: pkg.version });
});

routesRouter.use("/api", authMiddleware);
routesRouter.use("/", consignmentsRouter);
routesRouter.use("/", lorriesRouter);
routesRouter.use("/", palletOverridesRouter);
routesRouter.use("/", assignmentsRouter);

routesRouter.use(requireManagementOrDeveloper);
routesRouter.use("/", usersRouter);
