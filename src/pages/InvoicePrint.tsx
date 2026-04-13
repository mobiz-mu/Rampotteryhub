// src/pages/InvoicePrint.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import html2pdf from "html2pdf.js";

import { getInvoicePrintBundle } from "@/lib/invoices";
import RamPotteryDoc, { type RamPotteryDocItem } from "@/components/print/RamPotteryDoc";
import { supabase } from "@/integrations/supabase/client";

import "@/styles/rpdoc.css";

const WA_PHONE = "2307788884";

function isValidId(v: any) {
  const x = Number(v);
  return Number.isFinite(x) && x > 0;
}

function n(v: any) {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}

function r2(v: any) {
  return Math.round(n(v) * 100) / 100;
}

function rs(v: any) {
  return `Rs ${n(v).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function fmtDDMMYYYY(v: any) {
  const s = String(v || "").trim();
  if (!s) return "";

  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;

  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    const pad = (x: number) => String(x).padStart(2, "0");
    return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
  }

  return s;
}

function txt(v: any) {
  return String(v ?? "").trim();
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

async function safeJson(res: Response) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export default function InvoicePrint() {
  const { id } = useParams();
  const invoiceId = Number(id);
  const nav = useNavigate();

  const [sp] = useSearchParams();
  const embedMode = sp.get("embed") === "1";
  const publicToken = (sp.get("t") || "").trim();
  const isPublicMode = !!publicToken;

  const [authChecked, setAuthChecked] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [printPreparing, setPrintPreparing] = useState(false);

  const docRootRef = useRef<HTMLDivElement | null>(null);

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

  const invoiceQ = useQuery({
    queryKey: ["invoice_print_bundle", invoiceId, publicToken],
    enabled: isValidId(invoiceId) && (isPublicMode ? true : authChecked),
    queryFn: async () => {
      if (isPublicMode) {
        const res = await fetch(
          `/api/public/invoice-print?id=${invoiceId}&t=${encodeURIComponent(publicToken)}`
        );
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

  const printCustomer = useMemo(() => {
    return {
      name: txt(customer?.name || customer?.customer_name),
      address: txt(customer?.address),
      phone: txt(customer?.phone || customer?.tel || customer?.telephone),
      whatsapp: txt(
        customer?.whatsapp || customer?.whats_app || customer?.mobile || customer?.mobile_no
      ),
      brn: txt(customer?.brn),
      vat_no: txt(customer?.vat_no || customer?.vat),
      customer_code: txt(customer?.customer_code || customer?.code),
    };
  }, [customer]);

  const docItems: RamPotteryDocItem[] = useMemo(() => {
    return (items || []).map((it: any, idx: number) => {
      const p = it.product || it.products || null;

      const rawUom = String(it.uom || it.unit || "BOX").trim().toUpperCase();
      const uom: "BOX" | "PCS" | "KG" | "G" | "BAG" =
        rawUom === "PCS"
          ? "PCS"
          : rawUom === "KG" || rawUom === "KGS"
          ? "KG"
          : rawUom === "G" || rawUom === "GRAM" || rawUom === "GRAMS"
          ? "G"
          : rawUom === "BAG" || rawUom === "BAGS"
          ? "BAG"
          : "BOX";

      return {
        sn: idx + 1,
        item_code: p?.item_code || p?.sku || it.item_code || it.sku || "",
        uom,
        units_per_box: Number(it.units_per_box ?? it.unit_per_box ?? p?.units_per_box ?? 1),
        box_qty: Number(it.box_qty ?? it.boxQty ?? it.qty_box ?? it.qty ?? 0),
        pcs_qty: Number(it.pcs_qty ?? it.pcsQty ?? it.qty_pcs ?? 0),
        total_qty: Number(it.total_qty ?? it.totalQty ?? 0),
        description: it.description || p?.name || "",
        unit_price_excl_vat: Number(it.unit_price_excl_vat ?? 0),
        unit_vat: Number(it.unit_vat ?? 0),
        unit_price_incl_vat: Number(it.unit_price_incl_vat ?? 0),
        line_total: Number(it.line_total ?? 0),
      } as RamPotteryDocItem;
    });
  }, [items]);

  const printTotals = useMemo(() => {
  const subtotal = r2(
    docItems.reduce((sum, it) => {
      const qty = n(it.total_qty);
      const unitEx = r2(it.unit_price_excl_vat);
      return sum + r2(qty * unitEx);
    }, 0)
  );

  const vat = r2(
    docItems.reduce((sum, it) => {
      const qty = n(it.total_qty);
      const unitVat = r2(it.unit_vat);
      return sum + r2(qty * unitVat);
    }, 0)
  );

  const total = r2(
    docItems.reduce((sum, it) => {
      const qty = n(it.total_qty);
      const unitInc = r2(it.unit_price_incl_vat);
      return sum + r2(qty * unitInc);
    }, 0)
  );

  return {
    subtotal,
    vat,
    total,
    previousBalance: r2(inv?.previous_balance || 0),
  };
}, [docItems, inv]);

  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://rampotteryhub.com";

  const viewUrl = isPublicMode
    ? `${origin}/invoices/${invoiceId}/print?t=${encodeURIComponent(publicToken)}`
    : `${origin}/invoices/${invoiceId}/print`;

  const waHref = useMemo(() => {
    if (!inv || !isPublicMode) return "#";

    const gross = n(inv.gross_total ?? inv.total_amount ?? inv.total_incl_vat);
    const paid = n(inv.amount_paid);
    const due = Number.isFinite(Number(inv.balance_remaining))
      ? n(inv.balance_remaining)
      : Math.max(0, gross - paid);

    const msg = [
      "Ram Pottery Ltd",
      "",
      "Invoice details:",
      printCustomer.name ? `Customer: ${printCustomer.name}` : null,
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
  }, [inv, isPublicMode, printCustomer.name, viewUrl]);

  useEffect(() => {
    const after = () => {
      document.body.classList.remove("rp-printing");
      setPrintPreparing(false);
    };

    window.addEventListener("afterprint", after);
    return () => window.removeEventListener("afterprint", after);
  }, []);

  useEffect(() => {
    if (!embedMode || !docRootRef.current || !inv) return;

    let cancelled = false;

    const sendHeight = async () => {
      try {
        // @ts-ignore
        if (document?.fonts?.ready) await document.fonts.ready;
      } catch {}

      const root = docRootRef.current;
      if (!root || cancelled) return;

      await waitForImages(root);
      if (cancelled) return;

      const height = Math.max(
        root.scrollHeight,
        document.documentElement.scrollHeight,
        document.body.scrollHeight
      );

      window.parent?.postMessage(
        {
          type: "rp-invoice-embed-height",
          invoiceId,
          height,
        },
        "*"
      );
    };

    const t = window.setTimeout(() => {
      void sendHeight();
    }, 160);

    const onResize = () => {
      void sendHeight();
    };

    window.addEventListener("resize", onResize);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
      window.removeEventListener("resize", onResize);
    };
  }, [embedMode, invoiceId, inv, items.length]);

  async function doPrint() {
    if (!docRootRef.current || printPreparing) return;

    setPrintPreparing(true);
    document.body.classList.add("rp-printing");

    try {
      // @ts-ignore
      if (document?.fonts?.ready) await document.fonts.ready;
    } catch {}

    await waitForImages(docRootRef.current);

    window.setTimeout(() => {
      window.print();
    }, 200);
  }

  async function downloadPdfClient() {
    if (!docRootRef.current || !inv) return;

    const node = docRootRef.current;
    const prevWidth = node.style.width;
    const prevMaxWidth = node.style.maxWidth;

    node.style.width = "210mm";
    node.style.maxWidth = "210mm";

    try {
      // @ts-ignore
      if (document?.fonts?.ready) await document.fonts.ready;
    } catch {}

    await waitForImages(node);

    try {
      await html2pdf()
        .set({
          filename: `Invoice-${inv.invoice_number || inv.id}.pdf`,
          margin: 0,
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: {
            scale: 2.6,
            useCORS: true,
            backgroundColor: "#ffffff",
            scrollY: 0,
            scrollX: 0,
            windowWidth: node.scrollWidth,
            windowHeight: node.scrollHeight,
          },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
          pagebreak: {
            mode: ["css", "legacy"],
            avoid: ["tr", ".rpdoc-footerGrid", ".rpdoc-signatures"],
          },
        })
        .from(node)
        .save();
    } finally {
      node.style.width = prevWidth;
      node.style.maxWidth = prevMaxWidth;
    }
  }

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
          <div className="mt-2 text-xs text-muted-foreground">
            Please check invoice ID and your access.
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={embedMode ? "print-shell" : "print-shell p-4"}>
      {!embedMode ? (
        <div className="no-print mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm text-muted-foreground">
            Invoice {inv.invoice_number || `#${inv.id}`}
          </div>

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
      ) : null}

      <div className="print-stage">
        <div ref={docRootRef} id="rpdoc-print-root">
          <RamPotteryDoc
            docTitle="VAT INVOICE"
            companyName="RAM POTTERY LTD"
            logoSrc="/logo.png"
            customer={{
              name: printCustomer.name,
              address: printCustomer.address,
              phone: printCustomer.phone,
              whatsapp: printCustomer.whatsapp,
              brn: printCustomer.brn,
              vat_no: printCustomer.vat_no,
              customer_code: printCustomer.customer_code,
            }}
            company={{ brn: "C17144377", vat_no: "27490894" }}
            docNoLabel="INVOICE NO:"
            docNoValue={inv.invoice_number || `#${inv.id}`}
            dateLabel="DATE:"
            dateValue={fmtDDMMYYYY(inv.invoice_date)}
            purchaseOrderLabel="PO. No :"
            purchaseOrderValue={inv.purchase_order_no || ""}
            salesRepName={inv.sales_rep || ""}
            salesRepPhone={inv.sales_rep_phone || ""}
            items={docItems}
            totals={{
              subtotal: printTotals.subtotal,
              vatLabel: `VAT ${Number(inv.vat_percent ?? 15)}%`,
              vat_amount: printTotals.vat,
              total_amount: printTotals.total,
              previous_balance: printTotals.previousBalance,
              amount_paid: null,
              balance_remaining: null,
            }}
            preparedBy="Manish"
            deliveredBy=""
          />
        </div>
      </div>
    </div>
  );
}