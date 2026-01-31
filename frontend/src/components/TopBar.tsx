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
  const { user } = useAuth();

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
        <div className="dashboard-topbar-user">
          <span className="dashboard-topbar-user-name">{firstNameFromEmail(user.email)}</span>
          <RoleBadge role={user.role} size="compact" />
        </div>
      )}
    </header>
  );
};
