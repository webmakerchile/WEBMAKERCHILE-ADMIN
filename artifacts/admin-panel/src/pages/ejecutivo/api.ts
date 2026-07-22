/* ============================================================
   CAPA HTTP — /api/hub/* (BASE_URL-aware, sesión por cookie)
   ============================================================ */

export const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

async function handle<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = json && typeof json === "object" && "error" in json && typeof (json as { error: unknown }).error === "string"
      ? (json as { error: string }).error
      : `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return json as T;
}

export async function apiGet<T>(path: string): Promise<T> {
  return handle<T>(await fetch(`${API_BASE}${path}`, { credentials: "include" }));
}

async function apiSend<T>(method: "POST" | "PATCH" | "DELETE", path: string, body?: unknown): Promise<T> {
  return handle<T>(await fetch(`${API_BASE}${path}`, {
    method,
    credentials: "include",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }));
}

export const apiPost = <T>(path: string, body?: unknown) => apiSend<T>("POST", path, body);
export const apiPatch = <T>(path: string, body: unknown) => apiSend<T>("PATCH", path, body);
export const apiDelete = (path: string) => apiSend<void>("DELETE", path);
