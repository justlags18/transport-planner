import { useCallback, useEffect, useMemo, useState } from "react";
import { apiGet, apiPatch, apiPost, apiDelete } from "../api/client";
import { useAuth } from "../context/AuthContext";

type LorryRow = {
  id: string;
  name: string;
  capacityPallets: number;
  usedPallets: number;
  assignments: { id: string }[];
  status?: "on" | "off";
};

const SCHEDULE_TYPES = ["off_road", "service"] as const;
type ScheduleType = (typeof SCHEDULE_TYPES)[number];
const SCHEDULE_TYPE_LABELS: Record<string, string> = {
  off_road: "Off-road",
  service: "Service",
};

type FleetScheduleEntry = {
  id: string;
  lorryId: string;
  type: string;
  startAt: string;
  endAt: string | null;
  notes: string | null;
  lorry?: { id: string; name: string };
};

type FleetScheduleResponse = { ok: boolean; entries: FleetScheduleEntry[] };
type CreateScheduleResponse = { ok: boolean; entry: FleetScheduleEntry };
type UpdateScheduleResponse = { ok: boolean; entry: FleetScheduleEntry };

function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day}T${h}:${min}`;
}

function fromDatetimeLocal(s: string): string {
  if (!s) return "";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

export const FleetPage = () => {
  const { user } = useAuth();
  const [lorries, setLorries] = useState<LorryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusById, setStatusById] = useState<Record<string, "on" | "off">>({});

  const [scheduleEntries, setScheduleEntries] = useState<FleetScheduleEntry[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleLorryId, setScheduleLorryId] = useState("");
  const [scheduleType, setScheduleType] = useState<ScheduleType>("off_road");
  const [scheduleStartAt, setScheduleStartAt] = useState("");
  const [scheduleEndAt, setScheduleEndAt] = useState("");
  const [scheduleNotes, setScheduleNotes] = useState("");
  const [addingSchedule, setAddingSchedule] = useState(false);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [editScheduleType, setEditScheduleType] = useState<ScheduleType>("off_road");
  const [editScheduleStartAt, setEditScheduleStartAt] = useState("");
  const [editScheduleEndAt, setEditScheduleEndAt] = useState("");
  const [editScheduleNotes, setEditScheduleNotes] = useState("");
  const [deletingScheduleId, setDeletingScheduleId] = useState<string | null>(null);

  const canToggleStatus = useMemo(() => {
    const role = user?.role ?? "Clerk";
    return role === "Planner" || role === "Management" || role === "Developer";
  }, [user]);

  const loadSchedule = useCallback(async () => {
    if (!canToggleStatus) return;
    setScheduleLoading(true);
    setError("");
    try {
      const res = await apiGet<FleetScheduleResponse>("/api/fleet-schedule");
      setScheduleEntries(res.entries ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load schedule");
    } finally {
      setScheduleLoading(false);
    }
  }, [canToggleStatus]);

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

  useEffect(() => {
    if (canToggleStatus) loadSchedule();
  }, [canToggleStatus, loadSchedule]);

  const handleAddSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scheduleLorryId || !scheduleStartAt) {
      setError("Truck and start date/time are required.");
      return;
    }
    setError("");
    setAddingSchedule(true);
    try {
      const res = await apiPost<CreateScheduleResponse>("/api/fleet-schedule", {
        lorryId: scheduleLorryId,
        type: scheduleType,
        startAt: fromDatetimeLocal(scheduleStartAt) || new Date(scheduleStartAt).toISOString(),
        endAt: scheduleEndAt ? fromDatetimeLocal(scheduleEndAt) || new Date(scheduleEndAt).toISOString() : null,
        notes: scheduleNotes.trim() || null,
      });
      if (res.ok && res.entry) {
        setScheduleEntries((prev) => [...prev, res.entry!].sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()));
        setScheduleLorryId("");
        setScheduleType("off_road");
        setScheduleStartAt("");
        setScheduleEndAt("");
        setScheduleNotes("");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add schedule entry");
    } finally {
      setAddingSchedule(false);
    }
  };

  const startEditSchedule = (entry: FleetScheduleEntry) => {
    setEditingScheduleId(entry.id);
    setEditScheduleType((entry.type as ScheduleType) || "off_road");
    setEditScheduleStartAt(toDatetimeLocal(entry.startAt));
    setEditScheduleEndAt(entry.endAt ? toDatetimeLocal(entry.endAt) : "");
    setEditScheduleNotes(entry.notes ?? "");
  };

  const handleUpdateSchedule = async () => {
    if (!editingScheduleId) return;
    setError("");
    try {
      const res = await apiPatch<UpdateScheduleResponse>(`/api/fleet-schedule/${editingScheduleId}`, {
        type: editScheduleType,
        startAt: fromDatetimeLocal(editScheduleStartAt) || new Date(editScheduleStartAt).toISOString(),
        endAt: editScheduleEndAt ? fromDatetimeLocal(editScheduleEndAt) || new Date(editScheduleEndAt).toISOString() : null,
        notes: editScheduleNotes.trim() || null,
      });
      if (res.ok && res.entry) {
        setScheduleEntries((prev) =>
          prev.map((e) => (e.id === editingScheduleId ? res.entry! : e)).sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
        );
        setEditingScheduleId(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update schedule entry");
    }
  };

  const handleDeleteSchedule = async (id: string) => {
    setError("");
    setDeletingScheduleId(id);
    try {
      await apiDelete(`/api/fleet-schedule/${id}`);
      setScheduleEntries((prev) => prev.filter((e) => e.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete schedule entry");
    } finally {
      setDeletingScheduleId(null);
    }
  };

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

        {canToggleStatus && (
          <>
            <h3 className="management-section-title" style={{ marginTop: "2rem" }}>Schedule</h3>
            <p className="management-intro">
              Plan when trucks are off-road or in for service so you can plan accordingly.
            </p>

            <section className="management-section">
              <h4 className="management-section-title">Add schedule entry</h4>
              <form className="management-create-form" onSubmit={handleAddSchedule}>
                <label>
                  Truck
                  <select
                    value={scheduleLorryId}
                    onChange={(e) => setScheduleLorryId(e.target.value)}
                    className="management-select"
                    required
                  >
                    <option value="">— Select truck —</option>
                    {lorries.map((l) => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Type
                  <select
                    value={scheduleType}
                    onChange={(e) => setScheduleType(e.target.value as ScheduleType)}
                    className="management-select"
                  >
                    {SCHEDULE_TYPES.map((t) => (
                      <option key={t} value={t}>{SCHEDULE_TYPE_LABELS[t]}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Start (date & time)
                  <input
                    type="datetime-local"
                    value={scheduleStartAt}
                    onChange={(e) => setScheduleStartAt(e.target.value)}
                    className="management-input"
                    required
                  />
                </label>
                <label>
                  End (date & time, optional)
                  <input
                    type="datetime-local"
                    value={scheduleEndAt}
                    onChange={(e) => setScheduleEndAt(e.target.value)}
                    className="management-input"
                  />
                </label>
                <label>
                  Notes (optional)
                  <input
                    type="text"
                    value={scheduleNotes}
                    onChange={(e) => setScheduleNotes(e.target.value)}
                    placeholder="e.g. MOT, annual service"
                    className="management-input"
                  />
                </label>
                <button type="submit" className="management-btn management-btn-primary" disabled={addingSchedule || lorries.length === 0}>
                  {addingSchedule ? "Adding…" : "Add"}
                </button>
              </form>
            </section>

            <section className="management-section">
              <h4 className="management-section-title">Scheduled entries</h4>
              {scheduleLoading ? (
                <p className="management-loading">Loading schedule…</p>
              ) : scheduleEntries.length === 0 ? (
                <p className="management-loading">No schedule entries yet.</p>
              ) : (
                <div className="management-table-wrap">
                  <table className="management-table">
                    <thead>
                      <tr>
                        <th>Truck</th>
                        <th>Type</th>
                        <th>Start</th>
                        <th>End</th>
                        <th>Notes</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scheduleEntries.map((entry) => (
                        <tr key={entry.id}>
                          <td>{entry.lorry?.name ?? entry.lorryId}</td>
                          <td>
                            {editingScheduleId === entry.id ? (
                              <select
                                value={editScheduleType}
                                onChange={(e) => setEditScheduleType(e.target.value as ScheduleType)}
                                className="management-select management-select-small"
                              >
                                {SCHEDULE_TYPES.map((t) => (
                                  <option key={t} value={t}>{SCHEDULE_TYPE_LABELS[t]}</option>
                                ))}
                              </select>
                            ) : (
                              SCHEDULE_TYPE_LABELS[entry.type] ?? entry.type
                            )}
                          </td>
                          <td>
                            {editingScheduleId === entry.id ? (
                              <input
                                type="datetime-local"
                                value={editScheduleStartAt}
                                onChange={(e) => setEditScheduleStartAt(e.target.value)}
                                className="management-input management-input-inline"
                              />
                            ) : (
                              new Date(entry.startAt).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })
                            )}
                          </td>
                          <td>
                            {editingScheduleId === entry.id ? (
                              <input
                                type="datetime-local"
                                value={editScheduleEndAt}
                                onChange={(e) => setEditScheduleEndAt(e.target.value)}
                                className="management-input management-input-inline"
                              />
                            ) : entry.endAt ? (
                              new Date(entry.endAt).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })
                            ) : (
                              "—"
                            )}
                          </td>
                          <td>
                            {editingScheduleId === entry.id ? (
                              <input
                                type="text"
                                value={editScheduleNotes}
                                onChange={(e) => setEditScheduleNotes(e.target.value)}
                                className="management-input management-input-inline"
                                placeholder="Optional"
                              />
                            ) : (
                              entry.notes ?? "—"
                            )}
                          </td>
                          <td>
                            {editingScheduleId === entry.id ? (
                              <>
                                <button type="button" className="management-btn management-btn-small" onClick={handleUpdateSchedule}>Save</button>
                                <button type="button" className="management-btn management-btn-small" onClick={() => setEditingScheduleId(null)}>Cancel</button>
                              </>
                            ) : (
                              <>
                                <button type="button" className="management-btn management-btn-small management-btn-link" onClick={() => startEditSchedule(entry)}>Edit</button>
                                <button
                                  type="button"
                                  className="management-btn management-btn-small management-btn-danger"
                                  onClick={() => handleDeleteSchedule(entry.id)}
                                  disabled={deletingScheduleId === entry.id}
                                >
                                  {deletingScheduleId === entry.id ? "Deleting…" : "Remove"}
                                </button>
                              </>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </>
  );
};
