// =====================================================================
// src/integrations/supabase/types.ts
//
// Supabase database types for Ram Pottery Hub.
//
// NOTE: These types were reconstructed to match the REAL schema that the
// application code uses (products, invoice_payments, rp_users,
// supplier_bills, supplier_payments, supplier_payment_allocations,
// audit_logs, user_activity, qr_logins, *_public_links, product_categories
// and the AP reporting views) rather than the older/stale schema
// (stock_items, uuid invoice ids, lowercase statuses) that the previous
// generated file contained.
//
// Where a column set is fully known (from the SQL migrations or the
// application's own `src/types/*` definitions) the columns are typed
// explicitly. Every table/view also carries an index signature so that
// additional live-DB columns that cannot be introspected from this repo
// do not break compilation. To regenerate canonical types against the
// live project run:
//
//   supabase gen types typescript --project-id <ref> > src/integrations/supabase/types.ts
// =====================================================================

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

/** Index-signature escape hatch for columns not statically known in this repo. */
type Extra = { [key: string]: any }

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      categories: {
        Row: {
          id: string
          name: string
          description: string | null
          created_at: string
          updated_at: string
        } & Extra
        Insert: {
          id?: string
          name: string
          description?: string | null
          created_at?: string
          updated_at?: string
        } & Extra
        Update: {
          id?: string
          name?: string
          description?: string | null
          created_at?: string
          updated_at?: string
        } & Extra
        Relationships: []
      }

      product_categories: {
        Row: {
          id: number
          name: string | null
          description: string | null
          created_at: string | null
          updated_at: string | null
        } & Extra
        Insert: { id?: number; name?: string | null } & Extra
        Update: { id?: number; name?: string | null } & Extra
        Relationships: []
      }

      products: {
        Row: {
          id: number
          sku: string
          name: string
          description: string | null
          units_per_box: number | null
          bag_weight_kg: number | null
          cost_price: number | null
          selling_price: number
          current_stock: number
          reorder_level: number | null
          is_active: boolean
          image_url: string | null
          item_code: string | null
          category_id: number | null
          created_at: string | null
          updated_at: string | null
        } & Extra
        Insert: {
          id?: number
          sku: string
          name: string
          description?: string | null
          units_per_box?: number | null
          bag_weight_kg?: number | null
          cost_price?: number | null
          selling_price: number
          current_stock?: number
          reorder_level?: number | null
          is_active?: boolean
          image_url?: string | null
          item_code?: string | null
          category_id?: number | null
        } & Extra
        Update: {
          id?: number
          sku?: string
          name?: string
          description?: string | null
          units_per_box?: number | null
          bag_weight_kg?: number | null
          cost_price?: number | null
          selling_price?: number
          current_stock?: number
          reorder_level?: number | null
          is_active?: boolean
          image_url?: string | null
          item_code?: string | null
          category_id?: number | null
          updated_at?: string | null
        } & Extra
        Relationships: []
      }

      customers: {
        Row: {
          id: number
          name: string
          phone: string | null
          email: string | null
          address: string | null
          opening_balance: number | null
          client: string | null
          customer_code: string | null
          discount_percent: number | null
          vat_no: string | null
          brn: string | null
          whatsapp: string | null
          is_active: boolean
          import_batch_id: string | null
          import_source: string | null
          client_name: string | null
          whatsapp_template_invoice: string | null
          whatsapp_template_statement: string | null
          whatsapp_template_overdue: string | null
          created_at: string | null
          updated_at: string | null
        } & Extra
        Insert: {
          id?: number
          name: string
          phone?: string | null
          email?: string | null
          address?: string | null
          opening_balance?: number | null
          client?: string | null
          customer_code?: string | null
          discount_percent?: number | null
          vat_no?: string | null
          brn?: string | null
          whatsapp?: string | null
          is_active?: boolean
          client_name?: string | null
        } & Extra
        Update: {
          id?: number
          name?: string
          phone?: string | null
          email?: string | null
          address?: string | null
          opening_balance?: number | null
          is_active?: boolean
        } & Extra
        Relationships: []
      }

      suppliers: {
        Row: {
          id: number
          name: string
          email: string | null
          phone: string | null
          address: string | null
          city: string | null
          country: string | null
          tax_id: string | null
          vat_no: string | null
          brn: string | null
          whatsapp: string | null
          opening_balance: number | null
          balance: number | null
          is_active: boolean
          created_at: string | null
          updated_at: string | null
        } & Extra
        Insert: { id?: number; name: string } & Extra
        Update: { id?: number; name?: string } & Extra
        Relationships: []
      }

      invoices: {
        Row: {
          id: number
          invoice_number: string
          customer_id: number | null
          invoice_date: string
          due_date: string | null
          subtotal: number
          vat_amount: number
          total_amount: number
          status: string
          amount_paid: number
          previous_balance: number | null
          balance_remaining: number | null
          balance_due: number | null
          credits_applied: number | null
          notes: string | null
          vat_percent: number | null
          discount_percent: number | null
          discount_amount: number | null
          sales_rep: string | null
          sales_rep_phone: string | null
          gross_total: number | null
          purchase_order_no: string | null
          total_excl_vat: number | null
          total_incl_vat: number | null
          stock_deducted_at: string | null
          invoice_year: number | null
          invoice_seq: number | null
          public_token: string | null
          created_by: string | null
          created_at: string | null
          updated_at: string | null
        } & Extra
        Insert: {
          id?: number
          invoice_number?: string
          customer_id?: number | null
          invoice_date?: string
          due_date?: string | null
          subtotal?: number
          vat_amount?: number
          total_amount?: number
          status?: string
          amount_paid?: number
          notes?: string | null
        } & Extra
        Update: {
          id?: number
          invoice_number?: string
          customer_id?: number | null
          invoice_date?: string
          due_date?: string | null
          subtotal?: number
          vat_amount?: number
          total_amount?: number
          status?: string
          amount_paid?: number
          balance_remaining?: number | null
          balance_due?: number | null
          credits_applied?: number | null
          notes?: string | null
          updated_at?: string | null
        } & Extra
        Relationships: []
      }

      invoice_items: {
        Row: {
          id: number
          invoice_id: number
          product_id: number | null
          description: string | null
          box_qty: number | null
          pcs_qty: number | null
          uom: string | null
          units_per_box: number | null
          total_qty: number | null
          unit_price_excl_vat: number | null
          unit_vat: number | null
          unit_price_incl_vat: number | null
          vat_rate: number | null
          line_total: number | null
          created_at: string | null
          updated_at: string | null
        } & Extra
        Insert: {
          id?: number
          invoice_id: number
          product_id?: number | null
          description?: string | null
        } & Extra
        Update: { id?: number } & Extra
        Relationships: []
      }

      invoice_payments: {
        Row: {
          id: string
          invoice_id: number
          invoice_id_bigint: number | null
          payment_date: string
          amount: number
          method: string
          reference: string | null
          notes: string | null
          is_auto: boolean | null
          created_at: string | null
        } & Extra
        Insert: {
          id?: string
          invoice_id: number
          invoice_id_bigint?: number | null
          payment_date?: string
          amount: number
          method: string
          reference?: string | null
          notes?: string | null
          is_auto?: boolean | null
        } & Extra
        Update: {
          id?: string
          payment_date?: string
          amount?: number
          method?: string
          reference?: string | null
          notes?: string | null
          is_auto?: boolean | null
        } & Extra
        Relationships: []
      }

      payments: {
        Row: {
          id: string
          invoice_id: string | null
          customer_id: string | null
          amount: number
          payment_date: string
          payment_method: string
          reference: string | null
          notes: string | null
          created_by: string | null
          created_at: string
        } & Extra
        Insert: { id?: string; amount: number } & Extra
        Update: { id?: string } & Extra
        Relationships: []
      }

      credit_notes: {
        Row: {
          id: number
          credit_note_number: string
          invoice_id: number | null
          customer_id: number | null
          issue_date: string | null
          credit_note_date: string | null
          subtotal: number | null
          vat_amount: number | null
          tax_amount: number | null
          total: number | null
          total_amount: number | null
          status: string
          reason: string | null
          notes: string | null
          public_token: string | null
          created_by: string | null
          created_at: string | null
          updated_at: string | null
        } & Extra
        Insert: {
          id?: number
          credit_note_number?: string
          invoice_id?: number | null
          customer_id?: number | null
          status?: string
          reason?: string | null
        } & Extra
        Update: {
          id?: number
          status?: string
          reason?: string | null
          public_token?: string | null
          updated_at?: string | null
        } & Extra
        Relationships: []
      }

      credit_note_items: {
        Row: {
          id: number
          credit_note_id: number
          product_id: number | null
          stock_item_id: string | null
          description: string | null
          quantity: number | null
          unit_price: number | null
          tax_rate: number | null
          total: number | null
          created_at: string | null
        } & Extra
        Insert: { id?: number; credit_note_id: number } & Extra
        Update: { id?: number } & Extra
        Relationships: []
      }

      credit_note_public_links: {
        Row: {
          id: string
          credit_note_id: number
          token: string
          created_at: string | null
          expires_at: string | null
        } & Extra
        Insert: { credit_note_id: number; token?: string } & Extra
        Update: Extra
        Relationships: []
      }

      quotations: {
        Row: {
          id: number
          quotation_number: string | null
          customer_id: number | null
          quotation_date: string | null
          valid_until: string | null
          subtotal: number | null
          vat_percent: number | null
          vat_amount: number | null
          discount_percent: number | null
          discount_amount: number | null
          total_amount: number | null
          status: string | null
          notes: string | null
          sales_rep: string | null
          sales_rep_phone: string | null
          customer_name: string | null
          customer_code: string | null
          converted_invoice_id: number | null
          converted_at: string | null
          public_token: string | null
          created_at: string | null
          updated_at: string | null
        } & Extra
        Insert: { id?: number; quotation_number?: string | null } & Extra
        Update: { id?: number; status?: string | null } & Extra
        Relationships: []
      }

      quotation_items: {
        Row: {
          id: number
          quotation_id: number
          product_id: number | null
          description: string | null
          uom: string | null
          box_qty: number | null
          pcs_qty: number | null
          grams_qty: number | null
          bags_qty: number | null
          units_per_box: number | null
          total_qty: number | null
          base_unit_price_excl_vat: number | null
          vat_rate: number | null
          price_overridden: boolean | null
          unit_price_excl_vat: number | null
          unit_vat: number | null
          unit_price_incl_vat: number | null
          line_total: number | null
          created_at: string | null
        } & Extra
        Insert: { id?: number; quotation_id: number } & Extra
        Update: { id?: number } & Extra
        Relationships: []
      }

      quotation_public_links: {
        Row: {
          id: string
          quotation_id: number
          token: string
          created_at: string | null
          expires_at: string | null
        } & Extra
        Insert: { quotation_id: number; token?: string } & Extra
        Update: Extra
        Relationships: []
      }

      stock_movements: {
        Row: {
          id: number
          product_id: number | null
          stock_item_id: string | null
          movement_type: string
          quantity: number
          reference_type: string | null
          reference_id: string | null
          notes: string | null
          created_by: string | null
          created_at: string | null
        } & Extra
        Insert: { id?: number; movement_type: string; quantity: number } & Extra
        Update: { id?: number } & Extra
        Relationships: []
      }

      supplier_bills: {
        Row: {
          id: number
          supplier_id: number | null
          bill_number: string | null
          bill_date: string | null
          due_date: string | null
          subtotal: number | null
          vat_amount: number | null
          total_amount: number | null
          amount_paid: number | null
          balance_due: number | null
          status: string | null
          notes: string | null
          created_at: string | null
          updated_at: string | null
        } & Extra
        Insert: { id?: number; supplier_id?: number | null } & Extra
        Update: { id?: number; status?: string | null } & Extra
        Relationships: []
      }

      supplier_payments: {
        Row: {
          id: number
          supplier_id: number | null
          payment_date: string | null
          amount: number | null
          method: string | null
          reference: string | null
          notes: string | null
          created_at: string | null
        } & Extra
        Insert: { id?: number; supplier_id?: number | null; amount?: number | null } & Extra
        Update: { id?: number } & Extra
        Relationships: []
      }

      supplier_payment_allocations: {
        Row: {
          id: number
          payment_id: number
          bill_id: number
          amount_applied: number
          created_at: string | null
        } & Extra
        Insert: {
          payment_id: number
          bill_id: number
          amount_applied: number
        } & Extra
        Update: { id?: number } & Extra
        Relationships: []
      }

      rp_users: {
        Row: {
          id: string
          user_id: string | null
          username: string | null
          full_name: string | null
          email: string | null
          is_active: boolean | null
          created_at: string | null
          updated_at: string | null
        } & Extra
        Insert: { id?: string; username?: string | null } & Extra
        Update: { id?: string; is_active?: boolean | null } & Extra
        Relationships: []
      }

      user_activity: {
        Row: {
          id: string
          user_id: string | null
          action: string | null
          detail: string | null
          created_at: string | null
        } & Extra
        Insert: { user_id?: string | null; action?: string | null } & Extra
        Update: Extra
        Relationships: []
      }

      audit_logs: {
        Row: {
          id: string
          entity_table: string | null
          entity_id: string | number | null
          action: string | null
          actor: string | null
          payload: Json | null
          created_at: string | null
        } & Extra
        Insert: { entity_table?: string | null; entity_id?: string | null } & Extra
        Update: Extra
        Relationships: []
      }

      qr_logins: {
        Row: {
          id: string
          token: string
          status: string | null
          user_id: string | null
          created_at: string | null
          expires_at: string | null
          approved_at: string | null
        } & Extra
        Insert: { token: string; status?: string | null } & Extra
        Update: { status?: string | null; approved_at?: string | null } & Extra
        Relationships: []
      }

      docs: {
        Row: {
          id: string
          kind: string | null
          ref_id: string | null
          token: string | null
          created_at: string | null
        } & Extra
        Insert: Extra
        Update: Extra
        Relationships: []
      }

      profiles: {
        Row: {
          id: string
          user_id: string
          full_name: string | null
          email: string | null
          phone: string | null
          avatar_url: string | null
          created_at: string
          updated_at: string
        } & Extra
        Insert: { id?: string; user_id: string } & Extra
        Update: { id?: string } & Extra
        Relationships: []
      }

      user_roles: {
        Row: {
          id: string
          user_id: string
          role: Database["public"]["Enums"]["app_role"]
          created_at: string
        } & Extra
        Insert: {
          id?: string
          user_id: string
          role: Database["public"]["Enums"]["app_role"]
        } & Extra
        Update: { id?: string } & Extra
        Relationships: []
      }
    }

    Views: {
      v_supplier_aging: {
        Row: {
          supplier_id: number | null
          supplier_name: string | null
          current: number | null
          d30: number | null
          d60: number | null
          d90: number | null
          older: number | null
          total_due: number | null
        } & Extra
        Relationships: []
      }
      v_supplier_balances: {
        Row: {
          supplier_id: number | null
          supplier_name: string | null
          balance: number | null
        } & Extra
        Relationships: []
      }
      v_supplier_ledger_lines: {
        Row: Extra
        Relationships: []
      }
      v_ap_kpis: {
        Row: {
          total_outstanding: number | null
          bills_count: number | null
          overdue_amount: number | null
        } & Extra
        Relationships: []
      }
      v_ap_top_exposure_suppliers: {
        Row: {
          supplier_id: number | null
          supplier_name: string | null
          exposure: number | null
        } & Extra
        Relationships: []
      }
      v_customer_account_transactions: {
        Row: Extra
        Relationships: []
      }
      v_sales_rep_transactions: {
        Row: Extra
        Relationships: []
      }
    }

    Functions: {
      rotate_invoice_public_token: {
        Args: { p_invoice_id: number } | { [key: string]: any }
        Returns: any
      }
      has_role: {
        Args: { _user_id: string; _role: Database["public"]["Enums"]["app_role"] }
        Returns: boolean
      }
      is_employee: {
        Args: { _user_id: string }
        Returns: boolean
      }
      generate_invoice_number: { Args: Record<string, never>; Returns: string }
      generate_credit_note_number: { Args: Record<string, never>; Returns: string }
      generate_quotation_number: { Args: Record<string, never>; Returns: string }
    }

    Enums: {
      app_role: "admin" | "manager" | "accountant" | "sales" | "viewer"
    }

    CompositeTypes: Record<string, never>
  }
}

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "manager", "accountant", "sales", "viewer"],
    },
  },
} as const
