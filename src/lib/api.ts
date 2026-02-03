// src/lib/api.ts
export type ApiFetchOptions = RequestInit & {
  // If true, throws on non-2xx responses with parsed message if present
  throwOnError?: boolean;
};

function joinUrl(base: string, path: string) {
  const b = (base || "").replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}

/**
 * apiFetch()
 * - Uses VITE_API_BASE_URL if set, otherwise calls relative /api/... paths
 * - Sends cookies (credentials: include) for session-based auth
 */
export async function apiFetch(path: string, options: ApiFetchOptions = {}) {
  const { throwOnError = false, ...init } = options;

  // If you don't have an external backend yet, keep VITE_API_BASE_URL empty.
  // Then apiFetch("/api/credit-notes") calls the same origin.
  const base = import.meta.env.VITE_API_BASE_URL || "";
  const url = base ? joinUrl(base, path) : path;

  const res = await fetch(url, {
    credentials: "include",
    ...init,
    headers: {
      ...(init.headers || {}),
    },
  });

  if (throwOnError && !res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const j = await res.clone().json();
      msg = j?.error || j?.message || msg;
    } catch {
      // ignore
    }
    throw new Error(msg);
  }

  return res;
}
