// src/lib/quotationItems.ts
import { supabase } from "@/integrations/supabase/client";

/**
 * Quotation items (invoice-style columns):
 * BOX/PCS + UPB + TOTAL QTY + Unit Ex/VAT/Inc + Line Total
 *
 * ✅ Includes lightweight product join for UI display
 */
export async function listQuotationItems(quotationId: number) {
  const id = Number(quotationId);
  if (!Number.isFinite(id) || id <= 0) throw new Error("Invalid quotationId");

  const { data, error } = await supabase
    .from("quotation_items")
    .select(
      `
      id,
      quotation_id,
      product_id,
      description,
      uom,
      box_qty,
      units_per_box,
      total_qty,
      unit_price_excl_vat,
      unit_vat,
      unit_price_incl_vat,
      line_total,
      product:products (
        id,
        name,
        sku,
        item_code,
        units_per_box,
        selling_price
      )
    `
    )
    .eq("quotation_id", id)
    .order("id", { ascending: true });

  if (error) throw new Error(error.message);
  return data || [];
}
