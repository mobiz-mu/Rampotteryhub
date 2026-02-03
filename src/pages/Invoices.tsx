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

import { MoreHorizontal, Eye, Printer, DollarSign, CheckCircle2, Ban } from "lucide-react";

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

function buildWhatsAppText(opts: {
  customerName?: string;
  invoiceNo: string;
  paidNow: number;
  totalPaid: number;
  balance: number;
  pdfUrl: string;
}) {
  return [
    "Payment received ✅",
    opts.customerName ? `Customer: ${opts.customerName}` : null,
    `Invoice: ${opts.invoiceNo}`,
    `Paid now: Rs ${opts.paidNow.toFixed(2)}`,
    `Total paid: Rs ${opts.totalPaid.toFixed(2)}`,
    `Balance: Rs ${opts.balance.toFixed(2)}`,
    `PDF: ${opts.pdfUrl}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function openWhatsApp(to: string, text: string) {
  window.open(`https://wa.me/${to}?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
}

/* =========================
   Page
========================= */
export default function Invoices() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();

  const isAdmin = String(user?.role || "").toUpperCase() === "ADMIN";

  /* UI state */
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<InvoiceStatus | "ALL">("ALL");

  /* Payment modal */
  const [payOpen, setPayOpen] = useState(false);
  const [payInvoice, setPayInvoice] = useState<any | null>(null);
  const [payAmount, setPayAmount] = useState<number>(0);
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
    const total = rows.reduce((s: number, r: any) => s + n(r.total_amount), 0);
    const paid = rows.reduce((s: number, r: any) => s + n(r.amount_paid), 0);
    const balance = rows.reduce((s: number, r: any) => s + n(r.balance_remaining), 0);
    return { count: rows.length, total, paid, balance };
  }, [rows]);

  /* =========================
     Mutations
  ========================= */
  const markPaidM = useMutation({
    mutationFn: async (invoiceId: number) => markInvoicePaid({ invoiceId }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["invoices"] });
    },
  });

  const voidM = useMutation({
    mutationFn: async (invoiceId: number) => voidInvoice(invoiceId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["invoices"] });
    },
  });

  const setPaymentM = useMutation({
    mutationFn: async (args: { invoiceId: number; amount: number; prevPaid: number }) => {
      const updated = await setInvoicePayment(args.invoiceId, args.amount);
      return { updated, prevPaid: args.prevPaid };
    },
    onSuccess: async ({ updated, prevPaid }) => {
      const gross = n(updated.gross_total ?? updated.total_amount);
      const nextPaid = n(updated.amount_paid);
      const balance = gross - nextPaid; // allow negative if credit

      const paidNow = Math.max(0, nextPaid - prevPaid);

      const to = normalizeMuPhone(updated.customer?.whatsapp || updated.customer?.phone);
      if (to) {
        openWhatsApp(
          to,
          buildWhatsAppText({
            customerName: updated.customer?.name,
            invoiceNo: updated.invoice_number || String(updated.id),
            paidNow,
            totalPaid: nextPaid,
            balance,
            pdfUrl: `${window.location.origin}/invoices/${updated.id}/print`,
          })
        );
      }

      setPayOpen(false);
      setPayInvoice(null);
      await qc.invalidateQueries({ queryKey: ["invoices"] });
    },
  });

  /* Actions */
  function openPayment(inv: any) {
    setPayInvoice(inv);
    setPayAmount(n(inv.amount_paid));
    setPayOpen(true);
    setTimeout(() => payRef.current?.focus(), 50);
  }

  function savePayment() {
    if (!payInvoice?.id) return;
    const prevPaid = n(payInvoice.amount_paid);
    setPaymentM.mutate({ invoiceId: payInvoice.id, amount: n(payAmount), prevPaid });
  }

  function onMarkPaid(inv: any) {
    if (!confirm("Mark invoice as PAID (pay full gross total)?")) return;
    markPaidM.mutate(inv.id);
  }

  function onVoid(inv: any) {
    if (!confirm("Void this invoice? This cannot be undone.")) return;
    voidM.mutate(inv.id);
  }

  /* =========================
     Render
  ========================= */
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-2xl font-semibold">Invoices</div>
          <div className="text-sm text-muted-foreground">Reprint • Payments • Void</div>
        </div>

        <Button onClick={() => nav("/invoices/create")}>+ New Invoice</Button>
      </div>

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-4">
        <Card className="p-4">
          <b>{kpis.count}</b>
          <div className="text-xs text-muted-foreground">Invoices</div>
        </Card>
        <Card className="p-4">
          <b>{rs(kpis.total)}</b>
          <div className="text-xs text-muted-foreground">Total</div>
        </Card>
        <Card className="p-4">
          <b>{rs(kpis.paid)}</b>
          <div className="text-xs text-muted-foreground">Paid</div>
        </Card>
        <Card className="p-4">
          <b>{rs(kpis.balance)}</b>
          <div className="text-xs text-muted-foreground">Outstanding</div>
        </Card>
      </div>

      {/* Filters */}
      <Card className="p-4 flex flex-wrap gap-3 items-center">
        <Input
          placeholder="Search invoice / customer / code"
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
          className="max-w-[420px]"
        />

        <select
          className="h-10 rounded-md border px-3 bg-background"
          value={status}
          onChange={(e) => setStatus(e.target.value as any)}
        >
          <option value="ALL">All</option>
          <option value="ISSUED">Issued</option>
          <option value="PARTIALLY_PAID">Partially Paid</option>
          <option value="PAID">Paid</option>
          <option value="VOID">Void</option>
        </select>

        <Button variant="outline" onClick={() => invoicesQ.refetch()} disabled={invoicesQ.isFetching}>
          {invoicesQ.isFetching ? "Refreshing..." : "Refresh"}
        </Button>
      </Card>

      {/* Table like screenshot */}
      <Card className="overflow-hidden">
        <div className="overflow-auto">
          <table className="w-full min-w-[980px]">
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
                const custName = r.customer?.name || r.customer_name || `#${r.customer_id}`;
                const custCode = r.customer?.customer_code || r.customer_code || "";
                const invNo = r.invoice_number || `#${r.id}`;

                const dp = n(r.discount_percent);
                const da = n(r.discount_amount);

                return (
                  <tr key={r.id} className="hover:bg-slate-50/60">
                    {/* invoice */}
                    <td className="px-4 py-3">
                      <div className="inline-flex items-center justify-center border rounded-md px-3 py-2 font-semibold text-slate-800 bg-white">
                        {invNo}
                      </div>
                    </td>

                    {/* date */}
                    <td className="px-4 py-3 text-sm text-slate-700">{r.invoice_date || "—"}</td>

                    {/* customer */}
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900">{custName}</div>
                      {custCode ? <div className="text-xs text-slate-500">{custCode}</div> : null}
                    </td>

                    {/* total */}
                    <td className="px-4 py-3 text-sm">
                      <div className="text-slate-500">Rs</div>
                      <div className="text-slate-900">{n(r.total_amount).toFixed(2)}</div>
                    </td>

                    {/* discount */}
                    <td className="px-4 py-3 text-sm">
                      {dp > 0 || da > 0 ? (
                        <div className="text-rose-600 font-semibold leading-tight">
                          <div>- {rs(da || (n(r.total_amount) * dp) / 100)}</div>
                          <div className="text-rose-600/80">({dp ? `${dp}%` : ""})</div>
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>

                    {/* paid */}
                    <td className="px-4 py-3 text-sm">
                      <div className="text-slate-500">Rs</div>
                      <div className="text-slate-900">{n(r.amount_paid).toFixed(2)}</div>
                    </td>

                    {/* balance */}
                    <td className="px-4 py-3 text-sm">
                      <div className="text-slate-500">Rs</div>
                      <div className="text-slate-900">{n(r.balance_remaining).toFixed(2)}</div>
                    </td>

                    {/* status */}
                    <td className="px-4 py-3">
                      <span
                        className={
                          "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold " +
                          statusPillClass(st)
                        }
                      >
                        {st === "PARTIALLY_PAID" ? "Partially Paid" : st === "ISSUED" ? "Issued" : st}
                      </span>
                    </td>

                    {/* 3 dots menu */}
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

                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem onClick={() => nav(`/invoices/${r.id}`)}>
                            <Eye className="mr-2 h-4 w-4" />
                            Open
                          </DropdownMenuItem>

                          <DropdownMenuItem onClick={() => nav(`/invoices/${r.id}/print`)}>
                            <Printer className="mr-2 h-4 w-4" />
                            Print
                          </DropdownMenuItem>

                          {st !== "VOID" ? (
                            <DropdownMenuItem onClick={() => openPayment(r)}>
                              <DollarSign className="mr-2 h-4 w-4" />
                              Payment
                            </DropdownMenuItem>
                          ) : null}

                          {st !== "PAID" && st !== "VOID" ? (
                            <DropdownMenuItem onClick={() => onMarkPaid(r)} disabled={markPaidM.isPending}>
                              <CheckCircle2 className="mr-2 h-4 w-4" />
                              Mark Paid
                            </DropdownMenuItem>
                          ) : null}

                          {isAdmin && st !== "VOID" ? (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => onVoid(r)} disabled={voidM.isPending}>
                                <Ban className="mr-2 h-4 w-4" />
                                Void
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
          <Card className="p-6 w-[360px] space-y-4">
            <div className="font-semibold">Set Payment</div>
            <div className="text-xs text-muted-foreground">
              Enter the <b>total amount paid so far</b> for this invoice.
            </div>

            <Input
              ref={payRef}
              inputMode="decimal"
              value={String(payAmount)}
              onChange={(e) => setPayAmount(n(e.target.value))}
            />

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPayOpen(false)} disabled={setPaymentM.isPending}>
                Cancel
              </Button>
              <Button onClick={savePayment} disabled={setPaymentM.isPending}>
                {setPaymentM.isPending ? "Saving..." : "Save"}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}



