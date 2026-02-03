import { useCallback, useEffect, useMemo, useState } from "react";
import { apiGet, apiPatch } from "../api/client";

type ConsignmentDTO = {
  id: string;
  customerNameRaw: string | null;
  destinationRaw: string | null;
  observationRaw: string | null;
  mawbRaw: string | null;
  hawbRaw: string | null;
  packagesRaw: string | null;
  productDescriptionRaw: string | null;
  etaIso: string | null;
  status: string | null;
  palletsFromSite: number | null;
  lastSeenAt: string;
  archivedAt: string | null;
  createdAt: string;
  isPlanned?: boolean;
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
  const [scope, setScope] = useState<"active" | "archived">("active");
  const [archivedOnFilter, setArchivedOnFilter] = useState(""); // YYYY-MM-DD: when scope is archived, filter by archived-on date
  const [unarchivingId, setUnarchivingId] = useState<string | null>(null);

  const loadConsignments = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (scope === "active") params.set("active", "1");
      else if (scope === "archived") {
        params.set("archived", "1");
        if (archivedOnFilter) params.set("archivedOn", archivedOnFilter);
      }
      if (search.trim()) params.set("search", search.trim());
      if (dateFilter) params.set("date", dateFilter);
      const res = await apiGet<ConsignmentResponse>(`/api/consignments?${params.toString()}`);
      setItems(res.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load consignments");
    } finally {
      setLoading(false);
    }
  }, [scope, search, dateFilter, archivedOnFilter]);

  useEffect(() => {
    loadConsignments();
  }, [loadConsignments]);

  const handleUnarchive = useCallback(
    async (id: string) => {
      setUnarchivingId(id);
      setError("");
      try {
        await apiPatch<{ ok: boolean }>(`/api/consignments/${encodeURIComponent(id)}/unarchive`, {});
        setItems((prev) => prev.filter((item) => item.id !== id));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unarchive failed");
      } finally {
        setUnarchivingId(null);
      }
    },
    []
  );

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

  const normalizeCustomerKey = (value: string | null) =>
    (value ?? "")
      .trim()
      .replace(/\s+/g, " ")
      .toUpperCase();

  const normalizeAwbKey = (value: string | null) =>
    (value ?? "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");

  const grouped = useMemo(() => {
    const map = new Map<string, { customer: string; mawb: string; items: ConsignmentDTO[] }>();
    for (const item of items) {
      if (item.id.toLowerCase().includes("export")) {
        continue;
      }
      const customer = item.customerNameRaw ?? "Unknown";
      const mawb = item.mawbRaw ?? "Unknown";
      const key = `${normalizeCustomerKey(customer)}__${normalizeAwbKey(mawb)}`;
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

  const { expandableGroups, flatItems } = useMemo(() => {
    const flat: ConsignmentDTO[] = [];
    const expandable = grouped.filter((group) => {
      const hasMultiple = group.items.length > 1;
      if (hasMultiple) {
        return true;
      }
      flat.push(...group.items);
      return false;
    });
    return { expandableGroups: expandable, flatItems: flat };
  }, [grouped]);

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
            <span className="consignments-kpi-label">{scope === "archived" ? "Archived" : "Active"}</span>
            <span className="consignments-kpi-value">{items.length}</span>
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
              value={scope}
              onChange={(event) => setScope(event.target.value === "archived" ? "archived" : "active")}
            >
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
          </label>
          {scope === "archived" && (
            <label>
              Archived on date
              <input
                className="management-input"
                type="date"
                value={archivedOnFilter}
                onChange={(e) => setArchivedOnFilter(e.target.value)}
                title="Show only consignments archived on this date (leave empty for all archived)"
              />
            </label>
          )}
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
            {flatItems.length > 0 ? (
              <div className="management-table-wrap">
                <table className="management-table consignments-table">
                  <thead>
                    <tr>
                      <th>PML Ref</th>
                      <th>Client</th>
                      <th>AWB</th>
                      <th>ETA &amp; Time</th>
                      <th>Packages</th>
                      <th>Observation</th>
                      <th>Product Description</th>
                      {scope === "archived" ? <th>Actions</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {flatItems.map((item) => {
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
                          <td>
                            <span className="consignments-group-customer-row">
                              <span>{item.customerNameRaw ?? "-"}</span>
                              {item.isPlanned ? (
                                <span className="consignments-planned-badge" title="Assigned to a lorry">Planned</span>
                              ) : null}
                            </span>
                          </td>
                          <td>{item.mawbRaw ?? "-"}</td>
                          <td>{formatDateTime(item.etaIso)}</td>
                          <td>{item.packagesRaw ?? "-"}</td>
                          <td>{item.observationRaw ?? "-"}</td>
                          <td>{item.productDescriptionRaw ?? "-"}</td>
                          {scope === "archived" ? (
                            <td>
                              <button
                                type="button"
                                className="management-btn management-btn-small"
                                onClick={() => handleUnarchive(item.id)}
                                disabled={unarchivingId === item.id}
                                title="Move back to Active"
                              >
                                {unarchivingId === item.id ? "…" : "Unarchive"}
                              </button>
                            </td>
                          ) : null}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
            {expandableGroups.map((group) => {
              const groupEta = formatDateTime(group.items[0]?.etaIso ?? null);
              return (
                <details
                  key={`${group.customer}-${group.mawb}`}
                  className="consignments-group"
                  open={false}
                >
                  <summary className="consignments-group-summary">
                    <div className="consignments-group-main">
                      <span className="consignments-group-customer-row">
                        <span className="consignments-group-customer">{group.customer}</span>
                        {group.items.some((i) => i.isPlanned) ? (
                          <span className="consignments-planned-badge" title="Assigned to a lorry">Planned</span>
                        ) : null}
                      </span>
                      <span className="consignments-group-mawb">AWB: {group.mawb}</span>
                    </div>
                    <div className="consignments-group-meta">
                      <span className="consignments-group-count">
                        Jobs: {group.items.length}
                      </span>
                      <span className="consignments-group-eta">ETA {groupEta}</span>
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
                          <th>Client</th>
                          <th>AWB</th>
                          <th>HAWB</th>
                          <th>ETA &amp; Time</th>
                          <th>Packages</th>
                          <th>Observation</th>
                          <th>Product Description</th>
                          {scope === "archived" ? <th>Actions</th> : null}
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
                              <td>
                                <span className="consignments-group-customer-row">
                                  <span>{item.customerNameRaw ?? "-"}</span>
                                  {item.isPlanned ? (
                                    <span className="consignments-planned-badge" title="Assigned to a lorry">Planned</span>
                                  ) : null}
                                </span>
                              </td>
                              <td>{item.mawbRaw ?? "-"}</td>
                              <td>{item.hawbRaw ?? "-"}</td>
                              <td>{formatDateTime(item.etaIso)}</td>
                              <td>{item.packagesRaw ?? "-"}</td>
                              <td>{item.observationRaw ?? "-"}</td>
                              <td>{item.productDescriptionRaw ?? "-"}</td>
                              {scope === "archived" ? (
                                <td>
                                  <button
                                    type="button"
                                    className="management-btn management-btn-small"
                                    onClick={() => handleUnarchive(item.id)}
                                    disabled={unarchivingId === item.id}
                                    title="Move back to Active"
                                  >
                                    {unarchivingId === item.id ? "…" : "Unarchive"}
                                  </button>
                                </td>
                              ) : null}
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
