// src/pages/InvoiceView.tsx
import React, { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

import { getInvoice, updateInvoiceHeader, postInvoiceAndDeductStock } from "@/lib/invoices";
import { listInvoiceItems, insertInvoiceItem, deleteInvoiceItem } from "@/lib/invoiceItems";
import { listCustomers } from "@/lib/customers";
import { listProducts } from "@/lib/products";
import { round2 } from "@/lib/invoiceTotals";

import type { Invoice } from "@/types/invoice";
import type { Product } from "@/types/product";

/** ✅ fallback domain */
const APP_ORIGIN = "https://rampotteryhub.com";

/* =========================
   UOM + BAG defaults
========================= */
type Uom = "BOX" | "PCS" | "KG" | "G" | "BAG";
const DEFAULT_KG_PER_BAG = 25;

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
function round3(v: any) {
  return Math.round(n2(v) * 1000) / 1000;
}
function normUom(u: any): Uom {
  const x = String(u || "BOX").toUpperCase();
  if (x === "PCS") return "PCS";
  if (x === "KG") return "KG";
  if (x === "G") return "G";
  if (x === "BAG") return "BAG";
  return "BOX";
}
function fmtQty(uom: Uom, v: any) {
  const x = n2(v);
  // ✅ decimals allowed everywhere (up to 3dp), trims naturally by Intl
  const dp = uom === "KG" || uom === "G" ? 3 : 3;
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: dp }).format(x);
}

/**
 * ✅ Qty display uses stored qty for chosen UOM:
 * PCS -> pcs_qty
 * BOX/KG/G/BAG -> box_qty
 */
function displayQtyForUom(it: any) {
  const u = normUom(it?.uom);
  if (u === "PCS") return n2(it?.pcs_qty);
  return n2(it?.box_qty);
}

function digitsOnly(v: any) {
  return String(v ?? "").replace(/[^\d]/g, "");
}
function normalizeMuPhone(raw: any) {
  const d = digitsOnly(raw);
  if (d.length === 8) return "230" + d;
  if (d.startsWith("230") && d.length === 11) return d;
  return "";
}

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

function originNow() {
  if (typeof window !== "undefined") return window.location.origin;
  return APP_ORIGIN;
}

async function postJson(url: string, body?: any) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : "{}",
  });

  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {}

  if (!res.ok || !json?.ok) throw new Error(json?.error || "Request failed");
  return json;
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  }
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

/* =========================
   Premium tiny UI atoms
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
    <div className={`rounded-2xl border bg-background p-4 shadow-premium ${props.emphasize ? "ring-1 ring-rose-500/25" : ""}`}>
      <div className="text-xs text-muted-foreground">{props.label}</div>
      <div className="mt-1 text-lg font-semibold tracking-tight text-foreground">{props.value}</div>
      {props.hint ? <div className="mt-1 text-xs text-muted-foreground">{props.hint}</div> : null}
    </div>
  );
}

/* =========================
   Numeric input helpers (decimal-safe)
========================= */
function keepNumText(s: string) {
  // allow "", ".", "2.", "2.437"
  const t = String(s ?? "").replace(/,/g, "").trim();
  if (t === "" || t === "." || t === "-" || t === "-.") return t;
  if (!/^-?\d*\.?\d*$/.test(t)) return null;
  return t;
}
function parseNumInput(s: any) {
  const cleaned = String(s ?? "").replace(/,/g, "").trim();
  if (cleaned === "" || cleaned === "." || cleaned === "-" || cleaned === "-.") return 0;
  return n2(cleaned);
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

  const [addUom, setAddUom] = useState<Uom>("BOX");

  // ✅ decimals allowed for ALL qty
  const [qtyText, setQtyText] = useState<string>("");

  // BOX: units per box override
  const [unitsPerBoxOverride, setUnitsPerBoxOverride] = useState<string>("");

  // BAG: kg per bag override (default 25)
  const [kgPerBagOverride, setKgPerBagOverride] = useState<string>(String(DEFAULT_KG_PER_BAG));

  const [hdrInvoiceDate, setHdrInvoiceDate] = useState("");
  const [hdrDueDate, setHdrDueDate] = useState("");
  const [hdrVatPercent, setHdrVatPercent] = useState<string>("15");
  const [hdrDiscountPercent, setHdrDiscountPercent] = useState<string>("0");

  const [autoRecalcAfterSave, setAutoRecalcAfterSave] = useState<boolean>(true);

  const [shareToken, setShareToken] = useState<string>("");
  const [shareLoading, setShareLoading] = useState(false);

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

  const inv = invoiceQ.data as any;
  const items = itemsQ.data || [];

  const customersQ = useQuery({
    queryKey: ["customers", "all-lite"],
    queryFn: () => listCustomers({ activeOnly: false, limit: 3000 }),
    enabled: !!inv?.customer_id,
    staleTime: 60_000,
  });

  // hydrate local header state when invoice loads (ONE effect only)
  useEffect(() => {
    if (!inv) return;
    setHdrInvoiceDate(String(inv.invoice_date || ""));
    setHdrDueDate(String(inv.due_date || ""));
    setHdrVatPercent(String(inv.vat_percent ?? 15));
    setHdrDiscountPercent(String(inv.discount_percent ?? 0));
    setShareToken(String(inv.public_token || ""));
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
     Share URL + WhatsApp message
  ========================= */
  const publicPrintUrl = useMemo(() => {
    if (!inv) return "";
    const base = originNow();
    return shareToken
      ? `${base}/invoices/${inv.id}/print?t=${encodeURIComponent(shareToken)}`
      : `${base}/invoices/${inv.id}/print`;
  }, [inv?.id, shareToken]);

  const waTo = useMemo(() => {
    const c: any = customer || {};
    return normalizeMuPhone(c.whatsapp || c.phone || inv?.customer_whatsapp || inv?.customer_phone);
  }, [customer, inv?.customer_whatsapp, inv?.customer_phone]);

  const waMsg = useMemo(() => {
    if (!inv) return "";
    const invNo = inv.invoice_number || `#${inv.id}`;
    const gross = n2(inv.gross_total ?? inv.total_amount);
    const paid = n2(inv.amount_paid);
    const credits = n2(inv.credits_applied ?? 0);
    const due = Math.max(0, n2(inv.balance_remaining ?? (gross - paid - credits)));

    return buildWhatsAppInvoiceText({
      customerName: (customer as any)?.name || inv.customer_name,
      invoiceNo: invNo,
      invoiceAmount: gross,
      amountPaid: paid,
      amountDue: due,
      pdfUrl: publicPrintUrl,
    });
  }, [customer, inv, publicPrintUrl]);

  function onSendWhatsApp() {
    if (!waTo) {
      toast.error("No WhatsApp/phone number found for this customer.");
      return;
    }
    if (!shareToken) {
      toast.error("Generate share link first.");
      return;
    }
    openWhatsApp(waTo, waMsg);
  }

  async function onGenerateShareLink() {
    if (!inv) return;
    setShareLoading(true);
    try {
      const json = await postJson(`/api/invoices/${inv.id}/public-link`, { expiresDays: 0 });
      setShareToken(String(json.token || ""));
      toast.success(json.reused ? "Share link loaded" : "Share link generated");
    } catch (e: any) {
      toast.error(e?.message || "Failed to generate share link");
    } finally {
      setShareLoading(false);
    }
  }

  async function onCopyShareLink() {
    if (!publicPrintUrl) return;
    const ok = await copyToClipboard(publicPrintUrl);
    ok ? toast.success("Link copied") : toast.error("Copy failed");
  }

  async function onRevokeShareLink() {
    if (!inv) return;
    setShareLoading(true);
    try {
      await postJson(`/api/invoices/${inv.id}/public-link/revoke`);
      setShareToken("");
      toast.success("Share link revoked");
    } catch (e: any) {
      toast.error(e?.message || "Failed to revoke link");
    } finally {
      setShareLoading(false);
    }
  }

  /* =========================
     MUTATIONS
  ========================= */

  // ✅ credits-aware base totals recalc from items (used by auto-recalc too)
  const recalcBaseTotalsM = useMutation({
    mutationFn: async (opts?: { overrideVatPercent?: number }) => {
      if (!inv) throw new Error("Invoice not loaded");

      const freshItems = await listInvoiceItems(invoiceId);

      // VAT rate to enforce when recalculating (so VAT% changes reprice)
      const vatRate = clampPct(opts?.overrideVatPercent ?? inv.vat_percent ?? hdrVatPercent);

      const subtotalEx = round2(
        freshItems.reduce((sum: number, it: any) => sum + n2(it.total_qty) * n2(it.unit_price_excl_vat), 0)
      );

      /**
       * ✅ Fix #1: do NOT round-per-line then sum (double rounding).
       * Sum precisely, then round once.
       */
      const vatAmount = round2(
        freshItems.reduce((sum: number, it: any) => {
          const lineEx = n2(it.total_qty) * n2(it.unit_price_excl_vat);
          return sum + (lineEx * vatRate) / 100;
        }, 0)
      );

      const totalAmount = round2(subtotalEx + vatAmount);

      const prev = n2(inv.previous_balance);
      const grossTotal = round2(totalAmount + prev);

      /**
       * ✅ Fix #2: avoid writing balance fields here if DB triggers/functions
       * recompute credits/balance (prevents last-write-wins conflict).
       */
      await updateInvoiceHeader(invoiceId, {
        vat_percent: vatRate,

        subtotal: subtotalEx,
        vat_amount: vatAmount,
        total_amount: totalAmount,
        total_excl_vat: subtotalEx,
        total_incl_vat: totalAmount,

        gross_total: grossTotal,
      } as any);

      await qc.invalidateQueries({ queryKey: ["invoice", invoiceId] });
      await qc.invalidateQueries({ queryKey: ["invoice_items", invoiceId] });
    },
    onSuccess: () => toast.success("Totals recalculated"),
    onError: (e: any) => toast.error(e?.message || "Failed to recalculate totals"),
  });

  const saveHeaderM = useMutation({
    mutationFn: async () => {
      if (!inv) throw new Error("Invoice not loaded");

      const nextVat = clampPct(hdrVatPercent);

      const patch: Partial<Invoice> = {
        invoice_date: hdrInvoiceDate || inv.invoice_date,
        due_date: hdrDueDate ? hdrDueDate : null,
        vat_percent: nextVat,
        discount_percent: clampPct(hdrDiscountPercent),
      } as any;

      await updateInvoiceHeader(invoiceId, patch);

      if (autoRecalcAfterSave) {
        await recalcBaseTotalsM.mutateAsync({ overrideVatPercent: nextVat });
      } else {
        await qc.invalidateQueries({ queryKey: ["invoice", invoiceId] });
      }
    },
    onSuccess: () => toast.success("Header saved"),
    onError: (e: any) => toast.error(e?.message || "Failed to save header"),
  });

  const addItemM = useMutation({
    mutationFn: async () => {
      if (!inv) throw new Error("Invoice not loaded");
      if (!selectedProduct) throw new Error("Select a product");

      const vatRate = clampPct(hdrVatPercent);
      const uom = addUom;

      // ✅ decimals allowed for ALL UOM
      const qty = Math.max(0, round3(parseNumInput(qtyText)));
      if (qty <= 0) throw new Error("Quantity must be greater than 0");

      const baseEx = n2((selectedProduct as any).selling_price); // EXCL VAT
      const unitVat = round2((baseEx * vatRate) / 100);
      const unitInc = round2(baseEx + unitVat);

      // BOX: units per box (keep integer, but safe if user types decimals)
      const unitsPerBox = Math.max(
        1,
        Math.trunc(n2(unitsPerBoxOverride.trim() ? unitsPerBoxOverride : (selectedProduct as any).units_per_box ?? 1))
      );

      // BAG: kg per bag (default 25)
      const kgPerBag = Math.max(0.001, round3(n2(kgPerBagOverride.trim() ? kgPerBagOverride : DEFAULT_KG_PER_BAG)));

      // total_qty is the “pricing qty”
      // - BOX: total_qty = boxes * unitsPerBox
      // - PCS: total_qty = pcs
      // - KG:  total_qty = kg
      // - G:   total_qty = grams
      // - BAG: total_qty = bags * kgPerBag  (default 25kg/bag)
      const totalQty =
        uom === "BOX" ? round3(qty * unitsPerBox)
        : uom === "BAG" ? round3(qty * kgPerBag)
        : qty;

      const lineTotal = round2(n2(totalQty) * n2(unitInc));

      await insertInvoiceItem({
        invoice_id: invoiceId,
        product_id: (selectedProduct as any).id,

        uom,

        // store qty in correct bucket
        box_qty: uom === "PCS" ? 0 : qty, // BOX/KG/G/BAG -> box_qty holds the entered qty
        pcs_qty: uom === "PCS" ? qty : 0,

        // reuse units_per_box as conversion:
        // BOX -> units per box
        // BAG -> kg per bag (default 25)
        // others -> 1
        units_per_box: uom === "BOX" ? unitsPerBox : uom === "BAG" ? kgPerBag : 1,

        total_qty: totalQty,

        unit_price_excl_vat: baseEx,
        vat_rate: vatRate,
        unit_vat: unitVat,
        unit_price_incl_vat: unitInc,
        line_total: lineTotal,

        description: (selectedProduct as any).name,
      });

      await qc.invalidateQueries({ queryKey: ["invoice_items", invoiceId] });
      await recalcBaseTotalsM.mutateAsync({ overrideVatPercent: vatRate });

      // reset UI
      setSelectedProduct(null);
      setQtyText("");
      setUnitsPerBoxOverride("");
      setKgPerBagOverride(String(DEFAULT_KG_PER_BAG));
      setProductSearch("");
      setAddUom("BOX");
    },
    onSuccess: () => toast.success("Item added"),
    onError: (e: any) => toast.error(e?.message || "Failed to add item"),
  });


  const postInvoiceM = useMutation({
  mutationFn: async () => {
    if (!inv) throw new Error("Invoice not loaded");
    // ✅ this will insert movements + set stock_deducted_at + set status ISSUED
    return postInvoiceAndDeductStock(inv.id);
  },
  onSuccess: async () => {
    toast.success("Invoice posted & stock deducted");
    await qc.invalidateQueries({ queryKey: ["invoice", invoiceId] });
    await qc.invalidateQueries({ queryKey: ["invoice_items", invoiceId] });
    await qc.invalidateQueries({ queryKey: ["stock-movements"], exact: false });
    await qc.invalidateQueries({ queryKey: ["products"], exact: false });
  },
  onError: (e: any) => toast.error(e?.message || "Failed to post invoice"),
});

  const delItemM = useMutation({
    mutationFn: async (itemId: number) => {
      if (!inv) throw new Error("Invoice not loaded");
      await deleteInvoiceItem(itemId);
      await qc.invalidateQueries({ queryKey: ["invoice_items", invoiceId] });
      await recalcBaseTotalsM.mutateAsync({ overrideVatPercent: clampPct(hdrVatPercent) });
    },
    onSuccess: () => toast.success("Item removed"),
    onError: (e: any) => toast.error(e?.message || "Failed to remove item"),
  });

  /* =========================
     DERIVED
  ========================= */
  const isLoading = invoiceQ.isLoading || itemsQ.isLoading || (customersQ.isLoading && !!inv?.customer_id);

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

  const qtyPlaceholder =
    addUom === "KG" ? "Kg (e.g. 0.450)"
    : addUom === "G" ? "Grams (e.g. 250)"
    : addUom === "BAG" ? "Bags (e.g. 1.5)"
    : addUom === "PCS" ? "PCS (e.g. 2.5)"
    : "BOX (e.g. 1.25)";

  /* =========================
     RENDER
  ========================= */
  if (!isValidId(invoiceId)) return <Navigate to="/invoices" replace />;
  if (isLoading) return <div className="text-sm text-muted-foreground">Loading invoice…</div>;
  if (!inv) return <div className="text-sm text-destructive">Invoice not found</div>;

  return (
    <div className="iv-root iv-invoice-view space-y-5">
      {/* HEADER */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-2xl font-semibold truncate text-foreground">Invoice {inv.invoice_number}</div>
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


          <Button
  className="gradient-primary text-primary-foreground shadow-glow"
  onClick={() => {
    if (!items?.length) return toast.error("Add at least 1 item before posting.");
    postInvoiceM.mutate();
  }}
  disabled={postInvoiceM.isPending || !!inv?.stock_deducted_at || String(inv?.status || "").toUpperCase() === "VOID"}
  title={
    inv?.stock_deducted_at
      ? "Already posted (stock already deducted)"
      : "Post invoice and deduct stock (creates stock movements)"
  }
>
  {inv?.stock_deducted_at ? "Posted" : postInvoiceM.isPending ? "Posting..." : "Post Invoice"}
</Button>


          <Button variant="outline" onClick={() => nav(`/invoices/${invoiceId}/print`)}>
            Print
          </Button>

          <Button
            variant="outline"
            onClick={onGenerateShareLink}
            disabled={shareLoading}
            title="Creates a public token for sharing"
          >
            {shareLoading ? "Working..." : shareToken ? "Refresh Share Link" : "Generate Share Link"}
          </Button>

          <Button variant="outline" onClick={onCopyShareLink} disabled={!shareToken}>
            Copy Link
          </Button>

          <Button
            variant="outline"
            onClick={() => window.open(publicPrintUrl, "_blank", "noopener,noreferrer")}
            disabled={!shareToken}
          >
            Open Public Print
          </Button>

          <Button
            onClick={onSendWhatsApp}
            disabled={!waTo || !shareToken}
            className="gradient-primary text-primary-foreground shadow-glow"
            title={!shareToken ? "Generate share link first" : !waTo ? "No WhatsApp/phone found" : "Send invoice link"}
          >
            Send via WhatsApp
          </Button>

          <Button variant="outline" onClick={onRevokeShareLink} disabled={!shareToken || shareLoading}>
            Revoke Link
          </Button>
        </div>
      </div>

      {/* STATS STRIP */}
      <div className="grid gap-3 md:grid-cols-6">
        <StatCard label="Subtotal" value={rs(inv.subtotal)} />
        <StatCard label="VAT" value={rs(inv.vat_amount)} hint={`VAT %: ${money(inv.vat_percent ?? hdrVatPercent)}`} />
        <StatCard
          label="Discount"
          value={rs(inv.discount_amount)}
          hint={`Discount %: ${money(inv.discount_percent ?? hdrDiscountPercent)}`}
        />
        <StatCard label="Gross" value={rs(inv.gross_total)} />
        <StatCard label="Credits" value={rs(inv.credits_applied ?? 0)} hint="Applied credit notes" />
        <StatCard label="Balance" value={rs(inv.balance_remaining)} emphasize />
      </div>

      {/* INVOICE HEADER */}
      <Card className="p-4 md:p-5 shadow-premium space-y-3 rounded-2xl">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground">Invoice Header</div>
            <div className="text-xs text-muted-foreground">Edit fields, then Save Header. VAT% can auto-recalc totals.</div>

            <label className="mt-2 inline-flex items-center gap-2 text-xs text-muted-foreground select-none">
              <input
                type="checkbox"
                className="h-4 w-4 accent-rose-600"
                checked={autoRecalcAfterSave}
                onChange={(e) => setAutoRecalcAfterSave(e.target.checked)}
              />
              Auto recalc totals after Save Header
            </label>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={() => saveHeaderM.mutate()}
              disabled={saveHeaderM.isPending || recalcBaseTotalsM.isPending}
              className="gradient-primary text-primary-foreground shadow-glow"
            >
              {saveHeaderM.isPending
                ? "Saving..."
                : autoRecalcAfterSave && recalcBaseTotalsM.isPending
                ? "Recalculating..."
                : "Save Header"}
            </Button>

            <Button
              variant="outline"
              onClick={() => recalcBaseTotalsM.mutate({ overrideVatPercent: clampPct(hdrVatPercent) })}
              disabled={recalcBaseTotalsM.isPending}
              title="Recalculate totals from items (credits-aware)"
            >
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
            <div className="text-xs text-muted-foreground">Discount %</div>
            <Input inputMode="decimal" value={hdrDiscountPercent} onChange={(e) => setHdrDiscountPercent(e.target.value)} placeholder="Discount %" />
          </div>
        </div>
      </Card>

      {/* ADD ITEM */}
      <Card className="p-4 md:p-5 shadow-premium space-y-3 rounded-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-foreground">Add Item</div>
            <div className="text-xs text-muted-foreground">
              Search product, choose unit (BOX / PCS / Kg / G / BAG), then add quantity. ✅ Decimals allowed.
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="text-xs text-muted-foreground">Unit</div>
            <select
              className="h-10 rounded-xl border bg-background px-3 text-sm text-foreground outline-none"
              value={addUom}
              onChange={(e) => {
                const next = normUom(e.target.value);
                setAddUom(next);

                // nice UX defaults
                if (next === "BAG" && (!kgPerBagOverride || n2(kgPerBagOverride) <= 0)) {
                  setKgPerBagOverride(String(DEFAULT_KG_PER_BAG));
                }
              }}
            >
              <option value="BOX">BOX</option>
              <option value="PCS">PCS</option>
              <option value="KG">Kg</option>
              <option value="G">G</option>
              <option value="BAG">BAG (25kg)</option>
            </select>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-[1fr_220px_220px_auto]">
          <Input placeholder="Search product…" value={productSearch} onChange={(e) => setProductSearch(e.target.value)} />

          <Input
            placeholder={qtyPlaceholder}
            value={qtyText}
            onChange={(e) => {
              const kept = keepNumText(e.target.value);
              if (kept === null) return;
              setQtyText(kept);
            }}
            inputMode="decimal"
          />

          {/* BOX: UPB | BAG: kg per bag */}
          {addUom === "BAG" ? (
            <Input
              placeholder="Kg per bag (default 25)"
              value={kgPerBagOverride}
              onChange={(e) => {
                const kept = keepNumText(e.target.value);
                if (kept === null) return;
                setKgPerBagOverride(kept);
              }}
              inputMode="decimal"
              title="BAG conversion factor (kg per bag)"
            />
          ) : (
            <Input
              placeholder="UPB (optional)"
              value={unitsPerBoxOverride}
              onChange={(e) => {
                const kept = keepNumText(e.target.value);
                if (kept === null) return;
                setUnitsPerBoxOverride(kept);
              }}
              disabled={addUom !== "BOX"}
              inputMode="decimal"
              title="Units per box override (BOX only)"
            />
          )}

          <Button
            className="gradient-primary text-primary-foreground shadow-glow"
            disabled={!selectedProduct || addItemM.isPending}
            onClick={() => addItemM.mutate()}
          >
            {addItemM.isPending ? "Adding..." : "Add"}
          </Button>
        </div>

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
            {addUom === "BAG" ? (
              <div className="mt-2 text-xs text-muted-foreground">
                BAG conversion: <b>total_qty = bags × kg-per-bag</b> (default {DEFAULT_KG_PER_BAG})
              </div>
            ) : null}
          </div>
        ) : null}

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
                    className={`w-full text-left px-4 py-4 transition ${active ? "bg-rose-50" : "hover:bg-slate-50"}`}
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
            <div className="text-xs text-muted-foreground">Premium list view — delete recalculates totals.</div>
          </div>
          <Pill>{items.length} item(s)</Pill>
        </div>

        <div className="divide-y">
          {items.map((it: any) => {
            const uom = normUom(it.uom);
            const qty = fmtQty(uom, displayQtyForUom(it));

            // show conversion hint for BAG
            const isBag = uom === "BAG";
            const kgPerBag = n2(it.units_per_box || DEFAULT_KG_PER_BAG);

            return (
              <div key={it.id} className="px-4 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="font-semibold text-foreground truncate">{it.product?.name || it.description}</div>
                    <Pill>UOM: {uom}</Pill>
                    <Pill tone="bad">Qty: {qty}</Pill>
                    <Pill>Unit inc: {money(it.unit_price_incl_vat)}</Pill>
                    {isBag ? <Pill>1 BAG = {fmtQty("KG", kgPerBag)} Kg</Pill> : null}
                  </div>

                  <div className="mt-1 text-xs text-muted-foreground">
                    Unit ex: {money(it.unit_price_excl_vat)} • VAT rate: {money(it.vat_rate)}% • Line VAT:{" "}
                    {money(n2(it.unit_vat) * n2(it.total_qty))}
                    {isBag ? (
                      <>
                        {" "}
                        • Total kg: <b>{fmtQty("KG", it.total_qty)}</b>
                      </>
                    ) : null}
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
        <StatCard label="Subtotal" value={rs(inv.subtotal)} hint="From items (recalc uses VAT%)" />
        <StatCard label="VAT Amount" value={rs(inv.vat_amount)} hint={`VAT %: ${money(inv.vat_percent ?? hdrVatPercent)}`} />
        <StatCard label="Discount Amount" value={rs(inv.discount_amount)} hint="Manual discount (if used)" />

        <StatCard label="Total" value={rs(inv.total_amount)} hint="Subtotal + VAT" emphasize />
        <StatCard label="Gross Total" value={rs(inv.gross_total)} hint={`Prev balance: ${rs(inv.previous_balance)}`} />
        <StatCard label="Credits Applied" value={rs(inv.credits_applied ?? 0)} hint="From credit notes" />

        <StatCard label="Balance Remaining" value={rs(inv.balance_remaining)} hint={`Paid: ${rs(inv.amount_paid)}`} emphasize />
      </div>
    </div>
  );
}

