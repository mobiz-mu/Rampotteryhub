// src/lib/rpFetch.ts
import { supabase } from "@/integrations/supabase/client";

/** Current Supabase session access token, if any — the server verifies this. */
export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token || null;
}

export async function rpFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const headers = new Headers(init.headers || {});

  const token = await getAccessToken();
  if (token) headers.set("authorization", `Bearer ${token}`);

  // JSON convenience
  if (!headers.has("content-type") && init.body) {
    headers.set("content-type", "application/json");
  }

  return fetch(input, { ...init, headers });
}
