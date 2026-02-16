// src/types/quotation.ts

export type QuotationStatus =
  | "DRAFT"
  | "SENT"
  | "ACCEPTED"
  | "REJECTED"
  | "EXPIRED"
  | "CONVERTED";

export type QuotationRow = {
  id: number;

  quotation_number?: string | null;
  quotation_date?: string | null; // YYYY-MM-DD
  valid_until?: string | null; // YYYY-MM-DD

  status?: QuotationStatus | null;

  customer_id?: number | null;
  customer_name?: string | null;
  customer_code?: string | null;

  // optional sales rep fields
  sales_rep?: string | null;
  sales_rep_phone?: string | null;

  notes?: string | null;

  subtotal?: number | null;

  discount_percent?: number | null;
  discount_amount?: number | null;

  vat_percent?: number | null; // global/default VAT %
  vat_amount?: number | null;

  total_amount?: number | null;

  // optional convert link columns (if present in DB)
  converted_invoice_id?: number | null;
  converted_at?: string | null;

  created_at?: string | null;
};

/** Optional product join shape used by getQuotationItems() */
export type QuotationItemProduct = {
  id: number;
  item_code?: string | null;
  sku?: string | null;
  name?: string | null;
  description?: string | null;
  units_per_box?: number | null;
  selling_price?: number | null; // VAT-exclusive (like invoices)
};

export type QuotationUom = "BOX" | "PCS" | "KG" | "G" | "BAG";

export type QuotationItemRow = {
  id?: number;
  quotation_id?: number;

  product_id?: number | null;
  description?: string | null;

  // ✅ Multi-UOM (quotation_items)
  uom?: QuotationUom | string | null;

  /**
   * ✅ Quantity columns (DB)
   * - BOX: uses box_qty (integer-like)
   * - PCS: uses pcs_qty (integer)
   * - KG : uses box_qty (numeric 12,3) as "kg_qty" (for compatibility)
   * - G  : uses grams_qty (integer grams)
   * - BAG: uses bags_qty (integer)
   */
  box_qty?: number | null; // BOX qty OR KG qty (kg stored here)
  pcs_qty?: number | null;
  grams_qty?: number | null;
  bags_qty?: number | null;

  // BOX only
  units_per_box?: number | null;

  // computed/stored
  total_qty?: number | null;

  // ✅ Pricing
  base_unit_price_excl_vat?: number | null; // product base EX (before discount)
  vat_rate?: number | null; // per-row VAT %
  price_overridden?: boolean | null;

  unit_price_excl_vat?: number | null;
  unit_vat?: number | null; // per unit
  unit_price_incl_vat?: number | null;

  line_total?: number | null; // total_qty * unit_price_incl_vat

  // ✅ joined product
  product?: QuotationItemProduct | null;
};
