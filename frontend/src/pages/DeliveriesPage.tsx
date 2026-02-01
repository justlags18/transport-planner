import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { apiGet, apiPost } from "../api/client";
import { LorryBoard } from "../components/LorryBoard";
import { DeliveryJobCard, type DeliveryJobConsignment } from "../components/DeliveryJobCard";
import type { LorryDTO } from "./Planner";

type ConsignmentResponse = { items: DeliveryJobConsignment[] };
type DeliveryLocationDTO = { id: string; displayName: string; destinationKey: string | null; notes: string | null };
type DeliveryLocationsResponse = { ok: boolean; locations: DeliveryLocationDTO[] };

export const DeliveriesPage = () => {
  const [consignments, setConsignments] = useState<DeliveryJobConsignment[]>([]);
  const [lorries, setLorries] = useState<LorryDTO[]>([]);
  const [deliveryLocations, setDeliveryLocations] = useState<DeliveryLocationDTO[]>([]);
  const [deliveryLocationFilter, setDeliveryLocationFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refreshInFlight = useRef(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

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

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over) return;

      const activeType = active.data.current?.type as string | undefined;
      const overType = over.data.current?.type as string | undefined;

      if (activeType === "consignment" && overType === "lorry") {
        const consignmentId = active.data.current?.consignmentId as string | undefined;
        const lorryId = over.data.current?.lorryId as string | undefined;
        if (!consignmentId || !lorryId) return;
        await apiPost("/api/assignments/assign", { consignmentId, lorryId });
        await refreshData();
        return;
      }

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
        await apiPost("/api/assignments/reorder", { lorryId, orderedConsignmentIds });
        await refreshData();
      }
    },
    [lorries, refreshData],
  );

  return (
    <>
      <h2 className="dashboard-page-title">Deliveries</h2>
      <div className="dashboard-page-content">
        {error ? (
          <div className="management-error" role="alert">
            {error}
          </div>
        ) : null}

        {loading ? (
          <p className="management-loading">Loading deliveries…</p>
        ) : (
          <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
            <p className="management-intro">
              Jobs shown are &quot;We deliver&quot; only (configured in Management → Customer Pref). Filter by delivery location, then drag jobs onto lorries.
            </p>

            <section className="management-section">
              <h3 className="management-section-title">Filter</h3>
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

            <section className="management-section">
              <h3 className="management-section-title">Unassigned jobs</h3>
              {unassigned.length === 0 ? (
                <p className="management-muted">No unassigned jobs. Change the filter or assign jobs from Consignments.</p>
              ) : (
                <div className="deliveries-job-grid">
                  {unassigned.map((consignment) => (
                    <DeliveryJobCard
                      key={consignment.id}
                      consignment={consignment}
                      draggableId={`consignment:${consignment.id}`}
                    />
                  ))}
                </div>
              )}
            </section>

            <section className="management-section">
              <h3 className="management-section-title">Lorries</h3>
              {lorries.length === 0 ? (
                <p className="management-muted">No lorries. Add trucks in Fleet or Management.</p>
              ) : (
                <LorryBoard lorries={lorries} variant="fleet-grid" />
              )}
            </section>
          </DndContext>
        )}
      </div>
    </>
  );
};
