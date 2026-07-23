-- Lock down rp_users to the server's service-role client only.
--
-- Confirmed before writing this migration: no frontend code queries rp_users
-- directly via the browser Supabase client (grep across src/ found zero
-- `supabase.from("rp_users")` call sites). All user management already goes
-- through server/routes/adminUsers.ts using the service-role key, and
-- server/index.ts's resolveUser() (used by every protected route) also reads
-- rp_users via the service-role client. The service role bypasses RLS, so
-- enabling RLS here with no permissive policies simply removes the anon/
-- authenticated keys' ability to read or write this table directly, without
-- touching any legitimate code path.
--
-- Scope note: this migration intentionally does NOT touch RLS on business
-- tables (invoices, customers, invoice_payments, credit_notes, stock, etc.).
-- Several pages (Credits.tsx, CreditNotes.tsx, Reports.tsx, etc.) read/write
-- those tables directly via the browser anon-key client, and some tables have
-- triggers with side effects on other tables. Changing RLS there needs a full
-- audit of every supabase.from(...) call site plus end-to-end testing of
-- invoice/quotation/credit-note/stock/credits/payments/reports/aging/public
-- print workflows before it's safe to apply — see README "Security" section
-- for the recommended follow-up.

alter table public.rp_users enable row level security;

-- No policies are added: with RLS enabled and zero policies, PostgREST (anon
-- and authenticated keys) gets zero access to this table. Only the
-- service-role key (which bypasses RLS) can read/write it, which matches how
-- the app already uses this table exclusively through the Express server.
