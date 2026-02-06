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
import { round2 } from "@/lib/invoiceTotals";

import type { Invoice } from "@/types/invoice";
import type { Product } from "@/types/product";

/** ✅ your domain (same idea as Invoices.tsx) */
const APP_ORIGIN = "https://rampotteryhub.com";

/* =========================
   helpers
========================= */
function n2(v: any) {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}
function clampPct(v: any) {
  const x = n2(v);
  return Math.max(0, Math.min(100, x));
}
function money(v: any) {
  const n = n2(v);
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function rs(v: any) {
  return `Rs ${n2(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function isValidId(v: any) {
  return Number.isFinite(Number(v)) && Number(v) > 0;
}
function roundKg(v: any) {
  return Math.round(n2(v) * 1000) / 1000;
}
function fmtQty(uom: string, v: any) {
  const x = n2(v);
  if (String(uom || "").toUpperCase() === "KG") {
    return new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 3 }).format(x);
  }
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.trunc(x));
}

/** ✅ phone normalization (same as Invoices.tsx logic) */
function digitsOnly(v: any) {
  return String(v ?? "").replace(/[^\d]/g, "");
}
function normalizeMuPhone(raw: any) {
  const d = digitsOnly(raw);
  if (d.length === 8) return "230" + d;
  if (d.startsWith("230") && d.length === 11) return d;
  return "";
}

/** ✅ WhatsApp text format (EXACT same structure as Invoices.tsx) */
function buildWhatsAppInvoiceText(opts: {
  customerName?: string;
  invoiceNo: string;
  invoiceAmount: number;
  amountPaid: number;
  amountDue: number;
  pdfUrl: string;
}) {
  return [
    "Ram Pottery Ltd",
    "",
    "Invoice details:",
    opts.customerName ? `Customer: ${opts.customerName}` : null,
    `Invoice: ${opts.invoiceNo}`,
    `Invoice Amount: ${rs(opts.invoiceAmount)}`,
    `Amount Paid: ${rs(opts.amountPaid)}`,
    `Amount Due: ${rs(opts.amountDue)}`,
    "",
    `Invoice PDF: ${opts.pdfUrl}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function openWhatsApp(to: string, text: string) {
  window.open(`https://wa.me/${to}?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
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

  const lineBases = (items || []).map((it) => {
    const qty = n2(it.total_qty);
    const unitEx = n2(it.unit_price_excl_vat);
    const vatRate = n2(it.vat_rate ?? 0);
    const base = round2(qty * unitEx);
    return { qty, unitEx, vatRate, base };
  });

  const subtotalBase = round2(lineBases.reduce((s, l) => s + l.base, 0));
  const discountAmount = dp > 0 ? round2((subtotalBase * dp) / 100) : 0;

  const discountedBases = lineBases.map((l) => ({
    ...l,
    baseAfter: round2(l.base * (1 - dp / 100)),
  }));

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

/* =========================
   Premium tiny UI atoms
   ✅ fixed visibility: uses foreground tokens (not text-white)
========================= */
function Pill(props: { children: React.ReactNode; tone?: "default" | "good" | "warn" | "bad" }) {
  const tone = props.tone || "default";

  const cls =
    tone === "good"
      ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/20"
      : tone === "warn"
      ? "bg-amber-500/10 text-amber-800 border-amber-500/20"
      : tone === "bad"
      ? "bg-rose-500/10 text-rose-700 border-rose-500/20"
      : "bg-slate-500/10 text-slate-700 border-slate-500/20";

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${cls}`}>
      {props.children}
    </span>
  );
}

function StatCard(props: { label: string; value: string; hint?: string; emphasize?: boolean }) {
  return (
    <div
      className={`rounded-2xl border bg-background p-4 shadow-premium ${
        props.emphasize ? "ring-1 ring-rose-500/25" : ""
      }`}
    >
      <div className="text-xs text-muted-foreground">{props.label}</div>
      <div className="mt-1 text-lg font-semibold tracking-tight text-foreground">{props.value}</div>
      {props.hint ? <div className="mt-1 text-xs text-muted-foreground">{props.hint}</div> : null}
    </div>
  );
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

  // qty + uom for add
  const [addUom, setAddUom] = useState<"BOX" | "PCS" | "KG">("BOX");
  const [qtyValue, setQtyValue] = useState<string>("0");
  const [unitsPerBoxOverride, setUnitsPerBoxOverride] = useState<string>(""); // optional for BOX

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
     ✅ FIXED: same message format as Invoices.tsx
     ✅ FIXED: send to CUSTOMER phone (not company WA_PHONE)
  ========================= */
  const waTo = useMemo(() => {
    const c: any = customer || {};
    return normalizeMuPhone(c.whatsapp || c.phone || inv?.customer_whatsapp || inv?.customer_phone);
  }, [customer, inv?.customer_whatsapp, inv?.customer_phone]);

  const waMsg = useMemo(() => {
    if (!inv) return "";

    const invNo = inv.invoice_number || `#${inv.id}`;
    const gross = n2(inv.gross_total ?? inv.total_amount);
    const paid = n2(inv.amount_paid);
    const due = Math.max(0, n2(inv.balance_remaining ?? (gross - paid))); // ✅ nullish (not ||)

    const pdfUrl = `${APP_ORIGIN}/invoices/${inv.id}/print`;

    return buildWhatsAppInvoiceText({
      customerName: (customer as any)?.name || inv.customer_name,
      invoiceNo: invNo,
      invoiceAmount: gross,
      amountPaid: paid,
      amountDue: due,
      pdfUrl,
    });
  }, [customer, inv]);

  function onSendWhatsApp() {
    if (!waTo) {
      toast.error("No WhatsApp/phone number found for this customer.");
      return;
    }
    openWhatsApp(waTo, waMsg);
  }

  /* =========================
     MUTATIONS
  ========================= */
  const saveHeaderM = useMutation({
    mutationFn: async () => {
      if (!inv) throw new Error("Invoice not loaded");

      const patch: Partial<Invoice> = {
        invoice_date: hdrInvoiceDate || inv.invoice_date,
        due_date: hdrDueDate ? hdrDueDate : null,
        vat_percent: clampPct(hdrVatPercent),
        discount_percent: clampPct(hdrDiscountPercent),
      } as any;

      await updateInvoiceHeader(invoiceId, patch);
      await qc.invalidateQueries({ queryKey: ["invoice", invoiceId] });
    },
    onSuccess: () => toast.success("Header saved"),
    onError: (e: any) => toast.error(e?.message || "Failed to save header"),
  });

  const applyDiscountM = useMutation({
    mutationFn: async () => {
      if (!inv) throw new Error("Invoice not loaded");

      const dp = clampPct(hdrDiscountPercent);

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

        gross_total: grossTotal,
        balance_remaining: balance,
        balance_due: balance,
      } as any);

      await qc.invalidateQueries({ queryKey: ["invoice", invoiceId] });
    },
    onSuccess: () => toast.success("Totals recalculated"),
    onError: (e: any) => toast.error(e?.message || "Failed to recalculate totals"),
  });

  const addItemM = useMutation({
    mutationFn: async () => {
      if (!inv) throw new Error("Invoice not loaded");
      if (!selectedProduct) throw new Error("Select a product");

      const vatRate = clampPct(hdrVatPercent);
      const uom = addUom;

      const qty = uom === "KG" ? Math.max(0, roundKg(qtyValue)) : Math.max(0, Math.trunc(n2(qtyValue)));
      if (qty <= 0) throw new Error("Quantity must be greater than 0");

      const baseEx = n2((selectedProduct as any).selling_price); // EXCL VAT
      const unitVat = round2((baseEx * vatRate) / 100);
      const unitInc = round2(baseEx + unitVat);

      const unitsPerBox = Math.max(
        1,
        Math.trunc(
          n2(
            unitsPerBoxOverride.trim()
              ? unitsPerBoxOverride
              : (selectedProduct as any).units_per_box ?? 1
          )
        )
      );

      const totalQty = uom === "BOX" ? qty * unitsPerBox : qty;
      const lineTotal = round2(n2(totalQty) * n2(unitInc));

      await insertInvoiceItem({
        invoice_id: invoiceId,
        product_id: (selectedProduct as any).id,

        uom,

        box_qty: uom === "BOX" || uom === "KG" ? qty : 0,
        pcs_qty: uom === "PCS" ? qty : 0,

        units_per_box: uom === "BOX" ? unitsPerBox : 1,
        total_qty: totalQty,

        unit_price_excl_vat: baseEx,
        vat_rate: vatRate,
        unit_vat: unitVat,
        unit_price_incl_vat: unitInc,
        line_total: lineTotal,

        description: (selectedProduct as any).name,
      });

      await qc.invalidateQueries({ queryKey: ["invoice_items", invoiceId] });
      await recalcBaseTotalsM.mutateAsync();

      setSelectedProduct(null);
      setQtyValue("0");
      setUnitsPerBoxOverride("");
      setProductSearch("");
      setAddUom("BOX");
    },
    onSuccess: () => toast.success("Item added"),
    onError: (e: any) => toast.error(e?.message || "Failed to add item"),
  });

  const delItemM = useMutation({
    mutationFn: async (itemId: number) => {
      if (!inv) throw new Error("Invoice not loaded");

      await deleteInvoiceItem(itemId);
      await qc.invalidateQueries({ queryKey: ["invoice_items", invoiceId] });

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

  const statusTone = useMemo(() => {
    const s = String(inv?.status || "").toLowerCase();
    if (s.includes("paid")) return "good";
    if (s.includes("over") || s.includes("due")) return "warn";
    return "default";
  }, [inv?.status]);

  const selectedInfo = useMemo(() => {
    if (!selectedProduct) return null;
    return {
      name: (selectedProduct as any).name,
      sku: (selectedProduct as any).sku || "-",
      priceEx: money((selectedProduct as any).selling_price),
      upb: String((selectedProduct as any).units_per_box ?? "-"),
    };
  }, [selectedProduct]);

  /* =========================
     RENDER
  ========================= */
  if (isLoading) return <div className="text-sm text-muted-foreground">Loading invoice…</div>;
  if (!inv) return <div className="text-sm text-destructive">Invoice not found</div>;

  return (
    <div className="iv-root iv-invoice-view space-y-5">
      {/* HEADER */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-2xl font-semibold truncate text-foreground">
              Invoice {inv.invoice_number}
            </div>
            <Pill tone={statusTone as any}>Status: {String(inv.status || "—")}</Pill>
            <Pill>Customer: {(customer as any)?.name || `#${inv.customer_id}`}</Pill>
          </div>
          <div className="mt-1 text-sm text-muted-foreground truncate">
            Invoice ID #{inv.id} • Created: {String(inv.created_at || "").slice(0, 10)}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 shrink-0">
          <Button variant="outline" onClick={() => nav("/invoices")}>
            Back
          </Button>

          <Button variant="outline" onClick={() => nav(`/invoices/${invoiceId}/print`)}>
            Print
          </Button>

          {/* ✅ FIXED WhatsApp button (same format + sends to customer) */}
          <Button
            onClick={onSendWhatsApp}
            disabled={!waTo}
            className="gradient-primary text-primary-foreground shadow-glow"
            title={!waTo ? "No WhatsApp/phone for this customer" : "Send invoice details to WhatsApp"}
          >
            Send via WhatsApp
          </Button>
        </div>
      </div>

      {/* STATS STRIP */}
      <div className="grid gap-3 md:grid-cols-5">
        <StatCard label="Subtotal" value={rs(inv.subtotal)} />
        <StatCard label="VAT" value={rs(inv.vat_amount)} hint={`VAT %: ${money(inv.vat_percent ?? hdrVatPercent)}`} />
        <StatCard label="Discount" value={rs(inv.discount_amount)} hint={`Discount %: ${money(inv.discount_percent ?? hdrDiscountPercent)}`} />
        <StatCard label="Gross" value={rs(inv.gross_total)} />
        <StatCard label="Balance" value={rs(inv.balance_remaining)} emphasize />
      </div>

      {/* INVOICE HEADER */}
      <Card className="p-4 md:p-5 shadow-premium space-y-3 rounded-2xl">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground">Invoice Header</div>
            <div className="text-xs text-muted-foreground">
              Edit fields, then Save Header. Discount is manual (Apply Discount).
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={() => saveHeaderM.mutate()} disabled={saveHeaderM.isPending} className="gradient-primary text-primary-foreground shadow-glow">
              {saveHeaderM.isPending ? "Saving..." : "Save Header"}
            </Button>

            <Button variant="outline" onClick={() => applyDiscountM.mutate()} disabled={applyDiscountM.isPending} title="Manual: apply discount to totals only">
              {applyDiscountM.isPending ? "Applying..." : "Apply Discount"}
            </Button>

            <Button variant="outline" onClick={() => recalcBaseTotalsM.mutate()} disabled={recalcBaseTotalsM.isPending} title="Recalculate base totals from items">
              {recalcBaseTotalsM.isPending ? "Recalculating..." : "Recalculate Totals"}
            </Button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Invoice Date</div>
            <Input type="date" value={hdrInvoiceDate} onChange={(e) => setHdrInvoiceDate(e.target.value)} />
          </div>

          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Due Date</div>
            <Input type="date" value={hdrDueDate} onChange={(e) => setHdrDueDate(e.target.value)} placeholder="Due date" />
          </div>

          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">VAT %</div>
            <Input inputMode="decimal" value={hdrVatPercent} onChange={(e) => setHdrVatPercent(e.target.value)} placeholder="VAT %" />
          </div>

          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Discount % (manual)</div>
            <Input inputMode="decimal" value={hdrDiscountPercent} onChange={(e) => setHdrDiscountPercent(e.target.value)} placeholder="Discount %" />
          </div>
        </div>

        <div className="text-xs text-muted-foreground">
          Option A: Items stay at base price. Click <b>Apply Discount</b> to update totals + discount amount.
        </div>
      </Card>

      {/* ADD ITEM
          ✅ Updated to visually match the Items section style (same “row” feel + pills)
      */}
      <Card className="p-4 md:p-5 shadow-premium space-y-3 rounded-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-foreground">Add Item</div>
            <div className="text-xs text-muted-foreground">
              Search product, choose unit (BOX / PCS / Kg), then add quantity.
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="text-xs text-muted-foreground">Unit</div>
            <select
              className="h-10 rounded-xl border bg-background px-3 text-sm text-foreground outline-none"
              value={addUom}
              onChange={(e) => setAddUom(e.target.value as any)}
            >
              <option value="BOX">BOX</option>
              <option value="PCS">PCS</option>
              <option value="KG">Kg</option>
            </select>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-[1fr_200px_200px_auto]">
          <Input placeholder="Search product…" value={productSearch} onChange={(e) => setProductSearch(e.target.value)} />

          <Input
            placeholder={addUom === "KG" ? "Kg (e.g. 0.45)" : addUom === "PCS" ? "PCS" : "BOX"}
            value={qtyValue}
            onChange={(e) => setQtyValue(e.target.value)}
            inputMode={addUom === "KG" ? "decimal" : "numeric"}
          />

          <Input
            placeholder="UPB (optional)"
            value={unitsPerBoxOverride}
            onChange={(e) => setUnitsPerBoxOverride(e.target.value)}
            disabled={addUom !== "BOX"}
            inputMode="numeric"
            title="Units per box override (BOX only)"
          />

          <Button
            className="gradient-primary text-primary-foreground shadow-glow"
            disabled={!selectedProduct || addItemM.isPending}
            onClick={() => addItemM.mutate()}
          >
            {addItemM.isPending ? "Adding..." : "Add"}
          </Button>
        </div>

        {/* Selected product summary — same “pills” as Items rows */}
        {selectedInfo ? (
          <div className="rounded-2xl border bg-background p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-semibold text-foreground">{selectedInfo.name}</div>
              <div className="flex flex-wrap gap-2">
                <Pill>SKU: {selectedInfo.sku}</Pill>
                <Pill tone="bad">Unit Ex: {selectedInfo.priceEx}</Pill>
                <Pill>UPB: {selectedInfo.upb}</Pill>
              </div>
            </div>
          </div>
        ) : null}

        {/* Product results — styled like Items section rows */}
        <div className="border rounded-2xl overflow-hidden">
          {!hasProductsSearch ? (
            <div className="p-4 text-sm text-muted-foreground">Start typing to search products…</div>
          ) : productsQ.isLoading ? (
            <div className="p-4 text-sm text-muted-foreground">Searching…</div>
          ) : productsList.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">No products found.</div>
          ) : (
            <div className="divide-y">
              {productsList.map((p: any) => {
                const active = (selectedProduct as any)?.id === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => setSelectedProduct(p)}
                    className={`w-full text-left px-4 py-4 transition ${
                      active ? "bg-rose-50" : "hover:bg-slate-50"
                    }`}
                    type="button"
                  >
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="font-semibold text-foreground truncate">{p.name}</div>
                          <Pill>SKU: {p.sku || "-"}</Pill>
                          <Pill tone="bad">Unit ex: {money(p.selling_price)}</Pill>
                          <Pill>UPB: {p.units_per_box ?? "-"}</Pill>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground truncate">
                          Click to {active ? "keep selected" : "select"} this product
                        </div>
                      </div>

                      <div className="shrink-0 flex items-center gap-2">
                        <Pill tone={active ? "good" : "default"}>{active ? "Selected" : "Select"}</Pill>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </Card>

      {/* ITEMS */}
      <Card className="overflow-hidden shadow-premium rounded-2xl">
        <div className="px-4 py-4 border-b flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-foreground">Items</div>
            <div className="text-xs text-muted-foreground">Luxury list view — delete recalculates totals.</div>
          </div>
          <Pill>{items.length} item(s)</Pill>
        </div>

        <div className="divide-y">
          {items.map((it: any) => {
            const uom = String(it.uom || "BOX").toUpperCase();
            const qty = fmtQty(uom, it.total_qty);
            return (
              <div key={it.id} className="px-4 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="font-semibold text-foreground truncate">{it.product?.name || it.description}</div>
                    <Pill>UOM: {uom}</Pill>
                    <Pill tone="bad">Qty: {qty}</Pill>
                    <Pill>Unit inc: {money(it.unit_price_incl_vat)}</Pill>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Unit ex: {money(it.unit_price_excl_vat)} • VAT rate: {money(it.vat_rate)}% • Line VAT:{" "}
                    {money(n2(it.unit_vat) * n2(it.total_qty))}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 shrink-0">
                  <div className="text-foreground font-extrabold text-lg tabular-nums">Rs {money(it.line_total)}</div>
                  <Button variant="outline" onClick={() => delItemM.mutate(it.id)} disabled={delItemM.isPending}>
                    Remove
                  </Button>
                </div>
              </div>
            );
          })}

          {!itemsQ.isLoading && items.length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">No items yet.</div>
          )}
        </div>
      </Card>

      {/* TOTALS */}
      <div className="grid gap-3 md:grid-cols-3">
        <StatCard label="Subtotal" value={rs(inv.subtotal)} hint="From items (base totals)" />
        <StatCard label="VAT Amount" value={rs(inv.vat_amount)} hint="Mixed VAT lines supported" />
        <StatCard label="Discount Amount" value={rs(inv.discount_amount)} hint="Manual (Apply Discount)" />
        <StatCard label="Total" value={rs(inv.total_amount)} hint="Subtotal + VAT - discount logic (Option A)" emphasize />
        <StatCard label="Gross Total" value={rs(inv.gross_total)} hint={`Prev balance: ${rs(inv.previous_balance)}`} />
        <StatCard label="Balance Remaining" value={rs(inv.balance_remaining)} hint={`Paid: ${rs(inv.amount_paid)}`} emphasize />
      </div>
    </div>
  );
}
