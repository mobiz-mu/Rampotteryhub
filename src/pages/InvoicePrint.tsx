// src/pages/InvoicePrint.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import html2pdf from "html2pdf.js";

import RamPotteryDoc, { RamPotteryDocItem } from "@/components/print/RamPotteryDoc";
import { supabase } from "@/integrations/supabase/client";

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

/** Safe JSON parse (prevents “Unexpected end of JSON input”) */
async function safeJson(res: Response) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
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

  // ✅ if no token, require login
  const [authChecked, setAuthChecked] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    let alive = true;

    (async () => {
      if (publicToken) {
        if (alive) {
          setIsLoggedIn(false);
          setAuthChecked(true);
        }
        return;
      }
      const { data } = await supabase.auth.getSession();
      if (!alive) return;
      setIsLoggedIn(!!data?.session);
      setAuthChecked(true);
    })();

    return () => {
      alive = false;
    };
  }, [publicToken]);

  // A4 wrapper root (exact node for print + pdf)
  const printRootRef = useRef<HTMLDivElement | null>(null);

  // Ensures auto-print triggers only once
  const printOnceRef = useRef(false);

  // Prevent spamming print while preparing
  const [printPreparing, setPrintPreparing] = useState(false);

  /* =========================
     Load invoice (PUBLIC via server endpoint)
     - avoids Supabase RLS issues
     Endpoint: /api/public/invoice-print?id=48&t=TOKEN
  ========================= */
  const invoiceQ = useQuery({
    queryKey: ["public_invoice_print", invoiceId, publicToken],
    enabled: isValidId(invoiceId) && (!!publicToken || (authChecked && isLoggedIn)),
    queryFn: async () => {
      // If no token, still use same endpoint but with empty token? NO.
      // Internal print should be protected pages anyway. Here we keep it strict:
      if (!publicToken) {
        throw new Error("Missing public token");
      }

      const res = await fetch(`/api/public/invoice-print?id=${invoiceId}&t=${encodeURIComponent(publicToken)}`);
      const json = await safeJson(res);

      if (!json?.ok) throw new Error(json?.error || "Failed to load");
      return json as {
        ok: true;
        invoice: any;
        items: any[];
        customer?: any;
      };
    },
    staleTime: 15_000,
  });

  // Guard: if no token and not logged in → block
  if (!publicToken) {
    if (!authChecked) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
    if (!isLoggedIn) return <Navigate to="/auth" replace />;
    // If logged in but no token, you can decide:
    // Option A: allow internal print by querying Supabase (not recommended here).
    // Option B (strict): require token always for this route.
    return (
      <div className="p-6 text-sm text-destructive">
        This print link requires a public token.
        <div className="mt-2 text-xs text-muted-foreground">
          Use a shared link like: <b>/invoices/{invoiceId}/print?t=...</b>
        </div>
      </div>
    );
  }

  const isLoading = invoiceQ.isLoading;
  const payload = invoiceQ.data as any;
  const inv = payload?.invoice;
  const items = payload?.items || [];
  const customer = payload?.customer || inv?.customers || inv?.customer || null;

  /* =========================
     Map items to RamPotteryDocItem
     Your invoice_items columns:
     - box_qty, units_per_box, total_qty, pcs_qty, description
  ========================= */
  const docItems: RamPotteryDocItem[] = useMemo(() => {
    return (items || []).map((it: any, idx: number) => {
      const p = it.product || it.products || null;

      return {
        sn: idx + 1,
        item_code: p?.item_code || p?.sku || it.item_code || it.sku || "",
        box: "BOX",
        unit_per_box: Number(it.units_per_box ?? p?.units_per_box ?? 0),
        total_qty: Number(it.total_qty ?? 0),
        description: it.description || p?.name || "",
        unit_price_excl_vat: Number(it.unit_price_excl_vat ?? 0),
        unit_vat: Number(it.unit_vat ?? 0),
        unit_price_incl_vat: Number(it.unit_price_incl_vat ?? 0),
        line_total: Number(it.line_total ?? 0),
      };
    });
  }, [items]);

  /* =========================
     WhatsApp link
  ========================= */
  const origin = typeof window !== "undefined" ? window.location.origin : "https://rampotteryhub.com";
  const viewUrl = `${origin}/invoices/${invoiceId}/print?t=${encodeURIComponent(publicToken)}`;

  const waHref = useMemo(() => {
    if (!inv) return "#";

    const gross = n(inv.gross_total ?? inv.total_amount ?? inv.total_incl_vat);
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
  }, [inv, customer?.name, viewUrl, publicToken, invoiceId]);

  /* =========================
     Print (only once, after ready)
  ========================= */
  async function safePrintOnce() {
    if (printOnceRef.current) return;
    if (!printRootRef.current) return;

    printOnceRef.current = true;
    setPrintPreparing(true);

    try {
      // @ts-ignore
      if (document?.fonts?.ready) {
        // @ts-ignore
        await document.fonts.ready;
      }
    } catch {}

    await waitForImages(printRootRef.current);

    window.setTimeout(() => {
      window.print();
      setPrintPreparing(false);
    }, 200);
  }

  // Auto print once AFTER render (public token links)
  useEffect(() => {
    if (isLoading) return;
    if (!inv) return;
    if (!publicToken) return;
    safePrintOnce();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, inv?.id, publicToken]);

  /* =========================
     PDF download (Fallback only)
  ========================= */
  async function downloadPdfClient() {
    if (!printRootRef.current || !inv) return;

    const node = printRootRef.current;
    await waitForImages(node);

    html2pdf()
      .set({
        filename: `Invoice-${inv.invoice_number || inv.id}.pdf`,
        margin: 0,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: {
          scale: 3,
          useCORS: true,
          backgroundColor: "#ffffff",
        },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        pagebreak: { mode: ["css", "legacy"] },
      })
      .from(node)
      .save();
  }

  /* =========================
     Render states
  ========================= */
  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading print…</div>;
  }

  if (invoiceQ.isError || !inv) {
    return (
      <div className="p-6 text-sm text-destructive">
        Invoice not found / invalid link.
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
        <div className="text-sm text-muted-foreground">Invoice {inv.invoice_number || `#${inv.id}`}</div>

        <div className="flex flex-wrap gap-2">
          {/* ✅ Public users: no back button */}
          {/* If you later want internal users to print without token, add a separate internal route */}
          <Button variant="outline" onClick={() => nav("/auth")}>
            Close
          </Button>

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

      {/* A4 WRAPPER */}
      <div className="print-stage">
        <div ref={printRootRef} className="a4-sheet">
          <div className="a4-content">
            <RamPotteryDoc
              variant="INVOICE"
              showFooterBar={false}
              docNoLabel="INVOICE NO:"
              docNoValue={inv.invoice_number || `#${inv.id}`}
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

          <div className="rp-page-footer" />
        </div>
      </div>
    </div>
  );
}



