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
function roundTo(v: any, dp = 3) {
  const x = n2(v);
  const m = Math.pow(10, dp);
  return Math.round((x + Number.EPSILON) * m) / m;
}
function nonNeg(v: any) {
  const x = n2(v);
  return x < 0 ? 0 : x;
}
function normUom(u: any) {
  const x = String(u || "BOX").toUpperCase();
  if (x === "BOX" || x === "PCS" || x === "KG" || x === "G" || x === "BAG") return x;
  return "BOX";
}
function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || "").trim());
}

/** Public print API base (same domain). */
function apiBase() {
  // Vite
  return (import.meta as any)?.env?.VITE_API_URL?.trim?.() || "";
}

/** Fetch public print bundle from your Express server */
async function fetchPublicInvoicePrint(invoiceId: number, token: string) {
  const t = String(token || "").trim();
  if (!isUuid(t)) throw new Error("Invoice not found / access denied.");

  const base = apiBase();
  const url = `${base}/api/public/invoice-print?id=${encodeURIComponent(String(invoiceId))}&t=${encodeURIComponent(t)}`;

  const res = await fetch(url, { method: "GET" });
  const json = await res.json().catch(() => null);

  if (!res.ok || !json?.ok) throw new Error(json?.error || "Invoice not found / access denied.");

  return json as {
    ok: true;
    server_time: string;
    invoice: any;
    customer: any | null;
    items: any[];
  };
}

type StockMovementType = "IN" | "OUT" | "ADJUSTMENT";

function safeDateISO(d?: string | null) {
  if (!d) return new Date().toISOString();
  const x = new Date(d);
  return Number.isNaN(x.getTime()) ? new Date().toISOString() : x.toISOString();
}

async function hasMovementsForInvoice(invoiceId: number) {
  const { data, error } = await supabase
    .from("stock_movements")
    .select("id")
    .eq("source_table", "invoices")
    .eq("source_id", invoiceId)
    .limit(1);

  if (error) throw error;
  return (data || []).length > 0;
}

async function insertInvoiceMovements(invoice: any) {
  // Load items + product stock_unit to convert correctly
  const { data: items, error: itErr } = await supabase
    .from("invoice_items")
    .select(
      `
      id, invoice_id, product_id, uom, box_qty, pcs_qty, units_per_box, total_qty,
      products:product_id ( id, stock_unit, selling_price_unit )
    `
    )
    .eq("invoice_id", invoice.id);

  if (itErr) throw itErr;

  const movement_date = safeDateISO(invoice.invoice_date || invoice.created_at);

  const rows = (items || [])
    .filter((it: any) => Number(it.product_id) > 0)
    .map((it: any) => {
      const uom = String(it.uom || "").toUpperCase();
      const boxQty = n2(it.box_qty);
      const pcsQty = n2(it.pcs_qty);
      const upb = n2(it.units_per_box || 1);

      const productStockUnit = String(it.products?.stock_unit || "PCS").toUpperCase(); // PCS / WEIGHT
      const priceUnit = String(it.products?.selling_price_unit || "PCS").toUpperCase(); // PCS / KG / BAG (optional)

      // ✅ Compute base quantity to match your products storage:
      // - PCS items -> products.current_stock (count)
      // - WEIGHT items -> products.current_stock_grams (grams)
      let qtyBase = 0;

      if (productStockUnit === "WEIGHT") {
        // store grams in stock_movements.quantity (your DB trigger should apply to current_stock_grams)
        if (uom === "KG") qtyBase = boxQty * 1000;
        else if (uom === "G") qtyBase = boxQty; // assume box_qty holds grams
        else {
          // fallback: if total_qty looks like KG, convert to grams
          const tq = n2(it.total_qty);
          qtyBase = tq > 0 ? tq * 1000 : 0;
        }
      } else {
        // PCS (includes BAG items stored as count in current_stock)
        if (uom === "PCS") qtyBase = pcsQty;
        else if (uom === "BOX") qtyBase = boxQty * Math.max(1, upb) + pcsQty;
        else if (uom === "BAG" || priceUnit === "BAG") {
          // bag items saved as count in current_stock
          // box_qty typically holds bag count
          qtyBase = boxQty || n2(it.total_qty);
        } else {
          // fallback
          qtyBase = n2(it.total_qty);
        }
      }

      qtyBase = Math.max(0, qtyBase);

      return {
        product_id: Number(it.product_id),
        movement_type: "OUT" as StockMovementType,
        quantity: qtyBase,
        movement_date,
        reference: String(invoice.invoice_number || `INV#${invoice.id}`),
        source_table: "invoices",
        source_id: invoice.id,
        notes: `Auto from invoice ${invoice.invoice_number || invoice.id}`,
      };
    })
    .filter((r: any) => r.quantity > 0);

  if (!rows.length) return;

  const { error } = await supabase.from("stock_movements").insert(rows);
  if (error) throw error;
}

/* =========================
   Payments helpers (AUTO)
========================= */
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

async function sumPayments(invoiceId: number) {
  const { data, error } = await supabase.from("invoice_payments").select("amount").eq("invoice_id", invoiceId);
  if (error) throw error;
  return round2((data || []).reduce((s: number, r: any) => s + n2(r.amount), 0));
}

async function insertPaymentRow(p: {
  invoice_id: number;
  amount: number;
  method?: string;
  reference?: string | null;
  notes?: string | null;
  is_auto?: boolean;
  payment_date?: string;
}) {
  const amt = round2(n2(p.amount));
  if (amt <= 0) return;

  const { error } = await supabase.from("invoice_payments").insert({
    invoice_id: p.invoice_id,
    payment_date: p.payment_date ?? todayISO(),
    amount: amt,
    method: p.method ?? "Cash",
    reference: p.reference ?? null,
    notes: p.notes ?? null,
    is_auto: !!p.is_auto,
  });

  if (error) throw error;
}

/**
 * Ensures invoice_payments reflects the invoice's paid state.
 * - If PAID: add missing payment for remaining balance
 * - If PARTIALLY_PAID: add delta to reach invoice.amount_paid
 */
async function ensurePaymentsMatchInvoice(inv: Invoice, mode: "PAID" | "PARTIAL") {
  const invoiceId = Number(inv.id);

  const gross = round2(n2((inv as any).gross_total ?? (inv as any).total_amount));
  const credits = round2(n2((inv as any).credits_applied ?? 0));

  // What should be paid after credits
  const dueAfterCredits = round2(Math.max(0, gross - credits));

  const paidFromPayments = await sumPayments(invoiceId);

  const targetPaid =
    mode === "PAID" ? dueAfterCredits : round2(n2((inv as any).amount_paid ?? 0)); // partial: follow amount_paid

  const delta = round2(targetPaid - paidFromPayments);

  if (delta > 0.00001) {
    await insertPaymentRow({
      invoice_id: invoiceId,
      amount: delta,
      method: mode === "PAID" ? "Auto Adjustment" : "Auto Partial",
      reference: mode === "PAID" ? "AUTO-PAID" : "AUTO-PARTIAL",
      notes:
        mode === "PAID"
          ? "Auto payment inserted when invoice set to PAID"
          : "Auto payment inserted when invoice set to PARTIALLY_PAID",
      is_auto: true,
    });
  }
}

/* =========================
   LIST INVOICES (private / authenticated)
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
      amount_paid,credits_applied,previous_balance,balance_remaining,notes,created_at,updated_at,vat_percent,
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
export async function getInvoice(id: number, opts?: { publicToken?: string }) {
  if (opts?.publicToken) {
    const bundle = await fetchPublicInvoicePrint(id, opts.publicToken);
    return bundle.invoice as Invoice;
  }

  const { data, error } = await supabase.from("invoices").select("*").eq("id", id).single();
  if (error) throw error;
  return data as Invoice;
}

/* =========================
   Print bundle (optional)
========================= */
export async function getInvoicePrintBundle(id: number, opts?: { publicToken?: string }) {
  if (opts?.publicToken) return fetchPublicInvoicePrint(id, opts.publicToken);

  const { data: inv, error: invErr } = await supabase.from("invoices").select("*").eq("id", id).single();
  if (invErr) throw invErr;

  const { data: items, error: itErr } = await supabase
    .from("invoice_items")
    .select(
      `
      id,invoice_id,product_id,box_qty,pcs_qty,uom,units_per_box,total_qty,
      unit_price_excl_vat,unit_vat,unit_price_incl_vat,line_total,
      description,vat_rate,
      products:product_id ( id,sku,item_code,name,units_per_box,selling_price )
    `
    )
    .eq("invoice_id", id)
    .order("id", { ascending: true });

  if (itErr) throw itErr;

  const { data: customer, error: cErr } = await supabase
    .from("customers")
    .select("id,name,address,phone,whatsapp,brn,vat_no,customer_code")
    .eq("id", (inv as any).customer_id)
    .maybeSingle();

  if (cErr) throw cErr;

  return {
    ok: true,
    server_time: new Date().toISOString(),
    invoice: inv,
    customer: customer || null,
    items: (items || []).map((r: any) => ({ ...r, product: r.products ?? null })),
  };
}

/* =========================
   GET invoice + items (for duplicate) - private only
========================= */
export async function getInvoiceById(id: string | number) {
  const invoiceId = Number(id);
  if (!Number.isFinite(invoiceId)) throw new Error("Invalid invoice id");

  const inv = await getInvoice(invoiceId);

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
    item_code: r?.products?.item_code || r?.products?.sku || "",
  }));

  return { ...inv, items: mappedItems };
}

/* =========================
   UPDATE invoice header
========================= */
export async function updateInvoiceHeader(id: number, patch: Partial<Invoice>) {
  const { data, error } = await supabase
    .from("invoices")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*"); // ✅ do NOT use .single()

  if (error) throw error;

  const row = (data || [])[0];
  if (!row) throw new Error("Invoice update blocked (RLS policy or trigger). No row returned from UPDATE.");

  return row as Invoice;
}

/* =========================
   CREATE DRAFT INVOICE (base)
   invoice_number is generated in DB ✅
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

  const { data, error } = await supabase.from("invoices").insert(insertRow).select("*").maybeSingle();
  if (error) throw error;

  if (!data) throw new Error("Invoice creation blocked (RLS policy or trigger). No row returned from INSERT.");
  return data as Invoice;
}

/* =========================
   Backward-compatible createInvoice
   Supports UOM: BOX / PCS / KG / G / BAG
   Decimals allowed everywhere ✅
========================= */
export async function createInvoice(payload: any) {
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

  const insertRows = items.map((it) => {
    const uom = normUom(it.uom);

    // qty fields (decimals allowed)
    const boxQty = roundTo(nonNeg(it.box_qty ?? 0), 3);
    const pcsQty = roundTo(nonNeg(it.pcs_qty ?? 0), 3);

    let upb = n2(it.units_per_box ?? 1);
    if (!Number.isFinite(upb) || upb <= 0) upb = 1;

    // enforce BAG and G conversions at insert level too (DB trigger will also normalize)
    if (uom === "BAG" && (!it.units_per_box || n2(it.units_per_box) <= 0)) upb = 25;
    if (uom === "G") upb = 0.001;
    if (uom === "PCS" || uom === "KG") upb = 1;

    return {
      invoice_id: inv.id,
      product_id: it.product_id,
      uom,

      box_qty: uom === "PCS" ? 0 : boxQty,
      pcs_qty: uom === "PCS" ? pcsQty : 0,

      units_per_box: upb,
      total_qty: n2(it.total_qty ?? 0), // trigger will correct if needed

      unit_price_excl_vat: n2(it.unit_price_excl_vat ?? 0),
      vat_rate: n2(it.vat_rate ?? (inv as any).vat_percent ?? 15),
      unit_vat: n2(it.unit_vat ?? 0),
      unit_price_incl_vat: n2(it.unit_price_incl_vat ?? 0),
      line_total: n2(it.line_total ?? 0),

      description: it.description ?? null,
    };
  });

  const { error: itemsErr } = await supabase.from("invoice_items").insert(insertRows);
  if (itemsErr) throw itemsErr;

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
========================= */
export function computeInvoiceTotalsOptionA(invoice: Invoice, items: InvoiceItem[]) {
  const list = items || [];
  const dp = clampPct((invoice as any).discount_percent ?? 0);

  const baseSubtotalEx = round2(list.reduce((sum, it: any) => sum + n2(it.total_qty) * n2(it.unit_price_excl_vat), 0));
  const discountAmount = dp > 0 ? round2((baseSubtotalEx * dp) / 100) : 0;
  const subtotalAfterDiscount = round2(baseSubtotalEx - discountAmount);

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
  const credits = n2((invoice as any).credits_applied ?? 0);

  const grossTotal = round2(totalAmount + prev);
  const balance = round2(Math.max(0, grossTotal - paid - credits));

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

export async function recalcAndSaveInvoiceTotals(invoiceId: number, invoice: Invoice, items: InvoiceItem[]) {
  const t = computeInvoiceTotalsOptionA(invoice, items);

  const patch: Partial<Invoice> = {
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

export async function applyInvoiceDiscount(params: { invoiceId: number; discount_percent: number; items: InvoiceItem[] }) {
  const { invoiceId, discount_percent, items } = params;

  const updated = await updateInvoiceHeader(invoiceId, {
    discount_percent: clampPct(discount_percent),
  } as any);

  return recalcAndSaveInvoiceTotals(invoiceId, updated as any, items.length ? items : []);
}

export async function recalcAndSaveBaseTotalsNoDiscount(invoiceId: number, invoice: Invoice, items: InvoiceItem[]) {
  const list = items || [];

  const subtotalEx = round2(list.reduce((sum, it: any) => sum + n2(it.total_qty) * n2(it.unit_price_excl_vat), 0));
  const vatAmount = round2(list.reduce((sum, it: any) => sum + n2(it.total_qty) * n2(it.unit_vat), 0));
  const totalAmount = round2(subtotalEx + vatAmount);

  const prev = n2((invoice as any).previous_balance);
  const paid = n2((invoice as any).amount_paid);
  const credits = n2((invoice as any).credits_applied ?? 0);

  const grossTotal = round2(totalAmount + prev);
  const balance = round2(Math.max(0, grossTotal - paid - credits));

  const patch: Partial<Invoice> = {
    subtotal: subtotalEx,
    vat_amount: vatAmount,
    total_amount: totalAmount,

    total_excl_vat: subtotalEx,
    total_incl_vat: totalAmount,

    gross_total: grossTotal,
    balance_remaining: balance,
    balance_due: balance,
  };

  return updateInvoiceHeader(invoiceId, patch);
}

/* =========================
   Payments / status
========================= */
export async function setInvoicePayment(invoiceId: number, amount_paid: number) {
  const inv = await getInvoice(invoiceId);

  const paid = round2(n2(amount_paid));
  const gross = round2(n2((inv as any).gross_total ?? (inv as any).total_amount));
  const credits = round2(n2((inv as any).credits_applied ?? 0));

  const bal = round2(gross - paid - credits);

  let status: InvoiceStatus = "ISSUED";
  const eps = 0.00001;

  if (bal <= eps) status = "PAID";
  else if (paid > eps || credits > eps) status = "PARTIALLY_PAID";
  else status = "ISSUED";

  // 1) Update invoice header
  const final = await updateInvoiceHeader(invoiceId, {
    amount_paid: paid,
    status,
    balance_remaining: bal,
    balance_due: bal,
  } as any);

  // 2) ✅ Ensure invoice_payments always matches paid status
  if (status === "PAID") {
    await ensurePaymentsMatchInvoice(final, "PAID");
  } else if (status === "PARTIALLY_PAID") {
    await ensurePaymentsMatchInvoice(final, "PARTIAL");
  }

  const { data: joined } = await supabase
    .from("invoices")
    .select("*, customers:customer_id ( id,name,phone,whatsapp )")
    .eq("id", invoiceId)
    .single();

  return (joined || final) as any;
}

export async function postInvoiceAndDeductStock(invoiceId: number) {
  const inv = await getInvoice(invoiceId);

  // ✅ Guard 1: already deducted
  if ((inv as any).stock_deducted_at) {
    return inv as any;
  }

  // ✅ Guard 2: movements already exist (extra safety)
  const has = await hasMovementsForInvoice(invoiceId);
  if (has) {
    // mark as deducted so UI/logic stays consistent
    return updateInvoiceHeader(invoiceId, { stock_deducted_at: new Date().toISOString() } as any);
  }

  // ✅ Must not post empty invoice
  const { data: anyItem, error: chkErr } = await supabase.from("invoice_items").select("id").eq("invoice_id", invoiceId).limit(1);

  if (chkErr) throw chkErr;
  if (!anyItem?.length) throw new Error("Cannot post invoice without items.");

  // 1) Insert stock movements OUT
  await insertInvoiceMovements(inv);

  // 2) Mark invoice as posted + deducted
  // Use your real status name if you have one. Here we use ISSUED.
  return updateInvoiceHeader(invoiceId, {
    status: "ISSUED",
    stock_deducted_at: new Date().toISOString(),
  } as any);
}

export async function listInvoicesByCustomer(customerId: number) {
  if (!Number.isFinite(Number(customerId))) return [];

  const { data, error } = await supabase
    .from("invoices")
    .select("id, invoice_number, invoice_date, gross_total, amount_paid, credits_applied, balance_remaining, status")
    .eq("customer_id", customerId)
    .neq("status", "VOID")
    .order("invoice_date", { ascending: false })
    .order("id", { ascending: false })
    .limit(500);

  if (error) throw error;
  return data || [];
}

export async function markInvoicePaid(arg: any) {
  const invoiceId = typeof arg === "object" ? Number(arg?.invoiceId) : Number(arg);
  if (!Number.isFinite(invoiceId)) throw new Error("Invalid invoice id");

  const inv = await getInvoice(invoiceId);

  const gross = n2((inv as any).gross_total ?? (inv as any).total_amount);
  const credits = n2((inv as any).credits_applied ?? 0);

  // Pay only what is actually still due after credits
  const payNeeded = round2(Math.max(0, gross - credits));

  // 1) Update invoice header
  const updated = await updateInvoiceHeader(invoiceId, {
    amount_paid: payNeeded,
    status: "PAID",
    balance_remaining: 0,
    balance_due: 0,
  } as any);

  // 2) ✅ Enforce payment row exists (auto insert missing delta)
  await ensurePaymentsMatchInvoice(updated, "PAID");

  return updated as Invoice;
}

export async function voidInvoice(arg: any) {
  const invoiceId = typeof arg === "object" ? Number(arg?.invoiceId) : Number(arg);
  if (!Number.isFinite(invoiceId)) throw new Error("Invalid invoice id");

  return updateInvoiceHeader(invoiceId, { status: "VOID" } as any);
}

/* =========================
   PDF helper (simple)
========================= */
export async function getInvoicePdf(invoiceId: number | string) {
  const id = Number(invoiceId);
  if (!Number.isFinite(id)) throw new Error("Invalid invoice id");
  return `/invoices/${id}/print`;
}
