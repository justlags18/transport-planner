import { useEffect, useRef, useState } from "react";
import logoImg from "../assets/logo-header.png";
import { useAuth } from "../context/AuthContext";
import { RoleBadge } from "./RoleBadge";

const formatDateLabel = () => {
  const d = new Date();
  const weekday = d.toLocaleDateString("en-GB", { weekday: "long" });
  const dayMonth = d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return `Today – ${weekday} ${dayMonth}`;
};

function firstNameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  return local.charAt(0).toUpperCase() + local.slice(1).toLowerCase();
}

export const TopBar = () => {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  const handleSignOut = () => {
    setMenuOpen(false);
    logout();
  };

  return (
    <header className="dashboard-topbar" role="banner">
      <img src={logoImg} alt="Transport Planner" className="dashboard-topbar-logo" />
      <span className="dashboard-topbar-date" aria-hidden="true">
        {formatDateLabel()}
      </span>
      <div className="dashboard-topbar-search-wrap">
        <input
          type="search"
          className="dashboard-topbar-search"
          placeholder="Search truck | customer | consignment | AWB"
          aria-label="Search truck, customer, consignment or AWB"
        />
      </div>
      {user && (
        <div className="dashboard-topbar-user-wrap" ref={menuRef}>
          <div className="dashboard-topbar-user">
            <button
              type="button"
              className="dashboard-topbar-user-trigger"
              onClick={() => setMenuOpen((o) => !o)}
              aria-expanded={menuOpen}
              aria-haspopup="true"
              aria-label="User menu"
            >
              <span className="dashboard-topbar-user-name">{firstNameFromEmail(user.email)}</span>
              <RoleBadge role={user.role} size="compact" />
              <span className="dashboard-topbar-user-chevron" aria-hidden>
                {menuOpen ? "▲" : "▼"}
              </span>
            </button>
          </div>
          {menuOpen && (
            <div className="dashboard-topbar-user-menu" role="menu">
              <button
                type="button"
                className="dashboard-topbar-user-menu-item"
                role="menuitem"
                onClick={handleSignOut}
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      )}
    </header>
  );
};
