import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { apiGet, apiPost } from "../api/client";
import { useTheme } from "../useTheme";
import { ConsignmentCard } from "../components/ConsignmentCard";
import { LorryBoard } from "../components/LorryBoard";

export type ConsignmentDTO = {
  id: string;
  customerNameRaw: string | null;
  customerKey: string | null;
  destinationRaw: string | null;
  destinationKey: string | null;
  mawbRaw: string | null;
  hawbRaw: string | null;
  etaIso: string | null;
  status: string | null;
  palletsFromSite: number | null;
  lastSeenAt: string;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AssignmentDTO = {
  id: string;
  lorryId: string;
  consignmentId: string;
  sortOrder: number;
  effectivePallets: number;
  effectiveWeight: number;
  isReload?: boolean;
  consignment: ConsignmentDTO;
};

export type LorryDTO = {
  id: string;
  name: string;
  truckClass?: string;
  capacityPallets: number;
  capacityWeightKg: number;
  usedPallets: number;
  usedWeight: number;
  createdAt: string;
  updatedAt: string;
  assignments: AssignmentDTO[];
  status?: "on" | "off" | "service";
};

type ConsignmentResponse = { items: ConsignmentDTO[] };

export const Planner = () => {
  const { theme, toggleTheme } = useTheme();
  const [consignments, setConsignments] = useState<ConsignmentDTO[]>([]);
  const [lorries, setLorries] = useState<LorryDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refreshInFlight = useRef(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const refreshData = useCallback(async () => {
    if (refreshInFlight.current) {
      return;
    }
    refreshInFlight.current = true;
    try {
      const [consignmentsRes, lorriesRes] = await Promise.all([
        apiGet<ConsignmentResponse>("/api/consignments?active=1"),
        apiGet<LorryDTO[]>("/api/lorries"),
      ]);
      setConsignments(consignmentsRes.items);
      setLorries(lorriesRes);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      refreshInFlight.current = false;
    }
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        setLoading(true);
        await refreshData();
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    load();
    return () => {
      active = false;
    };
  }, [refreshData]);

  const assignedConsignmentIds = useMemo(() => {
    const set = new Set<string>();
    for (const lorry of lorries) {
      for (const assignment of lorry.assignments) {
        set.add(assignment.consignmentId);
      }
    }
    return set;
  }, [lorries]);

  const unassigned = useMemo(
    () => consignments.filter((consignment) => !assignedConsignmentIds.has(consignment.id)),
    [consignments, assignedConsignmentIds],
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over) {
        return;
      }

      const activeType = active.data.current?.type as string | undefined;
      const overType = over.data.current?.type as string | undefined;

      if (activeType === "consignment" && overType === "lorry") {
        const consignmentId = active.data.current?.consignmentId as string | undefined;
        const lorryId = over.data.current?.lorryId as string | undefined;
        if (!consignmentId || !lorryId) {
          return;
        }
        await apiPost("/api/assignments/assign", { consignmentId, lorryId });
        await refreshData();
        return;
      }

      if (activeType === "assignment" && overType === "assignment") {
        const lorryId = active.data.current?.lorryId as string | undefined;
        const overLorryId = over.data.current?.lorryId as string | undefined;
        if (!lorryId || !overLorryId || lorryId !== overLorryId) {
          return;
        }

        const lorry = lorries.find((item) => item.id === lorryId);
        if (!lorry) {
          return;
        }

        const activeId = active.id as string;
        const overId = over.id as string;
        const orderedIds = lorry.assignments.map((assignment) => `assignment:${assignment.id}`);
        const fromIndex = orderedIds.indexOf(activeId);
        const toIndex = orderedIds.indexOf(overId);
        if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
          return;
        }

        const reordered = arrayMove(lorry.assignments, fromIndex, toIndex);
        const orderedConsignmentIds = reordered.map((assignment) => assignment.consignmentId);
        await apiPost("/api/assignments/reorder", { lorryId, orderedConsignmentIds });
        await refreshData();
      }
    },
    [lorries, refreshData],
  );

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="app">
        <header className="top-bar">
          <h1>Transport Planner</h1>
          <div className="top-actions">
            <button
              type="button"
              className="theme-toggle"
              onClick={toggleTheme}
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {theme === "dark" ? "☀ Light" : "🌙 Dark"}
            </button>
            <button type="button" disabled>
              Sync
            </button>
            <button type="button" disabled>
              Export
            </button>
          </div>
        </header>

        {error ? <div className="error-banner">{error}</div> : null}

        <div className="columns">
          <section className="panel panel-unassigned">
            <div className="panel-header">
              <h2>Unassigned</h2>
              <span className="muted">{unassigned.length} consignments</span>
            </div>
            {loading ? (
              <div className="empty-state">Loading consignments...</div>
            ) : unassigned.length === 0 ? (
              <div className="empty-state">No unassigned consignments</div>
            ) : (
              <div className="card-list">
                {unassigned.map((consignment) => (
                  <ConsignmentCard
                    key={consignment.id}
                    consignment={consignment}
                    draggableId={`consignment:${consignment.id}`}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="panel panel-lorries">
            <div className="panel-header">
              <h2>Lorries</h2>
              <span className="muted">{lorries.length} lorries</span>
            </div>
            {loading ? (
              <div className="empty-state">Loading lorries...</div>
            ) : lorries.length === 0 ? (
              <div className="empty-state">No lorries yet</div>
            ) : (
              <LorryBoard lorries={lorries} />
            )}
          </section>
        </div>
      </div>
    </DndContext>
  );
};
