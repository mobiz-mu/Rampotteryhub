// src/pages/Invoices.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

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
  Ban,
  RefreshCw,
  MessageCircle,
  FileText,
  Wallet,
  BadgePercent,
  CircleDollarSign,
  CheckCircle2,
  Receipt,
  Sparkles,
} from "lucide-react";

import { listInvoices, markInvoicePaid, voidInvoice, setInvoicePayment } from "@/lib/invoices";
import { useAuth } from "@/contexts/AuthContext";
import type { InvoiceStatus } from "@/types/invoice";
import { cn } from "@/lib/utils";

/* =========================
   Helpers
========================= */
const APP_ORIGIN = "https://rampotteryhub.com";

const n = (v: any) => {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
};

const rs = (v: any) =>
  `Rs ${n(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function normalizeStatus(s?: string | null) {
  const v = String(s || "").toUpperCase();
  if (v === "PAID") return "PAID";
  if (v === "PARTIALLY_PAID" || v === "PARTIAL") return "PARTIALLY_PAID";
  if (v === "VOID") return "VOID";
  if (v === "DRAFT") return "DRAFT";
  if (v === "UNPAID" || v === "ISSUED") return "ISSUED";
  return "ISSUED";
}

function statusLabel(st: string) {
  if (st === "PARTIALLY_PAID") return "Partially Paid";
  if (st === "DRAFT") return "Draft";
  if (st === "ISSUED") return "Issued";
  return st;
}

function statusPillClass(st: string) {
  if (st === "PAID") return "bg-emerald-500/10 text-emerald-800 dark:text-emerald-200";
  if (st === "PARTIALLY_PAID") return "bg-amber-500/10 text-amber-900 dark:text-amber-200";
  if (st === "VOID") return "bg-slate-500/10 text-slate-700 dark:text-slate-200";
  if (st === "DRAFT") return "bg-zinc-500/10 text-zinc-800 dark:text-zinc-200";
  return "bg-sky-500/10 text-sky-900 dark:text-sky-200";
}

function digitsOnly(v: any) {
  return String(v ?? "").replace(/[^\d]/g, "");
}
function normalizeMuPhone(raw: any) {
  const d = digitsOnly(raw);
  if (d.length === 8) return "230" + d;
  if (d.startsWith("230") && d.length === 11) return d;
  return "";
}

function formatDateDMY(v: any) {
  const s = String(v ?? "").slice(0, 10);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return s || "—";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function buildWhatsAppInvoiceText(opts: {
  customerName?: string;
  invoiceNo: string;
  invoiceAmount: number;
  creditsApplied: number;
  amountPaid: number;
  amountDue: number;
  pdfUrl: string;
}) {
  return [
    "Ram Pottery Ltd",
    "",
    "Invoice details:",
    opts.customerName ? `Customer: ${opts.customerName}` : null,
    `Invoice: ${opts.invoiceNo}`,
    `Invoice Amount: ${rs(opts.invoiceAmount)}`,
    opts.creditsApplied > 0 ? `Credits Applied: ${rs(opts.creditsApplied)}` : null,
    `Amount Paid: ${rs(opts.amountPaid)}`,
    `Amount Due: ${rs(opts.amountDue)}`,
    "",
    `Invoice PDF: ${opts.pdfUrl}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function openWhatsApp(to: string, text: string) {
  window.open(`https://wa.me/${to}?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
}

function RsMark({ className }: { className?: string }) {
  return <span className={cn("font-black tracking-tight text-[13px] leading-[13px]", className)}>Rs</span>;
}

/* =========================
   KPI Card (FIXED – no wrapping, no JSX error)
========================= */
function KpiCard({
  title,
  value,
  sub,
  icon: Icon,
  tone = "default",
}: {
  title: string;
  value: string;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "default" | "good" | "warn" | "bad" | "info";
}) {
  const toneRing =
    tone === "good"
      ? "bg-emerald-500/12 text-emerald-800 dark:text-emerald-200"
      : tone === "warn"
      ? "bg-amber-500/12 text-amber-900 dark:text-amber-200"
      : tone === "bad"
      ? "bg-rose-500/12 text-rose-800 dark:text-rose-200"
      : tone === "info"
      ? "bg-sky-500/12 text-sky-900 dark:text-sky-200"
      : "bg-primary/10 text-primary";

  return (
    <Card className="rp-card overflow-hidden">
      <div className="p-4 sm:p-5 flex items-start justify-between gap-4">
        {/* LEFT SIDE */}
        <div className="min-w-0 flex-1">
          <div className="rp-label">{title}</div>

          {/* ONE LINE VALUE */}
          <div className="mt-2 flex items-baseline gap-2 min-w-0">
            <span className="text-[12px] font-black text-muted-foreground">
              Rs
            </span>

            <span
              className={cn(
                "tabular-nums font-extrabold text-foreground",
                "whitespace-nowrap",
                "leading-[1.05]",
                "text-[clamp(16px,1.25vw,22px)]"
              )}
              title={value}
            >
              {String(value).replace(/^Rs\s*/i, "")}
            </span>
          </div>

          {/* SUBLINE */}
          {sub ? (
            <div className="mt-1 text-xs text-muted-foreground">
              {sub}
            </div>
          ) : null}
        </div>

        {/* RIGHT ICON */}
        <div
          className={cn(
            "h-11 w-11 rounded-2xl grid place-items-center shrink-0",
            toneRing
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );
}

/* =========================
   Tiny Modal Shell
========================= */
function ModalShell({
  open,
  title,
  subtitle,
  icon,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  subtitle?: React.ReactNode;
  icon: React.ReactNode;
  children: React.ReactNode;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <Card className="rp-card p-6 w-[560px] max-w-[94vw] space-y-4 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-lg font-extrabold text-foreground">{title}</div>
            {subtitle ? <div className="text-xs text-muted-foreground mt-1">{subtitle}</div> : null}
          </div>
          <div className="h-10 w-10 rounded-2xl bg-primary/10 text-primary grid place-items-center">{icon}</div>
        </div>
        {children}
      </Card>
    </div>
  );
}

/* =========================
   Page
========================= */
export default function Invoices() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();

  const role = String((user as any)?.role || "").toLowerCase();
  const isAdmin = role === "admin";

  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<InvoiceStatus | "ALL">("ALL");

  const [payOpen, setPayOpen] = useState(false);
  const [payInvoice, setPayInvoice] = useState<any | null>(null);
  const [payAmountStr, setPayAmountStr] = useState<string>("0.00");
  const [payRemarks, setPayRemarks] = useState<string>("");
  const payRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setQ(qInput.trim()), 220);
    return () => window.clearTimeout(t);
  }, [qInput]);

  const invoicesQ = useQuery({
    queryKey: ["invoices", q, status],
    queryFn: () => listInvoices({ q, status, limit: 500 }),
    staleTime: 10_000,
  });

  const rows = invoicesQ.data || [];

  const kpis = useMemo(() => {
    const nonVoid = rows.filter((r: any) => normalizeStatus(r.status) !== "VOID");

    const count = rows.length;
    const total = nonVoid.reduce((s: number, r: any) => s + n(r.total_amount), 0);
    const credits = nonVoid.reduce((s: number, r: any) => s + n(r.credits_applied), 0);
    const paid = nonVoid.reduce((s: number, r: any) => s + n(r.amount_paid), 0);
    const balance = nonVoid.reduce((s: number, r: any) => s + n(r.balance_remaining), 0);

    const issued = nonVoid.filter((r: any) => normalizeStatus(r.status) === "ISSUED").length;
    const partial = nonVoid.filter((r: any) => normalizeStatus(r.status) === "PARTIALLY_PAID").length;
    const fullyPaid = nonVoid.filter((r: any) => normalizeStatus(r.status) === "PAID").length;

    const discount = nonVoid.reduce((s: number, r: any) => s + n(r.discount_amount), 0);

    return { count, total, credits, paid, balance, issued, partial, fullyPaid, discount };
  }, [rows]);

  const setPaymentM = useMutation({
    mutationFn: async (args: { invoiceId: number; amount: number; remarks?: string }) => {
      return (setInvoicePayment as any)(args.invoiceId, args.amount, args.remarks || "");
    },
    onError: (err: any) => {
      alert(err?.message || "Payment update failed");
      console.log("PAYMENT ERROR:", err);
    },
    onSuccess: async () => {
      setPayOpen(false);
      setPayInvoice(null);
      await qc.invalidateQueries({ queryKey: ["invoices"] });
      await qc.invalidateQueries({ queryKey: ["invoice"] });
    },
  });

  const markPaidM = useMutation({
    mutationFn: async (invoiceId: number) => markInvoicePaid({ invoiceId }),
    onError: (err: any) => {
      alert(err?.message || "Mark paid failed");
      console.log("MARK PAID ERROR:", err);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["invoices"] });
      await qc.invalidateQueries({ queryKey: ["invoice"] });
    },
  });

  const voidM = useMutation({
    mutationFn: async (invoiceId: number) => voidInvoice(invoiceId),
    onError: (err: any) => {
      alert(err?.message || "Void failed");
      console.log("VOID ERROR:", err);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["invoices"] });
      await qc.invalidateQueries({ queryKey: ["invoice"] });
    },
  });

  function openPayment(inv: any) {
    setPayInvoice(inv);
    setPayAmountStr(String(n(inv.amount_paid).toFixed(2)));
    setPayRemarks("");
    setPayOpen(true);
    setTimeout(() => payRef.current?.focus(), 60);
  }

  function savePayment() {
    if (!payInvoice?.id) return;

    const amt = Number(payAmountStr || "0");
    const safe = Number.isFinite(amt) ? amt : 0;

    setPaymentM.mutate({
      invoiceId: payInvoice.id,
      amount: safe,
      remarks: payRemarks.trim(),
    });
  }

  function onVoid(inv: any) {
    if (!confirm("Void this invoice? This cannot be undone.")) return;
    voidM.mutate(inv.id);
  }

  function onSendWhatsApp(inv: any) {
    const cust = inv.customer || {};
    const to = normalizeMuPhone(cust.whatsapp || cust.phone || inv.customer_whatsapp || inv.customer_phone);
    if (!to) {
      alert("No WhatsApp/phone number found for this customer.");
      return;
    }

    const invNo = inv.invoice_number || `#${inv.id}`;
    const gross = n(inv.gross_total ?? inv.total_amount);
    const credits = n(inv.credits_applied ?? 0);
    const paid = n(inv.amount_paid);
    const due = Math.max(0, gross - credits - paid);

    const pdfUrl = `${APP_ORIGIN}/invoices/${inv.id}/print`;

    const msg = buildWhatsAppInvoiceText({
      customerName: cust.name || inv.customer_name,
      invoiceNo: invNo,
      invoiceAmount: gross,
      creditsApplied: credits,
      amountPaid: paid,
      amountDue: due,
      pdfUrl,
    });

    openWhatsApp(to, msg);
  }

  return (
    <div className="rp-page">
      <style>{`
/* =========================
   INVOICES — NO LINES / NO RECTANGLES (HARD RESET)
========================= */

.rp-page{
  width: 100%;
  max-width: 1440px;
  margin: 0 auto;
  padding: 18px 22px 28px 22px;
  display:flex;
  flex-direction:column;
  gap: 16px;
  overflow-x: hidden;
}

.rp-bg{
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: -10;
}
.rp-bg::before{
  content:"";
  position:absolute; inset:0;
  background:
    radial-gradient(circle at 14% 12%, rgba(185,28,28,.10), transparent 55%),
    radial-gradient(circle at 88% 10%, rgba(2,6,23,.06), transparent 50%),
    linear-gradient(to bottom, rgba(248,250,252,1), rgba(255,255,255,1));
}
:root.dark .rp-bg::before{
  background:
    radial-gradient(circle at 14% 12%, rgba(185,28,28,.22), transparent 55%),
    radial-gradient(circle at 88% 10%, rgba(255,255,255,.06), transparent 50%),
    linear-gradient(to bottom, rgba(2,6,23,.85), rgba(2,6,23,.60));
}

/* Premium cards: remove borders completely */
.rp-card{
  border: none !important;
  outline: none !important;
  border-radius: 18px;
  background: linear-gradient(to bottom, rgba(255,255,255,.96), rgba(255,255,255,.90));
  box-shadow:
    0 12px 34px rgba(2,6,23,.06),
    0 1px 0 rgba(255,255,255,.70) inset;
}
:root.dark .rp-card{
  background: linear-gradient(to bottom, rgba(2,6,23,.82), rgba(2,6,23,.62));
  box-shadow: 0 18px 55px rgba(0,0,0,.45);
}

.rp-label{
  font-size: 11px;
  font-weight: 800;
  letter-spacing: .10em;
  text-transform: uppercase;
  color: rgba(15,23,42,.60);
}
:root.dark .rp-label{ color: rgba(226,232,240,.60); }

/* Hero */
.rp-hero{
  border-radius: 18px;
  padding: 14px 16px;
  border: none !important;
  outline: none !important;
  background:
    radial-gradient(circle at 18% 22%, rgba(185,28,28,.10), transparent 52%),
    radial-gradient(circle at 72% 30%, rgba(2,6,23,.06), transparent 50%),
    linear-gradient(to bottom, rgba(255,255,255,.92), rgba(255,255,255,.84));
  box-shadow:
    0 12px 34px rgba(2,6,23,.06),
    0 1px 0 rgba(255,255,255,.70) inset;
}
:root.dark .rp-hero{
  background:
    radial-gradient(circle at 18% 22%, rgba(185,28,28,.20), transparent 52%),
    radial-gradient(circle at 72% 30%, rgba(255,255,255,.06), transparent 50%),
    linear-gradient(to bottom, rgba(2,6,23,.78), rgba(2,6,23,.56));
}

/* Filters */
.rp-filter{
  display:flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  padding: 12px;
}

/* =========================
   TABLE — HARD REMOVE ALL LINES
========================= */

/* ✅ REMOVE ANY BLACK BORDER AROUND THE WHOLE PAGE */
html, body, #root{
  border: none !important;
  outline: none !important;
  box-shadow: none !important;
}

.rp-page{
  border: none !important;
  outline: none !important;
  box-shadow: none !important;
}



.rp-tableShell{
  overflow: hidden;
}

.rp-table, .rp-table *{
  border: none !important;
  outline: none !important;
  box-shadow: none !important;
}

.rp-table{
  width: 100%;
  table-layout: fixed; /* no scrollbar on desktop */
  border-collapse: separate;
  border-spacing: 0;
}

.rp-thead th{
  padding: 12px 14px;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: .12em;
  text-transform: uppercase;
  color: rgba(15,23,42,.60);
  background: rgba(2,6,23,.02);
}
:root.dark .rp-thead th{
  color: rgba(226,232,240,.60);
  background: rgba(255,255,255,.05);
}

/* Row cards look WITHOUT rectangles */
.rp-row td{
  padding: 12px 14px;
}
.rp-row{
  background: transparent;
  transition: background .12s ease;
}
.rp-row:hover{
  background: rgba(2,6,23,.02);
}
:root.dark .rp-row:hover{
  background: rgba(255,255,255,.04);
}

/* Soft spacing between rows (no line) */
.rp-gapRow td{
  padding: 0;
  height: 8px;
}

/* Invoice pill WITHOUT border */
.rp-invPill{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  padding: 8px 10px;
  border-radius: 14px;
  background: rgba(2,6,23,.03);
  font-weight: 900;
  letter-spacing: .2px;
  color: rgba(2,6,23,.90);
  max-width: 100%;
}
:root.dark .rp-invPill{
  background: rgba(255,255,255,.05);
  color: rgba(226,232,240,.92);
}

.rp-trunc{
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

.rp-sub{
  margin-top: 2px;
  font-size: 12px;
  color: rgba(15,23,42,.55);
}
:root.dark .rp-sub{ color: rgba(226,232,240,.60); }

.rp-money{
  font-weight: 900;
  color: rgba(2,6,23,.88);
}
:root.dark .rp-money{ color: rgba(226,232,240,.92); }

.rp-mini{
  font-size: 12px;
  color: rgba(15,23,42,.55);
}
:root.dark .rp-mini{ color: rgba(226,232,240,.60); }

/* Credits tag (no border) */
.rp-creditTag{
  display:inline-flex;
  align-items:center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 14px;
  background: rgba(16,185,129,.10);
  color: rgba(6,95,70,1);
  font-weight: 950;
}
:root.dark .rp-creditTag{
  background: rgba(16,185,129,.14);
  color: rgba(167,243,208,1);
}
.rp-dot{
  width: 8px; height: 8px;
  border-radius: 999px;
  background: rgba(16,185,129,1);
}

/* Actions button WITHOUT border/outline */
.rp-actionBtn{
  height: 38px;
  width: 38px;
  border-radius: 999px;
  border: none !important;
  outline: none !important;
  background: rgba(2,6,23,.03);
  display:inline-flex;
  align-items:center;
  justify-content:center;
}
:root.dark .rp-actionBtn{
  background: rgba(255,255,255,.05);
}

/* ✅ Column widths tuned: FITS 100% (no desktop overflow) */
.col-inv{ width: 12%; }
.col-date{ width: 10%; }
.col-cust{ width: 20%; }
.col-total{ width: 11%; }
.col-credits{ width: 11%; }
.col-paid{ width: 10%; }
.col-balance{ width: 10%; }
.col-status{ width: 8%; }
.col-actions{ width: 8%; }

/* ✅ Give the actions cell some right padding so the dots are more left */
.rp-actionsCell{
  padding-right: 18px !important;
  text-align: right;
}


@media (max-width: 1180px){
  .col-cust{ width: 26%; }
  .col-status{ width: 14%; }
}
`}</style>

      <div className="rp-bg" />

      {/* HERO */}
      <div className="rp-hero">
        <div className="relative z-[1] flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl sm:text-2xl md:text-3xl font-black text-foreground tracking-tight">Invoices</h1>
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-primary/10 text-primary">
                <Sparkles className="h-3.5 w-3.5" /> Premium
              </span>
            </div>
            <p className="text-muted-foreground mt-2 text-sm sm:text-base">Open • Print • Payments • Void • WhatsApp</p>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <Button variant="outline" onClick={() => invoicesQ.refetch()} disabled={invoicesQ.isFetching}>
              <RefreshCw className={cn("h-4 w-4 mr-2", invoicesQ.isFetching && "animate-spin")} />
              {invoicesQ.isFetching ? "Refreshing..." : "Refresh"}
            </Button>

            <Button onClick={() => nav("/invoices/create")} className="gradient-primary shadow-glow text-primary-foreground">
              + New Invoice
            </Button>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-3 sm:gap-4 lg:gap-5 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        <KpiCard
          title="Invoices"
          value={`${kpis.count}`}
          sub={`Issued: ${kpis.issued} • Partial: ${kpis.partial} • Paid: ${kpis.fullyPaid}`}
          icon={FileText}
          tone="info"
        />
        <KpiCard title="Total Value" value={rs(kpis.total)} sub="Excluding VOID" icon={CircleDollarSign} />
        <KpiCard title="Credits" value={rs(kpis.credits)} sub="Applied credit notes" icon={Receipt} tone={kpis.credits > 0 ? "good" : "default"} />
        <KpiCard title="Paid" value={rs(kpis.paid)} sub={kpis.discount > 0 ? `Discounts: ${rs(kpis.discount)}` : "Payments received"} icon={Wallet} tone="good" />
        <KpiCard title="Outstanding" value={rs(kpis.balance)} sub="Balance remaining" icon={BadgePercent} tone={kpis.balance > 0 ? "warn" : "good"} />
      </div>

      {/* Filters */}
      <Card className="rp-card">
        <div className="rp-filter">
          <Input
            placeholder="Search invoice / customer / code"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            className="max-w-[520px] bg-background/60"
          />

          <select
            className="h-10 rounded-xl px-3 bg-background/60 text-sm font-semibold text-foreground outline-none"
            value={status}
            onChange={(e) => setStatus(e.target.value as any)}
          >
            <option value="ALL">All</option>
            <option value="DRAFT">Draft</option>
            <option value="ISSUED">Issued</option>
            <option value="PARTIALLY_PAID">Partially Paid</option>
            <option value="PAID">Paid</option>
            <option value="VOID">Void</option>
          </select>

          <div className="ml-auto text-xs text-muted-foreground">
            {rows.length ? (
              <>
                Showing <b className="text-foreground">{rows.length}</b> invoices
              </>
            ) : (
              "—"
            )}
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card className="rp-card rp-tableShell">
        <table className="rp-table">
          <thead className="rp-thead">
            <tr>
              <th className="col-inv">Invoice</th>
              <th className="col-date">Date</th>
              <th className="col-cust">Customer</th>
              <th className="col-total">Total</th>
              <th className="col-credits">Credits</th>
              <th className="col-paid">Paid</th>
              <th className="col-balance">Balance</th>
              <th className="col-status">Status</th>
              <th className="col-actions text-right" />
            </tr>
          </thead>

          <tbody>
            {invoicesQ.isLoading ? (
              <tr className="rp-row">
                <td colSpan={9} className="p-8 text-center text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-2">
                    <RefreshCw className="h-4 w-4 animate-spin" /> Loading invoices…
                  </span>
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr className="rp-row">
                <td colSpan={9} className="p-8 text-center text-sm text-muted-foreground">
                  No invoices found.
                </td>
              </tr>
            ) : (
              rows.map((r: any) => {
                const st = normalizeStatus(r.status);
                const cust = r.customer || {};
                const custName = cust.name || r.customer_name || `#${r.customer_id}`;
                const custCode = cust.customer_code || r.customer_code || "";
                const invNo = r.invoice_number || `#${r.id}`;
                const credits = n(r.credits_applied ?? 0);

                const muPhone = normalizeMuPhone(cust.whatsapp || cust.phone || r.customer_whatsapp || r.customer_phone);
                const hasWA = Boolean(muPhone);

                return (
                  <React.Fragment key={r.id}>
                    <tr className="rp-row">
                      <td>
                        <div className="rp-invPill rp-trunc">{invNo}</div>
                        <div className="rp-sub rp-trunc">{custCode ? `Code: ${custCode}` : "—"}</div>
                      </td>

                      <td>
                        <div className="rp-money">{formatDateDMY(r.invoice_date)}</div>
                        <div className="rp-mini rp-trunc">{r.due_date ? `Due: ${formatDateDMY(r.due_date)}` : "—"}</div>
                      </td>

                      <td className="min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="font-semibold text-foreground rp-trunc min-w-0">{custName}</div>
                          {hasWA ? (
                            <span
                              title="WhatsApp detected"
                              className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-200 shrink-0"
                            >
                              <MessageCircle className="h-4 w-4" />
                            </span>
                          ) : null}
                        </div>
                        <div className="rp-mini rp-trunc">{custCode ? custCode : "—"}</div>
                      </td>

                      <td>
                        <div className="rp-money tabular-nums">{rs(r.total_amount)}</div>
                      </td>

                      <td>
                        {credits > 0 ? (
                          <div className="rp-creditTag tabular-nums">
                            <span className="rp-dot" />
                            {rs(credits)}
                          </div>
                        ) : (
                          <div className="rp-mini">—</div>
                        )}
                      </td>

                      <td>
                        <div className="rp-money tabular-nums">{rs(r.amount_paid)}</div>
                      </td>

                      <td>
                        <div className="rp-money tabular-nums">{rs(r.balance_remaining)}</div>
                      </td>

                      <td>
                        <span className={cn("inline-flex items-center rounded-full px-3 py-1 text-xs font-extrabold bg-background/60", statusPillClass(st))}>
                          {statusLabel(st)}
                        </span>
                      </td>

<td className="px-2 py-3 w-[64px] rp-actionsCell">
<DropdownMenu>
<DropdownMenuTrigger asChild>
<button
  type="button"
  className={cn(
    "h-9 w-9 inline-flex items-center justify-center rounded-full",
    "bg-rose-600 text-white shadow-md shadow-rose-600/20",
    "hover:bg-rose-700 hover:shadow-lg hover:shadow-rose-700/25",
    "transition-all duration-200",
    "ring-1 ring-rose-500/30",
    "relative overflow-hidden",
    "group"
  )}
  aria-label="Actions"
>
  {/* subtle animated shine */}
  <span
    className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
    style={{
      background:
        "linear-gradient(120deg, transparent 0%, rgba(255,255,255,.25) 40%, transparent 70%)",
      transform: "translateX(-40%)",
      animation: "rpDotsShine 1.6s ease-in-out infinite",
    }}
  />
  <MoreHorizontal className="h-5 w-5 relative z-[1]" />
</button>
</DropdownMenuTrigger>

                          <DropdownMenuContent align="end" className="w-56">
                            <DropdownMenuItem onClick={() => nav(`/invoices/${r.id}`)}>
                              <Eye className="mr-2 h-4 w-4" />
                              Open
                            </DropdownMenuItem>

                            <DropdownMenuItem onClick={() => nav(`/invoices/${r.id}/print`)}>
                              <Printer className="mr-2 h-4 w-4" />
                              Print (PDF)
                            </DropdownMenuItem>

                            <DropdownMenuSeparator />

                            {st !== "VOID" ? (
                              <DropdownMenuItem onClick={() => openPayment(r)}>
                                <span className="mr-2 inline-flex h-4 w-4 items-center justify-center">
                                  <RsMark />
                                </span>
                                Payment
                              </DropdownMenuItem>
                            ) : null}

                            <DropdownMenuItem onClick={() => onSendWhatsApp(r)} disabled={!hasWA}>
                              <MessageCircle className="mr-2 h-4 w-4 text-emerald-600" />
                              Send to WhatsApp
                            </DropdownMenuItem>

                            {st !== "PAID" && st !== "VOID" ? (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => {
                                    if (!confirm("Mark invoice as PAID (pay remaining after credits)?")) return;
                                    markPaidM.mutate(r.id);
                                  }}
                                  disabled={markPaidM.isPending}
                                >
                                  <CheckCircle2 className="mr-2 h-4 w-4" />
                                  Mark Paid
                                </DropdownMenuItem>
                              </>
                            ) : null}

                            {st !== "VOID" ? (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => onVoid(r)} disabled={voidM.isPending}>
                                  <Ban className="mr-2 h-4 w-4" />
                                  Void {isAdmin ? "" : "(Admin)"}
                                </DropdownMenuItem>
                              </>
                            ) : null}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>

                    {/* ✅ spacing row (no line) */}
                    <tr className="rp-gapRow" aria-hidden="true">
                      <td colSpan={9} />
                    </tr>
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </Card>

      {/* Payment Modal */}
      <ModalShell
        open={payOpen}
        onClose={() => !setPaymentM.isPending && setPayOpen(false)}
        title="Payment"
        subtitle={
          <>
            Enter the <b>total amount paid so far</b>. Status auto-updates (Paid / Partially Paid). Credits are deducted
            from what is due.
          </>
        }
        icon={<RsMark />}
      >
        <div className="rounded-2xl bg-background/60 p-4">
          <div className="text-xs text-muted-foreground">Invoice</div>
          <div className="font-semibold">
            {payInvoice?.invoice_number || `#${payInvoice?.id}`} • {formatDateDMY(payInvoice?.invoice_date)}
          </div>

          <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
            <div className="rounded-xl bg-background/60 p-2.5">
              <div className="text-xs text-muted-foreground">Gross</div>
              <div className="font-extrabold tabular-nums">{rs(payInvoice?.gross_total ?? payInvoice?.total_amount)}</div>
            </div>

            <div className="rounded-xl bg-emerald-500/10 p-2.5">
              <div className="text-xs text-emerald-800/70 dark:text-emerald-200/70">Credits</div>
              <div className="font-extrabold tabular-nums">{rs(payInvoice?.credits_applied ?? 0)}</div>
            </div>

            <div className="rounded-xl bg-background/60 p-2.5">
              <div className="text-xs text-muted-foreground">Paid</div>
              <div className="font-extrabold tabular-nums">{rs(payInvoice?.amount_paid ?? 0)}</div>
            </div>

            <div className="rounded-xl bg-amber-500/10 p-2.5">
              <div className="text-xs text-amber-900/70 dark:text-amber-200/70">Due</div>
              <div className="font-extrabold tabular-nums">
                {rs(
                  Math.max(
                    0,
                    n(payInvoice?.gross_total ?? payInvoice?.total_amount) -
                      n(payInvoice?.credits_applied ?? 0) -
                      n(payInvoice?.amount_paid ?? 0)
                  )
                )}
              </div>
            </div>
          </div>

          <div className="mt-3 rounded-xl bg-background/60 p-3">
            <div className="text-xs font-semibold text-foreground/80">Remarks</div>
            <textarea
              className="mt-2 w-full min-h-[78px] rounded-xl bg-background/70 p-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="e.g. Cash received at shop • Bank transfer ref • Note for accountant"
              value={payRemarks}
              onChange={(e) => setPayRemarks(e.target.value)}
            />
            <div className="mt-1 text-[11px] text-muted-foreground">Optional. Saved with the payment if backend supports it.</div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-sm font-semibold">Total paid so far</div>
          <Input
            ref={payRef}
            inputMode="decimal"
            placeholder="0.00"
            value={payAmountStr}
            onChange={(e) => {
              const v = e.target.value;
              if (/^\d*([.]\d{0,2})?$/.test(v)) setPayAmountStr(v);
            }}
            onBlur={() => {
              const x = Number(payAmountStr || "0");
              setPayAmountStr(Number.isFinite(x) ? x.toFixed(2) : "0.00");
            }}
          />

          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setPayAmountStr("0.00")} disabled={setPaymentM.isPending}>
              Set 0
            </Button>

            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => {
                const gross = n(payInvoice?.gross_total ?? payInvoice?.total_amount);
                const credits = n(payInvoice?.credits_applied ?? 0);
                const fullPayNeeded = Math.max(0, gross - credits);
                setPayAmountStr(fullPayNeeded.toFixed(2));
              }}
              disabled={setPaymentM.isPending}
            >
              Full Paid
            </Button>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={() => setPayOpen(false)} disabled={setPaymentM.isPending}>
            Cancel
          </Button>
          <Button onClick={savePayment} disabled={setPaymentM.isPending} className="gradient-primary shadow-glow text-primary-foreground">
            {setPaymentM.isPending ? "Saving..." : "Save"}
          </Button>
        </div>

        <div className="text-[11px] text-muted-foreground">
          Note: WhatsApp cannot auto-attach PDFs from the browser. The message includes the invoice PDF link.
        </div>
      </ModalShell>
    </div>
  );
}
