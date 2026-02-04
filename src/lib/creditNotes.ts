// src/lib/creditNotes.ts
import { supabase } from "@/integrations/supabase/client";

export type CreditNoteStatus = "ISSUED" | "PENDING" | "REFUNDED" | "VOID";

export type CreditNoteRow = {
  id: number;
  credit_note_number: string | null;
  credit_note_date: string | null;
  total_amount: number | string | null;
  status: string | null;
  customers?:
    | { name?: string | null; customer_code?: string | null }
    | { name?: string | null; customer_code?: string | null }[]
    | null;
};

export type AuditLogRow = {
  id: number;
  created_at: string;
  actor: any | null;
  action: string;
  entity_table: string;
  entity_id: number;
  meta: any | null;
};

/* -------------------------
   Normalizers
------------------------- */

export function normalizeCustomer(c: CreditNoteRow["customers"]) {
  if (!c) return null;
  if (Array.isArray(c)) return c[0] || null;
  return c;
}

export function normalizeCreditStatus(s?: any): CreditNoteStatus {
  const v = String(s || "").toUpperCase();
  if (v === "VOID") return "VOID";
  if (v === "REFUNDED") return "REFUNDED";
  if (v === "PENDING") return "PENDING";
  return "ISSUED";
}

/* -------------------------
   Queries
------------------------- */

export async function listCreditNotes(args: {
  q?: string;
  status?: "ALL" | CreditNoteStatus;
  limit?: number;
}) {
  const { data, error } = await supabase
    .from("credit_notes")
    .select(
      `
      id,
      credit_note_number,
      credit_note_date,
      total_amount,
      status,
      customers:customer_id (
        name,
        customer_code
      )
    `
    )
    .order("id", { ascending: false })
    .limit(args.limit && args.limit > 0 ? args.limit : 500);

  if (error) throw new Error(error.message);

  let rows: CreditNoteRow[] = (data as any) || [];

  const q = String(args.q || "").trim().toLowerCase();
  const st = args.status || "ALL";

  rows = rows.filter((r) => {
    const s = normalizeCreditStatus(r.status);
    if (st !== "ALL" && s !== st) return false;

    if (!q) return true;

    const c = normalizeCustomer((r as any).customers);
    const hay = [
      r.credit_note_number || "",
      r.credit_note_date || "",
      r.status || "",
      c?.name || "",
      c?.customer_code || "",
    ]
      .join(" ")
      .toLowerCase();

    return hay.includes(q);
  });

  return rows;
}

/* -------------------------
   Mutations (status updates)
------------------------- */

export async function voidCreditNote(creditNoteId: number) {
  const { error } = await supabase
    .from("credit_notes")
    .update({ status: "VOID" })
    .eq("id", creditNoteId);

  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function refundCreditNote(creditNoteId: number, note?: string) {
  const { error } = await supabase
    .from("credit_notes")
    .update({ status: "REFUNDED" })
    .eq("id", creditNoteId);

  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function restoreCreditNote(creditNoteId: number) {
  const { error } = await supabase
    .from("credit_notes")
    .update({ status: "ISSUED" })
    .eq("id", creditNoteId);

  if (error) throw new Error(error.message);
  return { ok: true };
}

/* -------------------------
   Audit logs (optional)
------------------------- */

export async function getAuditLogs(args: { entity: string; id: number }) {
  const { data, error } = await supabase
    .from("audit_logs")
    .select("*")
    .eq("entity_table", args.entity)
    .eq("entity_id", args.id)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data || []) as AuditLogRow[];
}

