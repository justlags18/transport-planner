import { useEffect, useState } from "react";
import { apiGet } from "../api/client";

type LorryRow = {
  id: string;
  name: string;
  capacityPallets: number;
  usedPallets: number;
  assignments: { id: string }[];
};

export const FleetPage = () => {
  const [lorries, setLorries] = useState<LorryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
            {lorries.map((lorry) => (
              <article key={lorry.id} className="fleet-card">
                <div className="fleet-card-header">
                  <h3 className="fleet-card-title">{lorry.name}</h3>
                  <span className="fleet-card-badge">{lorry.assignments?.length ?? 0} stops</span>
                </div>
                <div className="fleet-card-meta">
                  <span>Capacity</span>
                  <span>{lorry.capacityPallets}</span>
                </div>
                <div className="fleet-card-meta">
                  <span>Used</span>
                  <span>{lorry.usedPallets}</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </>
  );
};
