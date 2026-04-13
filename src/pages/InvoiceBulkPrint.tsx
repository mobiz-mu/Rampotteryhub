import React, { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { getInvoicePrintBundle } from "@/lib/invoices";
import RamPotteryDoc, { type RamPotteryDocItem } from "@/components/print/RamPotteryDoc";
import "@/styles/rpdoc.css";

function parseIds(raw: string) {
  return Array.from(
    new Set(
      String(raw || "")
        .split(",")
        .map((x) => Number(x.trim()))
        .filter((x) => Number.isFinite(x) && x > 0)
    )
  );
}

function n(v: any) {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}

function r2(v: any) {
  return Math.round(n(v) * 100) / 100;
}

function txt(v: any) {
  return String(v ?? "").trim();
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

function mapItems(items: any[]): RamPotteryDocItem[] {
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
}

export default function InvoiceBulkPrint() {
  const nav = useNavigate();
  const [sp] = useSearchParams();

  const ids = useMemo(() => parseIds(sp.get("ids") || ""), [sp]);

  const [authChecked, setAuthChecked] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [printPreparing, setPrintPreparing] = useState(false);

  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!alive) return;

      setIsLoggedIn(!!data?.session);
      setAuthChecked(true);
    })();

    return () => {
      alive = false;
    };
  }, []);

  const bulkQ = useQuery({
    queryKey: ["invoice_bulk_print_docs", ids],
    enabled: authChecked && isLoggedIn && ids.length > 0,
    queryFn: async () => Promise.all(ids.map((id) => getInvoicePrintBundle(id))),
    staleTime: 15000,
  });

  useEffect(() => {
    const after = () => {
      document.body.classList.remove("rp-printing");
      setPrintPreparing(false);
    };

    window.addEventListener("afterprint", after);
    return () => window.removeEventListener("afterprint", after);
  }, []);

  async function doPrint() {
    if (!rootRef.current || printPreparing || !bulkQ.data?.length) return;

    setPrintPreparing(true);
    document.body.classList.add("rp-printing");

    try {
      // @ts-ignore
      if (document?.fonts?.ready) await document.fonts.ready;
    } catch {}

    await waitForImages(rootRef.current);

    window.setTimeout(() => {
      window.print();
    }, 300);
  }

  if (!ids.length) {
    return <div className="p-6 text-sm text-muted-foreground">No invoices selected.</div>;
  }

  if (!authChecked) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }

  if (!isLoggedIn) {
    return <Navigate to="/auth" replace />;
  }

  if (bulkQ.isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading invoices…</div>;
  }

  if (bulkQ.isError || !bulkQ.data?.length) {
    return <div className="p-6 text-sm text-red-600">Failed to load invoices for bulk print.</div>;
  }

  return (
    <div className="print-shell p-4">
      <style>{`
        .rp-bulk-toolbar{
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:12px;
          margin-bottom:12px;
        }

        .rp-bulk-stage{
          display:block;
        }

        .rp-bulk-doc{
          margin:0 0 10mm 0;
          padding:0;
          background:#fff;
          break-after:page;
          page-break-after:always;
        }

        .rp-bulk-doc:last-child{
          break-after:auto;
          page-break-after:auto;
        }

        @media print{
          .rp-bulk-toolbar{
            display:none !important;
          }

          .rp-bulk-stage{
            padding:0 !important;
            margin:0 !important;
            background:#fff !important;
          }

          #rpdoc-print-root{
            margin:0 !important;
            padding:0 !important;
          }

          .rp-bulk-doc{
            margin:0 !important;
            padding:0 !important;
            background:#fff !important;
            break-after:page !important;
            page-break-after:always !important;
          }

          .rp-bulk-doc:last-child{
            break-after:auto !important;
            page-break-after:auto !important;
          }
        }
      `}</style>

      <div className="rp-bulk-toolbar no-print">
        <div className="text-sm text-muted-foreground">
          Bulk print • {bulkQ.data.length} invoice{bulkQ.data.length > 1 ? "s" : ""}
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              if (window.opener) window.close();
              else nav(-1);
            }}
          >
            Back
          </Button>

          <Button onClick={doPrint} disabled={printPreparing}>
            {printPreparing ? "Preparing…" : "Print"}
          </Button>
        </div>
      </div>

      <div className="print-stage rp-bulk-stage">
        <div ref={rootRef} id="rpdoc-print-root">
          {bulkQ.data.map((bundle: any, idx: number) => {
            const inv = bundle?.invoice || {};
            const customer = bundle?.customer || inv?.customers || inv?.customer || null;
            const items = mapItems(bundle?.items || []);

            const printCustomer = {
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

            return (
              <div className="rp-bulk-doc" key={inv?.id || idx}>
                <RamPotteryDoc
                  docTitle="VAT INVOICE"
                  companyName="RAM POTTERY LTD"
                  logoSrc="/logo.png"
                  customer={printCustomer}
                  company={{ brn: "C17144377", vat_no: "27490894" }}
                  docNoLabel="INVOICE NO:"
                  docNoValue={inv.invoice_number || `#${inv.id}`}
                  dateLabel="DATE:"
                  dateValue={fmtDDMMYYYY(inv.invoice_date)}
                  purchaseOrderLabel="PO. No :"
                  purchaseOrderValue={inv.purchase_order_no || ""}
                  salesRepName={inv.sales_rep || ""}
                  salesRepPhone={inv.sales_rep_phone || ""}
                  items={items}
                  totals={{
                    subtotal: r2(inv?.subtotal),
                    vatLabel: `VAT ${Number(inv?.vat_percent ?? 15)}%`,
                    discount_percent: Number(inv?.discount_percent ?? 0),
                    discount_amount: Number(inv?.discount_amount ?? 0),
                    vat_amount: r2(inv?.vat_amount),
                    total_amount: r2(inv?.total_amount),
                    previous_balance: r2(inv?.previous_balance || 0),
                    amount_paid: null,
                    balance_remaining: null,
                  }}
                  preparedBy="Manish"
                  deliveredBy=""
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}