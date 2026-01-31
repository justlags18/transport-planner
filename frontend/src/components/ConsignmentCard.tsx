import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { ConsignmentDTO } from "../pages/Planner";

type ConsignmentCardProps = {
  consignment: ConsignmentDTO;
  draggableId: string;
};

export const ConsignmentCard = ({ consignment, draggableId }: ConsignmentCardProps) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: draggableId,
    data: {
      type: "consignment",
      consignmentId: consignment.id,
    },
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <article
      ref={setNodeRef}
      className="card card-consignment"
      style={style}
      data-dragging={isDragging ? "true" : "false"}
      {...attributes}
      {...listeners}
    >
      <div className="card-row card-row-main">
        <div>
          <div className="card-title">{consignment.customerNameRaw ?? "Unknown customer"}</div>
          <div className="card-subtitle">{consignment.destinationRaw ?? "Unknown destination"}</div>
        </div>
        <span className="card-ref">{consignment.id}</span>
      </div>
      <div className="card-meta">
        <span>ETA: {consignment.etaIso ?? "TBC"}</span>
        <span>Pallets: {consignment.palletsFromSite ?? "-"}</span>
      </div>
      <div className="card-meta">
        <span>Status: {consignment.status ?? "Unknown"}</span>
      </div>
    </article>
  );
};
