import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { FixedSizeList as List } from "react-window";
import type { DeliveryJobConsignment } from "../DeliveryJobCard";
import { UnassignedDeliveryRow } from "./UnassignedDeliveryRow";

const ROW_HEIGHT_PX = 52;

export type UnassignedDeliveriesPanelItemData = {
  list: DeliveryJobConsignment[];
  selectedIds: Set<string>;
  onToggle: (id: string, shiftKey: boolean, index: number) => void;
  deliveryLocations: Array<{ id: string; displayName: string }>;
  customerLocationMap: Record<string, string[]>;
  onChangeDeliveryLocation: (consignmentId: string, deliveryLocationId: string | null) => void;
};

type UnassignedDeliveriesPanelProps = {
  unassigned: DeliveryJobConsignment[];
  loading?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onSelectRange?: (ids: string[]) => void;
  deliveryLocations?: Array<{ id: string; displayName: string }>;
  customerLocationMap?: Record<string, string[]>;
  onChangeDeliveryLocation?: (consignmentId: string, deliveryLocationId: string | null) => void;
};

function isEtaToday(etaIso: string | null): boolean {
  if (!etaIso?.trim()) return false;
  const d = new Date(etaIso);
  if (Number.isNaN(d.getTime())) return false;
  const today = new Date();
  return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
}

function isMissingPallets(c: DeliveryJobConsignment): boolean {
  const p = c.palletsFromSite;
  return p == null || p === 0;
}

/** Urgent = not delivered/assigned for over 1 day: ETA is more than 24 hours in the past. */
function isUrgent(c: DeliveryJobConsignment): boolean {
  if (!c.etaIso?.trim()) return false;
  const eta = new Date(c.etaIso);
  if (Number.isNaN(eta.getTime())) return false;
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  return eta.getTime() < oneDayAgo;
}

export const UnassignedDeliveriesPanel = ({
  unassigned,
  loading = false,
  selectedIds = new Set(),
  onToggleSelect = () => {},
  onSelectRange = () => {},
  deliveryLocations = [],
  customerLocationMap = {},
  onChangeDeliveryLocation = () => {},
}: UnassignedDeliveriesPanelProps) => {
  const [search, setSearch] = useState("");
  const [filterEtaToday, setFilterEtaToday] = useState(false);
  const [filterMissingPallets, setFilterMissingPallets] = useState(false);
  const [filterUrgent, setFilterUrgent] = useState(false);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const anchorIndexRef = useRef<number | null>(null);

  const filtered = useMemo(() => {
    let list = unassigned;

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (c) =>
          (c.id && c.id.toLowerCase().includes(q)) ||
          (c.customerNameRaw && c.customerNameRaw.toLowerCase().includes(q)) ||
          (c.destinationRaw && c.destinationRaw.toLowerCase().includes(q)) ||
          (c.destinationKey && c.destinationKey.toLowerCase().includes(q))
      );
    }

    if (filterEtaToday || filterMissingPallets || filterUrgent) {
      list = list.filter((c) => {
        const etaToday = isEtaToday(c.etaIso);
        const missingPallets = isMissingPallets(c);
        const urgent = isUrgent(c);
        if (filterEtaToday && !etaToday) return false;
        if (filterMissingPallets && !missingPallets) return false;
        if (filterUrgent && !urgent) return false;
        return true;
      });
    }

    return list;
  }, [unassigned, search, filterEtaToday, filterMissingPallets, filterUrgent]);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const setSizeFromEl = () => {
      const rect = el.getBoundingClientRect();
      setSize((prev) => (prev.width !== rect.width || prev.height !== rect.height ? { width: rect.width, height: rect.height } : prev));
    };
    setSizeFromEl();
    const ro = new ResizeObserver(setSizeFromEl);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const handleToggle = useCallback(
    (id: string, shiftKey: boolean, index: number) => {
      if (shiftKey && anchorIndexRef.current !== null) {
        const start = Math.min(anchorIndexRef.current, index);
        const end = Math.max(anchorIndexRef.current, index);
        const ids = filtered.slice(start, end + 1).map((c) => c.id);
        onSelectRange(ids);
      } else {
        onToggleSelect(id);
      }
      anchorIndexRef.current = index;
    },
    [filtered, onToggleSelect, onSelectRange],
  );

  const itemData = useMemo<UnassignedDeliveriesPanelItemData>(
    () => ({ list: filtered, selectedIds, onToggle: handleToggle, deliveryLocations, customerLocationMap, onChangeDeliveryLocation }),
    [filtered, selectedIds, handleToggle, deliveryLocations, customerLocationMap, onChangeDeliveryLocation],
  );

  const rowRenderer = useMemo(
    () =>
      function VirtualRow({
        index,
        style,
        data,
      }: {
        index: number;
        style: React.CSSProperties;
        data: UnassignedDeliveriesPanelItemData;
      }) {
        const consignment = data.list[index];
        if (!consignment) return null;
        const draggableId = `consignment:${consignment.id}`;
        const isSelected = data.selectedIds.has(consignment.id);
        return (
          <div style={style} className="unassigned-deliveries-list-item-wrap">
            <UnassignedDeliveryRow
              consignment={consignment}
              draggableId={draggableId}
              index={index}
              isSelected={isSelected}
              onToggle={data.onToggle}
              deliveryLocations={data.deliveryLocations}
              customerLocationMap={data.customerLocationMap}
              onChangeDeliveryLocation={data.onChangeDeliveryLocation}
            />
          </div>
        );
      },
    [],
  );

  return (
    <aside className="unassigned-deliveries-panel unassigned-deliveries-panel--compact" aria-label="Unassigned delivery jobs">
      <div className="unassigned-deliveries-panel-sticky">
        <label className="unassigned-deliveries-search-label" htmlFor="unassigned-deliveries-search">
          <span className="visually-hidden">Search jobs</span>
          <input
            id="unassigned-deliveries-search"
            type="search"
            className="unassigned-deliveries-search"
            placeholder="Job, client, location…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search jobs by ID, client or location"
          />
        </label>
        <div className="unassigned-deliveries-filters" role="group" aria-label="Filters">
          <button
            type="button"
            className={`unassigned-deliveries-filter-chip${filterEtaToday ? " unassigned-deliveries-filter-chip--on" : ""}`}
            onClick={() => setFilterEtaToday((v) => !v)}
            aria-pressed={filterEtaToday}
          >
            ETA Today
          </button>
          <button
            type="button"
            className={`unassigned-deliveries-filter-chip${filterMissingPallets ? " unassigned-deliveries-filter-chip--on" : ""}`}
            onClick={() => setFilterMissingPallets((v) => !v)}
            aria-pressed={filterMissingPallets}
          >
            Missing Pallets
          </button>
          <button
            type="button"
            className={`unassigned-deliveries-filter-chip${filterUrgent ? " unassigned-deliveries-filter-chip--on" : ""}`}
            onClick={() => setFilterUrgent((v) => !v)}
            aria-pressed={filterUrgent}
          >
            Urgent
          </button>
        </div>
      </div>
      <div ref={containerRef} className="unassigned-deliveries-panel-inner unassigned-deliveries-panel-inner--virtual">
        {loading ? (
          <p className="unassigned-deliveries-muted">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="unassigned-deliveries-muted">
            {unassigned.length === 0 ? "No unassigned jobs." : "No jobs match filters."}
          </p>
        ) : size.height > 0 && size.width > 0 ? (
          <List
            height={size.height}
            width={size.width}
            itemCount={filtered.length}
            itemSize={ROW_HEIGHT_PX}
            itemData={itemData}
            overscanCount={8}
            className="unassigned-deliveries-list-virtual"
          >
            {rowRenderer}
          </List>
        ) : null}
      </div>
    </aside>
  );
};
