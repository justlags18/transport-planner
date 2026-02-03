import { Router } from "express";
import { authMiddleware } from "../middleware/auth";
import { requireManagementOrDeveloper, requirePlannerOrAbove } from "../middleware/requireDeveloper";
import { healthRouter } from "./health";
import { authRouter } from "./auth";
import { usersRouter } from "./users";
import { customerPrefsRouter } from "./customerPrefs";
import { deliveryLocationsRouter } from "./deliveryLocations";
import { fleetScheduleRouter } from "./fleetSchedule";
import { trailerScheduleRouter } from "./trailerSchedule";
import { consignmentsRouter } from "./consignments";
import { lorriesRouter } from "./lorries";
import { trailersRouter } from "./trailers";
import { palletOverridesRouter } from "./palletOverrides";
import { assignmentsRouter } from "./assignments";
import { planningRouter } from "./planning";
import { planningHealthRouter } from "./planningHealth";
import { auditLogsRouter } from "./auditLogs";
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
routesRouter.use("/", trailersRouter);
routesRouter.use("/", palletOverridesRouter);
routesRouter.use("/", assignmentsRouter);
routesRouter.use("/", planningRouter);
routesRouter.use("/", planningHealthRouter);

// Planner+ can access customer prefs (must be before Management-only block)
routesRouter.use(requirePlannerOrAbove);
routesRouter.use("/", customerPrefsRouter);
routesRouter.use("/", deliveryLocationsRouter);
routesRouter.use("/", fleetScheduleRouter);
routesRouter.use("/", trailerScheduleRouter);

routesRouter.use(requireManagementOrDeveloper);
routesRouter.use("/", usersRouter);
routesRouter.use("/", auditLogsRouter);
