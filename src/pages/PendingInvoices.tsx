// src/pages/PendingInvoices.tsx
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
  CheckCircle2,
  Sparkles,
  CircleDollarSign,
  Clock3,
  AlertTriangle,
  Filter,
  CalendarDays,
  Users,
} from "lucide-react";

import { listInvoices, markInvoicePaid, voidInvoice, setInvoicePayment, cancelDraftInvoice } from "@/lib/invoices";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/* =========================
   Helpers
========================= */
const APP_ORIGIN = "https://rampotteryhub.com";

type QuickDate = "ALL" | "TODAY" | "MONTH" | "CUSTOM";

type PendingStatus = "DRAFT";

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
  if (st === "VOID") return "Void";
  return st;
}

function statusPillClass(st: string) {
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

function yyyyMmDd(v: Date) {
  const y = v.getFullYear();
  const m = String(v.getMonth() + 1).padStart(2, "0");
  const d = String(v.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isSameDay(isoA?: string | null, isoB?: string | null) {
  return String(isoA || "").slice(0, 10) === String(isoB || "").slice(0, 10);
}

function isInCurrentMonth(iso?: string | null, today = new Date()) {
  const s = String(iso || "").slice(0, 10);
  if (!s) return false;
  const dt = new Date(s);
  if (Number.isNaN(dt.getTime())) return false;
  return dt.getFullYear() === today.getFullYear() && dt.getMonth() === today.getMonth();
}

function isWithinRange(iso?: string | null, from?: string, to?: string) {
  const s = String(iso || "").slice(0, 10);
  if (!s) return false;
  if (from && s < from) return false;
  if (to && s > to) return false;
  return true;
}

function buildWhatsAppInvoiceText(opts: {
  customerName?: string;
  invoiceNo: string;
  invoiceAmount: number;
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

/* =========================
   KPI Card
========================= */
function KpiCard({
  title,
  amount,
  count,
  icon: Icon,
  tone = "default",
}: {
  title: string;
  amount: string;
  count: number;
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
        <div className="min-w-0 flex-1">
          <div className="rp-label">{title}</div>

          <div className="mt-2 flex items-baseline gap-2 min-w-0">
            <span className="text-[12px] font-black text-muted-foreground">Rs</span>
            <span
              className={cn(
                "tabular-nums font-extrabold text-foreground whitespace-nowrap leading-[1.05]",
                "text-[clamp(16px,1.25vw,22px)]"
              )}
              title={amount}
            >
              {String(amount).replace(/^Rs\s*/i, "")}
            </span>
          </div>

          <div className="mt-1 text-xs text-muted-foreground">
            {count} invoice{count === 1 ? "" : "s"}
          </div>
        </div>

        <div className={cn("h-11 w-11 rounded-2xl grid place-items-center shrink-0", toneRing)}>
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

function RsMark({ className }: { className?: string }) {
  return <span className={cn("font-black tracking-tight text-[13px] leading-[13px]", className)}>Rs</span>;
}

/* =========================
   Page
========================= */
export default function PendingInvoices() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();

  const role = String((user as any)?.role || "").toLowerCase();
  const isAdmin = role === "admin";

  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");

  const [status] = useState<PendingStatus>("DRAFT");
  const [customerFilter, setCustomerFilter] = useState<string>("ALL");

  const [quickDate, setQuickDate] = useState<QuickDate>("ALL");
  const todayIso = useMemo(() => yyyyMmDd(new Date()), []);
  const monthStartIso = useMemo(() => {
    const d = new Date();
    return yyyyMmDd(new Date(d.getFullYear(), d.getMonth(), 1));
  }, []);

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [payOpen, setPayOpen] = useState(false);
  const [payInvoice, setPayInvoice] = useState<any | null>(null);
  const [payAmountStr, setPayAmountStr] = useState<string>("0.00");
  const [payRemarks, setPayRemarks] = useState<string>("");
  const payRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setQ(qInput.trim()), 220);
    return () => window.clearTimeout(t);
  }, [qInput]);

  useEffect(() => {
    if (quickDate === "TODAY") {
      setDateFrom(todayIso);
      setDateTo(todayIso);
    } else if (quickDate === "MONTH") {
      setDateFrom(monthStartIso);
      setDateTo(todayIso);
    } else if (quickDate === "ALL") {
      setDateFrom("");
      setDateTo("");
    }
  }, [quickDate, todayIso, monthStartIso]);

  const invoicesQ = useQuery({
    queryKey: ["draft_invoices", q],
    queryFn: () => listInvoices({ q, status: "DRAFT" as any, limit: 1500 }),
    staleTime: 10_000,
  });

  const allRows = invoicesQ.data || [];

  const pendingRows = useMemo(() => {
    return allRows.filter((r: any) => normalizeStatus(r.status) === "DRAFT");
  }, [allRows]);

  const customerOptions = useMemo(() => {
    const map = new Map<string, { id: string; label: string }>();
    pendingRows.forEach((r: any) => {
      const cust = r.customer || {};
      const cid = String(cust.id || r.customer_id || "");
      if (!cid) return;
      const label =
        String(cust.name || r.customer_name || "").trim() ||
        String(cust.client_name || "").trim() ||
        `Customer #${cid}`;
      map.set(cid, { id: cid, label });
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [pendingRows]);

   const filteredRows = useMemo(() => {
     return pendingRows.filter((r: any) => {
      const custId = String(r.customer?.id || r.customer_id || "");
      const invDate = String(r.invoice_date || "").slice(0, 10);

      if (customerFilter !== "ALL" && custId !== customerFilter) return false;

      if (quickDate === "TODAY" && !isSameDay(invDate, todayIso)) return false;
      if (quickDate === "MONTH" && !isInCurrentMonth(invDate)) return false;
      if (quickDate === "CUSTOM" && !isWithinRange(invDate, dateFrom, dateTo)) return false;

      return true;
    });
  }, [pendingRows, status, customerFilter, quickDate, todayIso, dateFrom, dateTo]);

  const kpis = useMemo(() => {
    const make = (key: string) => {
      const list = filteredRows.filter((r: any) => normalizeStatus(r.status) === key);
      return {
        count: list.length,
        amount: list.reduce((s: number, r: any) => s + n(r.total_amount), 0),
      };
    };

    return {
      draft: make("DRAFT"),
      issued: make("ISSUED"),
      partial: make("PARTIALLY_PAID"),
      voided: make("VOID"),
    };
  }, [filteredRows]);

  const summary = useMemo(() => {
    const count = filteredRows.length;
    const total = filteredRows.reduce((s: number, r: any) => s + n(r.total_amount), 0);
    const balance = filteredRows.reduce((s: number, r: any) => s + n(r.balance_remaining), 0);
    return { count, total, balance };
  }, [filteredRows]);

  const setPaymentM = useMutation({
    mutationFn: async (args: { invoiceId: number; amount: number; remarks?: string }) => {
      return (setInvoicePayment as any)(args.invoiceId, args.amount, args.remarks || "");
    },
    onError: (err: any) => {
      toast.error(err?.message || "Payment update failed");
    },
    onSuccess: async () => {
      setPayOpen(false);
      setPayInvoice(null);
      await qc.invalidateQueries({ queryKey: ["draft_invoices"] });
      await qc.invalidateQueries({ queryKey: ["invoices"] });
      await qc.invalidateQueries({ queryKey: ["invoice"] });
      toast.success("Payment updated");
    },
  });

  const markPaidM = useMutation({
    mutationFn: async (invoiceId: number) => markInvoicePaid({ invoiceId }),
    onError: (err: any) => {
      toast.error(err?.message || "Mark paid failed");
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["pending_invoices"] });
      await qc.invalidateQueries({ queryKey: ["invoices"] });
      await qc.invalidateQueries({ queryKey: ["invoice"] });
      toast.success("Invoice marked as paid");
    },
  });

  const voidM = useMutation({
    mutationFn: async (invoiceId: number) => voidInvoice(invoiceId),
    onError: (err: any) => {
      toast.error(err?.message || "Void failed");
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["pending_invoices"] });
      await qc.invalidateQueries({ queryKey: ["invoices"] });
      await qc.invalidateQueries({ queryKey: ["invoice"] });
      toast.success("Invoice voided");
    },
  });

  const cancelDraftM = useMutation({
    mutationFn: async (invoiceId: number) => cancelDraftInvoice(invoiceId),
    onError: (err: any) => {
      toast.error(err?.message || "Cancel draft failed");
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["pending_invoices"] });
      await qc.invalidateQueries({ queryKey: ["invoices"] });
      await qc.invalidateQueries({ queryKey: ["invoice"] });
      toast.success("Draft invoice cancelled");
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

  function onCancelDraft(inv: any) {
    if (normalizeStatus(inv?.status) !== "DRAFT") {
      toast.error("Only draft invoices can be cancelled.");
      return;
    }

    if (!confirm("Cancel this draft invoice? This will permanently delete it.")) return;
    cancelDraftM.mutate(inv.id);
  }

  function onSendWhatsApp(inv: any) {
    const cust = inv.customer || {};
    const to = normalizeMuPhone(cust.whatsapp || cust.phone || inv.customer_whatsapp || inv.customer_phone);
    if (!to) {
      toast.error("No WhatsApp/phone number found for this customer.");
      return;
    }

    const invNo = inv.invoice_number || `#${inv.id}`;
    const gross = n(inv.gross_total ?? inv.total_amount);
    const paid = n(inv.amount_paid);
    const due = Math.max(0, n(inv.balance_remaining ?? gross - paid));

    const pdfUrl = `${APP_ORIGIN}/invoices/${inv.id}/print`;

    const msg = buildWhatsAppInvoiceText({
      customerName: cust.name || inv.customer_name,
      invoiceNo: invNo,
      invoiceAmount: gross,
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
   PENDING INVOICES — PREMIUM UI
========================= */
.rp-page{
  width: 100%;
  max-width: 1480px;
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

.rp-hero{
  border-radius: 18px;
  padding: 16px 18px;
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

.rp-filter{
  display:flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  padding: 14px;
}

.rp-filterBlock{
  display:flex;
  align-items:center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 16px;
  background: rgba(2,6,23,.03);
}
:root.dark .rp-filterBlock{
  background: rgba(255,255,255,.04);
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
  table-layout: fixed;
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

.rp-gapRow td{
  padding: 0;
  height: 8px;
}

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

.col-inv{ width: 13%; }
.col-date{ width: 10%; }
.col-cust{ width: 22%; }
.col-total{ width: 11%; }
.col-paid{ width: 10%; }
.col-balance{ width: 11%; }
.col-status{ width: 11%; }
.col-actions{ width: 12%; }

.rp-actionsCell{
  padding-right: 18px !important;
  text-align: right;
}

.rp-chipBtn{
  border-radius: 999px;
  padding: 9px 14px;
  font-size: 12px;
  font-weight: 800;
  border: none;
  background: rgba(2,6,23,.05);
  color: rgba(15,23,42,.75);
  transition: all .18s ease;
}
.rp-chipBtn:hover{ background: rgba(2,6,23,.08); }
.rp-chipBtn.is-active{
  background: rgba(185,28,28,.10);
  color: rgba(127,29,29,1);
}
:root.dark .rp-chipBtn{
  background: rgba(255,255,255,.05);
  color: rgba(226,232,240,.80);
}
:root.dark .rp-chipBtn.is-active{
  background: rgba(239,68,68,.16);
  color: rgba(254,202,202,1);
}

@keyframes rpDotsShine {
  0% { transform: translateX(-80%); opacity: 0; }
  18% { opacity: .7; }
  38% { transform: translateX(80%); opacity: 0; }
  100% { transform: translateX(80%); opacity: 0; }
}

@media (max-width: 1180px){
  .rp-page{ padding: 14px; }
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
              <h1 className="text-xl sm:text-2xl md:text-3xl font-black text-foreground tracking-tight">
                Pending Invoices
              </h1>
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-primary/10 text-primary">
                <Sparkles className="h-3.5 w-3.5" /> Premium
              </span>
            </div>
            <p className="text-muted-foreground mt-2 text-sm sm:text-base">
               Only draft invoices are shown on this page
            </p>
           </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <Button variant="outline" onClick={() => invoicesQ.refetch()} disabled={invoicesQ.isFetching}>
              <RefreshCw className={cn("h-4 w-4 mr-2", invoicesQ.isFetching && "animate-spin")} />
              {invoicesQ.isFetching ? "Refreshing..." : "Refresh"}
            </Button>

            <Button variant="outline" onClick={() => nav("/invoices")}>
              All Invoices
            </Button>

            <Button onClick={() => nav("/invoices/create")} className="gradient-primary shadow-glow text-primary-foreground">
              + New Invoice
            </Button>
          </div>
        </div>
      </div>

      {/* KPI CARDS */}
      <div className="grid gap-3 sm:gap-4 lg:gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard title="Draft" amount={rs(kpis.draft.amount)} count={kpis.draft.count} icon={Clock3} tone="default" />
        <KpiCard title="Issued" amount={rs(kpis.issued.amount)} count={kpis.issued.count} icon={FileText} tone="info" />
        <KpiCard
          title="Partially Paid"
          amount={rs(kpis.partial.amount)}
          count={kpis.partial.count}
          icon={Wallet}
          tone="warn"
        />
        <KpiCard title="Void" amount={rs(kpis.voided.amount)} count={kpis.voided.count} icon={Ban} tone="bad" />
      </div>

      {/* FILTERS */}
      <Card className="rp-card">
        <div className="rp-filter">
          <div className="rp-filterBlock min-w-[280px] flex-1">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search invoice / customer / code"
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              className="border-0 shadow-none bg-transparent focus-visible:ring-0 px-0"
            />
          </div>

          <div className="rp-filterBlock">
            <Users className="h-4 w-4 text-muted-foreground" />
            <select
              className="h-9 min-w-[220px] rounded-xl px-2 bg-transparent text-sm font-semibold text-foreground outline-none"
              value={customerFilter}
              onChange={(e) => setCustomerFilter(e.target.value)}
            >
              <option value="ALL">All Customers</option>
              {customerOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div className="rp-filterBlock">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={cn("rp-chipBtn", quickDate === "ALL" && "is-active")}
                onClick={() => setQuickDate("ALL")}
              >
                All
              </button>
              <button
                type="button"
                className={cn("rp-chipBtn", quickDate === "TODAY" && "is-active")}
                onClick={() => setQuickDate("TODAY")}
              >
                Today
              </button>
              <button
                type="button"
                className={cn("rp-chipBtn", quickDate === "MONTH" && "is-active")}
                onClick={() => setQuickDate("MONTH")}
              >
                This Month
              </button>
              <button
                type="button"
                className={cn("rp-chipBtn", quickDate === "CUSTOM" && "is-active")}
                onClick={() => setQuickDate("CUSTOM")}
              >
                Custom
              </button>
            </div>
          </div>

          {quickDate === "CUSTOM" ? (
            <div className="rp-filterBlock">
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-9 border-0 shadow-none bg-transparent focus-visible:ring-0 px-0"
              />
              <span className="text-xs text-muted-foreground">to</span>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-9 border-0 shadow-none bg-transparent focus-visible:ring-0 px-0"
              />
            </div>
          ) : null}

          <div className="ml-auto text-xs text-muted-foreground">
            Showing <b className="text-foreground">{summary.count}</b> invoice(s) • Total{" "}
            <b className="text-foreground">{rs(summary.total)}</b> • Balance{" "}
            <b className="text-foreground">{rs(summary.balance)}</b>
          </div>
        </div>
      </Card>

      {/* TABLE */}
      <Card className="rp-card rp-tableShell">
        <table className="rp-table">
          <thead className="rp-thead">
            <tr>
              <th className="col-inv">Invoice</th>
              <th className="col-date">Date</th>
              <th className="col-cust">Customer</th>
              <th className="col-total">Total</th>
              <th className="col-paid">Paid</th>
              <th className="col-balance">Balance</th>
              <th className="col-status">Status</th>
              <th className="col-actions text-right" />
            </tr>
          </thead>

          <tbody>
            {invoicesQ.isLoading ? (
              <tr className="rp-row">
                <td colSpan={8} className="p-8 text-center text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-2">
                    <RefreshCw className="h-4 w-4 animate-spin" /> Loading pending invoices…
                  </span>
                </td>
              </tr>
            ) : filteredRows.length === 0 ? (
              <tr className="rp-row">
                <td colSpan={8} className="p-8 text-center text-sm text-muted-foreground">
                  No draft invoices found.
                </td>
              </tr>
            ) : (
              filteredRows.map((r: any) => {
                const st = normalizeStatus(r.status);
                const cust = r.customer || {};
                const custName =
                  cust.name || cust.client_name || r.customer_name || `#${r.customer_id}`;
                const custCode = cust.customer_code || r.customer_code || "";
                const invNo = r.invoice_number || `#${r.id}`;

                const muPhone = normalizeMuPhone(
                  cust.whatsapp || cust.phone || r.customer_whatsapp || r.customer_phone
                );
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
                        <div className="rp-mini rp-trunc">
                          {r.due_date ? `Due: ${formatDateDMY(r.due_date)}` : "—"}
                        </div>
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
                        <div className="rp-money tabular-nums">{rs(r.amount_paid)}</div>
                      </td>

                      <td>
                        <div className="rp-money tabular-nums">{rs(r.balance_remaining)}</div>
                      </td>

                      <td>
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-3 py-1 text-xs font-extrabold bg-background/60",
                            statusPillClass(st)
                          )}
                        >
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
                                "ring-1 ring-rose-500/30 relative overflow-hidden group"
                              )}
                              aria-label="Actions"
                            >
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
                              Open PDF
                            </DropdownMenuItem>

                            <DropdownMenuItem onClick={() => nav(`/invoices/${r.id}`)}>
                              <FileText className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>

                            {st !== "VOID" ? (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => openPayment(r)}>
                                  <span className="mr-2 inline-flex h-4 w-4 items-center justify-center">
                                    <RsMark />
                                  </span>
                                  Payments
                                </DropdownMenuItem>

                                <DropdownMenuItem onClick={() => onSendWhatsApp(r)} disabled={!hasWA}>
                                  <MessageCircle className="mr-2 h-4 w-4 text-emerald-600" />
                                  Send to WhatsApp
                                </DropdownMenuItem>
                              </>
                            ) : null}

                            {st !== "PAID" && st !== "VOID" ? (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => {
                                    if (!confirm("Mark invoice as PAID?")) return;
                                    markPaidM.mutate(r.id);
                                  }}
                                  disabled={markPaidM.isPending}
                                >
                                  <CheckCircle2 className="mr-2 h-4 w-4" />
                                  Mark as Paid
                                </DropdownMenuItem>
                              </>
                            ) : null}

                            {st === "DRAFT" ? (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => onCancelDraft(r)} disabled={cancelDraftM.isPending}>
                                  <Ban className="mr-2 h-4 w-4" />
                                  Cancel Draft
                                </DropdownMenuItem>
                              </>
                            ) : null}

                            {st !== "VOID" && st !== "DRAFT" ? (
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

                    <tr className="rp-gapRow" aria-hidden="true">
                      <td colSpan={8} />
                    </tr>
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </Card>

      {/* PAYMENT MODAL */}
      <ModalShell
        open={payOpen}
        onClose={() => !setPaymentM.isPending && setPayOpen(false)}
        title="Payment"
        subtitle={
          <>
            Enter the <b>total amount paid so far</b>. When fully paid, the invoice disappears from this page.
          </>
        }
        icon={<RsMark />}
      >
        <div className="rounded-2xl bg-background/60 p-4">
          <div className="text-xs text-muted-foreground">Invoice</div>
          <div className="font-semibold">
            {payInvoice?.invoice_number || `#${payInvoice?.id}`} • {formatDateDMY(payInvoice?.invoice_date)}
          </div>

          <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
            <div className="rounded-xl bg-background/60 p-2.5">
              <div className="text-xs text-muted-foreground">Gross</div>
              <div className="font-extrabold tabular-nums">{rs(payInvoice?.gross_total ?? payInvoice?.total_amount)}</div>
            </div>

            <div className="rounded-xl bg-background/60 p-2.5">
              <div className="text-xs text-muted-foreground">Paid</div>
              <div className="font-extrabold tabular-nums">{rs(payInvoice?.amount_paid ?? 0)}</div>
            </div>

            <div className="rounded-xl bg-amber-500/10 p-2.5">
              <div className="text-xs text-amber-900/70 dark:text-amber-200/70">Due</div>
              <div className="font-extrabold tabular-nums">
                {rs(Math.max(0, n(payInvoice?.balance_remaining ?? n(payInvoice?.total_amount) - n(payInvoice?.amount_paid))))}
              </div>
            </div>
          </div>

          <div className="mt-3 rounded-xl bg-background/60 p-3">
            <div className="text-xs font-semibold text-foreground/80">Remarks</div>
            <textarea
              className="mt-2 w-full min-h-[78px] rounded-xl bg-background/70 p-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="e.g. Cash received • Bank transfer ref"
              value={payRemarks}
              onChange={(e) => setPayRemarks(e.target.value)}
            />
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
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => setPayAmountStr("0.00")}
              disabled={setPaymentM.isPending}
            >
              Set 0
            </Button>

            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => {
                const gross = n(payInvoice?.gross_total ?? payInvoice?.total_amount);
                setPayAmountStr(gross.toFixed(2));
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
      </ModalShell>
    </div>
  );
}