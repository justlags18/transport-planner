import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { AssignmentDTO, LorryDTO } from "../pages/Planner";
import { TrailerFill } from "./TrailerFill";

type LorryBoardProps = {
  lorries: LorryDTO[];
};

export const LorryBoard = ({ lorries }: LorryBoardProps) => {
  return (
    <div className="lorry-board">
      {lorries.map((lorry) => (
        <LorryColumn key={lorry.id} lorry={lorry} />
      ))}
    </div>
  );
};

type LorryColumnProps = {
  lorry: LorryDTO;
};

const LorryColumn = ({ lorry }: LorryColumnProps) => {
  const { setNodeRef, isOver } = useDroppable({
    id: `lorry:${lorry.id}`,
    data: {
      type: "lorry",
      lorryId: lorry.id,
    },
  });

  return (
    <section ref={setNodeRef} className="lorry" data-active={isOver ? "true" : "false"}>
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

      {isOver ? <div className="lorry-drop-indicator">Drop consignment here</div> : null}

      {lorry.assignments.length === 0 ? (
        <div className="empty-state">No assignments</div>
      ) : (
        <SortableContext
          items={lorry.assignments.map((assignment) => `assignment:${assignment.id}`)}
          strategy={verticalListSortingStrategy}
        >
          <div className="card-list">
            {lorry.assignments.map((assignment) => (
              <AssignmentCard key={assignment.id} assignment={assignment} lorryId={lorry.id} />
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
};

const AssignmentCard = ({ assignment, lorryId }: AssignmentCardProps) => {
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
      className="card card-compact"
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
