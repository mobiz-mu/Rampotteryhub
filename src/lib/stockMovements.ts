// src/lib/stockMovements.ts
import { supabase } from "@/integrations/supabase/client";

const n2 = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export async function applyStockForCreditNoteIssued(creditNoteId: number) {
  const cnId = Number(creditNoteId);
  if (!Number.isFinite(cnId) || cnId <= 0) throw new Error("Invalid credit note id");

  // load items (use total_qty)
  const { data: items, error } = await supabase
    .from("credit_note_items")
    .select("product_id,total_qty")
    .eq("credit_note_id", cnId);

  if (error) throw new Error(error.message);

  const rows = (items || [])
    .filter((it: any) => Number(it.product_id) > 0 && n2(it.total_qty) > 0)
    .map((it: any) => ({
      product_id: Number(it.product_id),
      movement_type: "IN",
      quantity: n2(it.total_qty),
      source_table: "credit_notes",
      source_id: cnId,
      reference: `ISSUE:${cnId}`, // same for all rows is OK because UNIQUE is per product_id too
      notes: "Credit note issued (stock return)",
    }));

  if (!rows.length) return { ok: true, inserted: 0 };

  // ✅ idempotent: your uq_stock_movements_cn_in prevents duplicates per product
  const ins = await supabase.from("stock_movements").insert(rows as any);
  if (ins.error) {
    // If duplicates already exist, Supabase returns an error. We treat that as OK.
    // (You can add upsert if you want, but PostgREST upsert needs proper unique constraint target.)
    const msg = String(ins.error.message || "");
    if (!msg.toLowerCase().includes("duplicate")) throw new Error(msg);
  }

  return { ok: true, inserted: rows.length };
}

export async function applyStockForInvoiceIssued(invoiceId: number) {
  const invId = Number(invoiceId);
  if (!Number.isFinite(invId) || invId <= 0) throw new Error("Invalid invoice id");

  const { data: items, error } = await supabase
    .from("invoice_items")
    .select("product_id,total_qty")
    .eq("invoice_id", invId);

  if (error) throw new Error(error.message);

  const rows = (items || [])
    .filter((it: any) => Number(it.product_id) > 0 && n2(it.total_qty) > 0)
    .map((it: any) => ({
      product_id: Number(it.product_id),
      movement_type: "OUT",
      quantity: n2(it.total_qty),
      source_table: "invoices",
      source_id: invId,
      reference: `ISSUE:${invId}`,
      notes: "Invoice issued (stock out)",
    }));

  if (!rows.length) return { ok: true, inserted: 0 };

  // ✅ idempotent: uq_stock_movements_invoice_out prevents duplicates per product
  const ins = await supabase.from("stock_movements").insert(rows as any);
  if (ins.error) {
    const msg = String(ins.error.message || "");
    if (!msg.toLowerCase().includes("duplicate")) throw new Error(msg);
  }

  return { ok: true, inserted: rows.length };
}

/**
 * CN VOID/REFUND: reverse the return (stock OUT)
 * If later restored to ISSUED: delete these OUT rows instead of inserting new IN.
 */
export async function applyStockForCreditNoteVoidOrRefund(creditNoteId: number, mode: "VOID" | "REFUND") {
  const cnId = Number(creditNoteId);
  if (!Number.isFinite(cnId) || cnId <= 0) throw new Error("Invalid credit note id");

  const { data: items, error } = await supabase
    .from("credit_note_items")
    .select("product_id,total_qty")
    .eq("credit_note_id", cnId);

  if (error) throw new Error(error.message);

  const rows = (items || [])
    .filter((it: any) => Number(it.product_id) > 0 && n2(it.total_qty) > 0)
    .map((it: any) => ({
      product_id: Number(it.product_id),
      movement_type: "OUT",
      quantity: n2(it.total_qty),
      source_table: "credit_notes",
      source_id: cnId,
      reference: `${mode}:${cnId}`,
      notes: `Credit note ${mode.toLowerCase()} (reversing stock return)`,
    }));

  if (!rows.length) return { ok: true, inserted: 0 };

  // ✅ idempotent: uq_stock_movements_cn_out prevents duplicates per product
  const ins = await supabase.from("stock_movements").insert(rows as any);
  if (ins.error) {
    const msg = String(ins.error.message || "");
    if (!msg.toLowerCase().includes("duplicate")) throw new Error(msg);
  }

  return { ok: true, inserted: rows.length };
}

export async function deleteCreditNoteOutReversal(creditNoteId: number) {
  const cnId = Number(creditNoteId);
  if (!Number.isFinite(cnId) || cnId <= 0) throw new Error("Invalid credit note id");

  // delete any OUT reversal rows for this CN (VOID/REFUND)
  // ✅ trigger will re-apply stock on DELETE
  const del = await supabase
    .from("stock_movements")
    .delete()
    .eq("source_table", "credit_notes")
    .eq("source_id", cnId)
    .eq("movement_type", "OUT");

  if (del.error) throw new Error(del.error.message);
  return { ok: true };
}
