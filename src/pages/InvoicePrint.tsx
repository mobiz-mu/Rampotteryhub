import React, { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";

import RamPotteryDoc, { RamPotteryDocItem } from "@/components/print/RamPotteryDoc";
import { getInvoice } from "@/lib/invoices";
import { listInvoiceItems } from "@/lib/invoiceItems";
import { listCustomers } from "@/lib/customers";

import "@/styles/rpdoc.css";
import { waLink, invoiceShareMessage } from "@/lib/whatsapp";

const WA_PHONE = "2307788884";

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

export default function InvoicePrint() {
  const { id } = useParams();
  const invoiceId = Number(id);
  const nav = useNavigate();

  const invoiceQ = useQuery({
    queryKey: ["invoice", invoiceId],
    queryFn: () => getInvoice(invoiceId),
    enabled: isValidId(invoiceId),
    staleTime: 15_000,
  });

  const inv = invoiceQ.data as any;

  const itemsQ = useQuery({
    queryKey: ["invoice_items", invoiceId],
    queryFn: () => listInvoiceItems(invoiceId),
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

  const docItems: RamPotteryDocItem[] = useMemo(() => {
    return (items || []).map((it: any, idx: number) => ({
      sn: idx + 1,
      item_code: it.product?.item_code || it.product?.sku || "",
      uom: String(it.uom || "BOX").toUpperCase(),
      box_qty: Number(it.box_qty || 0),
      units_per_box: Number(it.units_per_box || 0),
      total_qty: Number(it.total_qty || 0),
      description: it.description || it.product?.name || "",
      unit_price_excl_vat: Number(it.unit_price_excl_vat || 0),
      unit_vat: Number(it.unit_vat || 0),
      unit_price_incl_vat: Number(it.unit_price_incl_vat || 0),
      line_total: Number(it.line_total || 0),
    }));
  }, [items]);

  const waHref = useMemo(() => {
    if (!inv) return "#";
    const msg = invoiceShareMessage({ invoiceNo: inv.invoice_number, invoiceId: inv.id });
    return waLink(WA_PHONE, msg);
  }, [inv?.id, inv?.invoice_number]);

  const isLoading =
    invoiceQ.isLoading || itemsQ.isLoading || (customersQ.isLoading && !!custId);

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading print…</div>;
  }

  if (!inv) {
    return <div className="p-6 text-sm text-destructive">Invoice not found</div>;
  }

  return (
    <div className="print-shell p-4">
      {/* Toolbar (hidden on print) */}
      <div className="no-print flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="text-sm text-muted-foreground">
          Print preview • Invoice {inv.invoice_number}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => nav(`/invoices/${invoiceId}`)}>
            Back
          </Button>

          <Button variant="outline" asChild>
            <a href={waHref} target="_blank" rel="noreferrer">
              Send via WhatsApp
            </a>
          </Button>

          <Button onClick={() => window.print()}>Print</Button>
        </div>
      </div>

      {/* Print area */}
      <div className="print-area">
        <RamPotteryDoc
          variant="INVOICE"
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
            vatPercentLabel: `VAT ${Number(inv.vat_percent ?? 15)}%`,
            vat_amount: Number(inv.vat_amount || 0),
            total_amount: Number(inv.total_amount || 0),
            previous_balance: Number(inv.previous_balance || 0),
            amount_paid: Number(inv.amount_paid || 0),
            balance_remaining: Number(inv.balance_remaining || 0),
            discount_percent: Number(inv.discount_percent || 0),
            discount_amount: Number(inv.discount_amount || 0),
          }}
          preparedBy={"Manish"}
          deliveredBy={""}
          logoSrc={"/logo.png"}
        />
      </div>
    </div>
  );
}


