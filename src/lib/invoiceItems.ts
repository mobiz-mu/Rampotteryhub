// src/lib/invoiceItems.ts
import { supabase } from "@/integrations/supabase/client";
import type { InvoiceItem, InvoiceItemInsert } from "@/types/invoiceItem";

const SELECT_JOIN = `
  id,invoice_id,product_id,box_qty,pcs_qty,uom,units_per_box,total_qty,
  unit_price_excl_vat,unit_vat,unit_price_incl_vat,line_total,
  description,vat_rate,
  created_at,updated_at,
  products:product_id ( id,sku,item_code,name,units_per_box,selling_price )
`;

function normalizeRow(r: any) {
  return {
    ...r,
    product: r.products ?? r.product ?? null,
  };
}

export async function listInvoiceItems(invoiceId: number) {
  const { data, error } = await supabase
    .from("invoice_items")
    .select(SELECT_JOIN)
    .eq("invoice_id", invoiceId)
    .order("id", { ascending: true });

  if (error) throw error;

  return (data || []).map(normalizeRow) as InvoiceItem[];
}

export async function insertInvoiceItem(row: InvoiceItemInsert) {
  const { data, error } = await supabase
    .from("invoice_items")
    .insert(row)
    .select(SELECT_JOIN)
    .single();

  if (error) throw error;

  return normalizeRow(data) as InvoiceItem;
}

export async function updateInvoiceItem(id: number, patch: Partial<InvoiceItemInsert>) {
  const { data, error } = await supabase
    .from("invoice_items")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(SELECT_JOIN)
    .single();

  if (error) throw error;

  return normalizeRow(data) as InvoiceItem;
}

export async function deleteInvoiceItem(id: number) {
  const { error } = await supabase.from("invoice_items").delete().eq("id", id);
  if (error) throw error;
  return true;
}
