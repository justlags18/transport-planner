/**
 * What each role can see and do.
 * Developers get everything + user management.
 */
export type Role = "Clerk" | "Planner" | "Management" | "Developer";

export const ROLES: Role[] = ["Clerk", "Planner", "Management", "Developer"];

export type NavItem = {
  path: string;
  label: string;
  /** If set, only these roles can see this nav item. Default: all authenticated. */
  roles?: Role[];
};

/** Sidebar nav items; Management is Planner+ (Planner, Management, Developer). */
export const NAV_ITEMS: NavItem[] = [
  { path: "/overview", label: "Overview" },
  { path: "/", label: "Today's Plan" },
  { path: "/deliveries", label: "Deliveries" },
  { path: "/consignments", label: "Consignments" },
  { path: "/fleet", label: "Fleet" },
  { path: "/drivers", label: "Drivers" },
  { path: "/reports", label: "Reports" },
  { path: "/management", label: "Management", roles: ["Planner", "Management", "Developer"] },
];

/** Only Management and Developer can add or edit driver details. */
export function canManageDrivers(role: Role): boolean {
  return role === "Management" || role === "Developer";
}

export function canAccessNavItem(role: Role, item: NavItem): boolean {
  if (!item.roles || item.roles.length === 0) return true;
  return item.roles.includes(role);
}

export function canAccessManagement(role: Role): boolean {
  return role === "Developer" || role === "Management" || role === "Planner";
}

export function canAccessUsersOrTrucks(role: Role): boolean {
  return role === "Developer" || role === "Management";
}

export function canMakeDeveloper(role: Role): boolean {
  return role === "Developer";
}
