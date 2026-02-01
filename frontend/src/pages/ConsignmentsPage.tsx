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

  const toEtaMillis = (value: string | null) => {
    if (!value) return Number.POSITIVE_INFINITY;
    const parsed = new Date(value).getTime();
    if (!Number.isNaN(parsed)) return parsed;
    const timeMatch = value.match(/\b([01]?\d|2[0-3])[: ]([0-5]\d)\b/);
    if (timeMatch) {
      const now = new Date();
      const hh = Number(timeMatch[1]);
      const mm = Number(timeMatch[2]);
      const when = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm, 0, 0);
      return when.getTime();
    }
    return Number.POSITIVE_INFINITY;
  };

  const grouped = useMemo(() => {
    const map = new Map<string, { customer: string; mawb: string; items: ConsignmentDTO[] }>();
    for (const item of items) {
      if (item.id.toLowerCase().includes("export")) {
        continue;
      }
      const customer = item.customerNameRaw ?? "Unknown";
      const mawb = item.mawbRaw ?? "Unknown";
      const key = `${customer}__${mawb}`;
      const entry = map.get(key);
      if (entry) {
        entry.items.push(item);
      } else {
        map.set(key, { customer, mawb, items: [item] });
      }
    }
    const groups = Array.from(map.values()).map((group) => {
      group.items.sort((a, b) => toEtaMillis(a.etaIso) - toEtaMillis(b.etaIso));
      return group;
    });
    groups.sort((a, b) => {
      const aTime = toEtaMillis(a.items[0]?.etaIso ?? null);
      const bTime = toEtaMillis(b.items[0]?.etaIso ?? null);
      return aTime - bTime;
    });
    return groups;
  }, [items]);

  const massCheckCutoff = useMemo(getLastMassCheck, []);

  return (
    <>
      <h2 className="dashboard-page-title">Consignments</h2>
      <div className="dashboard-page-content">
        <div className="consignments-summary">
          <div className="consignments-kpi">
            <span className="consignments-kpi-label">Total</span>
            <span className="consignments-kpi-value">{items.length}</span>
          </div>
          <div className="consignments-kpi">
            <span className="consignments-kpi-label">Active</span>
            <span className="consignments-kpi-value">
              {items.filter((item) => !item.archivedAt).length}
            </span>
          </div>
          <div className="consignments-kpi">
            <span className="consignments-kpi-label">Last Seen</span>
            <span className="consignments-kpi-value">
              {items.length ? formatDateTime(items[0].lastSeenAt) : "-"}
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
        ) : grouped.length === 0 ? (
          <p className="management-loading">No consignments found.</p>
        ) : (
          <div className="consignments-groups">
            {grouped.map((group) => {
              const groupEta = formatDateTime(group.items[0]?.etaIso ?? null);
              return (
                <details
                  key={`${group.customer}-${group.mawb}`}
                  className="consignments-group"
                  open={group.items.length === 1}
                >
                  <summary className="consignments-group-summary">
                    <div className="consignments-group-main">
                      <span className="consignments-group-customer">{group.customer}</span>
                      <span className="consignments-group-mawb">MAWB: {group.mawb}</span>
                    </div>
                    <div className="consignments-group-meta">
                      <span className="consignments-group-count">
                        {group.items.length}
                      </span>
                      <span>ETA {groupEta}</span>
                    </div>
                    {group.items.length > 1 ? (
                      <span className="consignments-group-chevron" aria-hidden="true">▼</span>
                    ) : null}
                  </summary>
                  <div className="management-table-wrap">
                    <table className="management-table consignments-table">
                      <thead>
                        <tr>
                          <th>PML Ref</th>
                          <th>ETA &amp; Time</th>
                          <th>Observation</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.items.map((item) => {
                          const createdAt = new Date(item.createdAt);
                          const isNew =
                            !Number.isNaN(createdAt.getTime()) && createdAt > massCheckCutoff;
                          return (
                            <tr key={item.id}>
                              <td>
                                <div className="consignments-ref">
                                  <span>{item.id}</span>
                                  {isNew ? <span className="consignments-new">New</span> : null}
                                </div>
                              </td>
                              <td>{formatDateTime(item.etaIso)}</td>
                              <td>{item.observationRaw ?? "-"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
};
