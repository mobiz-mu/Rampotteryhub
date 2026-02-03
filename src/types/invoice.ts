export type InvoiceStatus = "DRAFT" | "ISSUED" | "PARTIALLY_PAID" | "PAID" | "VOID";

export type Invoice = {
  id: number;
  invoice_number: string;

  customer_id: number;
  invoice_date: string; // YYYY-MM-DD
  due_date: string | null;

  subtotal: number;
  vat_amount: number;
  total_amount: number;

  status: InvoiceStatus;

  amount_paid: number;
  previous_balance: number;
  balance_remaining: number;

  notes: string | null;

  created_at: string | null;
  updated_at: string | null;

  vat_percent: number | null;
  discount_percent: number | null;
  discount_amount: number | null;

  sales_rep_phone: string | null;
  sales_rep: string | null;

  gross_total: number | null;
  purchase_order_no: string | null;

  total_excl_vat: number | null;
  total_incl_vat: number | null;
  balance_due: number | null;

  stock_deducted_at: string | null;
  invoice_year: number | null;
  invoice_seq: number | null;
};

export type InvoiceRow = Invoice & {
  customer_name?: string | null;
  customer_code?: string | null;
};
