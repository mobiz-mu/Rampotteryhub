// src/lib/quotations.ts
import { supabase } from "@/integrations/supabase/client";
import type { QuotationRow, QuotationItemRow, QuotationStatus } from "@/types/quotation";

const n = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const clampPct = (v: any) => Math.max(0, Math.min(100, n(v)));
const up = (s: any) => String(s || "").trim().toUpperCase();

/* =========================================================
   List / Get
========================================================= */
export async function listQuotations(args: {
  q?: string;
  status?: QuotationStatus | "ALL";
  limit?: number;
}) {
  const qText = (args.q || "").trim();
  const st = args.status || "ALL";
  const limit = args.limit || 500;

  let query = supabase
    .from("quotations")
    .select("*")
    .order("id", { ascending: false })
    .limit(limit);

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

export async function getQuotation(id: number) {
  const { data, error } = await supabase.from("quotations").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Quotation not found");
  return data as QuotationRow;
}

export async function getQuotationItems(quotationId: number) {
  // JOIN products for view/print
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
  const { data, error } = await supabase
    .from("quotations")
    .update({ status })
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Failed to update");
  return data as QuotationRow;
}

/* =========================================================
   Create (Invoice-style: BOX/PCS + VAT columns)
========================================================= */
export type QuotationCreateItem = {
  product_id?: number | null;
  description?: string | null;

  uom?: string; // BOX / PCS
  box_qty?: number; // input qty (BOX qty or PCS qty)
  units_per_box?: number; // UPB (1 for PCS)
  total_qty?: number; // computed

  unit_price_excl_vat?: number;
  unit_vat?: number; // per unit
  unit_price_incl_vat?: number;

  line_total?: number; // total_qty * unit_price_incl_vat
};

function normalizeItem(it: QuotationCreateItem) {
  const uom = up(it.uom) === "PCS" ? "PCS" : "BOX";

  const box_qty = Math.max(0, Math.trunc(n(it.box_qty)));
  const units_per_box = uom === "PCS" ? 1 : Math.max(1, Math.trunc(n(it.units_per_box) || 1));

  const total_qty =
    Number.isFinite(Number(it.total_qty)) && n(it.total_qty) > 0
      ? Math.trunc(n(it.total_qty))
      : uom === "PCS"
      ? box_qty
      : box_qty * units_per_box;

  const unit_price_excl_vat = Math.max(0, n(it.unit_price_excl_vat));
  const unit_vat = Math.max(0, n(it.unit_vat));
  const unit_price_incl_vat = Math.max(0, n(it.unit_price_incl_vat));

  const line_total =
    Number.isFinite(Number(it.line_total)) && n(it.line_total) > 0
      ? n(it.line_total)
      : total_qty * unit_price_incl_vat;

  return {
    product_id: it.product_id ?? null,
    description: it.description ?? "",

    uom,
    box_qty,
    units_per_box,
    total_qty,

    unit_price_excl_vat,
    unit_vat,
    unit_price_incl_vat,

    line_total,
  };
}

function computeTotalsInvoiceStyle(args: {
  items: ReturnType<typeof normalizeItem>[];
  discount_percent: number;
  discount_amount: number; // optional manual override
  vat_percent: number; // informational (items already have unit_vat)
}) {
  const subtotal = args.items.reduce((s, it) => s + n(it.total_qty) * n(it.unit_price_excl_vat), 0);
  const vat_amount = args.items.reduce((s, it) => s + n(it.total_qty) * n(it.unit_vat), 0);
  const total_before_discount = subtotal + vat_amount;

  const disc =
    n(args.discount_amount) > 0 ? n(args.discount_amount) : (total_before_discount * n(args.discount_percent)) / 100;

  const total_amount = Math.max(0, total_before_discount - disc);

  return {
    subtotal,
    discount_percent: n(args.discount_percent),
    discount_amount: disc,
    vat_percent: n(args.vat_percent),
    vat_amount,
    total_amount,
  };
}

export async function createQuotationFull(payload: {
  quotation_date: string; // YYYY-MM-DD
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

  // 1) Create quotation header
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
    .select("id, quotation_number, customer_name, customer_code, quotation_date, status, subtotal, vat_amount, total_amount, vat_percent, discount_percent, discount_amount")
    .single();

  if (qErr) throw new Error(qErr.message);
  if (!qRow?.id) throw new Error("Failed to create quotation (no id returned)");

  const quotationId = Number(qRow.id);

  // 2) Insert items
  const rowsToInsert = cleanItems.map((it) => ({
    quotation_id: quotationId,
    product_id: it.product_id,
    description: it.description,

    uom: it.uom,
    box_qty: it.box_qty,
    units_per_box: it.units_per_box,
    total_qty: it.total_qty,

    unit_price_excl_vat: it.unit_price_excl_vat,
    unit_vat: it.unit_vat,
    unit_price_incl_vat: it.unit_price_incl_vat,

    line_total: it.line_total,
  }));

  const { error: itErr } = await supabase.from("quotation_items").insert(rowsToInsert);
  if (itErr) throw new Error(itErr.message);

  return qRow as QuotationRow;
}
