export type InvoicePayment = {
  id: string;               // uuid
  invoice_id_bigint: number; // ✅ new fk
  payment_date: string;
  amount: number;
  method: string;
  reference: string | null;
  notes: string | null;
  created_at: string | null;
};

export type PaymentInsert = {
  invoice_id_bigint: number;
  payment_date: string;
  amount: number;
  method: string;
  reference?: string | null;
  notes?: string | null;
};
