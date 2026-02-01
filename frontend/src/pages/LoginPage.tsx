import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import logoImg from "../assets/logo-header.png";

export const LoginPage = () => {
  const { login, user, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (loading || !user) return;
    navigate(user.forcePasswordChange ? "/change-password" : "/", { replace: true });
  }, [user, loading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const loggedInUser = await login(email, password, rememberMe);
      navigate(loggedInUser.forcePasswordChange ? "/change-password" : "/", { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Login failed";
      console.error("Login request failed:", err);
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo-wrap" aria-hidden="true">
          <img
            src={logoImg}
            alt="Transport Planner"
            className="login-logo"
            width={220}
            height={66}
            fetchPriority="high"
          />
        </div>
        <h1 className="login-app-name">Transport Planner</h1>
        <p className="login-subtitle">Staff Sign In</p>
        <p className="login-demo-hint">Demo: jamie@pml-ltd.com / Password123</p>

        <form className="login-form" onSubmit={handleSubmit}>
          {error ? (
            <>
              <div className="login-error" role="alert">{error}</div>
              <p className="login-error-hint">
                {error.includes("Invalid email or password")
                  ? "No user in database? In the backend folder run: npm run seed"
                  : "Open DevTools (F12) → Console for details. If the backend isn’t running, start it and try again."}
              </p>
            </>
          ) : null}

          <label className="login-label" htmlFor="login-email">
            Email
          </label>
          <input
            id="login-email"
            type="email"
            className="login-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@pml-ltd.com"
            autoComplete="email"
            required
            autoFocus
          />

          <label className="login-label" htmlFor="login-password">
            Password
          </label>
          <input
            id="login-password"
            type="password"
            className="login-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            required
          />

          <label className="login-remember">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="login-checkbox"
            />
            <span>Remember me</span>
          </label>

          <button type="submit" className="login-submit" disabled={submitting}>
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
};
