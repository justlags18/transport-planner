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
  weightFromSite: number | null;
  lastSeenAt: string;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type DeliveryJobCardProps = {
  consignment: DeliveryJobConsignment;
  draggableId: string;
  /** "card" = default card; "list" = compact row for UnassignedDeliveriesPanel list */
  variant?: "card" | "list";
};

const awbDisplay = (mawb: string | null, hawb: string | null) => {
  if (mawb?.trim()) return mawb.trim();
  if (hawb?.trim()) return hawb.trim();
  return "—";
};

export const DeliveryJobCard = ({ consignment, draggableId, variant = "card" }: DeliveryJobCardProps) => {
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

  const isList = variant === "list";

  return (
    <article
      ref={setNodeRef}
      className={`card card-consignment delivery-job-card${isList ? " delivery-job-card--list" : ""}`}
      style={style}
      data-dragging={isDragging ? "true" : "false"}
      {...attributes}
      {...listeners}
    >
      {isList ? (
        <>
          <div className="delivery-job-card-row delivery-job-card-meta">
            <span className="delivery-job-label">Job</span>
            <span className="delivery-job-value">{consignment.id}</span>
            <span className="delivery-job-value delivery-job-awb">{awbDisplay(consignment.mawbRaw, consignment.hawbRaw)}</span>
          </div>
          <div className="delivery-job-card-row delivery-job-card-meta">
            <span className="delivery-job-label">Client</span>
            <span className="delivery-job-value">{consignment.customerNameRaw ?? "—"}</span>
            <span className="delivery-job-muted">ETA: {consignment.etaIso ?? "TBC"} · {consignment.palletsFromSite ?? "—"} pallets</span>
          </div>
        </>
      ) : (
        <>
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
        </>
      )}
    </article>
  );
};
