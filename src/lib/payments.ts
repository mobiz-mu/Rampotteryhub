import { supabase } from "@/integrations/supabase/client";
import type { InvoicePayment, PaymentInsert } from "@/types/payment";
import type { Invoice } from "@/types/invoice";

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export async function listPayments(invoiceId: number) {
  const { data, error } = await supabase
    .from("invoice_payments")
    .select("id,invoice_id_bigint,payment_date,amount,method,reference,notes,created_at")
    .eq("invoice_id_bigint", invoiceId)
    .order("payment_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data || []) as InvoicePayment[];
}

export async function addPayment(row: PaymentInsert) {
  const { data, error } = await supabase
    .from("invoice_payments")
    .insert({
      invoice_id_bigint: row.invoice_id_bigint,
      payment_date: row.payment_date,
      amount: row.amount,
      method: row.method,
      reference: row.reference ?? null,
      notes: row.notes ?? null,
    })
    .select("id,invoice_id_bigint,payment_date,amount,method,reference,notes,created_at")
    .single();

  if (error) throw error;
  return data as InvoicePayment;
}

export async function deletePayment(id: string) {
  const { error } = await supabase.from("invoice_payments").delete().eq("id", id);
  if (error) throw error;
  return true;
}

export function computeInvoiceStatus(current: Invoice["status"], total: number, paid: number) {
  if (current === "DRAFT") return "DRAFT" as const;

  const t = round2(Number(total || 0));
  const p = round2(Number(paid || 0));

  if (p <= 0) return "ISSUED" as const;
  if (p > 0 && p + 0.009 < t) return "PARTIALLY_PAID" as const;
  return "PAID" as const;
}

export async function syncInvoicePaid(invoice: Invoice) {
  const { data, error } = await supabase
    .from("invoice_payments")
    .select("amount")
    .eq("invoice_id_bigint", invoice.id);

  if (error) throw error;

  const sumPaid = round2((data || []).reduce((s, r: any) => s + Number(r.amount || 0), 0));
  const total = round2(Number(invoice.total_amount || 0));
  const balance = round2(total - sumPaid);

  const status = computeInvoiceStatus(invoice.status, total, sumPaid);

  const { data: upd, error: err2 } = await supabase
    .from("invoices")
    .update({
      amount_paid: sumPaid,
      balance_remaining: balance,
      balance_due: balance,
      status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", invoice.id)
    .select("*")
    .single();

  if (err2) throw err2;
  return upd as Invoice;
}
