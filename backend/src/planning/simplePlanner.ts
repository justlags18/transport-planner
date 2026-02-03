/**
 * v0 planner: greedy assignment by pallet capacity + nearest-neighbour route ordering.
 */

export type PlannerVehicle = { id: string; capacityPallets: number };

export type PlannerJob = {
  id: string;
  matrixIndex: number;
  pallets: number;
  timeWindowStart?: number; // optional: minutes from midnight for sorting
};

export type PlannerMatrix = { durations: number[][] };

export type PlannerRoute = {
  vehicleId: string;
  jobIdsOrdered: string[];
  totalPallets: number;
  totalDuration: number;
};

export type PlannerUnassigned = { jobId: string; reason: string };

export type SimplePlannerOutput = {
  routes: PlannerRoute[];
  unassigned: PlannerUnassigned[];
};

const DEPOT_INDEX = 0;

/**
 * Sort jobs by earliest time window start (if present); otherwise keep order.
 */
function sortJobsByTimeWindow(jobs: PlannerJob[]): PlannerJob[] {
  const withTw = jobs.filter((j) => j.timeWindowStart != null);
  const withoutTw = jobs.filter((j) => j.timeWindowStart == null);
  withTw.sort((a, b) => (a.timeWindowStart ?? 0) - (b.timeWindowStart ?? 0));
  return [...withTw, ...withoutTw];
}

/**
 * Nearest-neighbour ordering from depot: start at depot (0), repeatedly go to closest unvisited job, then return to depot.
 * Returns ordered job list and total travel duration in seconds.
 */
function nearestNeighbourOrder(
  jobIndices: number[],
  durations: number[][]
): { orderedIndices: number[]; totalDuration: number } {
  if (jobIndices.length === 0) return { orderedIndices: [], totalDuration: 0 };

  const remaining = new Set(jobIndices);
  let current = DEPOT_INDEX;
  let totalDuration = 0;
  const ordered: number[] = [];

  while (remaining.size > 0) {
    let bestNext = -1;
    let bestDur = Infinity;
    for (const j of remaining) {
      const d = durations[current]?.[j] ?? Infinity;
      if (d < bestDur) {
        bestDur = d;
        bestNext = j;
      }
    }
    if (bestNext < 0) break;
    remaining.delete(bestNext);
    ordered.push(bestNext);
    totalDuration += bestDur;
    current = bestNext;
  }

  const returnDur = durations[current]?.[DEPOT_INDEX] ?? 0;
  totalDuration += returnDur;

  return { orderedIndices: ordered, totalDuration };
}

/**
 * v0 planner: greedy assign by pallet capacity, then nearest-neighbour route per vehicle.
 */
export function runSimplePlanner(
  vehicles: PlannerVehicle[],
  jobs: PlannerJob[],
  matrix: PlannerMatrix
): SimplePlannerOutput {
  const durations = matrix.durations;
  const sortedJobs = sortJobsByTimeWindow([...jobs]);

  const vehicleCapacityRemaining = new Map<string, number>();
  const vehicleAssignedJobs = new Map<string, PlannerJob[]>();
  for (const v of vehicles) {
    vehicleCapacityRemaining.set(v.id, v.capacityPallets);
    vehicleAssignedJobs.set(v.id, []);
  }

  const unassigned: PlannerUnassigned[] = [];

  for (const job of sortedJobs) {
    let assigned = false;
    for (const v of vehicles) {
      const rem = vehicleCapacityRemaining.get(v.id) ?? 0;
      if (rem >= job.pallets) {
        vehicleAssignedJobs.get(v.id)!.push(job);
        vehicleCapacityRemaining.set(v.id, rem - job.pallets);
        assigned = true;
        break;
      }
    }
    if (!assigned) {
      unassigned.push({ jobId: job.id, reason: "CAPACITY" });
    }
  }

  const routes: PlannerRoute[] = [];

  for (const v of vehicles) {
    const assigned = vehicleAssignedJobs.get(v.id) ?? [];
    if (assigned.length === 0) continue;

    const indices = assigned.map((j) => j.matrixIndex);
    const { orderedIndices, totalDuration } = nearestNeighbourOrder(indices, durations);
    const indexToJob = new Map(assigned.map((j) => [j.matrixIndex, j]));
    const jobIdsOrdered = orderedIndices.map((i) => indexToJob.get(i)!.id);
    const totalPallets = assigned.reduce((sum, j) => sum + j.pallets, 0);

    routes.push({
      vehicleId: v.id,
      jobIdsOrdered,
      totalPallets,
      totalDuration,
    });
  }

  return { routes, unassigned };
}
