export type InvoiceItem = {
  id: number;
  invoice_id: number;
  product_id: number;

  box_qty: number;
  units_per_box: number;
  total_qty: number;

  unit_price_excl_vat: number;
  unit_vat: number;
  unit_price_incl_vat: number;

  line_total: number;

  created_at: string | null;
  updated_at: string | null;

  uom: string | null; // 'BOX' | 'PCS'
  pcs_qty: number | null;
  description: string | null;
  vat_rate: number | null;

  // join
  product?: {
    id: number;
    sku: string;
    item_code: string | null;
    name: string;
    units_per_box: number | null;
    selling_price: number;
  } | null;
};

export type InvoiceItemInsert = {
  invoice_id: number;
  product_id: number;

  box_qty: number;
  pcs_qty?: number | null;
  uom?: string | null;

  units_per_box: number;
  total_qty: number;

  unit_price_excl_vat: number;
  unit_vat: number;
  unit_price_incl_vat: number;

  line_total: number;

  description?: string | null;
  vat_rate?: number | null;
};
