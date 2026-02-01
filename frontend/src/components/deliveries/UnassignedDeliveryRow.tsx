import { memo } from "react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { DeliveryJobConsignment } from "../DeliveryJobCard";

type UnassignedDeliveryRowProps = {
  consignment: DeliveryJobConsignment;
  draggableId: string;
  index?: number;
  isSelected?: boolean;
  onToggle?: (id: string, shiftKey: boolean, index: number) => void;
};

/** ETA string to time-only display (e.g. "14:30") or date+time. */
function formatEtaTime(etaIso: string | null): string {
  if (!etaIso?.trim()) return "—";
  const d = new Date(etaIso);
  if (Number.isNaN(d.getTime())) return etaIso;
  const timeMatch = etaIso.match(/\T(\d{1,2}):(\d{2})/);
  if (timeMatch) return `${timeMatch[1].padStart(2, "0")}:${timeMatch[2]}`;
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

/** Delivery location: prefer short key (LGW, STN) or first part of destinationRaw. */
function deliveryLocationDisplay(destinationKey: string | null, destinationRaw: string | null): string {
  if (destinationKey?.trim()) {
    const k = destinationKey.trim().toUpperCase();
    if (k.length <= 6) return k;
  }
  if (destinationRaw?.trim()) {
    const r = destinationRaw.trim();
    return r.length > 12 ? r.slice(0, 12) + "…" : r;
  }
  return "—";
}

const UnassignedDeliveryRowInner = ({
  consignment,
  draggableId,
  index = 0,
  isSelected = false,
  onToggle,
}: UnassignedDeliveryRowProps) => {
  const palletsForDrag = consignment.palletsFromSite ?? 0;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: draggableId,
    data: {
      type: "consignment",
      consignmentId: consignment.id,
      jobId: consignment.id,
      pallets: palletsForDrag,
    },
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.7 : 1,
  };

  const pallets = consignment.palletsFromSite ?? 0;
  const missingPallets = pallets === 0;

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggle?.(consignment.id, e.shiftKey, index);
  };

  const handleCheckboxPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
  };

  const handleCheckboxKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      onToggle?.(consignment.id, e.shiftKey, index);
    }
  };

  return (
    <div
      ref={setNodeRef}
      className={`unassigned-delivery-row${onToggle ? " unassigned-delivery-row--with-checkbox" : ""}${isSelected ? " unassigned-delivery-row--selected" : ""}`}
      style={style}
      data-dragging={isDragging ? "true" : "false"}
      data-selected={isSelected ? "true" : "false"}
      {...attributes}
      {...listeners}
    >
      {onToggle ? (
        <span
          className="unassigned-delivery-row-checkbox-wrap"
          onClick={handleCheckboxClick}
          onPointerDown={handleCheckboxPointerDown}
          onKeyDown={handleCheckboxKeyDown}
          role="button"
          tabIndex={0}
          aria-label={isSelected ? "Deselect job" : "Select job"}
          aria-pressed={isSelected}
        >
          <input
            type="checkbox"
            className="unassigned-delivery-row-checkbox"
            checked={isSelected}
            readOnly
            tabIndex={-1}
            aria-hidden
          />
        </span>
      ) : null}
      <span className="unassigned-delivery-row-job">{consignment.id}</span>
      <span className="unassigned-delivery-row-client">{consignment.customerNameRaw ?? "—"}</span>
      <span className="unassigned-delivery-row-location">
        {deliveryLocationDisplay(consignment.destinationKey, consignment.destinationRaw)}
      </span>
      <span className="unassigned-delivery-row-eta">{formatEtaTime(consignment.etaIso)}</span>
      <span className="unassigned-delivery-row-pallets">
        {missingPallets ? (
          <span className="unassigned-delivery-row-pallets-warning" title="Missing or zero pallets">
            <span className="unassigned-delivery-row-warning-icon" aria-hidden>⚠</span>
            <span>—</span>
          </span>
        ) : (
          <span>{pallets}</span>
        )}
      </span>
    </div>
  );
};

/** Memoized row for virtual list – re-renders only when consignment or draggableId change. Stable drag ID: consignment:${consignment.id}. */
export const UnassignedDeliveryRow = memo(UnassignedDeliveryRowInner);
