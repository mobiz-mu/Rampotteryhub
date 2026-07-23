// server/supabaseAdmin.ts
import { createClient } from "@supabase/supabase-js";

export function supaAdmin() {
  const url =
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("Missing SUPABASE_URL (or VITE_SUPABASE_URL) in env");
  if (!service) {
    // Server admin operations (user management, public print, audit logs) require
    // the service role key. Silently falling back to the anon key would let this
    // client run with the wrong privileges instead of failing loudly.
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY in env — server admin client cannot start without it");
  }

  return createClient(url, service, {
    auth: { persistSession: false },
  });
}
