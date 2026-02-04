import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { canManageDrivers } from "../permissions";
import { apiGet, apiPost, apiPatch, apiDelete } from "../api/client";

type DriverRow = {
  id: string;
  name: string;
  phoneNumber: string | null;
  agency: string | null;
  idNumber: string | null;
  createdAt: string;
  updatedAt: string;
};

type DriversResponse = { ok: boolean; drivers: DriverRow[] };

export const DriversPage = () => {
  const { user } = useAuth();
  const role = user?.role ?? "Clerk";
  const canEdit = canManageDrivers(role);

  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [addName, setAddName] = useState("");
  const [addPhoneNumber, setAddPhoneNumber] = useState("");
  const [addAgency, setAddAgency] = useState("");
  const [addIdNumber, setAddIdNumber] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhoneNumber, setEditPhoneNumber] = useState("");
  const [editAgency, setEditAgency] = useState("");
  const [editIdNumber, setEditIdNumber] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadDrivers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiGet<DriversResponse>("/api/drivers");
      setDrivers(res.drivers ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load drivers");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDrivers();
  }, [loadDrivers]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addName.trim()) return;
    setAdding(true);
    setError("");
    try {
      await apiPost<{ ok: boolean; driver: DriverRow }>("/api/drivers", {
        name: addName.trim(),
        phoneNumber: addPhoneNumber.trim() || undefined,
        agency: addAgency.trim() || undefined,
        idNumber: addIdNumber.trim() || undefined,
      });
      setAddName("");
      setAddPhoneNumber("");
      setAddAgency("");
      setAddIdNumber("");
      setShowAddForm(false);
      loadDrivers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add driver");
    } finally {
      setAdding(false);
    }
  };

  const startEdit = (d: DriverRow) => {
    setEditingId(d.id);
    setEditName(d.name);
    setEditPhoneNumber(d.phoneNumber ?? "");
    setEditAgency(d.agency ?? "");
    setEditIdNumber(d.idNumber ?? "");
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const handleSaveEdit = async (id: string) => {
    setSaving(true);
    setError("");
    try {
      await apiPatch<{ ok: boolean; driver: DriverRow }>(`/api/drivers/${id}`, {
        name: editName.trim(),
        phoneNumber: editPhoneNumber.trim() || null,
        agency: editAgency.trim() || null,
        idNumber: editIdNumber.trim() || null,
      });
      setEditingId(null);
      loadDrivers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update driver");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this driver?")) return;
    setDeletingId(id);
    setError("");
    try {
      await apiDelete(`/api/drivers/${id}`);
      if (editingId === id) setEditingId(null);
      loadDrivers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete driver");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <>
      <h2 className="dashboard-page-title">Drivers</h2>
      <div className="dashboard-page-content">
        <p className="management-intro">
          Driver contact and agency details. Everyone can view; only Management and Developers can add or edit.
        </p>

        {error ? (
          <div className="management-error" role="alert">
            {error}
          </div>
        ) : null}

        <section className="management-section">
          <div className="management-section-header">
            <h3 className="management-section-title">Drivers</h3>
            {canEdit && (
              <button
                type="button"
                className="management-btn management-btn-primary"
                onClick={() => setShowAddForm((v) => !v)}
              >
                {showAddForm ? "Cancel" : "Add driver"}
              </button>
            )}
          </div>

          {canEdit && showAddForm && (
            <form
              className="management-create-form"
              onSubmit={handleAdd}
              style={{ marginBottom: "1rem" }}
            >
              <label>
                Name *
                <input
                  className="management-input"
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  placeholder="Driver name"
                  required
                />
              </label>
              <label>
                Phone number
                <input
                  className="management-input"
                  type="tel"
                  value={addPhoneNumber}
                  onChange={(e) => setAddPhoneNumber(e.target.value)}
                  placeholder="Phone"
                />
              </label>
              <label>
                Agency
                <input
                  className="management-input"
                  value={addAgency}
                  onChange={(e) => setAddAgency(e.target.value)}
                  placeholder="Agency"
                />
              </label>
              <label>
                ID Number
                <input
                  className="management-input"
                  value={addIdNumber}
                  onChange={(e) => setAddIdNumber(e.target.value)}
                  placeholder="ID Number"
                />
              </label>
              <button type="submit" className="management-btn management-btn-primary" disabled={adding}>
                {adding ? "Adding…" : "Add"}
              </button>
            </form>
          )}

          {loading ? (
            <p className="management-loading">Loading drivers…</p>
          ) : (
            <div className="management-table-wrap">
              <table className="management-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Phone number</th>
                    <th>Agency</th>
                    <th>ID Number</th>
                    {canEdit ? <th>Actions</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {drivers.length === 0 ? (
                    <tr>
                      <td colSpan={canEdit ? 5 : 4} className="management-muted">
                        No drivers yet. {canEdit ? "Add a driver above." : ""}
                      </td>
                    </tr>
                  ) : (
                    drivers.map((d) => (
                      <tr key={d.id}>
                        {editingId === d.id ? (
                          <>
                            <td>
                              <input
                                className="management-input management-input-inline"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                placeholder="Name"
                              />
                            </td>
                            <td>
                              <input
                                className="management-input management-input-inline"
                                type="tel"
                                value={editPhoneNumber}
                                onChange={(e) => setEditPhoneNumber(e.target.value)}
                                placeholder="Phone"
                              />
                            </td>
                            <td>
                              <input
                                className="management-input management-input-inline"
                                value={editAgency}
                                onChange={(e) => setEditAgency(e.target.value)}
                                placeholder="Agency"
                              />
                            </td>
                            <td>
                              <input
                                className="management-input management-input-inline"
                                value={editIdNumber}
                                onChange={(e) => setEditIdNumber(e.target.value)}
                                placeholder="ID Number"
                              />
                            </td>
                            <td>
                              <button
                                type="button"
                                className="management-btn management-btn-small"
                                onClick={() => handleSaveEdit(d.id)}
                                disabled={saving || !editName.trim()}
                              >
                                {saving ? "…" : "Save"}
                              </button>
                              <button
                                type="button"
                                className="management-btn management-btn-small"
                                onClick={cancelEdit}
                                disabled={saving}
                              >
                                Cancel
                              </button>
                            </td>
                          </>
                        ) : (
                          <>
                            <td>{d.name}</td>
                            <td>{d.phoneNumber ?? "—"}</td>
                            <td>{d.agency ?? "—"}</td>
                            <td>{d.idNumber ?? "—"}</td>
                            {canEdit ? (
                              <td>
                                <button
                                  type="button"
                                  className="management-btn management-btn-small"
                                  onClick={() => startEdit(d)}
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="management-btn management-btn-small management-btn-danger"
                                  onClick={() => handleDelete(d.id)}
                                  disabled={deletingId === d.id}
                                >
                                  {deletingId === d.id ? "…" : "Delete"}
                                </button>
                              </td>
                            ) : null}
                          </>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  );
};
