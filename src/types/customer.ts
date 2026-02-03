export type Customer = {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  opening_balance: number | null;
  created_at: string | null;
  updated_at: string | null;

  client: string | null;
  customer_code: string | null;
  discount_percent: number | null;
  vat_no: string | null;
  brn: string | null;
  whatsapp: string | null;

  is_active: boolean;

  import_batch_id: string | null;
  import_source: string | null;
  client_name: string | null;

  whatsapp_template_invoice: string | null;
  whatsapp_template_statement: string | null;
  whatsapp_template_overdue: string | null;
};

export type CustomerUpsert = {
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  opening_balance?: number | null;

  client?: string | null;
  customer_code?: string | null;
  discount_percent?: number | null;
  vat_no?: string | null;
  brn?: string | null;
  whatsapp?: string | null;

  is_active?: boolean;

  client_name?: string | null;

  whatsapp_template_invoice?: string | null;
  whatsapp_template_statement?: string | null;
  whatsapp_template_overdue?: string | null;
};
