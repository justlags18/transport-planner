import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { apiGet, apiPost, apiPatch, apiDelete } from "../api/client";
import { ROLES, canMakeDeveloper, canAccessManagement, canAccessUsersOrTrucks, type Role } from "../permissions";
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

const DELIVERY_TYPES = ["deliver", "collection", "self_collect"] as const;
type DeliveryType = (typeof DELIVERY_TYPES)[number];

const DELIVERY_TYPE_LABELS: Record<string, string> = {
  deliver: "We deliver",
  collection: "We collect (from site)",
  self_collect: "Customer collects",
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

type CustomerPrefRow = {
  id: string;
  displayName: string;
  customerKey: string | null;
  deliveryType: string;
  notes: string | null;
  deliveryLocationIds?: string[];
  deliveryLocations?: { id: string; displayName: string }[];
  createdAt?: string;
  updatedAt?: string;
};

type DeliveryLocationRow = {
  id: string;
  displayName: string;
  destinationKey: string | null;
  notes: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type ListDeliveryLocationsResponse = { ok: boolean; locations: DeliveryLocationRow[] };
type CreateDeliveryLocationResponse = { ok: boolean; location: DeliveryLocationRow };
type UpdateDeliveryLocationResponse = { ok: boolean; location: DeliveryLocationRow };

type ListUsersResponse = { ok: boolean; users: UserRow[] };
type CreateUserResponse = { ok: boolean; user: UserRow; temporaryPassword?: string };
type ResetPasswordResponse = { ok: boolean; temporaryPassword: string };
type UpdateRoleResponse = { ok: boolean; user: UserRow };

type ListCustomerPrefsResponse = { ok: boolean; prefs: CustomerPrefRow[] };
type CreateCustomerPrefResponse = { ok: boolean; pref: CustomerPrefRow };
type UpdateCustomerPrefResponse = { ok: boolean; pref: CustomerPrefRow };

type AvailableCustomer = { customerKey: string; displayName: string };
type AvailableCustomersResponse = { ok: boolean; customers: AvailableCustomer[] };

type ScrapeLog = {
  timestamp: string;
  totalRows: number;
  upserted: number;
  detectedPageParam: string | null;
  nextPageCount: number;
  skippedRows: number;
  sampleSkippedKeys: string[];
  errors: string[];
};

export const ManagementPage = () => {
  const { user: currentUser } = useAuth();
  const role = currentUser?.role ?? "Clerk";
  const isDeveloper = currentUser?.role === "Developer";
  const showUsersTrucks = canAccessUsersOrTrucks(role);
  const [activeTab, setActiveTab] = useState<"consignments" | "users" | "trucks" | "trailers" | "customer-pref" | "delivery-locations">("customer-pref");

  // Consignments tab is Developer-only; if role changes away from Developer, switch off it
  useEffect(() => {
    if (activeTab === "consignments" && !isDeveloper) setActiveTab("customer-pref");
  }, [activeTab, isDeveloper]);

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

  // Customer Pref state
  const [prefs, setPrefs] = useState<CustomerPrefRow[]>([]);
  const [prefsLoading, setPrefsLoading] = useState(false);
  const [prefDeliveryType, setPrefDeliveryType] = useState<DeliveryType>("deliver");
  const [prefNotes, setPrefNotes] = useState("");
  const [addPrefLocationIds, setAddPrefLocationIds] = useState<string[]>([]);
  const [addPrefLocationDropdownOpen, setAddPrefLocationDropdownOpen] = useState(false);
  const [editPrefLocationDropdownOpen, setEditPrefLocationDropdownOpen] = useState(false);
  const addPrefLocationDropdownRef = useRef<HTMLDivElement>(null);
  const editPrefLocationDropdownRef = useRef<HTMLDivElement>(null);
  const [addingPref, setAddingPref] = useState(false);
  const [editingPrefId, setEditingPrefId] = useState<string | null>(null);
  const [editPrefDisplayName, setEditPrefDisplayName] = useState("");
  const [editPrefCustomerKey, setEditPrefCustomerKey] = useState("");
  const [editPrefDeliveryType, setEditPrefDeliveryType] = useState<DeliveryType>("deliver");
  const [editPrefNotes, setEditPrefNotes] = useState("");
  const [editPrefLocationIds, setEditPrefLocationIds] = useState<string[]>([]);
  const [deletingPrefId, setDeletingPrefId] = useState<string | null>(null);
  const [availableCustomers, setAvailableCustomers] = useState<AvailableCustomer[]>([]);
  const [availableCustomersLoading, setAvailableCustomersLoading] = useState(false);
  const [selectedClientKey, setSelectedClientKey] = useState("");

  // Delivery Locations state
  const [locations, setLocations] = useState<DeliveryLocationRow[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [locationDisplayName, setLocationDisplayName] = useState("");
  const [locationDestinationKey, setLocationDestinationKey] = useState("");
  const [locationNotes, setLocationNotes] = useState("");
  const [addingLocation, setAddingLocation] = useState(false);
  const [editingLocationId, setEditingLocationId] = useState<string | null>(null);
  const [editLocationDisplayName, setEditLocationDisplayName] = useState("");
  const [editLocationDestinationKey, setEditLocationDestinationKey] = useState("");
  const [editLocationNotes, setEditLocationNotes] = useState("");
  const [deletingLocationId, setDeletingLocationId] = useState<string | null>(null);

  // Consignments (force refresh / archive old)
  const [consignmentsRefreshing, setConsignmentsRefreshing] = useState(false);
  const [consignmentsArchiving, setConsignmentsArchiving] = useState(false);
  const [scrapeLog, setScrapeLog] = useState<ScrapeLog | null>(null);

  const [error, setError] = useState("");

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

  const loadCustomerPrefs = useCallback(async () => {
    setPrefsLoading(true);
    setError("");
    try {
      const res = await apiGet<ListCustomerPrefsResponse>("/api/customer-prefs");
      if (res.ok && res.prefs) {
        setPrefs(res.prefs);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load customer preferences");
    } finally {
      setPrefsLoading(false);
    }
  }, []);

  const loadAvailableCustomers = useCallback(async () => {
    setAvailableCustomersLoading(true);
    setError("");
    try {
      const res = await apiGet<AvailableCustomersResponse>("/api/customer-prefs/available-customers");
      if (res.ok && res.customers) {
        setAvailableCustomers(res.customers);
        setSelectedClientKey((prev) => {
          if (!prev) return "";
          const stillThere = res.customers.some((c) => c.customerKey === prev);
          return stillThere ? prev : "";
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load client list");
    } finally {
      setAvailableCustomersLoading(false);
    }
  }, []);

  const [scrapeLogError, setScrapeLogError] = useState<string | null>(null);

  const loadScrapeLog = useCallback(async () => {
    setScrapeLogError(null);
    try {
      const res = await apiGet<{ ok: boolean; log: ScrapeLog | null; error?: string }>("/api/consignments/scrape-log");
      if (res.ok && res.log != null) {
        setScrapeLog(res.log);
      } else {
        setScrapeLog(null);
        if (res.error) setScrapeLogError(res.error);
      }
    } catch (e) {
      setScrapeLog(null);
      setScrapeLogError(e instanceof Error ? e.message : "Failed to load log");
    }
  }, []);

  const handleConsignmentsRefresh = useCallback(async () => {
    setConsignmentsRefreshing(true);
    setError("");
    try {
      await apiPost<{ ok: boolean; message?: string }>("/api/consignments/refresh", {});
      if (isDeveloper) {
        setError("");
        const pollLog = () => {
          loadScrapeLog();
        };
        setTimeout(pollLog, 3000);
        setTimeout(pollLog, 8000);
        setTimeout(pollLog, 15000);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Force refresh failed");
    } finally {
      setConsignmentsRefreshing(false);
    }
  }, [isDeveloper, loadScrapeLog]);

  const handleArchiveOldConsignments = useCallback(async () => {
    setConsignmentsArchiving(true);
    setError("");
    try {
      const res = await apiPost<{ ok: boolean; archived?: number }>("/api/consignments/archive-old", {});
      if (res?.archived != null && res.archived > 0) {
        setError("");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Archive old consignments failed");
    } finally {
      setConsignmentsArchiving(false);
    }
  }, []);

  const loadDeliveryLocations = useCallback(async () => {
    setLocationsLoading(true);
    setError("");
    try {
      const res = await apiGet<ListDeliveryLocationsResponse>("/api/delivery-locations");
      if (res.ok && res.locations) setLocations(res.locations);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load delivery locations");
    } finally {
      setLocationsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "users") loadUsers();
  }, [activeTab, loadUsers]);

  useEffect(() => {
    if (activeTab === "trucks") loadLorries();
  }, [activeTab, loadLorries]);

  useEffect(() => {
    if (activeTab === "customer-pref") {
      loadCustomerPrefs();
      loadAvailableCustomers();
      loadDeliveryLocations();
    }
  }, [activeTab, loadCustomerPrefs, loadAvailableCustomers, loadDeliveryLocations]);

  useEffect(() => {
    if (activeTab === "delivery-locations") loadDeliveryLocations();
  }, [activeTab, loadDeliveryLocations]);

  useEffect(() => {
    if (activeTab === "consignments" && isDeveloper) loadScrapeLog();
  }, [activeTab, isDeveloper, loadScrapeLog]);

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

  const handleAddPref = async (e: React.FormEvent) => {
    e.preventDefault();
    const customer = availableCustomers.find((c) => c.customerKey === selectedClientKey);
    if (!customer) {
      setError("Please select a client from the list.");
      return;
    }
    setError("");
    setAddingPref(true);
    try {
      const res = await apiPost<CreateCustomerPrefResponse>("/api/customer-prefs", {
        displayName: customer.displayName,
        customerKey: customer.customerKey,
        deliveryType: prefDeliveryType,
        notes: prefNotes.trim() || undefined,
        deliveryLocationIds: prefDeliveryType === "deliver" ? addPrefLocationIds : [],
      });
      if (res.ok && res.pref) {
        setPrefs((prev) =>
          [...prev, res.pref!].sort((a, b) => {
            const typeOrder = (t: string) => (t === "deliver" ? 1 : t === "collection" ? 2 : 3);
            if (typeOrder(a.deliveryType) !== typeOrder(b.deliveryType)) return typeOrder(a.deliveryType) - typeOrder(b.deliveryType);
            return a.displayName.localeCompare(b.displayName);
          })
        );
        setSelectedClientKey("");
        setPrefDeliveryType("deliver");
        setPrefNotes("");
        setAddPrefLocationIds([]);
        loadAvailableCustomers();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add customer preference");
    } finally {
      setAddingPref(false);
    }
  };

  const startEditPref = (p: CustomerPrefRow) => {
    setEditingPrefId(p.id);
    setEditPrefDisplayName(p.displayName);
    setEditPrefCustomerKey(p.customerKey ?? "");
    setEditPrefDeliveryType((p.deliveryType as DeliveryType) || "deliver");
    setEditPrefNotes(p.notes ?? "");
    setEditPrefLocationIds(p.deliveryLocationIds ?? []);
  };

  const toggleAddPrefLocation = (locationId: string) => {
    setAddPrefLocationIds((prev) =>
      prev.includes(locationId) ? prev.filter((id) => id !== locationId) : [...prev, locationId]
    );
  };

  const togglePrefLocation = (locationId: string) => {
    setEditPrefLocationIds((prev) =>
      prev.includes(locationId) ? prev.filter((id) => id !== locationId) : [...prev, locationId]
    );
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (addPrefLocationDropdownRef.current && !addPrefLocationDropdownRef.current.contains(e.target as Node)) {
        setAddPrefLocationDropdownOpen(false);
      }
      if (editPrefLocationDropdownRef.current && !editPrefLocationDropdownRef.current.contains(e.target as Node)) {
        setEditPrefLocationDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleUpdatePref = async () => {
    if (!editingPrefId) return;
    setError("");
    try {
      const res = await apiPatch<UpdateCustomerPrefResponse>(`/api/customer-prefs/${editingPrefId}`, {
        displayName: editPrefDisplayName.trim(),
        customerKey: editPrefCustomerKey.trim() || null,
        deliveryType: editPrefDeliveryType,
        notes: editPrefNotes.trim() || null,
        deliveryLocationIds: editPrefLocationIds,
      });
      if (res.ok && res.pref) {
        const updated = res.pref as CustomerPrefRow;
        setPrefs((prev) => {
          const next = prev.map((x) => (x.id === editingPrefId ? { ...x, ...updated } : x));
          return next.sort((a, b) => {
            const typeOrder = (t: string) => (t === "deliver" ? 1 : t === "collection" ? 2 : 3);
            if (typeOrder(a.deliveryType) !== typeOrder(b.deliveryType)) return typeOrder(a.deliveryType) - typeOrder(b.deliveryType);
            return a.displayName.localeCompare(b.displayName);
          });
        });
        setEditingPrefId(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update customer preference");
    }
  };


  const handleDeletePref = async (id: string) => {
    setError("");
    setDeletingPrefId(id);
    try {
      await apiDelete(`/api/customer-prefs/${id}`);
      setPrefs((prev) => prev.filter((p) => p.id !== id));
      loadAvailableCustomers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete customer preference");
    } finally {
      setDeletingPrefId(null);
    }
  };

  const handleAddLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    const displayName = locationDisplayName.trim();
    if (!displayName) {
      setError("Display name is required.");
      return;
    }
    setError("");
    setAddingLocation(true);
    try {
      const res = await apiPost<CreateDeliveryLocationResponse>("/api/delivery-locations", {
        displayName,
        destinationKey: locationDestinationKey.trim() || undefined,
        notes: locationNotes.trim() || undefined,
      });
      if (res.ok && res.location) {
        setLocations((prev) => [...prev, res.location!].sort((a, b) => a.displayName.localeCompare(b.displayName)));
        setLocationDisplayName("");
        setLocationDestinationKey("");
        setLocationNotes("");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add delivery location");
    } finally {
      setAddingLocation(false);
    }
  };

  const startEditLocation = (loc: DeliveryLocationRow) => {
    setEditingLocationId(loc.id);
    setEditLocationDisplayName(loc.displayName);
    setEditLocationDestinationKey(loc.destinationKey ?? "");
    setEditLocationNotes(loc.notes ?? "");
  };

  const handleUpdateLocation = async () => {
    if (!editingLocationId) return;
    setError("");
    try {
      const res = await apiPatch<UpdateDeliveryLocationResponse>(`/api/delivery-locations/${editingLocationId}`, {
        displayName: editLocationDisplayName.trim(),
        destinationKey: editLocationDestinationKey.trim() || null,
        notes: editLocationNotes.trim() || null,
      });
      if (res.ok && res.location) {
        setLocations((prev) =>
          prev.map((l) => (l.id === editingLocationId ? res.location! : l)).sort((a, b) => a.displayName.localeCompare(b.displayName))
        );
        setEditingLocationId(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update delivery location");
    }
  };

  const handleDeleteLocation = async (id: string) => {
    setError("");
    setDeletingLocationId(id);
    try {
      await apiDelete(`/api/delivery-locations/${id}`);
      setLocations((prev) => prev.filter((l) => l.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete delivery location");
    } finally {
      setDeletingLocationId(null);
    }
  };

  const formatDate = (s: string) => {
    try {
      return new Date(s).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
    } catch {
      return s;
    }
  };

  if (!currentUser || !canAccessManagement(role)) {
    return null;
  }

  return (
    <div className="management-page">
      <h2 className="dashboard-page-title">Management</h2>

      <nav className="management-tabs" aria-label="Management sections">
        {isDeveloper && (
          <button
            type="button"
            className={`management-tab${activeTab === "consignments" ? " management-tab--active" : ""}`}
            onClick={() => setActiveTab("consignments")}
          >
            Consignments
          </button>
        )}
        <button
          type="button"
          className={`management-tab${activeTab === "customer-pref" ? " management-tab--active" : ""}`}
          onClick={() => setActiveTab("customer-pref")}
        >
          Customer Pref
        </button>
        <button
          type="button"
          className={`management-tab${activeTab === "delivery-locations" ? " management-tab--active" : ""}`}
          onClick={() => setActiveTab("delivery-locations")}
        >
          Delivery Locations
        </button>
        {showUsersTrucks && (
          <>
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
            <button
              type="button"
              className={`management-tab${activeTab === "trailers" ? " management-tab--active" : ""}`}
              onClick={() => setActiveTab("trailers")}
            >
              Trailers
            </button>
          </>
        )}
      </nav>

      {error && (
        <div className="management-error" role="alert">
          {error}
        </div>
      )}

      {activeTab === "consignments" && isDeveloper && (
        <>
          <p className="management-intro">
            Force refresh runs a full backoffice scrape and archives consignments not on the dayboard (keeps today&apos;s plus any assigned to a lorry). Archive old consignments archives consignments not seen since before today without running a scrape. The board also auto-archives at 6am daily. If Active shows fewer jobs than the backoffice, set env PML_BACKOFFICE_PAGE_PARAM to the site&apos;s page param (e.g. page or PageNum) so the scraper fetches all pages.
          </p>
          <section className="management-section">
            <h3 className="management-section-title">Consignments data</h3>
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
              <button
                type="button"
                className="management-btn management-btn-small management-btn-primary"
                onClick={handleConsignmentsRefresh}
                disabled={consignmentsRefreshing}
                title="Run full backoffice scrape and archive now"
              >
                {consignmentsRefreshing ? "Refreshing…" : "Force refresh"}
              </button>
              <button
                type="button"
                className="management-btn management-btn-small"
                onClick={handleArchiveOldConsignments}
                disabled={consignmentsArchiving}
                title="Archive consignments not seen since before today (not assigned to a lorry)"
              >
                {consignmentsArchiving ? "Archiving…" : "Archive old consignments"}
              </button>
            </div>
          </section>
          {isDeveloper && (
            <section className="management-section developer-log-section">
              <h3 className="management-section-title">Developer log (backoffice scrape)</h3>
              <p className="management-muted" style={{ marginBottom: "0.5rem" }}>
                Last run: total rows scraped, detected page param, skipped rows, errors. No filters—only the most recent run is stored. Run Force refresh, wait 30–60s, then click Refresh log. With multiple servers the log may live on another instance.
              </p>
              <button
                type="button"
                className="management-btn management-btn-small"
                onClick={loadScrapeLog}
                title="Reload last scrape log"
              >
                Refresh log
              </button>
              {scrapeLogError ? (
                <p className="management-error" style={{ marginTop: "0.75rem" }} role="alert">{scrapeLogError}</p>
              ) : null}
              {scrapeLog ? (
                <div className="developer-log" style={{ marginTop: "0.75rem", fontFamily: "monospace", fontSize: "0.875rem", background: "var(--bg-muted, #f5f5f5)", padding: "0.75rem", borderRadius: "4px", overflow: "auto" }}>
                  <div><strong>Timestamp:</strong> {scrapeLog.timestamp}</div>
                  <div><strong>Total rows scraped:</strong> {scrapeLog.totalRows}</div>
                  <div><strong>Upserted:</strong> {scrapeLog.upserted}</div>
                  <div><strong>Detected page param:</strong> {scrapeLog.detectedPageParam ?? "(none)"}</div>
                  <div><strong>Next page fetches:</strong> {scrapeLog.nextPageCount}</div>
                  <div><strong>Skipped rows (no PML ref):</strong> {scrapeLog.skippedRows}</div>
                  {scrapeLog.sampleSkippedKeys.length > 0 && (
                    <div><strong>Sample skipped row keys:</strong> {scrapeLog.sampleSkippedKeys.join(", ")}</div>
                  )}
                  {scrapeLog.errors.length > 0 && (
                    <div style={{ color: "var(--error, #c00)", marginTop: "0.5rem" }}>
                      <strong>Errors:</strong>
                      <ul style={{ margin: "0.25rem 0 0 1rem", padding: 0 }}>
                        {scrapeLog.errors.map((err, i) => (
                          <li key={i}>{err}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : !scrapeLogError ? (
                <p className="management-muted" style={{ marginTop: "0.75rem" }}>No scrape log yet. Run Force refresh to start a scrape, wait 30–60s for it to finish, then click Refresh log.</p>
              ) : null}
            </section>
          )}
        </>
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

      {activeTab === "trailers" && (
        <>
          <p className="management-intro">
            Trailer management will live here.
          </p>
          <section className="management-section">
            <h3 className="management-section-title">Trailers</h3>
            <p className="management-loading">No trailers loaded yet.</p>
          </section>
        </>
      )}

      {activeTab === "customer-pref" && (
        <>
          <p className="management-intro">
            Track which customers we deliver to and which collect goods themselves. Clients are pulled from consignments (scraper); pick one, set delivery type, then add—it will disappear from the list so you can work through the list and easily add new customers as they appear.
          </p>

          <section className="management-section">
            <h3 className="management-section-title">Add customer preference</h3>
            {availableCustomersLoading ? (
              <p className="management-loading">Loading client list…</p>
            ) : (
              <form className="management-create-form" onSubmit={handleAddPref}>
                <label>
                  Client (from consignments)
                  <select
                    value={selectedClientKey}
                    onChange={(e) => setSelectedClientKey(e.target.value)}
                    className="management-select"
                    required
                  >
                    <option value="">— Select a client —</option>
                    {availableCustomers.map((c) => (
                      <option key={c.customerKey} value={c.customerKey}>
                        {c.displayName}
                      </option>
                    ))}
                  </select>
                </label>
                {availableCustomers.length === 0 && !availableCustomersLoading && (
                  <p className="management-intro" style={{ marginTop: "0.5rem" }}>
                    No clients from consignments yet. Run the scraper or add consignments; new names will appear here.
                  </p>
                )}
                <label>
                  Delivery type
                  <select
                    value={prefDeliveryType}
                    onChange={(e) => setPrefDeliveryType(e.target.value as DeliveryType)}
                    className="management-select"
                  >
                    {DELIVERY_TYPES.map((d) => (
                      <option key={d} value={d}>{DELIVERY_TYPE_LABELS[d]}</option>
                    ))}
                  </select>
                </label>
                {prefDeliveryType === "deliver" && (
                  <label>
                    Delivery locations
                    {locations.length === 0 ? (
                      <p className="management-muted" style={{ marginTop: "0.25rem" }}>Add locations in Delivery Locations tab first</p>
                    ) : (
                      <div className="management-dropdown-wrap" ref={addPrefLocationDropdownRef}>
                        <button
                          type="button"
                          className="management-select management-dropdown-trigger"
                          onClick={() => setAddPrefLocationDropdownOpen((o) => !o)}
                          aria-expanded={addPrefLocationDropdownOpen}
                          aria-haspopup="listbox"
                        >
                          <span>
                            {addPrefLocationIds.length === 0
                              ? "— Select delivery locations —"
                              : `${addPrefLocationIds.length} selected`}
                          </span>
                          <span className="management-dropdown-chevron" aria-hidden>▼</span>
                        </button>
                        {addPrefLocationDropdownOpen && (
                          <div className="management-dropdown-panel" role="listbox">
                            {locations.map((loc) => (
                              <label key={loc.id} className="management-dropdown-option management-checkbox-label">
                                <input
                                  type="checkbox"
                                  checked={addPrefLocationIds.includes(loc.id)}
                                  onChange={() => toggleAddPrefLocation(loc.id)}
                                />
                                <span>{loc.displayName}</span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </label>
                )}
                <label>
                  Notes (optional)
                  <input
                    type="text"
                    value={prefNotes}
                    onChange={(e) => setPrefNotes(e.target.value)}
                    placeholder="e.g. Gate 2"
                    className="management-input"
                  />
                </label>
                <button
                  type="submit"
                  className="management-btn management-btn-primary"
                  disabled={addingPref || availableCustomers.length === 0}
                >
                  {addingPref ? "Adding…" : "Add"}
                </button>
              </form>
            )}
          </section>

          <section className="management-section">
            <h3 className="management-section-title">Customer preferences</h3>
            {prefsLoading ? (
              <p className="management-loading">Loading customer preferences…</p>
            ) : (
              <div className="management-table-wrap">
                <table className="management-table">
                  <thead>
                    <tr>
                      <th>Display name</th>
                      <th>Customer key</th>
                      <th>Delivery type</th>
                      <th>Delivery locations</th>
                      <th>Notes</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {prefs.map((p) => (
                      <tr key={p.id}>
                        <td>
                          {editingPrefId === p.id ? (
                            <input
                              type="text"
                              value={editPrefDisplayName}
                              onChange={(e) => setEditPrefDisplayName(e.target.value)}
                              className="management-input management-input-inline"
                            />
                          ) : (
                            p.displayName
                          )}
                        </td>
                        <td>
                          {editingPrefId === p.id ? (
                            <input
                              type="text"
                              value={editPrefCustomerKey}
                              onChange={(e) => setEditPrefCustomerKey(e.target.value)}
                              className="management-input management-input-inline"
                              placeholder="Optional"
                            />
                          ) : (
                            p.customerKey ?? "—"
                          )}
                        </td>
                        <td>
                          {editingPrefId === p.id ? (
                            <select
                              value={editPrefDeliveryType}
                              onChange={(e) => setEditPrefDeliveryType(e.target.value as DeliveryType)}
                              className="management-select management-select-small"
                            >
                              {DELIVERY_TYPES.map((d) => (
                                <option key={d} value={d}>{DELIVERY_TYPE_LABELS[d]}</option>
                              ))}
                            </select>
                          ) : (
                            DELIVERY_TYPE_LABELS[p.deliveryType] ?? p.deliveryType
                          )}
                        </td>
                        <td>
                          {editingPrefId === p.id ? (
                            locations.length === 0 ? (
                              <span className="management-muted">Add locations in Delivery Locations tab</span>
                            ) : (
                              <div className="management-dropdown-wrap management-dropdown-wrap-inline" ref={editPrefLocationDropdownRef}>
                                <button
                                  type="button"
                                  className="management-select management-dropdown-trigger management-select-small"
                                  onClick={() => setEditPrefLocationDropdownOpen((o) => !o)}
                                  aria-expanded={editPrefLocationDropdownOpen}
                                  aria-haspopup="listbox"
                                >
                                  <span>
                                    {editPrefLocationIds.length === 0
                                      ? "— Select —"
                                      : `${editPrefLocationIds.length} selected`}
                                  </span>
                                  <span className="management-dropdown-chevron" aria-hidden>▼</span>
                                </button>
                                {editPrefLocationDropdownOpen && (
                                  <div className="management-dropdown-panel" role="listbox">
                                    {locations.map((loc) => (
                                      <label key={loc.id} className="management-dropdown-option management-checkbox-label">
                                        <input
                                          type="checkbox"
                                          checked={editPrefLocationIds.includes(loc.id)}
                                          onChange={() => togglePrefLocation(loc.id)}
                                        />
                                        <span>{loc.displayName}</span>
                                      </label>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )
                          ) : (
                            p.deliveryLocations?.length ? p.deliveryLocations.map((l) => l.displayName).join(", ") : "—"
                          )}
                        </td>
                        <td>
                          {editingPrefId === p.id ? (
                            <input
                              type="text"
                              value={editPrefNotes}
                              onChange={(e) => setEditPrefNotes(e.target.value)}
                              className="management-input management-input-inline"
                              placeholder="Optional"
                            />
                          ) : (
                            p.notes ?? "—"
                          )}
                        </td>
                        <td>
                          {editingPrefId === p.id ? (
                            <>
                              <button type="button" className="management-btn management-btn-small" onClick={handleUpdatePref}>Save</button>
                              <button type="button" className="management-btn management-btn-small" onClick={() => setEditingPrefId(null)}>Cancel</button>
                            </>
                          ) : (
                            <>
                              <button type="button" className="management-btn management-btn-small management-btn-link" onClick={() => startEditPref(p)}>Edit</button>
                              <button
                                type="button"
                                className="management-btn management-btn-small management-btn-danger"
                                onClick={() => handleDeletePref(p.id)}
                                disabled={deletingPrefId === p.id}
                              >
                                {deletingPrefId === p.id ? "Deleting…" : "Remove"}
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

      {activeTab === "delivery-locations" && (
        <>
          <p className="management-intro">
            Create delivery locations manually. Use the dropdown in Customer Pref to assign which locations each customer delivers to for easier organisation.
          </p>

          <section className="management-section">
            <h3 className="management-section-title">Add delivery location</h3>
            <form className="management-create-form" onSubmit={handleAddLocation}>
              <label>
                Display name
                <input
                  type="text"
                  value={locationDisplayName}
                  onChange={(e) => setLocationDisplayName(e.target.value)}
                  placeholder="e.g. Kent Depot, London Hub"
                  required
                  className="management-input"
                />
              </label>
              <label>
                Destination key (optional)
                <input
                  type="text"
                  value={locationDestinationKey}
                  onChange={(e) => setLocationDestinationKey(e.target.value)}
                  placeholder="e.g. kent-depot"
                  className="management-input"
                />
              </label>
              <label>
                Notes (optional)
                <input
                  type="text"
                  value={locationNotes}
                  onChange={(e) => setLocationNotes(e.target.value)}
                  placeholder="e.g. Gate 2, loading bay"
                  className="management-input"
                />
              </label>
              <button
                type="submit"
                className="management-btn management-btn-primary"
                disabled={addingLocation}
              >
                {addingLocation ? "Adding…" : "Add"}
              </button>
            </form>
          </section>

          <section className="management-section">
            <h3 className="management-section-title">Delivery locations</h3>
            {locationsLoading ? (
              <p className="management-loading">Loading delivery locations…</p>
            ) : (
              <div className="management-table-wrap">
                <table className="management-table">
                  <thead>
                    <tr>
                      <th>Display name</th>
                      <th>Destination key</th>
                      <th>Notes</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {locations.map((loc) => (
                      <tr key={loc.id}>
                        <td>
                          {editingLocationId === loc.id ? (
                            <input
                              type="text"
                              value={editLocationDisplayName}
                              onChange={(e) => setEditLocationDisplayName(e.target.value)}
                              className="management-input management-input-inline"
                            />
                          ) : (
                            loc.displayName
                          )}
                        </td>
                        <td>
                          {editingLocationId === loc.id ? (
                            <input
                              type="text"
                              value={editLocationDestinationKey}
                              onChange={(e) => setEditLocationDestinationKey(e.target.value)}
                              className="management-input management-input-inline"
                              placeholder="Optional"
                            />
                          ) : (
                            loc.destinationKey ?? "—"
                          )}
                        </td>
                        <td>
                          {editingLocationId === loc.id ? (
                            <input
                              type="text"
                              value={editLocationNotes}
                              onChange={(e) => setEditLocationNotes(e.target.value)}
                              className="management-input management-input-inline"
                              placeholder="Optional"
                            />
                          ) : (
                            loc.notes ?? "—"
                          )}
                        </td>
                        <td>
                          {editingLocationId === loc.id ? (
                            <>
                              <button type="button" className="management-btn management-btn-small" onClick={handleUpdateLocation}>Save</button>
                              <button type="button" className="management-btn management-btn-small" onClick={() => setEditingLocationId(null)}>Cancel</button>
                            </>
                          ) : (
                            <>
                              <button type="button" className="management-btn management-btn-small management-btn-link" onClick={() => startEditLocation(loc)}>Edit</button>
                              <button
                                type="button"
                                className="management-btn management-btn-small management-btn-danger"
                                onClick={() => handleDeleteLocation(loc.id)}
                                disabled={deletingLocationId === loc.id}
                              >
                                {deletingLocationId === loc.id ? "Deleting…" : "Remove"}
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
