// src/pages/StockMovements.tsx
import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

import { format } from "date-fns";
import { Plus, ArrowDown, ArrowUp, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";

/* =========================
   Types
========================= */
type MovementType = "IN" | "OUT" | "ADJUSTMENT";

type Product = {
  id: number;
  name: string;
  sku: string;
  current_stock: number;
};

type Movement = {
  id: number;
  product_id: number;
  movement_type: MovementType;
  quantity: number;
  movement_date: string;
  reference?: string;
  source_table?: string;
  source_id?: number;
  notes?: string;
  product?: Product;
};

/* =========================
   Data
========================= */
async function listProducts() {
  const { data, error } = await supabase
    .from("products")
    .select("id,name,sku,current_stock")
    .order("name");

  if (error) throw error;
  return data as Product[];
}

async function listMovements() {
  const { data, error } = await supabase
    .from("stock_movements")
    .select(`
      *,
      product:products(id,name,sku,current_stock)
    `)
    .order("movement_date", { ascending: false })
    .limit(2000);

  if (error) throw error;
  return data as Movement[];
}

async function createMovement(payload: any) {
  const { error } = await supabase.from("stock_movements").insert(payload);
  if (error) throw error;
}

/* =========================
   UI
========================= */
export default function StockMovements() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const [form, setForm] = useState({
    product_id: "",
    movement_type: "IN" as MovementType,
    quantity: 0,
    reference: "",
    notes: "",
  });

  const productsQ = useQuery({
    queryKey: ["products-mini"],
    queryFn: listProducts,
  });

  const movementsQ = useQuery({
    queryKey: ["stock-movements"],
    queryFn: listMovements,
  });

  const rows = movementsQ.data || [];
  const products = productsQ.data || [];

  const createM = useMutation({
    mutationFn: () =>
      createMovement({
        product_id: Number(form.product_id),
        movement_type: form.movement_type,
        quantity: Number(form.quantity),
        reference: form.reference || null,
        notes: form.notes || null,
      }),
    onSuccess: async () => {
      toast.success("Movement recorded");
      setOpen(false);
      setForm({
        product_id: "",
        movement_type: "IN",
        quantity: 0,
        reference: "",
        notes: "",
      });
      await qc.invalidateQueries({ queryKey: ["stock-movements"] });
      await qc.invalidateQueries({ queryKey: ["products-mini"] });
    },
  });

  const kpi = useMemo(() => {
    let inQty = 0;
    let outQty = 0;
    rows.forEach((r) => {
      if (r.movement_type === "IN") inQty += r.quantity;
      if (r.movement_type === "OUT") outQty += r.quantity;
    });
    return { inQty, outQty, net: inQty - outQty };
  }, [rows]);

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex justify-between items-end">
        <div>
          <div className="text-3xl font-semibold">Stock Movements</div>
          <div className="text-sm text-muted-foreground">
            Complete audit trail of invoices, credit notes & manual entries
          </div>
        </div>

        <Button
          className="gradient-primary shadow-glow text-primary-foreground"
          onClick={() => setOpen(true)}
        >
          <Plus className="mr-2 h-4 w-4" />
          New Record
        </Button>
      </div>

      {/* KPI */}
      <div className="grid md:grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Stock In</div>
          <div className="text-2xl font-bold text-emerald-700">
            +{kpi.inQty.toLocaleString()}
          </div>
        </Card>

        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Stock Out</div>
          <div className="text-2xl font-bold text-rose-700">
            -{kpi.outQty.toLocaleString()}
          </div>
        </Card>

        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Net</div>
          <div className="text-2xl font-bold">
            {kpi.net >= 0 ? "+" : ""}
            {kpi.net.toLocaleString()}
          </div>
        </Card>
      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="px-4 py-3 text-left">Date</th>
              <th className="px-4 py-3 text-left">Product</th>
              <th className="px-4 py-3 text-left">Type</th>
              <th className="px-4 py-3 text-right">Qty</th>
              <th className="px-4 py-3 text-left">Reference</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id} className="border-t hover:bg-muted/30">
                <td className="px-4 py-3">
                  {format(new Date(m.movement_date), "dd MMM yyyy HH:mm")}
                </td>
                <td className="px-4 py-3">
                  {m.product?.name} <br />
                  <span className="text-xs text-muted-foreground">
                    {m.product?.sku}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <Badge>
                    {m.movement_type === "IN" && <ArrowDown className="h-3 w-3 mr-1" />}
                    {m.movement_type === "OUT" && <ArrowUp className="h-3 w-3 mr-1" />}
                    {m.movement_type === "ADJUSTMENT" && <SlidersHorizontal className="h-3 w-3 mr-1" />}
                    {m.movement_type}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right font-semibold">
                  {m.movement_type === "IN" ? "+" : "-"}
                  {m.quantity.toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  {m.reference || "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* New Record Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg space-y-4">
          <div className="text-lg font-semibold">Record Movement</div>

          <div className="grid gap-3">
            <div>
              <Label>Product</Label>
              <select
                className="w-full h-10 border rounded-md px-3"
                value={form.product_id}
                onChange={(e) =>
                  setForm((p) => ({ ...p, product_id: e.target.value }))
                }
              >
                <option value="">Select product...</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {p.sku} (Stock: {p.current_stock})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Type</Label>
                <select
                  className="w-full h-10 border rounded-md px-3"
                  value={form.movement_type}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      movement_type: e.target.value as MovementType,
                    }))
                  }
                >
                  <option value="IN">Stock In</option>
                  <option value="OUT">Stock Out</option>
                  <option value="ADJUSTMENT">Adjustment</option>
                </select>
              </div>

              <div>
                <Label>Quantity</Label>
                <Input
                  type="number"
                  value={form.quantity}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      quantity: Number(e.target.value),
                    }))
                  }
                />
              </div>
            </div>

            <div>
              <Label>Reference</Label>
              <Input
                value={form.reference}
                onChange={(e) =>
                  setForm((p) => ({ ...p, reference: e.target.value }))
                }
              />
            </div>

            <div>
              <Label>Notes</Label>
              <Textarea
                rows={3}
                value={form.notes}
                onChange={(e) =>
                  setForm((p) => ({ ...p, notes: e.target.value }))
                }
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (!form.product_id) return toast.error("Select product");
                  if (form.quantity <= 0) return toast.error("Invalid quantity");
                  createM.mutate();
                }}
              >
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
