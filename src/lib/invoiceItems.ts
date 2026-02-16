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
    // keep both naming styles safe
    product: r.products ?? r.product ?? null,
  };
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || "").trim());
}
function apiBase() {
  return (import.meta as any)?.env?.VITE_API_URL?.trim?.() || "";
}

/** ✅ Supports publicToken (for /invoices/:id/print?t=...) */
export async function listInvoiceItems(invoiceId: number, opts?: { publicToken?: string }) {
  // PUBLIC: go via server endpoint (NO browser supabase)
  if (opts?.publicToken) {
    const t = String(opts.publicToken || "").trim();
    if (!isUuid(t)) throw new Error("Invoice not found / access denied.");

    const base = apiBase();
    const url = `${base}/api/public/invoice-print?id=${encodeURIComponent(String(invoiceId))}&t=${encodeURIComponent(t)}`;
    const res = await fetch(url);
    const json = await res.json().catch(() => null);

    if (!res.ok || !json?.ok) throw new Error(json?.error || "Invoice not found / access denied.");

    return (json.items || []).map((it: any) => ({
      ...it,
      product: it.product ?? null,
    })) as InvoiceItem[];
  }

  // PRIVATE: direct supabase (authenticated)
  const { data, error } = await supabase
    .from("invoice_items")
    .select(SELECT_JOIN)
    .eq("invoice_id", invoiceId)
    .order("id", { ascending: true });

  if (error) throw error;
  return (data || []).map(normalizeRow) as InvoiceItem[];
}

export async function insertInvoiceItem(row: InvoiceItemInsert) {
  const { data, error } = await supabase.from("invoice_items").insert(row).select(SELECT_JOIN).single();
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
