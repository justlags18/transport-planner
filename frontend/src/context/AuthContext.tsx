import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { apiGet, apiPost, getStoredToken, setStoredToken } from "../api/client";

export type Role = "Clerk" | "Planner" | "Management" | "Developer";

export type AuthUser = {
  id: string;
  email: string;
  role: Role;
  forcePasswordChange: boolean;
};

type LoginResponse = {
  ok: boolean;
  token: string;
  user: AuthUser;
};

type MeResponse = {
  ok: boolean;
  user: AuthUser;
};

type ChangePasswordResponse = LoginResponse;

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string, rememberMe: boolean) => Promise<AuthUser>;
  logout: () => void;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  setUser: (user: AuthUser | null) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const setUser = useCallback((u: AuthUser | null) => {
    setUserState(u);
  }, []);

  const logout = useCallback(() => {
    setStoredToken(null, false);
    setUserState(null);
  }, []);

  const login = useCallback(async (email: string, password: string, rememberMe: boolean): Promise<AuthUser> => {
    const res = await apiPost<LoginResponse>("/api/auth/login", {
      email: email.trim().toLowerCase(),
      password,
      rememberMe,
    });
    if (!res.ok || !res.token || !res.user) throw new Error("Invalid login response");
    setStoredToken(res.token, rememberMe);
    setUserState(res.user);
    return res.user;
  }, []);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    const res = await apiPost<ChangePasswordResponse>("/api/auth/change-password", {
      currentPassword,
      newPassword,
    });
    if (!res.ok || !res.token || !res.user) throw new Error("Invalid response");
    setStoredToken(res.token, true);
    setUserState(res.user);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const token = getStoredToken();
    if (!token) {
      setLoading(false);
      return;
    }
    apiGet<MeResponse>("/api/auth/me")
      .then((res) => {
        if (!cancelled && res.ok && res.user) setUserState(res.user);
      })
      .catch(() => {
        if (!cancelled) {
          setStoredToken(null, false);
          setUserState(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const value: AuthContextValue = {
    user,
    loading,
    login,
    logout,
    changePassword,
    setUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
