// src/components/CustomersReport.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Customer } from "@/types/customer";

import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { toast } from "sonner";

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import {
  RefreshCw,
  FileSpreadsheet,
  FileDown,
  CalendarDays,
  ChevronDown,
  Filter,
  X,
  ChevronsLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
} from "lucide-react";

import { cn } from "@/lib/utils";

/* =========================
   Types
========================= */
export type ReportGranularity = "DAILY" | "MONTHLY" | "YEARLY";

export type CustomerBalanceRow = {
  period: string;
  customer_id: number;
  customer_code: string;
  customer_name: string;
  client_name: string;
  sales_rep: string;
  opening: number; // shown once per customer in range
  debit: number;
  credit: number;
  running_balance: number; // cumulative per customer
};

type Totals = { opening: number; debit: number; credit: number; endBalance: number };

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;

  /** Pass your already-loaded customers list from Customers page */
  customers: Customer[];
  /** Optional: default selected customer id ("ALL" if omitted) */
  defaultCustomerId?: string;

  /** Optional: start + end dates (YYYY-MM-DD). If omitted, this month -> today. */
  defaultFromISO?: string;
  defaultToISO?: string;
};

/* =========================
   Helpers
========================= */
function s(v: any) {
  return String(v ?? "").trim();
}
function n0(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function monthStartISO(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function yearStartISO(d = new Date()) {
  return new Date(d.getFullYear(), 0, 1).toISOString().slice(0, 10);
}
function fmtMoney(v: any) {
  const nf = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return nf.format(n0(v));
}
function fmtRs(v: any) {
  return `Rs ${fmtMoney(v)}`;
}

function periodLabel(periodISO: string, gran: ReportGranularity) {
  if (!periodISO) return "—";
  const d = new Date(periodISO);
  if (Number.isNaN(d.getTime())) return periodISO;

  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");

  if (gran === "YEARLY") return `${y}`;
  if (gran === "MONTHLY") return `${y}-${m}`;
  return `${y}-${m}-${day}`;
}

function viewNameForGran(gran: ReportGranularity) {
  if (gran === "DAILY") return "v_customer_daily_summary";
  if (gran === "YEARLY") return "v_customer_yearly_summary";
  return "v_customer_monthly_summary";
}

function computeTotals(rows: CustomerBalanceRow[]) {
  const debit = rows.reduce((a, r) => a + n0(r.debit), 0);
  const credit = rows.reduce((a, r) => a + n0(r.credit), 0);
  const opening = rows.reduce((a, r) => a + n0(r.opening), 0);

  // end balance (grand) = sum per-customer last running balance
  const lastByCustomer = new Map<number, number>();
  for (const r of rows) lastByCustomer.set(r.customer_id, n0(r.running_balance));
  const endBalance = Array.from(lastByCustomer.values()).reduce((a, x) => a + n0(x), 0);

  return { debit, credit, opening, endBalance };
}

function buildPdf(args: {
  title: string;
  subtitle: string;
  gran: ReportGranularity;
  fromISO: string;
  toISO: string;
  includeOpening: boolean;
  rows: CustomerBalanceRow[];
  totals: Totals;
}) {
  const { title, subtitle, gran, fromISO, toISO, includeOpening, rows, totals } = args;

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(title, 40, 42);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(subtitle, 40, 62);

  doc.setFontSize(10);
  doc.text(
    `Granularity: ${gran}   From: ${fromISO}   To: ${toISO}   Opening: ${includeOpening ? "Included" : "Excluded"}`,
    40,
    80
  );

  doc.setFont("helvetica", "bold");
  doc.text(
    `Totals — Opening: ${fmtMoney(includeOpening ? totals.opening : 0)}   Debit: ${fmtMoney(
      totals.debit
    )}   Credit: ${fmtMoney(totals.credit)}   Ending: ${fmtMoney(totals.endBalance)}`,
    40,
    100
  );

  const head = [
    [
      "Period",
      "Customer Code",
      "Customer Name",
      "Client Name",
      "Sales Rep",
      "Opening",
      "Debit",
      "Credit",
      "Running Balance",
    ],
  ];

  const body = rows.map((r) => [
    periodLabel(r.period, gran),
    r.customer_code || "-",
    r.customer_name || "-",
    r.client_name || "-",
    r.sales_rep || "—",
    fmtMoney(includeOpening ? r.opening : 0),
    fmtMoney(r.debit),
    fmtMoney(r.credit),
    fmtMoney(r.running_balance),
  ]);

  autoTable(doc, {
    head,
    body,
    startY: 120,
    styles: { font: "helvetica", fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: [11, 18, 32], textColor: 255 },
    columnStyles: {
      5: { halign: "right" },
      6: { halign: "right" },
      7: { halign: "right" },
      8: { halign: "right" },
    },
    margin: { left: 40, right: 40 },
    didDrawPage: () => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text("Ram Pottery Ltd — Customer Balance Report", pageW - 40, 20, { align: "right" });
    },
  });

  return doc;
}

function downloadCsv(args: {
  rows: CustomerBalanceRow[];
  gran: ReportGranularity;
  includeOpening: boolean;
  filename: string;
}) {
  const { rows, gran, includeOpening, filename } = args;

  const header = [
    "period",
    "customer_code",
    "customer_name",
    "client_name",
    "sales_rep",
    "opening",
    "debit",
    "credit",
    "running_balance",
  ];

  const esc = (v: any) => {
    const str = String(v ?? "");
    if (/[,"\n]/.test(str)) return `"${str.replaceAll('"', '""')}"`;
    return str;
  };

  const data = rows.map((r) => [
    periodLabel(r.period, gran),
    r.customer_code || "",
    r.customer_name || "",
    r.client_name || "",
    r.sales_rep || "",
    (includeOpening ? r.opening : 0).toFixed(2),
    n0(r.debit).toFixed(2),
    n0(r.credit).toFixed(2),
    n0(r.running_balance).toFixed(2),
  ]);

  const csv = [header, ...data].map((row) => row.map(esc).join(",")).join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}

/* =========================
   Component
========================= */
export default function CustomersReport({
  open,
  onOpenChange,
  customers,
  defaultCustomerId,
  defaultFromISO,
  defaultToISO,
}: Props) {
  const [customerId, setCustomerId] = useState<string>(defaultCustomerId ?? "ALL");
  const [gran, setGran] = useState<ReportGranularity>("MONTHLY");
  const [fromISO, setFromISO] = useState<string>(defaultFromISO ?? monthStartISO());
  const [toISO, setToISO] = useState<string>(defaultToISO ?? todayISO());
  const [includeOpening, setIncludeOpening] = useState<boolean>(true);

  const [rows, setRows] = useState<CustomerBalanceRow[]>([]);
  const [loading, setLoading] = useState(false);

  // pagination (keeps DOM light + scroll smooth)
  const [pageSize, setPageSize] = useState<number>(200);
  const [page, setPage] = useState<number>(0);

  // reset defaults each time opened
  useEffect(() => {
    if (!open) return;
    setRows([]);
    setLoading(false);
    setGran("MONTHLY");
    setCustomerId(defaultCustomerId ?? "ALL");
    setFromISO(defaultFromISO ?? monthStartISO());
    setToISO(defaultToISO ?? todayISO());
    setIncludeOpening(true);
    setPageSize(200);
    setPage(0);
  }, [open, defaultCustomerId, defaultFromISO, defaultToISO]);

  const viewName = useMemo(() => viewNameForGran(gran), [gran]);

  const customerOptions = useMemo(() => {
    const list = (customers || []).slice();
    list.sort(
      (a, b) =>
        s((a as any).customer_code).localeCompare(s((b as any).customer_code)) ||
        s((a as any).name).localeCompare(s((b as any).name))
    );
    return list;
  }, [customers]);

  const customerById = useMemo(() => {
    const map = new Map<number, { code: string; name: string; client_name: string; opening_balance: number }>();
    for (const c of customers || []) {
      map.set(Number((c as any).id), {
        code: s((c as any).customer_code),
        name: s((c as any).name),
        client_name: s((c as any).client_name),
        opening_balance: n0((c as any).opening_balance),
      });
    }
    return map;
  }, [customers]);

  const totals = useMemo(() => computeTotals(rows), [rows]);

  const pageCount = useMemo(() => {
    if (!rows.length) return 0;
    return Math.max(1, Math.ceil(rows.length / pageSize));
  }, [rows.length, pageSize]);

  const pageRows = useMemo(() => {
    const start = page * pageSize;
    return rows.slice(start, start + pageSize);
  }, [rows, page, pageSize]);

  const showingText = useMemo(() => {
    if (!rows.length) return "No rows";
    const start = page * pageSize + 1;
    const end = Math.min(rows.length, (page + 1) * pageSize);
    return `Showing ${start}–${end} of ${rows.length}`;
  }, [rows.length, page, pageSize]);

  function preset(p: "TODAY" | "THIS_MONTH" | "THIS_YEAR") {
    if (p === "TODAY") {
      const t = todayISO();
      setFromISO(t);
      setToISO(t);
      return;
    }
    if (p === "THIS_YEAR") {
      setFromISO(yearStartISO());
      setToISO(todayISO());
      return;
    }
    setFromISO(monthStartISO());
    setToISO(todayISO());
  }

  async function generate() {
    const f = fromISO || yearStartISO();
    const t = toISO || todayISO();
    const wantCustomerId = customerId === "ALL" ? null : Number(customerId);

    if (f && t && f > t) {
      toast.error("From date cannot be after To date");
      return;
    }

    setLoading(true);
    setRows([]);
    setPage(0);

    try {
      let q = supabase
        .from(viewName as any)
        .select("period,customer_id,sales_rep,debit,credit")
        .gte("period", f)
        .lte("period", t)
        .limit(100000);

      if (wantCustomerId) q = q.eq("customer_id", wantCustomerId);

      const res = await q;
      if (res.error) {
        throw new Error(
          `Report view missing or error: ${res.error.message}. Ensure ${viewName} exists (and base v_customer_txn_lines).`
        );
      }

      const raw = (res.data ?? []) as any[];

      const normalized: CustomerBalanceRow[] = raw.map((r) => {
        const cid = Number(r.customer_id);
        const c = customerById.get(cid);
        return {
          period: s(r.period),
          customer_id: cid,
          customer_code: c?.code || "",
          customer_name: c?.name || `Customer #${cid}`,
          client_name: c?.client_name || "",
          sales_rep: s(r.sales_rep) || "—",
          opening: 0,
          debit: n0(r.debit),
          credit: n0(r.credit),
          running_balance: 0,
        };
      });

      // running balance ASC
      normalized.sort((a, b) => {
        if (a.customer_id !== b.customer_id) return a.customer_id - b.customer_id;
        if (a.period !== b.period) return a.period < b.period ? -1 : 1;
        return s(a.sales_rep).localeCompare(s(b.sales_rep));
      });

      const run = new Map<number, number>();
      const firstSeen = new Set<number>();

      for (const r of normalized) {
        const c = customerById.get(r.customer_id);
        const openingBal = includeOpening ? n0(c?.opening_balance) : 0;

        if (!firstSeen.has(r.customer_id)) {
          firstSeen.add(r.customer_id);
          r.opening = openingBal;
          run.set(r.customer_id, openingBal);
        }

        const prev = run.get(r.customer_id) ?? 0;
        const next = prev + n0(r.debit) - n0(r.credit);
        r.running_balance = next;
        run.set(r.customer_id, next);
      }

      // display sort: latest period first
      const display = normalized.slice().sort((a, b) => {
        if (a.period !== b.period) return a.period < b.period ? 1 : -1;
        const ac = a.customer_code || "";
        const bc = b.customer_code || "";
        if (ac !== bc) return ac.localeCompare(bc);
        return a.customer_name.localeCompare(b.customer_name);
      });

      setRows(display);
      toast.success(`Report ready: ${display.length} row(s)`);
    } catch (e: any) {
      toast.error(e?.message || "Failed to generate report");
    } finally {
      setLoading(false);
    }
  }

  function downloadPdfReal() {
    if (!rows.length) return toast.error("Generate the report first");

    const subtitle =
      customerId === "ALL"
        ? "All customers"
        : (() => {
            const c = customers.find((x) => String((x as any).id) === String(customerId));
            return c
              ? `${(c as any).customer_code ? (c as any).customer_code + " • " : ""}${(c as any).name}`
              : customerId;
          })();

    // PDF rows: customer then period ASC
    const reportRows = rows
      .slice()
      .sort((a, b) => (a.customer_id !== b.customer_id ? a.customer_id - b.customer_id : a.period < b.period ? -1 : 1));

    const t = computeTotals(rows);

    try {
      const doc = buildPdf({
        title: "Customer Balance Report",
        subtitle,
        gran,
        fromISO,
        toISO,
        includeOpening,
        rows: reportRows,
        totals: t,
      });

      const filename = `customer-balance-report-${gran.toLowerCase()}-${fromISO}_to_${toISO}.pdf`;
      doc.save(filename);
      toast.success("PDF downloaded");
    } catch (e: any) {
      toast.error(e?.message || "Failed to generate PDF");
    }
  }

  function exportCsv() {
    if (!rows.length) return toast.error("Generate the report first");
    try {
      downloadCsv({
        rows,
        gran,
        includeOpening,
        filename: `customer-report-${gran.toLowerCase()}-${fromISO}_to_${toISO}.csv`,
      });
      toast.success("CSV downloaded");
    } catch (e: any) {
      toast.error(e?.message || "Failed to export CSV");
    }
  }

  const canExport = rows.length > 0 && !loading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "p-0 overflow-hidden",
          "bg-white dark:bg-background",
          "w-[98vw] max-w-[1280px]",
          "h-[92vh] max-h-[920px]",
          "rounded-2xl border shadow-[0_30px_90px_rgba(0,0,0,0.28)]",
          "flex flex-col"
        )}
      >
        {/* Sticky Header */}
        <div className="sticky top-0 z-30 border-b bg-white/90 dark:bg-background/85 backdrop-blur">
          <div className="px-6 py-4 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <DialogTitle className="text-xl font-extrabold tracking-tight">Customer Balance Report</DialogTitle>
              <DialogDescription className="text-xs text-slate-500 dark:text-muted-foreground mt-1">
                Debit = invoices • Credit = payments + credit notes • Running balance per customer
              </DialogDescription>
            </div>

            <div className="flex items-center gap-2">
              {/* Icon close */}
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 rounded-xl"
                onClick={() => onOpenChange(false)}
                title="Close"
              >
                <X className="h-5 w-5" />
              </Button>

              <Button
                className="h-10 rounded-xl bg-[#0b1220] text-white hover:bg-black"
                onClick={downloadPdfReal}
                disabled={!canExport}
                title="Download real PDF (no popups)"
              >
                <FileDown className="h-4 w-4 mr-2" />
                PDF
              </Button>

              <Button
                className="h-10 rounded-xl bg-black text-white hover:bg-slate-900"
                onClick={generate}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Generating…
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Generate
                  </>
                )}
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="h-10 rounded-xl" disabled={!canExport}>
                    <ChevronDown className="h-4 w-4 mr-2" />
                    Export
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem onClick={exportCsv}>
                    <FileSpreadsheet className="mr-2 h-4 w-4" />
                    CSV (.csv)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={downloadPdfReal}>
                    <FileDown className="mr-2 h-4 w-4" />
                    PDF (report only)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Button
                variant="outline"
                className="h-10 rounded-xl"
                onClick={() => onOpenChange(false)}
                title="Close"
              >
                <X className="h-4 w-4 mr-2" />
                Close
              </Button>
            </div>
          </div>

          {/* Filters strip */}
          <div className="px-6 pb-5">
            <Card className="p-4 border bg-slate-50/60 dark:bg-muted/20 rounded-2xl">
              <div className="grid gap-3 lg:grid-cols-[1.2fr_0.65fr_0.55fr_0.55fr_0.9fr] lg:items-end">
                <div>
                  <div className="text-[11px] font-semibold text-slate-600 dark:text-muted-foreground mb-1 flex items-center gap-2">
                    <Filter className="h-3.5 w-3.5" /> Customer
                  </div>
                  <select
                    className="h-10 w-full rounded-xl border bg-white dark:bg-background px-3"
                    value={customerId}
                    onChange={(e) => setCustomerId(e.target.value)}
                  >
                    <option value="ALL">All customers</option>
                    {customerOptions.map((c) => (
                      <option key={(c as any).id} value={String((c as any).id)}>
                        {((c as any).customer_code ? `${(c as any).customer_code} • ` : "") + (c as any).name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="text-[11px] font-semibold text-slate-600 dark:text-muted-foreground mb-1">
                    Granularity
                  </div>
                  <select
                    className="h-10 w-full rounded-xl border bg-white dark:bg-background px-3"
                    value={gran}
                    onChange={(e) => setGran(e.target.value as ReportGranularity)}
                  >
                    <option value="DAILY">Daily</option>
                    <option value="MONTHLY">Monthly</option>
                    <option value="YEARLY">Yearly</option>
                  </select>
                </div>

                <div>
                  <div className="text-[11px] font-semibold text-slate-600 dark:text-muted-foreground mb-1 flex items-center gap-2">
                    <CalendarDays className="h-3.5 w-3.5" /> From
                  </div>
                  <input
                    type="date"
                    className="h-10 w-full rounded-xl border bg-white dark:bg-background px-3"
                    value={fromISO}
                    onChange={(e) => {
                      const v = e.target.value;
                      setFromISO(v);
                      if (toISO && v && v > toISO) setToISO(v);
                    }}
                  />
                </div>

                <div>
                  <div className="text-[11px] font-semibold text-slate-600 dark:text-muted-foreground mb-1 flex items-center gap-2">
                    <CalendarDays className="h-3.5 w-3.5" /> To
                  </div>
                  <input
                    type="date"
                    className="h-10 w-full rounded-xl border bg-white dark:bg-background px-3"
                    value={toISO}
                    onChange={(e) => {
                      const v = e.target.value;
                      setToISO(v);
                      if (fromISO && v && v < fromISO) setFromISO(v);
                    }}
                  />
                </div>

                <div className="rounded-2xl border bg-white dark:bg-background px-3 py-2 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-800 dark:text-foreground">Include Opening</div>
                    <div className="text-[11px] text-slate-500 dark:text-muted-foreground">Applied once per customer</div>
                  </div>
                  <Switch checked={includeOpening} onCheckedChange={(v) => setIncludeOpening(!!v)} />
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" className="h-8 rounded-xl" onClick={() => preset("TODAY")}>
                    Today
                  </Button>
                  <Button variant="outline" className="h-8 rounded-xl" onClick={() => preset("THIS_MONTH")}>
                    This Month
                  </Button>
                  <Button variant="outline" className="h-8 rounded-xl" onClick={() => preset("THIS_YEAR")}>
                    This Year
                  </Button>
                </div>

                <div className="flex items-center gap-2 text-[11px] text-slate-600 dark:text-muted-foreground">
                  <span>Rows/page</span>
                  <select
                    className="h-8 rounded-xl border bg-white dark:bg-background px-2"
                    value={pageSize}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setPageSize(v);
                      setPage(0);
                    }}
                    disabled={!rows.length}
                  >
                    <option value={100}>100</option>
                    <option value={200}>200</option>
                    <option value={500}>500</option>
                    <option value={1000}>1000</option>
                  </select>

                  <span className="ml-2">{showingText}</span>

                  <div className="ml-2 flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 rounded-xl"
                      onClick={() => setPage(0)}
                      disabled={!rows.length || page === 0}
                      title="First"
                    >
                      <ChevronsLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 rounded-xl"
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                      disabled={!rows.length || page === 0}
                      title="Previous"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 rounded-xl"
                      onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                      disabled={!rows.length || page >= pageCount - 1}
                      title="Next"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 rounded-xl"
                      onClick={() => setPage(pageCount - 1)}
                      disabled={!rows.length || page >= pageCount - 1}
                      title="Last"
                    >
                      <ChevronsRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>

        {/* Body (scroll) */}
        <div className="flex-1 overflow-auto px-6 pb-6">
          {/* KPIs */}
          <div className="grid gap-3 md:grid-cols-4 pt-4">
            <Card className="p-3 border rounded-2xl">
              <div className="text-[11px] text-slate-500 dark:text-muted-foreground">Opening</div>
              <div className="mt-1 text-base font-extrabold">{fmtRs(includeOpening ? totals.opening : 0)}</div>
            </Card>
            <Card className="p-3 border rounded-2xl">
              <div className="text-[11px] text-slate-500 dark:text-muted-foreground">Debit</div>
              <div className="mt-1 text-base font-extrabold">{fmtRs(totals.debit)}</div>
            </Card>
            <Card className="p-3 border rounded-2xl">
              <div className="text-[11px] text-slate-500 dark:text-muted-foreground">Credit</div>
              <div className="mt-1 text-base font-extrabold">{fmtRs(totals.credit)}</div>
            </Card>
            <Card className="p-3 border rounded-2xl">
              <div className="text-[11px] text-slate-500 dark:text-muted-foreground">Ending Balance</div>
              <div className="mt-1 text-base font-extrabold">{fmtRs(totals.endBalance)}</div>
            </Card>
          </div>

          {/* Results */}
          <Card className="mt-4 border overflow-hidden rounded-2xl">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <div className="text-sm font-semibold">
                Results{" "}
                <span className="ml-2 text-xs text-slate-400 font-normal">
                  {loading ? "Loading…" : rows.length ? `${rows.length} row(s)` : "—"}
                </span>
              </div>

              <div className="text-[11px] text-slate-500 dark:text-muted-foreground">Smooth mode: paginated table</div>
            </div>

            <div className="max-h-[52vh] overflow-auto">
              <table className="w-full min-w-[1050px] text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-muted/30 border-b">
                  <tr>
                    <th className="px-4 py-2 text-left text-[11px] uppercase tracking-wide text-slate-600 dark:text-muted-foreground">
                      Period
                    </th>
                    <th className="px-4 py-2 text-left text-[11px] uppercase tracking-wide text-slate-600 dark:text-muted-foreground">
                      Code
                    </th>
                    <th className="px-4 py-2 text-left text-[11px] uppercase tracking-wide text-slate-600 dark:text-muted-foreground">
                      Customer
                    </th>
                    <th className="px-4 py-2 text-left text-[11px] uppercase tracking-wide text-slate-600 dark:text-muted-foreground">
                      Client
                    </th>
                    <th className="px-4 py-2 text-left text-[11px] uppercase tracking-wide text-slate-600 dark:text-muted-foreground">
                      Sales Rep
                    </th>
                    <th className="px-4 py-2 text-right text-[11px] uppercase tracking-wide text-slate-600 dark:text-muted-foreground">
                      Opening
                    </th>
                    <th className="px-4 py-2 text-right text-[11px] uppercase tracking-wide text-slate-600 dark:text-muted-foreground">
                      Debit
                    </th>
                    <th className="px-4 py-2 text-right text-[11px] uppercase tracking-wide text-slate-600 dark:text-muted-foreground">
                      Credit
                    </th>
                    <th className="px-4 py-2 text-right text-[11px] uppercase tracking-wide text-slate-600 dark:text-muted-foreground">
                      Balance
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y">
                  {loading ? (
                    <tr>
                      <td className="px-4 py-12 text-slate-500 dark:text-muted-foreground" colSpan={9}>
                        Generating report…
                      </td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td className="px-4 py-12" colSpan={9}>
                        <div className="text-center">
                          <div className="text-base font-semibold text-slate-700 dark:text-foreground">No report data</div>
                          <div className="text-sm text-slate-500 dark:text-muted-foreground mt-1">
                            Choose dates and click <b>Generate</b>.
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    pageRows.map((r, idx) => {
                      const globalIdx = page * pageSize + idx;
                      return (
                        <tr
                          key={`${r.customer_id}-${r.period}-${r.sales_rep}-${globalIdx}`}
                          className={cn(
                            idx % 2 === 0 ? "bg-white dark:bg-background" : "bg-slate-50/40 dark:bg-muted/10"
                          )}
                        >
                          <td className="px-4 py-3 font-semibold">{periodLabel(r.period, gran)}</td>
                          <td className="px-4 py-3">{r.customer_code || "-"}</td>
                          <td className="px-4 py-3">{r.customer_name}</td>
                          <td className="px-4 py-3 text-slate-500 dark:text-muted-foreground">{r.client_name || "-"}</td>
                          <td className="px-4 py-3 text-slate-500 dark:text-muted-foreground">{r.sales_rep || "—"}</td>
                          <td className="px-4 py-3 text-right font-semibold">{fmtRs(includeOpening ? r.opening : 0)}</td>
                          <td className="px-4 py-3 text-right font-semibold">{fmtRs(r.debit)}</td>
                          <td className="px-4 py-3 text-right font-semibold">{fmtRs(r.credit)}</td>
                          <td
                            className={cn(
                              "px-4 py-3 text-right font-extrabold",
                              n0(r.running_balance) < 0 ? "text-red-600" : "text-slate-900 dark:text-foreground"
                            )}
                          >
                            {fmtRs(r.running_balance)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>

                {rows.length ? (
                  <tfoot className="sticky bottom-0 z-10">
                    <tr className="bg-[#0b1220] text-white">
                      <td className="px-4 py-3 font-extrabold" colSpan={5}>
                        GRAND TOTAL
                      </td>
                      <td className="px-4 py-3 text-right font-extrabold">{fmtRs(includeOpening ? totals.opening : 0)}</td>
                      <td className="px-4 py-3 text-right font-extrabold">{fmtRs(totals.debit)}</td>
                      <td className="px-4 py-3 text-right font-extrabold">{fmtRs(totals.credit)}</td>
                      <td className="px-4 py-3 text-right font-extrabold">{fmtRs(totals.endBalance)}</td>
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>
          </Card>

          <div className="mt-4 text-[11px] text-slate-400">
            PDF download is generated locally using <b>jsPDF</b> + <b>autotable</b> (no popups). CSV export replaces
            SheetJS for security + speed.
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

