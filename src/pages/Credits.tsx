// src/pages/Credits.tsx
//
// "Credits" — manage customer invoice credits / partial payments.
//
// Shows every customer's REAL total outstanding balance across all of their
// unpaid / partially-paid invoices (all-time, not month-limited), lets staff
// search & filter, drill into a customer's invoices + payment history, and
// record a payment that is auto-allocated oldest-invoice-first across their
// open invoices (with overpayment prevention).

import React, { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import {
  Search,
  Users,
  Wallet,
  CreditCard,
  CircleDollarSign,
  Receipt,
  Eye,
  Plus,
  Loader2,
  FileText,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  listCreditInvoices,
  buildCustomerSummaries,
  previewAllocation,
  applyCustomerPayment,
  getInvoicePaymentHistory,
  getCustomerCreditNotes,
  type CreditCustomerSummary,
  type CreditInvoiceRow,
  type CreditPaymentStatus,
} from "@/lib/credits";

/* =========================
   Helpers
========================= */
const rs = (v: any) =>
  `Rs ${Number(v ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const PAYMENT_METHODS: { value: string; label: string }[] = [
  { value: "CASH", label: "Cash" },
  { value: "BANK_TRANSFER", label: "Bank Transfer" },
  { value: "MCB_JUICE", label: "MCB Juice" },
  { value: "CHEQUE", label: "Cheque" },
  { value: "CARD", label: "Card" },
  { value: "OTHER", label: "Other" },
];

/** Credits page defaults to outstanding balances; fully paid customers can be shown on request. */
type StatusFilter = "ALL" | "UNPAID" | "PARTIALLY_PAID" | "PAID";

function statusBadge(status: CreditPaymentStatus, isOverdue?: boolean) {
  if (status !== "PAID" && isOverdue) {
    return (
      <Badge variant="outline" className="rounded-full bg-red-100 text-red-700 border-red-200">
        Overdue
      </Badge>
    );
  }

  const map: Record<CreditPaymentStatus, string> = {
    PAID: "bg-emerald-100 text-emerald-700 border-emerald-200",
    PARTIALLY_PAID: "bg-amber-100 text-amber-700 border-amber-200",
    UNPAID: "bg-rose-100 text-rose-700 border-rose-200",
  };
  const label: Record<CreditPaymentStatus, string> = {
    PAID: "Paid",
    PARTIALLY_PAID: "Partially Paid",
    UNPAID: "Due",
  };
  return <Badge variant="outline" className={`rounded-full ${map[status]}`}>{label[status]}</Badge>;
}

function fmtDate(v: any) {
  const s = String(v || "").trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s || "—";
}

/* =========================
   Summary card
========================= */
function SummaryCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: any;
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <Card className="p-4 rounded-2xl border shadow-sm">
      <div className="flex items-center gap-3">
        <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${accent}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground truncate">{label}</div>
          <div className="text-lg font-semibold truncate">{value}</div>
        </div>
      </div>
    </Card>
  );
}

/* =========================
   Page
========================= */
export default function Credits() {
  const qc = useQueryClient();
  const nav = useNavigate();

  const [customerQuery, setCustomerQuery] = useState("");
  const [invoiceQuery, setInvoiceQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showFullyPaid, setShowFullyPaid] = useState(false);

  const [detailCustomer, setDetailCustomer] = useState<CreditCustomerSummary | null>(null);
  const [payCustomer, setPayCustomer] = useState<CreditCustomerSummary | null>(null);

  const invoicesQ = useQuery({
    queryKey: ["credit-invoices"],
    queryFn: listCreditInvoices,
    staleTime: 10_000,
  });

  const allInvoices = invoicesQ.data || [];

  /* ---- filter invoices, then build customer summaries ---- */
  const filteredInvoices = useMemo(() => {
    const invQ = invoiceQuery.trim().toLowerCase();
    return allInvoices.filter((inv) => {
      // Credits page defaults to outstanding-only; fully paid invoices can be
      // surfaced on request via the "Show fully paid" toggle.
      if (!showFullyPaid && (inv.pay_status === "PAID" || inv.balance <= 0.009)) return false;
      if (status !== "ALL" && inv.pay_status !== status) return false;
      if (invQ && !inv.invoice_number.toLowerCase().includes(invQ)) return false;
      if (dateFrom && String(inv.invoice_date || "") < dateFrom) return false;
      if (dateTo && String(inv.invoice_date || "") > dateTo) return false;
      return true;
    });
  }, [allInvoices, status, invoiceQuery, dateFrom, dateTo, showFullyPaid]);

  const summaries = useMemo(() => {
    const list = buildCustomerSummaries(filteredInvoices);
    const cq = customerQuery.trim().toLowerCase();
    if (!cq) return list;
    return list.filter(
      (s) =>
        s.customer_name.toLowerCase().includes(cq) ||
        String(s.customer_code || "").toLowerCase().includes(cq) ||
        String(s.customer_phone || "").toLowerCase().includes(cq)
    );
  }, [filteredInvoices, customerQuery]);

  /* ---- summary cards (outstanding-only) ---- */
  const totals = useMemo(() => {
    let customersWithDue = 0;
    let totalDue = 0; // original total of invoices still carrying a balance
    let totalPaid = 0; // total paid across all shown invoices
    let partiallyPaidOutstanding = 0; // remaining balance on partially-paid invoices
    let unpaidInvoices = 0; // count of fully-unpaid invoices
    let outstanding = 0;
    for (const s of summaries) {
      if (s.balance_due > 0.009) customersWithDue += 1;
      outstanding += s.balance_due;
      for (const inv of s.invoices) {
        if (inv.balance > 0.009) totalDue += inv.total;
        totalPaid += inv.paid;
        if (inv.pay_status === "PARTIALLY_PAID") partiallyPaidOutstanding += inv.balance;
        if (inv.pay_status === "UNPAID") unpaidInvoices += 1;
      }
    }
    return { customersWithDue, totalDue, totalPaid, partiallyPaidOutstanding, unpaidInvoices, outstanding };
  }, [summaries]);

  function refresh() {
    qc.invalidateQueries({ queryKey: ["credit-invoices"] });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Credits</h1>
          <p className="text-sm text-muted-foreground">
            Customer credits &amp; partial payments — real outstanding balances across all invoices.
          </p>
        </div>
        <Button
          className="rounded-xl"
          onClick={() => {
            if (!summaries.length) {
              toast.error("No customers with outstanding invoices");
              return;
            }
            setPayCustomer(summaries.find((s) => s.balance_due > 0.009) || summaries[0]);
          }}
        >
          <Plus className="mr-2 h-4 w-4" /> Add Payment
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard
          icon={Users}
          label="Total Customers With Due"
          value={String(totals.customersWithDue)}
          accent="bg-indigo-100 text-indigo-700"
        />
        <SummaryCard
          icon={Receipt}
          label="Total Amount Due"
          value={rs(totals.totalDue)}
          accent="bg-sky-100 text-sky-700"
        />
        <SummaryCard
          icon={CreditCard}
          label="Total Amount Paid"
          value={rs(totals.totalPaid)}
          accent="bg-emerald-100 text-emerald-700"
        />
        <SummaryCard
          icon={CircleDollarSign}
          label="Total Balance Due"
          value={rs(totals.outstanding)}
          accent="bg-rose-100 text-rose-700"
        />
      </div>

      {/* Filters */}
      <Card className="p-4 rounded-2xl border shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9 rounded-xl"
              placeholder="Search customer, phone or code…"
              value={customerQuery}
              onChange={(e) => setCustomerQuery(e.target.value)}
            />
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9 rounded-xl"
              placeholder="Search invoice no.…"
              value={invoiceQuery}
              onChange={(e) => setInvoiceQuery(e.target.value)}
            />
          </div>
          <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
            <SelectTrigger className="rounded-xl">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All statuses</SelectItem>
              <SelectItem value="UNPAID">Due</SelectItem>
              <SelectItem value="PARTIALLY_PAID">Partially Paid</SelectItem>
              {showFullyPaid ? <SelectItem value="PAID">Paid</SelectItem> : null}
            </SelectContent>
          </Select>
          <Input
            type="date"
            className="rounded-xl"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            aria-label="From date"
          />
          <Input
            type="date"
            className="rounded-xl"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            aria-label="To date"
          />
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Switch
            id="show-fully-paid"
            checked={showFullyPaid}
            onCheckedChange={(v) => {
              setShowFullyPaid(v);
              if (!v && status === "PAID") setStatus("ALL");
            }}
          />
          <Label htmlFor="show-fully-paid" className="text-sm text-muted-foreground cursor-pointer">
            Show fully paid customers
          </Label>
        </div>
      </Card>

      {/* Customer list */}
      <Card className="rounded-2xl border shadow-sm overflow-hidden">
        {invoicesQ.isLoading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-xl" />
            ))}
          </div>
        ) : invoicesQ.isError ? (
          <div className="p-10 text-center text-rose-600">
            Failed to load. {(invoicesQ.error as any)?.message || ""}
          </div>
        ) : summaries.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground">
            {allInvoices.length === 0
              ? "No invoices found yet."
              : "No customers match your search or filters."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer Name</TableHead>
                  <TableHead className="text-right">Total Amount Purchased</TableHead>
                  <TableHead className="text-right">Total Amount Paid</TableHead>
                  <TableHead className="text-right">Total Amount Due</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summaries.map((s) => (
                  <TableRow key={s.customer_id} className="hover:bg-muted/40">
                    <TableCell>
                      <div className="font-medium">{s.customer_name}</div>
                      {s.customer_code || s.customer_phone ? (
                        <div className="text-xs text-muted-foreground">
                          {[s.customer_code, s.customer_phone].filter(Boolean).join(" · ")}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right">{rs(s.total_invoiced)}</TableCell>
                    <TableCell className="text-right text-emerald-700">{rs(s.total_paid)}</TableCell>
                    <TableCell className="text-right font-semibold">{rs(s.balance_due)}</TableCell>
                    <TableCell className="text-center">{statusBadge(s.pay_status, s.is_overdue)}</TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-lg"
                          onClick={() => setDetailCustomer(s)}
                        >
                          <Eye className="h-4 w-4 mr-1" /> View
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-lg"
                          onClick={() => nav(`/statement/print?customerId=${s.customer_id}&mode=summary`)}
                        >
                          <FileText className="h-4 w-4 mr-1" /> Report
                        </Button>
                        <Button
                          size="sm"
                          className="rounded-lg"
                          disabled={s.balance_due <= 0.009}
                          onClick={() => setPayCustomer(s)}
                        >
                          <Plus className="h-4 w-4 mr-1" /> Pay
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {/* Customer detail dialog */}
      <CustomerDetailDialog
        summary={detailCustomer}
        onClose={() => setDetailCustomer(null)}
        onPay={(s) => {
          setDetailCustomer(null);
          setPayCustomer(s);
        }}
      />

      {/* Add payment dialog */}
      <AddPaymentDialog
        summary={payCustomer}
        onClose={() => setPayCustomer(null)}
        onDone={() => {
          setPayCustomer(null);
          refresh();
        }}
      />
    </div>
  );
}

/* =========================
   Customer detail dialog
========================= */
function CustomerDetailDialog({
  summary,
  onClose,
  onPay,
}: {
  summary: CreditCustomerSummary | null;
  onClose: () => void;
  onPay: (s: CreditCustomerSummary) => void;
}) {
  const open = !!summary;
  const nav = useNavigate();

  const creditNotesQ = useQuery({
    queryKey: ["credit-customer-notes", summary?.customer_id],
    queryFn: () => getCustomerCreditNotes(summary!.customer_id),
    enabled: open && !!summary?.customer_id,
  });

  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? onClose() : null)}>
      <DialogContent className="max-w-3xl">
        {summary && (
          <>
            <DialogHeader>
              <DialogTitle>{summary.customer_name}</DialogTitle>
              <DialogDescription>
                {summary.customer_code ? `${summary.customer_code} · ` : ""}
                Balance due {rs(summary.balance_due)} across {summary.due_count} invoice(s)
                {summary.total_credit_notes > 0.009 ? ` · Credit notes ${rs(summary.total_credit_notes)}` : ""}
              </DialogDescription>
            </DialogHeader>

            <div className="max-h-[40vh] overflow-y-auto rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.invoices.map((inv) => (
                    <InvoiceDetailRow key={inv.id} inv={inv} />
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Credit notes — internal view only, never shown in the printable report */}
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1">Credit Notes</div>
              <div className="max-h-[20vh] overflow-y-auto rounded-xl border">
                {creditNotesQ.isLoading ? (
                  <div className="p-3 text-xs text-muted-foreground">Loading…</div>
                ) : !creditNotesQ.data || creditNotesQ.data.length === 0 ? (
                  <div className="p-3 text-xs text-muted-foreground">No credit notes issued.</div>
                ) : (
                  <Table>
                    <TableBody>
                      {creditNotesQ.data.map((cn) => (
                        <TableRow key={cn.id}>
                          <TableCell className="text-xs font-medium">{cn.credit_note_number || `#${cn.id}`}</TableCell>
                          <TableCell className="text-xs">{fmtDate(cn.credit_note_date)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{cn.reason || "—"}</TableCell>
                          <TableCell className="text-xs text-right font-medium">{rs(cn.total_amount)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" className="rounded-xl" onClick={onClose}>
                Close
              </Button>
              <Button
                variant="outline"
                className="rounded-xl"
                onClick={() => nav(`/statement/print?customerId=${summary.customer_id}&mode=summary`)}
              >
                <FileText className="h-4 w-4 mr-1" /> Report
              </Button>
              <Button
                className="rounded-xl"
                disabled={summary.balance_due <= 0.009}
                onClick={() => onPay(summary)}
              >
                <Plus className="h-4 w-4 mr-1" /> Add Payment
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function InvoiceDetailRow({ inv }: { inv: CreditInvoiceRow }) {
  const [open, setOpen] = useState(false);
  const historyQ = useQuery({
    queryKey: ["credit-inv-history", inv.id],
    queryFn: () => getInvoicePaymentHistory(inv.id),
    enabled: open,
  });

  return (
    <>
      <TableRow className="cursor-pointer hover:bg-muted/40" onClick={() => setOpen((v) => !v)}>
        <TableCell className="font-medium">{inv.invoice_number}</TableCell>
        <TableCell>{fmtDate(inv.invoice_date)}</TableCell>
        <TableCell className="text-right">{rs(inv.total)}</TableCell>
        <TableCell className="text-right text-emerald-700">{rs(inv.paid)}</TableCell>
        <TableCell className="text-right font-semibold">{rs(inv.balance)}</TableCell>
        <TableCell className="text-center">{statusBadge(inv.pay_status)}</TableCell>
      </TableRow>
      {open && (
        <TableRow>
          <TableCell colSpan={6} className="bg-muted/30">
            <div className="text-xs">
              <div className="font-medium mb-1">Payment history</div>
              {historyQ.isLoading ? (
                <div className="text-muted-foreground">Loading…</div>
              ) : !historyQ.data || historyQ.data.length === 0 ? (
                <div className="text-muted-foreground">No payments recorded yet.</div>
              ) : (
                <ul className="space-y-1">
                  {historyQ.data.map((p: any) => (
                    <li key={p.id} className="flex justify-between gap-4">
                      <span>
                        {fmtDate(p.payment_date)} · {String(p.method || "").replace(/_/g, " ")}
                        {p.reference ? ` · ${p.reference}` : ""}
                      </span>
                      <span className="font-medium">{rs(p.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

/* =========================
   Add payment dialog
========================= */
function AddPaymentDialog({
  summary,
  onClose,
  onDone,
}: {
  summary: CreditCustomerSummary | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const open = !!summary;
  const today = new Date().toISOString().slice(0, 10);

  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("CASH");
  const [remarks, setRemarks] = useState("");

  // Reset the form whenever a new customer is opened.
  React.useEffect(() => {
    if (summary) {
      setAmount("");
      setMethod("CASH");
      setRemarks("");
    }
  }, [summary?.customer_id]);

  const openInvoices = useMemo(
    () => (summary ? summary.invoices.filter((i) => i.balance > 0.009) : []),
    [summary]
  );

  const amountNum = Number(amount || 0);

  // Always auto-allocate oldest-invoice-first — the page's core value prop and
  // simplest, safest default for a fast Amount / Mode / Remarks payment form.
  const targetDue = useMemo(
    () => Math.round(openInvoices.reduce((s, i) => s + i.balance, 0) * 100) / 100,
    [openInvoices]
  );

  const preview = useMemo(
    () => previewAllocation(openInvoices, amountNum),
    [openInvoices, amountNum]
  );

  const overpay = amountNum > targetDue + 0.009;

  const qc = useQueryClient();
  const payMut = useMutation({
    mutationFn: () =>
      applyCustomerPayment({
        customerId: summary!.customer_id,
        amount: amountNum,
        paymentDate: today,
        method,
        reference: null,
        note: remarks || null,
        autoAllocate: true,
      }),
    onSuccess: (lines) => {
      toast.success(
        `Payment applied across ${lines.length} invoice(s): ${rs(
          lines.reduce((s, l) => s + l.applied, 0)
        )}`
      );
      qc.invalidateQueries({ queryKey: ["credit-inv-history"] });
      qc.invalidateQueries({ queryKey: ["credit-customer-notes"] });
      onDone();
    },
    onError: (e: any) => toast.error(e?.message || "Failed to apply payment"),
  });

  function submit() {
    if (!summary) return;
    if (amountNum <= 0) return toast.error("Enter a payment amount greater than 0");
    if (overpay) return toast.error("Amount exceeds the outstanding balance (overpayment blocked)");
    payMut.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? onClose() : null)}>
      <DialogContent className="max-w-lg">
        {summary && (
          <>
            <DialogHeader>
              <DialogTitle>Add Payment — {summary.customer_name}</DialogTitle>
              <DialogDescription>
                Outstanding balance {rs(summary.balance_due)} · {openInvoices.length} open invoice(s)
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div>
                <Label className="text-xs">Amount</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  className="rounded-xl"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  autoFocus
                />
              </div>

              <div>
                <Label className="text-xs">Mode of Payment</Label>
                <Select value={method} onValueChange={setMethod}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder="Select mode" />
                  </SelectTrigger>
                  <SelectContent className="z-[100]" position="popper">
                    {PAYMENT_METHODS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs">Remarks (optional)</Label>
                <Input
                  className="rounded-xl"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="e.g. transaction reference, note"
                />
              </div>

              {/* Allocation preview */}
              <div className="rounded-xl border bg-muted/30 p-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Selected due</span>
                  <span className="font-medium">{rs(targetDue)}</span>
                </div>
                {amountNum > 0 && (
                  <>
                    <div className="mt-2 space-y-1">
                      {preview.lines.map((l) => (
                        <div key={l.invoice_id} className="flex justify-between text-xs">
                          <span>{l.invoice_number}</span>
                          <span>
                            {rs(l.applied)}{" "}
                            <span className="text-muted-foreground">
                              (→ {rs(l.balance_after)})
                            </span>
                          </span>
                        </div>
                      ))}
                    </div>
                    {overpay ? (
                      <div className="mt-2 text-xs text-rose-600 font-medium">
                        Amount exceeds outstanding balance — overpayment is blocked.
                      </div>
                    ) : preview.unallocated > 0.009 ? (
                      <div className="mt-2 text-xs text-amber-600">
                        Unallocated: {rs(preview.unallocated)}
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" className="rounded-xl" onClick={onClose} disabled={payMut.isPending}>
                Cancel
              </Button>
              <Button className="rounded-xl" onClick={submit} disabled={payMut.isPending || overpay}>
                {payMut.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" /> Applying…
                  </>
                ) : (
                  <>Apply Payment</>
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
