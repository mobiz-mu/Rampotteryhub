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
} from "lucide-react";

import { listInvoices, markInvoicePaid, voidInvoice, setInvoicePayment } from "@/lib/invoices";
import { useAuth } from "@/contexts/AuthContext";
import type { InvoiceStatus } from "@/types/invoice";

/* =========================
   Helpers
========================= */
const n = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);

const rs = (v: any) =>
  `Rs ${n(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function normalizeStatus(s?: string | null) {
  const v = String(s || "").toUpperCase();
  if (v === "PAID") return "PAID";
  if (v === "PARTIALLY_PAID" || v === "PARTIAL") return "PARTIALLY_PAID";
  if (v === "VOID") return "VOID";
  if (v === "UNPAID" || v === "ISSUED" || v === "DRAFT") return "ISSUED";
  return "ISSUED";
}

function statusPillClass(st: string) {
  if (st === "PAID") return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (st === "PARTIALLY_PAID") return "bg-amber-100 text-amber-700 border-amber-200";
  if (st === "VOID") return "bg-slate-100 text-slate-600 border-slate-200";
  return "bg-rose-100 text-rose-700 border-rose-200"; // ISSUED
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
  const s = String(v ?? "").slice(0, 10); // YYYY-MM-DD
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return s || "—";
  return `${m[3]}-${m[2]}-${m[1]}`; // DD-MM-YYYY
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

function RsIcon({ className }: { className?: string }) {
  return (
    <div className={className ?? ""} style={{ fontWeight: 900, fontSize: 14, lineHeight: "14px" }}>
      Rs
    </div>
  );
}

/* =========================
   Small KPI Card (premium)
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
  tone?: "default" | "good" | "warn" | "bad";
}) {
  const toneRing =
    tone === "good"
      ? "bg-emerald-500/10 text-emerald-700"
      : tone === "warn"
      ? "bg-amber-500/10 text-amber-700"
      : tone === "bad"
      ? "bg-rose-500/10 text-rose-700"
      : "bg-primary/10 text-primary";

  return (
    <Card className="shadow-premium hover:shadow-lg transition-shadow">
      <div className="p-5 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs font-semibold tracking-wide text-muted-foreground">{title}</div>
          <div className="mt-2 text-2xl font-extrabold text-foreground truncate">{value}</div>
          {sub ? <div className="mt-1 text-xs text-muted-foreground">{sub}</div> : null}
        </div>
        <div className={`h-11 w-11 rounded-xl grid place-items-center ${toneRing}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );
}

/* =========================
   Page
========================= */
export default function Invoices() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();

  // Your app uses allowRoles ["admin"...] so role is likely "admin"
  const role = String((user as any)?.role || "").toLowerCase();
  const isAdmin = role === "admin";

  /* UI state */
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<InvoiceStatus | "ALL">("ALL");

  /* Payment modal */
  const [payOpen, setPayOpen] = useState(false);
  const [payInvoice, setPayInvoice] = useState<any | null>(null);
  const [payAmountStr, setPayAmountStr] = useState<string>("0");
  const payRef = useRef<HTMLInputElement | null>(null);

  /* Debounced search */
  useEffect(() => {
    const t = window.setTimeout(() => setQ(qInput.trim()), 250);
    return () => window.clearTimeout(t);
  }, [qInput]);

  const invoicesQ = useQuery({
    queryKey: ["invoices", q, status],
    queryFn: () => listInvoices({ q, status, limit: 500 }),
    staleTime: 10_000,
  });

  const rows = invoicesQ.data || [];

  /* KPIs */
  const kpis = useMemo(() => {
    const nonVoid = rows.filter((r: any) => normalizeStatus(r.status) !== "VOID");

    const count = rows.length;
    const total = nonVoid.reduce((s: number, r: any) => s + n(r.total_amount), 0);
    const paid = nonVoid.reduce((s: number, r: any) => s + n(r.amount_paid), 0);
    const balance = nonVoid.reduce((s: number, r: any) => s + n(r.balance_remaining), 0);

    const issued = nonVoid.filter((r: any) => normalizeStatus(r.status) === "ISSUED").length;
    const partial = nonVoid.filter((r: any) => normalizeStatus(r.status) === "PARTIALLY_PAID").length;
    const fullyPaid = nonVoid.filter((r: any) => normalizeStatus(r.status) === "PAID").length;

    const discount = nonVoid.reduce((s: number, r: any) => s + n(r.discount_amount), 0);

    return { count, total, paid, balance, issued, partial, fullyPaid, discount };
  }, [rows]);

  /* =========================
     Mutations (defined correctly)
  ========================= */
  const setPaymentM = useMutation({
    mutationFn: async (args: { invoiceId: number; amount: number }) => {
      return setInvoicePayment(args.invoiceId, args.amount);
    },
    onError: (err: any) => {
      alert(err?.message || "Payment update failed");
      console.log("PAYMENT ERROR:", err);
    },
    onSuccess: async () => {
      setPayOpen(false);
      setPayInvoice(null);
      await qc.invalidateQueries({ queryKey: ["invoices"] });
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
    },
  });

  /* =========================
     Actions
  ========================= */
  function openPayment(inv: any) {
    setPayInvoice(inv);
    setPayAmountStr(String(n(inv.amount_paid).toFixed(2)));
    setPayOpen(true);
    setTimeout(() => payRef.current?.focus(), 60);
  }

  function savePayment() {
    if (!payInvoice?.id) return;
    const amt = Number(payAmountStr || "0");
setPaymentM.mutate({
  invoiceId: payInvoice.id,
  amount: Number.isFinite(amt) ? amt : 0,
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
    const paid = n(inv.amount_paid);
    const due = Math.max(0, n(inv.balance_remaining) || gross - paid);

    // ✅ your domain
    const APP_ORIGIN = "https://rampotteryhub.com";
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

  /* =========================
     Render
  ========================= */
  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-3xl font-extrabold tracking-tight text-foreground">Invoices</div>
          <div className="text-sm text-muted-foreground">Open • Print • Payments • Void • WhatsApp</div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => invoicesQ.refetch()} disabled={invoicesQ.isFetching} className="shadow-sm">
            <RefreshCw className={`h-4 w-4 mr-2 ${invoicesQ.isFetching ? "animate-spin" : ""}`} />
            {invoicesQ.isFetching ? "Refreshing..." : "Refresh"}
          </Button>

          <Button onClick={() => nav("/invoices/create")} className="gradient-primary shadow-glow text-primary-foreground">
            + New Invoice
          </Button>
        </div>
      </div>

      {/* Premium KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Invoices"
          value={`${kpis.count}`}
          sub={`Issued: ${kpis.issued} • Partial: ${kpis.partial} • Paid: ${kpis.fullyPaid}`}
          icon={FileText}
        />
        <KpiCard title="Total Value" value={rs(kpis.total)} sub="Excluding VOID" icon={CircleDollarSign} />
        <KpiCard title="Paid" value={rs(kpis.paid)} sub={kpis.discount > 0 ? `Discounts: ${rs(kpis.discount)}` : "Payments received"} icon={Wallet} tone="good" />
        <KpiCard title="Outstanding" value={rs(kpis.balance)} sub="Balance remaining" icon={BadgePercent} tone={kpis.balance > 0 ? "warn" : "good"} />
      </div>

      {/* Filters */}
      <Card className="p-4 flex flex-wrap gap-3 items-center shadow-premium">
        <Input
          placeholder="Search invoice / customer / code"
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
          className="max-w-[460px]"
        />

        <select className="h-10 rounded-md border px-3 bg-background shadow-sm" value={status} onChange={(e) => setStatus(e.target.value as any)}>
          <option value="ALL">All</option>
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
      </Card>

      {/* Table */}
      <Card className="overflow-hidden shadow-premium">
        <div className="overflow-auto">
          <table className="w-full min-w-[1040px]">
            <thead className="bg-slate-50">
              <tr className="text-[12px] uppercase tracking-wide text-slate-600 border-b">
                <th className="px-4 py-3 text-left">Invoice</th>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Customer</th>
                <th className="px-4 py-3 text-left">Total</th>
                <th className="px-4 py-3 text-left">Discount</th>
                <th className="px-4 py-3 text-left">Paid</th>
                <th className="px-4 py-3 text-left">Balance</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-3 py-3 text-right" />
              </tr>
            </thead>

            <tbody className="divide-y">
              {rows.map((r: any) => {
                const st = normalizeStatus(r.status);
                const cust = r.customer || {};
                const custName = cust.name || r.customer_name || `#${r.customer_id}`;
                const custCode = cust.customer_code || r.customer_code || "";
                const invNo = r.invoice_number || `#${r.id}`;

                const dp = n(r.discount_percent);
                const da = n(r.discount_amount);

                const muPhone = normalizeMuPhone(cust.whatsapp || cust.phone || r.customer_whatsapp || r.customer_phone);
                const hasWA = Boolean(muPhone);

                return (
                  <tr key={r.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3">
                      <div className="inline-flex items-center justify-center border rounded-md px-3 py-2 font-semibold text-slate-800 bg-white">
                        {invNo}
                      </div>
                    </td>

                    <td className="px-4 py-3 text-sm text-slate-700">{formatDateDMY(r.invoice_date)}</td>

                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="font-semibold text-slate-900">{custName}</div>
                        {hasWA ? (
                          <span
                            title="WhatsApp detected"
                            className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-emerald-500/10 text-emerald-700 border border-emerald-200"
                          >
                            <MessageCircle className="h-4 w-4" />
                          </span>
                        ) : null}
                      </div>
                      {custCode ? <div className="text-xs text-slate-500">{custCode}</div> : null}
                    </td>

                    <td className="px-4 py-3 text-sm">
                      <div className="text-slate-500">Rs</div>
                      <div className="text-slate-900 font-semibold">{n(r.total_amount).toFixed(2)}</div>
                    </td>

                    <td className="px-4 py-3 text-sm">
                      {dp > 0 || da > 0 ? (
                        <div className="text-rose-600 font-semibold leading-tight">
                          <div>- {rs(da || (n(r.total_amount) * dp) / 100)}</div>
                          <div className="text-rose-600/80 text-xs">{dp ? `${dp}%` : ""}</div>
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>

                    <td className="px-4 py-3 text-sm">
                      <div className="text-slate-500">Rs</div>
                      <div className="text-slate-900">{n(r.amount_paid).toFixed(2)}</div>
                    </td>

                    <td className="px-4 py-3 text-sm">
                      <div className="text-slate-500">Rs</div>
                      <div className="text-slate-900">{n(r.balance_remaining).toFixed(2)}</div>
                    </td>

                    <td className="px-4 py-3">
                      <span className={"inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold " + statusPillClass(st)}>
                        {st === "PARTIALLY_PAID" ? "Partially Paid" : st === "ISSUED" ? "Issued" : st}
                      </span>
                    </td>

                    {/* ✅ Actions */}
                    <td className="px-3 py-3 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className="h-9 w-9 inline-flex items-center justify-center rounded-full border bg-white hover:bg-slate-50 shadow-sm"
                            aria-label="Actions"
                          >
                            <MoreHorizontal className="h-5 w-5 text-slate-700" />
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
                              <RsIcon className="mr-2" />
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
                                  if (!confirm("Mark invoice as PAID (pay full total)?")) return;
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
                );
              })}

              {!invoicesQ.isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-6 text-center text-sm text-muted-foreground">
                    No invoices found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Payment Modal */}
      {payOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <Card className="p-6 w-[420px] space-y-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-extrabold text-foreground">Payment</div>
                <div className="text-xs text-muted-foreground">
                  Enter the <b>total amount paid so far</b>. Status auto-updates (Paid / Partially Paid).
                </div>
              </div>
              <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary grid place-items-center">
                <RsIcon />
              </div>
            </div>

            <div className="rounded-xl border p-3 bg-background">
              <div className="text-xs text-muted-foreground">Invoice</div>
              <div className="font-semibold">
                {payInvoice?.invoice_number || `#${payInvoice?.id}`} • {formatDateDMY(payInvoice?.invoice_date)}
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
                <div className="rounded-lg border p-2">
                  <div className="text-xs text-muted-foreground">Total</div>
                  <div className="font-bold">{rs(payInvoice?.gross_total ?? payInvoice?.total_amount)}</div>
                </div>
                <div className="rounded-lg border p-2">
                  <div className="text-xs text-muted-foreground">Paid</div>
                  <div className="font-bold">{rs(payInvoice?.amount_paid)}</div>
                </div>
                <div className="rounded-lg border p-2">
                  <div className="text-xs text-muted-foreground">Due</div>
                  <div className="font-bold">{rs(payInvoice?.balance_remaining)}</div>
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
                // allow: "", "10", "10.", "10.5", "10.50"
                if (/^\d*([.]\d{0,2})?$/.test(v)) setPayAmountStr(v);
              }}
                 onBlur={() => {
               // normalize on blur
                const x = Number(payAmountStr || "0");
                setPayAmountStr(Number.isFinite(x) ? x.toFixed(2) : "0.00");
              }}
            />

              <div className="flex gap-2">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setPayAmountStr("0.00")}
 disabled={setPaymentM.isPending}>
                  Set 0
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
  const full = n(payInvoice?.gross_total ?? payInvoice?.total_amount);
  setPayAmountStr(full.toFixed(2));
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
              <Button onClick={savePayment} disabled={setPaymentM.isPending}>
                {setPaymentM.isPending ? "Saving..." : "Save"}
              </Button>
            </div>

            <div className="text-[11px] text-muted-foreground">
              Note: WhatsApp cannot auto-attach PDFs from the browser. The message includes the invoice PDF link.
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}




