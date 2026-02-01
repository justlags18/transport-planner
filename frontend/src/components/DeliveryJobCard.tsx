import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";

export type DeliveryJobConsignment = {
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

type DeliveryJobCardProps = {
  consignment: DeliveryJobConsignment;
  draggableId: string;
};

const awbDisplay = (mawb: string | null, hawb: string | null) => {
  if (mawb?.trim()) return mawb.trim();
  if (hawb?.trim()) return hawb.trim();
  return "—";
};

export const DeliveryJobCard = ({ consignment, draggableId }: DeliveryJobCardProps) => {
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
      className="card card-consignment delivery-job-card"
      style={style}
      data-dragging={isDragging ? "true" : "false"}
      {...attributes}
      {...listeners}
    >
      <div className="delivery-job-card-row delivery-job-card-meta">
        <span className="delivery-job-label">Job</span>
        <span className="delivery-job-value">{consignment.id}</span>
      </div>
      <div className="delivery-job-card-row delivery-job-card-meta">
        <span className="delivery-job-label">AWB</span>
        <span className="delivery-job-value">{awbDisplay(consignment.mawbRaw, consignment.hawbRaw)}</span>
      </div>
      <div className="delivery-job-card-row delivery-job-card-meta">
        <span className="delivery-job-label">Client</span>
        <span className="delivery-job-value">{consignment.customerNameRaw ?? "—"}</span>
      </div>
      <div className="delivery-job-card-row delivery-job-card-sub">
        <span>{consignment.destinationRaw ?? "—"}</span>
        <span>ETA: {consignment.etaIso ?? "TBC"}</span>
        <span>Pallets: {consignment.palletsFromSite ?? "—"}</span>
      </div>
    </article>
  );
};
