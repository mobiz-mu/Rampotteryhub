// src/lib/creditNotes.ts
import { supabase } from "@/integrations/supabase/client";

export type CreditNoteStatus = "ISSUED" | "PENDING" | "REFUNDED" | "VOID";

export type CreditNoteRow = {
  id: number;
  credit_note_number: string | null;
  credit_note_date: string | null;
  total_amount: number | string | null;
  status: string | null;

  // ✅ NEW
  invoice_id?: number | null;
  reason?: string | null;
  reason_note?: string | null;

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
   Helpers
------------------------- */
function n2(v: any) {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}
function round2(v: any) {
  const x = n2(v);
  return Math.round(x * 100) / 100;
}

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

/* =========================================================
   ✅ Invoice Credits Sync
   - sum ISSUED credit notes linked to invoice
   - update invoice credits_applied + balance_remaining + status
   - safe fallback if some columns don't exist
========================================================= */

export async function recomputeInvoiceCredits(invoiceId: number) {
  const id = Number(invoiceId);
  if (!Number.isFinite(id) || id <= 0) throw new Error("Invalid invoice id");

  // 1) sum credits (ISSUED only)
  const { data: creditsRows, error: crErr } = await supabase
    .from("credit_notes")
    .select("id,total_amount,reason,reason_note,status")
    .eq("invoice_id", id)
    .eq("status", "ISSUED")
    .order("id", { ascending: false });

  if (crErr) throw new Error(crErr.message);

  const creditsApplied = round2((creditsRows || []).reduce((s: number, r: any) => s + n2(r.total_amount), 0));
  const latest = (creditsRows || [])[0] as any;

  // 2) load invoice values needed
  const { data: inv, error: invErr } = await supabase
    .from("invoices")
    .select("id,gross_total,total_amount,amount_paid,credits_applied,balance_remaining,status")
    .eq("id", id)
    .single();

  if (invErr) throw new Error(invErr.message);

  const gross = round2(n2(inv.gross_total ?? inv.total_amount));
  const paid = round2(n2(inv.amount_paid));
  const bal = round2(Math.max(0, gross - paid - creditsApplied));

  const eps = 0.00001;
  let status: any = "ISSUED";
  if (bal <= eps) status = "PAID";
  else if (paid > eps || creditsApplied > eps) status = "PARTIALLY_PAID";
  else status = "ISSUED";

  // 3) update invoice (try full, fallback to minimal if columns missing)
  const fullUpdate: any = {
    credits_applied: creditsApplied,
    balance_remaining: bal,
    balance_due: bal, // may not exist
    status,
    credits_reason: latest?.reason ?? null, // may not exist
    credits_reason_note: latest?.reason_note ?? null, // may not exist
    updated_at: new Date().toISOString(), // may not exist
  };

  const minUpdate: any = {
    credits_applied: creditsApplied,
    balance_remaining: bal,
    status,
  };

  const tryFull = await supabase.from("invoices").update(fullUpdate).eq("id", id);
  if (tryFull.error) {
    // fallback: minimal update only (prevents sync breaking)
    const tryMin = await supabase.from("invoices").update(minUpdate).eq("id", id);
    if (tryMin.error) throw new Error(tryMin.error.message);
  }

  return { ok: true, creditsApplied, balance: bal, status };
}

/** ✅ alias so UI code can call either name */
export async function syncInvoiceCredits(args: { invoiceId: number }) {
  return recomputeInvoiceCredits(args.invoiceId);
}

/**
 * ✅ Link a credit note to an invoice and apply it (via recomputeInvoiceCredits).
 * Call this after CN total_amount is computed.
 */
export async function applyCreditNoteToInvoice(args: {
  creditNoteId: number;
  invoiceId: number;
  reason?: "DAMAGED" | "RETURN" | "OTHERS" | string | null;
  reasonNote?: string | null;
}) {
  const creditNoteId = Number(args.creditNoteId);
  const invoiceId = Number(args.invoiceId);

  if (!Number.isFinite(creditNoteId) || creditNoteId <= 0) throw new Error("Invalid credit note id");
  if (!Number.isFinite(invoiceId) || invoiceId <= 0) throw new Error("Invalid invoice id");

  const reasonNote = args.reasonNote?.trim?.() ? args.reasonNote.trim() : null;

  // Update credit note linkage + reason fields
  const { error: cnErr } = await supabase
    .from("credit_notes")
    .update({
      invoice_id: invoiceId,
      reason: args.reason ?? null,
      reason_note: reasonNote,
      updated_at: new Date().toISOString(), // may or may not exist (if not, ignore by DB)
    } as any)
    .eq("id", creditNoteId);

  if (cnErr) throw new Error(cnErr.message);

  // Apply to invoice (sum of ISSUED credit notes)
  return recomputeInvoiceCredits(invoiceId);
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
      invoice_id,
      reason,
      reason_note,
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
      String(r.invoice_id ?? ""),
      r.reason || "",
      r.reason_note || "",
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
   ✅ Also recompute invoice credits if linked
------------------------- */

async function getLinkedInvoiceId(creditNoteId: number) {
  const { data, error } = await supabase
    .from("credit_notes")
    .select("id, invoice_id")
    .eq("id", creditNoteId)
    .single();

  if (error) throw new Error(error.message);
  return (data as any)?.invoice_id ?? null;
}

export async function voidCreditNote(creditNoteId: number) {
  const id = Number(creditNoteId);
  const invoiceId = await getLinkedInvoiceId(id);

  const { error } = await supabase.from("credit_notes").update({ status: "VOID" }).eq("id", id);
  if (error) throw new Error(error.message);

  if (invoiceId) await recomputeInvoiceCredits(Number(invoiceId));
  return { ok: true };
}

export async function refundCreditNote(creditNoteId: number, note?: string) {
  const id = Number(creditNoteId);
  const invoiceId = await getLinkedInvoiceId(id);

  const { error } = await supabase.from("credit_notes").update({ status: "REFUNDED" }).eq("id", id);
  if (error) throw new Error(error.message);

  if (invoiceId) await recomputeInvoiceCredits(Number(invoiceId));
  return { ok: true };
}

export async function restoreCreditNote(creditNoteId: number) {
  const id = Number(creditNoteId);
  const invoiceId = await getLinkedInvoiceId(id);

  const { error } = await supabase.from("credit_notes").update({ status: "ISSUED" }).eq("id", id);
  if (error) throw new Error(error.message);

  if (invoiceId) await recomputeInvoiceCredits(Number(invoiceId));
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


