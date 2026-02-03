
import { supabase } from "@/integrations/supabase/client";
import type { Product, ProductUpsert } from "@/types/product";

function num(v: any) {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Returns products with a normalized field:
 * - price_excl_vat  = selling_price
 * - vat_rate        = 15 (default, since not stored in products table)
 *
 * This keeps your invoice create page unchanged (expects price_excl_vat / vat_rate).
 */
export async function listProducts(params?: {
  q?: string;
  activeOnly?: boolean;
  limit?: number;
}) {
  const q = (params?.q || "").trim();
  const activeOnly = params?.activeOnly ?? true;
  const limit = params?.limit ?? 500;

  let query = supabase
    .from("products")
    .select(
      "id,sku,name,description,units_per_box,cost_price,selling_price,current_stock,reorder_level,is_active,created_at,updated_at,image_url,item_code"
    )
    .order("name", { ascending: true })
    .limit(limit);

  if (activeOnly) query = query.eq("is_active", true);

  if (q) {
    const s = q.replaceAll(",", " ");
    query = query.or(
      `name.ilike.%${s}%,sku.ilike.%${s}%,item_code.ilike.%${s}%`
    );
  }

  const { data, error } = await query;
  if (error) throw error;

  // ✅ normalize to what InvoiceCreate expects
  return (data || []).map((p: any) => ({
    ...p,
    price_excl_vat: Number(p?.selling_price ?? 0), // <— key fix
    vat_rate: 15, // <— default since products table has no vat_rate column
  }));
}

export async function createProduct(input: ProductUpsert) {
  const payload = {
    ...input,
    units_per_box: num(input.units_per_box),
    cost_price: num(input.cost_price),
    selling_price: num(input.selling_price),
    reorder_level: num(input.reorder_level),
    current_stock: num(input.current_stock) ?? 0,
    is_active: input.is_active ?? true,
  };

  const { data, error } = await supabase
    .from("products")
    .insert(payload)
    .select("*")
    .single();

  if (error) throw error;
  return data as Product;
}

export async function updateProduct(id: number, input: ProductUpsert) {
  const payload = {
    ...input,
    units_per_box: num(input.units_per_box),
    cost_price: num(input.cost_price),
    selling_price: num(input.selling_price),
    reorder_level: num(input.reorder_level),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("products")
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return data as Product;
}

export async function setProductActive(id: number, active: boolean) {
  const { data, error } = await supabase
    .from("products")
    .update({ is_active: active, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id,is_active")
    .single();

  if (error) throw error;
  return data as { id: number; is_active: boolean };
}
