import { supabase } from "@/integrations/supabase/client";
import type { Product, ProductUpsert } from "@/types/product";

function num(v: any) {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function text(v: any) {
  const s = String(v ?? "").trim();
  return s.length ? s : null;
}

function normalizeStockUnit(v: any) {
  const s = String(v ?? "PCS").trim().toUpperCase();
  if (s === "WEIGHT") return "WEIGHT";
  if (s === "BAGS") return "BAGS";
  return "PCS";
}

function normalizePriceUnit(v: any, stockUnit?: any) {
  const su = normalizeStockUnit(stockUnit);
  if (su === "WEIGHT") return "KG";
  if (su === "BAGS") return "BAG";

  const s = String(v ?? "PCS").trim().toUpperCase();
  if (s === "KG") return "KG";
  if (s === "BAG") return "BAG";
  return "PCS";
}

/**
 * Returns products with normalized fields:
 * - price_excl_vat  = selling_price
 * - vat_rate        = 15
 * - bag_weight_kg   = nullable product bag size in KG
 *
 * Important:
 * - default activeOnly = false, so stock screens show all records unless explicitly filtered
 * - includes stock_unit/current_stock_grams/selling_price_unit for stock register + invoice flows
 */
export async function listProducts(params?: {
  q?: string;
  activeOnly?: boolean;
  limit?: number;
}) {
  const q = (params?.q || "").trim();
  const activeOnly = params?.activeOnly ?? false;
  const limit = params?.limit ?? 5000;

  let query = supabase
    .from("products")
    .select(
      `
      id,
      sku,
      item_code,
      name,
      description,
      units_per_box,
      bag_weight_kg,
      cost_price,
      selling_price,
      selling_price_unit,
      current_stock,
      current_stock_grams,
      reorder_level,
      is_active,
      created_at,
      updated_at,
      image_url,
      stock_unit
      `
    )
    .order("item_code", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true })
    .limit(limit);

  if (activeOnly) {
    query = query.eq("is_active", true);
  }

  if (q) {
    const s = q.replaceAll(",", " ").trim().replace(/[%_]/g, "");
    query = query.or(
      `name.ilike.%${s}%,sku.ilike.%${s}%,item_code.ilike.%${s}%`
    );
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data || []).map((p: any) => {
    const stockUnit = normalizeStockUnit(p?.stock_unit);
    return {
      ...p,
      item_code: text(p?.item_code),
      stock_unit: stockUnit,
      current_stock: num(p?.current_stock) ?? 0,
      current_stock_grams: num(p?.current_stock_grams) ?? 0,
      selling_price: num(p?.selling_price) ?? 0,
      cost_price: num(p?.cost_price),
      reorder_level: num(p?.reorder_level),
      selling_price_unit: normalizePriceUnit(p?.selling_price_unit, stockUnit),
      price_excl_vat: Number(p?.selling_price ?? 0),
      vat_rate: 15,
      bag_weight_kg: num(p?.bag_weight_kg),
    };
  });
}

export async function createProduct(input: ProductUpsert) {
  const stockUnit = normalizeStockUnit((input as any).stock_unit);

  const payload = {
    ...input,
    item_code: text((input as any).item_code),
    units_per_box: num((input as any).units_per_box),
    bag_weight_kg: num((input as any).bag_weight_kg),
    cost_price: num((input as any).cost_price),
    selling_price: num((input as any).selling_price),
    reorder_level: num((input as any).reorder_level),
    current_stock: num((input as any).current_stock) ?? 0,
    current_stock_grams: num((input as any).current_stock_grams) ?? 0,
    stock_unit: stockUnit,
    selling_price_unit: normalizePriceUnit(
      (input as any).selling_price_unit,
      stockUnit
    ),
    is_active: (input as any).is_active ?? true,
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
  const stockUnit = normalizeStockUnit((input as any).stock_unit);

  const payload = {
    ...input,
    item_code: text((input as any).item_code),
    units_per_box: num((input as any).units_per_box),
    bag_weight_kg: num((input as any).bag_weight_kg),
    cost_price: num((input as any).cost_price),
    selling_price: num((input as any).selling_price),
    reorder_level: num((input as any).reorder_level),
    current_stock: num((input as any).current_stock) ?? 0,
    current_stock_grams: num((input as any).current_stock_grams) ?? 0,
    stock_unit: stockUnit,
    selling_price_unit: normalizePriceUnit(
      (input as any).selling_price_unit,
      stockUnit
    ),
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