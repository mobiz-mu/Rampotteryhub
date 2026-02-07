// src/integrations/supabase/client.ts
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!SUPABASE_URL) throw new Error("Missing VITE_SUPABASE_URL in .env");
if (!SUPABASE_ANON_KEY) throw new Error("Missing VITE_SUPABASE_ANON_KEY in .env");

// =======================================================
// 1) AUTHENTICATED CLIENT (staff / admin)
// =======================================================

// ✅ Single Supabase client across Vite HMR reloads
declare global {
  // eslint-disable-next-line no-var
  var __rp_supabase__: ReturnType<typeof createClient<Database>> | undefined;
}

export const supabase =
  globalThis.__rp_supabase__ ??
  createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: "sb-rampotteryhub-auth",
    },
  });

globalThis.__rp_supabase__ = supabase;

// =======================================================
// 2) PUBLIC PRINT (NO SUPABASE IN BROWSER)
//    Always go through your Express API:
//    GET /api/public/invoice-print?id=48&t=<uuid>
// =======================================================

/** Optional: set VITE_API_URL for local dev (ex: http://localhost:3001) */
export function apiBase() {
  return (import.meta as any)?.env?.VITE_API_URL?.trim?.() || "";
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || "").trim());
}

/** Shared fetch helper for public endpoints */
export async function fetchPublic<T = any>(path: string, params?: Record<string, any>) {
  const base = apiBase();

  const url = new URL(`${base}${path}`, window.location.origin);
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    url.searchParams.set(k, String(v));
  });

  const res = await fetch(url.toString(), { method: "GET" });
  const json = await res.json().catch(() => null);

  if (!res.ok || !json?.ok) {
    throw new Error(json?.error || "Not found / access denied.");
  }

  return json as T;
}

/** Convenience: validate token early (same behavior as server: invalid => deny) */
export function assertPublicToken(token: string) {
  const t = String(token || "").trim();
  if (!isUuid(t)) throw new Error("Not found / invalid link");
  return t;
}

