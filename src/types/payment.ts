// src/types/payment.ts
//
// Shape of a row in `invoice_payments` as used by the application
// (see src/lib/payments.ts). The live table keys the payment to an
// invoice via `invoice_id` (numeric). `invoice_id_bigint` is kept as an
// optional alias for backward compatibility with older code paths.

export type InvoicePayment = {
  id: string; // uuid
  invoice_id: number;
  invoice_id_bigint?: number | null;
  payment_date: string;
  amount: number;
  method: string;
  reference: string | null;
  notes: string | null;
  is_auto?: boolean | null;
  created_at: string | null;
};

export type PaymentInsert = {
  invoice_id: number;
  invoice_id_bigint?: number | null;
  payment_date: string;
  amount: number;
  method: string;
  reference?: string | null;
  notes?: string | null;
  is_auto?: boolean | null;
};
