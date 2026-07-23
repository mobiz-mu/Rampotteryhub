// src/pages/StatementPrint.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { usePrintBackNav } from "@/lib/printNav";

function n(v: any) {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}
function round2(v: any) {
  return Math.round((n(v) + Number.EPSILON) * 100) / 100;
}
function money(v: any) {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n(v));
}
function fmtDateISO(v: any) {
  const s = String(v || "").trim();
  if (!s) return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toISOString().slice(0, 10);
}
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function pad2(x: number) {
  return String(x).padStart(2, "0");
}
function isoDate(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
/** First/last day of the given month (1-12). */
function monthRange(year: number, month1to12: number) {
  const from = new Date(year, month1to12 - 1, 1);
  const to = new Date(year, month1to12, 0);
  return { from: isoDate(from), to: isoDate(to) };
}
function yearRange(year: number) {
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}
function currentMonthRange() {
  const now = new Date();
  return monthRange(now.getFullYear(), now.getMonth() + 1);
}

// ✅ due = balance if available, otherwise total - paid - credits
function computeDue(inv: any) {
  const due =
    inv?.balance_due != null
      ? n(inv.balance_due)
      : inv?.balance_remaining != null
      ? n(inv.balance_remaining)
      : n(inv?.total_amount) - n(inv?.amount_paid) - n(inv?.credits_applied);

  return Math.max(0, due);
}

export default function StatementPrint() {
  const nav = useNavigate();
  const goBack = usePrintBackNav("/credits");
  const [params, setParams] = useSearchParams();

  const customerId = Number(params.get("customerId") || 0);
  const mode = (params.get("mode") || "ledger").trim().toLowerCase();
  const isSummaryMode = mode === "summary";

  const from = (params.get("from") || "").trim();
  const to = (params.get("to") || "").trim();

  // Ledger mode (Customers/Aging "Statement" links): default = all-time, unchanged from before.
  // Summary mode (Credits page "Report"): default = current month when no range is given.
  const defaultSummaryRange = useMemo(() => (isSummaryMode ? currentMonthRange() : null), [isSummaryMode]);
  const rangeFrom = from || defaultSummaryRange?.from || "1900-01-01";
  const rangeTo = to || defaultSummaryRange?.to || todayISO();

  const custQ = useQuery({
    queryKey: ["statement_customer", customerId],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("*").eq("id", customerId).maybeSingle();
      if (error) throw error;
      return data as any;
    },
    enabled: customerId > 0,
    staleTime: 20_000,
  });

  // ✅ include total + paid + due fields (also gross_total/total_incl_vat so the
  // "purchased" figure agrees with how the Credits page totals the same invoices)
  const invQ = useQuery({
    queryKey: ["statement_invoices", customerId, rangeFrom, rangeTo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select(
          "id,invoice_number,invoice_date,total_amount,gross_total,total_incl_vat,amount_paid,credits_applied,balance_remaining,balance_due,status"
        )
        .eq("customer_id", customerId)
        .not("status", "in", '("VOID")') // keep DRAFT visible if you want, but it will affect totals
        .gte("invoice_date", rangeFrom)
        .lte("invoice_date", rangeTo)
        .order("invoice_date", { ascending: true })
        .order("id", { ascending: true });

      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !isSummaryMode && customerId > 0,
    staleTime: 20_000,
  });

  const customer: any = custQ.data;
  const invoices: any[] = invQ.data || [];
  const invoiceIds = useMemo(() => invoices.map((r) => Number(r.id)), [invoices]);

  // ✅ payments breakdown (ledger mode) — payments tied to the invoices displayed above
  const paymentsQ = useQuery({
    queryKey: ["statement_payments", customerId, invoiceIds.join(",")],
    queryFn: async () => {
      if (!invoiceIds.length) return [];
      const { data, error } = await supabase
        .from("invoice_payments")
        .select("id,invoice_id,payment_date,amount,method,reference,notes")
        .in("invoice_id", invoiceIds)
        .order("payment_date", { ascending: true })
        .order("created_at", { ascending: true });

      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !isSummaryMode && invoiceIds.length > 0,
    staleTime: 20_000,
  });

  const payments: any[] = paymentsQ.data || [];
  const invoiceNoById = useMemo(() => {
    const m = new Map<number, string>();
    invoices.forEach((r) => m.set(Number(r.id), String(r.invoice_number || "")));
    return m;
  }, [invoices]);

  /* =========================================================
     Summary mode ("CUSTOMER CREDIT STATEMENT") — read-only aggregation only.
     None of these queries write to invoices / credit_notes / invoice_payments;
     the DB-authoritative balance columns are never recomputed or overwritten.
  ========================================================= */

  // Every real (non-DRAFT, non-VOID) invoice id for this customer, regardless of
  // date — a payment can be dated inside the selected range even if the invoice
  // it pays was issued earlier, so "payments in range" must not be limited to
  // in-range invoices. Excludes DRAFT to match src/lib/credits.ts's convention
  // (the Credits page never counts draft/unissued invoices as real balance).
  const allInvoiceIdsQ = useQuery({
    queryKey: ["statement_all_invoice_ids", customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id")
        .eq("customer_id", customerId)
        .not("status", "in", "(DRAFT,VOID)");
      if (error) throw error;
      return (data || []).map((r: any) => Number(r.id));
    },
    enabled: isSummaryMode && customerId > 0,
    staleTime: 20_000,
  });

  // "Total Amount Purchased" for summary mode must also exclude DRAFT invoices
  // (the shared `invQ` above only excludes VOID, by design, so ledger mode can
  // still show drafts — summary mode needs its own correctly-scoped query to
  // match src/lib/credits.ts's DRAFT+VOID exclusion and reconcile with the
  // Credits page's own totals for the same customer).
  const summaryInvoicesQ = useQuery({
    queryKey: ["statement_summary_invoices", customerId, rangeFrom, rangeTo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id,gross_total,total_amount,total_incl_vat,invoice_date,status")
        .eq("customer_id", customerId)
        .not("status", "in", "(DRAFT,VOID)")
        .gte("invoice_date", rangeFrom)
        .lte("invoice_date", rangeTo);
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: isSummaryMode && customerId > 0,
    staleTime: 20_000,
  });

  const summaryPaymentsQ = useQuery({
    queryKey: ["statement_summary_payments", customerId, (allInvoiceIdsQ.data || []).join(","), rangeFrom, rangeTo],
    queryFn: async () => {
      const ids = allInvoiceIdsQ.data || [];
      if (!ids.length) return [];
      const { data, error } = await supabase
        .from("invoice_payments")
        .select("id,amount,payment_date")
        .in("invoice_id", ids)
        .gte("payment_date", rangeFrom)
        .lte("payment_date", rangeTo);
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: isSummaryMode && !!allInvoiceIdsQ.data,
    staleTime: 20_000,
  });

  // Credit notes issued to this customer within the selected range (deduction only —
  // never rendered as individual rows/numbers in the printable summary report).
  const summaryCreditNotesQ = useQuery({
    queryKey: ["statement_summary_credit_notes", customerId, rangeFrom, rangeTo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credit_notes")
        .select("id,total_amount,credit_note_date,status")
        .eq("customer_id", customerId)
        .eq("status", "ISSUED")
        .gte("credit_note_date", rangeFrom)
        .lte("credit_note_date", rangeTo);
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: isSummaryMode && customerId > 0,
    staleTime: 20_000,
  });

  const summaryTotals = useMemo(() => {
    const purchased = round2(
      (summaryInvoicesQ.data || []).reduce((s, r: any) => s + n(r.gross_total ?? r.total_amount ?? r.total_incl_vat), 0)
    );
    const creditNotes = round2((summaryCreditNotesQ.data || []).reduce((s, r: any) => s + n(r.total_amount), 0));
    const paid = round2((summaryPaymentsQ.data || []).reduce((s, r: any) => s + n(r.amount), 0));
    const balanceDue = round2(purchased - creditNotes - paid);
    return { purchased, creditNotes, paid, balanceDue };
  }, [summaryInvoicesQ.data, summaryCreditNotesQ.data, summaryPaymentsQ.data]);

  const summaryStatus: "PAID" | "PARTIALLY_PAID" | "DUE" = useMemo(() => {
    if (summaryTotals.balanceDue <= 0.009) return "PAID";
    if (summaryTotals.paid > 0.009 || summaryTotals.creditNotes > 0.009) return "PARTIALLY_PAID";
    return "DUE";
  }, [summaryTotals]);

  const customerName = useMemo(() => {
    if (!customer) return "Customer";
    const a = String(customer?.client_name || "").trim();
    const b = String(customer?.name || "").trim();
    return a || b || "Customer";
  }, [customer]);

  const rows = useMemo(() => {
    return invoices.map((r, idx) => {
      const total = n(r.total_amount);
      const paid = n(r.amount_paid);
      const due = computeDue(r); // or Math.max(0, total - paid)
      return {
        sn: idx + 1,
        id: Number(r.id),
        invoice_number: String(r.invoice_number ?? ""),
        invoice_date: fmtDateISO(r.invoice_date),
        status: String(r.status || ""),
        total,
        paid,
        due,
      };
    });
  }, [invoices]);

  // ✅ TOTALS
  // totalBalance = totalAmount - totalPaid  (same as sum(due) if due computed as balance)
  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        acc.totalAmount += n(r.total);
        acc.totalPaid += n(r.paid);
        acc.totalDue += n(r.due);
        return acc;
      },
      { totalAmount: 0, totalPaid: 0, totalDue: 0 }
    );
  }, [rows]);

  const openingBalance = n(customer?.opening_balance);
  const closingBalance = openingBalance + totals.totalAmount - totals.totalPaid;

  const summaryLoading =
    custQ.isLoading ||
    summaryInvoicesQ.isLoading ||
    allInvoiceIdsQ.isLoading ||
    summaryPaymentsQ.isLoading ||
    summaryCreditNotesQ.isLoading;
  const ledgerLoading = custQ.isLoading || invQ.isLoading || paymentsQ.isLoading;
  const isLoading = isSummaryMode ? summaryLoading : ledgerLoading;

  const autoPrint = params.get("autoprint") === "1";
  useEffect(() => {
    if (!autoPrint) return;
    if (isLoading) return;
    if (!customer) return;
    const t = window.setTimeout(() => window.print(), 250);
    return () => window.clearTimeout(t);
  }, [autoPrint, isLoading, customer?.id]);

  /* ---- date-range control (summary mode only) ---- */
  type RangeMode = "month" | "year" | "custom";
  const initialRangeMode: RangeMode = useMemo(() => {
    if (!from && !to) return "month";
    const monthGuess = monthRange(Number(from.slice(0, 4)), Number(from.slice(5, 7)));
    if (from === monthGuess.from && to === monthGuess.to) return "month";
    const yearGuess = yearRange(Number(from.slice(0, 4)));
    if (from === yearGuess.from && to === yearGuess.to) return "year";
    return "custom";
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [rangeMode, setRangeMode] = useState<RangeMode>(initialRangeMode);
  const [monthPick, setMonthPick] = useState(() => rangeFrom.slice(0, 7));
  const [yearPick, setYearPick] = useState(() => rangeFrom.slice(0, 4));
  const [fromPick, setFromPick] = useState(rangeFrom);
  const [toPick, setToPick] = useState(rangeTo);

  function applyRange(nextFrom: string, nextTo: string) {
    const next = new URLSearchParams(params);
    next.set("from", nextFrom);
    next.set("to", nextTo);
    setParams(next, { replace: true });
  }

  function onRangeModeChange(m: RangeMode) {
    setRangeMode(m);
    if (m === "month") {
      const r = monthRange(Number(monthPick.slice(0, 4)) || new Date().getFullYear(), Number(monthPick.slice(5, 7)) || new Date().getMonth() + 1);
      applyRange(r.from, r.to);
    } else if (m === "year") {
      const r = yearRange(Number(yearPick) || new Date().getFullYear());
      applyRange(r.from, r.to);
    } else {
      applyRange(fromPick, toPick);
    }
  }

  const shareUrl = useMemo(() => {
    const base = window.location.origin + window.location.pathname;
    const sp = new URLSearchParams();
    sp.set("customerId", String(customerId));
    if (from) sp.set("from", from);
    if (to) sp.set("to", to);
    return `${base}?${sp.toString()}`;
  }, [customerId, from, to]);

  function openWhatsApp() {
    const title = isSummaryMode ? "Customer Credit Statement" : "Statement of Account";
    const totalLine = isSummaryMode
      ? `Total Amount Purchased: Rs ${money(summaryTotals.purchased)}\n` +
        `Total Credit Notes / Deductions: Rs ${money(summaryTotals.creditNotes)}\n` +
        `Total Amount Paid: Rs ${money(summaryTotals.paid)}\n` +
        `Total Amount Due: Rs ${money(summaryTotals.balanceDue)}\n\n`
      : `Total Amount: Rs ${money(totals.totalAmount)}\n` +
        `Amount Paid: Rs ${money(totals.totalPaid)}\n` +
        `Balance Due: Rs ${money(totals.totalAmount - totals.totalPaid)}\n\n`;
    const msg =
      `Ram Pottery Ltd — ${title}\n` +
      `Customer: ${customerName}\n` +
      `Period: ${rangeFrom} → ${rangeTo}\n\n` +
      totalLine +
      `Please find the statement attached (PDF). You can also view it here:\n${shareUrl}`;

    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank", "noopener,noreferrer");
  }

  function openEmail() {
    const title = isSummaryMode ? "Customer Credit Statement" : "Statement of Account";
    const totalLine = isSummaryMode
      ? `Total Amount Purchased: Rs ${money(summaryTotals.purchased)}\n` +
        `Total Credit Notes / Deductions: Rs ${money(summaryTotals.creditNotes)}\n` +
        `Total Amount Paid: Rs ${money(summaryTotals.paid)}\n` +
        `Total Amount Due: Rs ${money(summaryTotals.balanceDue)}\n\n`
      : `Total Amount: Rs ${money(totals.totalAmount)}\n` +
        `Amount Paid: Rs ${money(totals.totalPaid)}\n` +
        `Balance Due: Rs ${money(totals.totalAmount - totals.totalPaid)}\n\n`;
    const subject = `${title} — ${customerName} (${rangeFrom} to ${rangeTo})`;
    const body =
      `Dear ${customerName},\n\n` +
      `Please find attached the ${title} for the period ${rangeFrom} to ${rangeTo}.\n\n` +
      totalLine +
      `You can also view it here:\n${shareUrl}\n\n` +
      `Regards,\nRam Pottery Ltd`;
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  function copyLink() {
    navigator.clipboard?.writeText(shareUrl);
  }

  if (customerId <= 0) return <div className="p-6 text-sm text-muted-foreground">Invalid customer.</div>;
  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading statement…</div>;
  if (!customer) return <div className="p-6 text-sm text-destructive">Customer not found.</div>;

  const balanceTotal = totals.totalAmount - totals.totalPaid; // ✅ what you asked for (ledger mode)

  if (isSummaryMode) {
    const statusLabel = summaryStatus === "PAID" ? "Paid" : summaryStatus === "PARTIALLY_PAID" ? "Partially Paid" : "Due";
    const statusColor =
      summaryStatus === "PAID"
        ? "bg-emerald-100 text-emerald-700 border-emerald-200"
        : summaryStatus === "PARTIALLY_PAID"
        ? "bg-amber-100 text-amber-700 border-amber-200"
        : "bg-rose-100 text-rose-700 border-rose-200";

    return (
      <div className="p-4 print-shell statement-summary-mode">
        {/* Toolbar (no print) */}
        <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-muted-foreground">
            Customer Credit Statement • <span className="font-semibold text-foreground">{customerName}</span>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={goBack}>
              Back
            </Button>
            <Button variant="outline" onClick={copyLink}>
              Copy Link
            </Button>
            <Button variant="outline" onClick={openEmail}>
              Email
            </Button>
            <Button variant="outline" onClick={openWhatsApp}>
              WhatsApp
            </Button>
            <Button onClick={() => window.print()}>Save PDF / Print</Button>
          </div>
        </div>

        {/* Date range filter (no print) */}
        <div className="no-print mb-4 flex flex-wrap items-end gap-3 rounded-xl border bg-card p-3">
          <div className="flex gap-1 rounded-lg border p-1">
            {(["month", "year", "custom"] as RangeMode[]).map((m) => (
              <Button
                key={m}
                size="sm"
                variant={rangeMode === m ? "default" : "ghost"}
                className="rounded-md capitalize"
                onClick={() => onRangeModeChange(m)}
              >
                {m === "month" ? "Monthly" : m === "year" ? "Yearly" : "Custom"}
              </Button>
            ))}
          </div>

          {rangeMode === "month" ? (
            <div>
              <Label className="text-xs">Month</Label>
              <Input
                type="month"
                className="rounded-lg"
                value={monthPick}
                onChange={(e) => {
                  const v = e.target.value;
                  setMonthPick(v);
                  const r = monthRange(Number(v.slice(0, 4)), Number(v.slice(5, 7)));
                  applyRange(r.from, r.to);
                }}
              />
            </div>
          ) : rangeMode === "year" ? (
            <div>
              <Label className="text-xs">Year</Label>
              <Input
                type="number"
                className="rounded-lg w-28"
                value={yearPick}
                onChange={(e) => {
                  const v = e.target.value;
                  setYearPick(v);
                  const y = Number(v);
                  if (Number.isFinite(y) && String(y).length === 4) {
                    const r = yearRange(y);
                    applyRange(r.from, r.to);
                  }
                }}
              />
            </div>
          ) : (
            <>
              <div>
                <Label className="text-xs">From</Label>
                <Input
                  type="date"
                  className="rounded-lg"
                  value={fromPick}
                  onChange={(e) => {
                    setFromPick(e.target.value);
                    applyRange(e.target.value, toPick);
                  }}
                />
              </div>
              <div>
                <Label className="text-xs">To</Label>
                <Input
                  type="date"
                  className="rounded-lg"
                  value={toPick}
                  onChange={(e) => {
                    setToPick(e.target.value);
                    applyRange(fromPick, e.target.value);
                  }}
                />
              </div>
            </>
          )}
        </div>

        {/* Print Area — summary only, landscape */}
        <div className="print-area">
          <div
            style={{
              border: "1px solid rgba(0,0,0,.12)",
              borderRadius: 14,
              padding: 24,
              background: "#fff",
            }}
          >
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start" }}>
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <img src="/logo.png" alt="" style={{ height: 48, width: "auto", objectFit: "contain" }} />
                <div>
                  <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: ".02em" }}>CUSTOMER CREDIT STATEMENT</div>
                  <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>
                    Generated: {todayISO()} • Period: {rangeFrom} → {rangeTo}
                  </div>
                </div>
              </div>
              <div style={{ textAlign: "right", fontSize: 12 }}>
                <div style={{ fontWeight: 900 }}>RAM POTTERY LTD</div>
                <div style={{ opacity: 0.85 }}>Mauritius</div>
                <div style={{ opacity: 0.85 }}>BRN: C17144377 · VAT: 27490894</div>
              </div>
            </div>

            {/* Customer */}
            <div
              style={{
                marginTop: 20,
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 16,
              }}
            >
              <div style={{ border: "1px solid rgba(0,0,0,.10)", borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: 11, letterSpacing: ".10em", textTransform: "uppercase", opacity: 0.7 }}>
                  Customer
                </div>
                <div style={{ marginTop: 8, fontSize: 15, fontWeight: 800 }}>{customerName}</div>
                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>{customer.address || "—"}</div>
                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>
                  {customer.phone || customer.whatsapp ? `Tel: ${customer.phone || customer.whatsapp}` : "—"}
                </div>
                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>
                  {customer.customer_code ? `Code: ${customer.customer_code}` : ""}
                  {customer.customer_code && customer.brn ? " • " : ""}
                  {customer.brn ? `BRN: ${customer.brn}` : ""}
                </div>
              </div>

              <div style={{ border: "1px solid rgba(0,0,0,.10)", borderRadius: 12, padding: 16, textAlign: "center" }}>
                <div style={{ fontSize: 11, letterSpacing: ".10em", textTransform: "uppercase", opacity: 0.7 }}>
                  Status
                </div>
                <div style={{ marginTop: 10 }}>
                  <Badge variant="outline" className={`rounded-full text-sm px-4 py-1 ${statusColor}`}>
                    {statusLabel}
                  </Badge>
                </div>
                <div style={{ marginTop: 14, fontSize: 11, opacity: 0.7 }}>Balance Due</div>
                <div style={{ fontSize: 24, fontWeight: 900 }}>Rs {money(summaryTotals.balanceDue)}</div>
              </div>
            </div>

            {/* Summary figures */}
            <div
              style={{
                marginTop: 20,
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 14,
              }}
            >
              {[
                { label: "Total Amount Purchased", value: summaryTotals.purchased },
                { label: "Total Credit Notes / Deductions", value: summaryTotals.creditNotes },
                { label: "Total Amount Paid", value: summaryTotals.paid },
                { label: "Total Amount Due", value: summaryTotals.balanceDue },
              ].map((c) => (
                <div key={c.label} style={{ border: "1px solid rgba(0,0,0,.10)", borderRadius: 12, padding: 16 }}>
                  <div style={{ fontSize: 11, letterSpacing: ".06em", textTransform: "uppercase", opacity: 0.7 }}>
                    {c.label}
                  </div>
                  <div style={{ marginTop: 8, fontSize: 20, fontWeight: 900 }}>Rs {money(c.value)}</div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 14, fontSize: 11, opacity: 0.7 }}>
              Formula: Balance Due = Total Amount Purchased − Total Credit Notes / Deductions − Total Amount Paid.
              Credit notes are shown as a deduction total only.
            </div>

            {/* Footer / signature area */}
            <div
              style={{
                marginTop: 32,
                paddingTop: 16,
                borderTop: "1px solid rgba(0,0,0,.10)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-end",
                gap: 14,
              }}
            >
              <div style={{ fontSize: 11, opacity: 0.75, maxWidth: "60%" }}>
                This statement is generated from system records. Please contact Ram Pottery Ltd for clarifications.
              </div>
              <div style={{ textAlign: "center", fontSize: 11 }}>
                <div style={{ width: 200, borderTop: "1px solid rgba(0,0,0,.4)", paddingTop: 4 }}>
                  Authorized Signature
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Print CSS — landscape, scoped to THIS page only, and re-reveals .print-area
            (invoice.css declares an app-wide `body * { visibility:hidden }` in @media
            print that would otherwise blank this page — same bug + same fix pattern
            already used by dotMatrixPrint.css for `.dm-print-root`). */}
        <style>
          {`
            .print-area, .print-area * { visibility: visible !important; }
            @media print {
              .no-print { display:none !important; }
              .print-shell { padding:0 !important; }
              .print-area { margin:0 !important; }
              @page { size: landscape; margin: 12mm; }
            }
          `}
        </style>
      </div>
    );
  }

  return (
    <div className="p-4 print-shell">
      {/* Toolbar (no print) */}
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-muted-foreground">
          Statement • <span className="font-semibold text-foreground">{customerName}</span> • {rangeFrom} → {rangeTo}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={goBack}>
            Back
          </Button>
          <Button variant="outline" onClick={copyLink}>
            Copy Link
          </Button>
          <Button variant="outline" onClick={openEmail}>
            Email
          </Button>
          <Button variant="outline" onClick={openWhatsApp}>
            WhatsApp
          </Button>
          <Button onClick={() => window.print()}>Save PDF / Print</Button>
        </div>
      </div>

      {/* Print Area */}
      <div className="print-area">
        <div
          style={{
            border: "1px solid rgba(0,0,0,.12)",
            borderRadius: 14,
            padding: 18,
            background: "#fff",
          }}
        >
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start" }}>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <img
                src="/logo.png"
                alt=""
                style={{ height: 44, width: "auto", objectFit: "contain" }}
              />
              <div>
                <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: ".02em" }}>STATEMENT OF ACCOUNT</div>
                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>
                  Generated: {todayISO()} • Period: {rangeFrom} → {rangeTo}
                </div>
              </div>
            </div>
            <div style={{ textAlign: "right", fontSize: 12 }}>
              <div style={{ fontWeight: 900 }}>RAM POTTERY LTD</div>
              <div style={{ opacity: 0.85 }}>Mauritius</div>
              <div style={{ opacity: 0.85 }}>BRN: C17144377 · VAT: 27490894</div>
            </div>
          </div>

          {/* Customer + Summary */}
<div
  style={{
    marginTop: 14,
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
  }}
>
  <div
    style={{
      border: "1px solid rgba(0,0,0,.10)",
      borderRadius: 12,
      padding: 12,
    }}
  >
    <div
      style={{
        fontSize: 11,
        letterSpacing: ".10em",
        textTransform: "uppercase",
        opacity: 0.7,
      }}
    >
      Customer
    </div>

    <div style={{ marginTop: 8, fontSize: 13, fontWeight: 800 }}>
      {customerName}
    </div>

    <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>
      {customer.address || "—"}
    </div>

    <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>
      {customer.phone || customer.whatsapp
        ? `Tel: ${customer.phone || ""}${
            customer.phone && customer.whatsapp && customer.phone !== customer.whatsapp ? " / " : ""
          }${
            customer.whatsapp && customer.whatsapp !== customer.phone ? customer.whatsapp : !customer.phone ? customer.whatsapp : ""
          }`
        : "—"}
    </div>

    <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>
      {customer.brn ? `BRN: ${customer.brn}` : ""}
      {customer.brn && customer.vat_no ? " • " : ""}
      {customer.vat_no ? `VAT: ${customer.vat_no}` : !customer.brn ? "—" : ""}
    </div>
  </div>

            <div style={{ border: "1px solid rgba(0,0,0,.10)", borderRadius: 12, padding: 12 }}>
              <div style={{ fontSize: 11, letterSpacing: ".10em", textTransform: "uppercase", opacity: 0.7 }}>Summary</div>

              <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span>Opening Balance (brought forward)</span>
                <b>Rs {money(openingBalance)}</b>
              </div>

              <div style={{ marginTop: 6, display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span>Invoiced This Period</span>
                <b>Rs {money(totals.totalAmount)}</b>
              </div>

              <div style={{ marginTop: 6, display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span>Amount Paid</span>
                <b>Rs {money(totals.totalPaid)}</b>
              </div>

              <div style={{ marginTop: 8, height: 1, background: "rgba(0,0,0,.10)" }} />

              <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span style={{ fontWeight: 800 }}>Balance Due (Total − Paid)</span>
                <b style={{ fontSize: 13 }}>Rs {money(balanceTotal)}</b>
              </div>

              <div style={{ marginTop: 6, display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span style={{ fontWeight: 900 }}>Closing Balance</span>
                <b>Rs {money(closingBalance)}</b>
              </div>

              <div style={{ marginTop: 6, fontSize: 11, opacity: 0.75 }}>This report shows invoices (excluding VOID).</div>
            </div>
          </div>

          {/* Table */}
          <div style={{ marginTop: 14 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "rgba(0,0,0,.04)" }}>
                  <th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid rgba(0,0,0,.10)" }}>SN</th>
                  <th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid rgba(0,0,0,.10)" }}>DATE</th>
                  <th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid rgba(0,0,0,.10)" }}>CUSTOMER</th>
                  <th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid rgba(0,0,0,.10)" }}>INVOICE NO</th>
                  <th style={{ textAlign: "right", padding: "10px 8px", borderBottom: "1px solid rgba(0,0,0,.10)" }}>TOTAL</th>
                  <th style={{ textAlign: "right", padding: "10px 8px", borderBottom: "1px solid rgba(0,0,0,.10)" }}>PAID</th>
                  <th style={{ textAlign: "right", padding: "10px 8px", borderBottom: "1px solid rgba(0,0,0,.10)" }}>DUE</th>
                </tr>
              </thead>

              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: "12px 8px", opacity: 0.75 }}>
                      No invoices found for this customer in the selected period.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.id}>
                      <td style={{ padding: "10px 8px", borderBottom: "1px solid rgba(0,0,0,.06)", fontWeight: 800 }}>{r.sn}</td>
                      <td style={{ padding: "10px 8px", borderBottom: "1px solid rgba(0,0,0,.06)" }}>{r.invoice_date}</td>
                      <td style={{ padding: "10px 8px", borderBottom: "1px solid rgba(0,0,0,.06)" }}>{customerName}</td>
                      <td style={{ padding: "10px 8px", borderBottom: "1px solid rgba(0,0,0,.06)", fontWeight: 700 }}>
                        {r.invoice_number}
                        {r.status ? <div style={{ fontSize: 11, opacity: 0.65 }}>{r.status}</div> : null}
                      </td>
                      <td style={{ padding: "10px 8px", borderBottom: "1px solid rgba(0,0,0,.06)", textAlign: "right", fontWeight: 900 }}>
                        Rs {money(r.total)}
                      </td>
                      <td style={{ padding: "10px 8px", borderBottom: "1px solid rgba(0,0,0,.06)", textAlign: "right", fontWeight: 900 }}>
                        Rs {money(r.paid)}
                      </td>
                      <td style={{ padding: "10px 8px", borderBottom: "1px solid rgba(0,0,0,.06)", textAlign: "right", fontWeight: 900 }}>
                        Rs {money(r.due)}
                      </td>
                    </tr>
                  ))
                )}

                {/* Total row */}
                {rows.length > 0 ? (
                  <tr>
                    <td colSpan={4} style={{ padding: "10px 8px", textAlign: "right", fontWeight: 900 }}>
                      TOTAL
                    </td>
                    <td style={{ padding: "10px 8px", textAlign: "right", fontWeight: 900 }}>
                      Rs {money(totals.totalAmount)}
                    </td>
                    <td style={{ padding: "10px 8px", textAlign: "right", fontWeight: 900 }}>
                      Rs {money(totals.totalPaid)}
                    </td>
                    <td style={{ padding: "10px 8px", textAlign: "right", fontWeight: 900 }}>
                      Rs {money(balanceTotal)}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          {/* Payments breakdown */}
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 11, letterSpacing: ".10em", textTransform: "uppercase", opacity: 0.7, marginBottom: 8 }}>
              Payments Received
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "rgba(0,0,0,.04)" }}>
                  <th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid rgba(0,0,0,.10)" }}>DATE</th>
                  <th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid rgba(0,0,0,.10)" }}>INVOICE NO</th>
                  <th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid rgba(0,0,0,.10)" }}>METHOD</th>
                  <th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid rgba(0,0,0,.10)" }}>REFERENCE</th>
                  <th style={{ textAlign: "right", padding: "10px 8px", borderBottom: "1px solid rgba(0,0,0,.10)" }}>AMOUNT</th>
                </tr>
              </thead>
              <tbody>
                {payments.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: "12px 8px", opacity: 0.75 }}>
                      No payments recorded for this period.
                    </td>
                  </tr>
                ) : (
                  payments.map((p) => (
                    <tr key={p.id}>
                      <td style={{ padding: "10px 8px", borderBottom: "1px solid rgba(0,0,0,.06)" }}>
                        {fmtDateISO(p.payment_date)}
                      </td>
                      <td style={{ padding: "10px 8px", borderBottom: "1px solid rgba(0,0,0,.06)", fontWeight: 700 }}>
                        {invoiceNoById.get(Number(p.invoice_id)) || `#${p.invoice_id}`}
                      </td>
                      <td style={{ padding: "10px 8px", borderBottom: "1px solid rgba(0,0,0,.06)" }}>
                        {String(p.method || "").replace(/_/g, " ") || "—"}
                      </td>
                      <td style={{ padding: "10px 8px", borderBottom: "1px solid rgba(0,0,0,.06)" }}>
                        {p.reference || "—"}
                      </td>
                      <td style={{ padding: "10px 8px", borderBottom: "1px solid rgba(0,0,0,.06)", textAlign: "right", fontWeight: 900 }}>
                        Rs {money(p.amount)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Footer / signature area */}
          <div
            style={{
              marginTop: 24,
              paddingTop: 14,
              borderTop: "1px solid rgba(0,0,0,.10)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
              gap: 14,
            }}
          >
            <div style={{ fontSize: 11, opacity: 0.75, maxWidth: "60%" }}>
              This statement is generated from system records. Please contact Ram Pottery Ltd for clarifications.
            </div>
            <div style={{ textAlign: "center", fontSize: 11 }}>
              <div style={{ width: 180, borderTop: "1px solid rgba(0,0,0,.4)", paddingTop: 4 }}>
                Authorized Signature
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Print CSS — re-reveals .print-area (invoice.css declares an app-wide
          `body * { visibility:hidden }` in @media print that would otherwise
          blank this page — same bug + same fix pattern already used by
          dotMatrixPrint.css for `.dm-print-root`). Portrait, unchanged. */}
      <style>
        {`
          .print-area, .print-area * { visibility: visible !important; }
          @media print {
            .no-print { display:none !important; }
            .print-shell { padding:0 !important; }
            .print-area { margin:0 !important; }
            @page { margin: 12mm; }
          }
        `}
      </style>
    </div>
  );
}

