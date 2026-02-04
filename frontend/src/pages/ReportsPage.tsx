import { useEffect, useMemo, useState } from "react";
import { apiGet } from "../api/client";
import { useAuth } from "../context/AuthContext";

type AuditLogRow = {
  id: string;
  actorEmail: string | null;
  actorRole: string | null;
  action: string;
  message: string;
  createdAt: string;
  archivedAt: string | null;
};

type AuditLogResponse = { ok: boolean; logs: AuditLogRow[] };

type DeliveryLocationRow = {
  id: string;
  displayName: string;
  destinationKey: string | null;
  address: string | null;
  createdAt: string;
};

type DeliveryLocationsResponse = { ok: boolean; locations: DeliveryLocationRow[] };

type CustomerPrefRow = {
  id: string;
  displayName: string;
  deliveryType: string;
  deliveryLocations?: { id: string; displayName: string }[];
};

type CustomerPrefsResponse = { ok: boolean; prefs: CustomerPrefRow[] };

export const ReportsPage = () => {
  const { user } = useAuth();
  const role = user?.role ?? "Clerk";
  const canViewLogs = role === "Management" || role === "Developer";

  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"active" | "archived">("active");
  const [roleFilter, setRoleFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const [locations, setLocations] = useState<DeliveryLocationRow[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [prefs, setPrefs] = useState<CustomerPrefRow[]>([]);
  const [prefsLoading, setPrefsLoading] = useState(false);

  const actionOptions = useMemo(() => ["", "lorry.status.on", "lorry.status.off"], []);

  useEffect(() => {
    if (!canViewLogs) return;
    let active = true;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams();
        params.set("archived", tab === "archived" ? "1" : "0");
        if (roleFilter) params.set("role", roleFilter);
        if (actionFilter) params.set("action", actionFilter);
        if (fromDate) params.set("from", fromDate);
        if (toDate) params.set("to", toDate);
        const res = await apiGet<AuditLogResponse>(`/api/audit-logs?${params.toString()}`);
        if (!active) return;
        setLogs(res.logs ?? []);
      } catch (e) {
        if (!active) return;
        setError(e instanceof Error ? e.message : "Failed to load logs");
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [canViewLogs, tab, roleFilter, actionFilter, fromDate, toDate]);

  useEffect(() => {
    if (!canViewLogs) return;
    let active = true;
    const load = async () => {
      setLocationsLoading(true);
      try {
        const res = await apiGet<DeliveryLocationsResponse>("/api/delivery-locations");
        if (!active) return;
        setLocations(res.locations ?? []);
      } catch {
        if (!active) return;
        setLocations([]);
      } finally {
        if (active) setLocationsLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [canViewLogs]);

  useEffect(() => {
    if (!canViewLogs) return;
    let active = true;
    const load = async () => {
      setPrefsLoading(true);
      try {
        const res = await apiGet<CustomerPrefsResponse>("/api/customer-prefs");
        if (!active) return;
        setPrefs(res.prefs ?? []);
      } catch {
        if (!active) return;
        setPrefs([]);
      } finally {
        if (active) setPrefsLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [canViewLogs]);

  return (
    <>
      <h2 className="dashboard-page-title">Reports</h2>
      <div className="dashboard-page-content">
        {!canViewLogs ? (
          <p className="management-loading">No reports available.</p>
        ) : (
          <>
            <h3 className="management-section-title">Management Log</h3>
            <div className="management-tabs" aria-label="Report sections">
              <button
                type="button"
                className={`management-tab${tab === "active" ? " management-tab--active" : ""}`}
                onClick={() => setTab("active")}
              >
                Active
              </button>
              <button
                type="button"
                className={`management-tab${tab === "archived" ? " management-tab--active" : ""}`}
                onClick={() => setTab("archived")}
              >
                Archived
              </button>
            </div>
            <div className="management-create-form">
              <label>
                Role
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="management-select"
                >
                  <option value="">All</option>
                  <option value="Clerk">Clerk</option>
                  <option value="Planner">Planner</option>
                  <option value="Management">Management</option>
                  <option value="Developer">Developer</option>
                </select>
              </label>
              <label>
                Action
                <select
                  value={actionFilter}
                  onChange={(e) => setActionFilter(e.target.value)}
                  className="management-select"
                >
                  <option value="">All</option>
                  {actionOptions.filter(Boolean).map((action) => (
                    <option key={action} value={action}>
                      {action}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                From
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="management-input"
                />
              </label>
              <label>
                To
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="management-input"
                />
              </label>
            </div>
            {error ? (
              <div className="management-error" role="alert">
                {error}
              </div>
            ) : null}
            {loading ? (
              <p className="management-loading">Loading log…</p>
            ) : logs.length === 0 ? (
              <p className="management-loading">No log entries yet.</p>
            ) : (
              <div className="management-table-wrap">
                <table className="management-table">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>User</th>
                      <th>Role</th>
                      <th>Action</th>
                      <th>Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => (
                      <tr key={log.id}>
                        <td>{new Date(log.createdAt).toLocaleString()}</td>
                        <td>{log.actorEmail ?? "Unknown"}</td>
                        <td>{log.actorRole ?? "-"}</td>
                        <td>{log.action}</td>
                        <td>{log.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <h3 className="management-section-title" style={{ marginTop: "2rem" }}>Destination creation</h3>
            <p className="management-intro">All delivery locations created in the system.</p>
            {locationsLoading ? (
              <p className="management-loading">Loading destinations…</p>
            ) : locations.length === 0 ? (
              <p className="management-loading">No delivery locations yet.</p>
            ) : (
              <div className="management-table-wrap">
                <table className="management-table">
                  <thead>
                    <tr>
                      <th>Display name</th>
                      <th>Destination key</th>
                      <th>Address</th>
                      <th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {locations.map((loc) => (
                      <tr key={loc.id}>
                        <td>{loc.displayName}</td>
                        <td>{loc.destinationKey ?? "—"}</td>
                        <td>{loc.address ?? "—"}</td>
                        <td>{loc.createdAt ? new Date(loc.createdAt).toLocaleString() : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <h3 className="management-section-title" style={{ marginTop: "2rem" }}>Destinations added to customers</h3>
            <p className="management-intro">Customer preferences with delivery locations assigned (We deliver).</p>
            {prefsLoading ? (
              <p className="management-loading">Loading customer preferences…</p>
            ) : (
              <div className="management-table-wrap">
                <table className="management-table">
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th>Delivery type</th>
                      <th>Delivery locations</th>
                    </tr>
                  </thead>
                  <tbody>
                    {prefs
                      .filter((p) => p.deliveryType === "deliver" && p.deliveryLocations && p.deliveryLocations.length > 0)
                      .map((p) => (
                        <tr key={p.id}>
                          <td>{p.displayName}</td>
                          <td>We deliver</td>
                          <td>{p.deliveryLocations?.map((l) => l.displayName).join(", ") ?? "—"}</td>
                        </tr>
                      ))}
                    {prefs.filter((p) => p.deliveryType === "deliver" && p.deliveryLocations && p.deliveryLocations.length > 0).length === 0 && (
                      <tr>
                        <td colSpan={3}>No customers with delivery locations assigned yet.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
};
