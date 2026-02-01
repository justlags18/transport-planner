import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPatch } from "../api/client";
import { useAuth } from "../context/AuthContext";

type LorryRow = {
  id: string;
  name: string;
  capacityPallets: number;
  usedPallets: number;
  assignments: { id: string }[];
  status?: "on" | "off";
};

export const FleetPage = () => {
  const { user } = useAuth();
  const [lorries, setLorries] = useState<LorryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusById, setStatusById] = useState<Record<string, "on" | "off">>({});

  const canToggleStatus = useMemo(() => {
    const role = user?.role ?? "Clerk";
    return role === "Planner" || role === "Management" || role === "Developer";
  }, [user]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const items = await apiGet<LorryRow[]>("/api/lorries");
        if (!active) return;
        const sorted = (Array.isArray(items) ? items : []).sort((a, b) =>
          a.name.localeCompare(b.name),
        );
        setLorries(sorted);
        setStatusById((prev) => {
          const next = { ...prev };
          for (const lorry of sorted) {
            if (!next[lorry.id]) {
              next[lorry.id] = lorry.status ?? "on";
            } else if (lorry.status && next[lorry.id] !== lorry.status) {
              next[lorry.id] = lorry.status;
            }
          }
          return next;
        });
      } catch (e) {
        if (!active) return;
        setError(e instanceof Error ? e.message : "Failed to load fleet");
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, []);

  return (
    <>
      <h2 className="dashboard-page-title">Fleet</h2>
      <div className="dashboard-page-content">
        {error ? (
          <div className="management-error" role="alert">
            {error}
          </div>
        ) : null}

        {loading ? (
          <p className="management-loading">Loading fleet…</p>
        ) : lorries.length === 0 ? (
          <p className="management-loading">No trucks yet.</p>
        ) : (
          <div className="fleet-grid">
            {lorries.map((lorry) => {
              const status = statusById[lorry.id] ?? "on";
              const used = lorry.usedPallets ?? 0;
              const capacity = Math.max(lorry.capacityPallets, 1);
              const percent = Math.min(100, Math.round((used / capacity) * 100));
              const toggleStatus = async () => {
                if (!canToggleStatus) return;
                const nextStatus = status === "on" ? "off" : "on";
                try {
                  await apiPatch(`/api/lorries/${lorry.id}/status`, { status: nextStatus });
                  setStatusById((prev) => ({ ...prev, [lorry.id]: nextStatus }));
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Failed to update status");
                }
              };

              return (
                <article key={lorry.id} className="fleet-card">
                  <div className="fleet-card-header">
                    <h3 className="fleet-card-title">{lorry.name}</h3>
                    <span className={`fleet-card-status ${status}`}>
                      {status === "on" ? "ON ROAD" : "OFF ROAD"}
                    </span>
                  </div>
                  <div className="fleet-card-status-row">
                    <span className="fleet-card-badge">
                      {lorry.assignments?.length ?? 0} stops
                    </span>
                    {canToggleStatus ? (
                      <button
                        type="button"
                        className="fleet-toggle-btn"
                        onClick={toggleStatus}
                      >
                        Toggle
                      </button>
                    ) : null}
                  </div>
                  <div className="fleet-card-meta">
                    <span>Status</span>
                    <span>{status === "on" ? "Available" : "Unavailable"}</span>
                  </div>
                  <div className="fleet-card-meta">
                    <span>Capacity</span>
                    <span>{lorry.capacityPallets}</span>
                  </div>
                  <div className="fleet-card-meta">
                    <span>Used</span>
                    <span>{used}</span>
                  </div>
                  <div className="fleet-card-bar">
                    <div className="fleet-card-bar-fill" style={{ width: `${percent}%` }} />
                  </div>
                  <div className="fleet-card-footnote">
                    {used} / {capacity} slots used
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
};
