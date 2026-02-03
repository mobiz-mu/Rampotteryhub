import { createClient } from "@supabase/supabase-js";

export function supaAdmin() {
  const url = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !(service || anon)) {
    throw new Error("Missing Supabase env. Need SUPABASE URL + (SERVICE_ROLE_KEY or ANON)");
  }

  // service role preferred (server-only)
  return createClient(url, service || anon!, {
    auth: { persistSession: false },
  });
}
