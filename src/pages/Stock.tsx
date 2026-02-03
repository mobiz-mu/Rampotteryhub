// src/pages/Stock.tsx
import React, { useMemo, useRef, useState } from "react";
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

/* =========================
   Helpers
========================= */
function money(v: any) {
  if (v === null || v === undefined || v === "") return "-";
  const n = Number(v);
  if (!Number.isFinite(n)) return "-";
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function n0(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function nInt(v: any) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}
function s(v: any) {
  return String(v ?? "").trim();
}
function parseBool(v: any, defaultValue = true) {
  if (typeof v === "boolean") return v;
  const t = String(v ?? "").trim().toLowerCase();
  if (!t) return defaultValue;
  if (["1", "true", "yes", "y", "active"].includes(t)) return true;
  if (["0", "false", "no", "n", "inactive"].includes(t)) return false;
  return defaultValue;
}
function extFromName(name: string) {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "png";
}
function uid() {
  try {
    return crypto.randomUUID();
  } catch {
    return String(Date.now()) + "-" + Math.random().toString(16).slice(2);
  }
}
function isImageLike(file: File) {
  return file.type?.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name);
}

const BUCKET = "product-images";
const PREVIEW_SIZE = 72; // square (1:1) preview feel

/** Upload file to Supabase Storage and return public URL */
async function uploadProductImage(args: { productId: number; file: File }) {
  const { productId, file } = args;

  const ext = extFromName(file.name);
  const path = `products/${productId}/${uid()}.${ext}`;

  const up = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || undefined,
  });

  if (up.error) throw new Error(up.error.message);

  // Public URL (bucket must be public)
  const pub = supabase.storage.from(BUCKET).getPublicUrl(path);
  const publicUrl = pub?.data?.publicUrl;
  if (!publicUrl) throw new Error("Upload succeeded but public URL not generated");

  return { publicUrl, path };
}

const emptyForm: ProductUpsert = {
  sku: "",
  item_code: "",
  name: "",
  description: "",
  units_per_box: null,
  cost_price: null,
  selling_price: 0,
  current_stock: 0,
  reorder_level: null,
  is_active: true,
  image_url: "",
};

type ExcelRowAny = Record<string, any>;
function pick(r: ExcelRowAny, keys: string[]) {
  for (const k of keys) if (r[k] !== undefined) return r[k];
  return undefined;
}
function normalizeExcelRow(r: ExcelRowAny): ProductUpsert {
  const productRef = s(
    pick(r, ["Product Ref", "Product Ref:", "product_ref", "item_code", "Item Code", "ITEM CODE", "Ref", "REF"]) ?? ""
  );

  const sku = s(pick(r, ["SKU", "sku"]) ?? "") || productRef;
  const item_code = s(pick(r, ["Item Code", "item_code"]) ?? "") || productRef || "";

  const name =
    s(pick(r, ["Product Description", "Product Description (Name)", "name", "Name"]) ?? "") || "Unnamed product";

  const description = s(pick(r, ["Description", "description", "Details"]) ?? "");

  const units_per_box = pick(r, ["Units / Box", "Units/Box", "units_per_box", "UPB", "Units Per Box"]);
  const selling_price = pick(r, ["Price  / Pcs (Rs)", "Price / Pcs (Rs)", "Price", "selling_price", "SELLING PRICE"]);

  const cost_price = pick(r, ["Cost Price", "cost_price", "COST"]);
  const current_stock = pick(r, ["Current Stock", "current_stock", "STOCK"]);
  const reorder_level = pick(r, ["Reorder Level", "reorder_level", "REORDER"]);

  const image_url = s(pick(r, ["Product Image", "Product Image (URL)", "Image", "image_url", "IMAGE URL"]) ?? "");
  const is_active = parseBool(pick(r, ["Active", "is_active", "ACTIVE"]), true);

  return {
    ...emptyForm,
    sku,
    item_code: item_code || null,
    name,
    description,
    units_per_box: units_per_box === "" ? null : nInt(units_per_box),
    selling_price: Math.max(0, n0(selling_price)),
    cost_price: cost_price === "" ? null : n0(cost_price),
    current_stock: Math.max(0, nInt(current_stock) ?? 0),
    reorder_level: reorder_level === "" ? null : Math.max(0, nInt(reorder_level) ?? 0),
    image_url,
    is_active,
  };
}

function downloadTemplateXlsx() {
  const sheetRows = [
    {
      SN: 1,
      "Product Ref": "ITEM-001",
      SKU: "SKU-001",
      "Product Image": "https://example.com/image.jpg",
      "Product Description": "Sample Product Name",
      "Units / Box": 12,
      "Price / Pcs (Rs)": 45.0,
      Description: "Optional long description",
      "Cost Price": 30.0,
      "Current Stock": 100,
      "Reorder Level": 30,
      Active: "TRUE",
    },
  ];

  const ws = XLSX.utils.json_to_sheet(sheetRows);
  ws["!cols"] = [
    { wch: 6 },
    { wch: 16 },
    { wch: 16 },
    { wch: 40 },
    { wch: 30 },
    { wch: 12 },
    { wch: 16 },
    { wch: 40 },
    { wch: 12 },
    { wch: 14 },
    { wch: 14 },
    { wch: 10 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "StockTemplate");
  XLSX.writeFile(wb, "stock-import-template.xlsx");
}

export default function Stock() {
  const qc = useQueryClient();

  const [q, setQ] = useState("");
  const [activeOnly, setActiveOnly] = useState(true);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductUpsert>(emptyForm);

  // For NEW product: keep selected file until product is created (then upload using id)
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
  const [imageBusy, setImageBusy] = useState(false);

  // Lightbox
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string>("");
  const [lightboxTitle, setLightboxTitle] = useState<string>("");

  // Excel import input
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Row upload input
  const rowUploadRef = useRef<HTMLInputElement | null>(null);
  const [rowUploadTargetId, setRowUploadTargetId] = useState<number | null>(null);

  // Dialog upload input (separate so it doesn't require rowUploadTargetId)
  const dialogUploadRef = useRef<HTMLInputElement | null>(null);

  // Drag state for premium glow
  const [dragOverId, setDragOverId] = useState<number | null>(null);

  const productsQ = useQuery({
    queryKey: ["products", { q, activeOnly }],
    queryFn: () => listProducts({ q, activeOnly, limit: 5000 }),
    staleTime: 20_000,
  });

  const rows = (productsQ.data || []) as Product[];

  const createM = useMutation({
    mutationFn: (payload: ProductUpsert) => createProduct(payload),
    onSuccess: () => {
      toast.success("Product created");
      qc.invalidateQueries({ queryKey: ["products"], exact: false });
      setOpen(false);
    },
    onError: (e: any) => toast.error(e?.message || "Failed to create product"),
  });

  const updateM = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: ProductUpsert }) => updateProduct(id, payload),
    onSuccess: () => {
      toast.success("Product updated");
      qc.invalidateQueries({ queryKey: ["products"], exact: false });
      setOpen(false);
    },
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

  function openNew() {
    setEditing(null);
    setForm({ ...emptyForm, is_active: true });
    setPendingImageFile(null);
    setOpen(true);
  }

  function openEdit(p: Product) {
    setEditing(p);
    setForm({
      sku: p.sku,
      item_code: p.item_code ?? "",
      name: p.name,
      description: p.description ?? "",
      units_per_box: p.units_per_box,
      cost_price: p.cost_price,
      selling_price: Number(p.selling_price ?? 0),
      current_stock: p.current_stock ?? 0,
      reorder_level: p.reorder_level,
      is_active: p.is_active,
      image_url: p.image_url ?? "",
    });
    setPendingImageFile(null);
    setOpen(true);
  }

  function openLightbox(url: string, title?: string) {
    if (!url) return;
    setLightboxUrl(url);
    setLightboxTitle(title || "Preview");
    setLightboxOpen(true);
  }

  async function doUploadImageForProduct(productId: number, file: File) {
    const product = rows.find((x) => x.id === productId);
    if (!product) return toast.error("Product not found");

    setImageBusy(true);
    try {
      if (!isImageLike(file)) throw new Error("Please upload an image file (PNG/JPG/WebP)");

      const { publicUrl } = await uploadProductImage({ productId, file });

      // ✅ Update DB fields only (prevents json coercion issues)
      await updateProduct(productId, {
        sku: product.sku,
        item_code: product.item_code ?? "",
        name: product.name,
        description: product.description ?? "",
        units_per_box: product.units_per_box,
        cost_price: product.cost_price,
        selling_price: Number(product.selling_price ?? 0),
        current_stock: product.current_stock ?? 0,
        reorder_level: product.reorder_level,
        is_active: product.is_active,
        image_url: publicUrl,
      } as any);

      toast.success("Image uploaded");
      qc.invalidateQueries({ queryKey: ["products"], exact: false });

      // Update dialog preview if same product open
      setForm((prev) => ({ ...prev, image_url: publicUrl } as any));
      setPendingImageFile(null);
    } catch (e: any) {
      toast.error(e?.message || "Image upload failed");
    } finally {
      setImageBusy(false);
      setDragOverId(null);
      setRowUploadTargetId(null);
      if (rowUploadRef.current) rowUploadRef.current.value = "";
      if (dialogUploadRef.current) dialogUploadRef.current.value = "";
    }
  }

  async function save() {
    if (!form.sku || !form.name) {
      toast.error("SKU and Name are required");
      return;
    }

    // EDIT: update fields then upload if pending image selected
    if (editing) {
      try {
        await updateProduct(editing.id, form);

        if (pendingImageFile) {
          await doUploadImageForProduct(editing.id, pendingImageFile);
        } else {
          toast.success("Saved");
          qc.invalidateQueries({ queryKey: ["products"], exact: false });
          setOpen(false);
        }
      } catch (e: any) {
        toast.error(e?.message || "Failed to save");
      }
      return;
    }

    // NEW: create -> upload using created id -> update image_url
    try {
      const created = await createProduct(form);

      if (pendingImageFile) {
        // For new product, we should upload then update only image_url (keep other fields in DB)
        await doUploadImageForProduct(created.id, pendingImageFile);
      }

      toast.success("Product created");
      qc.invalidateQueries({ queryKey: ["products"], exact: false });
      setPendingImageFile(null);
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message || "Failed to create product");
    }
  }

  const exportExcel = () => {
    const data = rows.map((p, idx) => ({
      SN: idx + 1,
      "Product Ref": p.item_code || p.sku || "",
      SKU: p.sku || "",
      "Product Image": p.image_url || "",
      "Product Description": p.name || "",
      "Units / Box": p.units_per_box ?? "",
      "Price / Pcs (Rs)": Number(p.selling_price ?? 0),
      Description: p.description || "",
      "Cost Price": p.cost_price ?? "",
      "Current Stock": p.current_stock ?? 0,
      "Reorder Level": p.reorder_level ?? "",
      Active: p.is_active ? "TRUE" : "FALSE",
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [
      { wch: 6 },
      { wch: 16 },
      { wch: 16 },
      { wch: 40 },
      { wch: 34 },
      { wch: 12 },
      { wch: 16 },
      { wch: 42 },
      { wch: 12 },
      { wch: 14 },
      { wch: 14 },
      { wch: 10 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "StockItems");
    XLSX.writeFile(wb, "stock-items.xlsx");
    toast.success("Exported stock-items.xlsx");
  };

  const importExcel = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheetName = wb.SheetNames?.[0];
      if (!sheetName) throw new Error("No sheet found");

      const ws = wb.Sheets[sheetName];
      const json = XLSX.utils.sheet_to_json<any>(ws, { defval: "" });

      if (!json.length) {
        toast.error("Excel is empty");
        return;
      }

      const bySku = new Map<string, Product>();
      const byItemCode = new Map<string, Product>();
      for (const p of rows) {
        const sku = s(p.sku);
        const item = s(p.item_code);
        if (sku) bySku.set(sku, p);
        if (item) byItemCode.set(item, p);
      }

      let created = 0;
      let updated = 0;
      let skipped = 0;

      for (const raw of json) {
        const payload = normalizeExcelRow(raw);
        const sku = s(payload.sku);
        const item_code = s((payload as any).item_code);

        if (!sku || !s(payload.name)) {
          skipped++;
          continue;
        }

        const existing = bySku.get(sku) || (item_code ? byItemCode.get(item_code) : undefined);

        if (existing) {
          await updateProduct(existing.id, payload);
          updated++;
        } else {
          await createProduct(payload);
          created++;
        }
      }

      qc.invalidateQueries({ queryKey: ["products"], exact: false });
      toast.success(`Import done: ${created} created, ${updated} updated, ${skipped} skipped`);
    } catch (e: any) {
      toast.error(e?.message || "Import failed");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const onRowPickFile = async (file: File) => {
    const productId = rowUploadTargetId;
    if (!productId) return;

    await doUploadImageForProduct(productId, file);
  };

  async function removeImage(p: Product) {
    try {
      setImageBusy(true);
      await updateProduct(p.id, {
        sku: p.sku,
        item_code: p.item_code ?? "",
        name: p.name,
        description: p.description ?? "",
        units_per_box: p.units_per_box,
        cost_price: p.cost_price,
        selling_price: Number(p.selling_price ?? 0),
        current_stock: p.current_stock ?? 0,
        reorder_level: p.reorder_level,
        is_active: p.is_active,
        image_url: "",
      } as any);

      toast.success("Image removed");
      qc.invalidateQueries({ queryKey: ["products"], exact: false });
    } catch (e: any) {
      toast.error(e?.message || "Failed");
    } finally {
      setImageBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* PREMIUM HEADER */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-2xl font-semibold tracking-tight">Stock Items</div>
          <div className="text-sm text-muted-foreground">SN • Ref • Image (1:1) • Description • Units/Box • Price</div>
        </div>

        <div className="flex flex-wrap gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importExcel(f);
            }}
          />

          <input
            ref={rowUploadRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onRowPickFile(f);
            }}
          />

          {/* Dialog file picker */}
          <input
            ref={dialogUploadRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setPendingImageFile(f);
              e.currentTarget.value = ""; // allow same file re-pick
            }}
          />

          <Button variant="outline" onClick={downloadTemplateXlsx}>
            Download Template
          </Button>

          <Button variant="outline" onClick={() => fileRef.current?.click()}>
            Import Excel
          </Button>

          <Button variant="outline" onClick={exportExcel} disabled={rows.length === 0}>
            Export Excel
          </Button>

          <Button className="gradient-primary shadow-glow text-primary-foreground" onClick={openNew}>
            + New Product
          </Button>
        </div>
      </div>

      {/* FILTER BAR */}
      <Card className="p-4 shadow-premium">
        <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
          <Input placeholder="Search by SKU, Item Code, name…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="flex items-center gap-3 justify-end">
            <Switch checked={activeOnly} onCheckedChange={(v) => setActiveOnly(!!v)} />
            <span className="text-sm text-muted-foreground">Active only</span>
          </div>
        </div>
      </Card>

      {/* PREMIUM TABLE */}
      <Card className="p-0 overflow-hidden shadow-premium">
        <div className="border-b bg-gradient-to-r from-background to-muted/30 px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">
              Register
              <span className="ml-2 text-xs text-muted-foreground">
                {productsQ.isLoading ? "Loading…" : `${rows.length} item(s)`}
              </span>
            </div>
            <div className="text-xs text-muted-foreground">
              {imageBusy ? "Uploading…" : "Tip: drag & drop an image into the Image cell • Click to preview"}
            </div>
          </div>
        </div>

        <div className="overflow-auto">
          <table className="w-full text-sm">
            <colgroup>
              <col style={{ width: "6%" }} />
              <col style={{ width: "16%" }} />
              <col style={{ width: "18%" }} />
              <col style={{ width: "32%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "16%" }} />
            </colgroup>

            <thead className="sticky top-0 z-10 bg-background/90 backdrop-blur border-b">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">SN</th>
                <th className="px-4 py-3 text-left font-semibold">Product Ref:</th>
                <th className="px-4 py-3 text-left font-semibold">Product Image</th>
                <th className="px-4 py-3 text-left font-semibold">Product Description</th>
                <th className="px-4 py-3 text-right font-semibold">Units / Box</th>
                <th className="px-4 py-3 text-right font-semibold">Price / Pcs (Rs)</th>
              </tr>
            </thead>

            <tbody className="divide-y">
              {productsQ.isLoading ? (
                <tr>
                  <td className="px-4 py-10 text-muted-foreground" colSpan={6}>
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td className="px-4 py-10 text-muted-foreground" colSpan={6}>
                    No stock items found.
                  </td>
                </tr>
              ) : (
                rows.map((p, idx) => {
                  const ref = (p.item_code || p.sku || "-").toString();
                  const img = (p.image_url || "").toString();
                  const isDrag = dragOverId === p.id;

                  return (
                    <tr
                      key={p.id}
                      className={idx % 2 === 0 ? "bg-background hover:bg-muted/40" : "bg-muted/10 hover:bg-muted/40"}
                      onDoubleClick={() => openEdit(p)}
                      title="Double click to edit"
                    >
                      <td className="px-4 py-4 align-top">
                        <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-muted/40 text-xs font-semibold">
                          {idx + 1}
                        </span>
                      </td>

                      <td className="px-4 py-4 align-top">
                        <div className="font-semibold tracking-wide">{ref}</div>
                        <div className="mt-1 text-xs text-muted-foreground">SKU: {p.sku}</div>

                        <div className="mt-2 flex items-center gap-2">
                          <span
                            className={
                              "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium " +
                              (p.is_active ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-600")
                            }
                          >
                            {p.is_active ? "ACTIVE" : "INACTIVE"}
                          </span>

                          <Switch checked={!!p.is_active} onCheckedChange={(v) => activeM.mutate({ id: p.id, active: !!v })} />
                        </div>
                      </td>

                      {/* ULTRA-PREMIUM IMAGE CELL (1:1) */}
                      <td className="px-4 py-4 align-top">
                        <div className="flex items-start gap-3">
                          {/* Drop zone / preview */}
                          <div
                            className={[
                              "group relative overflow-hidden rounded-2xl border bg-muted/20 shadow-sm",
                              "ring-1 ring-black/5",
                              isDrag ? "ring-2 ring-primary/60 bg-primary/5" : "",
                            ].join(" ")}
                            style={{ width: PREVIEW_SIZE, height: PREVIEW_SIZE }}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (img) openLightbox(img, p.name);
                            }}
                            onDragEnter={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setDragOverId(p.id);
                            }}
                            onDragOver={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setDragOverId(p.id);
                            }}
                            onDragLeave={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setDragOverId((cur) => (cur === p.id ? null : cur));
                            }}
                            onDrop={async (e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setDragOverId(null);

                              const file = e.dataTransfer.files?.[0];
                              if (!file) return;
                              if (!isImageLike(file)) return toast.error("Drop an image file (PNG/JPG/WebP)");
                              await doUploadImageForProduct(p.id, file);
                            }}
                            title={img ? "Click to preview • Drag & drop to replace" : "Drag & drop an image here"}
                          >
                            {img ? (
                              <>
                                {/* glossy shine */}
                                <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                                  <div className="absolute -inset-10 rotate-12 bg-gradient-to-r from-white/0 via-white/20 to-white/0" />
                                </div>

                                {/* image (auto-crop 1:1) */}
                                <img
                                  src={img}
                                  alt={p.name}
                                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.08]"
                                  draggable={false}
                                  onError={(e) => {
                                    // avoid permanently hiding
                                    (e.currentTarget as HTMLImageElement).src = "";
                                  }}
                                />

                                {/* overlay actions */}
                                <div className="absolute inset-0 flex items-end justify-between gap-2 p-2 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                                  <div className="rounded-full bg-black/40 px-2 py-1 text-[11px] text-white backdrop-blur">
                                    Click to preview
                                  </div>
                                  <div className="rounded-full bg-black/40 px-2 py-1 text-[11px] text-white backdrop-blur">
                                    Drop to replace
                                  </div>
                                </div>
                              </>
                            ) : (
                              <div className="flex h-full w-full flex-col items-center justify-center text-center">
                                <div className="text-xs font-medium text-muted-foreground">No image</div>
                                <div className="mt-1 text-[11px] text-muted-foreground">Drop here</div>
                              </div>
                            )}
                          </div>

                          {/* buttons */}
                          <div className="flex flex-col gap-2">
                            <Button
                              variant="outline"
                              className="h-8 px-3"
                              disabled={imageBusy}
                              onClick={(e) => {
                                e.stopPropagation();
                                setRowUploadTargetId(p.id);
                                rowUploadRef.current?.click();
                              }}
                              title="Upload from computer"
                            >
                              {img ? "Change" : "Upload"}
                            </Button>

                            {img ? (
                              <Button
                                variant="outline"
                                className="h-8 px-3"
                                disabled={imageBusy}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeImage(p);
                                }}
                              >
                                Remove
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-4 align-top">
                        <div className="font-semibold">{p.name}</div>
                        {p.description ? <div className="mt-1 text-xs text-muted-foreground line-clamp-2">{p.description}</div> : null}

                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button variant="outline" className="h-8 px-3" onClick={() => openEdit(p)}>
                            Edit
                          </Button>
                          <Button
                            variant="outline"
                            className="h-8 px-3"
                            onClick={() => activeM.mutate({ id: p.id, active: !p.is_active })}
                          >
                            {p.is_active ? "Deactivate" : "Activate"}
                          </Button>
                        </div>
                      </td>

                      <td className="px-4 py-4 align-top text-right font-medium">{p.units_per_box ?? "-"}</td>

                      <td className="px-4 py-4 align-top text-right">
                        <div className="font-semibold">Rs {money(p.selling_price)}</div>
                        <div className="mt-1 text-xs text-muted-foreground">Cost: {money(p.cost_price)}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          Stock: {p.current_stock ?? 0}
                          {p.reorder_level ? ` • Reorder: ${p.reorder_level}` : ""}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="border-t px-4 py-3 text-xs text-muted-foreground">
          Images upload to Storage bucket: <b>{BUCKET}</b> → saved to <b>products.image_url</b>. (Preview is square 1:1 with auto-crop)
        </div>
      </Card>

      {/* LIGHTBOX PREVIEW */}
      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent className="max-w-4xl p-0 overflow-hidden">
          <div className="flex items-center justify-between border-b px-5 py-3">
            <div className="text-sm font-semibold truncate">{lightboxTitle}</div>
            <Button variant="outline" className="h-8" onClick={() => setLightboxOpen(false)}>
              Close
            </Button>
          </div>

          <div className="bg-black/95">
            <div className="mx-auto flex max-h-[78vh] items-center justify-center p-4">
              {/* contain to avoid cropping in preview */}
              <img src={lightboxUrl} alt="Preview" className="max-h-[72vh] w-auto max-w-full object-contain rounded-xl" />
            </div>
          </div>

          <div className="border-t px-5 py-3 text-xs text-muted-foreground flex flex-wrap items-center justify-between gap-2">
            <div className="truncate">{lightboxUrl}</div>
            <Button
              variant="outline"
              className="h-8"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(lightboxUrl);
                  toast.success("Image URL copied");
                } catch {
                  toast.error("Copy failed");
                }
              }}
            >
              Copy URL
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* DIALOG (CREATE/EDIT) */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Product" : "New Product"}</DialogTitle>
          </DialogHeader>

          {/* Image preview + upload */}
          <div className="flex items-start gap-4 rounded-xl border bg-muted/10 p-4">
            <div className="overflow-hidden rounded-2xl border bg-muted/20 ring-1 ring-black/5" style={{ width: 112, height: 112 }}>
              {form.image_url ? (
                <img
                  src={String((form as any).image_url)}
                  className="h-full w-full object-cover"
                  alt="preview"
                  draggable={false}
                  onClick={() => form.image_url && openLightbox(String((form as any).image_url), form.name || "Preview")}
                />
              ) : pendingImageFile ? (
                <img
                  src={URL.createObjectURL(pendingImageFile)}
                  className="h-full w-full object-cover"
                  alt="preview"
                  draggable={false}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">No image</div>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <div className="text-sm font-semibold">Product Image</div>
              <div className="text-xs text-muted-foreground">
                Upload to Supabase Storage bucket <b>{BUCKET}</b>. Auto-saves <b>image_url</b>.
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={imageBusy}
                  onClick={() => dialogUploadRef.current?.click()}
                  title="Pick image file"
                >
                  Choose File
                </Button>

                {editing ? (
                  <Button
                    variant="outline"
                    disabled={imageBusy || !pendingImageFile}
                    onClick={() => pendingImageFile && doUploadImageForProduct(editing.id, pendingImageFile)}
                  >
                    Upload Now
                  </Button>
                ) : (
                  <Button variant="outline" disabled>
                    Upload after Create
                  </Button>
                )}

                {(form.image_url || pendingImageFile) ? (
                  <Button
                    variant="outline"
                    disabled={imageBusy}
                    onClick={() => {
                      setPendingImageFile(null);
                      setForm((prev) => ({ ...prev, image_url: "" } as any));
                    }}
                  >
                    Remove
                  </Button>
                ) : null}
              </div>

              <div className="text-[11px] text-muted-foreground">
                For new products, we create the item first → then upload using Product ID.
              </div>
            </div>
          </div>

          {/* Fields */}
          <div className="grid gap-4 md:grid-cols-2">
            <Input placeholder="SKU *" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
            <Input placeholder="Item Code" value={form.item_code ?? ""} onChange={(e) => setForm({ ...form, item_code: e.target.value })} />
            <Input placeholder="Name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Input placeholder="Description" value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} />

            <Input
              placeholder="Units / Box"
              inputMode="numeric"
              value={String(form.units_per_box ?? "")}
              onChange={(e) => setForm({ ...form, units_per_box: e.target.value as any })}
            />

            <Input
              placeholder="Current Stock"
              inputMode="numeric"
              value={String(form.current_stock ?? 0)}
              onChange={(e) => setForm({ ...form, current_stock: e.target.value as any })}
            />

            <Input
              placeholder="Reorder Level"
              inputMode="numeric"
              value={String(form.reorder_level ?? "")}
              onChange={(e) => setForm({ ...form, reorder_level: e.target.value as any })}
            />

            <Input
              placeholder="Cost Price"
              inputMode="decimal"
              value={String(form.cost_price ?? "")}
              onChange={(e) => setForm({ ...form, cost_price: e.target.value as any })}
            />

            <Input
              placeholder="Selling Price *"
              inputMode="decimal"
              value={String(form.selling_price)}
              onChange={(e) => setForm({ ...form, selling_price: e.target.value as any })}
            />

            <div className="flex items-center gap-2 md:col-span-2">
              <Switch checked={!!form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: !!v })} />
              <span className="text-sm text-muted-foreground">Active</span>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>

            <Button
              className="gradient-primary shadow-glow text-primary-foreground"
              onClick={save}
              disabled={imageBusy || createM.isPending || updateM.isPending}
            >
              {editing ? "Save Changes" : "Create Product"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
