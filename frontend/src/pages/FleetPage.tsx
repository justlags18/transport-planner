import { useCallback, useEffect, useMemo, useState } from "react";
import { apiGet, apiPatch, apiPost, apiDelete } from "../api/client";
import { useAuth } from "../context/AuthContext";

type LorryRow = {
  id: string;
  name: string;
  capacityPallets: number;
  usedPallets: number;
  assignments: { id: string }[];
  status?: "on" | "off" | "service";
};

type TrailerStatus = "on_road" | "off_road" | "storage" | "spare";

type TrailerRow = {
  id: string;
  number: string;
  status: TrailerStatus;
  lorryId?: string | null;
  lorry?: { id: string; name: string } | null;
};

const TRAILER_STATUS_LABELS: Record<TrailerStatus, string> = {
  on_road: "ON ROAD",
  off_road: "OFF ROAD",
  storage: "STORAGE",
  spare: "SPARE",
};

const TRAILER_SCHEDULE_TYPES = ["on_road", "off_road", "storage", "spare"] as const;
type TrailerScheduleType = (typeof TRAILER_SCHEDULE_TYPES)[number];
const TRAILER_SCHEDULE_LABELS: Record<TrailerScheduleType, string> = {
  on_road: "On road",
  off_road: "Off road",
  storage: "Storage",
  spare: "Spare",
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

type TrailerScheduleEntry = {
  id: string;
  trailerId: string;
  type: string;
  startAt: string;
  endAt: string | null;
  notes: string | null;
  trailer?: { id: string; number: string };
};

type FleetScheduleResponse = { ok: boolean; entries: FleetScheduleEntry[] };
type CreateScheduleResponse = { ok: boolean; entry: FleetScheduleEntry };
type UpdateScheduleResponse = { ok: boolean; entry: FleetScheduleEntry };

type TrailerScheduleResponse = { ok: boolean; entries: TrailerScheduleEntry[] };
type CreateTrailerScheduleResponse = { ok: boolean; entry: TrailerScheduleEntry };
type UpdateTrailerScheduleResponse = { ok: boolean; entry: TrailerScheduleEntry };

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
  const [activeTab, setActiveTab] = useState<"trucks" | "trailers">("trucks");
  const [lorries, setLorries] = useState<LorryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [trailers, setTrailers] = useState<TrailerRow[]>([]);
  const [trailersLoading, setTrailersLoading] = useState(false);
  const [trailerAssignById, setTrailerAssignById] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [statusById, setStatusById] = useState<Record<string, "on" | "off" | "service">>({});

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

  const [trailerScheduleEntries, setTrailerScheduleEntries] = useState<TrailerScheduleEntry[]>([]);
  const [trailerScheduleLoading, setTrailerScheduleLoading] = useState(false);
  const [trailerScheduleTrailerId, setTrailerScheduleTrailerId] = useState("");
  const [trailerScheduleType, setTrailerScheduleType] = useState<TrailerScheduleType>("on_road");
  const [trailerScheduleStartAt, setTrailerScheduleStartAt] = useState("");
  const [trailerScheduleEndAt, setTrailerScheduleEndAt] = useState("");
  const [trailerScheduleNotes, setTrailerScheduleNotes] = useState("");
  const [addingTrailerSchedule, setAddingTrailerSchedule] = useState(false);
  const [editingTrailerScheduleId, setEditingTrailerScheduleId] = useState<string | null>(null);
  const [editTrailerScheduleType, setEditTrailerScheduleType] = useState<TrailerScheduleType>("on_road");
  const [editTrailerScheduleStartAt, setEditTrailerScheduleStartAt] = useState("");
  const [editTrailerScheduleEndAt, setEditTrailerScheduleEndAt] = useState("");
  const [editTrailerScheduleNotes, setEditTrailerScheduleNotes] = useState("");
  const [deletingTrailerScheduleId, setDeletingTrailerScheduleId] = useState<string | null>(null);

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

  const loadTrailerSchedule = useCallback(async () => {
    if (!canToggleStatus) return;
    setTrailerScheduleLoading(true);
    setError("");
    try {
      const res = await apiGet<TrailerScheduleResponse>("/api/trailer-schedule");
      setTrailerScheduleEntries(res.entries ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load trailer schedule");
    } finally {
      setTrailerScheduleLoading(false);
    }
  }, [canToggleStatus]);

  const loadTrailers = useCallback(async () => {
    setTrailersLoading(true);
    setError("");
    try {
      const items = await apiGet<TrailerRow[]>("/api/trailers");
      const sorted = (Array.isArray(items) ? items : []).sort((a, b) => a.number.localeCompare(b.number));
      setTrailers(sorted);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load trailers");
    } finally {
      setTrailersLoading(false);
    }
  }, []);

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

  useEffect(() => {
    if (activeTab === "trailers" && canToggleStatus) loadTrailerSchedule();
  }, [activeTab, canToggleStatus, loadTrailerSchedule]);

  useEffect(() => {
    if (activeTab === "trailers" || activeTab === "trucks") loadTrailers();
  }, [activeTab, loadTrailers]);

  useEffect(() => {
    setTrailerAssignById((prev) => {
      const next = { ...prev };
      for (const trailer of trailers) {
        if (next[trailer.id] === undefined) {
          next[trailer.id] = trailer.lorryId ?? "";
        }
      }
      return next;
    });
  }, [trailers]);

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

  const handleAddTrailerSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trailerScheduleTrailerId || !trailerScheduleStartAt) {
      setError("Trailer and start date/time are required.");
      return;
    }
    if (trailerScheduleType === "off_road") {
      const selectedTrailer = trailers.find((t) => t.id === trailerScheduleTrailerId);
      if (selectedTrailer?.lorryId) {
        const ok = window.confirm(
          "This trailer is assigned to a truck. Scheduling OFF ROAD will unassign it when the start time begins. Continue?",
        );
        if (!ok) return;
      }
    }
    setError("");
    setAddingTrailerSchedule(true);
    try {
      const res = await apiPost<CreateTrailerScheduleResponse>("/api/trailer-schedule", {
        trailerId: trailerScheduleTrailerId,
        type: trailerScheduleType,
        startAt: fromDatetimeLocal(trailerScheduleStartAt) || new Date(trailerScheduleStartAt).toISOString(),
        endAt: trailerScheduleEndAt ? fromDatetimeLocal(trailerScheduleEndAt) || new Date(trailerScheduleEndAt).toISOString() : null,
        notes: trailerScheduleNotes.trim() || null,
      });
      if (res.ok && res.entry) {
        setTrailerScheduleEntries((prev) =>
          [...prev, res.entry!].sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()),
        );
        setTrailerScheduleTrailerId("");
        setTrailerScheduleType("on_road");
        setTrailerScheduleStartAt("");
        setTrailerScheduleEndAt("");
        setTrailerScheduleNotes("");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add trailer schedule entry");
    } finally {
      setAddingTrailerSchedule(false);
    }
  };

  const startEditTrailerSchedule = (entry: TrailerScheduleEntry) => {
    setEditingTrailerScheduleId(entry.id);
    setEditTrailerScheduleType((entry.type as TrailerScheduleType) || "on_road");
    setEditTrailerScheduleStartAt(toDatetimeLocal(entry.startAt));
    setEditTrailerScheduleEndAt(entry.endAt ? toDatetimeLocal(entry.endAt) : "");
    setEditTrailerScheduleNotes(entry.notes ?? "");
  };

  const handleUpdateTrailerSchedule = async () => {
    if (!editingTrailerScheduleId) return;
    setError("");
    if (editTrailerScheduleType === "off_road") {
      const entry = trailerScheduleEntries.find((e) => e.id === editingTrailerScheduleId);
      const selectedTrailer = trailers.find((t) => t.id === entry?.trailerId);
      if (selectedTrailer?.lorryId) {
        const ok = window.confirm(
          "This trailer is assigned to a truck. Scheduling OFF ROAD will unassign it when the start time begins. Continue?",
        );
        if (!ok) return;
      }
    }
    try {
      const res = await apiPatch<UpdateTrailerScheduleResponse>(`/api/trailer-schedule/${editingTrailerScheduleId}`, {
        type: editTrailerScheduleType,
        startAt: fromDatetimeLocal(editTrailerScheduleStartAt) || new Date(editTrailerScheduleStartAt).toISOString(),
        endAt: editTrailerScheduleEndAt ? fromDatetimeLocal(editTrailerScheduleEndAt) || new Date(editTrailerScheduleEndAt).toISOString() : null,
        notes: editTrailerScheduleNotes.trim() || null,
      });
      if (res.ok && res.entry) {
        setTrailerScheduleEntries((prev) =>
          prev
            .map((e) => (e.id === editingTrailerScheduleId ? res.entry! : e))
            .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()),
        );
        setEditingTrailerScheduleId(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update trailer schedule entry");
    }
  };

  const handleDeleteTrailerSchedule = async (id: string) => {
    setError("");
    setDeletingTrailerScheduleId(id);
    try {
      await apiDelete(`/api/trailer-schedule/${id}`);
      setTrailerScheduleEntries((prev) => prev.filter((e) => e.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete trailer schedule entry");
    } finally {
      setDeletingTrailerScheduleId(null);
    }
  };

  return (
    <>
      <h2 className="dashboard-page-title">Fleet</h2>
      <div className="dashboard-page-content">
        <nav className="management-tabs" aria-label="Fleet sections">
          <button
            type="button"
            className={`management-tab${activeTab === "trucks" ? " management-tab--active" : ""}`}
            onClick={() => setActiveTab("trucks")}
          >
            Trucks
          </button>
          <button
            type="button"
            className={`management-tab${activeTab === "trailers" ? " management-tab--active" : ""}`}
            onClick={() => setActiveTab("trailers")}
          >
            Trailers
          </button>
        </nav>

        {error ? (
          <div className="management-error" role="alert">
            {error}
          </div>
        ) : null}

        {activeTab === "trucks" && (
          <>
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
                  const attachedTrailers = trailers
                    .filter((t) => t.lorryId === lorry.id)
                    .map((t) => t.number);
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

                  const statusLabel = status === "on" ? "ON ROAD" : status === "service" ? "SERVICE" : "OFF ROAD";
                  const statusMeta = status === "on" ? "Available" : status === "service" ? "Service" : "Unavailable";

                  return (
                    <article key={lorry.id} className="fleet-card">
                      <div className="fleet-card-header">
                        <h3 className="fleet-card-title">{lorry.name}</h3>
                        <span className={`fleet-card-status ${status}`}>
                          {statusLabel}
                        </span>
                      </div>
                      {attachedTrailers.length > 0 && (
                        <div className="fleet-card-subtitle">
                          Trailer {attachedTrailers.join(", ")}
                        </div>
                      )}
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
                        <span>{statusMeta}</span>
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
          </>
        )}

        {activeTab === "trailers" && (
          <>
            {trailersLoading ? (
              <p className="management-loading">Loading trailers…</p>
            ) : trailers.length === 0 ? (
              <p className="management-loading">No trailers yet.</p>
            ) : (
              <div className="fleet-grid">
                {trailers.map((trailer) => {
                  const status = trailer.status ?? "spare";
                  const statusLabel = TRAILER_STATUS_LABELS[status] ?? status;
                  const attachedLabel = trailer.lorry?.name ?? "Unassigned";
                  const selectedLorryId = trailerAssignById[trailer.id] ?? (trailer.lorryId ?? "");
                  const hasAssignChange = selectedLorryId !== (trailer.lorryId ?? "");
                  const updateStatus = async (nextStatus: TrailerStatus) => {
                    if (!canToggleStatus) return;
                    if (nextStatus === "off_road" && trailer.lorryId) {
                      const ok = window.confirm(
                        "This trailer is assigned to a truck. Set to OFF ROAD and unassign it?",
                      );
                      if (!ok) return;
                    }
                    try {
                      await apiPatch(`/api/trailers/${trailer.id}`, { status: nextStatus });
                      setTrailers((prev) =>
                        prev.map((t) =>
                          t.id === trailer.id
                            ? {
                                ...t,
                                status: nextStatus,
                                ...(nextStatus === "off_road" ? { lorryId: null, lorry: null } : {}),
                              }
                            : t,
                        ),
                      );
                      if (nextStatus === "off_road") {
                        setTrailerAssignById((prev) => ({ ...prev, [trailer.id]: "" }));
                      }
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Failed to update trailer status");
                    }
                  };
                  const assignTrailer = async () => {
                    if (!canToggleStatus) return;
                    try {
                      await apiPatch(`/api/trailers/${trailer.id}`, {
                        lorryId: selectedLorryId || null,
                      });
                      setTrailers((prev) =>
                        prev.map((t) =>
                          t.id === trailer.id ? { ...t, lorryId: selectedLorryId || null } : t,
                        ),
                      );
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Failed to assign trailer");
                    }
                  };

                  return (
                    <article key={trailer.id} className="fleet-card">
                      <div className="fleet-card-header">
                        <h3 className="fleet-card-title">{trailer.number}</h3>
                        <span className={`fleet-card-status trailer ${status}`}>
                          {statusLabel}
                        </span>
                      </div>
                      <div className="fleet-card-status-row">
                        <span className="fleet-card-badge">
                          {attachedLabel === "Unassigned" ? "Unassigned" : `Attached: ${attachedLabel}`}
                        </span>
                        {canToggleStatus ? (
                          <select
                            className="fleet-toggle-select management-select management-select-small"
                            value={status}
                            onChange={(e) => updateStatus(e.target.value as TrailerStatus)}
                          >
                            {Object.keys(TRAILER_STATUS_LABELS).map((key) => (
                              <option key={key} value={key}>
                                {TRAILER_STATUS_LABELS[key as TrailerStatus]}
                              </option>
                            ))}
                          </select>
                        ) : null}
                      </div>
                      <div className="fleet-card-meta">
                        <span>Status</span>
                        <span>{statusLabel}</span>
                      </div>
                      <div className="fleet-card-meta">
                        <span>Truck</span>
                        <span>{attachedLabel}</span>
                      </div>
                      {canToggleStatus ? (
                        <div className="fleet-card-meta">
                          <span>Assign</span>
                          <span style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                            <select
                              className="management-select management-select-small"
                              value={selectedLorryId}
                              onChange={(e) =>
                                setTrailerAssignById((prev) => ({
                                  ...prev,
                                  [trailer.id]: e.target.value,
                                }))
                              }
                            >
                              <option value="">— Unassigned —</option>
                              {lorries.map((l) => (
                                <option key={l.id} value={l.id}>{l.name}</option>
                              ))}
                            </select>
                            <button
                              type="button"
                              className="management-btn management-btn-small"
                              onClick={assignTrailer}
                              disabled={!hasAssignChange}
                            >
                              Assign
                            </button>
                          </span>
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            )}
            {canToggleStatus && (
              <>
                <h3 className="management-section-title" style={{ marginTop: "2rem" }}>Trailer schedule</h3>
                <p className="management-intro">
                  Plan when trailers are on-road, off-road, in storage, or spare.
                </p>

                <section className="management-section">
                  <h4 className="management-section-title">Add schedule entry</h4>
                  <form className="management-create-form" onSubmit={handleAddTrailerSchedule}>
                    <label>
                      Trailer
                      <select
                        value={trailerScheduleTrailerId}
                        onChange={(e) => setTrailerScheduleTrailerId(e.target.value)}
                        className="management-select"
                        required
                      >
                        <option value="">— Select trailer —</option>
                        {trailers.map((t) => (
                          <option key={t.id} value={t.id}>{t.number}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Type
                      <select
                        value={trailerScheduleType}
                        onChange={(e) => setTrailerScheduleType(e.target.value as TrailerScheduleType)}
                        className="management-select"
                      >
                        {TRAILER_SCHEDULE_TYPES.map((t) => (
                          <option key={t} value={t}>{TRAILER_SCHEDULE_LABELS[t]}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Start (date & time)
                      <input
                        type="datetime-local"
                        value={trailerScheduleStartAt}
                        onChange={(e) => setTrailerScheduleStartAt(e.target.value)}
                        className="management-input"
                        required
                      />
                    </label>
                    <label>
                      End (date & time, optional)
                      <input
                        type="datetime-local"
                        value={trailerScheduleEndAt}
                        onChange={(e) => setTrailerScheduleEndAt(e.target.value)}
                        className="management-input"
                      />
                    </label>
                    <label>
                      Notes (optional)
                      <input
                        type="text"
                        value={trailerScheduleNotes}
                        onChange={(e) => setTrailerScheduleNotes(e.target.value)}
                        placeholder="e.g. annual check"
                        className="management-input"
                      />
                    </label>
                    <button type="submit" className="management-btn management-btn-primary" disabled={addingTrailerSchedule || trailers.length === 0}>
                      {addingTrailerSchedule ? "Adding…" : "Add"}
                    </button>
                  </form>
                </section>

                <section className="management-section">
                  <h4 className="management-section-title">Scheduled entries</h4>
                  {trailerScheduleLoading ? (
                    <p className="management-loading">Loading schedule…</p>
                  ) : trailerScheduleEntries.length === 0 ? (
                    <p className="management-loading">No schedule entries yet.</p>
                  ) : (
                    <div className="management-table-wrap">
                      <table className="management-table">
                        <thead>
                          <tr>
                            <th>Trailer</th>
                            <th>Type</th>
                            <th>Start</th>
                            <th>End</th>
                            <th>Notes</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {trailerScheduleEntries.map((entry) => (
                            <tr key={entry.id}>
                              <td>{entry.trailer?.number ?? entry.trailerId}</td>
                              <td>
                                {editingTrailerScheduleId === entry.id ? (
                                  <select
                                    value={editTrailerScheduleType}
                                    onChange={(e) => setEditTrailerScheduleType(e.target.value as TrailerScheduleType)}
                                    className="management-select management-select-small"
                                  >
                                    {TRAILER_SCHEDULE_TYPES.map((t) => (
                                      <option key={t} value={t}>{TRAILER_SCHEDULE_LABELS[t]}</option>
                                    ))}
                                  </select>
                                ) : (
                                  TRAILER_SCHEDULE_LABELS[entry.type as TrailerScheduleType] ?? entry.type
                                )}
                              </td>
                              <td>
                                {editingTrailerScheduleId === entry.id ? (
                                  <input
                                    type="datetime-local"
                                    value={editTrailerScheduleStartAt}
                                    onChange={(e) => setEditTrailerScheduleStartAt(e.target.value)}
                                    className="management-input management-input-inline"
                                  />
                                ) : (
                                  new Date(entry.startAt).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })
                                )}
                              </td>
                              <td>
                                {editingTrailerScheduleId === entry.id ? (
                                  <input
                                    type="datetime-local"
                                    value={editTrailerScheduleEndAt}
                                    onChange={(e) => setEditTrailerScheduleEndAt(e.target.value)}
                                    className="management-input management-input-inline"
                                  />
                                ) : entry.endAt ? (
                                  new Date(entry.endAt).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })
                                ) : (
                                  "—"
                                )}
                              </td>
                              <td>
                                {editingTrailerScheduleId === entry.id ? (
                                  <input
                                    type="text"
                                    value={editTrailerScheduleNotes}
                                    onChange={(e) => setEditTrailerScheduleNotes(e.target.value)}
                                    className="management-input management-input-inline"
                                    placeholder="Optional"
                                  />
                                ) : (
                                  entry.notes ?? "—"
                                )}
                              </td>
                              <td>
                                {editingTrailerScheduleId === entry.id ? (
                                  <>
                                    <button type="button" className="management-btn management-btn-small" onClick={handleUpdateTrailerSchedule}>Save</button>
                                    <button type="button" className="management-btn management-btn-small" onClick={() => setEditingTrailerScheduleId(null)}>Cancel</button>
                                  </>
                                ) : (
                                  <>
                                    <button type="button" className="management-btn management-btn-small management-btn-link" onClick={() => startEditTrailerSchedule(entry)}>Edit</button>
                                    <button
                                      type="button"
                                      className="management-btn management-btn-small management-btn-danger"
                                      onClick={() => handleDeleteTrailerSchedule(entry.id)}
                                      disabled={deletingTrailerScheduleId === entry.id}
                                    >
                                      {deletingTrailerScheduleId === entry.id ? "Deleting…" : "Remove"}
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
          </>
        )}
      </div>
    </>
  );
};
