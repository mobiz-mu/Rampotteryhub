// src/pages/StockMovements.tsx
import React, { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { format } from "date-fns";
import { Plus, Search, RefreshCw, ArrowDown, ArrowUp, SlidersHorizontal } from "lucide-react";

/* =========================
   Types (lightweight, UI-only)
========================= */
type MovementType = "IN" | "OUT" | "ADJUSTMENT";

type ProductRow = {
  id: number;
  sku: string;
  item_code?: string | null;
  name: string;
  current_stock?: number | null;
  units_per_box?: number | null;
};

type MovementRow = {
  id: number;
  product_id: number;
  movement_date: string;
  movement_type: MovementType;
  quantity: number;
  reference?: string | null;
  source_table?: string | null;
  source_id?: number | null;
  notes?: string | null;
  created_at: string;
  product?: ProductRow | null;
};

/* =========================
   Helpers
========================= */
const n = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);

function typeBadge(t: MovementType) {
  if (t === "IN") return { label: "Stock In", icon: ArrowDown, cls: "bg-emerald-500/10 text-emerald-700 border-emerald-200" };
  if (t === "OUT") return { label: "Stock Out", icon: ArrowUp, cls: "bg-rose-500/10 text-rose-700 border-rose-200" };
  return { label: "Adjustment", icon: SlidersHorizontal, cls: "bg-amber-500/10 text-amber-700 border-amber-200" };
}

function prettySource(src?: string | null, id?: number | null) {
  if (!src || !id) return "";
  const s = String(src).toLowerCase();
  if (s === "invoices") return `Invoice #${id}`;
  if (s === "credit_notes") return `Credit Note #${id}`;
  return `${src} #${id}`;
}

/* =========================
   Data layer (direct supabase calls)
========================= */
async function listProductsMini() {
  const { data, error } = await supabase
    .from("products")
    .select("id, sku, item_code, name, current_stock, units_per_box")
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);
  return (data || []) as ProductRow[];
}

async function listMovements(args: { q: string; type: MovementType | "ALL"; from?: string; to?: string }) {
  // NOTE: movement_date is timestamptz. We'll filter using ISO strings if provided.
  let query = supabase
    .from("stock_movements")
    .select(
      `
      id, product_id, movement_date, movement_type, quantity, reference, source_table, source_id, notes, created_at,
      product:products(id, sku, item_code, name, current_stock, units_per_box)
    `
    )
    .order("movement_date", { ascending: false })
    .limit(2000);

  if (args.type !== "ALL") query = query.eq("movement_type", args.type);

  if (args.from) query = query.gte("movement_date", args.from);
  if (args.to) query = query.lte("movement_date", args.to);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  let rows = (data || []) as MovementRow[];

  const q = args.q.trim().toLowerCase();
  if (q) {
    rows = rows.filter((m) => {
      const p = m.product;
      return (
        String(p?.name || "").toLowerCase().includes(q) ||
        String(p?.sku || "").toLowerCase().includes(q) ||
        String(p?.item_code || "").toLowerCase().includes(q) ||
        String(m.reference || "").toLowerCase().includes(q) ||
        String(m.notes || "").toLowerCase().includes(q)
      );
    });
  }

  return rows;
}

async function createMovement(payload: {
  product_id: number;
  movement_type: MovementType;
  quantity: number;
  movement_date?: string;
  reference?: string;
  notes?: string;
}) {
  const { error } = await supabase.from("stock_movements").insert([
    {
      product_id: payload.product_id,
      movement_type: payload.movement_type,
      quantity: payload.quantity,
      movement_date: payload.movement_date || new Date().toISOString(),
      reference: payload.reference || null,
      notes: payload.notes || null,
      // source_table/source_id intentionally empty for manual movements
    },
  ]);

  if (error) throw new Error(error.message);
  return true;
}

/* =========================
   UI
========================= */
export default function StockMovements() {
  const qc = useQueryClient();

  // Filters
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [type, setType] = useState<MovementType | "ALL">("ALL");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  // Dialog
  const [open, setOpen] = useState(false);
  const qtyRef = useRef<HTMLInputElement | null>(null);

  const [form, setForm] = useState<{
    product_id: string;
    movement_type: MovementType;
    quantity: number;
    reference: string;
    notes: string;
  }>({
    product_id: "",
    movement_type: "IN",
    quantity: 0,
    reference: "",
    notes: "",
  });

  // Debounce search (simple)
  React.useEffect(() => {
    const t = window.setTimeout(() => setQ(qInput.trim()), 200);
    return () => window.clearTimeout(t);
  }, [qInput]);

  const productsQ = useQuery({
    queryKey: ["products-mini"],
    queryFn: listProductsMini,
    staleTime: 60_000,
  });

  const movementsQ = useQuery({
    queryKey: ["stock-movements", { q, type, from, to }],
    queryFn: () => listMovements({ q, type, from: from ? new Date(from).toISOString() : "", to: to ? new Date(to).toISOString() : "" }),
    staleTime: 10_000,
  });

  const rows = movementsQ.data || [];
  const products = productsQ.data || [];

  const kpis = useMemo(() => {
    const inQty = rows.filter((r) => r.movement_type === "IN").reduce((s, r) => s + n(r.quantity), 0);
    const outQty = rows.filter((r) => r.movement_type === "OUT").reduce((s, r) => s + n(r.quantity), 0);
    const adjCount = rows.filter((r) => r.movement_type === "ADJUSTMENT").length;
    return {
      count: rows.length,
      inQty,
      outQty,
      net: inQty - outQty,
      adjCount,
    };
  }, [rows]);

  const createM = useMutation({
    mutationFn: () =>
      createMovement({
        product_id: Number(form.product_id),
        movement_type: form.movement_type,
        quantity: n(form.quantity),
        reference: form.reference.trim(),
        notes: form.notes.trim(),
      }),
    onSuccess: async () => {
      toast.success("Stock movement recorded");
      setOpen(false);
      setForm({ product_id: "", movement_type: "IN", quantity: 0, reference: "", notes: "" });
      await qc.invalidateQueries({ queryKey: ["stock-movements"], exact: false });
      await qc.invalidateQueries({ queryKey: ["products-mini"], exact: false });
    },
    onError: (e: any) => toast.error(e?.message || "Failed to record movement"),
  });

  function openNew() {
    setOpen(true);
    setTimeout(() => qtyRef.current?.focus(), 80);
  }

  const luxuryCard =
    "rounded-2xl border bg-gradient-to-b from-background to-muted/20 shadow-[0_18px_55px_rgba(2,6,23,.08)]";

  return (
    <div className="space-y-6">
      {/* Luxury Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-3xl font-semibold tracking-tight">Stock Movements</div>
          <div className="text-sm text-muted-foreground">
            Trace every inventory change • linked to invoices/credit notes • manual adjustments included
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => movementsQ.refetch()} disabled={movementsQ.isFetching}>
            <RefreshCw className={cn("mr-2 h-4 w-4", movementsQ.isFetching && "animate-spin")} />
            {movementsQ.isFetching ? "Refreshing..." : "Refresh"}
          </Button>

          <Button className="gradient-primary shadow-glow text-primary-foreground" onClick={openNew}>
            <Plus className="mr-2 h-4 w-4" />
            Record Movement
          </Button>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid gap-3 md:grid-cols-5">
        <Card className={cn("p-4", luxuryCard)}>
          <div className="text-xs text-muted-foreground">Movements</div>
          <div className="mt-1 text-2xl font-semibold">{kpis.count}</div>
        </Card>

        <Card className={cn("p-4", luxuryCard)}>
          <div className="text-xs text-muted-foreground">Stock In</div>
          <div className="mt-1 text-2xl font-semibold text-emerald-700">+{kpis.inQty.toLocaleString()}</div>
        </Card>

        <Card className={cn("p-4", luxuryCard)}>
          <div className="text-xs text-muted-foreground">Stock Out</div>
          <div className="mt-1 text-2xl font-semibold text-rose-700">-{kpis.outQty.toLocaleString()}</div>
        </Card>

        <Card className={cn("p-4", luxuryCard)}>
          <div className="text-xs text-muted-foreground">Net</div>
          <div className={cn("mt-1 text-2xl font-semibold", kpis.net >= 0 ? "text-emerald-800" : "text-rose-800")}>
            {kpis.net >= 0 ? "+" : ""}
            {kpis.net.toLocaleString()}
          </div>
        </Card>

        <Card className={cn("p-4", luxuryCard)}>
          <div className="text-xs text-muted-foreground">Adjustments</div>
          <div className="mt-1 text-2xl font-semibold">{kpis.adjCount}</div>
        </Card>
      </div>

      {/* Filters (Luxury Bar) */}
      <Card className={cn("p-4", luxuryCard)}>
        <div className="grid gap-3 lg:grid-cols-[1fr_220px_170px_170px_auto] lg:items-end">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-10"
              placeholder="Search product / SKU / reference / notes…"
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
            />
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Type</Label>
            <select
              className="mt-2 h-10 w-full rounded-md border bg-background px-3"
              value={type}
              onChange={(e) => setType(e.target.value as any)}
            >
              <option value="ALL">All</option>
              <option value="IN">Stock In</option>
              <option value="OUT">Stock Out</option>
              <option value="ADJUSTMENT">Adjustment</option>
            </select>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">From</Label>
            <Input className="mt-2" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">To</Label>
            <Input className="mt-2" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>

          <Button
            variant="outline"
            onClick={() => {
              setQInput("");
              setType("ALL");
              setFrom("");
              setTo("");
            }}
          >
            Clear
          </Button>
        </div>
      </Card>

      {/* Table */}
      <Card className={cn("overflow-hidden", luxuryCard)}>
        <div className="border-b bg-gradient-to-r from-background to-muted/30 px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">
              History
              <span className="ml-2 text-xs text-muted-foreground">{movementsQ.isLoading ? "Loading…" : `${rows.length} record(s)`}</span>
            </div>
            <div className="text-xs text-muted-foreground">
              Tip: IN adds stock • OUT consumes stock • ADJUSTMENT sets a new stock value (trigger applies)
            </div>
          </div>
        </div>

        <div className="overflow-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <colgroup>
              <col style={{ width: "16%" }} />
              <col style={{ width: "32%" }} />
              <col style={{ width: "14%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "14%" }} />
              <col style={{ width: "12%" }} />
            </colgroup>

            <thead className="sticky top-0 z-10 bg-background/90 backdrop-blur border-b">
              <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Product</th>
                <th className="px-4 py-3 text-left">Type</th>
                <th className="px-4 py-3 text-right">Qty</th>
                <th className="px-4 py-3 text-left">Reference / Source</th>
                <th className="px-4 py-3 text-left">Notes</th>
              </tr>
            </thead>

            <tbody className="divide-y">
              {movementsQ.isLoading ? (
                <tr>
                  <td className="px-4 py-10 text-muted-foreground" colSpan={6}>
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td className="px-4 py-10 text-muted-foreground" colSpan={6}>
                    No movements found.
                  </td>
                </tr>
              ) : (
                rows.map((m) => {
                  const cfg = typeBadge(m.movement_type);
                  const Icon = cfg.icon;
                  const p = m.product;

                  const skuLine = [p?.sku, p?.item_code].filter(Boolean).join(" • ");
                  const sign = m.movement_type === "IN" ? "+" : m.movement_type === "OUT" ? "-" : "";

                  return (
                    <tr key={m.id} className="hover:bg-muted/30">
                      <td className="px-4 py-4 text-muted-foreground">
                        <div className="font-medium text-foreground">{format(new Date(m.movement_date || m.created_at), "MMM dd, yyyy")}</div>
                        <div className="text-xs">{format(new Date(m.movement_date || m.created_at), "HH:mm")}</div>
                      </td>

                      <td className="px-4 py-4">
                        <div className="font-semibold">{p?.name || `Product #${m.product_id}`}</div>
                        {skuLine ? <div className="text-xs text-muted-foreground">{skuLine}</div> : null}
                      </td>

                      <td className="px-4 py-4">
                        <Badge className={cn("border px-3 py-1 text-xs font-semibold gap-2", cfg.cls)} variant="secondary">
                          <Icon className="h-3.5 w-3.5" />
                          {cfg.label}
                        </Badge>
                      </td>

                      <td className={cn("px-4 py-4 text-right font-semibold", m.movement_type === "IN" ? "text-emerald-700" : m.movement_type === "OUT" ? "text-rose-700" : "text-amber-700")}>
                        {sign}
                        {n(m.quantity).toLocaleString()}
                      </td>

                      <td className="px-4 py-4">
                        {m.reference ? <div className="font-medium">{m.reference}</div> : <div className="text-muted-foreground">—</div>}
                        {m.source_table && m.source_id ? (
                          <div className="text-xs text-muted-foreground">{prettySource(m.source_table, m.source_id)}</div>
                        ) : null}
                      </td>

                      <td className="px-4 py-4 text-muted-foreground">
                        <div className="line-clamp-2">{m.notes || "—"}</div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="border-t px-4 py-3 text-xs text-muted-foreground">
          Stock is applied by DB trigger <b>trg_apply_stock_movement()</b>. Manual edits update only the movement log.
        </div>
      </Card>

      {/* Create Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Record Stock Movement</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>Product *</Label>
              <select
                className="h-10 rounded-md border bg-background px-3"
                value={form.product_id}
                onChange={(e) => setForm((p) => ({ ...p, product_id: e.target.value }))}
              >
                <option value="">Select a product…</option>
                {products.map((p) => (
                  <option key={p.id} value={String(p.id)}>
                    {p.name} — {p.sku} {p.current_stock != null ? `(Stock: ${p.current_stock})` : ""}
                  </option>
                ))}
              </select>
              {productsQ.isLoading ? <div className="text-xs text-muted-foreground">Loading products…</div> : null}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Type *</Label>
                <select
                  className="h-10 rounded-md border bg-background px-3"
                  value={form.movement_type}
                  onChange={(e) => setForm((p) => ({ ...p, movement_type: e.target.value as MovementType }))}
                >
                  <option value="IN">Stock In</option>
                  <option value="OUT">Stock Out</option>
                  <option value="ADJUSTMENT">Adjustment</option>
                </select>
              </div>

              <div className="grid gap-2">
                <Label>{form.movement_type === "ADJUSTMENT" ? "New Stock Value *" : "Quantity *"}</Label>
                <Input
                  ref={qtyRef}
                  inputMode="decimal"
                  type="number"
                  min={0}
                  step="0.01"
                  value={String(form.quantity)}
                  onChange={(e) => setForm((p) => ({ ...p, quantity: n(e.target.value) }))}
                />
                <div className="text-[11px] text-muted-foreground">
                  {form.movement_type === "ADJUSTMENT"
                    ? "Adjustment saves the new stock value (DB trigger applies the difference)."
                    : "Quantity must be greater than 0 (DB constraint)."}
                </div>
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Reference</Label>
              <Input
                placeholder='Optional (e.g., "DAMAGED", "SUPPLIER:ABC", "MANUAL")'
                value={form.reference}
                onChange={(e) => setForm((p) => ({ ...p, reference: e.target.value }))}
              />
            </div>

            <div className="grid gap-2">
              <Label>Notes</Label>
              <Textarea
                rows={3}
                placeholder="Optional notes for audit trail"
                value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                className="gradient-primary shadow-glow text-primary-foreground"
                onClick={() => {
                  if (!form.product_id) return toast.error("Please select a product");
                  if (n(form.quantity) <= 0) return toast.error("Quantity must be greater than 0");
                  createM.mutate();
                }}
                disabled={createM.isPending}
              >
                {createM.isPending ? "Saving..." : "Record"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
