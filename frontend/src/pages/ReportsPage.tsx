import { useEffect, useState } from "react";
import { apiGet } from "../api/client";
import { useAuth } from "../context/AuthContext";

type AuditLogRow = {
  id: string;
  actorEmail: string | null;
  action: string;
  message: string;
  createdAt: string;
};

type AuditLogResponse = { ok: boolean; logs: AuditLogRow[] };

export const ReportsPage = () => {
  const { user } = useAuth();
  const role = user?.role ?? "Clerk";
  const canViewLogs = role === "Management" || role === "Developer";

  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!canViewLogs) return;
    let active = true;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await apiGet<AuditLogResponse>("/api/audit-logs");
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
                      <th>Action</th>
                      <th>Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => (
                      <tr key={log.id}>
                        <td>{new Date(log.createdAt).toLocaleString()}</td>
                        <td>{log.actorEmail ?? "Unknown"}</td>
                        <td>{log.action}</td>
                        <td>{log.message}</td>
                      </tr>
                    ))}
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
