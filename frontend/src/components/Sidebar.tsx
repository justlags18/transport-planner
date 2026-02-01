import { useState } from "react";
import { NavLink } from "react-router-dom";
import { useTheme } from "../useTheme";
import { useAuth } from "../context/AuthContext";
import { NAV_ITEMS, canAccessNavItem } from "../permissions";

const SunIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
  </svg>
);

const MoonIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

export const Sidebar = () => {
  const { theme, toggleTheme } = useTheme();
  const { user } = useAuth();
  const role = user?.role ?? "Clerk";
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={`dashboard-sidebar${collapsed ? " dashboard-sidebar--collapsed" : ""}`}
      aria-label="Main navigation"
    >
      <button
        type="button"
        className="dashboard-sidebar-toggle"
        onClick={() => setCollapsed((prev) => !prev)}
        aria-expanded={!collapsed}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed ? "»" : "«"}
      </button>
      <nav className="dashboard-sidebar-nav">
        {NAV_ITEMS.filter((item) => canAccessNavItem(role, item)).map(({ path, label }) => (
          <NavLink
            key={path}
            to={path}
            end={path === "/"}
            className={({ isActive }) =>
              `dashboard-sidebar-link${isActive ? " dashboard-sidebar-link--active" : ""}`
            }
            title={collapsed ? label : undefined}
          >
            <span className="dashboard-sidebar-link-label">
              {collapsed ? label.trim().charAt(0).toUpperCase() : label}
            </span>
          </NavLink>
        ))}
      </nav>
      <div className="dashboard-sidebar-footer">
        <button
          type="button"
          className="dashboard-theme-toggle"
          onClick={toggleTheme}
          title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
          aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
        >
          {theme === "light" ? <SunIcon /> : <MoonIcon />}
        </button>
      </div>
    </aside>
  );
};
