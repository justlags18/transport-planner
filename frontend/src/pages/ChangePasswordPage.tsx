import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export const ChangePasswordPage = () => {
  const { changePassword } = useAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match");
      return;
    }
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setSubmitting(true);
    try {
      await changePassword(currentPassword, newPassword);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change password");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <h1 className="login-title">Change password</h1>
        <p className="login-subtitle">You must set a unique password before continuing.</p>

        <form className="login-form" onSubmit={handleSubmit}>
          {error ? <div className="login-error" role="alert">{error}</div> : null}

          <label className="login-label" htmlFor="change-current">
            Current password
          </label>
          <input
            id="change-current"
            type="password"
            className="login-input"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
            required
            autoFocus
          />

          <label className="login-label" htmlFor="change-new">
            New password
          </label>
          <input
            id="change-new"
            type="password"
            className="login-input"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            placeholder="At least 8 characters"
            required
          />

          <label className="login-label" htmlFor="change-confirm">
            Confirm new password
          </label>
          <input
            id="change-confirm"
            type="password"
            className="login-input"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            required
          />

          <button type="submit" className="login-submit" disabled={submitting}>
            {submitting ? "Updating…" : "Update password"}
          </button>
        </form>
      </div>
    </div>
  );
};
