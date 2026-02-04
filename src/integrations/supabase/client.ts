// src/integrations/supabase/client.ts
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!SUPABASE_URL) throw new Error("Missing VITE_SUPABASE_URL in .env");
if (!SUPABASE_ANON_KEY) throw new Error("Missing VITE_SUPABASE_ANON_KEY in .env");

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
