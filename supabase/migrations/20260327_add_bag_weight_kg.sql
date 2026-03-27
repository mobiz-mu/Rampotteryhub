alter table public.products
add column if not exists bag_weight_kg numeric(12,3) null;

comment on column public.products.bag_weight_kg is 'Weight in KG for one bag for BAG products';

alter table public.products
add constraint products_bag_weight_kg_nonneg_check
check (bag_weight_kg is null or bag_weight_kg > 0);
