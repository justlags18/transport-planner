import { memo } from "react";
import type { LorryDTO } from "../../pages/Planner";
import { LorryColumn, type ActiveDragData } from "./LorryColumn";

type DeliveryLocationInfo = { id: string; displayName: string };

type LorriesBoardProps = {
  lorries: LorryDTO[];
  activeDragData?: ActiveDragData;
  /** Pallets to count when a job has missing/zero pallets (for capacity preview). */
  missingPalletsFallback?: number;
  /** Called when a job is removed from a lorry (returns to unassigned). */
  onUnassign?: (consignmentId: string) => void;
  /** Delivery locations for grouping headers. */
  deliveryLocations?: DeliveryLocationInfo[];
  /** Transport/plan date (YYYY-MM-DD) – used to show "Reload" on jobs from previous day. */
  transportDate?: string;
  /** Toggle reload/backload flag for an assignment. */
  onToggleReload?: (assignmentId: string, isReload: boolean) => void;
  /** Mark all assignments on a lorry as backload (e.g. when over capacity). */
  onMarkLorryAsBackload?: (lorryId: string) => void;
  /** Lorry ID in "second run" mode (new drops count as reload). */
  lorryIdInReloadMode?: string | null;
  /** Called when user clicks "Coming back for second run" (lorryId) or "Cancel second run" (null). */
  onStartSecondRun?: (lorryId: string | null) => void;
};

/**
 * Renders lorries as vertical columns in a horizontally scrollable board.
 * Each column shows truck reg, status badge, capacity bar, and a drop zone for jobs.
 */
const LorriesBoardInner = ({ lorries, activeDragData = null, missingPalletsFallback = 1, onUnassign, deliveryLocations = [], transportDate = "", onToggleReload, onMarkLorryAsBackload, lorryIdInReloadMode = null, onStartSecondRun }: LorriesBoardProps) => {
  if (lorries.length === 0) {
    return (
      <div className="lorries-board lorries-board--empty">
        <p className="management-muted">No lorries. Add trucks in Fleet or Management.</p>
      </div>
    );
  }

  return (
    <div className="lorries-board" role="region" aria-label="Lorries board">
      <div className="lorries-board-scroll">
        {lorries.map((lorry) => (
          <LorryColumn
            key={lorry.id}
            lorry={lorry}
            activeDragData={activeDragData}
            missingPalletsFallback={missingPalletsFallback}
            onUnassign={onUnassign}
            deliveryLocations={deliveryLocations}
            transportDate={transportDate}
            onToggleReload={onToggleReload}
            onMarkLorryAsBackload={onMarkLorryAsBackload}
            lorryIdInReloadMode={lorryIdInReloadMode}
            onStartSecondRun={onStartSecondRun}
          />
        ))}
      </div>
    </div>
  );
};

/** Memoized so lorries don't re-render when left panel (UnassignedDeliveriesPanel) scrolls. */
export const LorriesBoard = memo(LorriesBoardInner);
