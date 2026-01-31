import type { Role } from "../context/AuthContext";

type RoleBadgeProps = {
  role: Role;
  size?: "compact" | "default";
};

const ROLE_STYLES: Record<Role, string> = {
  Developer: "role-badge-developer",
  Management: "role-badge-management",
  Planner: "role-badge-planner",
  Clerk: "role-badge-clerk",
};

export const RoleBadge = ({ role, size = "default" }: RoleBadgeProps) => {
  return (
    <span className={`role-badge role-badge--${size} ${ROLE_STYLES[role]}`}>
      {role}
    </span>
  );
};
