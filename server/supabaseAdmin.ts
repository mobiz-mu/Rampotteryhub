// server/supabaseAdmin.ts
import { createClient } from "@supabase/supabase-js";

export function supaAdmin() {
  const url =
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const anon =
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url) throw new Error("Missing SUPABASE_URL (or VITE_SUPABASE_URL) in env");
  if (!service && !anon) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY (recommended) or SUPABASE_ANON_KEY");
  }

  // service role preferred (server-only)
  return createClient(url, (service || anon)!, {
    auth: { persistSession: false },
  });
}
