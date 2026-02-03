export type AppRole = 'admin' | 'manager' | 'accountant' | 'sales' | 'viewer';

export interface Profile {
  id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserRole {
  id: string;
  user_id: string;
  role: AppRole;
  created_at: string;
}

export interface Category {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface StockItem {
  id: string;
  name: string;
  sku: string | null;
  category_id: string | null;
  description: string | null;
  unit_price: number;
  cost_price: number;
  quantity: number;
  reorder_level: number | null;
  created_at: string;
  updated_at: string;
  category?: Category;
}

export interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  tax_id: string | null;
  credit_limit: number;
  balance: number;
  created_at: string;
  updated_at: string;
}

export interface Supplier {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  tax_id: string | null;
  balance: number;
  created_at: string;
  updated_at: string;
}

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'partial' | 'overdue' | 'cancelled';

export interface Invoice {
  id: string;
  invoice_number: string;
  customer_id: string | null;
  issue_date: string;
  due_date: string | null;
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  total: number;
  paid_amount: number;
  status: InvoiceStatus;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  customer?: Customer;
  items?: InvoiceItem[];
}

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  stock_item_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  discount_percent: number;
  total: number;
  created_at: string;
  stock_item?: StockItem;
}

export type CreditNoteStatus = 'draft' | 'applied' | 'cancelled';

export interface CreditNote {
  id: string;
  credit_note_number: string;
  invoice_id: string | null;
  customer_id: string;
  issue_date: string;
  subtotal: number;
  tax_amount: number;
  total: number;
  status: CreditNoteStatus;
  reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  customer?: Customer;
  invoice?: Invoice;
  items?: CreditNoteItem[];
}

export interface CreditNoteItem {
  id: string;
  credit_note_id: string;
  stock_item_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  total: number;
  created_at: string;
  stock_item?: StockItem;
}

export type QuotationStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired';

export interface Quotation {
  id: string;
  quotation_number: string;
  customer_id: string | null;
  issue_date: string;
  valid_until: string | null;
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  total: number;
  status: QuotationStatus;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  customer?: Customer;
  items?: QuotationItem[];
}

export interface QuotationItem {
  id: string;
  quotation_id: string;
  stock_item_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  discount_percent: number;
  total: number;
  created_at: string;
  stock_item?: StockItem;
}

export type StockMovementType = 'in' | 'out' | 'adjustment' | 'transfer';

export interface StockMovement {
  id: string;
  stock_item_id: string;
  movement_type: StockMovementType;
  quantity: number;
  reference_type: string | null;
  reference_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  stock_item?: StockItem;
}

export type PaymentMethod = 'cash' | 'bank_transfer' | 'card' | 'cheque' | 'other';

export interface Payment {
  id: string;
  invoice_id: string | null;
  customer_id: string | null;
  amount: number;
  payment_date: string;
  payment_method: PaymentMethod;
  reference: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  invoice?: Invoice;
  customer?: Customer;
}
