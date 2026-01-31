const rawBase = import.meta.env.VITE_API_BASE;
export const API_BASE = rawBase && rawBase.length > 0 ? rawBase : "";

const AUTH_TOKEN_KEY = "auth_token";
const AUTH_REMEMBER_KEY = "auth_remember";

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  const remember = localStorage.getItem(AUTH_REMEMBER_KEY) === "1";
  return remember ? localStorage.getItem(AUTH_TOKEN_KEY) : sessionStorage.getItem(AUTH_TOKEN_KEY);
}

export function setStoredToken(token: string | null, rememberMe: boolean): void {
  if (typeof window === "undefined") return;
  if (token) {
    localStorage.setItem(AUTH_REMEMBER_KEY, rememberMe ? "1" : "0");
    if (rememberMe) {
      localStorage.setItem(AUTH_TOKEN_KEY, token);
      sessionStorage.removeItem(AUTH_TOKEN_KEY);
    } else {
      sessionStorage.setItem(AUTH_TOKEN_KEY, token);
      localStorage.removeItem(AUTH_TOKEN_KEY);
    }
  } else {
    localStorage.removeItem(AUTH_REMEMBER_KEY);
    localStorage.removeItem(AUTH_TOKEN_KEY);
    sessionStorage.removeItem(AUTH_TOKEN_KEY);
  }
}

const buildUrl = (path: string) => {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  return `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
};

function buildHeaders(init?: RequestInit): HeadersInit {
  const token = getStoredToken();
  const existing = (init?.headers as Record<string, string>) ?? {};
  const headers: Record<string, string> = { ...existing };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

const requestJson = async <T>(path: string, init?: RequestInit): Promise<T> => {
  let response: Response;
  try {
    response = await fetch(buildUrl(path), {
      ...init,
      headers: buildHeaders(init),
    });
  } catch (e) {
    const msg = e instanceof TypeError && e.message === "Failed to fetch"
      ? "Cannot reach server. Is the backend running on port 3001?"
      : e instanceof Error ? e.message : "Network error";
    throw new Error(msg);
  }
  if (!response.ok) {
    const text = await response.text();
    let errMsg = "";
    try {
      const j = JSON.parse(text);
      if (j?.error && typeof j.error === "string") errMsg = j.error;
    } catch {
      // not JSON
    }
    if (response.status === 500 && text && !errMsg) {
      console.error("Server 500 response body:", text);
    }
    if (!errMsg) errMsg = response.status === 500 ? "Server error. Check the backend terminal for details." : `Request failed with ${response.status}`;
    throw new Error(`${errMsg} (${response.status})`);
  }
  return (await response.json()) as T;
};

export const apiGet = async <T>(path: string): Promise<T> => {
  return requestJson<T>(path, { method: "GET" });
};

export const apiPost = async <T>(path: string, body: unknown): Promise<T> => {
  return requestJson<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
};

export const apiPatch = async <T>(path: string, body: unknown): Promise<T> => {
  return requestJson<T>(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
};

export const apiDelete = async (path: string): Promise<void> => {
  const response = await fetch(buildUrl(path), {
    method: "DELETE",
    headers: buildHeaders({}),
  });
  if (response.status === 204) return;
  const text = await response.text();
  let errMsg = "";
  try {
    const j = JSON.parse(text);
    if (j?.error && typeof j.error === "string") errMsg = j.error;
  } catch {
    // not JSON
  }
  if (!errMsg) errMsg = `Request failed with ${response.status}`;
  throw new Error(errMsg);
};
