// src/lib/invoices.ts
import { supabase } from "@/integrations/supabase/client";
import type { Invoice, InvoiceRow, InvoiceStatus } from "@/types/invoice";
import type { InvoiceItem } from "@/types/invoiceItem";
import { round2 } from "@/lib/invoiceTotals";

// Re-export wrappers so InvoiceCreate.tsx can import from "@/lib/invoices"
export { listCustomers } from "@/lib/customers";
export { listProducts } from "@/lib/products";

/* =========================
   helpers
========================= */
function n2(v: any) {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}
function clampPct(v: any) {
  const x = n2(v);
  return Math.max(0, Math.min(100, x));
}

/* =========================
   LIST INVOICES
========================= */
export async function listInvoices(params?: {
  q?: string;
  status?: InvoiceStatus | "ALL";
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string; // YYYY-MM-DD
  limit?: number;
}) {
  const q = (params?.q || "").trim();
  const status = params?.status ?? "ALL";
  const limit = params?.limit ?? 200;

  let query = supabase
    .from("invoices")
    .select(
      `
      id,invoice_number,customer_id,invoice_date,due_date,subtotal,vat_amount,total_amount,status,
      amount_paid,previous_balance,balance_remaining,notes,created_at,updated_at,vat_percent,
      discount_percent,discount_amount,sales_rep_phone,sales_rep,gross_total,purchase_order_no,
      total_excl_vat,total_incl_vat,balance_due,stock_deducted_at,invoice_year,invoice_seq,
      customers:customer_id ( id,name,customer_code,phone,whatsapp )
      `
    )
    .order("invoice_date", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);

  if (status !== "ALL") query = query.eq("status", status);
  if (params?.dateFrom) query = query.gte("invoice_date", params.dateFrom);
  if (params?.dateTo) query = query.lte("invoice_date", params.dateTo);

  if (q) {
    const s = q.replaceAll(",", " ");
    // NOTE: supabase .or() doesn't join across relations reliably,
    // so keep it on invoice fields; we also do local filter below.
    query = query.or(`invoice_number.ilike.%${s}%,sales_rep.ilike.%${s}%`);
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data || []).map((r: any) => ({
    ...r,
    customer: r?.customers ?? null,
    customer_name: r?.customers?.name ?? null,
    customer_code: r?.customers?.customer_code ?? null,
  })) as any as InvoiceRow[];

  if (!q) return rows;

  const q2 = q.toLowerCase();
  return rows.filter((r: any) => {
    const a = String(r.invoice_number || "").toLowerCase();
    const b = String(r.sales_rep || "").toLowerCase();
    const c = String(r.customer_name || "").toLowerCase();
    const d = String(r.customer_code || "").toLowerCase();
    return a.includes(q2) || b.includes(q2) || c.includes(q2) || d.includes(q2);
  });
}

/* =========================
   GET (single invoice)
========================= */
export async function getInvoice(id: number) {
  const { data, error } = await supabase.from("invoices").select("*").eq("id", id).single();
  if (error) throw error;
  return data as Invoice;
}

/* =========================
   GET invoice + items (for duplicate)
   Used by InvoiceCreate.tsx: getInvoiceById()
========================= */
export async function getInvoiceById(id: string | number) {
  const invoiceId = Number(id);
  if (!Number.isFinite(invoiceId)) throw new Error("Invalid invoice id");

  // invoice
  const inv = await getInvoice(invoiceId);

  // items with products
  const { data: items, error: itemsErr } = await supabase
    .from("invoice_items")
    .select(
      `
      id,invoice_id,product_id,uom,box_qty,pcs_qty,units_per_box,total_qty,
      vat_rate,unit_price_excl_vat,unit_vat,unit_price_incl_vat,line_total,description,
      products:product_id ( id,sku,item_code,name,units_per_box,selling_price )
      `
    )
    .eq("invoice_id", invoiceId)
    .order("id", { ascending: true });

  if (itemsErr) throw itemsErr;

  const mappedItems = (items || []).map((r: any) => ({
    ...r,
    product: r.products ?? null,
    // convenience for UI duplicate:
    item_code: r?.products?.item_code || r?.products?.sku || "",
  }));

  return {
    ...inv,
    items: mappedItems,
  };
}

/* =========================
   UPDATE invoice header
========================= */
export async function updateInvoiceHeader(id: number, patch: Partial<Invoice>) {
  const { data, error } = await supabase
    .from("invoices")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return data as Invoice;
}

/* =========================
   CREATE DRAFT INVOICE (base)
========================= */
export async function createDraftInvoice(payload: {
  customer_id: number;
  invoice_date: string; // YYYY-MM-DD
  due_date?: string | null;
  notes?: string | null;

  vat_percent?: number | null;
  discount_percent?: number | null;

  sales_rep?: string | null;
  sales_rep_phone?: string | null;
  purchase_order_no?: string | null;

  previous_balance?: number | null;
  amount_paid?: number | null;
}) {
  const insertRow: any = {
    customer_id: payload.customer_id,
    invoice_date: payload.invoice_date,
    due_date: payload.due_date ?? null,
    notes: payload.notes ?? null,

    status: "DRAFT",

    vat_percent: n2(payload.vat_percent ?? 15),
    discount_percent: clampPct(payload.discount_percent ?? 0),

    sales_rep: payload.sales_rep ?? null,
    sales_rep_phone: payload.sales_rep_phone ?? null,
    purchase_order_no: payload.purchase_order_no ?? null,

    // totals start empty
    subtotal: 0,
    vat_amount: 0,
    total_amount: 0,
    gross_total: 0,
    discount_amount: 0,

    previous_balance: n2(payload.previous_balance ?? 0),
    amount_paid: n2(payload.amount_paid ?? 0),
    balance_remaining: 0,
    balance_due: 0,
  };

  const { data, error } = await supabase
    .from("invoices")
    .insert(insertRow)
    .select("*")
    .single();

  if (error) throw error;
  return data as Invoice;
}

/* =========================
   Backward-compatible createInvoice
   (InvoiceCreate.tsx uses camelCase payload)
========================= */
export async function createInvoice(payload: any) {
  // InvoiceCreate.tsx sends camelCase keys
  const inv = await createDraftInvoice({
    customer_id: Number(payload.customerId),
    invoice_date: String(payload.invoiceDate),
    due_date: payload.dueDate ?? null,
    notes: payload.notes ?? null,

    vat_percent: n2(payload.vatPercent ?? 15),
    discount_percent: clampPct(payload.discountPercent ?? 0),

    sales_rep: payload.salesRep ?? null,
    sales_rep_phone: payload.salesRepPhone ?? null,
    purchase_order_no: payload.purchaseOrderNo ?? null,

    previous_balance: n2(payload.previousBalance ?? 0),
    amount_paid: n2(payload.amountPaid ?? 0),
  });

  const items = (payload.items || []) as any[];
  if (!items.length) return inv;

  // Insert invoice_items
  const insertRows = items.map((it) => ({
    invoice_id: inv.id,
    product_id: it.product_id,
    uom: String(it.uom || "BOX").toUpperCase(),
    box_qty: it.box_qty ?? 0,
    pcs_qty: it.pcs_qty ?? 0,
    units_per_box: it.units_per_box ?? 1,
    total_qty: it.total_qty ?? 0,

    unit_price_excl_vat: it.unit_price_excl_vat ?? 0,
    vat_rate: it.vat_rate ?? inv.vat_percent ?? 15,
    unit_vat: it.unit_vat ?? 0,
    unit_price_incl_vat: it.unit_price_incl_vat ?? 0,
    line_total: it.line_total ?? 0,

    description: it.description ?? null,
  }));

  const { error: itemsErr } = await supabase.from("invoice_items").insert(insertRows);
  if (itemsErr) throw itemsErr;

  // IMPORTANT for Option A:
  // After create, keep totals as BASE (no discount applied yet),
  // user can click "Apply Discount" later in InvoiceView.
  const fresh = await listInvoiceItemsForTotals(inv.id);
  const updated = await recalcAndSaveBaseTotalsNoDiscount(inv.id, inv, fresh);

  return updated;
}

/* =========================
   Invoice items loader for totals
========================= */
async function listInvoiceItemsForTotals(invoiceId: number) {
  const { data, error } = await supabase
    .from("invoice_items")
    .select("id,invoice_id,total_qty,unit_price_excl_vat,unit_vat,vat_rate,line_total")
    .eq("invoice_id", invoiceId);

  if (error) throw error;
  return (data || []) as any as InvoiceItem[];
}

/* =========================
   OPTION A — totals computed with MANUAL invoice discount
   - Items are NOT discounted
   - discount_percent applied at invoice level
   - VAT computed AFTER discount per line vat_rate
========================= */
export function computeInvoiceTotalsOptionA(invoice: Invoice, items: InvoiceItem[]) {
  const list = items || [];
  const dp = clampPct((invoice as any).discount_percent ?? 0);

  // base subtotal (before discount)
  const baseSubtotalEx = round2(
    list.reduce((sum, it: any) => sum + n2(it.total_qty) * n2(it.unit_price_excl_vat), 0)
  );

  // discount on excl VAT
  const discountAmount = dp > 0 ? round2((baseSubtotalEx * dp) / 100) : 0;
  const subtotalAfterDiscount = round2(baseSubtotalEx - discountAmount);

  // VAT AFTER discount per line vat_rate
  const vatAmount = round2(
    list.reduce((sum, it: any) => {
      const qty = n2(it.total_qty);
      const unitEx = n2(it.unit_price_excl_vat);
      const vatRate = n2((it as any).vat_rate ?? (invoice as any).vat_percent ?? 15);

      const lineEx = qty * unitEx;
      const lineExAfterDisc = lineEx * (1 - dp / 100);
      const lineVat = vatRate > 0 ? (lineExAfterDisc * vatRate) / 100 : 0;

      return sum + lineVat;
    }, 0)
  );

  const totalAmount = round2(subtotalAfterDiscount + vatAmount);

  const prev = n2((invoice as any).previous_balance);
  const paid = n2((invoice as any).amount_paid);

  const grossTotal = round2(totalAmount + prev);
  const balance = round2(grossTotal - paid); // allow negative

  return {
    baseSubtotalEx,
    discountPercent: dp,
    discountAmount,
    subtotalAfterDiscount,
    vatAmount,
    totalAmount,
    grossTotal,
    balance,
  };
}

/**
 * Applies the currently saved invoice.discount_percent.
 * In Option A: call this ONLY when user clicks "Apply Discount".
 */
export async function recalcAndSaveInvoiceTotals(invoiceId: number, invoice: Invoice, items: InvoiceItem[]) {
  const t = computeInvoiceTotalsOptionA(invoice, items);

  const patch: Partial<Invoice> = {
    // SUBTOTAL shown on print = after discount
    subtotal: t.subtotalAfterDiscount,
    vat_amount: round2(t.vatAmount),
    total_amount: round2(t.totalAmount),

    total_excl_vat: t.subtotalAfterDiscount,
    total_incl_vat: t.totalAmount,

    discount_amount: t.discountAmount,

    gross_total: t.grossTotal,
    balance_remaining: t.balance,
    balance_due: t.balance,
  };

  return updateInvoiceHeader(invoiceId, patch);
}

/**
 * Apply Discount helper (use in UI button):
 * - saves discount_percent
 * - recalculates totals accordingly
 */
export async function applyInvoiceDiscount(params: {
  invoiceId: number;
  discount_percent: number;
  items: InvoiceItem[];
}) {
  const { invoiceId, discount_percent, items } = params;

  const inv = await getInvoice(invoiceId);
  const updated = await updateInvoiceHeader(invoiceId, {
    discount_percent: clampPct(discount_percent),
  } as any);

  return recalcAndSaveInvoiceTotals(invoiceId, updated as any, items.length ? items : []);
}

/**
 * Base totals NO discount:
 * Use this after add/remove items so totals stay consistent,
 * then user can click "Apply Discount" again.
 */
export async function recalcAndSaveBaseTotalsNoDiscount(invoiceId: number, invoice: Invoice, items: InvoiceItem[]) {
  const list = items || [];

  const subtotalEx = round2(
    list.reduce((sum, it: any) => sum + n2(it.total_qty) * n2(it.unit_price_excl_vat), 0)
  );

  const vatAmount = round2(
    list.reduce((sum, it: any) => sum + n2(it.total_qty) * n2(it.unit_vat), 0)
  );

  const totalAmount = round2(subtotalEx + vatAmount);

  const prev = n2((invoice as any).previous_balance);
  const paid = n2((invoice as any).amount_paid);

  const grossTotal = round2(totalAmount + prev);
  const balance = round2(grossTotal - paid);

  const patch: Partial<Invoice> = {
    subtotal: subtotalEx,
    vat_amount: vatAmount,
    total_amount: totalAmount,

    total_excl_vat: subtotalEx,
    total_incl_vat: totalAmount,

    // keep discount fields as-is (manual flow)
    gross_total: grossTotal,
    balance_remaining: balance,
    balance_due: balance,
  };

  return updateInvoiceHeader(invoiceId, patch);
}

/* =========================
   Payments / status (used by Invoices.tsx)
========================= */

export async function setInvoicePayment(invoiceId: number, amount_paid: number) {
  const inv = await getInvoice(invoiceId);

  const paid = n2(amount_paid);
  const gross = n2((inv as any).gross_total ?? (inv as any).total_amount);

  // status logic
  let status: any = inv.status;
  if (paid <= 0) status = "ISSUED";
  else if (paid >= gross) status = "PAID";
  else status = "PARTIALLY_PAID";

  const updated = await updateInvoiceHeader(invoiceId, {
    amount_paid: paid,
    status,
  } as any);

  // update balance fields based on stored gross_total
  const bal = round2(gross - paid);
  const final = await updateInvoiceHeader(invoiceId, {
    balance_remaining: bal,
    balance_due: bal,
  } as any);

  // include customer join for WhatsApp usage
  const { data: joined } = await supabase
    .from("invoices")
    .select("*, customers:customer_id ( id,name,phone,whatsapp )")
    .eq("id", invoiceId)
    .single();

  return (joined || final) as any;
}

// ✅ Backward-compatible: accepts markInvoicePaid(123) OR markInvoicePaid({ invoiceId: 123 })
export async function markInvoicePaid(arg: any) {
  const invoiceId = typeof arg === "object" ? Number(arg?.invoiceId) : Number(arg);
  if (!Number.isFinite(invoiceId)) throw new Error("Invalid invoice id");

  const inv = await getInvoice(invoiceId);
  const gross = n2((inv as any).gross_total ?? (inv as any).total_amount);

  return updateInvoiceHeader(invoiceId, {
    amount_paid: gross,
    status: "PAID",
    balance_remaining: 0,
    balance_due: 0,
  } as any);
}

// ✅ Backward-compatible: voidInvoice(123) OR voidInvoice({ invoiceId: 123 })
export async function voidInvoice(arg: any) {
  const invoiceId = typeof arg === "object" ? Number(arg?.invoiceId) : Number(arg);
  if (!Number.isFinite(invoiceId)) throw new Error("Invalid invoice id");

  return updateInvoiceHeader(invoiceId, { status: "VOID" } as any);
}

/* =========================
   PDF helper (simple)
   InvoiceCreate imports getInvoicePdf
========================= */
export async function getInvoicePdf(invoiceId: number | string) {
  // You can later replace with real generated PDF URL.
  const id = Number(invoiceId);
  if (!Number.isFinite(id)) throw new Error("Invalid invoice id");
  return `/invoices/${id}/print`;
}


