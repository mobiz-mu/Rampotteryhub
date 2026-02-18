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

function isLocalhostHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

/**
 * apiFetch()
 * - ✅ Production (Vercel): forces same-origin requests so /api/* rewrites work
 * - ✅ Local dev: optional VITE_API_BASE_URL (ex: http://localhost:3001) OR just use Vite proxy
 * - Sends cookies (credentials: include) for session-based auth (kept as-is)
 */
export async function apiFetch(path: string, options: ApiFetchOptions = {}) {
  const { throwOnError = false, ...init } = options;

  const p = path.startsWith("/") ? path : `/${path}`;

  // Decide base URL:
  // - Production: always same-origin (base = "")
  // - Localhost: allow VITE_API_BASE_URL if you want, otherwise same-origin (/api -> Vite proxy)
  let base = "";

  if (typeof window !== "undefined") {
    const host = window.location.hostname || "";
    const isLocal = isLocalhostHost(host);

    // Only allow env base on localhost (dev). Never in prod.
    if (isLocal) {
      base = import.meta.env.VITE_API_BASE_URL || "";
    } else {
      base = "";
    }
  } else {
    // SSR not used in Vite app normally, but keep safe default
    base = "";
  }

  const url = base ? joinUrl(base, p) : p;

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

