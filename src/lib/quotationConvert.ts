// src/lib/quotationConvert.ts
import { supabase } from "@/integrations/supabase/client";
import { getQuotation, getQuotationItems, setQuotationStatus } from "@/lib/quotations";
import { createInvoice } from "@/lib/invoices";

const n2 = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const clampPct = (v: any) => Math.max(0, Math.min(100, n2(v)));
const up = (s: any) => String(s || "").trim().toUpperCase();

function normUom(u: any): "BOX" | "PCS" | "KG" | "G" | "BAG" {
  const x = up(u);
  if (x === "PCS") return "PCS";
  if (x === "KG") return "KG";
  if (x === "G" || x === "GRAM" || x === "GRAMS") return "G";
  if (x === "BAG" || x === "BAGS") return "BAG";
  return "BOX";
}

/**
 * Convert quotation -> invoice
 * Supports multi-UOM quotation items.
 */
export async function convertQuotationToInvoice(quotationId: number) {
  const qid = Number(quotationId);
  if (!Number.isFinite(qid) || qid <= 0) throw new Error("Invalid quotation id");

  const q = await getQuotation(qid);
  const items = await getQuotationItems(qid);

  if (!q?.id) throw new Error("Quotation not found");
  if (!items?.length) throw new Error("Quotation has no items");

  const vatPercent = clampPct((q as any).vat_percent ?? 15);

  const mappedItems = (items as any[]).map((it) => {
    const uom = normUom(it.uom);

    const box_qty = n2(it.box_qty ?? 0);
    const pcs_qty = n2(it.pcs_qty ?? 0);
    const grams_qty = n2(it.grams_qty ?? 0);
    const bags_qty = n2(it.bags_qty ?? 0);
    const upb = uom === "BOX" ? Math.max(1, Math.trunc(n2(it.units_per_box ?? 1) || 1)) : 1;

    // ✅ Use stored total_qty (trusted) — fallback compute if needed
    const totalQty =
      n2(it.total_qty) > 0
        ? n2(it.total_qty)
        : uom === "BOX"
        ? Math.trunc(box_qty) * upb
        : uom === "PCS"
        ? Math.trunc(pcs_qty)
        : uom === "KG"
        ? box_qty
        : uom === "G"
        ? Math.trunc(grams_qty)
        : Math.trunc(bags_qty);

    const unitEx = Math.max(0, n2(it.unit_price_excl_vat ?? 0));
    const unitVat = Math.max(0, n2(it.unit_vat ?? 0));
    const unitInc = Math.max(0, n2(it.unit_price_incl_vat ?? unitEx + unitVat));
    const lineTotal = Math.max(0, n2(it.line_total ?? totalQty * unitInc));

    return {
      product_id: it.product_id ?? null,
      description: it.description ?? null,

      uom,

      // Keep as close as possible to invoice schema:
      box_qty: uom === "BOX" ? Math.trunc(box_qty) : uom === "KG" ? box_qty : null,
      pcs_qty: uom === "PCS" ? Math.trunc(pcs_qty) : null,
      grams_qty: uom === "G" ? Math.trunc(grams_qty) : null,
      bags_qty: uom === "BAG" ? Math.trunc(bags_qty) : null,

      units_per_box: upb,
      total_qty: totalQty,

      unit_price_excl_vat: unitEx,
      unit_vat: unitVat,
      unit_price_incl_vat: unitInc,
      line_total: lineTotal,

      vat_rate: vatPercent,
    };
  });

  const payload: any = {
    customerId: (q as any).customer_id ?? null,
    clientName: null,
    print_name_mode: "CUSTOMER",

    invoiceDate: (q as any).quotation_date || new Date().toISOString().slice(0, 10),
    purchaseOrderNo: null,

    vatPercent,
    discountPercent: clampPct((q as any).discount_percent ?? 0),

    previousBalance: 0,
    amountPaid: 0,

    salesRep: (q as any).sales_rep ?? null,
    salesRepPhone: (q as any).sales_rep_phone ?? null,

    items: mappedItems,
  };

  const invRes: any = await createInvoice(payload);

  const invoiceId = Number(invRes?.id ?? invRes?.invoice_id ?? 0);
  if (!Number.isFinite(invoiceId) || invoiceId <= 0) {
    throw new Error("Invoice created but no valid invoice id returned");
  }

  const invoiceNumber = String(invRes?.invoice_number || invRes?.invoiceNo || "").trim() || null;

  await setQuotationStatus(qid, "CONVERTED" as any);

  try {
    const { error } = await supabase
      .from("quotations")
      .update({
        converted_invoice_id: invoiceId,
        converted_at: new Date().toISOString(),
      })
      .eq("id", qid);

    if (error) {
      const msg = String((error as any).message || "");
      const code = String((error as any).code || "");
      if (code !== "42703" && !msg.toLowerCase().includes("column")) throw new Error(msg);
    }
  } catch {
    // ignore
  }

  return { invoiceId, invoiceNumber };
}
