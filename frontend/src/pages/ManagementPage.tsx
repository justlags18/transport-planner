import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { apiGet, apiPost, apiPatch, apiDelete } from "../api/client";
import { ROLES, canMakeDeveloper, type Role } from "../permissions";
import { RoleBadge } from "../components/RoleBadge";

const TRUCK_CLASSES = ["Class1", "Class2", "Vans"] as const;
type TruckClass = (typeof TRUCK_CLASSES)[number];

const TRUCK_CLASS_LABELS: Record<string, string> = {
  Class1: "Class 1",
  Class2: "Class 2",
  Vans: "Vans",
};

const TRUCK_CLASS_CAPACITY: Record<string, number> = {
  Class1: 26,
  Class2: 16,
  Vans: 3,
};

type UserRow = {
  id: string;
  email: string;
  role: string;
  forcePasswordChange: boolean;
  createdAt: string;
};

type LorryRow = {
  id: string;
  name: string;
  truckClass?: string;
  capacityPallets: number;
  createdAt?: string;
  updatedAt?: string;
};

type ListUsersResponse = { ok: boolean; users: UserRow[] };
type CreateUserResponse = { ok: boolean; user: UserRow; temporaryPassword?: string };
type ResetPasswordResponse = { ok: boolean; temporaryPassword: string };
type UpdateRoleResponse = { ok: boolean; user: UserRow };

export const ManagementPage = () => {
  const { user: currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState<"users" | "trucks">("users");

  // Users state
  const [users, setUsers] = useState<UserRow[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [createEmail, setCreateEmail] = useState("");
  const [createRole, setCreateRole] = useState<Role>("Clerk");
  const [createPassword, setCreatePassword] = useState("");
  const [createGeneratePassword, setCreateGeneratePassword] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreateUserModal, setShowCreateUserModal] = useState(false);
  const [createdTempPassword, setCreatedTempPassword] = useState<string | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [resetTempPassword, setResetTempPassword] = useState<{ id: string; password: string } | null>(null);
  const [changingRoleId, setChangingRoleId] = useState<string | null>(null);
  const [newRole, setNewRole] = useState<Role>("Clerk");

  // Trucks state
  const [lorries, setLorries] = useState<LorryRow[]>([]);
  const [lorriesLoading, setLorriesLoading] = useState(false);
  const [truckName, setTruckName] = useState("");
  const [truckClass, setTruckClass] = useState<TruckClass>("Class1");
  const [truckCapacity, setTruckCapacity] = useState<number>(26);
  const [addingTruck, setAddingTruck] = useState(false);
  const [editingLorryId, setEditingLorryId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editClass, setEditClass] = useState<TruckClass>("Class1");
  const [editCapacity, setEditCapacity] = useState(26);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [error, setError] = useState("");

  const isDeveloper = currentUser?.role === "Developer";
  const canSetDeveloperRole = canMakeDeveloper(currentUser?.role ?? "Clerk");
  const availableRoles = canSetDeveloperRole ? ROLES : ROLES.filter((r) => r !== "Developer");

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    setError("");
    try {
      const res = await apiGet<ListUsersResponse>("/api/users");
      if (res.ok && res.users) setUsers(res.users);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load users");
    } finally {
      setUsersLoading(false);
    }
  }, []);

  const loadLorries = useCallback(async () => {
    setLorriesLoading(true);
    setError("");
    try {
      const items = await apiGet<LorryRow[]>("/api/lorries");
      // Sort: Class1 first, then Class2; within each class sort by name
      const sorted = (Array.isArray(items) ? items : []).sort((a, b) => {
        const aClass = a.truckClass || "Class1";
        const bClass = b.truckClass || "Class1";
        // Order: Class1, Class2, Vans
        const order: Record<string, number> = { Class1: 1, Class2: 2, Vans: 3 };
        const aOrder = order[aClass] ?? 99;
        const bOrder = order[bClass] ?? 99;
        if (aOrder !== bOrder) {
          return aOrder - bOrder;
        }
        return a.name.localeCompare(b.name);
      });
      setLorries(sorted);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load trucks");
    } finally {
      setLorriesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "users") loadUsers();
  }, [activeTab, loadUsers]);

  useEffect(() => {
    if (activeTab === "trucks") loadLorries();
  }, [activeTab, loadLorries]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setCreating(true);
    setCreatedTempPassword(null);
    try {
      const body = createGeneratePassword
        ? { email: createEmail.trim().toLowerCase(), role: createRole }
        : { email: createEmail.trim().toLowerCase(), role: createRole, password: createPassword };
      const res = await apiPost<CreateUserResponse>("/api/users", body);
      if (res.ok && res.user) {
        setUsers((prev) => [...prev, res.user!].sort((a, b) => a.email.localeCompare(b.email)));
        if (res.temporaryPassword) setCreatedTempPassword(res.temporaryPassword);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create user");
    } finally {
      setCreating(false);
    }
  };

  const closeCreateUserModal = () => {
    setShowCreateUserModal(false);
    setCreateEmail("");
    setCreateRole("Clerk");
    setCreatePassword("");
    setCreateGeneratePassword(true);
    setCreatedTempPassword(null);
    setError("");
  };

  const handleResetPassword = async (id: string) => {
    setError("");
    setResettingId(id);
    setResetTempPassword(null);
    try {
      const res = await apiPatch<ResetPasswordResponse>(`/api/users/${id}/reset-password`, {});
      if (res.ok && res.temporaryPassword) {
        setResetTempPassword({ id, password: res.temporaryPassword });
        loadUsers();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reset password");
    } finally {
      setResettingId(null);
    }
  };

  const handleChangeRole = async (id: string) => {
    setError("");
    try {
      const res = await apiPatch<UpdateRoleResponse>(`/api/users/${id}/role`, { role: newRole });
      if (res.ok && res.user) {
        setUsers((prev) => prev.map((u) => (u.id === id ? res.user! : u)));
        setChangingRoleId(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update role");
    }
  };

  const handleAddTruck = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setAddingTruck(true);
    try {
      const lorry = await apiPost<LorryRow>("/api/lorries", {
        name: truckName.trim(),
        truckClass,
        capacityPallets: truckCapacity,
      });
      // Re-sort: Class1 first, then Class2, then Vans
      setLorries((prev) => {
        const updated = [...prev, lorry];
        const order: Record<string, number> = { Class1: 1, Class2: 2, Vans: 3 };
        return updated.sort((a, b) => {
          const aClass = a.truckClass || "Class1";
          const bClass = b.truckClass || "Class1";
          const aOrder = order[aClass] ?? 99;
          const bOrder = order[bClass] ?? 99;
          if (aOrder !== bOrder) return aOrder - bOrder;
          return a.name.localeCompare(b.name);
        });
      });
      setTruckName("");
      setTruckClass("Class1");
      setTruckCapacity(26);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add truck");
    } finally {
      setAddingTruck(false);
    }
  };

  const startEditLorry = (l: LorryRow) => {
    setEditingLorryId(l.id);
    setEditName(l.name);
    setEditClass((l.truckClass as TruckClass) || "Class1");
    setEditCapacity(l.capacityPallets);
  };

  const handleUpdateTruck = async () => {
    if (!editingLorryId) return;
    setError("");
    try {
      const updated = await apiPatch<LorryRow>(`/api/lorries/${editingLorryId}`, {
        name: editName.trim(),
        truckClass: editClass,
        capacityPallets: editCapacity,
      });
      // Re-sort: Class1 first, then Class2, then Vans
      setLorries((prev) => {
        const newList = prev.map((l) => (l.id === editingLorryId ? updated : l));
        const order: Record<string, number> = { Class1: 1, Class2: 2, Vans: 3 };
        return newList.sort((a, b) => {
          const aClass = a.truckClass || "Class1";
          const bClass = b.truckClass || "Class1";
          const aOrder = order[aClass] ?? 99;
          const bOrder = order[bClass] ?? 99;
          if (aOrder !== bOrder) return aOrder - bOrder;
          return a.name.localeCompare(b.name);
        });
      });
      setEditingLorryId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update truck");
    }
  };

  const handleDeleteTruck = async (id: string) => {
    setError("");
    setDeletingId(id);
    try {
      await apiDelete(`/api/lorries/${id}`);
      setLorries((prev) => prev.filter((l) => l.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete truck");
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (s: string) => {
    try {
      return new Date(s).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
    } catch {
      return s;
    }
  };

  if (!currentUser || (currentUser.role !== "Developer" && currentUser.role !== "Management")) {
    return null;
  }

  return (
    <div className="management-page">
      <h2 className="dashboard-page-title">Management</h2>

      <nav className="management-tabs" aria-label="Management sections">
        <button
          type="button"
          className={`management-tab${activeTab === "users" ? " management-tab--active" : ""}`}
          onClick={() => setActiveTab("users")}
        >
          Users
        </button>
        <button
          type="button"
          className={`management-tab${activeTab === "trucks" ? " management-tab--active" : ""}`}
          onClick={() => setActiveTab("trucks")}
        >
          Trucks
        </button>
      </nav>

      {error && (
        <div className="management-error" role="alert">
          {error}
        </div>
      )}

      {activeTab === "users" && (
        <>
          <p className="management-intro">
            Reset passwords (triggers password change on next login) and change roles.
            {isDeveloper ? " Developers can assign any role." : " Management users cannot create or assign Developer roles."}
          </p>

          <section className="management-section">
            <div className="management-section-header">
              <h3 className="management-section-title">Users</h3>
              <button
                type="button"
                className="management-btn management-btn-primary"
                onClick={() => setShowCreateUserModal(true)}
              >
                Create user
              </button>
            </div>
            {usersLoading ? (
              <p className="management-loading">Loading users…</p>
            ) : (
              <div className="management-table-wrap">
                <table className="management-table">
                  <thead>
                    <tr>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Must change password</th>
                      <th>Created</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id}>
                        <td>{u.email}</td>
                        <td>
                          <div className="management-role-cell">
                            {changingRoleId === u.id ? (
                              <>
                                <span className="management-inline-role">
                                  <select
                                    value={newRole}
                                    onChange={(e) => setNewRole(e.target.value as Role)}
                                    className="management-select management-select-small"
                                  >
                                    {availableRoles.map((r) => (
                                      <option key={r} value={r}>{r}</option>
                                    ))}
                                  </select>
                                  <button type="button" className="management-btn management-btn-small" onClick={() => handleChangeRole(u.id)}>Save</button>
                                  <button type="button" className="management-btn management-btn-small" onClick={() => setChangingRoleId(null)}>Cancel</button>
                                </span>
                                <RoleBadge role={newRole} size="compact" />
                              </>
                            ) : (
                              <>
                                <span className="management-role-display">
                                  <RoleBadge role={u.role as Role} size="compact" />
                                  {(u.role !== "Developer" || isDeveloper) && (
                                    <button type="button" className="management-btn management-btn-small management-btn-link" onClick={() => { setChangingRoleId(u.id); setNewRole(u.role as Role); }}>Change</button>
                                  )}
                                </span>
                              </>
                            )}
                          </div>
                        </td>
                        <td>{u.forcePasswordChange ? "Yes" : "No"}</td>
                        <td>{formatDate(u.createdAt)}</td>
                        <td>
                          <button
                            type="button"
                            className="management-btn management-btn-small"
                            onClick={() => handleResetPassword(u.id)}
                            disabled={resettingId === u.id}
                          >
                            {resettingId === u.id ? "Resetting…" : "Reset password"}
                          </button>
                          {resetTempPassword?.id === u.id && (
                            <span className="management-temp-inline">Temp password: <code>{resetTempPassword.password}</code></span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {showCreateUserModal && (
            <div className="create-user-overlay" role="dialog" aria-modal="true" aria-labelledby="create-user-title">
              <div className="create-user-backdrop" onClick={closeCreateUserModal} aria-hidden="true" />
              <div className="create-user-card login-card">
                <h2 id="create-user-title" className="login-app-name">Create user</h2>
                <p className="login-subtitle">Add a new staff account</p>

                {createdTempPassword ? (
                  <>
                    <p className="create-user-success">User created. Share this temporary password once:</p>
                    <div className="create-user-temp-password">
                      <code>{createdTempPassword}</code>
                    </div>
                    <button type="button" className="login-submit" onClick={closeCreateUserModal}>
                      Done
                    </button>
                  </>
                ) : (
                  <form className="login-form" onSubmit={handleCreateUser}>
                    {error ? (
                      <div className="login-error" role="alert">{error}</div>
                    ) : null}

                    <label className="login-label" htmlFor="create-user-email">Email</label>
                    <input
                      id="create-user-email"
                      type="email"
                      className="login-input"
                      value={createEmail}
                      onChange={(e) => setCreateEmail(e.target.value)}
                      placeholder="user@example.com"
                      autoComplete="email"
                      required
                      autoFocus
                    />

                    <label className="login-label" htmlFor="create-user-role">Role</label>
                    <select
                      id="create-user-role"
                      value={createRole}
                      onChange={(e) => setCreateRole(e.target.value as Role)}
                      className="login-input create-user-select"
                    >
                      {availableRoles.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                    <div className="create-user-role-badge">
                      <RoleBadge role={createRole} size="default" />
                    </div>

                    <label className="login-remember">
                      <input
                        type="checkbox"
                        checked={createGeneratePassword}
                        onChange={(e) => setCreateGeneratePassword(e.target.checked)}
                        className="login-checkbox"
                      />
                      <span>Generate temporary password</span>
                    </label>

                    {!createGeneratePassword && (
                      <>
                        <label className="login-label" htmlFor="create-user-password">Password (min 8 characters)</label>
                        <input
                          id="create-user-password"
                          type="password"
                          className="login-input"
                          value={createPassword}
                          onChange={(e) => setCreatePassword(e.target.value)}
                          minLength={8}
                          autoComplete="new-password"
                        />
                      </>
                    )}

                    <button type="submit" className="login-submit" disabled={creating}>
                      {creating ? "Creating…" : "Create user"}
                    </button>
                    <button type="button" className="create-user-cancel" onClick={closeCreateUserModal}>
                      Cancel
                    </button>
                  </form>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {activeTab === "trucks" && (
        <>
          <p className="management-intro">
            Add, edit, or remove trucks. Each truck has a class (Class 1 or Class 2) and a pallet capacity.
          </p>

          <section className="management-section">
            <h3 className="management-section-title">Add truck</h3>
            <form className="management-create-form" onSubmit={handleAddTruck}>
              <label>
                Name
                <input
                  type="text"
                  value={truckName}
                  onChange={(e) => setTruckName(e.target.value)}
                  placeholder="e.g. Truck A"
                  required
                  className="management-input"
                />
              </label>
              <label>
                Class
                <select
                  value={truckClass}
                  onChange={(e) => {
                    const newClass = e.target.value as TruckClass;
                    setTruckClass(newClass);
                    setTruckCapacity(TRUCK_CLASS_CAPACITY[newClass] ?? 26);
                  }}
                  className="management-select"
                >
                  {TRUCK_CLASSES.map((c) => (
                    <option key={c} value={c}>{TRUCK_CLASS_LABELS[c]}</option>
                  ))}
                </select>
              </label>
              <label>
                Capacity (pallets)
                <input
                  type="number"
                  min={1}
                  value={truckCapacity}
                  onChange={(e) => setTruckCapacity(Number(e.target.value) || 26)}
                  className="management-input"
                  style={{ minWidth: "100px" }}
                />
              </label>
              <button type="submit" className="management-btn management-btn-primary" disabled={addingTruck}>
                {addingTruck ? "Adding…" : "Add truck"}
              </button>
            </form>
          </section>

          <section className="management-section">
            <h3 className="management-section-title">Trucks</h3>
            {lorriesLoading ? (
              <p className="management-loading">Loading trucks…</p>
            ) : (
              <div className="management-table-wrap">
                <table className="management-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Class</th>
                      <th>Capacity (pallets)</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lorries.map((l) => (
                      <tr key={l.id}>
                        <td>
                          {editingLorryId === l.id ? (
                            <input
                              type="text"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className="management-input management-input-inline"
                            />
                          ) : (
                            l.name
                          )}
                        </td>
                        <td>
                          {editingLorryId === l.id ? (
                            <select
                              value={editClass}
                              onChange={(e) => {
                                const newClass = e.target.value as TruckClass;
                                setEditClass(newClass);
                                setEditCapacity(TRUCK_CLASS_CAPACITY[newClass] ?? 26);
                              }}
                              className="management-select management-select-small"
                            >
                              {TRUCK_CLASSES.map((c) => (
                                <option key={c} value={c}>{TRUCK_CLASS_LABELS[c]}</option>
                              ))}
                            </select>
                          ) : (
                            TRUCK_CLASS_LABELS[l.truckClass || "Class1"] || "Class 1"
                          )}
                        </td>
                        <td>
                          {editingLorryId === l.id ? (
                            <input
                              type="number"
                              min={1}
                              value={editCapacity}
                              onChange={(e) => setEditCapacity(Number(e.target.value) || 26)}
                              className="management-input management-input-inline"
                              style={{ width: "80px" }}
                            />
                          ) : (
                            l.capacityPallets
                          )}
                        </td>
                        <td>
                          {editingLorryId === l.id ? (
                            <>
                              <button type="button" className="management-btn management-btn-small" onClick={handleUpdateTruck}>Save</button>
                              <button type="button" className="management-btn management-btn-small" onClick={() => setEditingLorryId(null)}>Cancel</button>
                            </>
                          ) : (
                            <>
                              <button type="button" className="management-btn management-btn-small management-btn-link" onClick={() => startEditLorry(l)}>Edit</button>
                              <button
                                type="button"
                                className="management-btn management-btn-small management-btn-danger"
                                onClick={() => handleDeleteTruck(l.id)}
                                disabled={deletingId === l.id}
                              >
                                {deletingId === l.id ? "Deleting…" : "Remove"}
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
  );
};
