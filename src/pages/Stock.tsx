// src/pages/Stock.tsx
import React, { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Product, ProductUpsert } from "@/types/product";
import { createProduct, listProducts, setProductActive, updateProduct } from "@/lib/products";

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
  if (v === null || v === undefined || v === "") return null;
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

/** SKU generator (unique-enough client-side) */
function genSku(prefix = "SKU") {
  // ex: SKU-20260209-6F8K2C
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  const rnd = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${y}${m}${da}-${rnd}`;
}

/** build safe payload for DB (convert "" to null / numbers) */
function toPayload(form: any): ProductUpsert {
  const sku = s(form.sku) || genSku();
  const name = s(form.name);

  return {
    sku,
    item_code: s(form.item_code) || null,
    name,
    description: s(form.description) || "",
    units_per_box: nInt(form.units_per_box),
    cost_price: form.cost_price === "" ? null : Number.isFinite(Number(form.cost_price)) ? Number(form.cost_price) : null,
    selling_price: Math.max(0, n0(form.selling_price)),
    current_stock: Math.max(0, nInt(form.current_stock) ?? 0),
    reorder_level: form.reorder_level === "" ? null : Math.max(0, nInt(form.reorder_level) ?? 0),
    is_active: !!form.is_active,
    image_url: "", // kept for type compatibility; image feature removed
  } as any;
}

/* =========================
   Excel helpers
========================= */
type ExcelRowAny = Record<string, any>;
function pick(r: ExcelRowAny, keys: string[]) {
  for (const k of keys) if (r[k] !== undefined) return r[k];
  return undefined;
}

const emptyForm: any = {
  sku: "",
  item_code: "",
  name: "",
  description: "",
  units_per_box: "",
  cost_price: "",
  selling_price: "",
  current_stock: "",
  reorder_level: "",
  is_active: true,
  image_url: "",
};

function normalizeExcelRow(r: ExcelRowAny): any {
  const productRef = s(
    pick(r, ["Product Ref", "Product Ref:", "product_ref", "item_code", "Item Code", "ITEM CODE", "Ref", "REF"]) ?? ""
  );

  const skuRaw = s(pick(r, ["SKU", "sku"]) ?? "");
  const sku = skuRaw || genSku();

  const item_code = s(pick(r, ["Item Code", "item_code"]) ?? "") || productRef || "";

  const name =
    s(pick(r, ["Product Description", "Product Description (Name)", "name", "Name"]) ?? "") || "Unnamed product";

  const description = s(pick(r, ["Description", "description", "Details"]) ?? "");

  const units_per_box = pick(r, ["Units / Box", "Units/Box", "units_per_box", "UPB", "Units Per Box"]);
  const selling_price = pick(r, ["Price  / Pcs (Rs)", "Price / Pcs (Rs)", "Price", "selling_price", "SELLING PRICE"]);

  const cost_price = pick(r, ["Cost Price", "cost_price", "COST"]);
  const current_stock = pick(r, ["Current Stock", "current_stock", "STOCK"]);
  const reorder_level = pick(r, ["Reorder Level", "reorder_level", "REORDER"]);
  const is_active = parseBool(pick(r, ["Active", "is_active", "ACTIVE"]), true);

  return {
    ...emptyForm,
    sku,
    item_code: item_code || "",
    name,
    description,
    units_per_box: units_per_box === "" ? "" : String(nInt(units_per_box) ?? ""),
    selling_price: selling_price === "" ? "" : String(Math.max(0, n0(selling_price))),
    cost_price: cost_price === "" ? "" : String(n0(cost_price)),
    current_stock: current_stock === "" ? "" : String(Math.max(0, nInt(current_stock) ?? 0)),
    reorder_level: reorder_level === "" ? "" : String(Math.max(0, nInt(reorder_level) ?? 0)),
    is_active,
  };
}

function downloadTemplateXlsx() {
  const sheetRows = [
    {
      SN: 1,
      "Product Ref": "ITEM-001",
      SKU: "", // optional; auto generated if blank
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
    { wch: 18 },
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
  XLSX.utils.book_append_sheet(wb, ws, "StockTemplate");
  XLSX.writeFile(wb, "stock-import-template.xlsx");
}

export default function Stock() {
  const qc = useQueryClient();

  const [q, setQ] = useState("");
  const [activeOnly, setActiveOnly] = useState(true);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<any>(emptyForm);

  // Excel import input
  const fileRef = useRef<HTMLInputElement | null>(null);

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
    // remove annoying "0" defaults: keep numeric as "" in UI
    setForm({
      ...emptyForm,
      sku: genSku(),
      is_active: true,
      selling_price: "",
      current_stock: "",
      cost_price: "",
      units_per_box: "",
      reorder_level: "",
    });
    setOpen(true);
  }

  function openEdit(p: Product) {
    setEditing(p);
    setForm({
      sku: p.sku || "",
      item_code: p.item_code ?? "",
      name: p.name || "",
      description: p.description ?? "",
      units_per_box: p.units_per_box ?? "",
      cost_price: p.cost_price ?? "",
      selling_price: p.selling_price ?? "",
      current_stock: p.current_stock ?? "",
      reorder_level: p.reorder_level ?? "",
      is_active: !!p.is_active,
      image_url: "",
    });
    setOpen(true);
  }

  async function save() {
    const sku = s(form.sku) || genSku();
    const name = s(form.name);

    if (!name) {
      toast.error("Name is required");
      return;
    }

    // selling_price required by schema
    if (form.selling_price === "" || !Number.isFinite(Number(form.selling_price))) {
      toast.error("Selling Price is required");
      return;
    }

    const payload = toPayload({ ...form, sku });

    try {
      if (editing) {
        await updateProduct(editing.id, payload);
        toast.success("Saved");
      } else {
        await createProduct(payload);
        toast.success("Product created");
      }

      qc.invalidateQueries({ queryKey: ["products"], exact: false });
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message || "Failed to save");
    }
  }

  const exportExcel = () => {
    const data = rows.map((p, idx) => ({
      SN: idx + 1,
      "Product Ref": p.item_code || p.sku || "",
      SKU: p.sku || "",
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
      { wch: 18 },
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
        const rowForm = normalizeExcelRow(raw);

        const sku = s(rowForm.sku) || genSku();
        const item_code = s(rowForm.item_code);
        const name = s(rowForm.name);

        if (!name) {
          skipped++;
          continue;
        }

        const payload = toPayload({ ...rowForm, sku });

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

  return (
    <div className="space-y-5">
      {/* HEADER */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-2xl font-semibold tracking-tight">Stock Items</div>
          <div className="text-sm text-muted-foreground">SN • Ref • Description • Units/Box • Price</div>
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

      {/* FILTER */}
      <Card className="p-4 shadow-premium">
        <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
          <Input placeholder="Search by SKU, Item Code, name…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="flex items-center gap-3 justify-end">
            <Switch checked={activeOnly} onCheckedChange={(v) => setActiveOnly(!!v)} />
            <span className="text-sm text-muted-foreground">Active only</span>
          </div>
        </div>
      </Card>

      {/* TABLE */}
      <Card className="p-0 overflow-hidden shadow-premium">
        <div className="border-b bg-gradient-to-r from-background to-muted/30 px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">
              Register
              <span className="ml-2 text-xs text-muted-foreground">
                {productsQ.isLoading ? "Loading…" : `${rows.length} item(s)`}
              </span>
            </div>
            <div className="text-xs text-muted-foreground">Tip: Double click row to edit</div>
          </div>
        </div>

        <div className="overflow-auto">
          <table className="w-full text-sm">
            <colgroup>
              <col style={{ width: "6%" }} />
              <col style={{ width: "20%" }} />
              <col style={{ width: "42%" }} />
              <col style={{ width: "14%" }} />
              <col style={{ width: "18%" }} />
            </colgroup>

            <thead className="sticky top-0 z-10 bg-background/90 backdrop-blur border-b">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">SN</th>
                <th className="px-4 py-3 text-left font-semibold">Product Ref:</th>
                <th className="px-4 py-3 text-left font-semibold">Product Description</th>
                <th className="px-4 py-3 text-right font-semibold">Units / Box</th>
                <th className="px-4 py-3 text-right font-semibold">Price / Pcs (Rs)</th>
              </tr>
            </thead>

            <tbody className="divide-y">
              {productsQ.isLoading ? (
                <tr>
                  <td className="px-4 py-10 text-muted-foreground" colSpan={5}>
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td className="px-4 py-10 text-muted-foreground" colSpan={5}>
                    No stock items found.
                  </td>
                </tr>
              ) : (
                rows.map((p, idx) => {
                  const ref = (p.item_code || p.sku || "-").toString();

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

                          <Switch
                            checked={!!p.is_active}
                            onCheckedChange={(v) => activeM.mutate({ id: p.id, active: !!v })}
                          />
                        </div>
                      </td>

                      <td className="px-4 py-4 align-top">
                        <div className="font-semibold">{p.name}</div>
                        {p.description ? (
                          <div className="mt-1 text-xs text-muted-foreground line-clamp-2">{p.description}</div>
                        ) : null}

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
          Product images have been removed from this screen. (DB column <b>image_url</b> is still present but unused.)
        </div>
      </Card>

      {/* CREATE / EDIT DIALOG */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Product" : "New Product"}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 md:grid-cols-2">
            {/* SKU auto */}
            <Input
              placeholder="SKU (auto)"
              value={form.sku}
              readOnly
              className="bg-muted/30"
              title="SKU is auto generated"
            />

            <Input
              placeholder="Item Code"
              value={form.item_code ?? ""}
              onChange={(e) => setForm({ ...form, item_code: e.target.value })}
            />

            <Input
              placeholder="Name *"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />

            <Input
              placeholder="Description"
              value={form.description ?? ""}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />

            <Input
              placeholder="Units / Box"
              inputMode="numeric"
              value={String(form.units_per_box ?? "")}
              onChange={(e) => setForm({ ...form, units_per_box: e.target.value })}
            />

            <Input
              placeholder="Current Stock"
              inputMode="numeric"
              value={String(form.current_stock ?? "")}
              onChange={(e) => setForm({ ...form, current_stock: e.target.value })}
            />

            <Input
              placeholder="Reorder Level"
              inputMode="numeric"
              value={String(form.reorder_level ?? "")}
              onChange={(e) => setForm({ ...form, reorder_level: e.target.value })}
            />

            <Input
              placeholder="Cost Price"
              inputMode="decimal"
              value={String(form.cost_price ?? "")}
              onChange={(e) => setForm({ ...form, cost_price: e.target.value })}
            />

            <Input
              placeholder="Selling Price *"
              inputMode="decimal"
              value={String(form.selling_price ?? "")}
              onChange={(e) => setForm({ ...form, selling_price: e.target.value })}
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
              disabled={createM.isPending || updateM.isPending}
            >
              {editing ? "Save Changes" : "Create Product"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
