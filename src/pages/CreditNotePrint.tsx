// src/pages/CreditNotePrint.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";

import RamPotteryDoc from "@/components/print/RamPotteryDoc";
import { supabase } from "@/integrations/supabase/client";

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

async function safeJson(res: Response) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
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

export default function CreditNotePrint() {
  // ✅ hooks always at top
  const { id } = useParams();
  const creditNoteId = Number(id);
  const nav = useNavigate();

  const [sp] = useSearchParams();
  const publicToken = (sp.get("t") || "").trim();
  const isPublicMode = !!publicToken;

  // Auth check (internal only)
  const [authChecked, setAuthChecked] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // Screen preview root (visible)
  const screenRootRef = useRef<HTMLDivElement | null>(null);
  // Print root (visible only in print)
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

  // ===== hard cleanup for rp-printing =====
  useEffect(() => {
    const cleanup = () => {
      document.body.classList.remove("rp-printing");
      setPrintPreparing(false);
    };

    const after = () => cleanup();

    const mq = window.matchMedia?.("print");
    const onMq = () => {
      if (mq && !mq.matches) cleanup();
    };

    window.addEventListener("afterprint", after);
    if (mq) mq.addEventListener?.("change", onMq);

    return () => {
      window.removeEventListener("afterprint", after);
      if (mq) mq.removeEventListener?.("change", onMq);
      cleanup();
    };
  }, []);

  // ===== data =====
  const cnQ = useQuery({
    queryKey: ["credit_note_print_bundle", creditNoteId, publicToken],
    enabled: isValidId(creditNoteId) && (isPublicMode ? true : authChecked && isLoggedIn),
    queryFn: async () => {
      // PUBLIC
      if (isPublicMode) {
        const t = String(publicToken || "").trim();
        if (!isUuid(t)) throw new Error("Not found / invalid link");

        const res = await fetch(`/api/public/credit-note-print?id=${creditNoteId}&t=${encodeURIComponent(t)}`);
        const json = await safeJson(res);
        if (!json?.ok) throw new Error(json?.error || "Failed to load");

        return {
          ok: true,
          credit_note: json.credit_note,
          customer: json.customer || null,
          items: json.items || [],
        };
      }

      // INTERNAL
      if (!isLoggedIn) throw new Error("Unauthorized");

      // 1) credit note
      const { data: cn, error: cnErr } = await supabase
        .from("credit_notes")
        .select(
          `
          id,
          credit_note_number,
          credit_note_date,
          invoice_id,
          customer_id,
          reason,
          subtotal,
          vat_amount,
          total_amount,
          status,
          created_at
        `
        )
        .eq("id", creditNoteId)
        .maybeSingle();

      if (cnErr) throw cnErr;
      if (!cn) throw new Error("Credit note not found");

      // 2) items (+ product)
      const { data: itemsRaw, error: itErr } = await supabase
        .from("credit_note_items")
        .select(
          `
          id,
          credit_note_id,
          product_id,
          total_qty,
          unit_price_excl_vat,
          unit_vat,
          unit_price_incl_vat,
          line_total,
          products:product_id ( id, name, item_code, sku, units_per_box )
        `
        )
        .eq("credit_note_id", creditNoteId)
        .order("id", { ascending: true });

      if (itErr) throw itErr;
      const items = (itemsRaw || []).map((it: any) => ({ ...it, product: it.products || null }));

      // 3) customer
      let customer: any = null;
      if ((cn as any).customer_id) {
        const { data: c, error: cErr } = await supabase
          .from("customers")
          .select("id, name, address, phone, whatsapp, brn, vat_no, customer_code")
          .eq("id", (cn as any).customer_id)
          .maybeSingle();
        if (cErr) throw cErr;
        customer = c || null;
      }

      return { ok: true, credit_note: cn, customer, items };
    },
    staleTime: 15_000,
  });

  const payload: any = cnQ.data;
  const cn = payload?.credit_note || null;
  const items = payload?.items || [];
  const customer = payload?.customer || null;

  const cnNo = useMemo(() => {
    return String(cn?.credit_note_number || cn?.number || cn?.id || creditNoteId);
  }, [cn, creditNoteId]);

  // Map to RamPotteryDoc items (same look as invoice/quote)
  const docItems = useMemo(() => {
    return (items || []).map((it: any, idx: number) => {
      const p = it.product || it.products || null;

      // credit notes usually PCS; we’ll keep BOX default but safe
      const uom = "PCS";
      const upb = 1;

      return {
        sn: idx + 1,
        item_code: p?.item_code || p?.sku || "",
        uom,
        units_per_box: upb,
        total_qty: Math.trunc(n2(it.total_qty ?? 0)),
        description: String(p?.name || "").trim() || `Item #${it.id}`,
        unit_price_excl_vat: n2(it.unit_price_excl_vat ?? 0),
        unit_vat: n2(it.unit_vat ?? 0),
        unit_price_incl_vat: n2(it.unit_price_incl_vat ?? 0),
        line_total: n2(it.line_total ?? 0),
      } as any;
    });
  }, [items]);

  function smartBack() {
    if (window.history.length > 1) nav(-1);
    else nav(`/credit-notes/${creditNoteId}`);
  }

  async function doPrint() {
    if (printPreparing) return;

    setPrintPreparing(true);
    document.body.classList.add("rp-printing");

    try {
      // @ts-ignore
      if (document?.fonts?.ready) await document.fonts.ready;
    } catch {}

    if (screenRootRef.current) await waitForImages(screenRootRef.current);
    if (printRootRef.current) await waitForImages(printRootRef.current);

    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

    try {
      window.print();
    } finally {
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
    if (cnQ.isLoading) return;
    if (!cn) return;
    autoPrintOnce();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPublicMode, cnQ.isLoading, cn?.id]);

  /* =========================
     Renders AFTER hooks
  ========================= */
  if (!isValidId(creditNoteId)) {
    return <div className="p-6 text-sm text-muted-foreground">Invalid credit note id.</div>;
  }

  if (!isPublicMode) {
    if (!authChecked) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
    if (!isLoggedIn) return <Navigate to="/auth" replace />;
  }

  if (cnQ.isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading credit note…</div>;
  }

  if (cnQ.isError || !cn) {
    const errMsg = (cnQ.error as any)?.message || "";
    return (
      <div className="p-6 text-sm text-destructive">
        Credit note not found / invalid link.
        <div className="mt-2 text-xs text-muted-foreground">
          {isPublicMode ? (
            <>
              Public links must include a valid token (<b>?t=...</b>)
            </>
          ) : (
            <>Please check the ID and your access.</>
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
      variant="CREDIT_NOTE"
      showFooterBar={false}
      docNoLabel="CREDIT NOTE NO:"
      docNoValue={cnNo}
      dateLabel="DATE:"
      dateValue={fmtDDMMYYYY(cn.credit_note_date)}
      purchaseOrderLabel={cn.invoice_id ? "INVOICE ID:" : undefined}
      purchaseOrderValue={cn.invoice_id ? String(cn.invoice_id) : ""}
      salesRepName={""}
      salesRepPhone={""}
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
        subtotal: n2(cn.subtotal || 0),
        vatPercentLabel: `VAT 15%`,
        vat_amount: n2(cn.vat_amount || 0),
        total_amount: n2(cn.total_amount || 0),

        previous_balance: 0,
        amount_paid: 0,
        balance_remaining: 0,

        discount_percent: 0,
        discount_amount: 0,
      }}
      preparedBy={""}
      deliveredBy={""}
      logoSrc={LOGO_SRC}
    />
  );

  return (
    <div className="print-shell p-4">
      {/* Toolbar */}
      <div className="no-print flex items-center justify-between gap-3 mb-3">
        <div className="text-sm text-muted-foreground">
          Credit Note <b>{cnNo}</b>
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

      {/* Screen preview */}
      <div ref={screenRootRef} className="inv-screen">
        {Doc}
      </div>

      {/* Print root */}
      <div className="rp-print" id="rpdoc-print-root" ref={printRootRef}>
        {Doc}
      </div>
    </div>
  );
}



