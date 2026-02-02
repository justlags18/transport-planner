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
import { apiGet, apiPatch, apiPost } from "../api/client";
import { UnassignedDeliveriesPanel } from "../components/deliveries/UnassignedDeliveriesPanel";
import { LorriesBoard } from "../components/deliveries/LorriesBoard";
import { DragGhost } from "../components/deliveries/DragGhost";
import type { DeliveryJobConsignment } from "../components/DeliveryJobCard";
import type { LorryDTO, AssignmentDTO } from "./Planner";

type ConsignmentResponse = { items: DeliveryJobConsignment[] };
type DeliveryLocationDTO = { id: string; displayName: string; destinationKey: string | null; notes: string | null };
type DeliveryLocationsResponse = { ok: boolean; locations: DeliveryLocationDTO[] };
type CustomerDeliveryLocationMapResponse = { ok: boolean; map: Record<string, string[]> };

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
  const [customerLocationMap, setCustomerLocationMap] = useState<Record<string, string[]>>({});
  const [deliveryLocationFilter, setDeliveryLocationFilter] = useState<string>("all");
  const [transportDate, setTransportDate] = useState<string>(() => {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refreshInFlight = useRef(false);

  const [selectedUnassignedIds, setSelectedUnassignedIds] = useState<Set<string>>(() => new Set());
  const [activeDragData, setActiveDragData] = useState<ActiveDragData>(null);
  const [backfillResult, setBackfillResult] = useState<{
    updated: number;
    noRawJson: number;
    computeReturnedNull: number;
    sampleRowKeys?: string[];
    sampleRow?: Record<string, string>;
  } | null>(null);
  const [backfilling, setBackfilling] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor)
  );

  const refreshData = useCallback(async () => {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    const dateParam = transportDate ? `&date=${encodeURIComponent(transportDate)}` : "";
    try {
      const [consRes, lorriesRes, locRes, mapRes] = await Promise.all([
        apiGet<ConsignmentResponse>(`/api/consignments?active=1&deliveryOnly=1${dateParam}`),
        apiGet<LorryDTO[]>("/api/lorries"),
        apiGet<DeliveryLocationsResponse>("/api/delivery-locations").catch(() => ({ ok: false, locations: [] })),
        apiGet<CustomerDeliveryLocationMapResponse>("/api/customer-prefs/delivery-location-map").catch(() => ({ ok: false, map: {} })),
      ]);
      setConsignments(consRes.items ?? []);
      setLorries(lorriesRes ?? []);
      setDeliveryLocations(locRes?.locations ?? []);
      setCustomerLocationMap(mapRes?.map ?? {});
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      refreshInFlight.current = false;
    }
  }, [transportDate]);

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

  const transportDateChangedRef = useRef(false);
  useEffect(() => {
    if (!transportDateChangedRef.current) {
      transportDateChangedRef.current = true;
      return;
    }
    refreshData();
  }, [transportDate, refreshData]);

  const selectedLocation = useMemo(
    () => (deliveryLocationFilter === "all" ? null : deliveryLocations.find((l) => l.id === deliveryLocationFilter)),
    [deliveryLocationFilter, deliveryLocations],
  );

  const filteredConsignments = useMemo(() => {
    if (deliveryLocationFilter === "all") return consignments;
    // Filter by customer→location mapping: if customer is linked to this location, show the job
    // Also show if the consignment has a deliveryLocationId override matching the filter
    return consignments.filter((c) => {
      // Check if consignment has a direct override
      if ((c as any).deliveryLocationId === deliveryLocationFilter) return true;
      // Check if customer is linked to this location via CustomerPrefDeliveryLocation
      if (!c.customerKey) return false;
      const customerLocs = customerLocationMap[c.customerKey] ?? [];
      return customerLocs.includes(deliveryLocationFilter);
    });
  }, [consignments, deliveryLocationFilter, customerLocationMap]);

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

  const handleUnassign = useCallback(
    async (consignmentId: string) => {
      const prevLorries = lorries;
      const lorryWithJob = prevLorries.find((l) => l.assignments.some((a) => a.consignmentId === consignmentId));
      if (!lorryWithJob) return;
      const pallets = lorryWithJob.assignments.find((a) => a.consignmentId === consignmentId)?.effectivePallets ?? 0;
      setLorries((prev) =>
        prev.map((l) => {
          if (l.id !== lorryWithJob.id) return l;
          const filtered = l.assignments.filter((a) => a.consignmentId !== consignmentId);
          const usedNow = filtered.reduce((s, a) => s + a.effectivePallets, 0);
          return { ...l, assignments: filtered, usedPallets: usedNow };
        })
      );
      try {
        await apiPost("/api/assignments/unassign", { consignmentId });
        await refreshData();
      } catch (err) {
        setLorries(prevLorries);
        setError(err instanceof Error ? err.message : "Failed to remove job");
      }
    },
    [lorries, refreshData],
  );

  const handleToggleReload = useCallback(
    async (assignmentId: string, isReload: boolean) => {
      try {
        await apiPatch(`/api/assignments/${assignmentId}/reload`, { isReload });
        await refreshData();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update reload flag");
      }
    },
    [refreshData],
  );

  const handleMarkLorryAsBackload = useCallback(
    async (lorryId: string) => {
      const lorry = lorries.find((l) => l.id === lorryId);
      if (!lorry?.assignments.length) return;
      try {
        await Promise.all(
          lorry.assignments.map((a) => apiPatch(`/api/assignments/${a.id}/reload`, { isReload: true }))
        );
        await refreshData();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to mark as backload");
      }
    },
    [lorries, refreshData],
  );

  const handleBackfillPallets = useCallback(async () => {
    setBackfilling(true);
    setBackfillResult(null);
    try {
      const res = await apiPost<{
        ok: boolean;
        updated: number;
        noRawJson: number;
        computeReturnedNull: number;
        sampleRowKeys?: string[];
        sampleRow?: Record<string, string>;
      }>("/api/consignments/backfill-pallets", {});
      setBackfillResult({
        updated: res.updated,
        noRawJson: res.noRawJson,
        computeReturnedNull: res.computeReturnedNull,
        sampleRowKeys: res.sampleRowKeys,
        sampleRow: res.sampleRow,
      });
      await refreshData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Backfill failed");
    } finally {
      setBackfilling(false);
    }
  }, [refreshData]);

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
          Plan transport for the chosen date. Jobs shown are &quot;We deliver&quot; and &quot;We collect (from site)&quot; (configured in Management → Customer Pref). Filter by delivery location, then drag jobs onto lorries. Use &quot;Backload&quot; to mark a reload run; when a truck is over capacity you can &quot;Mark as backload&quot; for the whole load.
        </p>

        <section className="management-section deliveries-board-filter">
          <form className="management-create-form" onSubmit={(e) => e.preventDefault()}>
            <label>
              Transport date
              <input
                type="date"
                className="management-select"
                value={transportDate}
                onChange={(e) => setTransportDate(e.target.value)}
                aria-label="Plan transport for this date"
              />
            </label>
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
            <button
              type="button"
              className="management-btn management-btn-small"
              onClick={handleBackfillPallets}
              disabled={backfilling}
              title="Recompute pallets from backoffice data for all consignments with missing pallets"
            >
              {backfilling ? "Backfilling…" : "Backfill pallets"}
            </button>
          </form>
        </section>
        {backfillResult != null && (
          <div className="management-muted" role="status">
            <p>
              Backfill: {backfillResult.updated} updated, {backfillResult.noRawJson} had no backoffice data, {backfillResult.computeReturnedNull} could not compute.
            </p>
            {backfillResult.sampleRowKeys != null && backfillResult.sampleRowKeys.length > 0 && (
              <details style={{ marginTop: 8 }}>
                <summary>Sample backoffice column names (from one uncomputed row)</summary>
                <pre style={{ fontSize: "0.75rem", marginTop: 4, overflow: "auto", maxHeight: 200 }}>
                  {backfillResult.sampleRowKeys.join(", ")}
                </pre>
                {backfillResult.sampleRow != null && (
                  <pre style={{ fontSize: "0.7rem", marginTop: 4, overflow: "auto", maxHeight: 160 }}>
                    {Object.entries(backfillResult.sampleRow)
                      .map(([k, v]) => `${k}: ${v === "" ? "(empty)" : v}`)
                      .join("\n")}
                  </pre>
                )}
              </details>
            )}
            <p style={{ marginTop: 4 }}>Refresh the page to see changes.</p>
          </div>
        )}

        {loading ? (
          <p className="management-loading">Loading deliveries…</p>
        ) : (
          <DndContext
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <div
              className="deliveries-two-column-board"
              data-drag-active={activeDragData != null ? "true" : "false"}
            >
              <UnassignedDeliveriesPanel
                unassigned={unassigned}
                loading={loading}
                selectedIds={selectedUnassignedIds}
                onToggleSelect={toggleSelection}
                onSelectRange={setSelectionRange}
                deliveryLocations={deliveryLocations}
                customerLocationMap={customerLocationMap}
                onChangeDeliveryLocation={async (consignmentId, deliveryLocationId) => {
                  try {
                    await apiPost(`/api/consignments/${consignmentId}/delivery-location`, { deliveryLocationId });
                    await refreshData();
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Failed to update delivery location");
                  }
                }}
              />
              <LorriesBoard lorries={lorries} activeDragData={activeDragDataForBoard} onUnassign={handleUnassign} deliveryLocations={deliveryLocations} transportDate={transportDate} onToggleReload={handleToggleReload} onMarkLorryAsBackload={handleMarkLorryAsBackload} />
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
