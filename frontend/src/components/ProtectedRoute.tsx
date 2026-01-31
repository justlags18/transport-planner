import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

type ProtectedRouteProps = {
  children: React.ReactNode;
};

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="auth-loading" aria-busy="true">
        <span>Loading…</span>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (user.forcePasswordChange) {
    return <Navigate to="/change-password" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

/** Use for /management: only Developers and Management can access; others redirect to /. */
export function DeveloperRoute({ children }: ProtectedRouteProps) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="auth-loading" aria-busy="true">
        <span>Loading…</span>
      </div>
    );
  }

  if (!user || (user.role !== "Developer" && user.role !== "Management")) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

/** Use for /change-password: only show when user is logged in and must change password. */
export function ChangePasswordRoute({ children }: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="auth-loading" aria-busy="true">
        <span>Loading…</span>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!user.forcePasswordChange) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
