// src/pages/Quotation.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import {
  MoreHorizontal,
  Eye,
  Printer,
  RefreshCw,
  Search,
  Filter,
  FileText,
  BadgeCheck,
  Send,
  Ban,
  PenLine,
  ArrowRightLeft,
} from "lucide-react";

import { listQuotations } from "@/lib/quotations";

/* =========================
   Helpers
========================= */
type QuotationStatus =
  | "DRAFT"
  | "SENT"
  | "ACCEPTED"
  | "REJECTED"
  | "EXPIRED"
  | "CONVERTED"
  // legacy / older data:
  | "CANCELLED"
  | string;

const n = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);

const rs = (v: any) =>
  `Rs ${n(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function fmtDate(v: any) {
  const s = String(v || "").trim();
  if (!s) return "—";
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  try {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d.toLocaleDateString();
  } catch {}
  return s || "—";
}

function normStatus(st: any): QuotationStatus {
  const s = String(st || "DRAFT").toUpperCase();

  if (s === "DRAFT") return "DRAFT";
  if (s === "SENT") return "SENT";
  if (s === "ACCEPTED") return "ACCEPTED";
  if (s === "REJECTED") return "REJECTED";
  if (s === "EXPIRED") return "EXPIRED";
  if (s === "CONVERTED") return "CONVERTED";

  // legacy
  if (s === "CANCELLED" || s === "CANCELED") return "CANCELLED";

  return s;
}

function statusLabel(st: QuotationStatus) {
  const s = String(st || "DRAFT").toUpperCase();
  if (s === "DRAFT") return "Draft";
  if (s === "SENT") return "Sent";
  if (s === "ACCEPTED") return "Accepted";
  if (s === "REJECTED") return "Rejected";
  if (s === "EXPIRED") return "Expired";
  if (s === "CONVERTED") return "Converted";
  if (s === "CANCELLED") return "Cancelled";
  return s;
}

function statusPillClass(st: QuotationStatus) {
  const s = String(st || "DRAFT").toUpperCase();

  if (s === "ACCEPTED") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (s === "SENT") return "bg-blue-50 text-blue-700 border-blue-200";
  if (s === "CONVERTED") return "bg-purple-50 text-purple-700 border-purple-200";
  if (s === "EXPIRED") return "bg-amber-50 text-amber-800 border-amber-200";
  if (s === "REJECTED" || s === "CANCELLED") return "bg-rose-50 text-rose-700 border-rose-200";

  return "bg-slate-50 text-slate-700 border-slate-200"; // DRAFT/default
}

function isExpiredRow(r: any) {
  const st = normStatus(r?.status);
  if (st === "EXPIRED") return true;

  // optional auto-expire hint if you store valid_until and status still DRAFT/SENT
  const vu = String(r?.valid_until || "").trim();
  if (!vu) return false;

  const d = new Date(vu);
  if (Number.isNaN(d.getTime())) return false;

  const now = new Date();
  // compare only date portion safely by setting time to start-of-day
  const d0 = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const n0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  return d0 < n0 && (st === "DRAFT" || st === "SENT");
}

/* =========================
   Page
========================= */
type Row = any;

export default function Quotation() {
  const nav = useNavigate();

  // UI state (invoice-style)
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<QuotationStatus | "ALL">("ALL");

  // Debounced search
  useEffect(() => {
    const t = window.setTimeout(() => setQ(qInput.trim()), 250);
    return () => window.clearTimeout(t);
  }, [qInput]);

  const listQ = useQuery({
    queryKey: ["quotations", q, status],
    queryFn: () => listQuotations({ q, status, limit: 500 }),
    staleTime: 12_000,
  });

  const rowsRaw: Row[] = Array.isArray(listQ.data) ? listQ.data : [];

  // ✅ “Expired overlay” without mutating DB:
  // if valid_until is past, treat it as EXPIRED visually.
  const rows = useMemo(() => {
    return rowsRaw.map((r) => {
      if (isExpiredRow(r)) return { ...r, __ui_status: "EXPIRED" };
      return r;
    });
  }, [rowsRaw]);

  const kpis = useMemo(() => {
    const totalValue = rows.reduce((sum, r) => sum + n(r.total_amount), 0);

    const draft = rows.filter((r) => normStatus(r.__ui_status || r.status) === "DRAFT").length;
    const sent = rows.filter((r) => normStatus(r.__ui_status || r.status) === "SENT").length;
    const accepted = rows.filter((r) => normStatus(r.__ui_status || r.status) === "ACCEPTED").length;
    const converted = rows.filter((r) => normStatus(r.__ui_status || r.status) === "CONVERTED").length;
    const expired = rows.filter((r) => normStatus(r.__ui_status || r.status) === "EXPIRED").length;
    const closed = rows.filter((r) => {
      const s = normStatus(r.__ui_status || r.status);
      return s === "REJECTED" || s === "CANCELLED";
    }).length;

    return { count: rows.length, totalValue, draft, sent, accepted, converted, expired, closed };
  }, [rows]);

  return (
    <div className="space-y-5">
      {/* Premium background hint (same theme you used on invoice/credit note list) */}
      <div className="pointer-events-none fixed inset-0 -z-10 opacity-60">
        <div className="absolute -top-24 left-1/2 h-72 w-[60rem] -translate-x-1/2 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-40 right-[-10rem] h-96 w-96 rounded-full bg-white/5 blur-3xl" />
      </div>

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 inline-flex h-10 w-10 items-center justify-center rounded-2xl border bg-white shadow-sm">
            <FileText className="h-5 w-5 text-slate-800" />
          </div>

          <div>
            <div className="text-2xl font-semibold tracking-tight">Quotations</div>
            <div className="text-sm text-muted-foreground">Draft • Send • Accept • Convert • Print</div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => nav("/dashboard")}>
            Back
          </Button>
          <Button onClick={() => nav("/quotations/new")}>+ New Quotation</Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-4">
        <Card className="p-4 rounded-2xl border bg-white/80 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-xs text-muted-foreground">Quotations</div>
            <div className="inline-flex h-8 w-8 items-center justify-center rounded-xl border bg-white">
              <FileText className="h-4 w-4 text-slate-700" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-semibold">{kpis.count}</div>
          <div className="mt-1 text-xs text-muted-foreground">In current filter</div>
        </Card>

        <Card className="p-4 rounded-2xl border bg-white/80 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-xs text-muted-foreground">Total Value</div>
            <div className="inline-flex h-8 w-8 items-center justify-center rounded-xl border bg-white">
              <BadgeCheck className="h-4 w-4 text-slate-700" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-semibold">{rs(kpis.totalValue)}</div>
          <div className="mt-1 text-xs text-muted-foreground">Sum of totals</div>
        </Card>

        <Card className="p-4 rounded-2xl border bg-white/80 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-xs text-muted-foreground">Pipeline</div>
            <div className="inline-flex h-8 w-8 items-center justify-center rounded-xl border bg-white">
              <Send className="h-4 w-4 text-slate-700" />
            </div>
          </div>
          <div className="mt-2 text-sm text-slate-900 space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-600">Draft</span>
              <b>{kpis.draft}</b>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Sent</span>
              <b>{kpis.sent}</b>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Expired</span>
              <b>{kpis.expired}</b>
            </div>
          </div>
        </Card>

        <Card className="p-4 rounded-2xl border bg-white/80 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-xs text-muted-foreground">Outcome</div>
            <div className="inline-flex h-8 w-8 items-center justify-center rounded-xl border bg-white">
              <ArrowRightLeft className="h-4 w-4 text-slate-700" />
            </div>
          </div>
          <div className="mt-2 text-sm text-slate-900 space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-600">Accepted</span>
              <b>{kpis.accepted}</b>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Converted</span>
              <b>{kpis.converted}</b>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Closed</span>
              <b>{kpis.closed}</b>
            </div>
          </div>
        </Card>
      </div>

      {/* Filters */}
      <Card className="p-4 rounded-2xl border bg-white/80 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full max-w-[520px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search: quotation no • customer • code • id"
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="inline-flex items-center gap-2">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl border bg-white">
              <Filter className="h-4 w-4 text-slate-700" />
            </div>

            <select
              className="h-10 rounded-xl border px-3 bg-white"
              value={status}
              onChange={(e) => setStatus(e.target.value as any)}
            >
              <option value="ALL">All</option>
              <option value="DRAFT">Draft</option>
              <option value="SENT">Sent</option>
              <option value="ACCEPTED">Accepted</option>
              <option value="REJECTED">Rejected</option>
              <option value="EXPIRED">Expired</option>
              <option value="CONVERTED">Converted</option>
              {/* legacy */}
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setQInput("");
                setStatus("ALL");
              }}
              className="rounded-xl"
            >
              Clear
            </Button>

            <Button
              variant="outline"
              onClick={() => listQ.refetch()}
              disabled={listQ.isFetching}
              className="rounded-xl"
            >
              <RefreshCw className={"mr-2 h-4 w-4 " + (listQ.isFetching ? "animate-spin" : "")} />
              {listQ.isFetching ? "Refreshing..." : "Refresh"}
            </Button>
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card className="overflow-hidden rounded-2xl border bg-white/80 shadow-sm">
        <div className="overflow-auto">
          <table className="w-full min-w-[1180px]">
            <thead className="bg-slate-50">
              <tr className="text-[12px] uppercase tracking-wide text-slate-600 border-b">
                <th className="px-4 py-3 text-left">Quotation</th>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Customer</th>
                <th className="px-4 py-3 text-left">Total</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-3 py-3 text-right" />
              </tr>
            </thead>

            <tbody className="divide-y">
              {rows.map((r: any) => {
                const st = normStatus(r.__ui_status || r.status);
                const quoteNo = String(r.quotation_number || r.quotation_no || r.number || `#${r.id}`);

                const custName = String(r.customer_name || r.customers?.name || "").trim() || "—";
                const custCode = String(r.customer_code || r.customers?.customer_code || "").trim();
                const validUntil = r.valid_until ? fmtDate(r.valid_until) : null;

                const canConvert = st === "ACCEPTED" || st === "SENT" || st === "DRAFT";
                const isUiExpired = st === "EXPIRED" && normStatus(r.status) !== "EXPIRED";

                return (
                  <tr
                    key={r.id}
                    className="hover:bg-slate-50/60"
                    onDoubleClick={() => nav(`/quotations/${r.id}`)}
                    title="Double-click to open"
                  >
                    <td className="px-4 py-3">
                      <div className="inline-flex items-center gap-2">
                        <div className="inline-flex items-center justify-center rounded-xl border bg-white px-3 py-2 font-semibold tracking-wide text-slate-900 shadow-sm">
                          {quoteNo}
                        </div>
                      </div>
                      <div className="mt-1 text-xs text-slate-500">ID: {r.id}</div>
                    </td>

                    <td className="px-4 py-3 text-sm text-slate-700">{fmtDate(r.quotation_date)}</td>

                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900">{custName}</div>
                      <div className="text-xs text-slate-500">
                        {custCode ? `Code: ${custCode}` : "—"}
                        {validUntil ? ` • Valid until: ${validUntil}` : ""}
                        {isUiExpired ? " • (Auto-expired by date)" : ""}
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <div className="text-xs text-slate-500">Total</div>
                      <div className="text-sm font-semibold text-slate-900">{rs(r.total_amount)}</div>
                      <div className="text-[11px] text-slate-500">
                        VAT: {rs(r.vat_amount)}
                        {n(r.discount_amount) > 0 ? ` • Disc: ${rs(r.discount_amount)}` : ""}
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <span
                        className={
                          "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold " +
                          statusPillClass(st)
                        }
                      >
                        {statusLabel(st)}
                      </span>
                    </td>

                    {/* actions */}
                    <td className="px-3 py-3 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className="h-9 w-9 inline-flex items-center justify-center rounded-full border bg-white hover:bg-slate-50"
                            aria-label="Actions"
                          >
                            <MoreHorizontal className="h-5 w-5 text-slate-700" />
                          </button>
                        </DropdownMenuTrigger>

                        <DropdownMenuContent align="end" className="w-64">
                          <DropdownMenuItem onClick={() => nav(`/quotations/${r.id}`)}>
                            <Eye className="mr-2 h-4 w-4" />
                            Open
                          </DropdownMenuItem>

                          <DropdownMenuItem
                            onClick={() => window.open(`/quotations/${r.id}/print`, "_blank", "noopener,noreferrer")}
                          >
                            <Printer className="mr-2 h-4 w-4" />
                            Print / Save PDF
                          </DropdownMenuItem>

                          <DropdownMenuItem onClick={() => nav(`/quotations/new?duplicate=${r.id}`)}>
                            <FileText className="mr-2 h-4 w-4" />
                            Duplicate
                          </DropdownMenuItem>

                          <DropdownMenuSeparator />

                          <DropdownMenuItem onClick={() => nav(`/quotations/${r.id}`)}>
                            <PenLine className="mr-2 h-4 w-4" />
                            Edit / Update
                          </DropdownMenuItem>

                          <DropdownMenuItem
                            onClick={() => nav(`/quotations/${r.id}`)}
                            disabled={!canConvert || st === "CONVERTED"}
                            title={st === "CONVERTED" ? "Already converted" : ""}
                          >
                            <ArrowRightLeft className="mr-2 h-4 w-4" />
                            Convert → Invoice
                          </DropdownMenuItem>

                          <DropdownMenuSeparator />

                          <DropdownMenuItem disabled>
                            {st === "DRAFT" ? <FileText className="mr-2 h-4 w-4" /> : null}
                            {st === "SENT" ? <Send className="mr-2 h-4 w-4" /> : null}
                            {st === "ACCEPTED" ? <BadgeCheck className="mr-2 h-4 w-4" /> : null}
                            {st === "CONVERTED" ? <ArrowRightLeft className="mr-2 h-4 w-4" /> : null}
                            {st === "EXPIRED" ? <Ban className="mr-2 h-4 w-4" /> : null}
                            {st === "REJECTED" || st === "CANCELLED" ? <Ban className="mr-2 h-4 w-4" /> : null}
                            Status: {statusLabel(st)}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                );
              })}

              {!listQ.isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-10 text-center">
                    <div className="mx-auto max-w-sm">
                      <div className="text-base font-semibold text-slate-900">No quotations found</div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        Try clearing filters or create your first quotation.
                      </div>
                      <div className="mt-4 flex items-center justify-center gap-2">
                        <Button
                          variant="outline"
                          onClick={() => {
                            setQInput("");
                            setStatus("ALL");
                          }}
                        >
                          Clear filters
                        </Button>
                        <Button onClick={() => nav("/quotations/new")}>+ New Quotation</Button>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="border-t bg-white/70 px-4 py-3 text-xs text-slate-600 flex items-center justify-between">
          <div>
            Showing <b>{rows.length}</b> results
            {status !== "ALL" ? (
              <>
                {" "}
                • Status: <b>{statusLabel(status as QuotationStatus)}</b>
              </>
            ) : null}
            {q ? (
              <>
                {" "}
                • Search: <b>{q}</b>
              </>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-2">
              <span className={"h-2 w-2 rounded-full " + (listQ.isFetching ? "bg-amber-500" : "bg-emerald-500")} />
              {listQ.isFetching ? "Updating…" : "Live"}
            </span>
          </div>
        </div>
      </Card>
    </div>
  );
}
