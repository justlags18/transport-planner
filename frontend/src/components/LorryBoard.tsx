import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { AssignmentDTO, LorryDTO } from "../pages/Planner";
import { TrailerFill } from "./TrailerFill";

type LorryBoardProps = {
  lorries: LorryDTO[];
  /** When "fleet-grid", render in a grid of fleet-style cards (e.g. Deliveries page). */
  variant?: "default" | "fleet-grid";
};

export const LorryBoard = ({ lorries, variant = "default" }: LorryBoardProps) => {
  const wrapperClass = variant === "fleet-grid" ? "fleet-grid deliveries-lorry-grid" : "lorry-board";
  return (
    <div className={wrapperClass}>
      {lorries.map((lorry) => (
        <LorryColumn key={lorry.id} lorry={lorry} variant={variant} />
      ))}
    </div>
  );
};

type LorryColumnProps = {
  lorry: LorryDTO;
  variant?: "default" | "fleet-grid";
};

const LorryColumn = ({ lorry, variant = "default" }: LorryColumnProps) => {
  const { setNodeRef, isOver } = useDroppable({
    id: `lorry:${lorry.id}`,
    data: {
      type: "lorry",
      lorryId: lorry.id,
    },
  });

  const status = lorry.status ?? "on";
  const statusLabel = status === "on" ? "ON ROAD" : status === "service" ? "SERVICE" : "OFF ROAD";
  const used = lorry.usedPallets ?? 0;
  const capacity = Math.max(lorry.capacityPallets, 1);
  const percent = Math.min(100, Math.round((used / capacity) * 100));
  const isFleetCard = variant === "fleet-grid";

  return (
    <section
      ref={setNodeRef}
      className={isFleetCard ? "lorry fleet-card deliveries-lorry-card" : "lorry"}
      data-active={isOver ? "true" : "false"}
    >
      {isFleetCard ? (
        <>
          <div className="fleet-card-header">
            <h3 className="fleet-card-title">{lorry.name}</h3>
            <span className={`fleet-card-status ${status}`}>{statusLabel}</span>
          </div>
          <div className="fleet-card-status-row">
            <span className="fleet-card-badge">{lorry.assignments.length} stops</span>
          </div>
          <div className="fleet-card-meta">
            <span>Capacity</span>
            <span>{capacity}</span>
          </div>
          <div className="fleet-card-meta">
            <span>Used</span>
            <span>{used}</span>
          </div>
          <div className="fleet-card-bar">
            <div className="fleet-card-bar-fill" style={{ width: `${percent}%` }} />
          </div>
          <div className="fleet-card-footnote">{used} / {capacity} slots</div>
        </>
      ) : (
        <>
          <div className="lorry-header">
            <div>
              <div className="lorry-name">{lorry.name}</div>
              <div className="lorry-meta">
                Capacity {lorry.usedPallets} / {lorry.capacityPallets}
              </div>
            </div>
            <div className="lorry-status">
              <TrailerFill usedPallets={lorry.usedPallets} capacityPallets={lorry.capacityPallets} />
              <span className="lorry-count">{lorry.assignments.length} stops</span>
            </div>
          </div>
        </>
      )}

      {isOver ? <div className="lorry-drop-indicator">Drop job here</div> : null}

      {lorry.assignments.length === 0 ? (
        <div className="empty-state">No jobs assigned</div>
      ) : (
        <SortableContext
          items={lorry.assignments.map((assignment) => `assignment:${assignment.id}`)}
          strategy={verticalListSortingStrategy}
        >
          <div className={isFleetCard ? "deliveries-lorry-card-list" : "card-list"}>
            {lorry.assignments.map((assignment) => (
              <AssignmentCard key={assignment.id} assignment={assignment} lorryId={lorry.id} compact={isFleetCard} />
            ))}
          </div>
        </SortableContext>
      )}
    </section>
  );
};

type AssignmentCardProps = {
  assignment: AssignmentDTO;
  lorryId: string;
  compact?: boolean;
};

const AssignmentCard = ({ assignment, lorryId, compact }: AssignmentCardProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `assignment:${assignment.id}`,
    data: {
      type: "assignment",
      lorryId,
      consignmentId: assignment.consignmentId,
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <article
      ref={setNodeRef}
      className={compact ? "card card-compact assignment-card-compact" : "card card-compact"}
      style={style}
      data-dragging={isDragging ? "true" : "false"}
    >
      <div className="card-header">
        <button className="drag-handle" type="button" {...attributes} {...listeners}>
          ⋮⋮
        </button>
        <div>
          <div className="card-title">
            {assignment.consignment.customerNameRaw ?? "Unknown customer"}
          </div>
          <div className="card-subtitle">
            {assignment.consignment.destinationRaw ?? "Unknown destination"}
          </div>
        </div>
      </div>
      <div className="card-meta">
        <span>ETA: {assignment.consignment.etaIso ?? "TBC"}</span>
        <span>Pallets: {assignment.effectivePallets}</span>
      </div>
    </article>
  );
};
