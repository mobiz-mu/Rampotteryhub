// src/pages/QuotationPrint.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";

import RamPotteryDoc from "@/components/print/RamPotteryDoc";
import { supabase } from "@/integrations/supabase/client";
import { getQuotationPrintBundle } from "@/lib/quotations";

import "@/styles/rpdoc.css";
import "@/styles/print.css";

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

const n2 = (v: any) => {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
};

function up(s: any) {
  return String(s || "").trim().toUpperCase();
}

/** ✅ normalize to your new quotation UOM set */
function normalizeUom(u: any): "BOX" | "PCS" | "KG" | "G" | "BAG" {
  const x = up(u);
  if (x === "PCS") return "PCS";
  if (x === "KG") return "KG";
  if (x === "G") return "G";
  if (x === "GRAM" || x === "GRAMS") return "G";
  if (x === "BAG" || x === "BAGS") return "BAG";
  return "BOX";
}

/**
 * ✅ Qty input field by UOM
 * (this matches the recommended schema mapping)
 * - BOX: box_qty
 * - PCS: pcs_qty
 * - KG : box_qty (stored as kg input)
 * - G  : grams_qty
 * - BAG: bags_qty
 */
function qtyInputByUom(it: any, uom: "BOX" | "PCS" | "KG" | "G" | "BAG") {
  if (uom === "PCS") return n2(it?.pcs_qty ?? it?.box_qty ?? 0);
  if (uom === "G") return n2(it?.grams_qty ?? 0);
  if (uom === "BAG") return n2(it?.bags_qty ?? 0);
  // BOX or KG
  return n2(it?.box_qty ?? 0);
}

function intishQty(uom: "BOX" | "PCS" | "KG" | "G" | "BAG", v: any) {
  const x = n2(v);
  // keep KG as numeric (can be 12,3), others are int-like in your DB
  return uom === "KG" ? x : Math.trunc(x);
}

export default function QuotationPrint() {
  // ✅ hooks always at top
  const { id } = useParams();
  const quotationId = Number(id);
  const nav = useNavigate();

  const [sp] = useSearchParams();
  const publicToken = (sp.get("t") || "").trim();
  const isPublicMode = !!publicToken;

  const [authChecked, setAuthChecked] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // Screen preview root (visible on screen)
  const screenRootRef = useRef<HTMLDivElement | null>(null);
  // Print root (ONLY visible during print due to your global CSS)
  const printRootRef = useRef<HTMLDivElement | null>(null);

  const printOnceRef = useRef(false);
  const [printPreparing, setPrintPreparing] = useState(false);

  // ===== auth check =====
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

  // ===== hard cleanup for rp-printing (afterprint is not reliable) =====
  useEffect(() => {
    const cleanup = () => {
      document.body.classList.remove("rp-printing");
      setPrintPreparing(false);
    };

    const after = () => cleanup();

    // Fallback: print media query
    const mq = window.matchMedia?.("print");
    const onMq = () => {
      // when leaving print preview, matches becomes false
      if (mq && !mq.matches) cleanup();
    };

    window.addEventListener("afterprint", after);
    if (mq) mq.addEventListener?.("change", onMq);

    // also cleanup on unmount
    return () => {
      window.removeEventListener("afterprint", after);
      if (mq) mq.removeEventListener?.("change", onMq);
      cleanup();
    };
  }, []);

  // ===== data =====
  const bundleQ = useQuery({
    queryKey: ["quotation_print_bundle", quotationId, publicToken],
    enabled: isValidId(quotationId) && (isPublicMode ? true : authChecked && isLoggedIn),
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

  const payload: any = bundleQ.data;
  const qRow = payload?.quotation ?? payload?.quote ?? payload?.qRow ?? null;
  const items = payload?.items || [];
  const customer = payload?.customer || null;

  const quoteNo = useMemo(() => {
    return String(qRow?.quotation_number || qRow?.quotation_no || qRow?.number || qRow?.id || quotationId);
  }, [qRow, quotationId]);

  /**
   * ✅ Build items for RamPotteryDoc (invoice-style object)
   * Important:
   * - We always pass `box_qty` as "input qty" for printing, even for KG/G/BAG,
   *   because the doc template already knows how to show `uom` + qty.
   * - We also pass pcs_qty/grams_qty/bags_qty when present (safe extra keys).
   */
  const docItems = useMemo(() => {
    return (items || []).map((it: any, idx: number) => {
      const p = it.product || it.products || null;

      const uom = normalizeUom(it.uom);
      const inputQty = qtyInputByUom(it, uom);

      // Unit column (UPB) should only apply to BOX; else 1
      const upb =
        uom === "BOX" ? Math.max(1, Math.trunc(n2(it.units_per_box ?? p?.units_per_box ?? 1))) : 1;

      // Total qty:
      // - BOX: box_qty * upb
      // - PCS: pcs_qty
      // - KG : kg_qty
      // - G  : grams_qty
      // - BAG: bags_qty
      // Prefer stored total_qty if present (backend may already compute)
      const storedTotalQty = n2(it.total_qty ?? 0);
      const computedTotalQty =
        uom === "BOX"
          ? intishQty(uom, inputQty) * upb
          : // keep KG numeric, others int
            intishQty(uom, inputQty);

      const totalQty = storedTotalQty > 0 ? storedTotalQty : computedTotalQty;

      return {
        sn: idx + 1,
        item_code: p?.item_code || p?.sku || it.item_code || it.sku || "",
        uom,

        // ✅ input qty (kept as box_qty for compatibility with existing doc template)
        box_qty: inputQty,
        pcs_qty: n2(it.pcs_qty ?? 0),
        grams_qty: n2(it.grams_qty ?? 0),
        bags_qty: n2(it.bags_qty ?? 0),

        units_per_box: upb,
        total_qty: totalQty,

        description: String(it.description || p?.name || "").trim(),

        unit_price_excl_vat: n2(it.unit_price_excl_vat ?? 0),
        unit_vat: n2(it.unit_vat ?? 0),
        unit_price_incl_vat: n2(it.unit_price_incl_vat ?? 0),
        line_total: n2(it.line_total ?? 0),
      } as any;
    });
  }, [items]);

  function smartBack() {
    if (window.history.length > 1) nav(-1);
    else nav(`/quotations/${quotationId}`);
  }

  async function doPrint() {
    if (printPreparing) return;

    setPrintPreparing(true);
    document.body.classList.add("rp-printing");

    try {
      // @ts-ignore
      if (document?.fonts?.ready) await document.fonts.ready;
    } catch {}

    // Wait images in BOTH roots (screen + print)
    if (screenRootRef.current) await waitForImages(screenRootRef.current);
    if (printRootRef.current) await waitForImages(printRootRef.current);

    // let CSS apply after adding rp-printing
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

    try {
      window.print();
    } finally {
      // ✅ immediate fallback cleanup (in case afterprint never fires)
      window.setTimeout(() => {
        document.body.classList.remove("rp-printing");
        setPrintPreparing(false);
      }, 800);
    }
  }

  async function autoPrintOnce() {
    if (printOnceRef.current) return;
    printOnceRef.current = true;
    await doPrint();
  }

  useEffect(() => {
    if (!isPublicMode) return;
    if (bundleQ.isLoading) return;
    if (!qRow) return;
    autoPrintOnce();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPublicMode, bundleQ.isLoading, qRow?.id]);

  /* =========================
     Renders (after hooks)
  ========================= */
  if (!isValidId(quotationId)) {
    return <div className="p-6 text-sm text-muted-foreground">Invalid quotation id.</div>;
  }

  if (!isPublicMode) {
    if (!authChecked) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
    if (!isLoggedIn) return <Navigate to="/auth" replace />;
  }

  if (bundleQ.isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading print…</div>;
  }

  if (bundleQ.isError || !qRow) {
    const errMsg = (bundleQ.error as any)?.message || "";
    return (
      <div className="p-6 text-sm text-destructive">
        Quotation not found / invalid link.
        <div className="mt-2 text-xs text-muted-foreground">
          {isPublicMode ? (
            <>
              Public links must include a valid token (<b>?t=...</b>)
            </>
          ) : (
            <>Please check quotation ID and your access.</>
          )}
        </div>
        {errMsg ? (
          <div className="mt-2 text-xs text-muted-foreground">
            <b>Error:</b> {errMsg}
          </div>
        ) : null}
      </div>
    );
  }

  const Doc = (
    <RamPotteryDoc
      variant="QUOTATION"
      showFooterBar={false}
      docNoLabel="QUOTATION NO:"
      docNoValue={quoteNo}
      dateLabel="DATE:"
      dateValue={fmtDDMMYYYY(qRow.quotation_date)}
      purchaseOrderLabel={qRow.valid_until ? "VALID UNTIL:" : undefined}
      purchaseOrderValue={qRow.valid_until ? fmtDDMMYYYY(qRow.valid_until) : ""}
      salesRepName={String(qRow.sales_rep || "")}
      salesRepPhone={String(qRow.sales_rep_phone || "")}
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
        subtotal: n2(qRow.subtotal || 0),
        vatPercentLabel: `VAT ${n2(qRow.vat_percent ?? 15)}%`,
        vat_amount: n2(qRow.vat_amount || 0),
        total_amount: n2(qRow.total_amount || 0),

        previous_balance: 0,
        amount_paid: 0,
        balance_remaining: 0,

        discount_percent: n2(qRow.discount_percent || 0),
        discount_amount: n2(qRow.discount_amount || 0),
      }}
      preparedBy={String(qRow.prepared_by || "Manish")}
      deliveredBy={String(qRow.delivered_by || "")}
      logoSrc={LOGO_SRC}
    />
  );

  return (
    <div className="print-shell p-4">
      {/* Screen toolbar */}
      <div className="no-print flex items-center justify-between gap-3 mb-3">
        <div className="text-sm text-muted-foreground">
          Quotation <b>{quoteNo}</b>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={smartBack}>
            Back
          </Button>

          <Button onClick={doPrint} disabled={printPreparing}>
            {printPreparing ? "Preparing…" : "Print / Save PDF"}
          </Button>
        </div>
      </div>

      {/* ✅ SCREEN PREVIEW (visible) */}
      <div ref={screenRootRef} className="inv-screen">
        {Doc}
      </div>

      {/* ✅ PRINT ROOT (hidden on screen; visible in print) */}
      <div className="rp-print" id="rpdoc-print-root" ref={printRootRef}>
        {Doc}
      </div>
    </div>
  );
}
