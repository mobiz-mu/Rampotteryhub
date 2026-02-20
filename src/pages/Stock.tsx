// src/pages/Stock.tsx
import React, { useMemo, useRef, useState, useEffect, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Product, ProductUpsert } from "@/types/product";
import { createProduct, listProducts, setProductActive, updateProduct } from "@/lib/products";
import { supabase } from "@/integrations/supabase/client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

import * as XLSX from "xlsx";

import {
  Package,
  Plus,
  RefreshCw,
  Download,
  AlertTriangle,
  Layers,
  Search,
  X,
  ChevronUp,
  ChevronDown,
  History,
  Upload,
  ArrowUpRight,
  FileSpreadsheet,
} from "lucide-react";

/* =========================
   Types
========================= */
type Category = {
  id: string; // uuid
  name: string;
  description?: string | null;
  created_at?: string | null;
};

type ProductCategoryLink = {
  product_id: number;
  category_id: string;
};

type StockUnit = "PCS" | "WEIGHT" | "BAGS";
type PriceUnit = "PCS" | "KG" | "BAG";

type StockMovement = {
  id: number;
  product_id: number;
  movement_date: string;
  movement_type: "IN" | "OUT" | "ADJUSTMENT";
  quantity: number;
  quantity_grams?: number | null;
  reference?: string | null;
  source_table?: string | null;
  source_id?: number | null;
  notes?: string | null;
  created_at?: string | null;
};

/* =========================
   Helpers
========================= */
function s(v: any) {
  return String(v ?? "").trim();
}
function n0(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function nInt(v: any) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}
function money(v: any) {
  if (v === null || v === undefined || v === "") return "-";
  const n = Number(v);
  if (!Number.isFinite(n)) return "-";
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function normalizeStockUnit(v: any): StockUnit {
  const x = String(v || "PCS").toUpperCase();
  if (x === "WEIGHT") return "WEIGHT";
  if (x === "BAGS") return "BAGS";
  return "PCS";
}
function normalizePriceUnit(v: any): PriceUnit {
  const x = String(v || "PCS").toUpperCase();
  if (x === "KG") return "KG";
  if (x === "BAG") return "BAG";
  return "PCS";
}

function genSku(prefix = "SKU") {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  const rnd = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${y}${m}${da}-${rnd}`;
}

function splitPcsToBoxUnits(pcs: number, upb: number) {
  const safeUpb = Math.max(1, Math.trunc(n0(upb || 1)));
  const safePcs = Math.max(0, Math.trunc(n0(pcs)));
  return { boxes: Math.floor(safePcs / safeUpb), units: safePcs % safeUpb };
}
function splitGramsToKgG(g: number) {
  const grams = Math.max(0, Math.trunc(n0(g)));
  return { kg: Math.floor(grams / 1000), g: grams % 1000 };
}

function fmtDateTime(iso: any) {
  const d = iso ? new Date(String(iso)) : null;
  if (!d || Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Low stock logic:
 * - PCS/BAGS: compare current_stock (count) <= reorder_level
 * - WEIGHT: compare current_stock_grams (converted to KG) <= reorder_level
 *   (we treat reorder_level as KG threshold for WEIGHT items)
 */
function isLowStock(p: Product) {
  const unit = normalizeStockUnit((p as any).stock_unit);
  const reorder = n0((p as any).reorder_level);
  if (!reorder || reorder <= 0) return false;

  if (unit === "WEIGHT") {
    const grams = n0((p as any).current_stock_grams);
    const kg = grams / 1000;
    return kg <= reorder;
  }

  const count = n0((p as any).current_stock);
  return count <= reorder;
}

function stockDisplay(p: Product) {
  const unit = normalizeStockUnit((p as any).stock_unit);

  if (unit === "WEIGHT") {
    const grams = Math.max(0, Math.trunc(n0((p as any).current_stock_grams ?? 0)));
    const { kg, g } = splitGramsToKgG(grams);
    return {
      unit,
      primary: `${kg} kg, ${g} g`,
      secondary: `${grams} g (DB)`,
    };
  }

  const upb = Math.max(1, Math.trunc(n0(p.units_per_box ?? 1)));
  const pcsOrBags = Math.max(0, Math.trunc(n0((p as any).current_stock ?? 0)));

  if (unit === "BAGS") {
    return {
      unit,
      primary: `${pcsOrBags} bag(s)`,
      secondary: `${pcsOrBags} (DB)`,
    };
  }

  const { boxes, units } = splitPcsToBoxUnits(pcsOrBags, upb);
  return {
    unit,
    primary: `${boxes} box, ${units} unit`,
    secondary: `${pcsOrBags} pcs (DB) • UPB ${upb}`,
  };
}

function csvEscape(x: any) {
  return `"${String(x ?? "").replace(/"/g, '""')}"`;
}

function downloadCsv(filename: string, header: string[], rows: any[][]) {
  const csv = [header.join(","), ...rows.map((r) => r.map(csvEscape).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function downloadXlsx(filename: string, sheetName: string, header: string[], rows: any[][]) {
  const aoa = [header, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  // browser-safe
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([out], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** build safe payload for DB */
function toPayload(form: any): ProductUpsert {
  const sku = s(form.sku) || genSku();
  const name = s(form.name);

  const stock_unit: StockUnit = normalizeStockUnit(form.stock_unit);

  const selling_price_unit: PriceUnit =
    stock_unit === "WEIGHT"
      ? "KG"
      : stock_unit === "BAGS"
      ? "BAG"
      : normalizePriceUnit(form.selling_price_unit) === "KG"
      ? "KG"
      : "PCS";

  let current_stock_pcs_or_bags = 0;
  let current_stock_grams = 0;

  if (stock_unit === "PCS") {
    const upb = nInt(form.units_per_box);
    const boxStock = Math.max(0, nInt(form.current_stock_boxes) ?? 0);
    const unitStock = Math.max(0, nInt(form.current_stock_units) ?? 0);
    current_stock_pcs_or_bags = Math.max(0, boxStock * (upb ?? 1) + unitStock);
    current_stock_grams = 0;
  } else if (stock_unit === "WEIGHT") {
    const kg = Math.max(0, nInt(form.current_stock_kg) ?? 0);
    const g = Math.max(0, nInt(form.current_stock_g) ?? 0);
    current_stock_grams = Math.max(0, kg * 1000 + g);
    current_stock_pcs_or_bags = 0;
  } else {
    const bags = Math.max(0, nInt(form.current_stock_bags) ?? 0);
    current_stock_pcs_or_bags = bags;
    current_stock_grams = 0;
  }

  return {
    sku,
    item_code: s(form.item_code) || null,
    name,
    description: s(form.description) || "",

    units_per_box: stock_unit === "PCS" ? nInt(form.units_per_box) : null,

    cost_price: form.cost_price === "" ? null : Number.isFinite(Number(form.cost_price)) ? Number(form.cost_price) : null,
    selling_price: Math.max(0, n0(form.selling_price)),

    current_stock: current_stock_pcs_or_bags,
    reorder_level: form.reorder_level === "" ? null : Math.max(0, nInt(form.reorder_level) ?? 0),
    is_active: !!form.is_active,
    image_url: "",

    stock_unit,
    current_stock_grams,
    selling_price_unit,
  } as any;
}

/* =========================
   Supabase helpers
========================= */
async function fetchCategories() {
  const { data, error } = await supabase.from("categories").select("*").order("name", { ascending: true });
  if (error) throw error;
  return (data || []) as Category[];
}

async function fetchProductCategoryLinks(productIds: number[]) {
  if (!productIds.length) return [] as ProductCategoryLink[];
  const { data, error } = await supabase
    .from("product_categories")
    .select("product_id,category_id")
    .in("product_id", productIds);
  if (error) throw error;
  return (data || []) as ProductCategoryLink[];
}

async function syncProductCategories(productId: number, categoryIds: string[]) {
  const { error: delErr } = await supabase.from("product_categories").delete().eq("product_id", productId);
  if (delErr) throw delErr;

  const uniq = Array.from(new Set((categoryIds || []).map((x) => String(x).trim()).filter(Boolean)));
  if (!uniq.length) return;

  const rows = uniq.map((cid) => ({ product_id: productId, category_id: cid }));
  const { error: insErr } = await supabase.from("product_categories").insert(rows);
  if (insErr) throw insErr;
}

async function fetchStockHistory(productId: number, limit = 80) {
  const { data, error } = await supabase
    .from("stock_movements")
    .select("id,product_id,movement_date,movement_type,quantity,quantity_grams,reference,source_table,source_id,notes,created_at")
    .eq("product_id", productId)
    .order("movement_date", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []) as StockMovement[];
}

/* =========================
   Form defaults
========================= */
const emptyForm: any = {
  sku: "",
  item_code: "",
  name: "",
  description: "",

  stock_unit: "PCS" as StockUnit,

  // PCS entry
  units_per_box: "",
  current_stock_boxes: "",
  current_stock_units: "",

  // WEIGHT entry
  current_stock_kg: "",
  current_stock_g: "",

  // BAGS entry
  current_stock_bags: "",

  selling_price_unit: "PCS" as PriceUnit,

  cost_price: "",
  selling_price: "",
  reorder_level: "",
  is_active: true,
  image_url: "",

  category_ids: [] as string[],
};

/* =========================
   Small UI helpers
========================= */
function Pill({ tone, children }: { tone: "ok" | "warn" | "bad" | "muted"; children: React.ReactNode }) {
  const cls =
    tone === "ok"
      ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/20"
      : tone === "warn"
      ? "bg-amber-500/10 text-amber-800 border-amber-500/20"
      : tone === "bad"
      ? "bg-red-500/10 text-red-700 border-red-500/20"
      : "bg-muted/30 text-muted-foreground border-border";
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${cls}`}>
      {children}
    </span>
  );
}

function Stat({
  icon,
  label,
  value,
  tone = "muted",
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  tone?: "muted" | "ok" | "warn" | "bad";
}) {
  const ring =
    tone === "ok"
      ? "ring-emerald-500/20 bg-emerald-500/5"
      : tone === "warn"
      ? "ring-amber-500/25 bg-amber-500/5"
      : tone === "bad"
      ? "ring-red-500/20 bg-red-500/5"
      : "ring-border bg-muted/10";

  return (
    <Card className={`p-3 shadow-premium ring-1 rounded-2xl ${ring}`}>
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-xl bg-background ring-1 ring-border flex items-center justify-center">{icon}</div>
        <div className="min-w-0">
          <div className="text-[11px] text-muted-foreground">{label}</div>
          <div className="text-sm font-extrabold truncate">{value}</div>
        </div>
      </div>
    </Card>
  );
}

function DrawerShell({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <>
      <div
        className={`fixed inset-0 z-[60] transition ${open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
        onClick={onClose}
      >
        <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" />
      </div>

      <div
        className={`fixed right-0 top-0 z-[61] h-full w-[94vw] max-w-[520px] bg-white shadow-2xl border-l transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        role="dialog"
        aria-modal="true"
      >
        <div className="p-4 border-b bg-white/90 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-extrabold truncate">{title}</div>
              <div className="text-[11px] text-muted-foreground">Stock movements trail • newest first</div>
            </div>
            <Button variant="outline" className="h-8 rounded-xl" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>

        <div className="h-[calc(100%-68px)] overflow-auto p-4 bg-slate-50/40">{children}</div>
      </div>
    </>
  );
}

/* =========================
   Virtual list constants
========================= */
const ROW_H = 86;
const OVERSCAN = 8;

/* =========================
   Page
========================= */
export default function Stock() {
  const qc = useQueryClient();

  // filters
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [activeOnly, setActiveOnly] = useState(true);
  const [lowOnly, setLowOnly] = useState(false);

  // category filter
  const [showCategories, setShowCategories] = useState(false);
  const [catQ, setCatQ] = useState("");
  const [filterCategoryId, setFilterCategoryId] = useState<string | "ALL">("ALL");

  // dialog
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<any>(emptyForm);
  const [catPickQ, setCatPickQ] = useState("");

  // list virtualization
  const listRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(640);

  // ✅ Update Stock dialog
  const [stockOpen, setStockOpen] = useState(false);
  const [stockProduct, setStockProduct] = useState<Product | null>(null);
  const [stockType, setStockType] = useState<"IN" | "OUT" | "ADJUSTMENT">("IN");
  const [stockQty, setStockQty] = useState("");
  const [stockNotes, setStockNotes] = useState("");

  // ✅ Stock history drawer
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyProduct, setHistoryProduct] = useState<Product | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;

    const onScroll = () => setScrollTop(el.scrollTop);
    const onResize = () => setViewportH(el.clientHeight);

    onResize();
    el.addEventListener("scroll", onScroll, { passive: true });

    const ro = new ResizeObserver(() => onResize());
    ro.observe(el);

    return () => {
      el.removeEventListener("scroll", onScroll);
      ro.disconnect();
    };
  }, []);

  // Categories
  const categoriesQ = useQuery({
    queryKey: ["categories"],
    queryFn: fetchCategories,
    staleTime: 60_000,
  });
  const categories = (categoriesQ.data || []) as Category[];

  const categoryById = useMemo(() => {
    const m = new Map<string, Category>();
    for (const c of categories) m.set(c.id, c);
    return m;
  }, [categories]);

  const filteredCategoryOptions = useMemo(() => {
    const t = catQ.trim().toLowerCase();
    if (!t) return categories;
    return categories.filter((c) => String(c.name || "").toLowerCase().includes(t));
  }, [categories, catQ]);

  // Products
  const productsQ = useQuery({
    queryKey: ["products", { q: debouncedQ, activeOnly }],
    queryFn: () => listProducts({ q: debouncedQ, activeOnly, limit: 5000 }),
    staleTime: 25_000,
  });

  const rows = (productsQ.data || []) as Product[];

  // Lazy load category links
  const needLinks = showCategories || filterCategoryId !== "ALL";
  const productIdsKey = useMemo(() => rows.map((r) => r.id).join(","), [rows]);

  const linksQ = useQuery({
    queryKey: ["product_categories_links", productIdsKey],
    enabled: needLinks && rows.length > 0,
    queryFn: () => fetchProductCategoryLinks(rows.map((r) => r.id)),
    staleTime: 25_000,
  });

  const categoryIdsByProductId = useMemo(() => {
    const links = (linksQ.data || []) as ProductCategoryLink[];
    const m = new Map<number, string[]>();
    for (const l of links) {
      const arr = m.get(l.product_id) || [];
      arr.push(l.category_id);
      m.set(l.product_id, arr);
    }
    for (const [pid, arr] of m.entries()) m.set(pid, Array.from(new Set(arr)));
    return m;
  }, [linksQ.data]);

  // ✅ Stock history query (drawer only)
  const historyQ = useQuery({
    queryKey: ["stock_history", historyProduct?.id || 0],
    enabled: historyOpen && !!historyProduct?.id,
    queryFn: () => fetchStockHistory(Number(historyProduct?.id), 120),
    staleTime: 10_000,
  });
  const historyRows = (historyQ.data || []) as StockMovement[];

  // Mutations
  const createM = useMutation({
    mutationFn: (payload: ProductUpsert) => createProduct(payload),
    onError: (e: any) => toast.error(e?.message || "Failed to create product"),
  });

  const updateM = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: ProductUpsert }) => updateProduct(id, payload),
    onError: (e: any) => toast.error(e?.message || "Failed to update product"),
  });

  const activeM = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) => setProductActive(id, active),
    onSuccess: ({ is_active }) => {
      toast.success(is_active ? "Product activated" : "Product deactivated");
      qc.invalidateQueries({ queryKey: ["products"], exact: false });
    },
    onError: (e: any) => toast.error(e?.message || "Failed"),
  });

  // Sorting
  const [sort, setSort] = useState<{ key: "name" | "stock" | "price"; dir: "asc" | "desc" }>({
    key: "name",
    dir: "asc",
  });

  const toggleSort = (key: "name" | "stock" | "price") => {
    setSort((st) => {
      if (st.key === key) return { key, dir: st.dir === "asc" ? "desc" : "asc" };
      return { key, dir: "asc" };
    });
    if (listRef.current) listRef.current.scrollTop = 0;
    setScrollTop(0);
  };

  // Render rows
  const rendered = useMemo(() => {
    const filterId = filterCategoryId;

    const base = rows.map((p) => {
      const low = isLowStock(p);
      const stock = stockDisplay(p);
      const priceUnit = normalizePriceUnit((p as any).selling_price_unit);
      const catIds = needLinks ? categoryIdsByProductId.get(p.id) || [] : [];
      const reorder = n0((p as any).reorder_level);

      let stockN = 0;
      if (stock.unit === "WEIGHT") stockN = n0((p as any).current_stock_grams) / 1000;
      else stockN = n0((p as any).current_stock);

      return {
        p,
        low,
        stock,
        stockN,
        priceN: n0(p.selling_price),
        priceUnit,
        catIds,
        reorder,
      };
    });

    const filtered = base.filter((r) => {
      if (lowOnly && !r.low) return false;
      if (filterId !== "ALL") return r.catIds.includes(filterId);
      return true;
    });

    const dirMul = sort.dir === "asc" ? 1 : -1;
    filtered.sort((a, b) => {
      if (sort.key === "price") return (a.priceN - b.priceN) * dirMul;
      if (sort.key === "stock") return (a.stockN - b.stockN) * dirMul;
      return a.p.name.localeCompare(b.p.name) * dirMul;
    });

    return filtered;
  }, [rows, needLinks, categoryIdsByProductId, filterCategoryId, lowOnly, sort]);

  // KPIs
  const kpis = useMemo(() => {
    const total = rows.length;
    const low = rows.filter((p) => isLowStock(p)).length;
    const inactive = rows.filter((p) => !(p as any).is_active).length;
    return { total, low, inactive };
  }, [rows]);

  // Virtualization window
  const total = rendered.length;
  const totalH = Math.max(1, total * ROW_H);

  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
  const endIndex = Math.min(total, Math.ceil((scrollTop + viewportH) / ROW_H) + OVERSCAN);

  const slice = rendered.slice(startIndex, endIndex);

  const topPad = startIndex * ROW_H;
  const bottomPad = totalH - topPad - slice.length * ROW_H;

  // Dialog helpers
  const liveStockUnit: StockUnit = normalizeStockUnit(form.stock_unit);

  const liveUpb = Math.max(1, Math.trunc(n0(nInt(form.units_per_box) ?? 1)));
  const liveBoxes = Math.max(0, Math.trunc(n0(nInt(form.current_stock_boxes) ?? 0)));
  const liveUnits = Math.max(0, Math.trunc(n0(nInt(form.current_stock_units) ?? 0)));
  const livePcs = Math.max(0, liveBoxes * liveUpb + liveUnits);

  const liveKg = Math.max(0, Math.trunc(n0(nInt(form.current_stock_kg) ?? 0)));
  const liveG = Math.max(0, Math.trunc(n0(nInt(form.current_stock_g) ?? 0)));
  const liveGrams = Math.max(0, liveKg * 1000 + liveG);

  const liveBags = Math.max(0, Math.trunc(n0(nInt(form.current_stock_bags) ?? 0)));

  const pickerCats = useMemo(() => {
    const t = catPickQ.trim().toLowerCase();
    if (!t) return categories;
    return categories.filter((c) => String(c.name || "").toLowerCase().includes(t));
  }, [categories, catPickQ]);

  const selectedCatNames = useMemo(() => {
    const ids = (form.category_ids || []) as string[];
    return ids.map((id: string) => categoryById.get(id)?.name).filter(Boolean) as string[];
  }, [form.category_ids, categoryById]);

  function toggleCategory(catId: string) {
    setForm((prev: any) => {
      const set = new Set<string>((prev.category_ids || []).map((x: any) => String(x)));
      if (set.has(catId)) set.delete(catId);
      else set.add(catId);
      return { ...prev, category_ids: Array.from(set) };
    });
  }

  function openNew() {
    setEditing(null);
    setCatPickQ("");
    setForm({
      ...emptyForm,
      sku: genSku(),
      is_active: true,
      stock_unit: "PCS",
      selling_price_unit: "PCS",
      selling_price: "",
      cost_price: "",
      units_per_box: "",
      current_stock_boxes: "",
      current_stock_units: "",
      current_stock_kg: "",
      current_stock_g: "",
      current_stock_bags: "",
      reorder_level: "",
      category_ids: [],
    });
    setOpen(true);
  }

  function openEdit(p: Product) {
    const stock_unit: StockUnit = normalizeStockUnit((p as any).stock_unit);
    const selling_price_unit: PriceUnit =
      stock_unit === "WEIGHT"
        ? "KG"
        : stock_unit === "BAGS"
        ? "BAG"
        : normalizePriceUnit((p as any).selling_price_unit);

    const upb = Math.max(1, Math.trunc(n0(p.units_per_box ?? 1)));
    const pcsOrBags = Math.max(0, Math.trunc(n0((p as any).current_stock ?? 0)));
    const { boxes, units } = splitPcsToBoxUnits(pcsOrBags, upb);

    const grams = Math.max(0, Math.trunc(n0((p as any).current_stock_grams ?? 0)));
    const { kg, g } = splitGramsToKgG(grams);

    const catIds = (categoryIdsByProductId.get(p.id) || []) as string[];

    setEditing(p);
    setCatPickQ("");
    setForm({
      sku: p.sku || "",
      item_code: p.item_code ?? "",
      name: p.name || "",
      description: p.description ?? "",

      stock_unit,
      selling_price_unit,

      // PCS
      units_per_box: stock_unit === "PCS" ? (p.units_per_box ?? "") : "",
      current_stock_boxes: stock_unit === "PCS" ? String(boxes) : "",
      current_stock_units: stock_unit === "PCS" ? String(units) : "",

      // WEIGHT
      current_stock_kg: stock_unit === "WEIGHT" ? String(kg) : "",
      current_stock_g: stock_unit === "WEIGHT" ? String(g) : "",

      // BAGS
      current_stock_bags: stock_unit === "BAGS" ? String(pcsOrBags) : "",

      cost_price: p.cost_price ?? "",
      selling_price: p.selling_price ?? "",
      reorder_level: (p as any).reorder_level ?? "",
      is_active: !!(p as any).is_active,
      image_url: "",

      category_ids: catIds,
    });
    setOpen(true);
  }

  function openStockUpdate(p: Product) {
    setStockProduct(p);
    setStockType("IN");
    setStockQty("");
    setStockNotes("");
    setStockOpen(true);
  }

  function openHistory(p: Product) {
    setHistoryProduct(p);
    setHistoryOpen(true);
  }

  async function save() {
    const sku = s(form.sku) || genSku();
    const name = s(form.name);
    if (!name) return toast.error("Name is required");

    if (form.selling_price === "" || !Number.isFinite(Number(form.selling_price))) {
      return toast.error("Selling Price is required");
    }

    const stock_unit: StockUnit = normalizeStockUnit(form.stock_unit);

    if (stock_unit === "PCS") {
      const upb = nInt(form.units_per_box);
      const boxes = Math.max(0, nInt(form.current_stock_boxes) ?? 0);
      const units = Math.max(0, nInt(form.current_stock_units) ?? 0);

      if (boxes > 0 && (!upb || upb <= 0)) return toast.error("Units / Box is required when Stock Boxes is used");

      const safeUpb = Math.max(1, Math.trunc(n0(upb ?? 1)));
      if (units >= safeUpb) return toast.error(`Stock Units must be less than Units/Box (${safeUpb}).`);
    } else if (stock_unit === "WEIGHT") {
      const grams = Math.max(0, nInt(form.current_stock_g) ?? 0);
      if (grams >= 1000) return toast.error("Stock Grams must be less than 1000 (use Kg + Grams).");
    } else {
      const bags = Math.max(0, nInt(form.current_stock_bags) ?? 0);
      if (!Number.isFinite(bags) || bags < 0) return toast.error("Stock Bags is invalid.");
    }

    const payload = toPayload({ ...form, sku });

    try {
      if (editing) {
        await updateM.mutateAsync({ id: editing.id, payload });
        await syncProductCategories(editing.id, form.category_ids || []);
        toast.success("Saved");
      } else {
        const created = await createM.mutateAsync(payload);
        const newId = Number((created as any)?.id);
        if (Number.isFinite(newId) && newId > 0) {
          await syncProductCategories(newId, form.category_ids || []);
        } else {
          const { data, error } = await supabase.from("products").select("id").eq("sku", payload.sku).maybeSingle();
          if (!error && data?.id) await syncProductCategories(Number(data.id), form.category_ids || []);
        }
        toast.success("Product created");
      }

      await Promise.all([
        qc.invalidateQueries({ queryKey: ["products"], exact: false }),
        qc.invalidateQueries({ queryKey: ["product_categories_links"], exact: false }),
      ]);
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message || "Failed to save");
    }
  }

  // ✅ Manual Stock Update -> stock_movements
  async function applyStockUpdate() {
    if (!stockProduct) return;

    const qty = Number(stockQty);
    if (!Number.isFinite(qty) || qty === 0) return toast.error("Invalid quantity");

    const row = {
      product_id: stockProduct.id,
      movement_type: stockType,
      quantity: qty,
      reference: `MANUAL:${Date.now()}`,
      source_table: "manual",
      source_id: null,
      notes: s(stockNotes) || "Manual stock update",
    };

    const { error } = await supabase.from("stock_movements").insert(row);
    if (error) return toast.error(error.message);

    toast.success("Stock updated");
    setStockOpen(false);
    setStockQty("");
    setStockNotes("");
    const pid = stockProduct.id;
    setStockProduct(null);

    await Promise.all([
      qc.invalidateQueries({ queryKey: ["products"], exact: false }),
      qc.invalidateQueries({ queryKey: ["stock_history"], exact: false }),
    ]);

    if (historyOpen && historyProduct?.id === pid) historyQ.refetch();
  }

  /* =========================
     Export / Template (CSV + XLSX)
  ========================= */
  const exportHeader = useMemo(
    () => [
      "sku",
      "item_code",
      "name",
      "description",
      "stock_unit",
      "units_per_box",
      "current_stock",
      "current_stock_grams",
      "selling_price",
      "selling_price_unit",
      "cost_price",
      "reorder_level",
      "is_active",
    ],
    []
  );

  const exportRows = useMemo(() => {
    return rows.map((p) => [
      p.sku || "",
      p.item_code || "",
      p.name || "",
      p.description || "",
      (p as any).stock_unit || "PCS",
      p.units_per_box ?? "",
      (p as any).current_stock ?? 0,
      (p as any).current_stock_grams ?? 0,
      p.selling_price ?? 0,
      (p as any).selling_price_unit ?? "PCS",
      p.cost_price ?? "",
      (p as any).reorder_level ?? "",
      (p as any).is_active ? "TRUE" : "FALSE",
    ]);
  }, [rows]);

  const exportCsv = () => {
    if (!rows.length) return toast.error("No stock items to export");
    downloadCsv("stock-items.csv", exportHeader, exportRows);
    toast.success("Downloaded stock-items.csv");
  };

  const exportExcel = () => {
    if (!rows.length) return toast.error("No stock items to export");
    downloadXlsx("stock-items.xlsx", "StockItems", exportHeader, exportRows);
    toast.success("Downloaded stock-items.xlsx");
  };

  const templateRows = useMemo(
    () => [
      ["", "ITEM-PCS-001", "Sample Lamp", "Lamp - PCS example", "PCS", "20", "30", "0", "120", "PCS", "80", "30", "TRUE"],
      ["", "ITEM-KG-001", "Sample Cement (Bulk)", "WEIGHT example", "WEIGHT", "", "0", "5250", "180", "KG", "130", "2", "TRUE"],
      ["", "ITEM-BAG-001", "Sample Cement Bag 50kg", "BAGS example", "BAGS", "", "25", "0", "260", "BAG", "210", "10", "TRUE"],
    ],
    []
  );

  const downloadTemplateCsv = () => {
    downloadCsv("stock-import-template.csv", exportHeader, templateRows);
    toast.success("Downloaded template CSV");
  };

  const downloadTemplateExcel = () => {
    downloadXlsx("stock-import-template.xlsx", "Template", exportHeader, templateRows);
    toast.success("Downloaded template XLSX");
  };

  /* =========================
     Import Excel / CSV (hardened)
     - template columns
     - upsert by sku
  ========================= */
  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    // basic guardrails (admin imports only)
    const maxMB = 8;
    if (file.size > maxMB * 1024 * 1024) {
      return toast.error(`File too large. Max ${maxMB}MB.`);
    }

    const nameLower = (file.name || "").toLowerCase();
    const isCsv = nameLower.endsWith(".csv");

    try {
      let wb: XLSX.WorkBook;

      if (isCsv) {
        const text = await file.text();
        // safer parsing: no formulas, minimal extras
        wb = XLSX.read(text, {
          type: "string",
          cellFormula: false,
          cellNF: false,
          cellText: true,
          dense: true,
        } as any);
      } else {
        const buf = await file.arrayBuffer();
        wb = XLSX.read(buf, {
          type: "array",
          cellFormula: false,
          cellNF: false,
          cellText: true,
          dense: true,
        } as any);
      }

      const firstSheet = wb.SheetNames?.[0];
      if (!firstSheet) return toast.error("No sheets found");

      const ws = wb.Sheets[firstSheet];
      const json: any[] = XLSX.utils.sheet_to_json(ws, { defval: "", raw: true });

      if (!json.length) return toast.error("Empty file");

      // normalize column keys (support user capitalization)
      const normKey = (k: any) => String(k ?? "").trim().toLowerCase();

      let ok = 0;
      let fail = 0;
      const hardFailRows: number[] = [];

      for (let i = 0; i < json.length; i++) {
        const src = json[i] || {};
        const row: any = {};
        for (const k of Object.keys(src)) row[normKey(k)] = src[k];

        const productName = s(row.name);
        if (!productName) {
          fail++;
          hardFailRows.push(i + 2); // +2 = header row + 1-based data row
          continue;
        }

        const payload: any = {
          sku: s(row.sku) || genSku(),
          item_code: s(row.item_code) || null,
          name: productName,
          description: s(row.description) || "",

          stock_unit: normalizeStockUnit(row.stock_unit),
          units_per_box: row.units_per_box === "" ? null : nInt(row.units_per_box),

          current_stock: Math.max(0, n0(row.current_stock)),
          current_stock_grams: Math.max(0, n0(row.current_stock_grams)),

          selling_price: Math.max(0, n0(row.selling_price)),
          selling_price_unit: normalizePriceUnit(row.selling_price_unit),

          cost_price:
            row.cost_price === ""
              ? null
              : Number.isFinite(Number(row.cost_price))
              ? Number(row.cost_price)
              : null,

          reorder_level: row.reorder_level === "" ? null : Math.max(0, nInt(row.reorder_level) ?? 0),

          is_active: String(row.is_active).toUpperCase() === "FALSE" ? false : true,
          image_url: "",
        };

        // enforce unit rules
        if (payload.stock_unit === "WEIGHT") {
          payload.current_stock = 0;
          payload.selling_price_unit = "KG";
          payload.units_per_box = null;
        } else if (payload.stock_unit === "BAGS") {
          payload.current_stock_grams = 0;
          payload.selling_price_unit = "BAG";
          payload.units_per_box = null;
        } else {
          payload.current_stock_grams = 0;
          payload.selling_price_unit = payload.selling_price_unit === "KG" ? "KG" : "PCS";
        }

        const { error } = await supabase.from("products").upsert(payload, { onConflict: "sku" });

        if (error) {
          fail++;
          hardFailRows.push(i + 2);
          continue;
        }
        ok++;
      }

      if (hardFailRows.length) {
        toast.success(`Imported: ${ok} • Failed: ${fail} (rows: ${hardFailRows.slice(0, 8).join(", ")}${hardFailRows.length > 8 ? "…" : ""})`);
      } else {
        toast.success(`Imported: ${ok}`);
      }

      qc.invalidateQueries({ queryKey: ["products"], exact: false });
      qc.invalidateQueries({ queryKey: ["product_categories_links"], exact: false });
    } catch (err: any) {
      toast.error(err?.message || "Import failed");
    }
  }

  const scrollToTop = () => {
    if (listRef.current) listRef.current.scrollTop = 0;
    setScrollTop(0);
  };
  const scrollToBottom = () => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  };

  // ✅ animated LOW pill + row pulse
  const Row = useCallback(
    ({ r }: { r: (typeof rendered)[number]; index: number }) => {
      const p = r.p;
      const ref = (p.item_code || p.sku || "-").toString();

      const catIds = r.catIds || [];
      const catNames = catIds
        .map((id: string) => categoryById.get(id)?.name)
        .filter(Boolean)
        .slice(0, 3) as string[];
      const catMore = Math.max(0, catIds.length - catNames.length);

      return (
        <div
          className={`group grid items-center gap-3 rounded-2xl border bg-white px-4 py-3 shadow-sm hover:shadow-md hover:border-slate-200 transition relative ${
            r.low ? "ring-1 ring-amber-500/25" : ""
          }`}
          style={{
            gridTemplateColumns: "92px 1.3fr 0.9fr 0.7fr 0.7fr 128px",
            height: ROW_H - 10,
          }}
          title="Double click to edit"
          onDoubleClick={() => openEdit(p)}
        >
          {/* soft pulse */}
          {r.low ? (
            <div className="pointer-events-none absolute inset-0 rounded-2xl overflow-hidden">
              <div className="absolute inset-0 bg-amber-400/10 animate-[pulse_1.6s_ease-in-out_infinite]" />
            </div>
          ) : null}

          {/* Status + Ref */}
          <div className="min-w-0 relative">
            <div className="flex items-center gap-2">
              <Pill tone={(p as any).is_active ? "ok" : "bad"}>{(p as any).is_active ? "ACTIVE" : "INACTIVE"}</Pill>

              {r.low ? (
                <div className="relative inline-flex items-center">
                  <span className="absolute -inset-1 rounded-full bg-amber-400/20 blur-sm animate-[ping_1.2s_cubic-bezier(0,0,0.2,1)_infinite]" />
                  <span className="relative inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    LOW
                  </span>
                </div>
              ) : null}
            </div>
            <div className="mt-2 text-xs font-semibold text-slate-700 truncate">{ref}</div>
          </div>

          {/* Name */}
          <div className="min-w-0 relative">
            <div className="font-semibold text-slate-900 truncate">{p.name}</div>
            {p.description ? <div className="mt-0.5 text-xs text-slate-500 line-clamp-1">{p.description}</div> : null}
            <div className="mt-1 text-[11px] text-slate-500">
              Type: <b className="text-slate-700">{r.stock.unit}</b>
            </div>
          </div>

          {/* Categories */}
          <div className="min-w-0 relative">
            {showCategories ? (
              catIds.length ? (
                <div className="flex flex-wrap gap-1">
                  {catNames.map((nm) => (
                    <span key={nm} className="inline-flex rounded-full border bg-white px-2 py-0.5 text-[11px] text-slate-700">
                      {nm}
                    </span>
                  ))}
                  {catMore > 0 ? (
                    <span className="inline-flex rounded-full border bg-white px-2 py-0.5 text-[11px] text-slate-700">
                      +{catMore}
                    </span>
                  ) : null}
                </div>
              ) : (
                <span className="text-xs text-slate-400">—</span>
              )
            ) : (
              <span className="text-xs text-slate-400">Hidden</span>
            )}
          </div>

          {/* Stock */}
          <div className="text-right relative">
            <div className="font-extrabold text-slate-900">{r.stock.primary}</div>
            <div className="text-[11px] text-slate-500">{r.stock.secondary}</div>
            {r.reorder ? (
              <div className="text-[11px] text-slate-500">
                Reorder: <b className={r.low ? "text-amber-800" : "text-slate-700"}>{r.reorder}</b>
                {r.stock.unit === "WEIGHT" ? " kg" : ""}
              </div>
            ) : (
              <div className="text-[11px] text-slate-400">No reorder level</div>
            )}
          </div>

          {/* Price */}
          <div className="text-right relative">
            <div className="font-extrabold text-slate-900">
              Rs {money(p.selling_price)} <span className="text-xs text-slate-500">/ {r.priceUnit}</span>
            </div>
            <div className="text-[11px] text-slate-500">Cost: {money(p.cost_price)}</div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 relative">
            <Button
              variant="outline"
              className="h-9 rounded-xl px-3"
              onClick={(e) => {
                e.stopPropagation();
                openHistory(p);
              }}
              title="View stock movements"
            >
              <History className="h-4 w-4" />
            </Button>

            <Button
              variant={r.low ? "default" : "outline"}
              className={`h-9 rounded-xl px-3 ${r.low ? "shadow-sm" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                openStockUpdate(p);
              }}
              title="Manual stock update"
            >
              <ArrowUpRight className="h-4 w-4" />
            </Button>

            <div className="flex items-center pl-1">
              <Switch
                checked={!!(p as any).is_active}
                onCheckedChange={(v) => activeM.mutate({ id: p.id, active: !!v })}
                disabled={activeM.isPending}
              />
            </div>
          </div>
        </div>
      );
    },
    [activeM, categoryById, openEdit, showCategories]
  );

  return (
    <div className="space-y-5 pb-10">
      {/* page-local styles for pulse */}
      <style>{`
        @keyframes ping { 75%, 100% { transform: scale(2); opacity: 0; } }
      `}</style>

      {/* HEADER */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-primary/10 border flex items-center justify-center">
              <Package className="h-5 w-5 text-primary" />
            </div>
            <div>
              <div className="text-2xl font-semibold tracking-tight">Stock</div>
              <div className="text-xs text-muted-foreground">
                Ultra-fast register • Low-stock pulse • Manual update • Excel import/export • Template XLSX
              </div>
            </div>
          </div>

          {/* KPIs */}
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat icon={<Package className="h-4 w-4 text-muted-foreground" />} label="Total items" value={kpis.total} />
            <Stat icon={<AlertTriangle className="h-4 w-4 text-amber-700" />} label="Low stock" value={kpis.low} tone="warn" />
            <Stat icon={<X className="h-4 w-4 text-red-700" />} label="Inactive" value={kpis.inactive} tone="bad" />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => productsQ.refetch()} disabled={productsQ.isFetching}>
            <RefreshCw className={`h-4 w-4 mr-2 ${productsQ.isFetching ? "animate-spin" : ""}`} />
            {productsQ.isFetching ? "Refreshing…" : "Refresh"}
          </Button>

          {/* Template XLSX */}
          <Button variant="outline" onClick={downloadTemplateExcel} title="Download Excel template">
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Template XLSX
          </Button>

          {/* (Optional) Template CSV */}
          <Button variant="outline" onClick={downloadTemplateCsv} title="Download CSV template">
            <Download className="h-4 w-4 mr-2" />
            Template CSV
          </Button>

          {/* Import */}
          <Button
            variant="outline"
            onClick={() => document.getElementById("stock-import-file")?.click()}
            title="Import Excel/CSV (template format)"
          >
            <Upload className="h-4 w-4 mr-2" />
            Import
          </Button>
          <input id="stock-import-file" type="file" accept=".csv,.xlsx" className="hidden" onChange={handleImportFile} />

          {/* Export XLSX */}
          <Button variant="outline" onClick={exportExcel} disabled={!rows.length} title="Export Excel (.xlsx)">
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Export XLSX
          </Button>

          {/* (Optional) Export CSV */}
          <Button variant="outline" onClick={exportCsv} disabled={!rows.length} title="Export CSV">
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>

          <Button className="gradient-primary shadow-glow text-primary-foreground" onClick={openNew}>
            <Plus className="h-4 w-4 mr-2" />
            New Product
          </Button>
        </div>
      </div>

      {/* FILTERS */}
      <Card className="p-4 rounded-2xl shadow-premium">
        <div className="grid gap-3 lg:grid-cols-[1fr_380px_auto] lg:items-center">
          <div className="relative">
            <Search className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <Input className="pl-9" placeholder="Search: SKU, item code, name…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="flex items-center justify-between rounded-2xl border bg-white px-3 py-2">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-800">Low stock only</div>
                <div className="text-[11px] text-slate-500">Show items at/below reorder</div>
              </div>
              <Switch checked={lowOnly} onCheckedChange={(v) => setLowOnly(!!v)} />
            </div>

            <div className="flex items-center justify-between rounded-2xl border bg-white px-3 py-2">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-800">Active only</div>
                <div className="text-[11px] text-slate-500">Hide inactive items</div>
              </div>
              <Switch checked={activeOnly} onCheckedChange={(v) => setActiveOnly(!!v)} />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" className="h-10 rounded-xl" onClick={() => toggleSort("name")} title="Sort by name">
              Name{" "}
              {sort.key === "name" ? (sort.dir === "asc" ? <ChevronUp className="h-4 w-4 ml-2" /> : <ChevronDown className="h-4 w-4 ml-2" />) : null}
            </Button>
            <Button variant="outline" className="h-10 rounded-xl" onClick={() => toggleSort("stock")} title="Sort by stock">
              Stock{" "}
              {sort.key === "stock" ? (sort.dir === "asc" ? <ChevronUp className="h-4 w-4 ml-2" /> : <ChevronDown className="h-4 w-4 ml-2" />) : null}
            </Button>
            <Button variant="outline" className="h-10 rounded-xl" onClick={() => toggleSort("price")} title="Sort by price">
              Price{" "}
              {sort.key === "price" ? (sort.dir === "asc" ? <ChevronUp className="h-4 w-4 ml-2" /> : <ChevronDown className="h-4 w-4 ml-2" />) : null}
            </Button>
          </div>
        </div>

        {/* Category controls */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-2xl border bg-white px-3 py-2">
              <Layers className="h-4 w-4 text-muted-foreground" />
              <div className="text-xs font-semibold text-slate-800">Show categories</div>
              <Switch checked={showCategories} onCheckedChange={(v) => setShowCategories(!!v)} />
            </div>

            <div className="text-xs text-muted-foreground">
              Showing <b>{rendered.length}</b> item(s)
              {filterCategoryId !== "ALL" ? (
                <>
                  {" "}
                  • Category: <b>{categoryById.get(filterCategoryId)?.name || "—"}</b>
                </>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Input className="h-9 w-[220px]" placeholder="Search categories…" value={catQ} onChange={(e) => setCatQ(e.target.value)} disabled={categoriesQ.isLoading} />
            <select
              className="h-9 rounded-xl border px-3 bg-white"
              value={filterCategoryId}
              onChange={(e) => setFilterCategoryId(e.target.value as any)}
              disabled={categoriesQ.isLoading}
              title={categoriesQ.isLoading ? "Loading categories…" : ""}
            >
              <option value="ALL">All Categories</option>
              {filteredCategoryOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {/* LIST (VIRTUALIZED) */}
      <Card className="p-0 overflow-hidden rounded-2xl shadow-premium">
        {/* Sticky header */}
        <div className="sticky top-0 z-20 border-b bg-white/90 backdrop-blur px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">
              Stock Register{" "}
              <span className="ml-2 text-xs text-muted-foreground">
                {productsQ.isLoading ? "Loading…" : `${rows.length} product(s)`}
                {needLinks && linksQ.isFetching ? " • syncing categories…" : ""}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" className="h-8 rounded-xl" onClick={scrollToTop} title="Top">
                <ChevronUp className="h-4 w-4 mr-1" />
                Top
              </Button>
              <Button variant="outline" className="h-8 rounded-xl" onClick={scrollToBottom} title="Bottom">
                <ChevronDown className="h-4 w-4 mr-1" />
                Bottom
              </Button>
            </div>
          </div>

          {/* Column labels */}
          <div
            className="mt-3 grid gap-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500"
            style={{ gridTemplateColumns: "92px 1.3fr 0.9fr 0.7fr 0.7fr 128px" }}
          >
            <div>Status</div>
            <div>Description</div>
            <div>Categories</div>
            <div className="text-right">Stock</div>
            <div className="text-right">Price</div>
            <div className="text-right">Actions</div>
          </div>
        </div>

        {/* Scroll container */}
        <div ref={listRef} className="h-[68vh] overflow-auto bg-slate-50/40 p-4">
          {productsQ.isLoading ? (
            <div className="rounded-2xl border bg-white p-8 text-sm text-muted-foreground">Loading stock items…</div>
          ) : rendered.length === 0 ? (
            <div className="rounded-2xl border bg-white p-10 text-center">
              <div className="text-base font-semibold text-slate-800">No items found</div>
              <div className="text-sm text-slate-500 mt-1">Try clearing filters or searching another keyword.</div>
            </div>
          ) : (
            <div style={{ height: totalH, position: "relative" }}>
              {topPad > 0 ? <div style={{ height: topPad }} /> : null}

              <div className="space-y-3">
                {slice.map((r, i) => (
                  <Row key={r.p.id} r={r} index={startIndex + i} />
                ))}
              </div>

              {bottomPad > 0 ? <div style={{ height: bottomPad }} /> : null}
            </div>
          )}
        </div>

        <div className="border-t px-4 py-3 text-xs text-muted-foreground bg-white">
          Smooth mode: virtualized list (fast). PCS/BAGS use <b>current_stock</b>; WEIGHT uses <b>current_stock_grams</b>. Manual updates write to <b>stock_movements</b>.
        </div>
      </Card>

      {/* STOCK HISTORY DRAWER */}
      <DrawerShell
        open={historyOpen}
        onClose={() => {
          setHistoryOpen(false);
          setHistoryProduct(null);
        }}
        title={
          <span className="inline-flex items-center gap-2">
            <History className="h-4 w-4" />
            {historyProduct?.name || "Stock History"}
          </span>
        }
      >
        {historyQ.isLoading ? (
          <div className="rounded-2xl border bg-white p-4 text-sm text-muted-foreground">Loading history…</div>
        ) : historyRows.length === 0 ? (
          <div className="rounded-2xl border bg-white p-5 text-sm text-muted-foreground">No stock movements yet.</div>
        ) : (
          <div className="space-y-2">
            {historyRows.map((m) => (
              <div key={m.id} className="rounded-2xl border bg-white p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Pill tone={m.movement_type === "IN" ? "ok" : m.movement_type === "OUT" ? "bad" : "warn"}>
                        {m.movement_type}
                      </Pill>
                      <div className="text-xs text-slate-600">{fmtDateTime(m.movement_date)}</div>
                    </div>

                    <div className="mt-1 text-sm font-extrabold text-slate-900">
                      Qty: {Number(m.quantity).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                    </div>

                    <div className="mt-1 text-[11px] text-slate-500">
                      Ref: <b className="text-slate-700">{m.reference || "—"}</b> • Source:{" "}
                      <b className="text-slate-700">{m.source_table || "—"}</b>
                      {m.source_id ? <> #{m.source_id}</> : null}
                    </div>

                    {m.notes ? <div className="mt-2 text-xs text-slate-600">{m.notes}</div> : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </DrawerShell>

      {/* UPDATE STOCK DIALOG */}
      <Dialog open={stockOpen} onOpenChange={setStockOpen}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle>Update Stock</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="text-sm font-semibold">{stockProduct?.name}</div>

            <select className="w-full h-10 rounded-xl border px-3" value={stockType} onChange={(e) => setStockType(e.target.value as any)}>
              <option value="IN">Stock In</option>
              <option value="OUT">Stock Out</option>
              <option value="ADJUSTMENT">Adjustment</option>
            </select>

            <Input placeholder="Quantity (e.g. 10)" inputMode="decimal" value={stockQty} onChange={(e) => setStockQty(e.target.value)} />
            <Input placeholder="Notes (optional)" value={stockNotes} onChange={(e) => setStockNotes(e.target.value)} />

            <Button className="w-full" onClick={applyStockUpdate}>
              Apply
            </Button>

            <div className="text-[11px] text-muted-foreground">
              This creates a <b>stock_movements</b> entry. Your trigger updates product stock automatically.
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* CREATE / EDIT DIALOG */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[95vw] max-w-lg p-0 overflow-hidden rounded-3xl">
          <div className="p-5 border-b bg-gradient-to-r from-background to-muted/20">
            <DialogHeader>
              <DialogTitle className="text-base">{editing ? "Edit Product" : "New Product"}</DialogTitle>
            </DialogHeader>
          </div>

          <div className="max-h-[72vh] overflow-auto p-5">
            <div className="grid gap-3">
              <Input placeholder="SKU (auto)" value={form.sku} readOnly className="bg-muted/30" />

              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="Item Code" value={form.item_code ?? ""} onChange={(e) => setForm({ ...form, item_code: e.target.value })} />
                <Input
                  placeholder={liveStockUnit === "WEIGHT" ? "Reorder Level (KG)" : "Reorder Level"}
                  inputMode="numeric"
                  value={String(form.reorder_level ?? "")}
                  onChange={(e) => setForm({ ...form, reorder_level: e.target.value })}
                />
              </div>

              <Input placeholder="Name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <Input placeholder="Description" value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} />

              {/* Categories multi-select */}
              <div className="space-y-2 rounded-2xl border bg-white p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs text-muted-foreground">Categories (multi-select)</div>
                  <div className="text-[11px] text-muted-foreground">
                    Selected: <b>{(form.category_ids || []).length}</b>
                  </div>
                </div>

                <Input placeholder="Filter categories…" value={catPickQ} onChange={(e) => setCatPickQ(e.target.value)} />

                {selectedCatNames.length ? (
                  <div className="flex flex-wrap gap-1">
                    {(form.category_ids || []).slice(0, 10).map((id: string) => {
                      const nm = categoryById.get(id)?.name || id;
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => toggleCategory(id)}
                          className="inline-flex items-center gap-1 rounded-full border bg-white px-2 py-0.5 text-[11px] text-slate-700 hover:bg-slate-50"
                          title="Click to remove"
                        >
                          {nm} <span className="text-slate-400">×</span>
                        </button>
                      );
                    })}
                    {(form.category_ids || []).length > 10 ? (
                      <span className="text-[11px] text-muted-foreground">+{(form.category_ids || []).length - 10} more</span>
                    ) : null}
                  </div>
                ) : (
                  <div className="text-[11px] text-muted-foreground">No categories selected.</div>
                )}

                <div className="max-h-44 overflow-auto rounded-xl border bg-white">
                  {categoriesQ.isLoading ? (
                    <div className="p-3 text-xs text-muted-foreground">Loading categories…</div>
                  ) : pickerCats.length === 0 ? (
                    <div className="p-3 text-xs text-muted-foreground">No categories found.</div>
                  ) : (
                    <div className="divide-y">
                      {pickerCats.map((c) => {
                        const checked = (form.category_ids || []).includes(c.id);
                        return (
                          <label key={c.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-slate-50">
                            <input type="checkbox" checked={checked} onChange={() => toggleCategory(c.id)} />
                            <span className="font-medium">{c.name}</span>
                            {c.description ? <span className="text-xs text-muted-foreground line-clamp-1">{c.description}</span> : null}
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="flex justify-end">
                  <Button type="button" variant="outline" className="h-8 px-3 text-xs" onClick={() => setForm((p: any) => ({ ...p, category_ids: [] }))}>
                    Clear categories
                  </Button>
                </div>
              </div>

              {/* Stock unit selector */}
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Stock Type</div>
                <select
                  className="h-10 rounded-xl border px-3 bg-white w-full"
                  value={form.stock_unit}
                  onChange={(e) => {
                    const v: StockUnit =
                      e.target.value === "WEIGHT" ? "WEIGHT" : e.target.value === "BAGS" ? "BAGS" : "PCS";

                    setForm((prev: any) => ({
                      ...prev,
                      stock_unit: v,
                      selling_price_unit: v === "WEIGHT" ? "KG" : v === "BAGS" ? "BAG" : "PCS",
                      ...(v === "WEIGHT"
                        ? { units_per_box: "", current_stock_boxes: "", current_stock_units: "", current_stock_bags: "" }
                        : v === "BAGS"
                        ? { units_per_box: "", current_stock_boxes: "", current_stock_units: "", current_stock_kg: "", current_stock_g: "" }
                        : { current_stock_kg: "", current_stock_g: "", current_stock_bags: "" }),
                    }));
                  }}
                >
                  <option value="PCS">PCS (Boxes + Units)</option>
                  <option value="BAGS">BAGS (Bag count)</option>
                  <option value="WEIGHT">WEIGHT (Kg + Grams)</option>
                </select>
              </div>

              {/* Price unit */}
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Selling Price Unit</div>
                <select
                  className="h-10 rounded-xl border px-3 bg-white w-full"
                  value={form.selling_price_unit}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      selling_price_unit: e.target.value === "KG" ? "KG" : e.target.value === "BAG" ? "BAG" : "PCS",
                    })
                  }
                  disabled={liveStockUnit === "WEIGHT" || liveStockUnit === "BAGS"}
                  title={
                    liveStockUnit === "WEIGHT"
                      ? "Weight items use price per KG"
                      : liveStockUnit === "BAGS"
                      ? "Bag items use price per BAG"
                      : ""
                  }
                >
                  <option value="PCS">PCS</option>
                  <option value="BAG">BAG</option>
                  <option value="KG">KG</option>
                </select>
                {liveStockUnit === "WEIGHT" ? (
                  <div className="text-[11px] text-muted-foreground">Weight items use price per KG.</div>
                ) : liveStockUnit === "BAGS" ? (
                  <div className="text-[11px] text-muted-foreground">Bag items use price per BAG.</div>
                ) : null}
              </div>

              {/* STOCK ENTRY */}
              {liveStockUnit === "PCS" ? (
                <div className="space-y-2 rounded-2xl border bg-white p-3">
                  <div className="text-xs text-muted-foreground">PCS Stock Entry</div>

                  <Input
                    placeholder="Units / Box (e.g. 20)"
                    inputMode="numeric"
                    value={String(form.units_per_box ?? "")}
                    onChange={(e) => {
                      const v = e.target.value;
                      setForm((prev: any) => {
                        const next = { ...prev, units_per_box: v };
                        const upb = Math.max(1, Math.trunc(n0(nInt(v) ?? 1)));
                        const units = Math.max(0, Math.trunc(n0(nInt(next.current_stock_units) ?? 0)));
                        if (units >= upb) next.current_stock_units = String(Math.max(0, upb - 1));
                        return next;
                      });
                    }}
                  />

                  <div className="grid grid-cols-2 gap-2">
                    <Input placeholder="Stock Boxes" inputMode="numeric" value={String(form.current_stock_boxes ?? "")} onChange={(e) => setForm({ ...form, current_stock_boxes: e.target.value })} />
                    <Input placeholder="Stock Units" inputMode="numeric" value={String(form.current_stock_units ?? "")} onChange={(e) => setForm({ ...form, current_stock_units: e.target.value })} />
                  </div>

                  <div className="text-[11px] text-muted-foreground">
                    Preview: <b>{liveBoxes}</b> box + <b>{liveUnits}</b> unit @ <b>{liveUpb}</b> UPB = <b>{livePcs}</b> pcs (saved)
                  </div>
                </div>
              ) : null}

              {liveStockUnit === "WEIGHT" ? (
                <div className="space-y-2 rounded-2xl border bg-white p-3">
                  <div className="text-xs text-muted-foreground">WEIGHT Stock Entry</div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input placeholder="Stock Kg" inputMode="numeric" value={String(form.current_stock_kg ?? "")} onChange={(e) => setForm({ ...form, current_stock_kg: e.target.value })} />
                    <Input placeholder="Stock Grams" inputMode="numeric" value={String(form.current_stock_g ?? "")} onChange={(e) => setForm({ ...form, current_stock_g: e.target.value })} />
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Preview: <b>{liveKg}</b> kg + <b>{liveG}</b> g = <b>{liveGrams}</b> grams (saved)
                  </div>
                </div>
              ) : null}

              {liveStockUnit === "BAGS" ? (
                <div className="space-y-2 rounded-2xl border bg-white p-3">
                  <div className="text-xs text-muted-foreground">BAGS Stock Entry</div>
                  <Input placeholder="Stock Bags (e.g. 25)" inputMode="numeric" value={String(form.current_stock_bags ?? "")} onChange={(e) => setForm({ ...form, current_stock_bags: e.target.value })} />
                  <div className="text-[11px] text-muted-foreground">
                    Preview: <b>{liveBags}</b> bag(s) (saved)
                  </div>
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder={liveStockUnit === "WEIGHT" ? "Selling Price / KG *" : liveStockUnit === "BAGS" ? "Selling Price / BAG *" : "Selling Price / PCS *"}
                  inputMode="decimal"
                  value={String(form.selling_price ?? "")}
                  onChange={(e) => setForm({ ...form, selling_price: e.target.value })}
                />
                <Input placeholder="Cost Price" inputMode="decimal" value={String(form.cost_price ?? "")} onChange={(e) => setForm({ ...form, cost_price: e.target.value })} />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <Switch checked={!!form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: !!v })} />
                <span className="text-sm text-muted-foreground">Active</span>
              </div>
            </div>
          </div>

          <div className="border-t p-4 flex justify-end gap-2 bg-white">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button className="gradient-primary shadow-glow text-primary-foreground" onClick={save} disabled={createM.isPending || updateM.isPending}>
              {editing ? (updateM.isPending ? "Saving…" : "Save") : createM.isPending ? "Creating…" : "Create"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
