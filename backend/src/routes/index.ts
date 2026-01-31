import { Router } from "express";
import { healthRouter } from "./health";
import { consignmentsRouter } from "./consignments";
import { lorriesRouter } from "./lorries";
import { palletOverridesRouter } from "./palletOverrides";
import { assignmentsRouter } from "./assignments";
import pkg from "../../package.json";

export const routesRouter = Router();

routesRouter.use("/", healthRouter);
routesRouter.use("/", consignmentsRouter);
routesRouter.use("/", lorriesRouter);
routesRouter.use("/", palletOverridesRouter);
routesRouter.use("/", assignmentsRouter);

routesRouter.get("/api/version", (_req, res) => {
  res.json({ name: pkg.name, version: pkg.version });
});
