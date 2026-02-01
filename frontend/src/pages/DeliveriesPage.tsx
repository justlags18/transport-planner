import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  type DragEndEvent,
  type DragStartEvent,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { apiGet, apiPost } from "../api/client";
import { UnassignedDeliveriesPanel } from "../components/deliveries/UnassignedDeliveriesPanel";
import { LorriesBoard } from "../components/deliveries/LorriesBoard";
import { DragGhost } from "../components/deliveries/DragGhost";
import type { DeliveryJobConsignment } from "../components/DeliveryJobCard";
import type { LorryDTO, AssignmentDTO } from "./Planner";

type ConsignmentResponse = { items: DeliveryJobConsignment[] };
type DeliveryLocationDTO = { id: string; displayName: string; destinationKey: string | null; notes: string | null };
type DeliveryLocationsResponse = { ok: boolean; locations: DeliveryLocationDTO[] };

type ConsignmentDragItem = {
  consignmentId: string;
  jobId: string;
  pallets: number;
  consignment: DeliveryJobConsignment;
};

type ActiveDragData =
  | { type: "consignment"; items: ConsignmentDragItem[]; totalPallets: number }
  | { type: "assignment"; consignmentId: string; pallets: number; jobId: string; sourceLorryId?: string }
  | null;

const MISSING_PALLETS_FALLBACK = 1;

export const DeliveriesPage = () => {
  const [consignments, setConsignments] = useState<DeliveryJobConsignment[]>([]);
  const [lorries, setLorries] = useState<LorryDTO[]>([]);
  const [deliveryLocations, setDeliveryLocations] = useState<DeliveryLocationDTO[]>([]);
  const [deliveryLocationFilter, setDeliveryLocationFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refreshInFlight = useRef(false);

  const [selectedUnassignedIds, setSelectedUnassignedIds] = useState<Set<string>>(() => new Set());
  const [activeDragData, setActiveDragData] = useState<ActiveDragData>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor)
  );

  const refreshData = useCallback(async () => {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    try {
      const [consRes, lorriesRes] = await Promise.all([
        apiGet<ConsignmentResponse>("/api/consignments?active=1&deliveryOnly=1"),
        apiGet<LorryDTO[]>("/api/lorries"),
      ]);
      setConsignments(consRes.items ?? []);
      setLorries(lorriesRes ?? []);
      setError(null);
      const locRes = await apiGet<DeliveryLocationsResponse>("/api/delivery-locations").catch(() => ({ ok: false, locations: [] }));
      setDeliveryLocations(locRes?.locations ?? []);
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
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, [refreshData]);

  const selectedLocation = useMemo(
    () => (deliveryLocationFilter === "all" ? null : deliveryLocations.find((l) => l.id === deliveryLocationFilter)),
    [deliveryLocationFilter, deliveryLocations],
  );

  const filteredConsignments = useMemo(() => {
    if (!selectedLocation?.destinationKey) return consignments;
    const key = (selectedLocation.destinationKey ?? "").trim().toUpperCase();
    if (!key) return consignments;
    return consignments.filter((c) => (c.destinationKey ?? "").trim().toUpperCase() === key);
  }, [consignments, selectedLocation]);

  const assignedConsignmentIds = useMemo(() => {
    const set = new Set<string>();
    for (const lorry of lorries) {
      for (const a of lorry.assignments) set.add(a.consignmentId);
    }
    return set;
  }, [lorries]);

  const unassigned = useMemo(
    () => filteredConsignments.filter((c) => !assignedConsignmentIds.has(c.id)),
    [filteredConsignments, assignedConsignmentIds],
  );

  const toggleSelection = useCallback((id: string) => {
    setSelectedUnassignedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const setSelectionRange = useCallback((ids: string[]) => {
    setSelectedUnassignedIds(new Set(ids));
  }, []);

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const { active } = event;
      const data = active.data.current;
      if (!data) return;
      const type = data.type as string | undefined;
      const consignmentId = data.consignmentId as string | undefined;
      const jobId = (data.jobId as string) ?? consignmentId ?? "";
      const pallets = Number(data.pallets) || 0;
      if (type === "consignment" && consignmentId) {
        const idsToDrag =
          selectedUnassignedIds.has(consignmentId) && selectedUnassignedIds.size > 0
            ? Array.from(selectedUnassignedIds)
            : [consignmentId];
        const items: ConsignmentDragItem[] = idsToDrag
          .map((id) => unassigned.find((c) => c.id === id))
          .filter((c): c is DeliveryJobConsignment => c != null)
          .map((c) => ({
            consignmentId: c.id,
            jobId: c.id,
            pallets: (c.palletsFromSite ?? 0) > 0 ? (c.palletsFromSite ?? 0) : MISSING_PALLETS_FALLBACK,
            consignment: c,
          }));
        if (items.length === 0) return;
        const totalPallets = items.reduce((s, i) => s + i.pallets, 0);
        setActiveDragData({ type: "consignment", items, totalPallets });
        return;
      }
      if (type === "assignment" && consignmentId) {
        const sourceLorryId = data.lorryId as string | undefined;
        setActiveDragData({ type: "assignment", consignmentId, pallets, jobId, sourceLorryId });
      }
    },
    [unassigned, selectedUnassignedIds],
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { over } = event;
      const dragData = activeDragData;
      setActiveDragData(null);

      if (!over) return;

      const overType = over.data.current?.type as string | undefined;
      const targetLorryId = overType === "lorry" ? (over.data.current?.lorryId as string) : undefined;

      if (dragData?.type === "consignment" && targetLorryId) {
        const { items, totalPallets } = dragData;
        const targetLorry = lorries.find((l) => l.id === targetLorryId);
        const capacity = targetLorry ? Math.max(targetLorry.capacityPallets, 1) : 0;
        const used = targetLorry?.usedPallets ?? 0;
        if (used + totalPallets > capacity) return;

        const prevLorries = lorries;
        const newAssignments: AssignmentDTO[] = items.map((item, i) => ({
          id: `temp-${item.consignmentId}`,
          lorryId: targetLorryId,
          consignmentId: item.consignmentId,
          sortOrder: i,
          effectivePallets: item.pallets,
          consignment: item.consignment as AssignmentDTO["consignment"],
        }));

        setLorries((prev) =>
          prev.map((l) => {
            if (l.id !== targetLorryId) return l;
            const assignments = [...l.assignments, ...newAssignments].map((a, i) => ({ ...a, sortOrder: i }));
            return { ...l, assignments, usedPallets: l.usedPallets + totalPallets };
          })
        );
        setSelectedUnassignedIds(new Set());

        try {
          for (const item of items) {
            await apiPost("/api/assignments/assign", { consignmentId: item.consignmentId, lorryId: targetLorryId });
          }
          await refreshData();
        } catch (err) {
          setLorries(prevLorries);
          setSelectedUnassignedIds(new Set(items.map((i) => i.consignmentId)));
          setError(err instanceof Error ? err.message : "Failed to assign");
        }
        return;
      }

      if (dragData?.type === "assignment" && overType === "lorry" && targetLorryId) {
        const { consignmentId, pallets, sourceLorryId } = dragData;
        const targetLorry = lorries.find((l) => l.id === targetLorryId);
        const capacity = targetLorry ? Math.max(targetLorry.capacityPallets, 1) : 0;
        const used = targetLorry?.usedPallets ?? 0;
        if (used + pallets > capacity) return;

        const prevLorries = lorries;
        const consignment =
          consignments.find((c) => c.id === consignmentId) ??
          prevLorries.flatMap((l) => l.assignments).find((a) => a.consignmentId === consignmentId)?.consignment;
        if (!consignment) return;

        const newAssignment: AssignmentDTO = {
          id: `temp-${consignmentId}`,
          lorryId: targetLorryId,
          consignmentId,
          sortOrder: 0,
          effectivePallets: pallets,
          consignment: consignment as AssignmentDTO["consignment"],
        };

        setLorries((prev) =>
          prev.map((l) => {
            if (sourceLorryId && l.id === sourceLorryId) {
              const filtered = l.assignments.filter((a) => a.consignmentId !== consignmentId);
              const usedNow = filtered.reduce((s, a) => s + a.effectivePallets, 0);
              return { ...l, assignments: filtered, usedPallets: usedNow };
            }
            if (l.id === targetLorryId) {
              const assignments = [...l.assignments, { ...newAssignment, sortOrder: l.assignments.length }].map((a, i) => ({ ...a, sortOrder: i }));
              return { ...l, assignments, usedPallets: l.usedPallets + pallets };
            }
            return l;
          })
        );

        try {
          await apiPost("/api/assignments/assign", { consignmentId, lorryId: targetLorryId });
          await refreshData();
        } catch (err) {
          setLorries(prevLorries);
          setError(err instanceof Error ? err.message : "Failed to assign");
        }
        return;
      }

      const active = event.active;
      const activeType = active.data.current?.type as string | undefined;
      if (activeType === "assignment" && overType === "assignment") {
        const lorryId = active.data.current?.lorryId as string | undefined;
        const overLorryId = over.data.current?.lorryId as string | undefined;
        if (!lorryId || !overLorryId || lorryId !== overLorryId) return;
        const lorry = lorries.find((item) => item.id === lorryId);
        if (!lorry) return;
        const activeId = active.id as string;
        const overId = over.id as string;
        const orderedIds = lorry.assignments.map((a) => `assignment:${a.id}`);
        const fromIndex = orderedIds.indexOf(activeId);
        const toIndex = orderedIds.indexOf(overId);
        if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return;
        const reordered = arrayMove(lorry.assignments, fromIndex, toIndex);
        const orderedConsignmentIds = reordered.map((a) => a.consignmentId);
        const prevLorries = lorries;
        setLorries((prev) => prev.map((l) => (l.id === lorryId ? { ...l, assignments: reordered } : l)));
        try {
          await apiPost("/api/assignments/reorder", { lorryId, orderedConsignmentIds });
          await refreshData();
        } catch (err) {
          setLorries(prevLorries);
          setError(err instanceof Error ? err.message : "Failed to reorder");
        }
      }
    },
    [lorries, consignments, refreshData, activeDragData],
  );

  const handleDragCancel = useCallback(() => {
    setActiveDragData(null);
  }, []);

  const activeDragDataForBoard = useMemo(
    () =>
      activeDragData
        ? {
            pallets:
              activeDragData.type === "consignment"
                ? activeDragData.totalPallets
                : activeDragData.type === "assignment"
                  ? activeDragData.pallets
                  : 0,
          }
        : null,
    [activeDragData],
  );

  return (
    <>
      <h2 className="dashboard-page-title">Deliveries</h2>
      <div className="dashboard-page-content deliveries-page-board">
        {error ? (
          <div className="management-error" role="alert">
            {error}
          </div>
        ) : null}

        <p className="management-intro">
          Jobs shown are &quot;We deliver&quot; only (configured in Management → Customer Pref). Filter by delivery location, then drag jobs onto lorries.
        </p>

        <section className="management-section deliveries-board-filter">
          <form className="management-create-form" onSubmit={(e) => e.preventDefault()}>
            <label>
              Delivery location
              <select
                className="management-select"
                value={deliveryLocationFilter}
                onChange={(e) => setDeliveryLocationFilter(e.target.value)}
                aria-label="Filter by delivery location"
              >
                <option value="all">All delivery locations</option>
                {deliveryLocations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.displayName}
                  </option>
                ))}
              </select>
            </label>
            <span className="management-muted" style={{ alignSelf: "center" }}>
              {filteredConsignments.length} job{filteredConsignments.length !== 1 ? "s" : ""}
              {selectedLocation ? ` at ${selectedLocation.displayName}` : " (all)"}
            </span>
          </form>
        </section>

        {loading ? (
          <p className="management-loading">Loading deliveries…</p>
        ) : (
          <DndContext
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <div className="deliveries-two-column-board">
              <UnassignedDeliveriesPanel
                unassigned={unassigned}
                loading={loading}
                selectedIds={selectedUnassignedIds}
                onToggleSelect={toggleSelection}
                onSelectRange={setSelectionRange}
              />
              <LorriesBoard lorries={lorries} activeDragData={activeDragDataForBoard} />
            </div>
            <DragOverlay dropAnimation={null}>
              {activeDragData?.type === "consignment" ? (
                <DragGhost
                  items={activeDragData.items.map((i) => ({ jobId: i.jobId, pallets: i.pallets }))}
                />
              ) : activeDragData?.type === "assignment" ? (
                <DragGhost jobId={activeDragData.jobId} pallets={activeDragData.pallets} />
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>
    </>
  );
};
