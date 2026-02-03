// src/pages/InvoiceView.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

import { getInvoice, updateInvoiceHeader } from "@/lib/invoices";
import { listInvoiceItems, insertInvoiceItem, deleteInvoiceItem } from "@/lib/invoiceItems";
import { listCustomers } from "@/lib/customers";
import { listProducts } from "@/lib/products";
import { calcLine, round2 } from "@/lib/invoiceTotals";

import type { Invoice } from "@/types/invoice";
import type { Product } from "@/types/product";
import { waLink, invoiceShareMessage } from "@/lib/whatsapp";

const WA_PHONE = "2307788884";

/* =========================
   helpers
========================= */
function n2(v: any) {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}
function int0(v: any) {
  const x = Math.trunc(n2(v));
  return x < 0 ? 0 : x;
}
function clampPct(v: any) {
  const x = n2(v);
  return Math.max(0, Math.min(100, x));
}
function money(v: any) {
  const n = n2(v);
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function isValidId(v: any) {
  return Number.isFinite(Number(v)) && Number(v) > 0;
}

/* simple debounce */
function useDebouncedValue<T>(value: T, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/**
 * OPTION A (Totals-level manual discount)
 * - DOES NOT modify invoice_items
 * - Discount is applied when user clicks "Apply Discount"
 * - Works with mixed VAT lines (0% and 15%) by discounting each line base proportionally
 */
function computeTotalsWithManualDiscount(params: {
  items: any[];
  discountPercent: number;
  previousBalance: number;
  amountPaid: number;
}) {
  const { items, discountPercent, previousBalance, amountPaid } = params;
  const dp = clampPct(discountPercent);

  // Base (excl) subtotal per line
  const lineBases = (items || []).map((it) => {
    const qty = n2(it.total_qty);
    const unitEx = n2(it.unit_price_excl_vat);
    const vatRate = n2(it.vat_rate ?? 0); // per line
    const base = round2(qty * unitEx);
    return { qty, unitEx, vatRate, base };
  });

  const subtotalBase = round2(lineBases.reduce((s, l) => s + l.base, 0));
  const discountAmount = dp > 0 ? round2((subtotalBase * dp) / 100) : 0;

  // Apply discount proportionally to every line base (same % for all)
  const discountedBases = lineBases.map((l) => ({
    ...l,
    baseAfter: round2(l.base * (1 - dp / 100)),
  }));

  // VAT recompute per-line with its own vatRate
  const vatAmount = round2(
    discountedBases.reduce((s, l) => {
      if (l.vatRate <= 0) return s;
      return s + round2((l.baseAfter * l.vatRate) / 100);
    }, 0)
  );

  const subtotalAfterDiscount = round2(discountedBases.reduce((s, l) => s + l.baseAfter, 0));
  const totalAmount = round2(subtotalAfterDiscount + vatAmount);

  const grossTotal = round2(totalAmount + n2(previousBalance));
  const balance = round2(Math.max(0, grossTotal - n2(amountPaid)));

  return {
    subtotalAfterDiscount,
    vatAmount,
    totalAmount,
    discountAmount,
    grossTotal,
    balanceRemaining: balance,
  };
}

export default function InvoiceView() {
  const { id } = useParams();
  const invoiceId = Number(id);
  const nav = useNavigate();
  const qc = useQueryClient();

  /* =========================
     UI STATE
  ========================= */
  const [productSearch, setProductSearch] = useState("");
  const debouncedProductSearch = useDebouncedValue(productSearch, 250);

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [boxQty, setBoxQty] = useState<string>("0");
  const [pcsQty, setPcsQty] = useState<string>("0");

  // local editable header fields (avoid API spam)
  const [hdrInvoiceDate, setHdrInvoiceDate] = useState("");
  const [hdrDueDate, setHdrDueDate] = useState("");
  const [hdrVatPercent, setHdrVatPercent] = useState<string>("15");
  const [hdrDiscountPercent, setHdrDiscountPercent] = useState<string>("0");

  /* =========================
     LOAD DATA
  ========================= */
  const invoiceQ = useQuery({
    queryKey: ["invoice", invoiceId],
    queryFn: () => getInvoice(invoiceId),
    enabled: isValidId(invoiceId),
    staleTime: 10_000,
  });

  const itemsQ = useQuery({
    queryKey: ["invoice_items", invoiceId],
    queryFn: () => listInvoiceItems(invoiceId),
    enabled: isValidId(invoiceId),
    staleTime: 10_000,
  });

  const customersQ = useQuery({
    queryKey: ["customers", "all-lite"],
    queryFn: () => listCustomers({ activeOnly: false, limit: 3000 }),
    enabled: !!invoiceQ.data?.customer_id,
    staleTime: 60_000,
  });

  const inv = invoiceQ.data as any;
  const items = itemsQ.data || [];

  // hydrate local header state when invoice loads
  useEffect(() => {
    if (!inv) return;
    setHdrInvoiceDate(String(inv.invoice_date || ""));
    setHdrDueDate(String(inv.due_date || ""));
    setHdrVatPercent(String(inv.vat_percent ?? 15));
    setHdrDiscountPercent(String(inv.discount_percent ?? 0));
  }, [inv?.id]);

  // products query (debounced)
  const productsQ = useQuery({
    queryKey: ["products", debouncedProductSearch],
    queryFn: () => listProducts({ q: debouncedProductSearch, activeOnly: true, limit: 80 }),
    enabled: debouncedProductSearch.trim().length > 0,
    staleTime: 15_000,
  });

  const customer = useMemo(() => {
    if (!inv) return null;
    return customersQ.data?.find((c: any) => c.id === inv.customer_id) ?? null;
  }, [customersQ.data, inv?.customer_id, inv]);

  /* =========================
     WhatsApp share
  ========================= */
  const waHref = useMemo(() => {
    if (!inv) return "#";
    const msg = invoiceShareMessage({ invoiceNo: inv.invoice_number, invoiceId: inv.id });
    return waLink(WA_PHONE, msg);
  }, [inv?.id, inv?.invoice_number]);

  /* =========================
     MUTATIONS
  ========================= */

  // Save header fields only (does NOT auto-apply discount to totals)
  const saveHeaderM = useMutation({
    mutationFn: async () => {
      if (!inv) throw new Error("Invoice not loaded");

      const patch: Partial<Invoice> = {
        invoice_date: hdrInvoiceDate || inv.invoice_date,
        due_date: hdrDueDate ? hdrDueDate : null,
        vat_percent: clampPct(hdrVatPercent), // ok
        discount_percent: clampPct(hdrDiscountPercent), // just store it
      } as any;

      await updateInvoiceHeader(invoiceId, patch);

      await qc.invalidateQueries({ queryKey: ["invoice", invoiceId] });
    },
    onSuccess: () => toast.success("Header saved"),
    onError: (e: any) => toast.error(e?.message || "Failed to save header"),
  });

  /**
   * ✅ APPLY DISCOUNT (Manual button)
   * - Computes discount totals-level (Option A)
   * - Writes discount_amount and discounted totals into invoices table
   * - DOES NOT touch invoice_items
   */
  const applyDiscountM = useMutation({
    mutationFn: async () => {
      if (!inv) throw new Error("Invoice not loaded");

      const dp = clampPct(hdrDiscountPercent);

      // Store the discount_percent first (for audit/printing)
      const updated = await updateInvoiceHeader(invoiceId, {
        discount_percent: dp,
      } as any);

      const freshItems = await listInvoiceItems(invoiceId);

      const totals = computeTotalsWithManualDiscount({
        items: freshItems,
        discountPercent: dp,
        previousBalance: n2(updated.previous_balance),
        amountPaid: n2(updated.amount_paid),
      });

      // Write discounted totals
      await updateInvoiceHeader(invoiceId, {
        subtotal: totals.subtotalAfterDiscount,
        vat_amount: totals.vatAmount,
        total_amount: totals.totalAmount,
        total_excl_vat: totals.subtotalAfterDiscount,
        total_incl_vat: totals.totalAmount,

        discount_amount: totals.discountAmount,

        gross_total: totals.grossTotal,
        balance_remaining: totals.balanceRemaining,
        balance_due: totals.balanceRemaining,
      } as any);

      await qc.invalidateQueries({ queryKey: ["invoice", invoiceId] });
      await qc.invalidateQueries({ queryKey: ["invoice_items", invoiceId] });
    },
    onSuccess: () => toast.success("Discount applied"),
    onError: (e: any) => toast.error(e?.message || "Failed to apply discount"),
  });

  /**
   * Recalculate Totals (NO automatic discount)
   * - Useful after adding/removing items
   * - Keeps whatever discount_amount is currently stored (doesn't recompute it)
   *
   * If you want: only recalc base totals here, and user clicks Apply Discount again.
   */
  const recalcBaseTotalsM = useMutation({
    mutationFn: async () => {
      if (!inv) throw new Error("Invoice not loaded");

      const freshItems = await listInvoiceItems(invoiceId);

      const subtotalEx = round2(
        freshItems.reduce((sum: number, it: any) => {
          const qty = n2(it.total_qty);
          const unitEx = n2(it.unit_price_excl_vat);
          return sum + qty * unitEx;
        }, 0)
      );

      const vatAmount = round2(
        freshItems.reduce((sum: number, it: any) => {
          const qty = n2(it.total_qty);
          const unitVat = n2(it.unit_vat);
          return sum + qty * unitVat;
        }, 0)
      );

      const totalAmount = round2(subtotalEx + vatAmount);

      const prev = n2(inv.previous_balance);
      const paid = n2(inv.amount_paid);

      const grossTotal = round2(totalAmount + prev);
      const balance = round2(Math.max(0, grossTotal - paid));

      await updateInvoiceHeader(invoiceId, {
        subtotal: subtotalEx,
        vat_amount: vatAmount,
        total_amount: totalAmount,
        total_excl_vat: subtotalEx,
        total_incl_vat: totalAmount,

        // IMPORTANT: do NOT touch discount_amount here (manual)
        gross_total: grossTotal,
        balance_remaining: balance,
        balance_due: balance,
      } as any);

      await qc.invalidateQueries({ queryKey: ["invoice", invoiceId] });
    },
    onSuccess: () => toast.success("Totals recalculated (base)"),
    onError: (e: any) => toast.error(e?.message || "Failed to recalculate totals"),
  });

  const addItemM = useMutation({
    mutationFn: async () => {
      if (!inv) throw new Error("Invoice not loaded");
      if (!selectedProduct) throw new Error("Select a product");

      const vatRate = clampPct(hdrVatPercent); // use current header vat in UI

      const bq = int0(boxQty);
      const pq = int0(pcsQty);
      if (bq <= 0 && pq <= 0) throw new Error("Enter BOX or PCS quantity");

      const uom: "BOX" | "PCS" = pq > 0 && bq <= 0 ? "PCS" : "BOX";
      const unitsPerBox = Math.max(1, int0((selectedProduct as any).units_per_box ?? 1));

      // ✅ Option A: DO NOT discount line automatically
      const baseEx = n2((selectedProduct as any).selling_price); // EXCL VAT

      const line = calcLine({
        boxQty: uom === "BOX" ? bq : 0,
        pcsQty: uom === "PCS" ? pq : 0,
        unitsPerBox,
        sellingPriceExclVat: baseEx,
        vatRate,
      });

      if (line.total_qty <= 0) throw new Error("Quantity must be greater than zero");

      await insertInvoiceItem({
        invoice_id: invoiceId,
        product_id: (selectedProduct as any).id,

        uom,
        box_qty: line.box_qty,
        pcs_qty: line.pcs_qty,
        units_per_box: line.units_per_box,
        total_qty: line.total_qty,

        unit_price_excl_vat: line.unit_price_excl_vat,
        vat_rate: vatRate,
        unit_vat: line.unit_vat,
        unit_price_incl_vat: line.unit_price_incl_vat,
        line_total: line.line_total,

        description: (selectedProduct as any).name,
      });

      await qc.invalidateQueries({ queryKey: ["invoice_items", invoiceId] });

      // After item add: recalc base totals, user can click Apply Discount again if needed
      await recalcBaseTotalsM.mutateAsync();

      setSelectedProduct(null);
      setBoxQty("0");
      setPcsQty("0");
      setProductSearch("");
    },
    onSuccess: () => toast.success("Item added"),
    onError: (e: any) => toast.error(e?.message || "Failed to add item"),
  });

  const delItemM = useMutation({
    mutationFn: async (itemId: number) => {
      if (!inv) throw new Error("Invoice not loaded");

      await deleteInvoiceItem(itemId);
      await qc.invalidateQueries({ queryKey: ["invoice_items", invoiceId] });

      // After delete: recalc base totals, user can click Apply Discount again if needed
      await recalcBaseTotalsM.mutateAsync();

      await qc.invalidateQueries({ queryKey: ["invoice", invoiceId] });
    },
    onSuccess: () => toast.success("Item removed"),
    onError: (e: any) => toast.error(e?.message || "Failed to remove item"),
  });

  /* =========================
     DERIVED
  ========================= */
  const isLoading =
    invoiceQ.isLoading ||
    itemsQ.isLoading ||
    (customersQ.isLoading && !!invoiceQ.data?.customer_id);

  const productsList = productsQ.data || [];
  const hasProductsSearch = debouncedProductSearch.trim().length > 0;

  /* =========================
     RENDER
  ========================= */
  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading invoice…</div>;
  }

  if (!inv) {
    return <div className="text-sm text-destructive">Invoice not found</div>;
  }

  return (
    <div className="space-y-5">
      {/* HEADER */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-2xl font-semibold truncate">Invoice {inv.invoice_number}</div>
          <div className="text-sm text-muted-foreground truncate">
            Status: {inv.status} • Customer: {customer?.name || `#${inv.customer_id}`}
          </div>
        </div>

        <div className="flex gap-2 shrink-0">
          <Button variant="outline" onClick={() => nav("/invoices")}>
            Back
          </Button>

          <Button variant="outline" onClick={() => nav(`/invoices/${invoiceId}/print`)}>
            Print
          </Button>

          <Button asChild variant="outline">
            <a href={waHref} target="_blank" rel="noreferrer">
              Send via WhatsApp
            </a>
          </Button>
        </div>
      </div>

      {/* INVOICE HEADER */}
      <Card className="p-4 shadow-premium space-y-3">
        <div className="grid gap-3 md:grid-cols-4">
          <Input type="date" value={hdrInvoiceDate} onChange={(e) => setHdrInvoiceDate(e.target.value)} />
          <Input type="date" value={hdrDueDate} onChange={(e) => setHdrDueDate(e.target.value)} placeholder="Due date" />
          <Input inputMode="decimal" value={hdrVatPercent} onChange={(e) => setHdrVatPercent(e.target.value)} placeholder="VAT %" />
          <Input
            inputMode="decimal"
            value={hdrDiscountPercent}
            onChange={(e) => setHdrDiscountPercent(e.target.value)}
            placeholder="Discount %"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            className="gradient-primary text-primary-foreground"
            onClick={() => saveHeaderM.mutate()}
            disabled={saveHeaderM.isPending}
          >
            {saveHeaderM.isPending ? "Saving..." : "Save Header"}
          </Button>

          <Button
            variant="outline"
            onClick={() => applyDiscountM.mutate()}
            disabled={applyDiscountM.isPending}
            title="Manual: apply discount to totals only"
          >
            {applyDiscountM.isPending ? "Applying..." : "Apply Discount"}
          </Button>

          <Button
            variant="outline"
            onClick={() => recalcBaseTotalsM.mutate()}
            disabled={recalcBaseTotalsM.isPending}
            title="Recalculate base totals from items (no discount auto)"
          >
            {recalcBaseTotalsM.isPending ? "Recalculating..." : "Recalculate Totals"}
          </Button>
        </div>

        <div className="text-xs text-muted-foreground">
          Option A: Items stay at base price. Click <b>Apply Discount</b> to update totals + discount amount.
        </div>
      </Card>

      {/* ADD ITEM */}
      <Card className="p-4 shadow-premium space-y-3">
        <div className="grid gap-3 md:grid-cols-[1fr_auto_auto_auto]">
          <Input placeholder="Search product…" value={productSearch} onChange={(e) => setProductSearch(e.target.value)} />
          <Input placeholder="BOX" value={boxQty} onChange={(e) => setBoxQty(e.target.value)} />
          <Input placeholder="PCS" value={pcsQty} onChange={(e) => setPcsQty(e.target.value)} />
          <Button className="gradient-primary text-primary-foreground" disabled={!selectedProduct || addItemM.isPending} onClick={() => addItemM.mutate()}>
            {addItemM.isPending ? "Adding..." : "Add"}
          </Button>
        </div>

        <div className="border rounded-xl max-h-64 overflow-auto divide-y">
          {!hasProductsSearch ? (
            <div className="p-4 text-sm text-muted-foreground">Start typing to search products…</div>
          ) : productsQ.isLoading ? (
            <div className="p-4 text-sm text-muted-foreground">Searching…</div>
          ) : productsList.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">No products found.</div>
          ) : (
            productsList.map((p: any) => (
              <button
                key={p.id}
                onClick={() => setSelectedProduct(p)}
                className={`w-full text-left px-4 py-2 hover:bg-accent transition ${
                  (selectedProduct as any)?.id === p.id ? "bg-accent" : ""
                }`}
                type="button"
              >
                <div className="font-medium">{p.name}</div>
                <div className="text-xs text-muted-foreground">
                  SKU: {p.sku || "-"} • Unit Excl VAT: {money(p.selling_price)} • UPB: {p.units_per_box ?? "-"}
                </div>
              </button>
            ))
          )}
        </div>
      </Card>

      {/* ITEMS */}
      <Card className="overflow-hidden shadow-premium">
        <div className="divide-y">
          {items.map((it: any) => (
            <div key={it.id} className="px-4 py-3 flex justify-between items-center gap-3">
              <div className="min-w-0">
                <div className="font-medium truncate">{it.product?.name || it.description}</div>
                <div className="text-xs text-muted-foreground">
                  UOM: {String(it.uom || "BOX").toUpperCase()} • Qty: {it.total_qty} • Unit incl VAT: {money(it.unit_price_incl_vat)}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <div className="font-semibold">{money(it.line_total)}</div>
                <Button variant="outline" onClick={() => delItemM.mutate(it.id)} disabled={delItemM.isPending}>
                  Remove
                </Button>
              </div>
            </div>
          ))}

          {!itemsQ.isLoading && items.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">No items yet.</div>
          )}
        </div>
      </Card>

      {/* TOTALS */}
      <Card className="p-4 shadow-premium">
        <div className="grid md:grid-cols-2 gap-2">
          <div>Subtotal: {money(inv.subtotal)}</div>
          <div>VAT: {money(inv.vat_amount)}</div>
          <div>Discount: {money(inv.discount_amount)}</div>
          <div>Gross: {money(inv.gross_total)}</div>
          <div className="md:col-span-2 font-semibold">Total: {money(inv.total_amount)}</div>
        </div>
      </Card>
    </div>
  );
}

