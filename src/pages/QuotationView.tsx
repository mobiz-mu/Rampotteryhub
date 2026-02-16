// src/pages/QuotationView.tsx
import React, { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { ArrowLeft, CheckCircle2, Copy, FileText, MoreHorizontal, Printer, Send, XCircle } from "lucide-react";

import { getQuotation, getQuotationItems, setQuotationStatus } from "@/lib/quotations";
import { convertQuotationToInvoice } from "@/lib/quotationConvert";
import { waLink, quotationShareMessage } from "@/lib/whatsapp";

/* =========================
   Helpers
========================= */
const n = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);

function money(v: any) {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n(v));
}

function qtyFmt(v: any, digits = 0) {
  const x = n(v);
  if (!Number.isFinite(x)) return "";
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(x);
}

function fmtDate(v: any) {
  const s = String(v || "").trim();
  if (!s) return "—";
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  try {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d.toLocaleDateString();
  } catch {}
  return s;
}

function isValidId(v: any) {
  const num = Number(v);
  return Number.isFinite(num) && num > 0;
}

type QStatus = "DRAFT" | "SENT" | "ACCEPTED" | "REJECTED" | "EXPIRED" | "CONVERTED" | "CANCELLED";

function qStatus(s: any): QStatus {
  const v = String(s || "DRAFT").toUpperCase();
  if (v === "ACCEPTED") return "ACCEPTED";
  if (v === "REJECTED") return "REJECTED";
  if (v === "EXPIRED") return "EXPIRED";
  if (v === "CANCELLED") return "CANCELLED";
  if (v === "SENT") return "SENT";
  if (v === "CONVERTED") return "CONVERTED";
  return "DRAFT";
}

function pillClass(st: QStatus) {
  if (st === "ACCEPTED") return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (st === "SENT") return "bg-blue-100 text-blue-700 border-blue-200";
  if (st === "CONVERTED") return "bg-purple-100 text-purple-700 border-purple-200";
  if (st === "EXPIRED") return "bg-amber-100 text-amber-800 border-amber-200";
  if (st === "REJECTED" || st === "CANCELLED") return "bg-rose-100 text-rose-700 border-rose-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
}

function normalizeUom(u: any) {
  const x = String(u || "BOX").trim().toUpperCase();
  if (x === "PCS") return "PCS";
  if (x === "KG") return "KG";
  if (x === "G") return "G";
  if (x === "GRAM" || x === "GRAMS") return "G";
  if (x === "BAG" || x === "BAGS") return "BAG";
  return "BOX";
}

function uomQtyDigits(uom: string) {
  // PCS / BAG / G / BOX are integer-like in your DB
  // KG may be decimal (12,3)
  if (uom === "KG") return 3;
  return 0;
}

function qtyInputByUom(it: any, uom: string) {
  // ✅ DB mapping:
  // BOX: box_qty
  // PCS: pcs_qty
  // KG : box_qty (as kg_qty)
  // G  : grams_qty
  // BAG: bags_qty
  if (uom === "PCS") return n(it?.pcs_qty ?? 0);
  if (uom === "G") return n(it?.grams_qty ?? 0);
  if (uom === "BAG") return n(it?.bags_qty ?? 0);
  // BOX or KG
  return n(it?.box_qty ?? 0);
}

function unitByUom(it: any, uom: string) {
  // ✅ Unit column:
  // BOX: units_per_box
  // others: —
  if (uom === "BOX") return n(it?.units_per_box ?? 1);
  return null;
}

/* =========================
   Page
========================= */
export default function QuotationView() {
  const nav = useNavigate();
  const { id } = useParams();
  const quotationId = Number(id);

  // ✅ Guard: never show “not found” for invalid URLs
  if (!isValidId(quotationId)) {
    return (
      <div className="space-y-4">
        <Card className="p-6">
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => nav(-1)}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          </div>
          <div className="mt-4 text-sm text-muted-foreground">Invalid quotation link.</div>
        </Card>
      </div>
    );
  }

  const [busyStatus, setBusyStatus] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);

  const qQ = useQuery({
    queryKey: ["quotation", quotationId],
    queryFn: () => getQuotation(quotationId),
    staleTime: 10_000,
  });

  const itemsQ = useQuery({
    queryKey: ["quotation_items", quotationId],
    queryFn: () => getQuotationItems(quotationId),
    staleTime: 10_000,
  });

  const qRow: any = qQ.data;
  const items: any[] = itemsQ.data || [];
  const loading = qQ.isLoading || itemsQ.isLoading;

  const st = useMemo(() => qStatus(qRow?.status), [qRow?.status]);

  const no = String(qRow?.quotation_number || qRow?.quotation_no || qRow?.number || qRow?.id || quotationId);
  const customerName = String(qRow?.customer_name || "");
  const customerCode = String(qRow?.customer_code || "");
  const customerPhone = String(qRow?.customer_phone || qRow?.phone || ""); // optional if you add later

  const totals = useMemo(() => {
    const subtotal = n(qRow?.subtotal ?? 0);
    const vat = n(qRow?.vat_amount ?? 0);
    const total = n(qRow?.total_amount ?? 0);
    const disc = n(qRow?.discount_amount ?? 0);
    const vatPct = n(qRow?.vat_percent ?? 15);
    const discPct = n(qRow?.discount_percent ?? 0);
    return { subtotal, vat, total, disc, vatPct, discPct };
  }, [qRow]);

  async function updateStatus(next: string) {
    try {
      setBusyStatus(next);
      await setQuotationStatus(quotationId, next as any);
      toast.success(`Status updated: ${next}`);
      await Promise.all([qQ.refetch(), itemsQ.refetch()]);
    } catch (e: any) {
      toast.error(e?.message || "Failed to update status");
    } finally {
      setBusyStatus(null);
    }
  }

  async function onConvert() {
    try {
      setConverting(true);
      const { invoiceId, invoiceNumber } = await convertQuotationToInvoice(quotationId);
      toast.success(`Converted to Invoice ${invoiceNumber || ""}`.trim());
      nav(`/invoices/${invoiceId}`);
    } catch (e: any) {
      toast.error(e?.message || "Convert failed");
    } finally {
      setConverting(false);
    }
  }

  function onWhatsApp() {
    const msg = quotationShareMessage({
      quotationNo: qRow?.quotation_number || null,
      quotationId,
      customerName: qRow?.customer_name || null,
    });

    // ✅ safe fallback
    const phone = customerPhone?.trim() ? customerPhone : "23000000000";
    const url = waLink(phone, msg);
    window.open(url, "_blank", "noreferrer");
  }

  async function onCopyLink() {
    try {
      setActionBusy(true);
      const url = `${window.location.origin}/quotations/${quotationId}`;
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error("Copy failed");
    } finally {
      setActionBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Card className="p-6 text-sm text-muted-foreground">Loading…</Card>
      </div>
    );
  }

  if (!qRow) {
    return (
      <div className="space-y-4">
        <Card className="p-6">
          <div className="font-semibold text-rose-700">Quotation not found</div>
          <div className="text-sm text-muted-foreground mt-2">
            If you just created it and you still see this, it’s usually a Supabase RLS policy blocking SELECT on{" "}
            <b>quotations</b>.
          </div>

          <div className="mt-4 flex gap-2">
            <Button variant="outline" onClick={() => nav(-1)}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <Button variant="outline" onClick={() => nav("/quotations")}>
              Go to Quotations
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ========= Header (InvoiceView-style) ========= */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <Button variant="outline" onClick={() => nav("/quotations")} className="mt-1">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to list
          </Button>

          <div>
            <div className="text-2xl font-semibold">
              Quotation <span className="text-slate-900">{no}</span>
            </div>
            <div className="text-sm text-muted-foreground">
              Date: <b className="text-slate-800">{fmtDate(qRow.quotation_date)}</b>
              {qRow.valid_until ? (
                <>
                  {" "}
                  • Valid until: <b className="text-slate-800">{fmtDate(qRow.valid_until)}</b>
                </>
              ) : null}
            </div>

            {(qRow.sales_rep || qRow.sales_rep_phone) && (
              <div className="text-xs text-slate-500 mt-1">
                {qRow.sales_rep ? <span>Sales Rep: {String(qRow.sales_rep)}</span> : null}
                {qRow.sales_rep && qRow.sales_rep_phone ? <span> • </span> : null}
                {qRow.sales_rep_phone ? <span>{String(qRow.sales_rep_phone)}</span> : null}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => window.open(`/quotations/${quotationId}/print`, "_blank", "noopener,noreferrer")}
          >
            <Printer className="mr-2 h-4 w-4" />
            Print
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="h-10 w-10 inline-flex items-center justify-center rounded-full border bg-white hover:bg-slate-50"
                aria-label="Actions"
                disabled={actionBusy}
                title={actionBusy ? "Please wait..." : "Actions"}
              >
                <MoreHorizontal className="h-5 w-5 text-slate-700" />
              </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={() => nav(`/quotations/new?duplicate=${quotationId}`)}>
                <FileText className="mr-2 h-4 w-4" />
                Duplicate
              </DropdownMenuItem>

              <DropdownMenuItem onClick={onCopyLink} disabled={actionBusy}>
                <Copy className="mr-2 h-4 w-4" />
                Copy link
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem onClick={onWhatsApp}>
                <Send className="mr-2 h-4 w-4" />
                WhatsApp share
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem onClick={onConvert} disabled={converting || st === "CONVERTED"}>
                <FileText className="mr-2 h-4 w-4" />
                {st === "CONVERTED" ? "Already converted" : converting ? "Converting…" : "Convert → Invoice"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ========= Top cards (InvoiceView-style) ========= */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Customer</div>
          <div className="font-semibold text-slate-900">{customerName || "—"}</div>
          {customerCode ? <div className="text-xs text-slate-500">{customerCode}</div> : null}
          {customerPhone ? <div className="text-xs text-slate-500 mt-1">{customerPhone}</div> : null}
        </Card>

        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Status</div>
          <div className="mt-1">
            <span
              className={
                "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold " + pillClass(st)
              }
            >
              {st}
            </span>
          </div>

          <div className="text-xs text-slate-500 mt-2">
            VAT: <b className="text-slate-700">{qtyFmt(totals.vatPct, 0)}%</b>
            {totals.discPct > 0 ? (
              <>
                {" "}
                • Discount: <b className="text-slate-700">{qtyFmt(totals.discPct, 2)}%</b>
              </>
            ) : null}
          </div>
        </Card>

        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Totals</div>
          <div className="mt-1 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-600">Subtotal</span>
              <b className="text-slate-900">Rs {money(totals.subtotal)}</b>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">VAT</span>
              <b className="text-slate-900">Rs {money(totals.vat)}</b>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Discount</span>
              <b className="text-slate-900">Rs {money(totals.disc)}</b>
            </div>
            <div className="h-px bg-slate-200 my-1" />
            <div className="flex justify-between">
              <span className="text-slate-600">Total</span>
              <b className="text-slate-900">Rs {money(totals.total)}</b>
            </div>
          </div>
        </Card>
      </div>

      {/* ========= Status actions row ========= */}
      <Card className="p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="font-semibold">Update status</div>
            <div className="text-xs text-muted-foreground">Draft → Sent → Accepted / Rejected (then Convert)</div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => updateStatus("DRAFT")} disabled={!!busyStatus}>
              <FileText className="mr-2 h-4 w-4" />
              {busyStatus === "DRAFT" ? "..." : "Draft"}
            </Button>

            <Button variant="outline" onClick={() => updateStatus("SENT")} disabled={!!busyStatus}>
              <Send className="mr-2 h-4 w-4" />
              {busyStatus === "SENT" ? "..." : "Sent"}
            </Button>

            <Button variant="outline" onClick={() => updateStatus("ACCEPTED")} disabled={!!busyStatus}>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              {busyStatus === "ACCEPTED" ? "..." : "Accepted"}
            </Button>

            <Button variant="outline" onClick={() => updateStatus("REJECTED")} disabled={!!busyStatus}>
              <XCircle className="mr-2 h-4 w-4" />
              {busyStatus === "REJECTED" ? "..." : "Rejected"}
            </Button>

            <Button
              variant="outline"
              onClick={onConvert}
              disabled={converting || st === "CONVERTED" || (st !== "ACCEPTED" && st !== "SENT" && st !== "DRAFT")}
              title={st === "CONVERTED" ? "Already converted" : "Convert this quotation to an invoice"}
            >
              <FileText className="mr-2 h-4 w-4" />
              {converting ? "Converting…" : "Convert → Invoice"}
            </Button>
          </div>
        </div>
      </Card>

      {/* ========= Items ========= */}
      <Card className="overflow-hidden">
        <div className="overflow-auto">
          <table className="w-full min-w-[1200px]">
            <thead className="bg-slate-50">
              <tr className="text-[12px] uppercase tracking-wide text-slate-600 border-b">
                <th className="px-4 py-3 text-left">#</th>
                <th className="px-4 py-3 text-left">Item</th>
                <th className="px-4 py-3 text-left">Code</th>
                <th className="px-4 py-3 text-center">UOM</th>
                <th className="px-4 py-3 text-right">Qty</th>
                <th className="px-4 py-3 text-right">Unit</th>
                <th className="px-4 py-3 text-right">Total Qty</th>
                <th className="px-4 py-3 text-right">Unit Ex</th>
                <th className="px-4 py-3 text-right">VAT (unit)</th>
                <th className="px-4 py-3 text-right">Unit Inc</th>
                <th className="px-4 py-3 text-right">Line Total</th>
              </tr>
            </thead>

            <tbody className="divide-y">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={11} className="p-6 text-center text-sm text-muted-foreground">
                    No items found.
                  </td>
                </tr>
              ) : (
                items.map((it: any, idx: number) => {
                  const p = it.product || it.products || null;
                  const code = String(it.item_code || p?.item_code || p?.sku || "—");
                  const desc = String(it.description || p?.name || "—");

                  const uom = normalizeUom(it.uom);
                  const qty = qtyInputByUom(it, uom);
                  const unit = unitByUom(it, uom);

                  const tqty = n(it.total_qty);

                  return (
                    <tr key={it.id || idx}>
                      <td className="px-4 py-3">{idx + 1}</td>

                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{desc}</div>
                      </td>

                      <td className="px-4 py-3 text-sm text-slate-700">{code}</td>

                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center rounded-md border bg-white px-2 py-1 text-xs font-semibold text-slate-700">
                          {uom}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-right">{qty ? qtyFmt(qty, uomQtyDigits(uom)) : ""}</td>

                      <td className="px-4 py-3 text-right">{unit ? qtyFmt(unit, 0) : "—"}</td>

                      <td className="px-4 py-3 text-right">{tqty ? qtyFmt(tqty, 0) : ""}</td>

                      <td className="px-4 py-3 text-right">{money(it.unit_price_excl_vat)}</td>
                      <td className="px-4 py-3 text-right">{money(it.unit_vat)}</td>
                      <td className="px-4 py-3 text-right">{money(it.unit_price_incl_vat)}</td>
                      <td className="px-4 py-3 text-right font-semibold">{money(it.line_total)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ========= Notes ========= */}
      <Card className="p-4">
        <div className="font-semibold">Notes</div>
        <div className="text-sm text-muted-foreground mt-1">{qRow.notes ? String(qRow.notes) : "—"}</div>
      </Card>
    </div>
  );
}
