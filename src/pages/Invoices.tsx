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
  Search,
  X,
  CheckSquare2,
  Square,
  Hash,
} from "lucide-react";

import {
  listInvoices,
  markInvoicePaid,
  voidInvoice,
  setInvoicePayment,
  cancelDraftKeepInList,
  backfillAllInvoiceHeaderTotals,
} from "@/lib/invoices";
import { useAuth } from "@/contexts/AuthContext";
import type { InvoiceStatus } from "@/types/invoice";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/* =========================
   Helpers
========================= */
const APP_ORIGIN = "https://rampotteryhub.com";
const PAGE_STATE_KEY = "rp_invoices_page_state_v4";
const RETURN_ROW_KEY = "rp_invoices_return_row_id_v4";
const CANCELLED_DRAFT_PREFIX = "[CANCELLED DRAFT]";

const n = (v: any) => {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
};

const rs = (v: any) =>
  `Rs ${n(v).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

function normalizeStatus(s?: string | null) {
  const v = String(s || "").toUpperCase();
  if (v === "PAID") return "PAID";
  if (v === "PARTIALLY_PAID" || v === "PARTIAL") return "PARTIALLY_PAID";
  if (v === "VOID") return "VOID";
  if (v === "DRAFT") return "DRAFT";
  if (v === "UNPAID" || v === "ISSUED") return "ISSUED";
  return "ISSUED";
}

function isCancelledDraftRow(row: any) {
  return (
    normalizeStatus(row?.status) === "DRAFT" &&
    String(row?.notes || "").trim().toUpperCase().startsWith(CANCELLED_DRAFT_PREFIX)
  );
}

function displayStatus(row: any) {
  return isCancelledDraftRow(row) ? "CANCELLED_DRAFT" : normalizeStatus(row?.status);
}

function statusLabel(st: string) {
  if (st === "CANCELLED_DRAFT") return "Cancelled Draft";
  if (st === "PARTIALLY_PAID") return "Partially Paid";
  if (st === "DRAFT") return "Draft";
  if (st === "ISSUED") return "Issued";
  if (st === "VOID") return "Void";
  if (st === "PAID") return "Paid";
  return st;
}

function statusPillClass(st: string) {
  if (st === "CANCELLED_DRAFT") return "bg-rose-500/10 text-rose-800 dark:text-rose-200";
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

function normalizeText(v: any) {
  return String(v ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

function compactText(v: any) {
  return String(v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
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
  window.open(
    `https://wa.me/${to}?text=${encodeURIComponent(text)}`,
    "_blank",
    "noopener,noreferrer"
  );
}

function RsMark({ className }: { className?: string }) {
  return (
    <span className={cn("font-black tracking-tight text-[13px] leading-[13px]", className)}>
      Rs
    </span>
  );
}

function readStoredInvoicesState(): {
  qInput: string;
  status: InvoiceStatus | "ALL";
} {
  if (typeof window === "undefined") return { qInput: "", status: "ALL" };

  try {
    const raw = window.sessionStorage.getItem(PAGE_STATE_KEY);
    if (!raw) return { qInput: "", status: "ALL" };

    const parsed = JSON.parse(raw);
    return {
      qInput: String(parsed?.qInput || ""),
      status: (parsed?.status || "ALL") as InvoiceStatus | "ALL",
    };
  } catch {
    return { qInput: "", status: "ALL" };
  }
}

function tokenizeInvoiceSearch(v: string) {
  return Array.from(
    new Set(
      String(v || "")
        .split(/[\s,;]+/)
        .map((x) => x.trim())
        .filter(Boolean)
        .map(compactText)
        .filter(Boolean)
    )
  );
}

function searchScoreInvoice(row: any, term: string) {
  const q = compactText(term);
  if (!q) return 0;

  const cust = row.customer || {};
  const invoiceNo = String(row.invoice_number || `#${row.id}`);
  const invoiceNoCompact = compactText(invoiceNo);

  const customerName = normalizeText(cust.name || row.customer_name || cust.client_name || "");
  const customerNameCompact = compactText(cust.name || row.customer_name || cust.client_name || "");

  const brn = String(cust.brn || row.customer_brn || "").trim();
  const brnCompact = compactText(brn);

  const customerCode = String(cust.customer_code || row.customer_code || "").trim();
  const customerCodeCompact = compactText(customerCode);

  const nameWords = customerName
    .split(/\s+/)
    .map((x) => x.trim())
    .filter(Boolean);

  if (invoiceNoCompact === q) return 1600;
  if (invoiceNoCompact.startsWith(q)) return 1450;
  if (brnCompact === q) return 1420;
  if (brnCompact.startsWith(q)) return 1340;
  if (customerNameCompact === q) return 1280;
  if (nameWords.some((w) => compactText(w).startsWith(q))) return 1220;
  if (customerNameCompact.startsWith(q)) return 1180;
  if (customerCodeCompact === q) return 1100;
  if (customerCodeCompact.startsWith(q)) return 1040;
  if (invoiceNoCompact.includes(q)) return 960;
  if (brnCompact.includes(q)) return 920;
  if (customerNameCompact.includes(q)) return 860;
  if (customerCodeCompact.includes(q)) return 780;

  return 0;
}

/* =========================
   KPI Card
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
        <div className="min-w-0 flex-1">
          <div className="rp-label">{title}</div>

          <div className="mt-2 flex items-baseline gap-2 min-w-0">
            <span className="text-[12px] font-black text-muted-foreground">Rs</span>
            <span
              className={cn(
                "tabular-nums font-extrabold text-foreground whitespace-nowrap leading-[1.05]",
                "text-[clamp(16px,1.25vw,22px)]"
              )}
              title={value}
            >
              {String(value).replace(/^Rs\s*/i, "")}
            </span>
          </div>

          {sub ? <div className="mt-1 text-xs text-muted-foreground">{sub}</div> : null}
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
          <div className="h-10 w-10 rounded-2xl bg-primary/10 text-primary grid place-items-center">
            {icon}
          </div>
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

async function fixOldInvoiceTotals() {
  try {
    console.log("Starting backfill...");

    const res = await backfillAllInvoiceHeaderTotals();

    console.log("BACKFILL RESULT:", res);

    if (!res) {
      console.error("No response from backfill");
      return;
    }

    if (res.failed?.length) {
      console.error("FAILED:", res.failed);
    }

    toast.success(`Updated ${res.updated}/${res.total} invoices`);

    await qc.invalidateQueries({ queryKey: ["invoices_all_page_v2"] });
    await qc.invalidateQueries({ queryKey: ["invoices"] });
    await qc.invalidateQueries({ queryKey: ["invoice"] });

    await invoicesQ.refetch();

  } catch (e: any) {
    console.error("BACKFILL ERROR:", e);
    toast.error(e?.message || "Failed to recalc totals");
  }
}

  const { user } = useAuth();

  const role = String((user as any)?.role || "").toLowerCase();
  const isAdmin = role === "admin";

  const initialState = useMemo(() => readStoredInvoicesState(), []);
  const [qInput, setQInput] = useState(initialState.qInput);
  const [q, setQ] = useState(initialState.qInput.trim());
  const [status, setStatus] = useState<InvoiceStatus | "ALL">(initialState.status);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkNumberInput, setBulkNumberInput] = useState("");

  const [payOpen, setPayOpen] = useState(false);
  const [payInvoice, setPayInvoice] = useState<any | null>(null);
  const [payAmountStr, setPayAmountStr] = useState<string>("0.00");
  const [payRemarks, setPayRemarks] = useState<string>("");

  const payRef = useRef<HTMLInputElement | null>(null);

  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});

  const [highlightId, setHighlightId] = useState<string>("");

  useEffect(() => {
    const t = window.setTimeout(() => setQ(qInput.trim()), 220);
    return () => window.clearTimeout(t);
  }, [qInput]);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(
        PAGE_STATE_KEY,
        JSON.stringify({
          qInput,
          status,
        })
      );
    } catch {
      //
    }
  }, [qInput, status]);


  const invoicesQ = useQuery({
    queryKey: ["invoices_all_page_v2"],
    queryFn: () => listInvoices({ q: "", status: "ALL" as any, limit: 1500 }),
    staleTime: 10_000,
  });

  const allRows = invoicesQ.data || [];

  const rows = useMemo(() => {
    let next = [...allRows];

    if (status !== "ALL") {
      next = next.filter((r: any) => normalizeStatus(r.status) === status);
    }

    const term = q.trim();
    if (!term) return next;

    return next
      .map((r: any) => ({
        row: r,
        score: searchScoreInvoice(r, term),
      }))
      .filter((x) => x.score > 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;

        const aInv = String(a.row.invoice_number || a.row.id || "");
        const bInv = String(b.row.invoice_number || b.row.id || "");
        return bInv.localeCompare(aInv, undefined, {
          numeric: true,
          sensitivity: "base",
        });
      })
      .map((x) => x.row);
  }, [allRows, q, status]);

  const selectedSet = useMemo(() => new Set(selectedIds.map(String)), [selectedIds]);

  const kpis = useMemo(() => {
    const nonVoid = rows.filter((r: any) => normalizeStatus(r.status) !== "VOID");

    const count = rows.length;
    const total = nonVoid.reduce((s: number, r: any) => s + n(r.gross_total ?? r.total_amount), 0);
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
      toast.error(err?.message || "Payment update failed");
    },
    onSuccess: async () => {
      setPayOpen(false);
      setPayInvoice(null);
      await qc.invalidateQueries({ queryKey: ["invoices_all_page_v2"] });
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
      await qc.invalidateQueries({ queryKey: ["invoices_all_page_v2"] });
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
      await qc.invalidateQueries({ queryKey: ["invoices_all_page_v2"] });
      await qc.invalidateQueries({ queryKey: ["invoices"] });
      await qc.invalidateQueries({ queryKey: ["invoice"] });
      toast.success("Invoice updated");
    },
  });

  const cancelDraftKeepM = useMutation({
    mutationFn: async (invoiceId: number) => cancelDraftKeepInList(invoiceId),
    onError: (err: any) => {
      toast.error(err?.message || "Cancel draft failed");
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["invoices_all_page_v2"] });
      await qc.invalidateQueries({ queryKey: ["invoices"] });
      await qc.invalidateQueries({ queryKey: ["invoice"] });
      toast.success("Draft invoice cancelled and kept in the invoices list");
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

    if (isCancelledDraftRow(inv)) {
      toast.error("This draft invoice is already cancelled.");
      return;
    }

    if (!confirm("Cancel this draft invoice? It will stay in the invoices list as a cancelled draft.")) {
      return;
    }

    cancelDraftKeepM.mutate(inv.id);
  }

  function onSendWhatsApp(inv: any) {
    const cust = inv.customer || {};
    const to = normalizeMuPhone(
      cust.whatsapp || cust.phone || inv.customer_whatsapp || inv.customer_phone
    );

    if (!to) {
      toast.error("No WhatsApp/phone number found for this customer.");
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

  function rememberRowAndOpen(inv: any, mode: "open" | "edit" = "open") {
    try {
      window.sessionStorage.setItem(RETURN_ROW_KEY, String(inv.id));
    } catch {
      //
    }

    if (mode === "edit") nav(`/invoices/${inv.id}`);
    else nav(`/invoices/${inv.id}`);
  }

  useEffect(() => {
    if (!rows.length) return;

    let remembered = "";
    try {
      remembered = window.sessionStorage.getItem(RETURN_ROW_KEY) || "";
    } catch {
      //
    }

    if (!remembered) return;

    const el = rowRefs.current[remembered];
    if (!el) return;

    const t = window.setTimeout(() => {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightId(remembered);

      const t2 = window.setTimeout(() => setHighlightId(""), 2200);

      try {
        window.sessionStorage.removeItem(RETURN_ROW_KEY);
      } catch {
        //
      }

      return () => window.clearTimeout(t2);
    }, 80);

    return () => window.clearTimeout(t);
  }, [rows]);

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const set = new Set(prev.map(String));
      if (set.has(id)) set.delete(id);
      else set.add(id);
      return Array.from(set);
    });
  }

  function selectVisibleRows() {
    setSelectedIds((prev) => {
      const set = new Set(prev.map(String));
      rows.forEach((r: any) => set.add(String(r.id)));
      return Array.from(set);
    });
  }

  function clearSelectedRows() {
    setSelectedIds([]);
  }

  function selectByInvoiceNumbers() {
    const tokens = tokenizeInvoiceSearch(bulkNumberInput);
    if (!tokens.length) {
      toast.error("Enter at least one invoice number");
      return;
    }

    const matched = allRows
      .filter((r: any) => tokens.includes(compactText(r.invoice_number || `#${r.id}`)))
      .map((r: any) => String(r.id));

    if (!matched.length) {
      toast.error("No invoice numbers matched");
      return;
    }

    setSelectedIds((prev) => Array.from(new Set([...prev.map(String), ...matched])));
    toast.success(`${matched.length} invoice(s) selected`);
  }

function printSelected() {
  const selected = selectedIds
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id) && id > 0);

  if (!selected.length) {
    toast.error("Select at least one invoice");
    return;
  }

  const win = window.open(
    `/invoices/bulk-print?ids=${selected.join(",")}`,
    "_blank",
    "noopener,noreferrer"
  );

  if (!win) {
    toast.error("Popup blocked. Please allow popups for bulk print.");
    return;
  }

  win.focus();
}

  return (
    <div className="rp-page">
      <style>{`
/* =========================
   INVOICES — EXECUTIVE PREMIUM
========================= */

.rp-page{
  width:100%;
  max-width:1480px;
  margin:0 auto;
  padding:18px 22px 28px 22px;
  display:flex;
  flex-direction:column;
  gap:16px;
  overflow-x:hidden;
}

.rp-bg{
  position:fixed;
  inset:0;
  pointer-events:none;
  z-index:-10;
}
.rp-bg::before{
  content:"";
  position:absolute;
  inset:0;
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

html, body, #root{
  border:none !important;
  outline:none !important;
  box-shadow:none !important;
}

.rp-card{
  border:none !important;
  outline:none !important;
  border-radius:18px;
  background:linear-gradient(to bottom, rgba(255,255,255,.97), rgba(255,255,255,.91));
  box-shadow:
    0 16px 42px rgba(2,6,23,.06),
    0 1px 0 rgba(255,255,255,.70) inset;
}
:root.dark .rp-card{
  background:linear-gradient(to bottom, rgba(2,6,23,.82), rgba(2,6,23,.62));
  box-shadow:0 18px 55px rgba(0,0,0,.45);
}

.rp-label{
  font-size:11px;
  font-weight:800;
  letter-spacing:.10em;
  text-transform:uppercase;
  color:rgba(15,23,42,.60);
}
:root.dark .rp-label{ color:rgba(226,232,240,.60); }

.rp-hero{
  border-radius:18px;
  padding:16px 18px;
  background:
    radial-gradient(circle at 18% 22%, rgba(185,28,28,.10), transparent 52%),
    radial-gradient(circle at 72% 30%, rgba(2,6,23,.06), transparent 50%),
    linear-gradient(to bottom, rgba(255,255,255,.94), rgba(255,255,255,.86));
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

.rp-searchShell{
  position:relative;
  min-width:320px;
  flex:1 1 520px;
}

.rp-searchIcon{
  position:absolute;
  left:14px;
  top:50%;
  transform:translateY(-50%);
  color:rgba(15,23,42,.45);
}

.rp-searchInput{
  height:46px !important;
  padding-left:42px !important;
  padding-right:48px !important;
  border:none !important;
  outline:none !important;
  border-radius:15px !important;
  background:linear-gradient(to bottom, rgba(255,255,255,.98), rgba(248,250,252,.96)) !important;
  box-shadow:
    0 12px 28px rgba(2,6,23,.04),
    0 0 0 1px rgba(148,163,184,.20) inset !important;
}
.rp-searchInput:focus{
  box-shadow:
    0 12px 28px rgba(2,6,23,.06),
    0 0 0 2px rgba(185,28,28,.18) inset !important;
}

.rp-clearBtn{
  position:absolute;
  right:10px;
  top:50%;
  transform:translateY(-50%);
  height:28px;
  width:28px;
  border:none;
  outline:none;
  border-radius:999px;
  display:grid;
  place-items:center;
  background:rgba(2,6,23,.05);
  color:rgba(15,23,42,.70);
}
:root.dark .rp-clearBtn{
  background:rgba(255,255,255,.08);
  color:rgba(226,232,240,.80);
}

.rp-filterRow{
  display:flex;
  flex-wrap:wrap;
  gap:10px;
  align-items:center;
  padding:14px;
}

.rp-bulkBar{
  display:flex;
  flex-wrap:wrap;
  gap:10px;
  align-items:center;
  padding:14px;
  border-top:1px solid rgba(148,163,184,.12);
}

.rp-bulkTag{
  display:inline-flex;
  align-items:center;
  gap:8px;
  border-radius:999px;
  padding:8px 12px;
  background:rgba(185,28,28,.08);
  color:rgba(127,29,29,1);
  font-size:12px;
  font-weight:800;
}
:root.dark .rp-bulkTag{
  background:rgba(239,68,68,.16);
  color:rgba(254,202,202,1);
}

.rp-tableShell{
  overflow:hidden;
}

.rp-table, .rp-table *{
  border:none !important;
  outline:none !important;
  box-shadow:none !important;
}

.rp-table{
  width:100%;
  table-layout:fixed;
  border-collapse:separate;
  border-spacing:0;
}

.rp-thead th{
  padding:12px 14px;
  font-size:11px;
  font-weight:900;
  letter-spacing:.12em;
  text-transform:uppercase;
  color:rgba(15,23,42,.60);
  background:rgba(2,6,23,.02);
}
:root.dark .rp-thead th{
  color:rgba(226,232,240,.60);
  background:rgba(255,255,255,.05);
}

.rp-row td{
  padding:12px 14px;
}
.rp-row{
  background:transparent;
  transition:background .12s ease, transform .12s ease;
}
.rp-row:hover{
  background:rgba(2,6,23,.02);
}
:root.dark .rp-row:hover{
  background:rgba(255,255,255,.04);
}

.rp-row.is-highlight{
  background:rgba(185,28,28,.07);
}
:root.dark .rp-row.is-highlight{
  background:rgba(239,68,68,.12);
}

.rp-gapRow td{
  padding:0;
  height:8px;
}

.rp-invPill{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  padding:8px 10px;
  border-radius:14px;
  background:rgba(2,6,23,.03);
  font-weight:900;
  letter-spacing:.2px;
  color:rgba(2,6,23,.90);
  max-width:100%;
}
:root.dark .rp-invPill{
  background:rgba(255,255,255,.05);
  color:rgba(226,232,240,.92);
}

.rp-trunc{
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
  max-width:100%;
}

.rp-sub{
  margin-top:2px;
  font-size:12px;
  color:rgba(15,23,42,.55);
}
:root.dark .rp-sub{ color:rgba(226,232,240,.60); }

.rp-money{
  font-weight:900;
  color:rgba(2,6,23,.88);
}
:root.dark .rp-money{ color:rgba(226,232,240,.92); }

.rp-mini{
  font-size:12px;
  color:rgba(15,23,42,.55);
}
:root.dark .rp-mini{ color:rgba(226,232,240,.60); }

.rp-creditTag{
  display:inline-flex;
  align-items:center;
  gap:8px;
  padding:7px 10px;
  border-radius:14px;
  background:rgba(16,185,129,.10);
  color:rgba(6,95,70,1);
  font-weight:950;
}
:root.dark .rp-creditTag{
  background:rgba(16,185,129,.14);
  color:rgba(167,243,208,1);
}
.rp-dot{
  width:8px;
  height:8px;
  border-radius:999px;
  background:rgba(16,185,129,1);
}

.rp-checkBtn{
  height:20px;
  width:20px;
  display:grid;
  place-items:center;
  color:rgba(15,23,42,.75);
}
:root.dark .rp-checkBtn{
  color:rgba(226,232,240,.80);
}

.rp-bulkPrintFrame:last-child{
  page-break-after:auto;
}

.col-select{ width: 4.5%; }
.col-inv{ width: 11%; }
.col-date{ width: 10%; }
.col-cust{ width: 19%; }
.col-total{ width: 11%; }
.col-credits{ width: 10%; }
.col-paid{ width: 10%; }
.col-balance{ width: 10%; }
.col-status{ width: 9%; }
.col-actions{ width: 9.5%; }

.rp-actionsCell{
  padding-right:18px !important;
  text-align:right;
}

@keyframes rpDotsShine {
  0% { transform: translateX(-80%); opacity: 0; }
  18% { opacity: .7; }
  38% { transform: translateX(80%); opacity: 0; }
  100% { transform: translateX(80%); opacity: 0; }
}

@media (max-width: 1180px){
  .rp-page{ padding:14px; }
  .col-cust{ width:24%; }
  .col-status{ width:12%; }
}

  .rp-bulkPrintRoot{
    display:block !important;
    position:static !important;
    left:auto !important;
    top:auto !important;
    width:auto !important;
    margin:0 auto !important;
    background:#fff !important;
  }

  .rp-bulkPrintFrame{
    display:block !important;
    page-break-after:always !important;
  }

  .rp-bulkPrintFrame:last-child{
    page-break-after:auto !important;
  }
}
      `}</style>

      <div className="rp-bg" />

      <div className="rp-hero">
        <div className="relative z-[1] flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl sm:text-2xl md:text-3xl font-black text-foreground tracking-tight">
                Invoices
              </h1>
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-primary/10 text-primary">
                <Sparkles className="h-3.5 w-3.5" /> Executive
              </span>
            </div>
            <p className="text-muted-foreground mt-2 text-sm sm:text-base">
              Premium register • invoice-number / BRN / customer-name search • bulk print • return-to-row
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <Button variant="outline" onClick={() => invoicesQ.refetch()} disabled={invoicesQ.isFetching}>
              <RefreshCw className={cn("h-4 w-4 mr-2", invoicesQ.isFetching && "animate-spin")} />
              {invoicesQ.isFetching ? "Refreshing..." : "Refresh"}
            </Button>

            <Button variant="outline" onClick={fixOldInvoiceTotals}>
              Recalc Totals
            </Button>


            <Button
              onClick={() => nav("/invoices/create")}
              className="gradient-primary shadow-glow text-primary-foreground"
            >
              + New Invoice
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:gap-4 lg:gap-5 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        <KpiCard
          title="Invoices"
          value={`${kpis.count}`}
          sub={`Issued: ${kpis.issued} • Partial: ${kpis.partial} • Paid: ${kpis.fullyPaid}`}
          icon={FileText}
          tone="info"
        />
        <KpiCard title="Total Value" value={rs(kpis.total)} sub="Excluding VOID" icon={CircleDollarSign} />
        <KpiCard
          title="Credits"
          value={rs(kpis.credits)}
          sub="Applied credit notes"
          icon={Receipt}
          tone={kpis.credits > 0 ? "good" : "default"}
        />
        <KpiCard
          title="Paid"
          value={rs(kpis.paid)}
          sub={kpis.discount > 0 ? `Discounts: ${rs(kpis.discount)}` : "Payments received"}
          icon={Wallet}
          tone="good"
        />
        <KpiCard
          title="Outstanding"
          value={rs(kpis.balance)}
          sub="Balance remaining"
          icon={BadgePercent}
          tone={kpis.balance > 0 ? "warn" : "good"}
        />
      </div>

      <Card className="rp-card">
        <div className="rp-filterRow">
          <div className="rp-searchShell">
            <Search className="h-4 w-4 rp-searchIcon" />
            <Input
              placeholder="Search by invoice number, BRN, customer name, or customer code"
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              className="rp-searchInput"
            />
            {qInput ? (
              <button
                type="button"
                className="rp-clearBtn"
                onClick={() => setQInput("")}
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          <select
            className="h-[46px] rounded-[15px] px-3 bg-background/60 text-sm font-semibold text-foreground outline-none shadow-[0_0_0_1px_rgba(148,163,184,.20)_inset]"
            value={status}
            onChange={(e) => setStatus(e.target.value as any)}
          >
            <option value="ALL">All Statuses</option>
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

        <div className="rp-bulkBar">
          <span className="rp-bulkTag">
            <CheckSquare2 className="h-4 w-4" />
            {selectedIds.length} selected
          </span>

          <Button variant="outline" onClick={selectVisibleRows} disabled={!rows.length}>
            Select Visible
          </Button>

          <Button variant="outline" onClick={clearSelectedRows} disabled={!selectedIds.length}>
            Clear
          </Button>

          <div className="rp-searchShell max-w-[360px] min-w-[260px]">
            <Hash className="h-4 w-4 rp-searchIcon" />
            <Input
              placeholder="Bulk select by invoice numbers: INV-0001, INV-0008"
              value={bulkNumberInput}
              onChange={(e) => setBulkNumberInput(e.target.value)}
              className="rp-searchInput"
            />
          </div>

          <Button variant="outline" onClick={selectByInvoiceNumbers}>
            Match Numbers
          </Button>

          <Button
            onClick={printSelected}
            className="gradient-primary shadow-glow text-primary-foreground"
            disabled={!selectedIds.length}
          >
            <Printer className="mr-2 h-4 w-4" />
            Print Selected
          </Button>
        </div>
      </Card>

      <Card className="rp-card rp-tableShell">
        <table className="rp-table">
          <thead className="rp-thead">
            <tr>
              <th className="col-select text-center">
                <button
                  type="button"
                  className="rp-checkBtn"
                  onClick={() => {
                    const visibleIds = rows.map((r: any) => String(r.id));
                    const allVisibleSelected =
                      visibleIds.length > 0 && visibleIds.every((id) => selectedSet.has(id));

                    if (allVisibleSelected) {
                      setSelectedIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
                    } else {
                      setSelectedIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
                    }
                  }}
                  aria-label="Toggle all visible"
                >
                  {rows.length > 0 && rows.every((r: any) => selectedSet.has(String(r.id))) ? (
                    <CheckSquare2 className="h-5 w-5" />
                  ) : (
                    <Square className="h-5 w-5" />
                  )}
                </button>
              </th>
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
                <td colSpan={10} className="p-8 text-center text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-2">
                    <RefreshCw className="h-4 w-4 animate-spin" /> Loading invoices…
                  </span>
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr className="rp-row">
                <td colSpan={10} className="p-8 text-center text-sm text-muted-foreground">
                  No invoices found.
                </td>
              </tr>
            ) : (
              rows.map((r: any) => {
                const st = displayStatus(r);
                const rawStatus = normalizeStatus(r.status);
                const cancelledDraft = isCancelledDraftRow(r);

                const cust = r.customer || {};
                const custName =
                  cust.name || cust.client_name || r.customer_name || `#${r.customer_id}`;
                const custCode = cust.customer_code || r.customer_code || "";
                const custBrn = String(cust.brn || r.customer_brn || "").trim();
                const invNo = r.invoice_number || `#${r.id}`;
                const credits = n(r.credits_applied ?? 0);

                const muPhone = normalizeMuPhone(
                  cust.whatsapp || cust.phone || r.customer_whatsapp || r.customer_phone
                );
                const hasWA = Boolean(muPhone);

                return (
                  <React.Fragment key={r.id}>
                    <tr
                      ref={(el) => {
                        rowRefs.current[String(r.id)] = el;
                      }}
                      className={cn("rp-row", highlightId === String(r.id) && "is-highlight")}
                    >
                      <td className="text-center">
                        <button
                          type="button"
                          className="rp-checkBtn"
                          onClick={() => toggleSelected(String(r.id))}
                          aria-label={`Select ${invNo}`}
                        >
                          {selectedSet.has(String(r.id)) ? (
                            <CheckSquare2 className="h-5 w-5" />
                          ) : (
                            <Square className="h-5 w-5" />
                          )}
                        </button>
                      </td>

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
                          <div className="font-semibold text-foreground rp-trunc min-w-0">
                            {custName}
                          </div>
                          {hasWA ? (
                            <span
                              title="WhatsApp detected"
                              className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-200 shrink-0"
                            >
                              <MessageCircle className="h-4 w-4" />
                            </span>
                          ) : null}
                        </div>
                        <div className="rp-mini rp-trunc">
                          {custBrn ? `BRN: ${custBrn}` : custCode ? custCode : "—"}
                        </div>
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
                                "ring-1 ring-rose-500/30",
                                "relative overflow-hidden group"
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
                            <DropdownMenuItem onClick={() => rememberRowAndOpen(r)}>
                              <Eye className="mr-2 h-4 w-4" />
                              Open
                            </DropdownMenuItem>

                            <DropdownMenuItem
                              onClick={() =>
                                window.open(`/invoices/${r.id}/print`, "_blank", "noopener,noreferrer")
                              }
                            >
                              <Printer className="mr-2 h-4 w-4" />
                              Print (PDF)
                            </DropdownMenuItem>

                            <DropdownMenuItem onClick={() => rememberRowAndOpen(r, "edit")}>
                              <FileText className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>

                            <DropdownMenuSeparator />

                            {st !== "VOID" && !cancelledDraft ? (
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

                            {st !== "PAID" && st !== "VOID" && !cancelledDraft ? (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => {
                                    if (
                                      !confirm("Mark invoice as PAID (pay remaining after credits)?")
                                    ) {
                                      return;
                                    }
                                    markPaidM.mutate(r.id);
                                  }}
                                  disabled={markPaidM.isPending}
                                >
                                  <CheckCircle2 className="mr-2 h-4 w-4" />
                                  Mark Paid
                                </DropdownMenuItem>
                              </>
                            ) : null}

                            {rawStatus === "DRAFT" && !cancelledDraft ? (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => onCancelDraft(r)}
                                  disabled={cancelDraftKeepM.isPending}
                                >
                                  <Ban className="mr-2 h-4 w-4" />
                                  Cancel Draft
                                </DropdownMenuItem>
                              </>
                            ) : null}

                            {st !== "VOID" && rawStatus !== "DRAFT" && !cancelledDraft ? (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => onVoid(r)}
                                  disabled={voidM.isPending}
                                >
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
                      <td colSpan={10} />
                    </tr>
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </Card>


      <ModalShell
        open={payOpen}
        onClose={() => !setPaymentM.isPending && setPayOpen(false)}
        title="Payment"
        subtitle={
          <>
            Enter the <b>total amount paid so far</b>. Status auto-updates. Credits are deducted
            from what is due.
          </>
        }
        icon={<RsMark />}
      >
        <div className="rounded-2xl bg-background/60 p-4">
          <div className="text-xs text-muted-foreground">Invoice</div>
          <div className="font-semibold">
            {payInvoice?.invoice_number || `#${payInvoice?.id}`} •{" "}
            {formatDateDMY(payInvoice?.invoice_date)}
          </div>

          <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
            <div className="rounded-xl bg-background/60 p-2.5">
              <div className="text-xs text-muted-foreground">Gross</div>
              <div className="font-extrabold tabular-nums">
                {rs(payInvoice?.gross_total ?? payInvoice?.total_amount)}
              </div>
            </div>

            <div className="rounded-xl bg-emerald-500/10 p-2.5">
              <div className="text-xs text-emerald-800/70 dark:text-emerald-200/70">Credits</div>
              <div className="font-extrabold tabular-nums">
                {rs(payInvoice?.credits_applied ?? 0)}
              </div>
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
            <div className="mt-1 text-[11px] text-muted-foreground">
              Optional. Saved with the payment if backend supports it.
            </div>
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
              if (/^\\d*([.]\\d{0,2})?$/.test(v)) setPayAmountStr(v);
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
          <Button
            variant="outline"
            onClick={() => setPayOpen(false)}
            disabled={setPaymentM.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={savePayment}
            disabled={setPaymentM.isPending}
            className="gradient-primary shadow-glow text-primary-foreground"
          >
            {setPaymentM.isPending ? "Saving..." : "Save"}
          </Button>
        </div>

        <div className="text-[11px] text-muted-foreground">
          Note: WhatsApp cannot auto-attach PDFs from the browser. The message includes the invoice
          PDF link.
        </div>
      </ModalShell>
    </div>
  );
}