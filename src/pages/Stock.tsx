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

  // NEW: store stock in PCS in DB
  const upb = nInt(form.units_per_box);
  const boxStock = Math.max(0, nInt(form.current_stock_boxes) ?? 0);
  const unitStock = Math.max(0, nInt(form.current_stock_units) ?? 0);
  const totalPcsStock = Math.max(0, boxStock * (upb ?? 1) + unitStock);

  return {
    sku,
    item_code: s(form.item_code) || null,
    name,
    description: s(form.description) || "",
    units_per_box: upb,

    cost_price: form.cost_price === "" ? null : Number.isFinite(Number(form.cost_price)) ? Number(form.cost_price) : null,
    selling_price: Math.max(0, n0(form.selling_price)),

    // ✅ DB stays as PCS stock
    current_stock: totalPcsStock,

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

  // stock entry (NEW): boxes + units
  units_per_box: "",
  current_stock_boxes: "",
  current_stock_units: "",

  cost_price: "",
  selling_price: "",
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

  // NEW: excel can provide stock as either:
  // - "Current Stock (Pcs)" (preferred) OR
  // - "Stock Boxes" + "Stock Units"
  const current_stock_pcs = pick(r, ["Current Stock (Pcs)", "Current Stock PCS", "current_stock", "STOCK"]);
  const stock_boxes = pick(r, ["Stock Boxes", "stock_boxes", "Boxes"]);
  const stock_units = pick(r, ["Stock Units", "stock_units", "Units"]);

  const selling_price = pick(r, ["Price  / Pcs (Rs)", "Price / Pcs (Rs)", "Price", "selling_price", "SELLING PRICE"]);
  const cost_price = pick(r, ["Cost Price", "cost_price", "COST"]);
  const reorder_level = pick(r, ["Reorder Level", "reorder_level", "REORDER"]);
  const is_active = parseBool(pick(r, ["Active", "is_active", "ACTIVE"]), true);

  const upb = nInt(units_per_box) ?? 1;

  // If pcs stock provided, keep it and split for UI (boxes + units)
  const pcs = Math.max(0, nInt(current_stock_pcs) ?? 0);
  const boxFromPcs = upb > 0 ? Math.floor(pcs / upb) : 0;
  const unitFromPcs = upb > 0 ? pcs % upb : pcs;

  const boxes = stock_boxes !== undefined && stock_boxes !== "" ? Math.max(0, nInt(stock_boxes) ?? 0) : boxFromPcs;
  const units = stock_units !== undefined && stock_units !== "" ? Math.max(0, nInt(stock_units) ?? 0) : unitFromPcs;

  return {
    ...emptyForm,
    sku,
    item_code: item_code || "",
    name,
    description,
    units_per_box: units_per_box === "" ? "" : String(nInt(units_per_box) ?? ""),

    // NEW
    current_stock_boxes: String(boxes),
    current_stock_units: String(units),

    selling_price: selling_price === "" ? "" : String(Math.max(0, n0(selling_price))),
    cost_price: cost_price === "" ? "" : String(n0(cost_price)),
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
      "Units / Box": 25,
      "Price / Pcs (Rs)": 45.0,
      Description: "Optional long description",
      "Cost Price": 30.0,

      // NEW: enter stock as boxes + units
      "Stock Boxes": 1,
      "Stock Units": 0,

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
    { wch: 12 },
    { wch: 12 },
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
    setForm({
      ...emptyForm,
      sku: genSku(),
      is_active: true,
      selling_price: "",
      cost_price: "",
      units_per_box: "",
      current_stock_boxes: "",
      current_stock_units: "",
      reorder_level: "",
    });
    setOpen(true);
  }

  function splitPcsToBoxUnits(pcs: number, upb: number) {
    const safeUpb = Math.max(1, Math.trunc(n0(upb || 1)));
    const safePcs = Math.max(0, Math.trunc(n0(pcs)));
    return {
      boxes: Math.floor(safePcs / safeUpb),
      units: safePcs % safeUpb,
    };
  }

  function openEdit(p: Product) {
    const upb = Math.max(1, Math.trunc(n0(p.units_per_box ?? 1)));
    const pcs = Math.max(0, Math.trunc(n0(p.current_stock ?? 0)));
    const { boxes, units } = splitPcsToBoxUnits(pcs, upb);

    setEditing(p);
    setForm({
      sku: p.sku || "",
      item_code: p.item_code ?? "",
      name: p.name || "",
      description: p.description ?? "",

      units_per_box: p.units_per_box ?? "",

      // NEW: show stock split
      current_stock_boxes: String(boxes),
      current_stock_units: String(units),

      cost_price: p.cost_price ?? "",
      selling_price: p.selling_price ?? "",
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

    if (form.selling_price === "" || !Number.isFinite(Number(form.selling_price))) {
      toast.error("Selling Price is required");
      return;
    }

    // NEW: validation for units_per_box if they enter box stock
    const upb = nInt(form.units_per_box);
    if ((nInt(form.current_stock_boxes) ?? 0) > 0 && (!upb || upb <= 0)) {
      toast.error("Units / Box is required when Stock Boxes is used");
      return;
    }

    // NEW: units must be < UPB (nice UX)
    const units = Math.max(0, nInt(form.current_stock_units) ?? 0);
    const safeUpb = Math.max(1, Math.trunc(n0(upb ?? 1)));
    if (units >= safeUpb) {
      toast.error(`Stock Units must be less than Units/Box (${safeUpb}).`);
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
    const data = rows.map((p, idx) => {
      const upb = Math.max(1, Math.trunc(n0(p.units_per_box ?? 1)));
      const pcs = Math.max(0, Math.trunc(n0(p.current_stock ?? 0)));
      const boxes = Math.floor(pcs / upb);
      const units = pcs % upb;

      return {
        SN: idx + 1,
        "Product Ref": p.item_code || p.sku || "",
        SKU: p.sku || "",
        "Product Description": p.name || "",
        "Units / Box": p.units_per_box ?? "",
        "Price / Pcs (Rs)": Number(p.selling_price ?? 0),
        Description: p.description || "",
        "Cost Price": p.cost_price ?? "",

        // NEW export:
        "Stock Boxes": boxes,
        "Stock Units": units,
        "Current Stock (Pcs)": pcs,

        "Reorder Level": p.reorder_level ?? "",
        Active: p.is_active ? "TRUE" : "FALSE",
      };
    });

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
      { wch: 12 },
      { wch: 12 },
      { wch: 16 },
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

  // NEW: live stock preview (1 box, 25 units => pcs)
  const liveUpb = Math.max(1, Math.trunc(n0(nInt(form.units_per_box) ?? 1)));
  const liveBoxes = Math.max(0, Math.trunc(n0(nInt(form.current_stock_boxes) ?? 0)));
  const liveUnits = Math.max(0, Math.trunc(n0(nInt(form.current_stock_units) ?? 0)));
  const livePcs = Math.max(0, liveBoxes * liveUpb + liveUnits);

  // show on table also (optional)
  const renderedRows = useMemo(() => {
    return rows.map((p) => {
      const upb = Math.max(1, Math.trunc(n0(p.units_per_box ?? 1)));
      const pcs = Math.max(0, Math.trunc(n0(p.current_stock ?? 0)));
      const boxes = Math.floor(pcs / upb);
      const units = pcs % upb;
      return { p, upb, pcs, boxes, units };
    });
  }, [rows]);

  return (
    <div className="space-y-5">
      {/* HEADER */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-2xl font-semibold tracking-tight">Stock Items</div>
          <div className="text-sm text-muted-foreground">SN • Ref • Description • Units/Box • Stock • Price</div>
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
                renderedRows.map(({ p, upb, pcs, boxes, units }, idx) => {
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

                        <div className="mt-2 text-xs text-muted-foreground">
                          Stock: <b>{boxes}</b> box, <b>{units}</b> unit ({pcs} pcs)
                        </div>

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
                          DB Stock (pcs): {p.current_stock ?? 0}
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
          Stock input is now <b>Boxes + Units</b>, saved as total <b>pcs</b> in DB (<b>current_stock</b>).
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
            <Input placeholder="SKU (auto)" value={form.sku} readOnly className="bg-muted/30" title="SKU is auto generated" />

            <Input placeholder="Item Code" value={form.item_code ?? ""} onChange={(e) => setForm({ ...form, item_code: e.target.value })} />

            <Input placeholder="Name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />

            <Input placeholder="Description" value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} />

            <Input
              placeholder="Units / Box (e.g. 25)"
              inputMode="numeric"
              value={String(form.units_per_box ?? "")}
              onChange={(e) => {
                const v = e.target.value;
                setForm((prev: any) => {
                  const next = { ...prev, units_per_box: v };
                  // auto-correct units if they became >= UPB
                  const upb = Math.max(1, Math.trunc(n0(nInt(v) ?? 1)));
                  const units = Math.max(0, Math.trunc(n0(nInt(next.current_stock_units) ?? 0)));
                  if (units >= upb) next.current_stock_units = String(Math.max(0, upb - 1));
                  return next;
                });
              }}
            />

            {/* NEW: stock entry as boxes + units */}
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Stock Entry</div>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="Stock Boxes (e.g. 1)"
                  inputMode="numeric"
                  value={String(form.current_stock_boxes ?? "")}
                  onChange={(e) => setForm({ ...form, current_stock_boxes: e.target.value })}
                />
                <Input
                  placeholder="Stock Units (e.g. 0)"
                  inputMode="numeric"
                  value={String(form.current_stock_units ?? "")}
                  onChange={(e) => setForm({ ...form, current_stock_units: e.target.value })}
                />
              </div>

              <div className="text-[11px] text-muted-foreground">
                Example: <b>1 box</b> + <b>0 unit</b> with <b>{liveUpb}</b> units/box = <b>{livePcs}</b> pcs (saved in DB)
              </div>
            </div>

            <Input
              placeholder="Reorder Level"
              inputMode="numeric"
              value={String(form.reorder_level ?? "")}
              onChange={(e) => setForm({ ...form, reorder_level: e.target.value })}
            />

            <Input placeholder="Cost Price" inputMode="decimal" value={String(form.cost_price ?? "")} onChange={(e) => setForm({ ...form, cost_price: e.target.value })} />

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

            <Button className="gradient-primary shadow-glow text-primary-foreground" onClick={save} disabled={createM.isPending || updateM.isPending}>
              {editing ? "Save Changes" : "Create Product"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

