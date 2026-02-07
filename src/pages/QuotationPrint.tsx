// src/pages/QuotationPrint.tsx
import React, { useMemo, useEffect, useRef, useState } from "react";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";

import RamPotteryDoc, { RamPotteryDocItem } from "@/components/print/RamPotteryDoc";

import { supabase } from "@/integrations/supabase/client";
import { getQuotation, getQuotationItems } from "@/lib/quotations";
import { listCustomers } from "@/lib/customers";

import "@/styles/rpdoc.css";

/* =========================
   Helpers
========================= */
function isValidId(v: any) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0;
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

const LOGO_SRC = "/logo.png";

/**
 * QuotationPrint — same behavior/polish as Invoice print:
 * - Supports authenticated print (no token needed if logged in)
 * - Supports shared public link (?t=...) like your credit note print pattern
 * - Auto print once, with fallback "Print / Save PDF" bar
 */
export default function QuotationPrint() {
  const { id } = useParams();
  const quotationId = Number(id);
  const nav = useNavigate();

  const [sp] = useSearchParams();
  const publicToken = (sp.get("t") || "").trim();

  // ✅ if no token, require login (same as your CreditNotePrint)
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

  // Guard invalid id
  if (!isValidId(quotationId)) {
    return <div className="p-6 text-sm text-muted-foreground">Invalid quotation id.</div>;
  }

  // Guard token/login
  if (!publicToken) {
    if (!authChecked) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
    if (!isLoggedIn) return <Navigate to="/auth" replace />;

    // Logged in but no token: allow normal print page without error message
    // (Invoice print behavior). We just continue; no blocking.
  }

  // ========= Load data =========
  const qQ = useQuery({
    queryKey: ["quotation", quotationId, publicToken || "auth"],
    queryFn: () => getQuotation(quotationId), // auth path (RLS)
    enabled: isValidId(quotationId),
    staleTime: 15_000,
  });

  const itemsQ = useQuery({
    queryKey: ["quotation_items", quotationId, publicToken || "auth"],
    queryFn: () => getQuotationItems(quotationId),
    enabled: isValidId(quotationId),
    staleTime: 15_000,
  });

  const qRow: any = qQ.data;
  const items: any[] = (itemsQ.data as any[]) || [];

  const custId = qRow?.customer_id ?? null;

  const customersQ = useQuery({
    queryKey: ["customers", "print-lite", custId],
    queryFn: () => listCustomers({ activeOnly: false, limit: 5000 } as any),
    enabled: !!custId,
    staleTime: 60_000,
  });

  const customer = useMemo(() => {
    if (!custId) return null;
    const list = (customersQ.data || []) as any[];
    return list.find((c) => c.id === custId) ?? null;
  }, [customersQ.data, custId]);

  const docItems: RamPotteryDocItem[] = useMemo(() => {
    return (items || []).map((it: any, idx: number) => ({
      sn: idx + 1,
      item_code: String(it.item_code || it.product?.item_code || it.product?.sku || ""),
      uom: String(it.uom || "BOX").toUpperCase(),
      box_qty: Number(it.box_qty || 0),
      units_per_box: Number(it.units_per_box || 0),
      total_qty: Number(it.total_qty || 0),
      description: String(it.description || it.product?.name || ""),
      unit_price_excl_vat: Number(it.unit_price_excl_vat || 0),
      unit_vat: Number(it.unit_vat || 0),
      unit_price_incl_vat: Number(it.unit_price_incl_vat || 0),
      line_total: Number(it.line_total || 0),
    }));
  }, [items]);

  const isLoading = qQ.isLoading || itemsQ.isLoading || (customersQ.isLoading && !!custId);

  // ========= Auto print (premium + safe) =========
  const printedRef = useRef(false);
  const [logoReady, setLogoReady] = useState(false);
  const [showManualPrint, setShowManualPrint] = useState(false);

  useEffect(() => {
    if (logoReady) return;
    const t = window.setTimeout(() => setLogoReady(true), 700);
    return () => window.clearTimeout(t);
  }, [logoReady]);

  useEffect(() => {
    if (printedRef.current) return;
    if (isLoading) return;
    if (!qRow) return;
    if (!logoReady) return;

    const raf1 = requestAnimationFrame(() => {
      const raf2 = requestAnimationFrame(() => {
        try {
          window.focus();
          window.print();
          printedRef.current = true;
          window.setTimeout(() => setShowManualPrint(true), 600);
        } catch {
          setShowManualPrint(true);
        }
      });
      return () => cancelAnimationFrame(raf2);
    });

    return () => cancelAnimationFrame(raf1);
  }, [isLoading, qRow, logoReady]);

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading print…</div>;
  }

  if (!qRow) {
    return (
      <div className="p-6 text-sm text-destructive">
        Quotation not found
        <div className="mt-2 text-xs text-muted-foreground">
          If this happens right after creating, check Supabase RLS for SELECT on quotations / quotation_items.
        </div>
      </div>
    );
  }

  const quoteNo = String(qRow.quotation_number || qRow.quotation_no || qRow.number || qRow.id);

  return (
    <div className="print-shell p-4">
      {/* Force print to look exactly like invoice print (portrait + margins) */}
      <style>{`
        @page { size: A4 portrait; margin: 10mm; }
        html, body { height: auto; }
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .print-shell{ background:#fff; }
        .no-print{ display:flex; }
        @media print{
          .no-print{ display:none !important; }
          .print-shell{ padding:0 !important; }
        }
        .printBar{
          margin: 10px 0 12px;
          padding: 10px;
          border: 1px solid rgba(15,23,42,.18);
          border-radius: 12px;
          background: rgba(248,250,252,.9);
          display:flex;
          justify-content:space-between;
          align-items:center;
          gap:10px;
          box-shadow: 0 10px 28px rgba(2,6,23,.06);
          font-size: 12px;
          color: rgba(15,23,42,.75);
        }
        .printBar b{ color: rgba(15,23,42,.92); }
      `}</style>

      {/* Toolbar (hidden on print) */}
      <div className="no-print flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="text-sm text-muted-foreground">
          Print preview • Quotation <b>{quoteNo}</b>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => nav(`/quotations/${quotationId}`)}>
            Back
          </Button>
          <Button onClick={() => window.print()}>Print</Button>
        </div>
      </div>

      {showManualPrint ? (
        <div className="printBar no-print">
          <div>
            <b>To save PDF:</b> click <b>Print</b> then choose <b>Save as PDF</b>.
          </div>
          <Button onClick={() => window.print()}>Print / Save PDF</Button>
        </div>
      ) : null}

      {/* Print area */}
      <div className="print-area">
        {/* preload logo so auto-print waits nicely */}
        <img
          src={LOGO_SRC}
          alt=""
          style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
          onLoad={() => setLogoReady(true)}
          onError={() => setLogoReady(true)}
        />

        <RamPotteryDoc
          variant="QUOTATION"
          docNoLabel="QUOTATION NO:"
          docNoValue={quoteNo}
          dateLabel="DATE:"
          dateValue={fmtDDMMYYYY(qRow.quotation_date)}
          // Reuse PO field as Valid Until (keeps doc UI identical)
          purchaseOrderLabel={qRow.valid_until ? "VALID UNTIL:" : undefined}
          purchaseOrderValue={qRow.valid_until ? fmtDDMMYYYY(qRow.valid_until) : ""}
          salesRepName={qRow.sales_rep || ""}
          salesRepPhone={qRow.sales_rep_phone || ""}
          customer={{
            // If user selected "Client Name" during creation, qRow.customer_name stores it.
            name: customer?.name || qRow.customer_name || "",
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
            subtotal: Number(qRow.subtotal || 0),
            vatPercentLabel: `VAT ${Number(qRow.vat_percent ?? 15)}%`,
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
    </div>
  );
}



