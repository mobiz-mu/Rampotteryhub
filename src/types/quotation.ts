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

  // optional sales rep fields (since you store them in quotations.ts)
  sales_rep?: string | null;
  sales_rep_phone?: string | null;

  notes?: string | null;

  subtotal?: number | null;

  discount_percent?: number | null;
  discount_amount?: number | null;

  vat_percent?: number | null;
  vat_amount?: number | null;

  total_amount?: number | null;

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

export type QuotationItemRow = {
  id?: number;
  quotation_id?: number;

  product_id?: number | null;
  description?: string | null;

  // ✅ Invoice-style quantity structure
  uom?: string | null; // "BOX" | "PCS"
  box_qty?: number | null; // input qty (boxes or pcs count)
  units_per_box?: number | null; // UPB (1 if PCS)
  total_qty?: number | null; // computed qty (BOX*UPB or PCS)

  // ✅ Invoice-style pricing columns
  unit_price_excl_vat?: number | null;
  unit_vat?: number | null;
  unit_price_incl_vat?: number | null;

  line_total?: number | null; // total_qty * unit_price_incl_vat

  // ✅ joined product (only present when you select product:products(...))
  product?: QuotationItemProduct | null;
};
