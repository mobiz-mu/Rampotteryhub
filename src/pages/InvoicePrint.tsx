// src/pages/InvoicePrint.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import html2pdf from "html2pdf.js";

import { getInvoicePrintBundle } from "@/lib/invoices";
import RamPotteryDoc, { RamPotteryDocItem } from "@/components/print/RamPotteryDoc";
import { supabase } from "@/integrations/supabase/client";

import "@/styles/rpdoc.css";

const WA_PHONE = "2307788884";

/* =========================
   helpers
========================= */
function isValidId(v: any) {
  const x = Number(v);
  return Number.isFinite(x) && x > 0;
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

/** Safe JSON parse */
async function safeJson(res: Response) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** A4 px (approx) at 96dpi */
const A4_W_PX = 794;
const A4_H_PX = 1123;

export default function InvoicePrint() {
  const { id } = useParams();
  const invoiceId = Number(id);
  const nav = useNavigate();

  const [sp] = useSearchParams();
  const publicToken = (sp.get("t") || "").trim();
  const isPublicMode = !!publicToken;

  // auth check (only needed for internal mode)
  const [authChecked, setAuthChecked] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // ✅ Root that contains ONLY the A4 document pages
  const docRootRef = useRef<HTMLDivElement | null>(null);

  // Prevent spamming print while preparing
  const [printPreparing, setPrintPreparing] = useState(false);

  useEffect(() => {
    let alive = true;

    (async () => {
      if (isPublicMode) {
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
  }, [isPublicMode]);

  /* =========================
     Load invoice
  ========================= */
  const invoiceQ = useQuery({
    queryKey: ["invoice_print_bundle", invoiceId, publicToken],
    enabled: isValidId(invoiceId) && (isPublicMode ? true : authChecked),
    queryFn: async () => {
      if (isPublicMode) {
        const res = await fetch(`/api/public/invoice-print?id=${invoiceId}&t=${encodeURIComponent(publicToken)}`);
        const json = await safeJson(res);
        if (!json?.ok) throw new Error(json?.error || "Failed to load");
        return json as { ok: true; invoice: any; items: any[]; customer?: any };
      }

      if (!isLoggedIn) throw new Error("Unauthorized");
      return await getInvoicePrintBundle(invoiceId);
    },
    staleTime: 15_000,
  });

  const isLoading = invoiceQ.isLoading;
  const payload = invoiceQ.data as any;
  const inv = payload?.invoice ?? null;
  const items = payload?.items || [];
  const customer = payload?.customer || inv?.customers || inv?.customer || null;

  const docItems: RamPotteryDocItem[] = useMemo(() => {
    return (items || []).map((it: any, idx: number) => {
      const p = it.product || it.products || null;

      return {
        sn: idx + 1,
        item_code: p?.item_code || p?.sku || it.item_code || it.sku || "",
        box: String(it.uom || "BOX").toUpperCase() === "PCS" ? "PCS" : "BOX",
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
     WhatsApp link (ONLY public)
  ========================= */
  const origin = typeof window !== "undefined" ? window.location.origin : "https://rampotteryhub.com";
  const viewUrl = isPublicMode
    ? `${origin}/invoices/${invoiceId}/print?t=${encodeURIComponent(publicToken)}`
    : `${origin}/invoices/${invoiceId}/print`;

  const waHref = useMemo(() => {
    if (!inv || !isPublicMode) return "#";

    const gross = n(inv.gross_total ?? inv.total_amount ?? inv.total_incl_vat);
    const paid = n(inv.amount_paid);
    const due = Number.isFinite(Number(inv.balance_remaining)) ? n(inv.balance_remaining) : Math.max(0, gross - paid);

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
  }, [inv, customer?.name, viewUrl, isPublicMode]);

  /* =========================
     PRINT (reliable)
     - adds a body class so print CSS can isolate the A4 doc
     - waits fonts + images
     - resets after print (so Ctrl+P works again)
  ========================= */
  useEffect(() => {
    const after = () => {
      document.body.classList.remove("rp-printing");
      setPrintPreparing(false);
    };
    window.addEventListener("afterprint", after);
    return () => window.removeEventListener("afterprint", after);
  }, []);

  async function doPrint() {
    if (!docRootRef.current) return;
    if (printPreparing) return;

    setPrintPreparing(true);
    document.body.classList.add("rp-printing");

    try {
      // @ts-ignore
      if (document?.fonts?.ready) await document.fonts.ready;
    } catch {}

    await waitForImages(docRootRef.current);

    // give the browser 1 tick to apply rp-printing CSS before opening dialog
    window.setTimeout(() => {
      window.print();
    }, 200);
  }

  /* =========================
     PDF download (html2pdf tuned)
     - closer to screen by fixing windowWidth/Height
     - scale moderate (too high can distort)
  ========================= */
  async function downloadPdfClient() {
    if (!docRootRef.current || !inv) return;

    const node = docRootRef.current;

    try {
      // @ts-ignore
      if (document?.fonts?.ready) await document.fonts.ready;
    } catch {}

    await waitForImages(node);

    await html2pdf()
      .set({
        filename: `Invoice-${inv.invoice_number || inv.id}.pdf`,
        margin: 0,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: {
          scale: 2.2, // higher can shift borders/weights
          useCORS: true,
          backgroundColor: "#ffffff",
          scrollY: 0,
          scrollX: 0,
          windowWidth: A4_W_PX,
          windowHeight: A4_H_PX,
        },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        pagebreak: { mode: ["css", "legacy"] },
      })
      .from(node)
      .save();
  }

  /* =========================
     Safe returns AFTER hooks
  ========================= */
  if (!isValidId(invoiceId)) {
    return <div className="p-6 text-sm text-muted-foreground">Invalid invoice id.</div>;
  }

  if (!isPublicMode) {
    if (!authChecked) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
    if (!isLoggedIn) return <Navigate to="/auth" replace />;
  }

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading print…</div>;
  }

  if (invoiceQ.isError || !inv) {
    return (
      <div className="p-6 text-sm text-destructive">
        Invoice not found / invalid link.
        {isPublicMode ? (
          <div className="mt-2 text-xs text-muted-foreground">
            Public links must include a valid token (<b>?t=...</b>)
          </div>
        ) : (
          <div className="mt-2 text-xs text-muted-foreground">Please check invoice ID and your access.</div>
        )}
      </div>
    );
  }

  return (
    <div className="print-shell p-4">
      {/* Toolbar (hidden on print) */}
      <div className="no-print flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="text-sm text-muted-foreground">Invoice {inv.invoice_number || `#${inv.id}`}</div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => {
              if (isPublicMode) nav("/auth");
              else nav(-1);
            }}
          >
            {isPublicMode ? "Close" : "Back"}
          </Button>

          {isPublicMode ? (
            <Button variant="outline" asChild>
              <a href={waHref} target="_blank" rel="noreferrer">
                WhatsApp
              </a>
            </Button>
          ) : null}

          <Button variant="outline" onClick={downloadPdfClient}>
            Download PDF
          </Button>

          <Button onClick={doPrint} disabled={printPreparing}>
            {printPreparing ? "Preparing…" : "Print"}
          </Button>
        </div>
      </div>

      {/* ✅ ONLY THE DOCUMENT */}
      <div className="print-stage">
        <div ref={docRootRef} id="rpdoc-print-root">
          <RamPotteryDoc
            docTitle="VAT INVOICE"
            companyName="RAM POTTERY LTD"
            logoSrc={"/logo.png"}
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
            }}
            docNoLabel="INVOICE NO:"
            docNoValue={inv.invoice_number || `#${inv.id}`}
            dateLabel="DATE:"
            dateValue={fmtDDMMYYYY(inv.invoice_date)}
            purchaseOrderLabel="PURCHASE ORDER NO:"
            purchaseOrderValue={inv.purchase_order_no || ""}
            salesRepName={inv.sales_rep || ""}
            salesRepPhone={inv.sales_rep_phone || ""}
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
          />
        </div>
      </div>
    </div>
  );
}



