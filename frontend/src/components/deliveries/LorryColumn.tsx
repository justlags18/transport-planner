import { memo, useMemo } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { AssignmentDTO, LorryDTO } from "../../pages/Planner";

type DeliveryLocationInfo = { id: string; displayName: string };

/** Group assignments by delivery location. Returns array of groups with header info. */
function groupAssignmentsByLocation(
  assignments: AssignmentDTO[],
  deliveryLocations: DeliveryLocationInfo[]
): Array<{ locationId: string; locationName: string; assignments: AssignmentDTO[] }> {
  const locationMap = new Map(deliveryLocations.map((l) => [l.id, l.displayName]));
  const groups = new Map<string, AssignmentDTO[]>();
  
  for (const assignment of assignments) {
    const c = assignment.consignment;
    // Use deliveryLocationId if set, otherwise fall back to destinationKey or "unknown"
    const locationId = (c as any).deliveryLocationId || c.destinationKey || "unknown";
    if (!groups.has(locationId)) {
      groups.set(locationId, []);
    }
    groups.get(locationId)!.push(assignment);
  }
  
  // Convert to array with location names
  const result: Array<{ locationId: string; locationName: string; assignments: AssignmentDTO[] }> = [];
  for (const [locationId, groupAssignments] of groups) {
    // Get display name: from deliveryLocations map, or fall back to destinationRaw, or the ID itself
    let locationName = locationMap.get(locationId);
    if (!locationName && groupAssignments.length > 0) {
      const c = groupAssignments[0].consignment;
      locationName = c.destinationRaw?.trim() || c.destinationKey?.trim() || "Unknown Location";
    }
    result.push({
      locationId,
      locationName: locationName || locationId,
      assignments: groupAssignments,
    });
  }
  
  return result;
}

export type ActiveDragData = { pallets: number; weight?: number } | null;

const CAPACITY_GREEN = 70;
const CAPACITY_AMBER = 90;

function capacityBarColorClass(percent: number): "green" | "amber" | "red" {
  if (percent < CAPACITY_GREEN) return "green";
  if (percent <= CAPACITY_AMBER) return "amber";
  return "red";
}

type LorryColumnProps = {
  lorry: LorryDTO;
  activeDragData?: ActiveDragData;
  /** Pallets to count when dragged job has missing/zero pallets (for preview and overflow check). */
  missingPalletsFallback?: number;
  /** Called when a job is removed from this lorry (returns to unassigned). */
  onUnassign?: (consignmentId: string) => void;
  /** Delivery locations for grouping headers. */
  deliveryLocations?: DeliveryLocationInfo[];
  /** Transport/plan date (YYYY-MM-DD) – used to show "Reload" on jobs from previous day. */
  transportDate?: string;
  /** Toggle reload/backload flag for an assignment. */
  onToggleReload?: (assignmentId: string, isReload: boolean) => void;
  /** Mark all assignments on this lorry as backload. */
  onMarkLorryAsBackload?: (lorryId: string) => void;
  /** Lorry ID for which "second run" mode is active (new drops count as reload). */
  lorryIdInReloadMode?: string | null;
  /** Call when user clicks "Coming back for second run" (lorryId) or "Cancel second run" (null). */
  onStartSecondRun?: (lorryId: string | null) => void;
};

const PLACEHOLDER_SLOT_COUNT = 4;

const LorryColumnInner = memo(({ lorry, activeDragData = null, missingPalletsFallback = 1, onUnassign, deliveryLocations = [], transportDate = "", onToggleReload, onMarkLorryAsBackload, lorryIdInReloadMode = null, onStartSecondRun }: LorryColumnProps) => {
  const { setNodeRef, isOver } = useDroppable({
    id: `lorry:${lorry.id}`,
    data: {
      type: "lorry",
      lorryId: lorry.id,
    },
  });

  const capacity = Math.max(lorry.capacityPallets, 1);
  const capacityWeightKg = lorry.capacityWeightKg ?? 24_000;
  const isInReloadMode = lorryIdInReloadMode === lorry.id;

  // Split by run: first run (isReload false) vs second run / reload (isReload true)
  const run1Assignments = lorry.assignments.filter((a) => !(a as { isReload?: boolean }).isReload);
  const run2Assignments = lorry.assignments.filter((a) => (a as { isReload?: boolean }).isReload);
  const usedPallets1 = run1Assignments.reduce((s, a) => s + a.effectivePallets, 0);
  const usedWeight1 = run1Assignments.reduce((s, a) => s + (a.effectiveWeight ?? 0), 0);
  const usedPallets2 = run2Assignments.reduce((s, a) => s + a.effectivePallets, 0);
  const usedWeight2 = run2Assignments.reduce((s, a) => s + (a.effectiveWeight ?? 0), 0);
  const used = lorry.usedPallets ?? 0;
  const usedWeight = lorry.usedWeight ?? 0;

  const draggedPallets = activeDragData != null ? (activeDragData.pallets > 0 ? activeDragData.pallets : missingPalletsFallback) : 0;
  const draggedWeight = activeDragData?.weight ?? 0;
  const addToRun2 = isOver && isInReloadMode && activeDragData != null;
  const previewPallets1 = addToRun2 ? usedPallets1 : (isOver && activeDragData != null ? usedPallets1 + draggedPallets : usedPallets1);
  const previewWeight1 = addToRun2 ? usedWeight1 : (isOver && activeDragData != null ? usedWeight1 + draggedWeight : usedWeight1);
  const previewPallets2 = addToRun2 ? usedPallets2 + draggedPallets : usedPallets2;
  const previewWeight2 = addToRun2 ? usedWeight2 + draggedWeight : usedWeight2;

  const percent1 = (usedPallets1 / capacity) * 100;
  const barColor1 = capacityBarColorClass(percent1);
  const previewPercent1 = (previewPallets1 / capacity) * 100;
  const previewBarColor1 = capacityBarColorClass(Math.min(100, previewPercent1));
  const weightPercent1 = capacityWeightKg > 0 ? (usedWeight1 / capacityWeightKg) * 100 : 0;
  const weightBarColor1 = capacityBarColorClass(weightPercent1);
  const previewWeightPercent1 = capacityWeightKg > 0 ? Math.min(100, (previewWeight1 / capacityWeightKg) * 100) : 0;
  const previewWeightBarColor1 = capacityBarColorClass(previewWeightPercent1);

  const percent2 = (usedPallets2 / capacity) * 100;
  const barColor2 = capacityBarColorClass(percent2);
  const previewPercent2 = (previewPallets2 / capacity) * 100;
  const previewBarColor2 = capacityBarColorClass(Math.min(100, previewPercent2));
  const weightPercent2 = capacityWeightKg > 0 ? (usedWeight2 / capacityWeightKg) * 100 : 0;
  const weightBarColor2 = capacityBarColorClass(weightPercent2);
  const previewWeightPercent2 = capacityWeightKg > 0 ? Math.min(100, (previewWeight2 / capacityWeightKg) * 100) : 0;
  const previewWeightBarColor2 = capacityBarColorClass(previewWeightPercent2);

  const overCapacityRun1 = usedPallets1 > capacity || usedWeight1 > capacityWeightKg;
  const overCapacityRun2 = usedPallets2 > capacity || usedWeight2 > capacityWeightKg;
  const wouldExceedRun1 = isOver && !addToRun2 && activeDragData != null && (previewPallets1 > capacity || previewWeight1 > capacityWeightKg);
  const wouldExceedRun2 = isOver && addToRun2 && activeDragData != null && (previewPallets2 > capacity || previewWeight2 > capacityWeightKg);
  const invalidDrop = wouldExceedRun1 || wouldExceedRun2;
  const showPreview = isOver && activeDragData != null;
  const overCapacity = used > capacity;
  const showBackloadButton = used > 26 && onMarkLorryAsBackload && lorry.assignments.length > 0;
  const run1PalletsPercent = capacity > 0 ? (usedPallets1 / capacity) * 100 : 0;
  const run1WeightPercent = capacityWeightKg > 0 ? (usedWeight1 / capacityWeightKg) * 100 : 0;
  const run1At80Percent = run1PalletsPercent >= 80 || run1WeightPercent >= 80;
  const showSecondRunButton = onStartSecondRun && lorry.assignments.length > 0 && !isInReloadMode && run1At80Percent;
  const isDragActive = activeDragData != null;
  const isEmpty = lorry.assignments.length === 0;

  const status = lorry.status ?? "on";
  const statusLabel = status === "on" ? "ON ROAD" : "IDLE";

  // Group assignments by delivery location
  const groupedAssignments = useMemo(
    () => groupAssignmentsByLocation(lorry.assignments, deliveryLocations),
    [lorry.assignments, deliveryLocations]
  );

  return (
    <section
      ref={setNodeRef}
      className={`lorries-board-column${invalidDrop ? " lorries-board-column--invalid-drop" : ""}${isDragActive ? " lorries-board-column--drag-active" : ""}`}
      data-active={isOver ? "true" : "false"}
      data-over-capacity={overCapacity ? "true" : "false"}
      data-invalid-drop={invalidDrop ? "true" : "false"}
      data-empty={isEmpty ? "true" : "false"}
      aria-label={`Lorry ${lorry.name}`}
    >
      <header className="lorries-board-column-header">
        <h3 className="lorries-board-column-title">{lorry.name}</h3>
        <span className={`lorries-board-column-status-badge lorries-board-column-status-badge--${status === "on" ? "on-road" : "idle"}`}>
          {statusLabel}
        </span>
      </header>

      <div className="lorries-board-column-capacity-section">
        {/* Run 1 */}
        <div className="lorries-board-column-run-header">Run 1</div>
        <div className="lorries-board-column-capacity">
          <span className="lorries-board-column-capacity-text">
            {usedPallets1} / {capacity} pallets
          </span>
          {showPreview && !addToRun2 && (
            <span className="lorries-board-column-capacity-preview" title={wouldExceedRun1 ? "Over capacity" : undefined}>
              → {previewPallets1} (preview)
            </span>
          )}
        </div>
        <div className="lorries-board-column-bar-wrap" title={overCapacityRun1 ? "Over capacity" : undefined}>
          <div className="lorries-board-column-bar" role="progressbar" aria-valuenow={usedPallets1} aria-valuemin={0} aria-valuemax={capacity} aria-label="Run 1 pallets">
            <div
              className={`lorries-board-column-bar-fill lorries-board-column-bar-fill--${showPreview && !addToRun2 ? previewBarColor1 : barColor1}`}
              style={{ width: `${Math.min(100, (showPreview && !addToRun2 ? previewPallets1 / capacity : usedPallets1 / capacity) * 100)}%` }}
            />
          </div>
        </div>
        <div className="lorries-board-column-capacity lorries-board-column-capacity--weight">
          <span className="lorries-board-column-capacity-text">
            {usedWeight1.toLocaleString()} / {capacityWeightKg.toLocaleString()} kg
          </span>
          {showPreview && !addToRun2 && (
            <span className="lorries-board-column-capacity-preview" title={wouldExceedRun1 ? "Over weight" : undefined}>
              → {previewWeight1.toLocaleString()} (preview)
            </span>
          )}
        </div>
        <div className="lorries-board-column-bar-wrap">
          <div className="lorries-board-column-bar" role="progressbar" aria-valuenow={usedWeight1} aria-valuemin={0} aria-valuemax={capacityWeightKg} aria-label="Run 1 weight">
            <div
              className={`lorries-board-column-bar-fill lorries-board-column-bar-fill--${showPreview && !addToRun2 ? previewWeightBarColor1 : weightBarColor1}`}
              style={{ width: `${Math.min(100, (showPreview && !addToRun2 ? previewWeight1 / capacityWeightKg : usedWeight1 / capacityWeightKg) * 100)}%` }}
            />
          </div>
        </div>

        {/* Run 2 (reload) */}
        <div className="lorries-board-column-run-header lorries-board-column-run-header--reload">
          Run 2 (reload){isInReloadMode ? " — adding here" : ""}
        </div>
        <div className="lorries-board-column-capacity">
          <span className="lorries-board-column-capacity-text">
            {usedPallets2} / {capacity} pallets
          </span>
          {showPreview && addToRun2 && (
            <span className="lorries-board-column-capacity-preview" title={wouldExceedRun2 ? "Over capacity" : undefined}>
              → {previewPallets2} (preview)
            </span>
          )}
        </div>
        <div className="lorries-board-column-bar-wrap" title={overCapacityRun2 ? "Over capacity" : undefined}>
          <div className="lorries-board-column-bar" role="progressbar" aria-valuenow={usedPallets2} aria-valuemin={0} aria-valuemax={capacity} aria-label="Run 2 pallets">
            <div
              className={`lorries-board-column-bar-fill lorries-board-column-bar-fill--${showPreview && addToRun2 ? previewBarColor2 : barColor2}`}
              style={{ width: `${Math.min(100, (showPreview && addToRun2 ? previewPallets2 / capacity : usedPallets2 / capacity) * 100)}%` }}
            />
          </div>
        </div>
        <div className="lorries-board-column-capacity lorries-board-column-capacity--weight">
          <span className="lorries-board-column-capacity-text">
            {usedWeight2.toLocaleString()} / {capacityWeightKg.toLocaleString()} kg
          </span>
          {showPreview && addToRun2 && (
            <span className="lorries-board-column-capacity-preview" title={wouldExceedRun2 ? "Over weight" : undefined}>
              → {previewWeight2.toLocaleString()} (preview)
            </span>
          )}
        </div>
        <div className="lorries-board-column-bar-wrap">
          <div className="lorries-board-column-bar" role="progressbar" aria-valuenow={usedWeight2} aria-valuemin={0} aria-valuemax={capacityWeightKg} aria-label="Run 2 weight">
            <div
              className={`lorries-board-column-bar-fill lorries-board-column-bar-fill--${showPreview && addToRun2 ? previewWeightBarColor2 : weightBarColor2}`}
              style={{ width: `${Math.min(100, (showPreview && addToRun2 ? previewWeight2 / capacityWeightKg : usedWeight2 / capacityWeightKg) * 100)}%` }}
            />
          </div>
        </div>

        {showSecondRunButton && (
          <button
            type="button"
            className="lorries-board-column-second-run-btn"
            onClick={(e) => {
              e.stopPropagation();
              onStartSecondRun?.(lorry.id);
            }}
            title="Truck is coming back for a second run; next jobs dropped here will count as reload"
          >
            Coming back for second run
          </button>
        )}
        {isInReloadMode && (
          <>
            <span className="lorries-board-column-reload-mode-badge" role="status">Second run — drop jobs here</span>
            <button
              type="button"
              className="lorries-board-column-backload-btn lorries-board-column-cancel-second-run-btn"
              onClick={(e) => {
                e.stopPropagation();
                onStartSecondRun?.(null);
              }}
              title="Cancel second run; next jobs will count as first run"
            >
              Cancel second run
            </button>
          </>
        )}
        {showBackloadButton && (
          <button
            type="button"
            className="lorries-board-column-backload-btn"
            onClick={(e) => {
              e.stopPropagation();
              onMarkLorryAsBackload(lorry.id);
            }}
            title="Mark all jobs on this truck as backload/reload"
          >
            Mark as backload
          </button>
        )}
      </div>

      <div className="lorries-board-column-dropzone">
        {isOver ? (
          <div className="lorries-board-column-drop-indicator">Drop here</div>
        ) : isEmpty ? (
          <div className="lorries-board-column-empty-state">
            <span className="lorries-board-column-empty-icon" aria-hidden>↓</span>
            <span className="lorries-board-column-empty-text">Drag deliveries here</span>
            <div className="lorries-board-column-placeholders" aria-hidden>
              {Array.from({ length: PLACEHOLDER_SLOT_COUNT }, (_, i) => (
                <div key={i} className="lorries-board-column-placeholder-slot" />
              ))}
            </div>
          </div>
        ) : (
          <SortableContext
            items={lorry.assignments.map((a) => `assignment:${a.id}`)}
            strategy={verticalListSortingStrategy}
          >
            <div className="lorries-board-column-list">
              {groupedAssignments.map((group) => (
                <div key={group.locationId} className="lorries-board-location-group">
                  <div className="lorries-board-location-header">
                    <span className="lorries-board-location-header-icon" aria-hidden>📍</span>
                    <span className="lorries-board-location-header-name">{group.locationName}</span>
                    <span className="lorries-board-location-header-count">
                      {group.assignments.length} job{group.assignments.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  {group.assignments.map((assignment) => (
                    <AssignmentRow
                      key={assignment.id}
                      assignment={assignment}
                      lorryId={lorry.id}
                      showMissingPalletsChip
                      onUnassign={onUnassign}
                      transportDate={transportDate}
                      onToggleReload={onToggleReload}
                    />
                  ))}
                </div>
              ))}
            </div>
          </SortableContext>
        )}
      </div>
    </section>
  );
});

LorryColumnInner.displayName = "LorryColumn";

/** Memoized so column doesn't re-render when sibling columns or left panel scroll; stable droppable ID: lorry:${lorry.id}. */
export const LorryColumn = LorryColumnInner;

type AssignmentRowProps = {
  assignment: AssignmentDTO;
  lorryId: string;
  showMissingPalletsChip?: boolean;
  onUnassign?: (consignmentId: string) => void;
  /** Transport/plan date (YYYY-MM-DD) – if job date is before this, show "Reload" badge. */
  transportDate?: string;
  /** Toggle manual "Reload/backload" flag for this assignment. */
  onToggleReload?: (assignmentId: string, isReload: boolean) => void;
};

function awbDisplay(mawb: string | null | undefined, hawb: string | null | undefined): string {
  if (mawb?.trim()) return mawb.trim();
  if (hawb?.trim()) return hawb.trim();
  return "—";
}

function isJobBeforeTransportDate(etaIso: string | null | undefined, transportDate: string): boolean {
  if (!transportDate?.trim() || !etaIso?.trim()) return false;
  const jobDate = etaIso.slice(0, 10);
  return jobDate < transportDate;
}

const AssignmentRow = ({ assignment, lorryId, showMissingPalletsChip = false, onUnassign, transportDate = "", onToggleReload }: AssignmentRowProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `assignment:${assignment.id}`,
    data: {
      type: "assignment",
      lorryId,
      consignmentId: assignment.consignmentId,
      jobId: assignment.consignment.id,
      pallets: assignment.effectivePallets,
      weight: assignment.effectiveWeight ?? 0,
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  const missingPallets = assignment.effectivePallets == null || assignment.effectivePallets === 0;
  const c = assignment.consignment;
  const deliveryLocation = c.destinationRaw?.trim() || c.destinationKey?.trim() || "Unknown location";
  const client = c.customerNameRaw?.trim() || "Unknown client";
  const jobId = c.id;
  const awb = awbDisplay(c.mawbRaw ?? null, c.hawbRaw ?? null);
  const deliveryType = (c as { deliveryType?: string }).deliveryType;
  const manualReload = (assignment as { isReload?: boolean }).isReload ?? false;
  const dateReload = transportDate ? isJobBeforeTransportDate(c.etaIso, transportDate) : false;
  const isReload = manualReload || dateReload;

  return (
    <article
      ref={setNodeRef}
      className="card card-compact lorries-board-assignment"
      style={style}
      data-dragging={isDragging ? "true" : "false"}
      data-missing-pallets={missingPallets ? "true" : "false"}
    >
      <div className="card-header">
        <button className="drag-handle" type="button" aria-label="Drag to reorder" {...attributes} {...listeners}>
          ⋮⋮
        </button>
        <div>
          <div className="lorries-board-assignment-badges">
            {isReload && (
              <span className="lorries-board-assignment-badge lorries-board-assignment-badge--reload" title={manualReload ? "Marked as backload/reload" : "Job from previous day – reload on this truck"}>
                Reload
              </span>
            )}
            {onToggleReload && (
              <button
                type="button"
                className={`lorries-board-assignment-reload-toggle${manualReload ? " lorries-board-assignment-reload-toggle--on" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleReload(assignment.id, !manualReload);
                }}
                title={manualReload ? "Unmark as reload/backload" : "Mark as reload/backload"}
                aria-pressed={manualReload}
              >
                {manualReload ? "✓ Backload" : "Backload"}
              </button>
            )}
            {deliveryType === "self_collect" && (
              <span className="lorries-board-assignment-badge lorries-board-assignment-badge--customer-collect" title="Customer collects">
                Customer collects
              </span>
            )}
            {deliveryType === "collection" && (
              <span className="lorries-board-assignment-badge lorries-board-assignment-badge--collection" title="We collect from site">
                Collection
              </span>
            )}
            {deliveryType === "deliver" && (
              <span className="lorries-board-assignment-badge lorries-board-assignment-badge--delivery" title="We deliver">
                Delivery
              </span>
            )}
          </div>
          <div className="card-title lorries-board-assignment-client-line">
            <span className="lorries-board-assignment-customer">{client}</span>
            {` · Job ${jobId}${awb !== "—" ? ` · AWB ${awb}` : ""}`}
          </div>
        </div>
        {showMissingPalletsChip && missingPallets && (
          <span className="lorries-board-assignment-missing-chip" title="Missing or zero pallets – counted using fallback for capacity">
            Missing pallets
          </span>
        )}
        {onUnassign && (
          <button
            type="button"
            className="lorries-board-assignment-remove"
            aria-label="Remove job (return to unassigned)"
            title="Remove from lorry"
            onClick={(e) => {
              e.stopPropagation();
              onUnassign(assignment.consignmentId);
            }}
          >
            ×
          </button>
        )}
      </div>
      <div className="card-meta">
        <span>ETA: {assignment.consignment.etaIso ?? "TBC"}</span>
        <span>Pallets: {assignment.effectivePallets ?? "—"}</span>
      </div>
      <div className="lorries-board-assignment-location">
        {deliveryLocation}
      </div>
    </article>
  );
};
