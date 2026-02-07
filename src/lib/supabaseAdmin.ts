// src/lib/supabaseAdmin.ts
import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// cache per lambda instance (good for Vercel)
let _admin: SupabaseClient | null = null;

function env(name: string) {
  const v = process.env[name];
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Server-side admin client.
 * Uses process.env (NOT import.meta.env).
 * Does not execute at module import time in a way that breaks routes.
 */
export function supabaseAdmin(): SupabaseClient {
  if (_admin) return _admin;

  const url = env("NEXT_PUBLIC_SUPABASE_URL");
  const service = env("SUPABASE_SERVICE_ROLE_KEY"); // REQUIRED for admin auth APIs
  const anon = env("NEXT_PUBLIC_SUPABASE_ANON_KEY"); // fallback (not recommended for admin routes)

  const key = service || anon;

  if (!url || !key) {
    throw new Error(
      "Missing env for server Supabase client. Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (recommended)."
    );
  }

  _admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  return _admin;
}
