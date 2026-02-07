// src/lib/supabaseClient.ts
// CLIENT ONLY — Vite/React pages should import from here.
// NEVER import this file inside Next.js route handlers.

export { supabase, apiBase, fetchPublic, assertPublicToken } from "@/integrations/supabase/client";
