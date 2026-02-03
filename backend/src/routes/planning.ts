import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../db";
import type { AuthRequest } from "../middleware/auth";
import { osrmTableMatrix, type Coord } from "../services/osrmMatrix";
import { runSimplePlanner } from "../planning/simplePlanner";

const optimizeBodySchema = z.object({
  date: z.string().trim().optional(),
  mode: z.enum(["simple"]).optional(),
});

export const planningRouter = Router();

function todayISO(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function parseDate(dateStr: string): { start: Date; end: Date } {
  const start = new Date(dateStr + "T00:00:00.000Z");
  const end = new Date(dateStr + "T23:59:59.999Z");
  if (Number.isNaN(start.getTime())) throw new Error("Invalid date format; use YYYY-MM-DD");
  return { start, end };
}

/** Lorries that have an off_road FleetSchedule entry overlapping the given day are excluded. */
async function getAvailableLorryIdsForDate(dayStart: Date, dayEnd: Date): Promise<Set<string>> {
  const offRoadEntries = await prisma.fleetSchedule.findMany({
    where: {
      type: "off_road",
      startAt: { lte: dayEnd },
      OR: [{ endAt: null }, { endAt: { gte: dayStart } }],
    },
    select: { lorryId: true },
  });
  const excludedLorryIds = new Set(offRoadEntries.map((e) => e.lorryId));
  const allLorries = await prisma.lorry.findMany({ select: { id: true } });
  const available = allLorries.filter((l) => !excludedLorryIds.has(l.id)).map((l) => l.id);
  return new Set(available);
}

/** Parse etaIso to minutes from midnight (UTC). Returns undefined if no time part. */
function timeWindowStartFromEtaIso(etaIso: string | null, dateStr: string): number | undefined {
  if (!etaIso || !etaIso.startsWith(dateStr)) return undefined;
  const t = etaIso.slice(dateStr.length).replace(/^T/, "").trim();
  if (!t) return undefined;
  const match = t.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return undefined;
  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return undefined;
  return h * 60 + m;
}

planningRouter.post("/api/planning/optimize", async (req: AuthRequest, res: Response) => {
  try {
    const modeQuery = typeof req.query.mode === "string" ? req.query.mode : undefined;
    const parsed = optimizeBodySchema.safeParse(req.body ?? {});
    const dateStr = parsed.success && parsed.data.date ? parsed.data.date.trim() : todayISO();
    const modeBody = parsed.success ? parsed.data.mode : undefined;
    const modeSimple = modeQuery === "simple" || modeBody === "simple";

    const { start: dayStart, end: dayEnd } = parseDate(dateStr);

    const depotLat = process.env.DEPOT_LAT != null ? parseFloat(process.env.DEPOT_LAT) : NaN;
    const depotLng = process.env.DEPOT_LNG != null ? parseFloat(process.env.DEPOT_LNG) : NaN;
    if (!Number.isFinite(depotLat) || !Number.isFinite(depotLng)) {
      res.status(400).json({
        ok: false,
        error: "Depot not configured. Set DEPOT_LAT and DEPOT_LNG environment variables.",
      });
      return;
    }
    const depot: Coord = { lat: depotLat, lng: depotLng };

    const deliverPrefs = await prisma.customerPref.findMany({
      where: { deliveryType: { in: ["deliver", "collection"] }, customerKey: { not: null } },
      select: { customerKey: true },
    });
    const deliverCustomerKeys = deliverPrefs.map((p) => p.customerKey).filter(Boolean) as string[];

    const assignedConsignmentIds = await prisma.assignment.findMany({
      select: { consignmentId: true },
      distinct: ["consignmentId"],
    });
    const assignedSet = new Set(assignedConsignmentIds.map((a) => a.consignmentId));

    const consignments = await prisma.consignment.findMany({
      where: {
        archivedAt: null,
        ...(deliverCustomerKeys.length > 0 && { customerKey: { in: deliverCustomerKeys } }),
        etaIso: { startsWith: dateStr },
        id: { notIn: Array.from(assignedSet) },
      },
      include: {
        deliveryLocation: {
          select: { id: true, lat: true, lng: true, postcode: true, displayName: true },
        },
      },
      orderBy: { etaIso: "asc" },
    });

    const unroutable: { id: string; reason: string }[] = [];
    const routable: Array<{
      id: string;
      lat: number;
      lng: number;
      matrixIndex: number;
      deliveryLocationId: string | null;
      postcode: string | null;
      displayName?: string;
      pallets: number;
      timeWindowStart?: number;
    }> = [];

    consignments.forEach((c) => {
      const loc = c.deliveryLocation;
      if (!loc || loc.lat == null || loc.lng == null) {
        unroutable.push({ id: c.id, reason: "MISSING_GEO" });
        return;
      }
      const pallets = c.palletsFromSite != null && c.palletsFromSite > 0 ? c.palletsFromSite : 1;
      routable.push({
        id: c.id,
        lat: loc.lat,
        lng: loc.lng,
        matrixIndex: 1 + routable.length,
        deliveryLocationId: loc.id,
        postcode: loc.postcode,
        displayName: loc.displayName,
        pallets,
        timeWindowStart: timeWindowStartFromEtaIso(c.etaIso, dateStr),
      });
    });

    const availableLorryIds = await getAvailableLorryIdsForDate(dayStart, dayEnd);
    const lorries = await prisma.lorry.findMany({
      where: { id: { in: Array.from(availableLorryIds) } },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        truckClass: true,
        capacityPallets: true,
      },
    });

    const vehicles = lorries.map((l) => ({
      id: l.id,
      name: l.name,
      truckClass: l.truckClass,
      capacityPallets: l.capacityPallets,
    }));

    const jobs = routable.map((j) => ({
      id: j.id,
      lat: j.lat,
      lng: j.lng,
      matrixIndex: j.matrixIndex,
      deliveryLocationId: j.deliveryLocationId,
      postcode: j.postcode,
      displayName: j.displayName,
      pallets: j.pallets,
      ...(j.timeWindowStart != null && { timeWindowStart: j.timeWindowStart }),
    }));

    const stopsCoords: Coord[] = [depot, ...routable.map((j) => ({ lat: j.lat, lng: j.lng }))];

    let matrix: { durations: number[][]; distances: number[][] };
    if (stopsCoords.length < 2) {
      matrix = { durations: [], distances: [] };
    } else {
      const baseUrl = process.env.OSRM_BASE_URL;
      matrix = await osrmTableMatrix(stopsCoords, {
        baseUrl: baseUrl ?? undefined,
        dayKey: dateStr,
      });
    }

    const payload: {
      ok: true;
      vehicles: typeof vehicles;
      jobs: typeof jobs;
      matrix: { durations: number[][]; distances: number[][] };
      unroutable: typeof unroutable;
      routes?: Array<{ vehicleId: string; jobIdsOrdered: string[]; totalPallets: number; totalDuration: number }>;
      unassigned?: Array<{ jobId: string; reason: string }>;
    } = {
      ok: true,
      vehicles,
      jobs,
      matrix: { durations: matrix.durations, distances: matrix.distances },
      unroutable,
    };

    if (modeSimple && vehicles.length > 0) {
      const plannerJobs = routable.map((j) => ({
        id: j.id,
        matrixIndex: j.matrixIndex,
        pallets: j.pallets,
        ...(j.timeWindowStart != null && { timeWindowStart: j.timeWindowStart }),
      }));
      const plannerResult = runSimplePlanner(vehicles, plannerJobs, { durations: matrix.durations });
      payload.routes = plannerResult.routes;
      payload.unassigned = plannerResult.unassigned;
    }

    res.json(payload);
  } catch (err) {
    console.error("Planning optimize error:", err);
    const message = err instanceof Error ? err.message : "Planning optimize failed";
    res.status(500).json({ ok: false, error: message });
  }
});
