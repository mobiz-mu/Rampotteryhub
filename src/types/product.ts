export type Product = {
  id: number;
  sku: string;
  name: string;
  description: string | null;

  units_per_box: number | null;
  cost_price: number | null;
  selling_price: number;

  current_stock: number;
  reorder_level: number | null;

  is_active: boolean;

  created_at: string | null;
  updated_at: string | null;

  image_url: string | null;
  item_code: string | null;
};

export type ProductUpsert = {
  sku: string;
  name: string;
  description?: string | null;

  units_per_box?: number | null;
  cost_price?: number | null;
  selling_price: number;

  current_stock?: number;
  reorder_level?: number | null;

  is_active?: boolean;

  image_url?: string | null;
  item_code?: string | null;
};
