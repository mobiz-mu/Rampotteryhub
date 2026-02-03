// src/pages/QuotationPrint.tsx
import React, { useMemo, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";

import RamPotteryDoc, { RamPotteryDocItem } from "@/components/print/RamPotteryDoc";

import { getQuotation, getQuotationItems } from "@/lib/quotations";
import { listCustomers } from "@/lib/customers";

import "@/styles/rpdoc.css";

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

export default function QuotationPrint() {
  const { id } = useParams();
  const quotationId = Number(id);
  const nav = useNavigate();

  const qQ = useQuery({
    queryKey: ["quotation", quotationId],
    queryFn: () => getQuotation(quotationId),
    enabled: isValidId(quotationId),
    staleTime: 15_000,
  });

  const itemsQ = useQuery({
    queryKey: ["quotation_items", quotationId],
    queryFn: () => getQuotationItems(quotationId),
    enabled: isValidId(quotationId),
    staleTime: 15_000,
  });

  const qRow: any = qQ.data;
  const items: any[] = (itemsQ.data as any[]) || [];

  const custId = qRow?.customer_id ?? null;

  const customersQ = useQuery({
    queryKey: ["customers", "print-lite"],
    queryFn: () => listCustomers({ activeOnly: false, limit: 5000 } as any),
    enabled: !!custId,
    staleTime: 60_000,
  });

  const customer = useMemo(() => {
    if (!custId) return null;
    const list = (customersQ.data || []) as any[];
    return list.find((c) => c.id === custId) ?? null;
  }, [customersQ.data, custId]);

  // Helpful: open print dialog automatically when route is /print
  // Comment out if you prefer manual print click only.
  useEffect(() => {
    // only when data is ready
    if (qQ.isLoading || itemsQ.isLoading) return;
    if (!qRow) return;
    // small delay to let layout settle
    const t = window.setTimeout(() => window.print(), 250);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qQ.isLoading, itemsQ.isLoading, qRow?.id]);

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

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading print…</div>;
  }

  if (!qRow) {
    return <div className="p-6 text-sm text-destructive">Quotation not found</div>;
  }

  const quoteNo = String(qRow.quotation_number || qRow.quotation_no || qRow.number || qRow.id);

  return (
    <div className="print-shell p-4">
      {/* Toolbar (hidden on print) */}
      <div className="no-print flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="text-sm text-muted-foreground">Print preview • Quotation {quoteNo}</div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => nav(`/quotations/${quotationId}`)}>
            Back
          </Button>
          <Button onClick={() => window.print()}>Print</Button>
        </div>
      </div>

      {/* Print area */}
      <div className="print-area">
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
          // TODO: replace with your real company BRN/VAT (or load from settings table)
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

            // Not used for quotation print, but RamPotteryDoc totals expects these keys
            previous_balance: 0,
            amount_paid: 0,
            balance_remaining: 0,

            discount_percent: Number(qRow.discount_percent || 0),
            discount_amount: Number(qRow.discount_amount || 0),
          }}
          preparedBy={String(qRow.prepared_by || "Manish")}
          deliveredBy={String(qRow.delivered_by || "")}
          logoSrc={"/logo.png"}
        />
      </div>
    </div>
  );
}



