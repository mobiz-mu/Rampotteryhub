// src/pages/Dashboard.tsx
import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";

import {
  FileText,
  Users,
  Package,
  ArrowUpRight,
  ArrowDownRight,
  Plus,
  Clock,
  AlertCircle,
  RefreshCw,
  Wallet,
  Landmark,
  Receipt,
  CheckCircle2,
  Gauge,
  ReceiptText,
} from "lucide-react";

import { cn } from "@/lib/utils";

/** =========================
 * Formatting helpers
 * ========================= */
const NF0 = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const NF2 = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function n(v: any) {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}
function fmtCount(v: any) {
  return NF0.format(n(v));
}
function fmtMoney(v: any) {
  return NF2.format(n(v));
}
function fmtRs(v: any) {
  return `Rs ${fmtMoney(v)}`;
}
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function startOfMonthISO() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function rollingDaysISO(days = 30) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}
function startOfPrevMonthISO() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() - 1, 1).toISOString().slice(0, 10);
}
function endOfPrevMonthISO() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 0).toISOString().slice(0, 10);
}
function pctChange(current: number, previous: number) {
  if (previous <= 0 && current <= 0) return 0;
  if (previous <= 0 && current > 0) return 100;
  return ((current - previous) / previous) * 100;
}
function trendFromPct(p: number): "up" | "down" | "neutral" {
  if (p > 0.1) return "up";
  if (p < -0.1) return "down";
  return "neutral";
}
function shortId(v: any) {
  const s = String(v ?? "");
  return s.length > 8 ? s.slice(0, 8) : s;
}
function fmtDate(d?: string) {
  if (!d) return "—";
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return String(d);
  return x.toLocaleDateString("en-GB");
}

function statusMeta(raw: string, balance: number, dueDate?: string) {
  const s = String(raw || "").toUpperCase();
  const today = todayISO();
  const isOverdue = balance > 0 && dueDate && String(dueDate) < today;

  if (isOverdue) {
    return {
      label: "OVERDUE",
      cls: "bg-rose-500/10 text-rose-700 dark:text-rose-200",
    };
  }
  if (s === "PAID") {
    return {
      label: "PAID",
      cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-200",
    };
  }
  if (s === "PARTIALLY_PAID") {
    return {
      label: "PARTIALLY PAID",
      cls: "bg-amber-500/10 text-amber-700 dark:text-amber-200",
    };
  }
  if (s === "ISSUED") {
    return {
      label: "ISSUED",
      cls: "bg-sky-500/10 text-sky-700 dark:text-sky-200",
    };
  }
  return { label: s || "—", cls: "bg-muted/40 text-foreground/80" };
}

/** =========================
 * Small UI parts
 * ========================= */
function RsIcon({ className }: { className?: string }) {
  return (
    <div className={cn("h-10 w-10 grid place-items-center rounded-2xl bg-primary/10 text-primary", className)}>
      <span className="font-black tracking-tight text-[13px] leading-[13px]">Rs</span>
    </div>
  );
}

function StatCard(props: {
  title: string;
  valueRs: number;
  changePct: number;
  icon: React.ComponentType<{ className?: string }>;
  trend: "up" | "down" | "neutral";
  hint?: string;
  subline?: { label: string; value: string };
}) {
  const Icon = props.icon;

  return (
    <Card className="rp-card overflow-hidden">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="rp-label">{props.title}</p>

            <div className="mt-2 flex items-baseline gap-2 min-w-0">
              <span className="rp-currency">Rs</span>
              <span className="rp-kpi tabular-nums truncate">{fmtMoney(props.valueRs)}</span>
            </div>

            <div className="mt-2 flex items-center gap-1.5">
              {props.trend === "up" ? (
                <ArrowUpRight className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              ) : props.trend === "down" ? (
                <ArrowDownRight className="h-4 w-4 text-rose-600 dark:text-rose-400" />
              ) : (
                <span className="h-4 w-4 inline-block" />
              )}

              <span
                className={cn(
                  "text-sm font-semibold tabular-nums",
                  props.trend === "up" && "text-emerald-700 dark:text-emerald-300",
                  props.trend === "down" && "text-rose-700 dark:text-rose-300",
                  props.trend === "neutral" && "text-muted-foreground"
                )}
              >
                {props.changePct > 0 ? "+" : ""}
                {Number.isFinite(props.changePct) ? props.changePct.toFixed(1) : "0.0"}%
              </span>
              <span className="text-sm text-muted-foreground whitespace-nowrap">vs last month</span>
            </div>

            {props.subline ? (
              <div className="rp-subline mt-3">
                <span className="rp-subLabel">{props.subline.label}</span>
                <span className="rp-subVal tabular-nums">{props.subline.value}</span>
              </div>
            ) : null}

            {props.hint ? <div className="rp-hint mt-2">{props.hint}</div> : null}
          </div>

          <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
            <div className="absolute -inset-12 opacity-0 rp-hoverGlow pointer-events-none blur-2xl bg-[radial-gradient(circle_at_30%_30%,rgba(185,28,28,.22),transparent_60%)] transition-opacity" />
            <Icon className="h-6 w-6 text-primary relative z-[1]" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function QuickAction(props: {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
}) {
  const Icon = props.icon;

  return (
    <Link to={props.href} className="block">
      <Card className="rp-card group cursor-pointer overflow-hidden">
        <CardContent className="p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <div className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 transition-colors group-hover:bg-primary">
              <div className="absolute -inset-10 opacity-0 group-hover:opacity-70 pointer-events-none blur-2xl bg-[radial-gradient(circle_at_30%_30%,rgba(185,28,28,.24),transparent_60%)] transition-opacity" />
              <Icon className="h-6 w-6 text-primary group-hover:text-primary-foreground relative z-[1]" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-foreground leading-tight">{props.title}</h3>
              <p className="text-sm text-muted-foreground leading-snug">{props.description}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

/** ===== Chart helpers ===== */
function monthKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}
function monthLabel(ym: string) {
  const [y, m] = ym.split("-").map((x) => Number(x));
  const dt = new Date(y, (m || 1) - 1, 1);
  return dt.toLocaleString(undefined, { month: "short" });
}
type SalesPoint = { ym: string; label: string; total: number };

function SalesBarChart({ points }: { points: SalesPoint[] }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setReady(true), 50);
    return () => window.clearTimeout(t);
  }, [points.length]);

  const max = Math.max(1, ...points.map((p) => n(p.total)));
  const maxLabel = fmtRs(max);
  const total6 = points.reduce((s, p) => s + n(p.total), 0);

  return (
    <div className="rp-sales">
      <div className="rp-salesTop">
        <div className="rp-miniKpi">
          <div className="rp-miniLabel">6-month total</div>
          <div className="rp-miniValue tabular-nums">{fmtRs(total6)}</div>
        </div>
        <div className="rp-miniKpi">
          <div className="rp-miniLabel">Best month</div>
          <div className="rp-miniValue tabular-nums">{maxLabel}</div>
        </div>
        <div className="rp-miniHint hidden sm:block">Hover bars for exact totals</div>
      </div>

      <div className="rp-grid">
        {points.map((p) => {
          const ratio = n(p.total) / max;
          const h = Math.max(6, Math.round(ratio * 100));
          const isTop = n(p.total) === max && max > 0;

          return (
            <div key={p.ym} className="rp-col" title={`${p.label}: ${fmtRs(p.total)}`}>
              <div className={cn("rp-barWrap", isTop && "rp-barWrapTop")}>
                <div className="rp-ambient" />
                <div className="rp-bar" style={{ height: `${ready ? h : 6}%` }} />
                <div className="rp-gloss" />
                <div className="rp-baseLine" />
              </div>
              <div className="rp-x">{p.label}</div>
            </div>
          );
        })}
      </div>

      <div className="rp-foot">
        <span>Last 6 months (invoice totals)</span>
        <span className="rp-max">Max: {maxLabel}</span>
      </div>
    </div>
  );
}

function Donut({ paid, outstanding }: { paid: number; outstanding: number }) {
  const [angle, setAngle] = useState(0);

  const total = Math.max(1, n(paid) + n(outstanding));
  const paidPct = Math.max(0, Math.min(1, n(paid) / total));
  const target = paidPct * 360;

  useEffect(() => {
    const t = window.setTimeout(() => setAngle(target), 60);
    return () => window.clearTimeout(t);
  }, [target]);

  return (
    <div className="rp-donut">
      <div
        className="rp-ring"
        style={{
          background: `conic-gradient(rgba(185,28,28,.92) 0deg ${angle}deg, rgba(15,23,42,.10) ${angle}deg 360deg)`,
        }}
      >
        <div className="rp-hole">
          <div className="rp-midLabel">Paid</div>
          <div className="rp-midValue tabular-nums">{Math.round(paidPct * 100)}%</div>
        </div>
      </div>

      <div className="rp-legend">
        <div className="rp-legRow">
          <span className="rp-dot rp-dotPaid" />
          <span className="rp-legText">Paid</span>
          <span className="rp-legVal tabular-nums">{fmtRs(paid)}</span>
        </div>
        <div className="rp-legRow">
          <span className="rp-dot rp-dotOut" />
          <span className="rp-legText">Outstanding</span>
          <span className="rp-legVal tabular-nums">{fmtRs(outstanding)}</span>
        </div>
      </div>
    </div>
  );
}

/** =========================
 * Page
 * ========================= */
export default function Dashboard() {
  const [useRolling30, setUseRolling30] = useState(true);

  const fromThis = useRolling30 ? rollingDaysISO(30) : startOfMonthISO();
  const toToday = todayISO();
  const fromPrev = startOfPrevMonthISO();
  const toPrev = endOfPrevMonthISO();

  const salesStatuses = useMemo(() => ["ISSUED", "PARTIALLY_PAID", "PAID"], []);

  const invoicesThisQ = useQuery({
    queryKey: ["dash_invoices_this", fromThis, toToday],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select(
          `
          id,invoice_number,customer_id,invoice_date,due_date,total_amount,subtotal,vat_amount,status,amount_paid,balance_remaining,
          customer:customers ( id,name,client_name,customer_code )
        `
        )
        .gte("invoice_date", fromThis)
        .lte("invoice_date", toToday)
        .in("status", salesStatuses)
        .order("invoice_date", { ascending: false })
        .limit(1200);

      if (error) throw error;
      return (data ?? []) as any[];
    },
    staleTime: 10_000,
  });

  const invoicesPrevQ = useQuery({
    queryKey: ["dash_invoices_prev", fromPrev, toPrev],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id,total_amount,status")
        .gte("invoice_date", fromPrev)
        .lte("invoice_date", toPrev)
        .in("status", salesStatuses);

      if (error) throw error;
      return (data ?? []) as any[];
    },
    staleTime: 30_000,
  });

  const paymentsThisQ = useQuery({
    queryKey: ["dash_invoice_payments_this", fromThis, toToday],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoice_payments")
        .select("id,invoice_id,payment_date,amount,method")
        .gte("payment_date", fromThis)
        .lte("payment_date", toToday)
        .order("payment_date", { ascending: false })
        .limit(2500);

      if (error) throw error;
      return (data ?? []) as any[];
    },
    staleTime: 10_000,
  });

  const paymentsPrevQ = useQuery({
    queryKey: ["dash_invoice_payments_prev", fromPrev, toPrev],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoice_payments")
        .select("id,amount,payment_date")
        .gte("payment_date", fromPrev)
        .lte("payment_date", toPrev);

      if (error) throw error;
      return (data ?? []) as any[];
    },
    staleTime: 30_000,
  });

  const productsQ = useQuery({
    queryKey: ["dash_products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id,sku,item_code,name,current_stock,reorder_level,is_active")
        .order("name", { ascending: true });

      if (error) throw error;
      return (data ?? []) as any[];
    },
    staleTime: 45_000,
  });

  const supplierBillsOpenQ = useQuery({
    queryKey: ["dash_supplier_bills_open"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supplier_bills")
        .select("id,total_amount,status,due_date,bill_date")
        .in("status", ["OPEN", "PARTIALLY_PAID"])
        .order("bill_date", { ascending: false })
        .limit(800);

      if (error) throw error;
      return (data ?? []) as any[];
    },
    staleTime: 45_000,
  });

  const recentInvoicesQ = useQuery({
    queryKey: ["dash_recent_invoices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select(
          `
          id,invoice_number,customer_id,invoice_date,due_date,total_amount,balance_remaining,status,
          customer:customers ( id,name,client_name,customer_code )
        `
        )
        .in("status", salesStatuses)
        .order("invoice_date", { ascending: false })
        .limit(20);

      if (error) throw error;
      return (data ?? []) as any[];
    },
    staleTime: 10_000,
  });

  const sales6mQ = useQuery({
    queryKey: ["dash_sales_6m"],
    queryFn: async () => {
      const now = new Date();
      const from = new Date(now.getFullYear(), now.getMonth() - 5, 1);
      const fromISO = from.toISOString().slice(0, 10);
      const toISO = todayISO();

      const { data, error } = await supabase
        .from("invoices")
        .select("invoice_date,total_amount,status")
        .gte("invoice_date", fromISO)
        .lte("invoice_date", toISO)
        .in("status", salesStatuses);

      if (error) throw error;
      return (data ?? []) as { invoice_date: string; total_amount: any }[];
    },
    staleTime: 15_000,
  });

  const anyLoading =
    invoicesThisQ.isLoading ||
    invoicesPrevQ.isLoading ||
    paymentsThisQ.isLoading ||
    paymentsPrevQ.isLoading ||
    productsQ.isLoading ||
    supplierBillsOpenQ.isLoading ||
    sales6mQ.isLoading ||
    recentInvoicesQ.isLoading;

  const anyError =
    invoicesThisQ.error ||
    invoicesPrevQ.error ||
    paymentsThisQ.error ||
    paymentsPrevQ.error ||
    productsQ.error ||
    supplierBillsOpenQ.error ||
    sales6mQ.error ||
    recentInvoicesQ.error;

  const lastInvoiceDate = useMemo(() => {
    const list = recentInvoicesQ.data ?? [];
    const d = list?.[0]?.invoice_date;
    return d ? fmtDate(String(d)) : "—";
  }, [recentInvoicesQ.data]);

  const kpis = useMemo(() => {
    const invThis = invoicesThisQ.data ?? [];
    const invPrev = invoicesPrevQ.data ?? [];
    const payThis = paymentsThisQ.data ?? [];
    const payPrev = paymentsPrevQ.data ?? [];
    const prods = productsQ.data ?? [];
    const openBills = supplierBillsOpenQ.data ?? [];

    const revenueThis = invThis.reduce((s, r) => s + n(r.total_amount), 0);
    const revenuePrev = invPrev.reduce((s, r) => s + n(r.total_amount), 0);

    const vatThis = invThis.reduce((s, r) => s + Math.max(0, n(r.vat_amount)), 0);
    const subtotalThis = invThis.reduce((s, r) => s + Math.max(0, n(r.subtotal)), 0);

    const paymentsThis = payThis.reduce((s, r) => s + n(r.amount), 0);
    const paymentsPrev = payPrev.reduce((s, r) => s + n(r.amount), 0);

    const invoicesThisCount = invThis.length;
    const invoicesPrevCount = invPrev.length;

    const activeSkus = prods.filter((p: any) => (p.is_active ?? true) === true).length;

    const lowStock = prods
      .filter((p: any) => (p.is_active ?? true) === true && n(p.reorder_level) > 0)
      .filter((p: any) => n(p.current_stock) <= n(p.reorder_level));

    const lowStockCount = lowStock.length;

    const paid = invThis.reduce((s, i: any) => {
      const total = Math.max(0, n(i.total_amount));
      const ap = Math.max(0, n(i.amount_paid));
      return s + Math.min(ap, total);
    }, 0);

    const outstanding = invThis.reduce((s, i: any) => s + Math.max(0, n(i.balance_remaining)), 0);

    // True “cashflow” feel in screenshot is invoices vs payments; keep your logic but present premium.
    const cashflow = revenueThis - paymentsThis;

    const avgInvoice = invoicesThisCount > 0 ? revenueThis / invoicesThisCount : 0;
    const vatRateApprox = subtotalThis > 0 ? (vatThis / subtotalThis) * 100 : 0;
    const netAfterVat = Math.max(0, revenueThis - vatThis);

    const tISO = todayISO();
    const overdue = invThis
      .filter((i: any) => n(i.balance_remaining) > 0 && i.due_date && String(i.due_date) < tISO)
      .map((i: any) => ({ ...i, balance: Math.max(0, n(i.balance_remaining)) }))
      .sort((a: any, b: any) => b.balance - a.balance);

    const overdueCount = overdue.length;
    const overdueTotal = overdue.reduce((s: number, r: any) => s + n(r.balance_remaining), 0);

    let apDueSoon = 0;
    let apOverdue = 0;
    const now = new Date();
    openBills.forEach((b: any) => {
      if (!b.due_date) return;
      const due = new Date(b.due_date);
      if (Number.isNaN(due.getTime())) return;
      const days = Math.floor((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      const amt = Math.max(0, n(b.total_amount));
      if (days >= 0 && days <= 14) apDueSoon += amt;
      if (days < 0) apOverdue += amt;
    });

    return {
      revenueThis,
      revenueChange: pctChange(revenueThis, revenuePrev),
      paymentsThis,
      paymentsChange: pctChange(paymentsThis, paymentsPrev),
      invoicesThisCount,
      invoicesChange: pctChange(invoicesThisCount, invoicesPrevCount),
      vatThis,
      netAfterVat,
      avgInvoice,
      vatRateApprox,
      activeSkus,
      lowStockCount,
      overdueCount,
      overdueTotal,
      apDueSoon,
      apOverdue,
      cashflow,
      paid,
      outstanding,
      lowStockTop: lowStock
        .map((p: any) => ({
          id: p.id,
          sku: p.sku || p.item_code || `#${p.id}`,
          name: p.name,
          onHand: n(p.current_stock),
          min: n(p.reorder_level),
        }))
        .sort((a: any, b: any) => a.onHand - b.onHand)
        .slice(0, 8),
    };
  }, [
    invoicesThisQ.data,
    invoicesPrevQ.data,
    paymentsThisQ.data,
    paymentsPrevQ.data,
    productsQ.data,
    supplierBillsOpenQ.data,
  ]);

  const recentInvoices = useMemo(() => {
    const list = recentInvoicesQ.data ?? [];
    return list.slice(0, 12).map((i: any) => {
      const c = i.customer || i.customers || null;
      const cname = String(c?.client_name || "").trim() || String(c?.name || "").trim();
      const code = String(c?.customer_code || "").trim();
      const label = cname ? (code ? `${cname} • ${code}` : cname) : `Customer #${i.customer_id}`;

      return {
        id: i.id,
        invoice_number: i.invoice_number || `INV-${shortId(i.id)}`,
        invoice_date: i.invoice_date,
        due_date: i.due_date,
        customer: label,
        total: n(i.total_amount),
        balance: Math.max(0, n(i.balance_remaining)),
        status: String(i.status ?? "—"),
      };
    });
  }, [recentInvoicesQ.data]);

  const salesPoints = useMemo<SalesPoint[]>(() => {
    const now = new Date();
    const months: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(monthKey(d));
    }
    const totals = new Map<string, number>();
    months.forEach((k) => totals.set(k, 0));

    (sales6mQ.data ?? []).forEach((row) => {
      const d = new Date(String(row.invoice_date));
      if (Number.isNaN(d.getTime())) return;
      const k = monthKey(d);
      if (!totals.has(k)) return;
      totals.set(k, (totals.get(k) || 0) + n((row as any).total_amount));
    });

    return months.map((ym) => ({ ym, label: monthLabel(ym), total: totals.get(ym) || 0 }));
  }, [sales6mQ.data]);

  const quickActions = useMemo(
    () => [
      { title: "Create Invoice", description: "Generate a new invoice", icon: FileText, href: "/invoices/create" },
      { title: "Create Quotation", description: "Prepare a quote", icon: Plus, href: "/quotations/create" },
      { title: "Add Customer", description: "Register a new customer", icon: Users, href: "/customers" },
      { title: "Stock Movements", description: "Adjust inventory & track", icon: Package, href: "/stock-movements" },
    ],
    []
  );

  function refetchAll() {
    invoicesThisQ.refetch();
    invoicesPrevQ.refetch();
    paymentsThisQ.refetch();
    paymentsPrevQ.refetch();
    productsQ.refetch();
    supplierBillsOpenQ.refetch();
    sales6mQ.refetch();
    recentInvoicesQ.refetch();
  }

  return (
    <div className="rp-shell">
      <style>{`
/* =========================
   ENTERPRISE DASHBOARD (NO OUTER BLACK FRAME)
   - Removes “boxed frame” feeling
   - Luxury spacing, typography, shadows
   - Zero hard borders; uses soft strokes
   ========================= */

.rp-shell{
  width: 100%;
  min-height: 100%;
  border: none !important;
  outline: none !important;
  box-shadow: none !important;
  background:
    radial-gradient(circle at 18% 12%, rgba(185,28,28,.07), transparent 48%),
    radial-gradient(circle at 82% 18%, rgba(15,23,42,.06), transparent 52%),
    radial-gradient(circle at 52% 92%, rgba(185,28,28,.05), transparent 58%),
    linear-gradient(to bottom, rgba(255,255,255,1), rgba(248,250,252,1));
}

:root.dark .rp-shell{
  background:
    radial-gradient(circle at 18% 12%, rgba(185,28,28,.16), transparent 48%),
    radial-gradient(circle at 82% 18%, rgba(255,255,255,.06), transparent 52%),
    radial-gradient(circle at 52% 92%, rgba(185,28,28,.10), transparent 58%),
    linear-gradient(to bottom, rgba(2,6,23,1), rgba(2,6,23,.92));
}

/* Page container: full-width feel, but premium max width */
.rp-page{
  width: 100%;
  max-width: 1560px;
  margin: 0 auto;
  padding: clamp(14px, 2.2vw, 26px) clamp(14px, 2.4vw, 28px) 30px;
  display:flex;
  flex-direction:column;
  gap: clamp(12px, 1.6vw, 18px);
  overflow-x: clip;
  border: none !important;
  outline: none !important;
  box-shadow: none !important;
}

/* Premium card system (soft stroke, no ugly borders) */
.rp-page .rp-card{
  border: 0 !important;
  border-radius: 18px;
  background: linear-gradient(to bottom, rgba(255,255,255,.96), rgba(255,255,255,.90));
  box-shadow:
    0 18px 60px rgba(2,6,23,.07),
    0 1px 0 rgba(255,255,255,.75) inset;
  position: relative;
  overflow: hidden;
  transition: transform .16s ease, box-shadow .16s ease, filter .16s ease;
}

/* Soft “stroke” using pseudo-element */
.rp-page .rp-card::before{
  content:"";
  position:absolute;
  inset:0;
  border-radius: 18px;
  padding: 1px;
  background: linear-gradient(180deg, rgba(15,23,42,.10), rgba(15,23,42,.04));
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  pointer-events:none;
  opacity: .55;
}
:root.dark .rp-page .rp-card{
  background: linear-gradient(to bottom, rgba(2,6,23,.82), rgba(2,6,23,.62));
  box-shadow: 0 26px 80px rgba(0,0,0,.52);
}
:root.dark .rp-page .rp-card::before{
  background: linear-gradient(180deg, rgba(226,232,240,.12), rgba(226,232,240,.04));
  opacity: .65;
}
.rp-page .rp-card:hover{
  transform: translateY(-1px);
  box-shadow:
    0 26px 88px rgba(2,6,23,.10),
    0 1px 0 rgba(255,255,255,.75) inset;
  filter: saturate(1.02);
}
:root.dark .rp-page .rp-card:hover{
  box-shadow: 0 36px 110px rgba(0,0,0,.62);
}

/* Labels + KPIs */
.rp-label{
  font-size: 11px;
  font-weight: 900;
  letter-spacing: .12em;
  text-transform: uppercase;
  color: rgba(15,23,42,.58);
}
:root.dark .rp-label{ color: rgba(226,232,240,.60); }

.rp-currency{
  font-size: 12px;
  font-weight: 950;
  letter-spacing: .02em;
  color: rgba(15,23,42,.62);
}
:root.dark .rp-currency{ color: rgba(226,232,240,.72); }

.rp-kpi{
  font-weight: 950;
  letter-spacing: -0.04em;
  line-height: 1.06;
  font-size: clamp(19px, 1.20vw, 24px);
  color: rgba(2,6,23,.92);
}
:root.dark .rp-kpi{ color: rgba(226,232,240,.92); }

.rp-hint{ font-size: 11px; color: rgba(15,23,42,.50); }
:root.dark .rp-hint{ color: rgba(226,232,240,.58); }

/* Subline (soft chip) */
.rp-subline{
  display:flex; align-items:center; justify-content:space-between; gap: 10px;
  padding: 8px 10px;
  border-radius: 14px;
  background: rgba(2,6,23,.03);
}
:root.dark .rp-subline{ background: rgba(255,255,255,.05); }

.rp-subLabel{ font-size: 11px; font-weight: 900; color: rgba(15,23,42,.56); }
:root.dark .rp-subLabel{ color: rgba(226,232,240,.62); }
.rp-subVal{ font-size: 12px; font-weight: 950; color: rgba(15,23,42,.88); }
:root.dark .rp-subVal{ color: rgba(226,232,240,.92); }

/* HERO: luxury glass ribbon */
.rp-hero{
  position: relative;
  border-radius: 22px;
  padding: 16px 18px;
  border: none !important;
  outline: none !important;
  box-shadow:
    0 22px 70px rgba(2,6,23,.08),
    0 1px 0 rgba(255,255,255,.70) inset;
  background:
    radial-gradient(circle at 16% 18%, rgba(185,28,28,.12), transparent 52%),
    radial-gradient(circle at 78% 24%, rgba(15,23,42,.08), transparent 56%),
    linear-gradient(to bottom, rgba(255,255,255,.92), rgba(255,255,255,.82));
  overflow: hidden;
}
.rp-hero::after{
  content:"";
  position:absolute; inset:-1px;
  background: linear-gradient(120deg, transparent 0%, rgba(255,255,255,.30) 45%, transparent 100%);
  transform: translateX(-38%) skewX(-10deg);
  opacity: .32;
  animation: rpHeroSheen 6.5s ease-in-out infinite;
  pointer-events:none;
}
@keyframes rpHeroSheen{
  0%{ transform: translateX(-40%) skewX(-10deg); opacity: 0; }
  18%{ opacity: .34; }
  52%{ opacity: .34; }
  68%{ opacity: 0; }
  100%{ transform: translateX(40%) skewX(-10deg); opacity: 0; }
}
:root.dark .rp-hero{
  background:
    radial-gradient(circle at 16% 18%, rgba(185,28,28,.22), transparent 52%),
    radial-gradient(circle at 78% 24%, rgba(255,255,255,.06), transparent 56%),
    linear-gradient(to bottom, rgba(2,6,23,.78), rgba(2,6,23,.56));
  box-shadow: 0 30px 92px rgba(0,0,0,.55);
}

/* Soft pill styles (removes visible “border” lines everywhere) */
.rp-pill{
  border: 0 !important;
  background: rgba(255,255,255,.70);
  box-shadow: 0 10px 30px rgba(2,6,23,.06), 0 1px 0 rgba(255,255,255,.7) inset;
  backdrop-filter: blur(10px);
}
:root.dark .rp-pill{
  background: rgba(2,6,23,.45);
  box-shadow: 0 18px 50px rgba(0,0,0,.38);
}

/* Charts / donut (kept from your work, polished) */
.rp-salesTop{ display:flex; align-items:flex-end; justify-content:space-between; gap: 12px; padding: 2px 2px 10px 2px; flex-wrap: wrap; }
.rp-miniKpi{ display:flex; flex-direction:column; gap:2px; }
.rp-miniLabel{ font-size: 11px; color: rgba(15,23,42,.58); font-weight: 900; letter-spacing:.2px; }
.rp-miniValue{ font-size: 13px; font-weight: 950; letter-spacing:.2px; color: rgba(15,23,42,.88); }
.rp-miniHint{ margin-left:auto; font-size: 12px; color: rgba(15,23,42,.50); }
:root.dark .rp-miniLabel{ color: rgba(226,232,240,.62); }
:root.dark .rp-miniValue{ color: rgba(226,232,240,.92); }
:root.dark .rp-miniHint{ color: rgba(226,232,240,.62); }

.rp-grid{
  height: 156px;
  display:grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 12px;
  align-items:end;
}
.rp-col{ display:flex; flex-direction:column; align-items:center; gap: 8px; min-width: 0; }

.rp-barWrap{
  position:relative;
  width:100%;
  height: 116px;
  border-radius: 16px;
  border: none;
  background: rgba(2,6,23,.03);
  overflow:hidden;
  box-shadow: 0 14px 40px rgba(2,6,23,.07), 0 1px 0 rgba(255,255,255,.55) inset;
}
:root.dark .rp-barWrap{
  background: rgba(255,255,255,.05);
  box-shadow: 0 22px 70px rgba(0,0,0,.40);
}
.rp-ambient{
  position:absolute; inset:-60px -60px auto -60px;
  height: 140px;
  background: radial-gradient(circle at 30% 30%, rgba(185,28,28,.14), transparent 60%);
  filter: blur(12px);
  opacity: .95;
}
.rp-barWrapTop{ box-shadow: 0 18px 52px rgba(185,28,28,.12), 0 1px 0 rgba(255,255,255,.55) inset; }
.rp-bar{
  position:absolute; left: 10px; right: 10px; bottom: 10px;
  border-radius: 14px;
  background: linear-gradient(to top, rgba(185,28,28,.22), rgba(185,28,28,.94));
  box-shadow: 0 18px 44px rgba(185,28,28,.16), 0 1px 0 rgba(255,255,255,.30) inset;
  transition: height .7s cubic-bezier(.2,.8,.2,1);
  will-change: height;
}
.rp-baseLine{ position:absolute; left:0; right:0; bottom:0; height: 1px; background: rgba(15,23,42,.06); }
:root.dark .rp-baseLine{ background: rgba(255,255,255,.08); }

.rp-gloss{
  pointer-events:none;
  position:absolute; inset:0;
  background: linear-gradient(120deg, transparent 18%, rgba(255,255,255,.18) 45%, transparent 72%);
  transform: translateX(-22%);
  animation: rpGloss 3.8s ease-in-out infinite;
  mix-blend-mode: soft-light;
}
@keyframes rpGloss{
  0%{ opacity:0; transform: translateX(-26%) skewX(-10deg); }
  12%{ opacity:.52; }
  52%{ opacity:.52; }
  72%{ opacity:0; }
  100%{ opacity:0; transform: translateX(26%) skewX(-10deg); }
}

.rp-x{ font-size: 11px; color: rgba(15,23,42,.70); font-weight: 950; letter-spacing:.2px; }
.rp-foot{ margin-top: 10px; display:flex; align-items:center; justify-content:space-between; font-size: 12px; color: rgba(15,23,42,.50); gap: 8px; }
.rp-max{ font-weight: 950; color: rgba(15,23,42,.84); }
:root.dark .rp-x{ color: rgba(226,232,240,.78); }
:root.dark .rp-foot{ color: rgba(226,232,240,.62); }
:root.dark .rp-max{ color: rgba(226,232,240,.92); }

.rp-donut{ display:flex; gap: 14px; align-items:center; justify-content:space-between; }
.rp-ring{
  width: 124px; height: 124px; border-radius: 999px;
  box-shadow: 0 16px 48px rgba(2,6,23,.12), 0 1px 0 rgba(255,255,255,.55) inset;
  position: relative;
  transition: background 700ms cubic-bezier(.2,.8,.2,1);
  flex: 0 0 auto;
}
.rp-ring::after{
  content:"";
  position:absolute; inset: -18px;
  border-radius: 999px;
  background: radial-gradient(circle at 30% 30%, rgba(185,28,28,.12), transparent 60%);
  filter: blur(14px);
  opacity: .9;
  pointer-events:none;
}
.rp-hole{
  position:absolute; inset: 18px; border-radius: 999px;
  background: rgba(255,255,255,.95);
  display:flex; flex-direction:column; align-items:center; justify-content:center;
  box-shadow: 0 12px 34px rgba(2,6,23,.08);
}
:root.dark .rp-hole{
  background: rgba(2,6,23,.78);
  box-shadow: 0 18px 50px rgba(0,0,0,.40);
}
.rp-midLabel{ font-size: 11px; font-weight: 900; color: rgba(15,23,42,.60); }
.rp-midValue{ font-size: 18px; font-weight: 950; color: rgba(15,23,42,.90); letter-spacing:.2px; }
:root.dark .rp-midLabel{ color: rgba(226,232,240,.62); }
:root.dark .rp-midValue{ color: rgba(226,232,240,.92); }

.rp-legend{ display:flex; flex-direction:column; gap: 8px; flex:1; min-width: 0; }
.rp-legRow{
  display:grid; grid-template-columns: 14px 1fr auto;
  gap: 8px; align-items:center;
  padding: 8px 10px;
  border-radius: 12px;
  background: rgba(2,6,23,.03);
  min-width: 0;
}
:root.dark .rp-legRow{ background: rgba(255,255,255,.05); }

.rp-dot{ width:10px; height:10px; border-radius:999px; }
.rp-dotPaid{ background: rgba(185,28,28,.92); box-shadow: 0 0 0 3px rgba(185,28,28,.14); }
.rp-dotOut{ background: rgba(15,23,42,.35); box-shadow: 0 0 0 3px rgba(15,23,42,.10); }
:root.dark .rp-dotOut{ background: rgba(226,232,240,.35); box-shadow: 0 0 0 3px rgba(226,232,240,.10); }

.rp-legText{ font-size: 12px; font-weight: 900; color: rgba(15,23,42,.72); white-space: nowrap; overflow:hidden; text-overflow: ellipsis; }
:root.dark .rp-legText{ color: rgba(226,232,240,.80); }
.rp-legVal{ font-size: 12px; font-weight: 950; color: rgba(15,23,42,.88); white-space: nowrap; }
:root.dark .rp-legVal{ color: rgba(226,232,240,.92); }

@media (max-width: 520px){
  .rp-donut{ flex-direction:column; align-items:flex-start; }
  .rp-ring{ margin-bottom: 8px; }
}

.rp-noDivider{ display:none; }
`}</style>

      <div className="rp-page">
        {/* HERO */}
        <div className="rp-hero">
          <div className="relative z-[1] flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl sm:text-2xl md:text-3xl font-black text-foreground tracking-tight">
                  Ram Pottery Hub
                </h1>

                {/* no visible borders */}
                <Badge variant="secondary" className="rp-pill rounded-full px-3 py-1 text-xs font-semibold">
                  Live
                </Badge>

                <Badge variant="secondary" className="rp-pill rounded-full px-3 py-1 text-xs font-semibold flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5" />
                  Last invoice: <span className="font-semibold">{lastInvoiceDate}</span>
                </Badge>
              </div>

              <p className="text-muted-foreground mt-2 text-sm sm:text-base">
                Dashboard • Period: <span className="font-semibold">{fmtDate(fromThis)}</span> →{" "}
                <span className="font-semibold">{fmtDate(toToday)}</span>
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge
                  variant="secondary"
                  className="rp-pill rounded-full px-3 py-1 text-xs font-semibold bg-primary/10 text-primary"
                >
                  Sales: {salesStatuses.join(", ")}
                </Badge>

                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Gauge className="h-3.5 w-3.5" />
                  Real-time KPIs • Supabase
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              {/* Toggle pill: no borders */}
              <div className="rp-pill flex items-center gap-2 rounded-full px-3 py-2">
                <span className={cn("text-xs font-semibold", !useRolling30 ? "text-foreground" : "text-muted-foreground")}>
                  MTD
                </span>
                <Switch checked={useRolling30} onCheckedChange={(v) => setUseRolling30(!!v)} />
                <span className={cn("text-xs font-semibold", useRolling30 ? "text-foreground" : "text-muted-foreground")}>
                  Last 30 Days
                </span>
              </div>

              <Button variant="outline" onClick={refetchAll} disabled={anyLoading} className="rounded-full">
                <RefreshCw className={cn("h-4 w-4 mr-2", anyLoading && "animate-spin")} />
                {anyLoading ? "Loading..." : "Refresh"}
              </Button>

              <Button asChild className="gradient-primary shadow-glow text-primary-foreground rounded-full">
                <Link to="/invoices/create">
                  <Plus className="h-4 w-4 mr-2" />
                  New Invoice
                </Link>
              </Button>
            </div>
          </div>
        </div>

        {anyError ? (
          <div className="rounded-2xl bg-rose-500/8 p-4 rp-card">
            <div className="text-sm font-semibold text-rose-700 dark:text-rose-300">Failed to load dashboard data</div>
            <div className="mt-2 text-sm text-rose-700/90 dark:text-rose-300/90 whitespace-pre-wrap">
              {(anyError as any)?.message || "Unknown error"}
            </div>
            <div className="mt-3 text-xs text-muted-foreground">
              If other pages work and Dashboard fails, it’s usually a missing column in one query or an RLS policy.
            </div>
          </div>
        ) : null}

        {/* KPI GRID */}
        <div className="grid gap-3 sm:gap-4 lg:gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title={useRolling30 ? "Revenue (Last 30 Days)" : "Revenue (MTD)"}
            valueRs={kpis.revenueThis}
            changePct={kpis.revenueChange}
            icon={RsIcon as any}
            trend={trendFromPct(kpis.revenueChange)}
            subline={{ label: "Net after VAT (proxy)", value: fmtRs(kpis.netAfterVat) }}
            hint="From invoices.total_amount"
          />

          <StatCard
            title={useRolling30 ? "Payments (Last 30 Days)" : "Payments Received (MTD)"}
            valueRs={kpis.paymentsThis}
            changePct={kpis.paymentsChange}
            icon={Wallet}
            trend={trendFromPct(kpis.paymentsChange)}
            subline={{ label: "Outstanding", value: fmtRs(kpis.outstanding) }}
            hint="From invoice_payments.amount"
          />

          <StatCard
            title={useRolling30 ? "Avg Invoice (Last 30 Days)" : "Avg Invoice (MTD)"}
            valueRs={kpis.avgInvoice}
            changePct={kpis.invoicesChange}
            icon={FileText}
            trend={trendFromPct(kpis.invoicesChange)}
            subline={{ label: "Invoices count", value: fmtCount(kpis.invoicesThisCount) }}
            hint="Average invoice value"
          />

          <StatCard
            title="VAT & Stock Health"
            valueRs={kpis.vatThis}
            changePct={0}
            icon={ReceiptText}
            trend="neutral"
            subline={{ label: "VAT rate (approx)", value: `${kpis.vatRateApprox.toFixed(1)}%` }}
            hint={`Low stock: ${fmtCount(kpis.lowStockCount)} • Active SKUs: ${fmtCount(kpis.activeSkus)}`}
          />
        </div>

        {/* CASHFLOW + DONUT */}
        <div className="grid gap-3 sm:gap-4 lg:gap-5 lg:grid-cols-3">
          <Card className="rp-card lg:col-span-1 overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Cashflow</CardTitle>
              <CardDescription>Invoices − Payments (selected window)</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="rp-currency">Rs</span>
                    <span className="rp-kpi tabular-nums">{fmtMoney(kpis.cashflow)}</span>
                  </div>
                  <div className="mt-2 text-sm text-muted-foreground">{useRolling30 ? "Last 30 days" : "MTD"} • Live</div>
                </div>

                <div className="h-11 w-11 rounded-2xl bg-primary/10 flex items-center justify-center relative overflow-hidden">
                  <div className="absolute -inset-10 opacity-70 pointer-events-none blur-2xl bg-[radial-gradient(circle_at_30%_30%,rgba(185,28,28,.20),transparent_60%)]" />
                  <Receipt className="h-6 w-6 text-primary relative z-[1]" />
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-background/60 p-3">
                  <div className="text-xs text-muted-foreground font-semibold">Invoices</div>
                  <div className="mt-1 text-sm font-extrabold tabular-nums whitespace-nowrap">{fmtRs(kpis.revenueThis)}</div>
                </div>
                <div className="rounded-2xl bg-background/60 p-3">
                  <div className="text-xs text-muted-foreground font-semibold">Payments</div>
                  <div className="mt-1 text-sm font-extrabold tabular-nums whitespace-nowrap">{fmtRs(kpis.paymentsThis)}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rp-card lg:col-span-2 overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Paid vs Outstanding</CardTitle>
              <CardDescription>Based on invoice amount_paid + balance_remaining (selected window)</CardDescription>
            </CardHeader>
            <CardContent>
              <Donut paid={kpis.paid} outstanding={kpis.outstanding} />
            </CardContent>
          </Card>
        </div>

        {/* ACTIONS + CHART + ALERTS */}
        <div className="grid gap-3 sm:gap-4 lg:gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-3 sm:space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base sm:text-lg font-semibold text-foreground">Quick Actions</h2>
              <Badge variant="secondary" className="rp-pill rounded-full px-3 py-1 text-xs font-semibold">
                ERP Shortcuts
              </Badge>
            </div>

            <div className="grid gap-3 sm:gap-4 sm:grid-cols-2">
              {quickActions.map((action) => (
                <QuickAction key={action.title} {...action} />
              ))}
            </div>

            <div className="grid gap-3 sm:gap-4 sm:grid-cols-3">
              <Card className="rp-card overflow-hidden">
                <CardContent className="p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs text-muted-foreground">AR (Overdue)</div>
                      <div className="mt-1 text-base sm:text-lg font-semibold tabular-nums whitespace-nowrap">
                        {fmtRs(kpis.overdueTotal)}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">{fmtCount(kpis.overdueCount)} overdue</div>
                    </div>
                    <div className="h-10 w-10 rounded-2xl bg-background/60 shadow-[0_10px_26px_rgba(2,6,23,.05)] flex items-center justify-center text-muted-foreground shrink-0">
                      <Clock className="h-5 w-5" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="rp-card overflow-hidden">
                <CardContent className="p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs text-muted-foreground">AP Due Soon</div>
                      <div className="mt-1 text-base sm:text-lg font-semibold tabular-nums whitespace-nowrap">
                        {fmtRs(kpis.apDueSoon)}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">≤ 14 days</div>
                    </div>
                    <div className="h-10 w-10 rounded-2xl bg-background/60 shadow-[0_10px_26px_rgba(2,6,23,.05)] flex items-center justify-center text-muted-foreground shrink-0">
                      <Landmark className="h-5 w-5" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="rp-card overflow-hidden">
                <CardContent className="p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs text-muted-foreground">Low Stock Alerts</div>
                      <div className="mt-1 text-base sm:text-lg font-semibold tabular-nums">{fmtCount(kpis.lowStockCount)}</div>
                      <div className="mt-1 text-xs text-muted-foreground">At/below reorder</div>
                    </div>
                    <div className="h-10 w-10 rounded-2xl bg-background/60 shadow-[0_10px_26px_rgba(2,6,23,.05)] flex items-center justify-center text-muted-foreground shrink-0">
                      <Package className="h-5 w-5" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="rp-card overflow-hidden">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Sales per month</CardTitle>
                <CardDescription>Last 6 months (invoice totals)</CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                {sales6mQ.isLoading ? (
                  <div className="text-sm text-muted-foreground py-6 flex items-center gap-2">
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Loading chart…
                  </div>
                ) : (
                  <SalesBarChart points={salesPoints} />
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-3 sm:space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base sm:text-lg font-semibold text-foreground">Alerts</h2>
              <Badge variant="secondary" className="rp-pill rounded-full px-3 py-1 text-xs font-semibold">
                Live
              </Badge>
            </div>

            <Card className="rp-card overflow-hidden">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start gap-3 p-3 rounded-2xl bg-amber-500/10">
                  <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{fmtCount(kpis.overdueCount)} overdue invoices</p>
                    <p className="text-xs text-muted-foreground tabular-nums">Total: {fmtRs(kpis.overdueTotal)}</p>
                    <Button asChild variant="link" className="px-0 h-auto text-sm">
                      <Link to="/invoices">View invoices</Link>
                    </Button>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 rounded-2xl bg-rose-500/10">
                  <AlertCircle className="h-5 w-5 text-rose-600 dark:text-rose-400 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">Low stock alert</p>
                    <p className="text-xs text-muted-foreground">{fmtCount(kpis.lowStockCount)} items below reorder</p>
                    <Button asChild variant="link" className="px-0 h-auto text-sm">
                      <Link to="/stock">Open stock</Link>
                    </Button>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 rounded-2xl bg-primary/10">
                  <Receipt className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">AP due soon</p>
                    <p className="text-xs text-muted-foreground tabular-nums">{fmtRs(kpis.apDueSoon)} within 14 days</p>
                    <Button asChild variant="link" className="px-0 h-auto text-sm">
                      <Link to="/ap/bills">Supplier bills</Link>
                    </Button>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 rounded-2xl bg-emerald-500/10">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">System healthy</p>
                    <p className="text-xs text-muted-foreground">Live sync from Supabase</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="rp-card overflow-hidden">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Top Low Stock</CardTitle>
                <CardDescription>Action list</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {kpis.lowStockTop.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between gap-3 rounded-2xl bg-background/60 px-3 py-2 min-w-0"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">
                          {p.sku} • {p.name}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Reorder: {fmtCount(p.min)} • On hand: {fmtCount(p.onHand)}
                        </div>
                      </div>
                      <Badge
                        variant="secondary"
                        className="rounded-full px-3 py-1 text-xs font-semibold bg-rose-500/10 text-rose-700 dark:text-rose-200 shrink-0"
                      >
                        Low
                      </Badge>
                    </div>
                  ))}
                  {kpis.lowStockTop.length === 0 ? <div className="text-sm text-muted-foreground">No low stock 🎉</div> : null}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* RECENT INVOICES */}
        <Card className="rp-card w-full overflow-hidden">
          <CardHeader className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div>
              <CardTitle className="text-base sm:text-lg">Recent Invoices</CardTitle>
              <CardDescription>Latest invoices (real data)</CardDescription>
            </div>

            <Button asChild variant="outline" className="rounded-full">
              <Link to="/invoices">View all</Link>
            </Button>
          </CardHeader>

          <CardContent>
            {recentInvoicesQ.isLoading ? (
              <div className="text-sm text-muted-foreground py-8 flex items-center gap-2">
                <RefreshCw className="h-4 w-4 animate-spin" />
                Loading invoices...
              </div>
            ) : recentInvoices.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No invoices yet</p>
                <Button asChild className="mt-4 rounded-full">
                  <Link to="/invoices/create">Create Your First Invoice</Link>
                </Button>
              </div>
            ) : (
              <div className="rounded-2xl overflow-hidden bg-background/60">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[860px]">
                    <thead className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
                      <tr>
                        <th className="text-left p-3 font-extrabold text-xs tracking-wide">Invoice</th>
                        <th className="text-left p-3 font-extrabold text-xs tracking-wide">Customer</th>
                        <th className="text-left p-3 font-extrabold text-xs tracking-wide">Date</th>
                        <th className="text-left p-3 font-extrabold text-xs tracking-wide">Status</th>
                        <th className="text-right p-3 font-extrabold text-xs tracking-wide">Total</th>
                        <th className="text-right p-3 font-extrabold text-xs tracking-wide">Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/30">
                      {recentInvoices.map((r) => {
                        const meta = statusMeta(r.status, r.balance, r.due_date);
                        return (
                          <tr key={r.id} className="hover:bg-muted/20 transition-colors">
                            <td className="p-3 font-medium">
                              <Link to={`/invoices/${r.id}`} className="hover:underline">
                                {r.invoice_number}
                              </Link>
                            </td>
                            <td className="p-3 max-w-[420px]">
                              <div className="truncate">{r.customer}</div>
                            </td>
                            <td className="p-3 text-muted-foreground whitespace-nowrap">{fmtDate(r.invoice_date)}</td>
                            <td className="p-3 whitespace-nowrap">
                              <Badge variant="secondary" className={cn("rounded-full px-3 py-1 text-xs font-semibold", meta.cls)}>
                                {meta.label}
                              </Badge>
                            </td>
                            <td className="p-3 text-right font-semibold tabular-nums whitespace-nowrap">{fmtRs(r.total)}</td>
                            <td className="p-3 text-right tabular-nums whitespace-nowrap">{fmtRs(r.balance)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="rp-noDivider" />

        {/* FOOTER */}
        <div className="py-2 text-xs text-muted-foreground">
          <div className="flex flex-col items-center justify-center gap-1 text-center">
            <div>© {new Date().getFullYear()} Ram Pottery Ltd. All rights reserved.</div>
            <div>
              Built by{" "}
              <a href="https://mobiz.mu" target="_blank" rel="noreferrer" className="font-semibold text-foreground hover:underline">
                mobiz.mu
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

