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

export type ActiveDragData = { pallets: number } | null;

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
};

const PLACEHOLDER_SLOT_COUNT = 4;

const LorryColumnInner = memo(({ lorry, activeDragData = null, missingPalletsFallback = 1, onUnassign, deliveryLocations = [] }: LorryColumnProps) => {
  const { setNodeRef, isOver } = useDroppable({
    id: `lorry:${lorry.id}`,
    data: {
      type: "lorry",
      lorryId: lorry.id,
    },
  });

  const used = lorry.usedPallets ?? 0;
  const capacity = Math.max(lorry.capacityPallets, 1);
  const percent = (used / capacity) * 100;
  const barColor = capacityBarColorClass(percent);
  const overCapacity = used > capacity;

  const draggedPallets = activeDragData != null ? (activeDragData.pallets > 0 ? activeDragData.pallets : missingPalletsFallback) : 0;
  const previewUsed = isOver && activeDragData != null ? used + draggedPallets : used;
  const previewPercent = (previewUsed / capacity) * 100;
  const previewBarColor = capacityBarColorClass(Math.min(100, previewPercent));
  const wouldExceedCapacity = isOver && activeDragData != null && previewUsed > capacity;
  const invalidDrop = wouldExceedCapacity;
  const showPreview = isOver && activeDragData != null;
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
        <div className="lorries-board-column-capacity">
          <span className="lorries-board-column-capacity-text">
            {used} / {capacity} pallets
          </span>
          {showPreview && (
            <span className="lorries-board-column-capacity-preview" title={wouldExceedCapacity ? "Over capacity" : undefined}>
              → {previewUsed} (preview)
            </span>
          )}
        </div>
        <div
          className="lorries-board-column-bar-wrap"
          title={wouldExceedCapacity ? "Over capacity" : undefined}
          aria-describedby={wouldExceedCapacity ? `lorry-${lorry.id}-overflow` : undefined}
        >
          <div className="lorries-board-column-bar" role="progressbar" aria-valuenow={used} aria-valuemin={0} aria-valuemax={capacity} aria-label="Capacity">
            <div
              className={`lorries-board-column-bar-fill lorries-board-column-bar-fill--${showPreview ? previewBarColor : barColor}`}
              style={{ width: `${Math.min(100, (showPreview ? previewUsed / capacity : used / capacity) * 100)}%` }}
            />
          </div>
          {wouldExceedCapacity && (
            <span id={`lorry-${lorry.id}-overflow`} className="lorries-board-column-overflow-tooltip" role="status">
              Over capacity
            </span>
          )}
        </div>
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
};

function awbDisplay(mawb: string | null | undefined, hawb: string | null | undefined): string {
  if (mawb?.trim()) return mawb.trim();
  if (hawb?.trim()) return hawb.trim();
  return "—";
}

const AssignmentRow = ({ assignment, lorryId, showMissingPalletsChip = false, onUnassign }: AssignmentRowProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `assignment:${assignment.id}`,
    data: {
      type: "assignment",
      lorryId,
      consignmentId: assignment.consignmentId,
      jobId: assignment.consignment.id,
      pallets: assignment.effectivePallets,
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
