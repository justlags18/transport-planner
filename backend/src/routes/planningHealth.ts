import { Router, Request, Response } from "express";

export const planningHealthRouter = Router();

const OSRM_ROUTE_CHECK_COORDS = "-0.1276,51.5072;-1.2577,51.7520";

planningHealthRouter.get("/api/planning/health", async (_req: Request, res: Response) => {
  const osrmBaseUrl = process.env.OSRM_BASE_URL ?? null;
  const depot = {
    lat: process.env.DEPOT_LAT ?? null,
    lng: process.env.DEPOT_LNG ?? null,
  };

  let depotValid = false;
  const latRaw = process.env.DEPOT_LAT;
  const lngRaw = process.env.DEPOT_LNG;
  if (latRaw != null && lngRaw != null) {
    const lat = parseFloat(latRaw);
    const lng = parseFloat(lngRaw);
    depotValid = Number.isFinite(lat) && Number.isFinite(lng);
  }

  let osrmOk = false;
  if (depotValid && osrmBaseUrl != null && osrmBaseUrl.trim() !== "") {
    const baseUrl = osrmBaseUrl.trim().replace(/\/$/, "");
    const url = `${baseUrl}/route/v1/driving/${OSRM_ROUTE_CHECK_COORDS}?overview=false`;
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      const text = await response.text();
      if (response.ok) {
        try {
          const body = JSON.parse(text) as { code?: string };
          osrmOk = body?.code === "Ok";
        } catch {
          osrmOk = false;
        }
      }
    } catch {
      osrmOk = false;
    }
  }

  res.json({
    osrmBaseUrl,
    depot,
    osrmOk,
  });
});
