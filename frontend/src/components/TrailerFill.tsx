type TrailerFillProps = {
  usedPallets: number;
  capacityPallets: number;
};

export const TrailerFill = ({ usedPallets, capacityPallets }: TrailerFillProps) => {
  const safeCapacity = Math.max(capacityPallets, 1);
  const ratio = Math.max(0, usedPallets) / safeCapacity;
  const percent = Math.round(ratio * 100);
  const fillPercent = Math.min(percent, 100);

  let statusLabel: string | null = null;
  let statusClass = "";
  if (percent >= 100) {
    statusLabel = "OVER";
    statusClass = "is-over";
  } else if (percent >= 85) {
    statusLabel = "almost full";
    statusClass = "is-warning";
  }

  return (
    <div className={`trailer-fill ${statusClass}`.trim()}>
      <div className="trailer-fill-meta">
        <span>{percent}%</span>
        {statusLabel ? <span className="trailer-fill-status">{statusLabel}</span> : null}
      </div>
      <svg className="trailer-fill-svg" viewBox="0 0 120 28" role="img" aria-label="Trailer fill">
        <rect x="1" y="1" width="118" height="26" rx="6" className="trailer-fill-frame" />
        <rect
          x="3"
          y="3"
          width={(112 * fillPercent) / 100}
          height="22"
          rx="5"
          className="trailer-fill-bar"
        />
      </svg>
    </div>
  );
};
