// src/pages/InvoicePrint.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import html2pdf from "html2pdf.js";

import RamPotteryDoc, { RamPotteryDocItem } from "@/components/print/RamPotteryDoc";
import { getInvoice } from "@/lib/invoices";
import { listInvoiceItems } from "@/lib/invoiceItems";
import { listCustomers } from "@/lib/customers";

import "@/styles/rpdoc.css";

const WA_PHONE = "2307788884";

/* =========================
   helpers
========================= */
function isValidId(v: any) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0;
}
function n(v: any) {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}
function rs(v: any) {
  return `Rs ${n(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDDMMYYYY(v: any) {
  const s = String(v || "").trim();
  if (!s) return "";
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;

  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    const pad = (x: number) => String(x).padStart(2, "0");
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  }
  return s;
}

/** Wait until images inside an element finish loading */
async function waitForImages(root: HTMLElement) {
  const imgs = Array.from(root.querySelectorAll("img"));
  await Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((resolve) => {
          const el = img as HTMLImageElement;
          if (el.complete) return resolve();
          el.addEventListener("load", () => resolve(), { once: true });
          el.addEventListener("error", () => resolve(), { once: true });
        })
    )
  );
}

/* =========================
   Component
========================= */
export default function InvoicePrint() {
  const { id } = useParams();
  const invoiceId = Number(id);
  const nav = useNavigate();

  const [sp] = useSearchParams();
  const publicToken = (sp.get("t") || "").trim();

  // A4 wrapper root (exact node for print + pdf)
  const printRootRef = useRef<HTMLDivElement | null>(null);

  // Ensures auto-print triggers only once
  const printOnceRef = useRef(false);

  // Prevent spamming print while preparing
  const [printPreparing, setPrintPreparing] = useState(false);

  /* =========================
     Load invoice (PUBLIC SAFE)
  ========================= */
  const invoiceQ = useQuery({
    queryKey: ["invoice_print", invoiceId, publicToken],
    queryFn: () => getInvoice(invoiceId, publicToken ? { publicToken } : undefined),
    enabled: isValidId(invoiceId),
    staleTime: 15_000,
  });

  const inv = invoiceQ.data as any;

  const itemsQ = useQuery({
    queryKey: ["invoice_items_print", invoiceId, publicToken],
    queryFn: () => listInvoiceItems(invoiceId, publicToken ? { publicToken } : undefined),
    enabled: isValidId(invoiceId),
    staleTime: 15_000,
  });

  const items = itemsQ.data || [];
  const custId = inv?.customer_id;

  const customersQ = useQuery({
    queryKey: ["customers", "print-lite"],
    queryFn: () => listCustomers({ activeOnly: false, limit: 5000 }),
    enabled: !!custId,
    staleTime: 60_000,
  });

  const customer = useMemo(() => {
    if (!custId) return null;
    return customersQ.data?.find((c: any) => c.id === custId) ?? null;
  }, [customersQ.data, custId]);

  /* =========================
     Map items (FIXED TYPES)
     RamPotteryDoc expects:
     - box, unit_per_box, total_qty (NOT uom/units_per_box)
  ========================= */
  const docItems: RamPotteryDocItem[] = useMemo(() => {
    return (items || []).map((it: any, idx: number) => ({
      sn: idx + 1,
      item_code: it.product?.item_code || it.product?.sku || "",
      box: String(it.uom || "BOX").toUpperCase(),
      unit_per_box: Number(it.units_per_box || 0),
      total_qty: Number(it.total_qty || 0),
      description: it.description || it.product?.name || "",
      unit_price_excl_vat: Number(it.unit_price_excl_vat || 0),
      unit_vat: Number(it.unit_vat || 0),
      unit_price_incl_vat: Number(it.unit_price_incl_vat || 0),
      line_total: Number(it.line_total || 0),
    }));
  }, [items]);

  /* =========================
     WhatsApp link
  ========================= */
  const origin = typeof window !== "undefined" ? window.location.origin : "https://rampotteryhub.com";
  const viewUrl = `${origin}/invoices/${invoiceId}/print${publicToken ? `?t=${encodeURIComponent(publicToken)}` : ""}`;

  const waHref = useMemo(() => {
    if (!inv) return "#";

    const gross = n(inv.gross_total ?? inv.total_amount);
    const paid = n(inv.amount_paid);
    const due = n(inv.balance_remaining) || Math.max(0, gross - paid);

    const msg = [
      "Ram Pottery Ltd",
      "",
      "Invoice details:",
      customer?.name ? `Customer: ${customer.name}` : null,
      `Invoice: ${inv.invoice_number || `#${inv.id}`}`,
      `Invoice Amount: ${rs(gross)}`,
      `Amount Paid: ${rs(paid)}`,
      `Amount Due: ${rs(due)}`,
      "",
      `Invoice PDF: ${viewUrl}`,
    ]
      .filter(Boolean)
      .join("\n");

    return `https://wa.me/${WA_PHONE}?text=${encodeURIComponent(msg)}`;
  }, [inv?.id, inv?.invoice_number, inv?.gross_total, inv?.total_amount, inv?.amount_paid, inv?.balance_remaining, customer?.name, viewUrl]);

  /* =========================
     Print (only once, after ready)
  ========================= */
  const isLoading = invoiceQ.isLoading || itemsQ.isLoading || (customersQ.isLoading && !!custId);

  async function safePrintOnce() {
    if (printOnceRef.current) return;
    if (!printRootRef.current) return;

    printOnceRef.current = true;
    setPrintPreparing(true);

    // Fonts ready (helps “print stuck” in Chromium)
    try {
      // @ts-ignore
      if (document?.fonts?.ready) {
        // @ts-ignore
        await document.fonts.ready;
      }
    } catch {}

    // Images ready (logo etc.)
    await waitForImages(printRootRef.current);

    // Small layout beat, then print
    window.setTimeout(() => {
      window.print();
      setPrintPreparing(false);
    }, 200);
  }

  // Auto print once AFTER render (public links only)
  useEffect(() => {
    if (isLoading) return;
    if (!inv) return;
    if (!publicToken) return; // auto-print only for public links
    safePrintOnce();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, inv?.id, publicToken]);

  /* =========================
     PDF download (Fallback only)
     NOTE: Browser-generated PDF via html2pdf.
     (Your “real server PDF” comes next when you add API/edge.)
  ========================= */
  async function downloadPdfClient() {
    if (!printRootRef.current || !inv) return;

    const node = printRootRef.current;
    await waitForImages(node);

    html2pdf()
      .set({
        filename: `Invoice-${inv.invoice_number || inv.id}.pdf`,
        margin: 0, // A4 wrapper already has margins in CSS
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: {
          scale: 3,
          useCORS: true,
          backgroundColor: "#ffffff",
          // Let html2canvas measure the actual node, don't force fake windowWidth
        },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        pagebreak: { mode: ["css", "legacy"] },
      })
      .from(node)
      .save();
  }

  /* =========================
     Guards
  ========================= */
  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading print…</div>;
  }

  if (!inv) {
    return (
      <div className="p-6 text-sm text-destructive">
        Invoice not found / access denied.
        <div className="mt-2 text-xs text-muted-foreground">
          Public links must include a valid token (<b>?t=...</b>)
        </div>
      </div>
    );
  }

  /* =========================
     Render
  ========================= */
  return (
    <div className="print-shell p-4">
      {/* Toolbar (hidden on print) */}
      <div className="no-print flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="text-sm text-muted-foreground">Invoice {inv.invoice_number}</div>

        <div className="flex flex-wrap gap-2">
          {!publicToken && (
            <Button variant="outline" onClick={() => nav(`/invoices/${invoiceId}`)}>
              Back
            </Button>
          )}

          <Button variant="outline" asChild>
            <a href={waHref} target="_blank" rel="noreferrer">
              WhatsApp
            </a>
          </Button>

          <Button variant="outline" onClick={downloadPdfClient}>
            Download PDF
          </Button>

          <Button onClick={() => safePrintOnce()} disabled={printPreparing}>
            {printPreparing ? "Preparing…" : "Print"}
          </Button>
        </div>
      </div>

      {/* =========
          A4 WRAPPER (perfect fit)
      ========= */}
      <div className="print-stage">
        <div ref={printRootRef} className="a4-sheet">
          <div className="a4-content">
            <RamPotteryDoc
              variant="INVOICE"
              showFooterBar={false} // ✅ remove thank you bar
              docNoLabel="INVOICE NO:"
              docNoValue={inv.invoice_number}
              dateLabel="DATE:"
              dateValue={fmtDDMMYYYY(inv.invoice_date)}
              purchaseOrderLabel="PURCHASE ORDER NO:"
              purchaseOrderValue={inv.purchase_order_no || ""}
              salesRepName={inv.sales_rep || ""}
              salesRepPhone={inv.sales_rep_phone || ""}
              customer={{
                name: customer?.name || "",
                address: customer?.address || "",
                phone: customer?.phone || "",
                brn: customer?.brn || "",
                vat_no: customer?.vat_no || "",
                customer_code: customer?.customer_code || "",
              }}
              company={{
                brn: "C17144377",
                vat_no: "123456789",
              }}
              items={docItems}
              totals={{
                subtotal: Number(inv.subtotal || 0),
                vatLabel: `VAT ${Number(inv.vat_percent ?? 15)}%`,
                vat_amount: Number(inv.vat_amount || 0),
                total_amount: Number(inv.total_amount || 0),
                previous_balance: Number(inv.previous_balance || 0),
                amount_paid: Number(inv.amount_paid || 0),
                balance_remaining: Number(inv.balance_remaining || 0),
              }}
              preparedBy={"Manish"}
              deliveredBy={""}
              logoSrc={"/logo.png"}
            />
          </div>

          {/* Page numbering placeholder (print CSS controls output) */}
          <div className="rp-page-footer" />
        </div>
      </div>
    </div>
  );
}



