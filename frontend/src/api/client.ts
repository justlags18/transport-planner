const rawBase = import.meta.env.VITE_API_BASE;
export const API_BASE = rawBase && rawBase.length > 0 ? rawBase : "";

const buildUrl = (path: string) => {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  return `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
};

const requestJson = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(buildUrl(path), init);
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with ${response.status}`);
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
