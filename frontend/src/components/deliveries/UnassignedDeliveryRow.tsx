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
  deliveryLocations?: Array<{ id: string; displayName: string }>;
  customerLocationMap?: Record<string, string[]>;
  onChangeDeliveryLocation?: (consignmentId: string, deliveryLocationId: string | null) => void;
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
  deliveryLocations = [],
  customerLocationMap = {},
  onChangeDeliveryLocation,
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

  // Get available delivery locations for this customer
  const availableLocationIds = consignment.customerKey ? (customerLocationMap[consignment.customerKey] ?? []) : [];
  const availableLocations = deliveryLocations.filter((loc) => availableLocationIds.includes(loc.id));
  const currentLocationId = (consignment as any).deliveryLocationId;
  
  // Show dropdown only if customer has multiple (2+) locations
  // If customer has exactly 1 location, backend auto-assigns it, so no dropdown needed
  const showDropdown = availableLocations.length > 1;
  const deliveryType = (consignment as { deliveryType?: string }).deliveryType;

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

  const handleLocationChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    e.stopPropagation();
    const value = e.target.value === "" ? null : e.target.value;
    onChangeDeliveryLocation?.(consignment.id, value);
  };

  const handleSelectPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
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
      <span className="unassigned-delivery-row-client">
        {deliveryType === "self_collect" && (
          <span className="unassigned-delivery-row-badge unassigned-delivery-row-badge--customer-collect" title="Customer collects">Customer collects</span>
        )}
        {deliveryType === "collection" && (
          <span className="unassigned-delivery-row-badge unassigned-delivery-row-badge--collection" title="We collect from site">Collection</span>
        )}
        {deliveryType === "deliver" && (
          <span className="unassigned-delivery-row-badge unassigned-delivery-row-badge--delivery" title="We deliver">Delivery</span>
        )}
        <span className="unassigned-delivery-row-client-name">{consignment.customerNameRaw ?? "—"}</span>
      </span>
      <span className="unassigned-delivery-row-location">
        {showDropdown && onChangeDeliveryLocation ? (
          <select
            className="unassigned-delivery-row-location-select"
            value={currentLocationId ?? ""}
            onChange={handleLocationChange}
            onPointerDown={handleSelectPointerDown}
            onClick={(e) => e.stopPropagation()}
            title="Select delivery location for this job"
          >
            <option value="">—</option>
            {availableLocations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.displayName}
              </option>
            ))}
          </select>
        ) : currentLocationId ? (
          availableLocations.find((l) => l.id === currentLocationId)?.displayName ?? "—"
        ) : (
          deliveryLocationDisplay(consignment.destinationKey, consignment.destinationRaw)
        )}
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
