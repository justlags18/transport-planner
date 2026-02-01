import { useEffect, useMemo, useState } from "react";
import { apiGet } from "../api/client";

type ConsignmentDTO = {
  id: string;
  customerNameRaw: string | null;
  destinationRaw: string | null;
  observationRaw: string | null;
  mawbRaw: string | null;
  etaIso: string | null;
  status: string | null;
  palletsFromSite: number | null;
  lastSeenAt: string;
  archivedAt: string | null;
  createdAt: string;
};

type ConsignmentResponse = { items: ConsignmentDTO[] };

const formatDateTime = (value: string | null) => {
  if (!value) return "-";
  const dt = new Date(value);
  return Number.isNaN(dt.getTime()) ? value : dt.toLocaleString();
};

const formatDate = (value: string | null) => {
  if (!value) return "-";
  const dt = new Date(value);
  return Number.isNaN(dt.getTime()) ? value : dt.toLocaleDateString();
};

const getLastMassCheck = () => {
  const now = new Date();
  const cutoff = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    6,
    0,
    0,
    0,
  );
  if (now < cutoff) {
    cutoff.setDate(cutoff.getDate() - 1);
  }
  return cutoff;
};

export const ConsignmentsPage = () => {
  const [items, setItems] = useState<ConsignmentDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [activeOnly, setActiveOnly] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams();
        if (activeOnly) params.set("active", "1");
        if (search.trim()) params.set("search", search.trim());
        if (dateFilter) params.set("date", dateFilter);
        const res = await apiGet<ConsignmentResponse>(`/api/consignments?${params.toString()}`);
        if (!active) return;
        setItems(res.items ?? []);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load consignments");
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [activeOnly, search, dateFilter]);

  const sorted = useMemo(
    () =>
      [...items].sort((a, b) => {
        const aTime = new Date(a.lastSeenAt).getTime();
        const bTime = new Date(b.lastSeenAt).getTime();
        return bTime - aTime;
      }),
    [items],
  );

  const massCheckCutoff = useMemo(getLastMassCheck, []);

  return (
    <>
      <h2 className="dashboard-page-title">Consignments</h2>
      <div className="dashboard-page-content">
        <div className="consignments-summary">
          <div className="consignments-kpi">
            <span className="consignments-kpi-label">Total</span>
            <span className="consignments-kpi-value">{sorted.length}</span>
          </div>
          <div className="consignments-kpi">
            <span className="consignments-kpi-label">Active</span>
            <span className="consignments-kpi-value">
              {sorted.filter((item) => !item.archivedAt).length}
            </span>
          </div>
          <div className="consignments-kpi">
            <span className="consignments-kpi-label">Last Seen</span>
            <span className="consignments-kpi-value">
              {sorted.length ? formatDateTime(sorted[0].lastSeenAt) : "-"}
            </span>
          </div>
        </div>

        <div className="management-create-form consignments-filters">
          <label>
            Search
            <input
              className="management-input"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="PML ref, customer, destination"
            />
          </label>
          <label>
            ETA date
            <input
              className="management-input"
              type="date"
              value={dateFilter}
              onChange={(event) => setDateFilter(event.target.value)}
            />
          </label>
          <label>
            Scope
            <select
              className="management-select"
              value={activeOnly ? "active" : "all"}
              onChange={(event) => setActiveOnly(event.target.value === "active")}
            >
              <option value="active">Active only</option>
              <option value="all">All</option>
            </select>
          </label>
        </div>

        {error ? (
          <div className="management-error" role="alert">
            {error}
          </div>
        ) : null}

        {loading ? (
          <p className="management-loading">Loading consignments…</p>
        ) : sorted.length === 0 ? (
          <p className="management-loading">No consignments found.</p>
        ) : (
          <div className="management-table-wrap">
            <table className="management-table consignments-table">
              <thead>
                <tr>
                  <th>PML Ref</th>
                  <th>Customer</th>
                  <th>ETA &amp; Time</th>
                  <th>MAWB</th>
                  <th>Observation</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((item) => {
                  const createdAt = new Date(item.createdAt);
                  const isNew = !Number.isNaN(createdAt.getTime()) && createdAt > massCheckCutoff;
                  return (
                  <tr key={item.id}>
                    <td>
                      <div className="consignments-ref">
                        <span>{item.id}</span>
                        {isNew ? <span className="consignments-new">New</span> : null}
                      </div>
                    </td>
                    <td>{item.customerNameRaw ?? "-"}</td>
                    <td>{formatDateTime(item.etaIso)}</td>
                    <td>{item.mawbRaw ?? "-"}</td>
                    <td>{item.observationRaw ?? "-"}</td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
};
