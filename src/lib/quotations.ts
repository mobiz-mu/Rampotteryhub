// src/lib/quotations.ts
import { supabase } from "@/integrations/supabase/client";
import type { QuotationRow, QuotationItemRow, QuotationStatus } from "@/types/quotation";

/* =========================================================
   Helpers
========================================================= */
const n = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const clampPct = (v: any) => Math.max(0, Math.min(100, n(v)));
const up = (s: any) => String(s || "").trim().toUpperCase();

function roundTo(v: any, dp: number) {
  const x = n(v);
  const m = Math.pow(10, dp);
  return Math.round(x * m) / m;
}

function normUom(u: any): "BOX" | "PCS" | "KG" | "G" | "BAG" {
  const x = up(u);
  if (x === "PCS") return "PCS";
  if (x === "KG") return "KG";
  if (x === "G" || x === "GRAM" || x === "GRAMS") return "G";
  if (x === "BAG" || x === "BAGS") return "BAG";
  return "BOX";
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || "").trim());
}

function apiBase() {
  return (import.meta as any)?.env?.VITE_API_URL?.trim?.() || "";
}

async function safeJson(res: Response) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function fetchPublicQuotationPrint(quotationId: number, token: string) {
  const t = String(token || "").trim();
  if (!isUuid(t)) throw new Error("Quotation not found / invalid link");

  const base = apiBase();
  const url = `${base}/api/public/quotation-print?id=${encodeURIComponent(String(quotationId))}&t=${encodeURIComponent(
    t
  )}`;

  const res = await fetch(url, { method: "GET" });
  const json = await safeJson(res);

  if (!res.ok || !json?.ok) throw new Error(json?.error || "Quotation not found / invalid link");

  return json as {
    ok: true;
    server_time: string;
    quotation: any;
    customer: any | null;
    items: any[];
  };
}

/* =========================================================
   List / Get
========================================================= */
export async function listQuotations(args: { q?: string; status?: QuotationStatus | "ALL"; limit?: number }) {
  const qText = (args.q || "").trim();
  const st = args.status || "ALL";
  const limit = args.limit || 500;

  let query = supabase.from("quotations").select("*").order("id", { ascending: false }).limit(limit);

  if (st !== "ALL") query = query.eq("status", st);

  if (qText) {
    query = query.or(
      [
        `quotation_number.ilike.%${qText}%`,
        `customer_name.ilike.%${qText}%`,
        `customer_code.ilike.%${qText}%`,
        `id.eq.${Number.isFinite(Number(qText)) ? Number(qText) : -1}`,
      ].join(",")
    );
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data || []) as QuotationRow[];
}

export async function getQuotation(id: number, opts?: { publicToken?: string }) {
  if (opts?.publicToken) {
    const bundle = await fetchPublicQuotationPrint(id, opts.publicToken);
    return bundle.quotation as QuotationRow;
  }

  const { data, error } = await supabase.from("quotations").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Quotation not found");
  return data as QuotationRow;
}

export async function getQuotationPrintBundle(id: number, opts?: { publicToken?: string }) {
  if (opts?.publicToken) {
    return fetchPublicQuotationPrint(id, opts.publicToken);
  }

  const { data: quotation, error: qErr } = await supabase.from("quotations").select("*").eq("id", id).maybeSingle();
  if (qErr) throw new Error(qErr.message);
  if (!quotation) throw new Error("Quotation not found");

  const { data: itemsRaw, error: itErr } = await supabase
    .from("quotation_items")
    .select(
      `
      id,quotation_id,product_id,description,uom,
      box_qty,pcs_qty,grams_qty,bags_qty,units_per_box,total_qty,
      base_unit_price_excl_vat,vat_rate,price_overridden,
      unit_price_excl_vat,unit_vat,unit_price_incl_vat,line_total,created_at,
      products:product_id ( id,item_code,sku,name,units_per_box,selling_price )
    `
    )
    .eq("quotation_id", id)
    .order("id", { ascending: true });

  if (itErr) throw new Error(itErr.message);

  const items = (itemsRaw || []).map((it: any) => ({
    ...it,
    product: it.products ?? null,
  }));

  let customer: any = null;
  if ((quotation as any).customer_id) {
    const { data: c, error: cErr } = await supabase
      .from("customers")
      .select("id,name,address,phone,whatsapp,brn,vat_no,customer_code")
      .eq("id", (quotation as any).customer_id)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    customer = c || null;
  }

  return {
    ok: true,
    server_time: new Date().toISOString(),
    quotation,
    customer,
    items,
  };
}

export async function getQuotationItems(quotationId: number) {
  const { data, error } = await supabase
    .from("quotation_items")
    .select(
      `
      *,
      product:products(
        id,
        item_code,
        sku,
        name,
        description,
        units_per_box,
        selling_price
      )
    `
    )
    .eq("quotation_id", quotationId)
    .order("id", { ascending: true });

  if (error) throw new Error(error.message);
  return (data || []) as any as QuotationItemRow[];
}

export async function setQuotationStatus(id: number, status: QuotationStatus) {
  const { data, error } = await supabase.from("quotations").update({ status }).eq("id", id).select("*").maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Failed to update");
  return data as QuotationRow;
}

/* =========================================================
   Totals (Invoice-style)
========================================================= */
function computeTotalsInvoiceStyle(args: {
  items: Array<{ total_qty: any; unit_price_excl_vat: any; unit_vat: any }>;
  discount_percent: number;
  discount_amount: number;
  vat_percent: number;
}) {
  const subtotal = args.items.reduce((s, it) => s + n(it.total_qty) * n(it.unit_price_excl_vat), 0);
  const vat_amount = args.items.reduce((s, it) => s + n(it.total_qty) * n(it.unit_vat), 0);
  const total_before_discount = subtotal + vat_amount;

  const dp = clampPct(args.discount_percent);
  const disc = n(args.discount_amount) > 0 ? n(args.discount_amount) : (total_before_discount * dp) / 100;

  const total_amount = Math.max(0, total_before_discount - disc);

  return {
    subtotal,
    discount_percent: dp,
    discount_amount: disc,
    vat_percent: n(args.vat_percent),
    vat_amount,
    total_amount,
  };
}

async function listQuotationItemsForTotals(quotationId: number) {
  const { data, error } = await supabase
    .from("quotation_items")
    .select("id,quotation_id,total_qty,unit_price_excl_vat,unit_vat,line_total")
    .eq("quotation_id", quotationId);

  if (error) throw new Error(error.message);
  return (data || []) as any[];
}

export async function recalcAndSaveQuotationTotals(quotationId: number) {
  const q = await getQuotation(quotationId);
  const items = await listQuotationItemsForTotals(quotationId);

  const totals = computeTotalsInvoiceStyle({
    items,
    discount_percent: n((q as any).discount_percent),
    discount_amount: n((q as any).discount_amount),
    vat_percent: n((q as any).vat_percent ?? 15),
  });

  const { data, error } = await supabase
    .from("quotations")
    .update({
      subtotal: totals.subtotal,
      discount_percent: totals.discount_percent,
      discount_amount: totals.discount_amount,
      vat_percent: totals.vat_percent,
      vat_amount: totals.vat_amount,
      total_amount: totals.total_amount,
    })
    .eq("id", quotationId)
    .select("*")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Quotation update blocked (RLS or trigger). No row returned from UPDATE.");
  return data as QuotationRow;
}

export async function applyQuotationDiscount(params: { quotationId: number; discount_percent: number }) {
  const { quotationId, discount_percent } = params;

  const { data: qRow, error } = await supabase
    .from("quotations")
    .update({
      discount_percent: clampPct(discount_percent),
      discount_amount: 0,
    })
    .eq("id", quotationId)
    .select("*")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!qRow) throw new Error("Failed to update quotation");

  return recalcAndSaveQuotationTotals(quotationId);
}

/* =========================================================
   Create (Multi-UOM)
========================================================= */
export type QuotationCreateItem = {
  product_id?: number | null;
  description?: string | null;

  uom?: string; // BOX / PCS / KG / G / BAG

  // qty inputs:
  box_qty?: number;   // BOX qty OR KG qty when uom=KG
  pcs_qty?: number;
  grams_qty?: number;
  bags_qty?: number;

  units_per_box?: number; // BOX only
  total_qty?: number;     // if missing -> computed

  // pricing
  unit_price_excl_vat?: number;
  unit_vat?: number;
  unit_price_incl_vat?: number;
  line_total?: number;

  // optional metadata (your UI uses these)
  base_unit_price_excl_vat?: number;
  vat_rate?: number;
  price_overridden?: boolean;
};

function normalizeItem(it: QuotationCreateItem) {
  const uom = normUom(it.uom);

  // units per box only matters for BOX
  const units_per_box = uom === "BOX" ? Math.max(1, Math.trunc(n(it.units_per_box) || 1)) : 1;

  // qty columns (stored)
  let box_qty = 0;
  let pcs_qty = 0;
  let grams_qty = 0;
  let bags_qty = 0;

  if (uom === "BOX") box_qty = Math.max(0, Math.trunc(n(it.box_qty)));
  if (uom === "PCS") pcs_qty = Math.max(0, Math.trunc(n(it.pcs_qty)));
  if (uom === "KG") box_qty = Math.max(0, roundTo(it.box_qty, 3)); // KG stored in box_qty
  if (uom === "G") grams_qty = Math.max(0, Math.trunc(n(it.grams_qty)));
  if (uom === "BAG") bags_qty = Math.max(0, Math.trunc(n(it.bags_qty)));

  const computed_total_qty =
    uom === "BOX"
      ? box_qty * units_per_box
      : uom === "PCS"
      ? pcs_qty
      : uom === "KG"
      ? box_qty
      : uom === "G"
      ? grams_qty
      : bags_qty;

  const total_qty =
    Number.isFinite(Number(it.total_qty)) && n(it.total_qty) > 0 ? n(it.total_qty) : computed_total_qty;

  const unit_price_excl_vat = Math.max(0, n(it.unit_price_excl_vat));
  const unit_vat = Math.max(0, n(it.unit_vat));
  const unit_price_incl_vat = Math.max(0, n(it.unit_price_incl_vat));

  const line_total =
    Number.isFinite(Number(it.line_total)) && n(it.line_total) > 0 ? n(it.line_total) : n(total_qty) * unit_price_incl_vat;

  return {
    product_id: it.product_id ?? null,
    description: it.description ?? "",

    uom,
    box_qty,
    pcs_qty,
    grams_qty,
    bags_qty,
    units_per_box,
    total_qty,

    unit_price_excl_vat,
    unit_vat,
    unit_price_incl_vat,
    line_total,

    // optional meta
    base_unit_price_excl_vat: Math.max(0, n(it.base_unit_price_excl_vat)),
    vat_rate: Number.isFinite(Number(it.vat_rate)) ? clampPct(it.vat_rate) : null,
    price_overridden: !!it.price_overridden,
  };
}

export async function createQuotationFull(payload: {
  quotation_date: string;
  valid_until?: string | null;

  customer_id?: number | null;
  customer_name?: string | null;
  customer_code?: string | null;

  sales_rep?: string | null;
  sales_rep_phone?: string | null;

  notes?: string | null;

  discount_percent?: number;
  discount_amount?: number;
  vat_percent?: number;

  items: QuotationCreateItem[];
}) {
  const cleanItems = (payload.items || []).map(normalizeItem);

  const totals = computeTotalsInvoiceStyle({
    items: cleanItems,
    discount_percent: n(payload.discount_percent),
    discount_amount: n(payload.discount_amount),
    vat_percent: Number.isFinite(Number(payload.vat_percent)) ? n(payload.vat_percent) : 15,
  });

  const { data: qRow, error: qErr } = await supabase
    .from("quotations")
    .insert({
      quotation_date: payload.quotation_date,
      valid_until: payload.valid_until ?? null,
      status: "DRAFT",

      customer_id: payload.customer_id ?? null,
      customer_name: payload.customer_name ?? null,
      customer_code: payload.customer_code ?? null,

      sales_rep: payload.sales_rep ?? null,
      sales_rep_phone: payload.sales_rep_phone ?? null,

      notes: payload.notes ?? null,

      ...totals,
    })
    .select(
      "id, quotation_number, customer_name, customer_code, quotation_date, status, subtotal, vat_amount, total_amount, vat_percent, discount_percent, discount_amount"
    )
    .single();

  if (qErr) throw new Error(qErr.message);
  if (!qRow?.id) throw new Error("Failed to create quotation (no id returned)");

  const quotationId = Number(qRow.id);

  const rowsToInsert = cleanItems.map((it) => ({
    quotation_id: quotationId,
    product_id: it.product_id,
    description: it.description,

    uom: it.uom,
    box_qty: it.box_qty,
    pcs_qty: it.pcs_qty,
    grams_qty: it.grams_qty,
    bags_qty: it.bags_qty,
    units_per_box: it.units_per_box,
    total_qty: it.total_qty,

    base_unit_price_excl_vat: it.base_unit_price_excl_vat,
    vat_rate: it.vat_rate,
    price_overridden: it.price_overridden,

    unit_price_excl_vat: it.unit_price_excl_vat,
    unit_vat: it.unit_vat,
    unit_price_incl_vat: it.unit_price_incl_vat,
    line_total: it.line_total,
  }));

  const { error: itErr } = await supabase.from("quotation_items").insert(rowsToInsert);
  if (itErr) throw new Error(itErr.message);

  return qRow as QuotationRow;
}
