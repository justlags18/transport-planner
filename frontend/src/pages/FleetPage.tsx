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
        ) : (
          <div className="management-table-wrap">
            <table className="management-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Capacity</th>
                  <th>Used</th>
                  <th>Stops</th>
                </tr>
              </thead>
              <tbody>
                {lorries.length === 0 ? (
                  <tr>
                    <td colSpan={4}>No trucks yet.</td>
                  </tr>
                ) : (
                  lorries.map((lorry) => (
                    <tr key={lorry.id}>
                      <td>{lorry.name}</td>
                      <td>{lorry.capacityPallets}</td>
                      <td>{lorry.usedPallets}</td>
                      <td>{lorry.assignments?.length ?? 0}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
};
