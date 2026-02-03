// src/lib/quotationConvert.ts
import { supabase } from "@/integrations/supabase/client";
import { getQuotation, getQuotationItems, setQuotationStatus } from "@/lib/quotations";
import { createInvoice } from "@/lib/invoices";

const n2 = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const clampPct = (v: any) => Math.max(0, Math.min(100, n2(v)));
const up = (s: any) => String(s || "").trim().toUpperCase();

/**
 * Convert a quotation -> invoice (1 click)
 * - Uses quotation_items invoice-style columns (BOX/PCS + UPB + total_qty + unit ex/vat/inc + line_total)
 * - Creates invoice using your existing invoice engine
 * - Marks quotation as CONVERTED
 *
 * NOTE:
 * If your quotations table doesn't have converted_invoice_id / converted_at columns,
 * we gracefully fall back to only updating status.
 */
export async function convertQuotationToInvoice(quotationId: number) {
  const qid = Number(quotationId);
  if (!Number.isFinite(qid) || qid <= 0) throw new Error("Invalid quotation id");

  const q = await getQuotation(qid);
  const items = await getQuotationItems(qid);

  if (!q?.id) throw new Error("Quotation not found");
  if (!items?.length) throw new Error("Quotation has no items");

  const vatPercent = clampPct((q as any).vat_percent ?? 15);
  const discountPercent = clampPct((q as any).discount_percent ?? 0);

  // ✅ Map quotation_items -> invoice items (same column logic as invoice UI/print)
  const mappedItems = (items as any[]).map((it) => {
    const uom = up(it.uom) === "PCS" ? "PCS" : "BOX";

    // In quotation UI, "box_qty" is the input qty (boxes OR pcs). Keep the same meaning.
    const qtyInput = Math.max(0, Math.trunc(n2(it.box_qty ?? 0)));
    const upb = uom === "PCS" ? 1 : Math.max(1, Math.trunc(n2(it.units_per_box ?? 1) || 1));
    const totalQty = uom === "PCS" ? qtyInput : qtyInput * upb;

    const unitEx = Math.max(0, n2(it.unit_price_excl_vat ?? 0));
    const unitVat = Math.max(0, n2(it.unit_vat ?? 0));
    const unitInc = Math.max(0, n2(it.unit_price_incl_vat ?? unitEx + unitVat));
    const lineTotal = Math.max(0, n2(it.line_total ?? totalQty * unitInc));

    return {
      product_id: it.product_id ?? null,
      description: it.description ?? null,

      // invoice-style qty columns
      uom,
      box_qty: uom === "BOX" ? qtyInput : null,
      pcs_qty: uom === "PCS" ? qtyInput : null, // keep for compatibility if your invoice schema has pcs_qty

      units_per_box: upb,
      total_qty: totalQty,

      // invoice-style price columns
      unit_price_excl_vat: unitEx,
      unit_vat: unitVat,
      unit_price_incl_vat: unitInc,
      line_total: lineTotal,

      // some invoice engines want a vat_rate too
      vat_rate: vatPercent,
    };
  });

  // ✅ Build invoice payload to match your InvoiceCreate.tsx engine shape
  // (If your createInvoice uses different keys, adjust here only.)
  const payload: any = {
    // party
    customerId: (q as any).customer_id ?? null,
    clientName: null,
    print_name_mode: "CUSTOMER",

    // meta
    invoiceDate: (q as any).quotation_date || new Date().toISOString().slice(0, 10),
    purchaseOrderNo: null,

    // tax/discount (global)
    vatPercent,
    discountPercent,

    // balances (not applicable when converting)
    previousBalance: 0,
    amountPaid: 0,

    // sales rep
    salesRep: (q as any).sales_rep ?? null,
    salesRepPhone: (q as any).sales_rep_phone ?? null,

    // items
    items: mappedItems,
  };

  // 1) Create invoice
  const invRes: any = await createInvoice(payload);

  const invoiceId = Number(invRes?.id ?? invRes?.invoice_id ?? 0);
  if (!Number.isFinite(invoiceId) || invoiceId <= 0) {
    throw new Error("Invoice created but no valid invoice id returned");
  }

  const invoiceNumber = String(invRes?.invoice_number || invRes?.invoiceNo || "").trim() || null;

  // 2) Mark quotation converted (always update status)
  await setQuotationStatus(qid, "CONVERTED" as any);

  // 3) Optional: store link columns if they exist (graceful fallback)
  try {
    const { error } = await supabase
      .from("quotations")
      .update({
        converted_invoice_id: invoiceId,
        converted_at: new Date().toISOString(),
      })
      .eq("id", qid);

    // If columns don't exist, Postgres error is usually 42703 (undefined_column)
    if (error) {
      const msg = String((error as any).message || "");
      const code = String((error as any).code || "");
      if (code !== "42703" && !msg.toLowerCase().includes("column")) {
        throw new Error(msg);
      }
    }
  } catch {
    // ignore: status already set to CONVERTED
  }

  return { invoiceId, invoiceNumber };
}
