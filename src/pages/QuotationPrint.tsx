// src/pages/QuotationPrint.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";

import RamPotteryDoc, { RamPotteryDocItem } from "@/components/print/RamPotteryDoc";
import { supabase } from "@/integrations/supabase/client";
import { getQuotationPrintBundle } from "@/lib/quotations"; // ✅ uses server token mode OR internal supabase bundle

import "@/styles/rpdoc.css";

const LOGO_SRC = "/logo.png";

/* =========================
   Helpers
========================= */
function isValidId(v: any) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0;
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || "").trim());
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
   QuotationPrint
   - INTERNAL: requires logged in session (Supabase)
   - PUBLIC: requires ?t=... and loads via server public endpoint
   - Auto print only for PUBLIC mode (same as InvoicePrint)
========================= */
export default function QuotationPrint() {
  const { id } = useParams();
  const quotationId = Number(id);
  const nav = useNavigate();

  const [sp] = useSearchParams();
  const publicToken = (sp.get("t") || "").trim();
  const isPublicMode = !!publicToken;

  // ✅ auth check (internal only)
  const [authChecked, setAuthChecked] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

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

  // Guard invalid id
  if (!isValidId(quotationId)) {
    return <div className="p-6 text-sm text-muted-foreground">Invalid quotation id.</div>;
  }

  // If internal and not logged in -> auth
  if (!isPublicMode) {
    if (!authChecked) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
    if (!isLoggedIn) return <Navigate to="/auth" replace />;
  }

  // A4 wrapper root (exact node for print)
  const printRootRef = useRef<HTMLDivElement | null>(null);

  // Ensures auto-print triggers only once
  const printOnceRef = useRef(false);
  const [printPreparing, setPrintPreparing] = useState(false);

  /* =========================
     Load quotation bundle
     - PUBLIC: getQuotationPrintBundle(id, { publicToken })
     - INTERNAL: getQuotationPrintBundle(id) uses Supabase authenticated joins
  ========================= */
  const bundleQ = useQuery({
    queryKey: ["quotation_print_bundle", quotationId, publicToken],
    enabled: isValidId(quotationId) && (isPublicMode ? true : authChecked),
    queryFn: async () => {
      if (isPublicMode) {
        const t = String(publicToken || "").trim();
        if (!isUuid(t)) throw new Error("Not found / invalid link");
        return await getQuotationPrintBundle(quotationId, { publicToken: t });
      }
      if (!isLoggedIn) throw new Error("Unauthorized");
      return await getQuotationPrintBundle(quotationId);
    },
    staleTime: 15_000,
  });

  const isLoading = bundleQ.isLoading;
  const payload: any = bundleQ.data;

  const qRow = payload?.quotation ?? payload?.quote ?? payload?.qRow ?? null;
  const items = payload?.items || [];
  const customer = payload?.customer || null;

  const quoteNo = String(qRow?.quotation_number || qRow?.quotation_no || qRow?.number || qRow?.id || quotationId);

  /* =========================
     Map items to RamPotteryDocItem
     (match your InvoicePrint mapping shape)
  ========================= */
const uom = String(it.uom || "BOX").toUpperCase() === "PCS" ? "PCS" : "BOX";
const upb = uom === "PCS" ? 1 : Number(it.units_per_box ?? p?.units_per_box ?? 0);

return {
  sn: idx + 1,
  item_code: p?.item_code || p?.sku || it.item_code || it.sku || "",
  box: uom,
  unit_per_box: upb,
  total_qty: Number(it.total_qty ?? 0),
  description: it.description || p?.name || "",
  unit_price_excl_vat: Number(it.unit_price_excl_vat ?? 0),
  unit_vat: Number(it.unit_vat ?? 0),
  unit_price_incl_vat: Number(it.unit_price_incl_vat ?? 0),
  line_total: Number(it.line_total ?? 0),
} as any;


  /* =========================
     Print (safe, once)
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

  // Auto print once AFTER render (public token links only)
  useEffect(() => {
    if (isLoading) return;
    if (!qRow) return;
    if (!isPublicMode) return;
    safePrintOnce();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, qRow?.id, isPublicMode]);

  /* =========================
     Render states
  ========================= */
  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading print…</div>;
  }

  if (bundleQ.isError || !qRow) {
    return (
      <div className="p-6 text-sm text-destructive">
        Quotation not found / invalid link.
        {isPublicMode ? (
          <div className="mt-2 text-xs text-muted-foreground">
            Public links must include a valid token (<b>?t=...</b>)
          </div>
        ) : (
          <div className="mt-2 text-xs text-muted-foreground">Please check quotation ID and your access.</div>
        )}
      </div>
    );
  }

  /* =========================
     Render
  ========================= */
  return (
    <div className="print-shell p-4">
      <style>{`
        @page { size: A4 portrait; margin: 10mm; }
        html, body { height: auto; }
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .print-shell{ background:#fff; }
        @media print{
          .no-print{ display:none !important; }
          .print-shell{ padding:0 !important; }
        }
      `}</style>

      {/* Toolbar (hidden on print) */}
      <div className="no-print flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="text-sm text-muted-foreground">
          Quotation <b>{quoteNo}</b>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => nav(`/quotations/${quotationId}`)}>
            Back
          </Button>

          <Button onClick={() => safePrintOnce()} disabled={printPreparing}>
            {printPreparing ? "Preparing…" : "Print / Save PDF"}
          </Button>
        </div>
      </div>

      {/* A4 WRAPPER */}
      <div className="print-stage">
        <div ref={printRootRef} className="a4-sheet">
          <div className="a4-content">
            <RamPotteryDoc
              variant="QUOTATION"
              showFooterBar={false}
              docNoLabel="QUOTATION NO:"
              docNoValue={quoteNo}
              dateLabel="DATE:"
              dateValue={fmtDDMMYYYY(qRow.quotation_date)}
              purchaseOrderLabel={qRow.valid_until ? "VALID UNTIL:" : "PURCHASE ORDER NO:"}
              purchaseOrderValue={qRow.valid_until ? fmtDDMMYYYY(qRow.valid_until) : ""}
              salesRepName={qRow.sales_rep || ""}
              salesRepPhone={qRow.sales_rep_phone || ""}
              customer={{
                name: customer?.name || qRow.customer_name || "",
                address: customer?.address || "",
                phone: customer?.phone || "",
                brn: customer?.brn || "",
                vat_no: customer?.vat_no || "",
                customer_code: customer?.customer_code || qRow.customer_code || "",
              }}
              company={{
                brn: "C17144377",
                vat_no: "123456789",
              }}
              items={docItems}
              totals={{
                subtotal: Number(qRow.subtotal || 0),
                vatLabel: `VAT ${Number(qRow.vat_percent ?? 15)}%`,
                vat_amount: Number(qRow.vat_amount || 0),
                total_amount: Number(qRow.total_amount || 0),

                previous_balance: 0,
                amount_paid: 0,
                balance_remaining: 0,

                discount_percent: Number(qRow.discount_percent || 0),
                discount_amount: Number(qRow.discount_amount || 0),
              }}
              preparedBy={String(qRow.prepared_by || "Manish")}
              deliveredBy={String(qRow.delivered_by || "")}
              logoSrc={LOGO_SRC}
            />
          </div>

          <div className="rp-page-footer" />
        </div>
      </div>
    </div>
  );
}

