// src/lib/credits.ts
//
// Data access + payment-allocation logic for the "Credits" page.
//
// This module shows each customer's REAL total outstanding balance across
// ALL of their unpaid / partially-paid invoices (it is NOT limited to a
// single month) and applies customer payments across open invoices using an
// oldest-invoice-first allocation strategy.
//
// It reuses the existing, proven payment primitives in `@/lib/payments`
// (manual `invoice_payments` rows + invoice total/status sync) so behaviour
// stays consistent with the rest of the app and with the DB triggers.

import { supabase } from "@/integrations/supabase/client";
import { addPayment, listPayments } from "@/lib/payments";

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

export type CreditPaymentStatus = "UNPAID" | "PARTIALLY_PAID" | "PAID";

export type CreditInvoiceRow = {
  id: number;
  invoice_number: string;
  customer_id: number;
  customer_name: string;
  customer_code: string | null;
  invoice_date: string | null;
  total: number;
  paid: number;
  balance: number;
  status: string; // raw DB status (ISSUED / PARTIALLY_PAID / PAID ...)
  pay_status: CreditPaymentStatus; // normalized for the Credits page
};

export type CreditCustomerSummary = {
  customer_id: number;
  customer_name: string;
  customer_code: string | null;
  invoices: CreditInvoiceRow[];
  due_count: number; // # of invoices with balance > 0
  total_invoiced: number; // sum of invoice totals (open invoices)
  total_paid: number; // sum of amount paid (open invoices)
  balance_due: number; // sum of outstanding balances
  pay_status: CreditPaymentStatus; // overall status for the customer
};

/** Normalize a raw invoice row into total / paid / balance / status. */
function normalizeInvoice(r: any): CreditInvoiceRow {
  const total = round2(n2(r.gross_total ?? r.total_amount ?? r.total_incl_vat ?? 0));
  const paid = round2(n2(r.amount_paid));
  const credits = round2(n2(r.credits_applied));
  // Prefer an explicit balance column, else derive it.
  const rawBalance =
    r.balance_due != null
      ? n2(r.balance_due)
      : r.balance_remaining != null
        ? n2(r.balance_remaining)
        : total - paid - credits;
  const balance = round2(Math.max(0, rawBalance));

  let pay_status: CreditPaymentStatus;
  if (balance <= 0.009 && total > 0) pay_status = "PAID";
  else if (paid + credits > 0.009) pay_status = "PARTIALLY_PAID";
  else pay_status = "UNPAID";

  return {
    id: Number(r.id),
    invoice_number: String(r.invoice_number ?? ""),
    customer_id: Number(r.customer_id),
    customer_name: r?.customers?.name ?? r?.customer_name ?? "—",
    customer_code: r?.customers?.customer_code ?? r?.customer_code ?? null,
    invoice_date: r.invoice_date ?? null,
    total,
    paid: round2(paid + credits),
    balance,
    status: String(r.status ?? ""),
    pay_status,
  };
}

/**
 * Fetch every "real" invoice (excludes DRAFT and VOID) with its customer,
 * normalized. This is the raw material for the Credits page; the page itself
 * does the filtering/searching client-side so it can show real, all-time
 * balances without being constrained to a month.
 */
export async function listCreditInvoices(): Promise<CreditInvoiceRow[]> {
  const { data, error } = await supabase
    .from("invoices")
    .select(
      `
      id, invoice_number, customer_id, invoice_date, status,
      total_amount, gross_total, total_incl_vat,
      amount_paid, credits_applied, balance_remaining, balance_due,
      customers:customer_id ( id, name, customer_code )
      `
    )
    .not("status", "in", "(DRAFT,VOID)")
    .order("invoice_date", { ascending: true })
    .order("id", { ascending: true })
    .limit(5000);

  if (error) throw error;
  return (data || []).map(normalizeInvoice);
}

/** Group invoices into per-customer summaries. */
export function buildCustomerSummaries(invoices: CreditInvoiceRow[]): CreditCustomerSummary[] {
  const byCustomer = new Map<number, CreditCustomerSummary>();

  for (const inv of invoices) {
    if (!inv.customer_id) continue;
    let s = byCustomer.get(inv.customer_id);
    if (!s) {
      s = {
        customer_id: inv.customer_id,
        customer_name: inv.customer_name,
        customer_code: inv.customer_code,
        invoices: [],
        due_count: 0,
        total_invoiced: 0,
        total_paid: 0,
        balance_due: 0,
        pay_status: "PAID",
      };
      byCustomer.set(inv.customer_id, s);
    }
    s.invoices.push(inv);
    s.total_invoiced = round2(s.total_invoiced + inv.total);
    s.total_paid = round2(s.total_paid + inv.paid);
    s.balance_due = round2(s.balance_due + inv.balance);
    if (inv.balance > 0.009) s.due_count += 1;
  }

  for (const s of byCustomer.values()) {
    // Sort each customer's invoices oldest-first for the detail view.
    s.invoices.sort((a, b) => String(a.invoice_date).localeCompare(String(b.invoice_date)) || a.id - b.id);
    if (s.balance_due <= 0.009) s.pay_status = "PAID";
    else if (s.total_paid > 0.009) s.pay_status = "PARTIALLY_PAID";
    else s.pay_status = "UNPAID";
  }

  return Array.from(byCustomer.values()).sort((a, b) => b.balance_due - a.balance_due);
}

export type AllocationLine = {
  invoice_id: number;
  invoice_number: string;
  applied: number;
  balance_before: number;
  balance_after: number;
};

/**
 * Preview how a payment amount would be distributed across a customer's open
 * invoices (oldest first). Pure function — does not touch the database.
 */
export function previewAllocation(openInvoices: CreditInvoiceRow[], amount: number): {
  lines: AllocationLine[];
  allocated: number;
  unallocated: number;
} {
  let remaining = round2(n2(amount));
  const lines: AllocationLine[] = [];

  const ordered = [...openInvoices]
    .filter((i) => i.balance > 0.009)
    .sort((a, b) => String(a.invoice_date).localeCompare(String(b.invoice_date)) || a.id - b.id);

  for (const inv of ordered) {
    if (remaining <= 0.009) break;
    const applied = round2(Math.min(remaining, inv.balance));
    if (applied <= 0) continue;
    lines.push({
      invoice_id: inv.id,
      invoice_number: inv.invoice_number,
      applied,
      balance_before: inv.balance,
      balance_after: round2(inv.balance - applied),
    });
    remaining = round2(remaining - applied);
  }

  const allocated = round2(lines.reduce((s, l) => s + l.applied, 0));
  return { lines, allocated, unallocated: round2(Math.max(0, n2(amount) - allocated)) };
}

export type ApplyPaymentInput = {
  customerId: number;
  amount: number;
  paymentDate: string; // YYYY-MM-DD
  method: string;
  reference?: string | null;
  note?: string | null;
  /** When true (default) auto-allocate oldest-first; otherwise pay a single invoice. */
  autoAllocate?: boolean;
  /** Required when autoAllocate is false. */
  singleInvoiceId?: number;
};

/**
 * Apply a customer payment across open invoices.
 *
 * - Oldest invoice first (unless a single invoice is targeted).
 * - Prevents overpayment: the amount may not exceed the total outstanding
 *   balance (or the targeted invoice's balance in single-invoice mode).
 * - Each allocated slice is written as a manual `invoice_payments` row via the
 *   shared `addPayment()` helper, which also re-syncs the invoice's
 *   amount_paid / balance / status.
 */
export async function applyCustomerPayment(input: ApplyPaymentInput): Promise<AllocationLine[]> {
  const amount = round2(n2(input.amount));
  if (amount <= 0) throw new Error("Payment amount must be greater than 0");
  if (!input.method) throw new Error("Please choose a payment method");

  // Always re-read fresh balances from the DB right before allocating.
  const all = await listCreditInvoices();
  let open = all.filter((i) => i.customer_id === input.customerId && i.balance > 0.009);

  if (input.autoAllocate === false) {
    if (!input.singleInvoiceId) throw new Error("No invoice selected for this payment");
    open = open.filter((i) => i.id === input.singleInvoiceId);
    if (!open.length) throw new Error("Selected invoice has no outstanding balance");
  }

  const totalDue = round2(open.reduce((s, i) => s + i.balance, 0));
  if (totalDue <= 0) throw new Error("This customer has no outstanding balance");
  if (amount > totalDue + 0.009) {
    throw new Error(
      `Payment (Rs ${amount.toLocaleString()}) exceeds the outstanding balance (Rs ${totalDue.toLocaleString()}). Overpayment is not allowed.`
    );
  }

  const { lines } = previewAllocation(open, amount);
  if (!lines.length) throw new Error("Nothing to allocate");

  // Apply each slice sequentially so invoice totals stay consistent.
  for (const line of lines) {
    await addPayment({
      invoice_id: line.invoice_id,
      payment_date: input.paymentDate,
      amount: line.applied,
      method: input.method,
      reference: input.reference ?? null,
      notes: input.note ?? null,
    });
  }

  return lines;
}

/** Per-invoice payment history (reuses the payments lib). */
export async function getInvoicePaymentHistory(invoiceId: number) {
  return listPayments(invoiceId);
}
