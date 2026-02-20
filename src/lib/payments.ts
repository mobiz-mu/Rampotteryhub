// src/lib/payments.ts
import { supabase } from "@/integrations/supabase/client";
import type { InvoicePayment, PaymentInsert } from "@/types/payment";
import type { Invoice } from "@/types/invoice";

/* =========================
   Helpers
========================= */

function n2(v: any) {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function toISODate(d: any) {
  // Accept "YYYY-MM-DD" or Date; fall back to today (YYYY-MM-DD)
  if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  const dt = d instanceof Date ? d : new Date();
  return dt.toISOString().slice(0, 10);
}

/* =========================
   List Payments
========================= */

export async function listPayments(invoiceId: number) {
  if (!Number.isFinite(invoiceId)) return [];

  const { data, error } = await supabase
    .from("invoice_payments")
    .select("id,invoice_id,payment_date,amount,method,reference,notes,created_at,is_auto")
    .eq("invoice_id", invoiceId)
    .order("payment_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data || []) as InvoicePayment[];
}

/* =========================
   Add Manual Payment
   - Client must NEVER insert AUTO payments.
========================= */

export async function addPayment(row: PaymentInsert) {
  if (!Number.isFinite(row.invoice_id)) throw new Error("Invalid invoice id");

  // 🚫 Do NOT allow client to insert AUTO payments (trigger handles it)
  if (row.is_auto || String(row.method || "").toUpperCase() === "AUTO_STATUS") {
    throw new Error("AUTO payments are system-generated. Please add a manual payment method.");
  }

  const amount = round2(n2(row.amount));
  if (amount <= 0) throw new Error("Payment amount must be greater than 0");

  const { data, error } = await supabase
    .from("invoice_payments")
    .insert({
      invoice_id: row.invoice_id,
      payment_date: toISODate(row.payment_date),
      amount,
      method: row.method,
      reference: row.reference ?? null,
      notes: row.notes ?? null,
      is_auto: false, // ✅ force manual
    })
    .select("id,invoice_id,payment_date,amount,method,reference,notes,created_at,is_auto")
    .single();

  if (error) throw error;

  // ✅ Auto-sync invoice totals after insert
  await syncInvoicePaidById(row.invoice_id);

  return data as InvoicePayment;
}

/* =========================
   Delete Payment
========================= */

export async function deletePayment(id: string, invoiceId: number) {
  const { error } = await supabase.from("invoice_payments").delete().eq("id", id);
  if (error) throw error;

  // ✅ Auto-sync invoice totals after delete
  await syncInvoicePaidById(invoiceId);

  return true;
}

/* =========================
   Compute Status
========================= */

export function computeInvoiceStatus(current: Invoice["status"], total: number, paid: number) {
  if (current === "DRAFT") return "DRAFT";

  const t = round2(n2(total));
  const p = round2(n2(paid));

  if (p <= 0) return "ISSUED";
  if (p + 0.009 < t) return "PARTIALLY_PAID";
  return "PAID";
}

/* =========================
   Sync Invoice After Payments
   IMPORTANT:
   - This updates invoice totals fields (amount_paid, balance_remaining, status)
   - It does NOT create any payment rows.
   - Your DB trigger may also update things; this keeps UI consistent.
========================= */

export async function syncInvoicePaid(invoice: Invoice) {
  return syncInvoicePaidById(invoice.id);
}

export async function syncInvoicePaidById(invoiceId: number) {
  // Get invoice
  const { data: inv, error: invErr } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", invoiceId)
    .single();

  if (invErr) throw invErr;

  // Sum payments
  const { data: payments, error } = await supabase
    .from("invoice_payments")
    .select("amount")
    .eq("invoice_id", invoiceId);

  if (error) throw error;

  const sumPaid = round2((payments || []).reduce((s, r: any) => s + n2(r.amount), 0));

  const total = round2(n2(inv.gross_total ?? inv.total_amount ?? 0));
  const credits = round2(n2(inv.credits_applied ?? 0));

  const balance = round2(Math.max(0, total - sumPaid - credits));
  const status = computeInvoiceStatus(inv.status, total, sumPaid + credits);

  const { data: upd, error: err2 } = await supabase
    .from("invoices")
    .update({
      amount_paid: sumPaid,
      balance_remaining: balance,
      balance_due: balance,
      status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", invoiceId)
    .select("*")
    .single();

  if (err2) throw err2;

  return upd as Invoice;
}

/* =========================
   NOTE (IMPORTANT)
=========================

✅ I REMOVED markInvoicePaid() FROM THIS FILE ON PURPOSE.

Reason:
- Your UI imports markInvoicePaid from "@/lib/invoices"
- Your DB trigger trg_auto_create_invoice_payment() already creates AUTO payment rows.
- If you keep a second markInvoicePaid here and someone uses it (or duplicates logic),
  it can reintroduce the "duplicate key value violates unique constraint invoice_payments_auto_unique" issue.

So:
- Keep "Mark Paid" logic ONLY in src/lib/invoices.ts and make it status-only.
- Keep payment insert logic ONLY here (manual payments only).

*/
