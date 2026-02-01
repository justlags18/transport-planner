type DragGhostItem = { jobId: string; pallets: number | null };

type DragGhostProps =
  | { items: DragGhostItem[] }
  | { jobId: string; pallets: number | null };

/**
 * Ghost shown during drag (DragOverlay). Shows job ID(s) + pallets for accessibility and clarity.
 */
export const DragGhost = (props: DragGhostProps) => {
  if ("items" in props) {
    const { items } = props;
    const count = items.length;
    const totalPallets = items.reduce(
      (s, i) => s + (i.pallets != null && i.pallets > 0 ? i.pallets : 0),
      0,
    );
    return (
      <div className="deliveries-drag-ghost" role="status" aria-live="polite">
        <span className="deliveries-drag-ghost-job">
          {count} job{count !== 1 ? "s" : ""}
        </span>
        <span className="deliveries-drag-ghost-pallets">
          {totalPallets > 0 ? `${totalPallets} pallets total` : "— pallets"}
        </span>
      </div>
    );
  }
  const { jobId, pallets } = props;
  return (
    <div className="deliveries-drag-ghost" role="status" aria-live="polite">
      <span className="deliveries-drag-ghost-job">{jobId}</span>
      <span className="deliveries-drag-ghost-pallets">
        {pallets != null && pallets > 0 ? `${pallets} pallets` : "— pallets"}
      </span>
    </div>
  );
};
