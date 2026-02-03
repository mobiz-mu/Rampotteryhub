import { supabase } from "@/integrations/supabase/client";
import type { Customer, CustomerUpsert } from "@/types/customer";

function numOrNull(v: any) {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function listCustomers(params?: {
  q?: string;
  activeOnly?: boolean;
  limit?: number;
}) {
  const q = (params?.q || "").trim();
  const activeOnly = params?.activeOnly ?? true;
  const limit = params?.limit ?? 300;

  let query = supabase
    .from("customers")
    .select(
      "id,name,phone,email,address,opening_balance,created_at,updated_at,client,customer_code,discount_percent,vat_no,brn,whatsapp,is_active,import_batch_id,import_source,client_name,whatsapp_template_invoice,whatsapp_template_statement,whatsapp_template_overdue"
    )
    .order("name", { ascending: true })
    .limit(limit);

  if (activeOnly) query = query.eq("is_active", true);

  // Simple search (client-side safe): we use ilike on main fields.
  // NOTE: Supabase doesn't support OR easily without .or(); we'll use .or for the key fields.
  if (q) {
    // escape comma in query - Supabase .or syntax uses commas
    const s = q.replaceAll(",", " ");
    query = query.or(
      `name.ilike.%${s}%,phone.ilike.%${s}%,customer_code.ilike.%${s}%,whatsapp.ilike.%${s}%`
    );
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data || []) as Customer[];
}

export async function createCustomer(input: CustomerUpsert) {
  const payload = {
    ...input,
    opening_balance: numOrNull((input as any).opening_balance),
    discount_percent: numOrNull((input as any).discount_percent),
    is_active: input.is_active ?? true,
  };

  const { data, error } = await supabase
    .from("customers")
    .insert(payload)
    .select(
      "id,name,phone,email,address,opening_balance,created_at,updated_at,client,customer_code,discount_percent,vat_no,brn,whatsapp,is_active,import_batch_id,import_source,client_name,whatsapp_template_invoice,whatsapp_template_statement,whatsapp_template_overdue"
    )
    .single();

  if (error) throw error;
  return data as Customer;
}

export async function updateCustomer(id: number, input: CustomerUpsert) {
  const payload = {
    ...input,
    updated_at: new Date().toISOString(),
    opening_balance: numOrNull((input as any).opening_balance),
    discount_percent: numOrNull((input as any).discount_percent),
  };

  const { data, error } = await supabase
    .from("customers")
    .update(payload)
    .eq("id", id)
    .select(
      "id,name,phone,email,address,opening_balance,created_at,updated_at,client,customer_code,discount_percent,vat_no,brn,whatsapp,is_active,import_batch_id,import_source,client_name,whatsapp_template_invoice,whatsapp_template_statement,whatsapp_template_overdue"
    )
    .single();

  if (error) throw error;
  return data as Customer;
}

export async function setCustomerActive(id: number, active: boolean) {
  const { data, error } = await supabase
    .from("customers")
    .update({ is_active: active, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id,is_active")
    .single();

  if (error) throw error;
  return data as { id: number; is_active: boolean };
}
