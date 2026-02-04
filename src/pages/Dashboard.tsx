// src/pages/Dashboard.tsx
import React, { useMemo, useState } from "react";
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
  TrendingUp,
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
  CircleDollarSign,
} from "lucide-react";

import { cn } from "@/lib/utils";

/* =========================
   Helpers (Dashboard formatting)
   - 1,000 / 20,000 / 1,500,000 (no decimals)
========================= */
const NF0 = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
function n0(v: any) {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}
function fmt(v: any) {
  return NF0.format(n0(v));
}
function fmtRs(v: any) {
  return `Rs ${fmt(v)}`;
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
function shortId(n: any) {
  const s = String(n ?? "");
  return s.length > 8 ? s.slice(0, 8) : s;
}
function fmtDate(d?: string) {
  if (!d) return "—";
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return d;
  return x.toLocaleDateString("en-GB").replaceAll("/", "-"); // DD-MM-YYYY
}

/* =========================
   Small UI components
========================= */
function RsIcon({ className }: { className?: string }) {
  // ✅ Make "Rs" red like the other icons
  return (
    <div className={cn("h-6 w-6 grid place-items-center font-extrabold tracking-tight text-primary", className)}>
      <span style={{ fontSize: 14, lineHeight: "14px" }}>Rs</span>
    </div>
  );
}

interface StatCardProps {
  title: string;
  value: string;
  changePct: number;
  icon: React.ComponentType<{ className?: string }>;
  trend: "up" | "down" | "neutral";
  hint?: string;
}

function StatCard({ title, value, changePct, icon: Icon, trend, hint }: StatCardProps) {
  return (
    <Card className="shadow-premium hover:shadow-lg transition-shadow">
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-3xl font-bold mt-2 text-foreground truncate">{value}</p>

            <div className="flex items-center gap-1 mt-2">
              {trend === "up" ? (
                <ArrowUpRight className="h-4 w-4 text-success" />
              ) : trend === "down" ? (
                <ArrowDownRight className="h-4 w-4 text-destructive" />
              ) : null}

              <span
                className={cn(
                  "text-sm font-medium",
                  trend === "up" && "text-success",
                  trend === "down" && "text-destructive",
                  trend === "neutral" && "text-muted-foreground"
                )}
              >
                {changePct > 0 ? "+" : ""}
                {changePct.toFixed(1)}%
              </span>
              <span className="text-sm text-muted-foreground">vs last month</span>
            </div>

            {hint ? <div className="mt-2 text-xs text-muted-foreground">{hint}</div> : null}
          </div>

          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
           <RsIcon className="h-6 w-6 text-primary" />
         </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface QuickActionProps {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
}

function QuickAction({ title, description, icon: Icon, href }: QuickActionProps) {
  return (
    <Link to={href}>
      <Card className="shadow-premium hover:shadow-lg transition-all hover:scale-[1.02] cursor-pointer group">
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
              <Icon className="h-6 w-6 text-primary group-hover:text-primary-foreground" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-foreground">{title}</h3>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function ErrorBox({ title, msg }: { title: string; msg: string }) {
  return (
    <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4">
      <div className="text-sm font-semibold text-destructive">{title}</div>
      <div className="mt-2 text-sm text-destructive/90 whitespace-pre-wrap">{msg}</div>
      <div className="mt-3 text-xs text-muted-foreground">
        If other pages load fine but Dashboard fails, it’s usually a missing column in a query. If everything fails, it’s RLS/policies.
      </div>
    </div>
  );
}

/* =========================
   Sales chart (Premium – wide, fits the blank area)
========================= */
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
  const max = Math.max(1, ...points.map((p) => n0(p.total)));
  const maxLabel = fmtRs(max);
  const total6 = points.reduce((s, p) => s + n0(p.total), 0);

  return (
    <div className="rp-sales">
      <div className="rp-topline">
        <div className="rp-kpi">
          <div className="rp-kpiLabel">6-month total</div>
          <div className="rp-kpiValue">{fmtRs(total6)}</div>
        </div>

        <div className="rp-kpi2">
          <div className="rp-kpiLabel">Best month</div>
          <div className="rp-kpiValue">{maxLabel}</div>
        </div>

        <div className="rp-miniHint">Hover bars for exact totals</div>
      </div>

      <div className="rp-grid">
        {points.map((p) => {
          const ratio = n0(p.total) / max;
          const h = Math.max(6, Math.round(ratio * 100));
          const isTop = n0(p.total) === max && max > 0;

          return (
            <div key={p.ym} className="rp-col" title={`${p.label}: ${fmtRs(p.total)}`}>
              <div className={cn("rp-barWrap", isTop && "rp-barWrapTop")}>
                <div className="rp-ambient" />
                <div className="rp-bar" style={{ height: `${h}%` }} />
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

      <style>{`
        .rp-sales{ position:relative; }
        .rp-topline{
          display:flex; align-items:flex-end; justify-content:space-between;
          gap: 14px; padding: 2px 2px 10px 2px;
        }
        .rp-kpi,.rp-kpi2{ display:flex; flex-direction:column; gap:2px; }
        .rp-kpiLabel{ font-size: 11px; color: rgba(15,23,42,.60); font-weight: 800; letter-spacing:.2px; }
        .rp-kpiValue{ font-size: 14px; font-weight: 950; letter-spacing:.2px; color: rgba(15,23,42,.88); }
        .rp-miniHint{ margin-left:auto; font-size: 12px; color: rgba(15,23,42,.55); }

        .rp-grid{
          height: 160px;
          display:grid;
          grid-template-columns: repeat(6, minmax(0, 1fr));
          gap: 14px;
          align-items:end;
        }
        .rp-col{ display:flex; flex-direction:column; align-items:center; gap: 10px; }

        .rp-barWrap{
          position:relative;
          width:100%;
          height: 120px;
          border-radius: 18px;
          background: linear-gradient(to bottom, rgba(2,6,23,.035), rgba(2,6,23,.012));
          border: 1px solid rgba(15,23,42,.09);
          overflow:hidden;
          box-shadow:
            0 18px 48px rgba(2,6,23,.06),
            0 1px 0 rgba(255,255,255,.55) inset;
        }
        .rp-ambient{
          position:absolute; inset:-60px -60px auto -60px;
          height: 140px;
          background: radial-gradient(circle at 30% 30%, rgba(185,28,28,.14), transparent 60%);
          filter: blur(12px);
          opacity: .9;
        }

        .rp-barWrapTop{
          border-color: rgba(185,28,28,.22);
          box-shadow:
            0 20px 60px rgba(185,28,28,.10),
            0 1px 0 rgba(255,255,255,.55) inset;
        }
        .rp-bar{
          position:absolute; left: 10px; right: 10px; bottom: 10px;
          border-radius: 14px;
          background: linear-gradient(to top, rgba(185,28,28,.22), rgba(185,28,28,.94));
          box-shadow:
            0 26px 55px rgba(185,28,28,.14),
            0 1px 0 rgba(255,255,255,.35) inset;
          transition: height .6s cubic-bezier(.2,.8,.2,1);
        }
        .rp-baseLine{
          position:absolute; left:0; right:0; bottom:0;
          height: 1px; background: rgba(15,23,42,.06);
        }
        .rp-gloss{
          pointer-events:none;
          position:absolute; inset:0;
          background: linear-gradient(120deg, transparent 18%, rgba(255,255,255,.24) 45%, transparent 72%);
          transform: translateX(-22%);
          animation: rpGloss 3.8s ease-in-out infinite;
          mix-blend-mode: soft-light;
        }
        @keyframes rpGloss{
          0%{ opacity:0; transform: translateX(-26%) skewX(-10deg); }
          12%{ opacity:.62; }
          52%{ opacity:.62; }
          72%{ opacity:0; }
          100%{ opacity:0; transform: translateX(26%) skewX(-10deg); }
        }
        .rp-x{
          font-size: 12px;
          color: rgba(15,23,42,.72);
          font-weight: 900;
          letter-spacing:.2px;
        }
        .rp-foot{
          margin-top: 10px;
          display:flex;
          align-items:center;
          justify-content:space-between;
          font-size: 12px;
          color: rgba(15,23,42,.55);
        }
        .rp-max{
          font-weight: 900;
          color: rgba(15,23,42,.82);
        }

        :root.dark .rp-kpiLabel{ color: rgba(226,232,240,.62); }
        :root.dark .rp-kpiValue{ color: rgba(226,232,240,.90); }
        :root.dark .rp-miniHint{ color: rgba(226,232,240,.62); }
        :root.dark .rp-barWrap{
          background: linear-gradient(to bottom, rgba(255,255,255,.06), rgba(255,255,255,.03));
          border-color: rgba(255,255,255,.10);
          box-shadow: 0 18px 55px rgba(0,0,0,.35);
        }
        :root.dark .rp-baseLine{ background: rgba(255,255,255,.08); }
        :root.dark .rp-x{ color: rgba(226,232,240,.78); }
        :root.dark .rp-foot{ color: rgba(226,232,240,.62); }
        :root.dark .rp-max{ color: rgba(226,232,240,.88); }
      `}</style>
    </div>
  );
}

/* =========================
   Paid vs Outstanding donut (no external libs)
========================= */
function Donut({
  paid,
  outstanding,
}: {
  paid: number;
  outstanding: number;
}) {
  const total = Math.max(1, n0(paid) + n0(outstanding));
  const paidPct = Math.max(0, Math.min(1, n0(paid) / total));
  const angle = paidPct * 360;

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
    <div className="rp-midValue">{Math.round(paidPct * 100)}%</div>
  </div>
</div>
      <div className="rp-legend">
        <div className="rp-legRow">
          <span className="rp-dot rp-dotPaid" />
          <span className="rp-legText">Paid</span>
          <span className="rp-legVal">{fmtRs(paid)}</span>
        </div>
        <div className="rp-legRow">
          <span className="rp-dot rp-dotOut" />
          <span className="rp-legText">Outstanding</span>
          <span className="rp-legVal">{fmtRs(outstanding)}</span>
        </div>
      </div>

      <style>{`
        .rp-donut{ display:flex; gap: 14px; align-items:center; justify-content:space-between; }
        .rp-ring{
          width: 128px; height: 128px; border-radius: 999px;
          box-shadow:
            0 18px 50px rgba(2,6,23,.10),
            0 1px 0 rgba(255,255,255,.55) inset;
          position: relative;
        }
        .rp-ring::after{
          content:"";
          position:absolute; inset: -18px;
          border-radius: 999px;
          background: radial-gradient(circle at 30% 30%, rgba(185,28,28,.10), transparent 60%);
          filter: blur(14px);
          opacity: .9;
          pointer-events:none;
        }
        .rp-hole{
         position:absolute;
         inset: 18px;              /* centers it inside the ring */
         border-radius: 999px;
         background: rgba(255,255,255,.95);
         border: 1px solid rgba(15,23,42,.08);
         display:flex; flex-direction:column; align-items:center; justify-content:center;
         box-shadow: 0 10px 30px rgba(2,6,23,.06);
        }
        :root.dark .rp-hole{
          background: rgba(2,6,23,.75);
          border-color: rgba(255,255,255,.10);
          box-shadow: 0 16px 40px rgba(0,0,0,.35);
        }
        .rp-midLabel{ font-size: 11px; font-weight: 800; color: rgba(15,23,42,.62); }
        .rp-midValue{ font-size: 18px; font-weight: 950; color: rgba(15,23,42,.88); letter-spacing:.2px; }
        :root.dark .rp-midLabel{ color: rgba(226,232,240,.62); }
        :root.dark .rp-midValue{ color: rgba(226,232,240,.90); }

        .rp-legend{ display:flex; flex-direction:column; gap: 8px; flex:1; }
        .rp-legRow{
          display:grid; grid-template-columns: 14px 1fr auto;
          gap: 8px; align-items:center;
          padding: 8px 10px;
          border-radius: 12px;
          border: 1px solid rgba(15,23,42,.08);
          background: rgba(2,6,23,.02);
        }
        :root.dark .rp-legRow{
          border-color: rgba(255,255,255,.10);
          background: rgba(255,255,255,.04);
        }
        .rp-dot{ width:10px; height:10px; border-radius:999px; }
        .rp-dotPaid{ background: rgba(185,28,28,.92); box-shadow: 0 0 0 3px rgba(185,28,28,.14); }
        .rp-dotOut{ background: rgba(15,23,42,.35); box-shadow: 0 0 0 3px rgba(15,23,42,.10); }
        :root.dark .rp-dotOut{ background: rgba(226,232,240,.35); box-shadow: 0 0 0 3px rgba(226,232,240,.10); }
        .rp-legText{ font-size: 12px; font-weight: 800; color: rgba(15,23,42,.72); }
        :root.dark .rp-legText{ color: rgba(226,232,240,.78); }
        .rp-legVal{ font-size: 12px; font-weight: 900; color: rgba(15,23,42,.86); }
        :root.dark .rp-legVal{ color: rgba(226,232,240,.90); }

        @media (max-width: 520px){
          .rp-donut{ flex-direction:column; align-items:flex-start; }
          .rp-ring{ margin-bottom: 8px; }
        }
      `}</style>
    </div>
  );
}

/* =========================
   Page
========================= */
export default function Dashboard() {
  // ✅ Toggle: MTD vs Last 30 Days
  const [useRolling30, setUseRolling30] = useState(true);

  const fromThis = useRolling30 ? rollingDaysISO(30) : startOfMonthISO();
  const toToday = todayISO();

  const fromPrev = startOfPrevMonthISO();
  const toPrev = endOfPrevMonthISO();

  /* =========================
     Queries (REAL DATA)
  ========================= */
  const invoicesThisQ = useQuery({
    queryKey: ["dash_invoices_this", fromThis, toToday],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select(
          "id,invoice_number,customer_id,invoice_date,due_date,total_amount,vat_amount,subtotal,status,amount_paid,balance_remaining"
        )
        .gte("invoice_date", fromThis)
        .lte("invoice_date", toToday)
        .order("invoice_date", { ascending: false })
        .limit(400);
      if (error) throw error;
      return (data ?? []) as any[];
    },
    staleTime: 8_000,
  });

  const invoicesPrevQ = useQuery({
    queryKey: ["dash_invoices_prev", fromPrev, toPrev],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id,total_amount")
        .gte("invoice_date", fromPrev)
        .lte("invoice_date", toPrev);
      if (error) throw error;
      return (data ?? []) as any[];
    },
    staleTime: 20_000,
  });

  const paymentsThisQ = useQuery({
    queryKey: ["dash_payments_this", fromThis, toToday],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("id,customer_id,invoice_id,payment_date,amount,payment_method,notes")
        .gte("payment_date", fromThis)
        .lte("payment_date", toToday)
        .order("payment_date", { ascending: false })
        .limit(400);
      if (error) throw error;
      return (data ?? []) as any[];
    },
    staleTime: 8_000,
  });

  const paymentsPrevQ = useQuery({
    queryKey: ["dash_payments_prev", fromPrev, toPrev],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("id,amount")
        .gte("payment_date", fromPrev)
        .lte("payment_date", toPrev);
      if (error) throw error;
      return (data ?? []) as any[];
    },
    staleTime: 20_000,
  });

  // ✅ customers.company_name does not exist -> use columns you actually have
  const customersQ = useQuery({
    queryKey: ["dash_customers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("id,name,customer_code");
      if (error) throw error;
      return (data ?? []) as any[];
    },
    staleTime: 60_000,
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
    staleTime: 30_000,
  });

  const supplierBillsOpenQ = useQuery({
    queryKey: ["dash_supplier_bills_open"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supplier_bills")
        .select("id,total_amount,status,due_date,bill_date")
        .in("status", ["OPEN", "PARTIALLY_PAID"])
        .order("bill_date", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as any[];
    },
    staleTime: 30_000,
  });

  // ✅ Recent invoices should be real & always show (not only this month)
  const recentInvoicesQ = useQuery({
    queryKey: ["dash_recent_invoices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id,invoice_number,customer_id,invoice_date,total_amount,balance_remaining,status")
        .order("invoice_date", { ascending: false })
        .limit(15);
      if (error) throw error;
      return (data ?? []) as any[];
    },
    staleTime: 8_000,
  });

  // ✅ Sales per month (last 6 months) from invoices totals
  const sales6mQ = useQuery({
    queryKey: ["dash_sales_6m"],
    queryFn: async () => {
      const now = new Date();
      const from = new Date(now.getFullYear(), now.getMonth() - 5, 1);
      const fromISO = from.toISOString().slice(0, 10);
      const toISO = todayISO();

      const { data, error } = await supabase
        .from("invoices")
        .select("invoice_date,total_amount")
        .gte("invoice_date", fromISO)
        .lte("invoice_date", toISO);

      if (error) throw error;
      return (data ?? []) as { invoice_date: string; total_amount: any }[];
    },
    staleTime: 10_000,
  });

  const anyLoading =
    invoicesThisQ.isLoading ||
    invoicesPrevQ.isLoading ||
    paymentsThisQ.isLoading ||
    paymentsPrevQ.isLoading ||
    customersQ.isLoading ||
    productsQ.isLoading ||
    supplierBillsOpenQ.isLoading ||
    sales6mQ.isLoading ||
    recentInvoicesQ.isLoading;

  const anyError =
    invoicesThisQ.error ||
    invoicesPrevQ.error ||
    paymentsThisQ.error ||
    paymentsPrevQ.error ||
    customersQ.error ||
    productsQ.error ||
    supplierBillsOpenQ.error ||
    sales6mQ.error ||
    recentInvoicesQ.error;

  /* =========================
     Derived maps + KPIs
  ========================= */
  const customerNameById = useMemo(() => {
    const m = new Map<number, string>();
    (customersQ.data ?? []).forEach((c: any) => {
      const id = Number(c.id);
      const name = c.name || c.customer_name || c.business_name || `Customer #${id}`;
      if (Number.isFinite(id)) m.set(id, String(name));
    });
    return m;
  }, [customersQ.data]);

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

    const revenueThis = invThis.reduce((s, r) => s + n0(r.total_amount), 0);
    const revenuePrev = invPrev.reduce((s, r) => s + n0(r.total_amount), 0);

    const paymentsThis = payThis.reduce((s, r) => s + n0(r.amount), 0);
    const paymentsPrev = payPrev.reduce((s, r) => s + n0(r.amount), 0);

    const invoicesThisCount = invThis.length;
    const invoicesPrevCount = invPrev.length;

    const activeSkus = prods.filter((p: any) => p.is_active ?? true).length;

    const lowStock = prods
      .filter((p: any) => (p.is_active ?? true) && n0(p.reorder_level) > 0)
      .filter((p: any) => n0(p.current_stock) <= n0(p.reorder_level));
    const lowStockCount = lowStock.length;

    // Paid vs Outstanding (from invoices in selected window)
    const paid = invThis.reduce((s, i: any) => s + Math.min(n0(i.amount_paid), n0(i.total_amount)), 0);
    const outstanding = invThis.reduce((s, i: any) => s + Math.max(0, n0(i.balance_remaining)), 0);

    // Cashflow KPI (Invoices - Payments)
    const cashflow = revenueThis - paymentsThis;

    // Overdue invoices
    const t = todayISO();
    const overdue = invThis
      .filter((i: any) => n0(i.balance_remaining) > 0 && i.due_date && String(i.due_date) < t)
      .map((i: any) => ({ ...i, balance: n0(i.balance_remaining) }))
      .sort((a: any, b: any) => b.balance - a.balance);

    const overdueCount = overdue.length;
    const overdueTotal = overdue.reduce((s: number, r: any) => s + n0(r.balance_remaining), 0);

    // AP due soon/overdue
    let apDueSoon = 0;
    let apOverdue = 0;
    const now = new Date();
    openBills.forEach((b: any) => {
      if (!b.due_date) return;
      const due = new Date(b.due_date);
      const days = Math.floor((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      const amt = n0(b.total_amount);
      if (days >= 0 && days <= 14) apDueSoon += amt;
      if (days < 0) apOverdue += amt;
    });

    const revenueChange = pctChange(revenueThis, revenuePrev);
    const paymentsChange = pctChange(paymentsThis, paymentsPrev);
    const invoicesChange = pctChange(invoicesThisCount, invoicesPrevCount);

    return {
      revenueThis,
      revenueChange,
      invoicesThisCount,
      invoicesChange,
      activeSkus,
      paymentsThis,
      paymentsChange,
      overdueCount,
      overdueTotal,
      lowStockCount,
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
          onHand: n0(p.current_stock),
          min: n0(p.reorder_level),
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
    return list.slice(0, 12).map((i: any) => ({
      id: i.id,
      invoice_number: i.invoice_number || `INV-${shortId(i.id)}`,
      invoice_date: i.invoice_date,
      customer: customerNameById.get(Number(i.customer_id)) || `Customer #${i.customer_id}`,
      total: n0(i.total_amount),
      balance: n0(i.balance_remaining),
      status: String(i.status ?? "—"),
    }));
  }, [recentInvoicesQ.data, customerNameById]);

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
      totals.set(k, (totals.get(k) || 0) + n0(row.total_amount));
    });

    return months.map((ym) => ({
      ym,
      label: monthLabel(ym),
      total: totals.get(ym) || 0,
    }));
  }, [sales6mQ.data]);

  const quickActions: QuickActionProps[] = [
    { title: "Create Invoice", description: "Generate a new invoice", icon: FileText, href: "/invoices/create" },
    { title: "Create Quotation", description: "Prepare a quote", icon: Plus, href: "/quotations/create" },
    { title: "Add Customer", description: "Register a new customer", icon: Users, href: "/customers" },
    { title: "Stock Movements", description: "Adjust inventory & track", icon: Package, href: "/stock-movements" },
  ];

  function refetchAll() {
    invoicesThisQ.refetch();
    invoicesPrevQ.refetch();
    paymentsThisQ.refetch();
    paymentsPrevQ.refetch();
    customersQ.refetch();
    productsQ.refetch();
    supplierBillsOpenQ.refetch();
    sales6mQ.refetch();
    recentInvoicesQ.refetch();
  }

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header (premium) */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-bold text-foreground tracking-tight">Ram Pottery Hub</h1>

            <Badge variant="secondary" className="border">
              Live
            </Badge>

            <Badge variant="secondary" className="border flex items-center gap-2">
              <Clock className="h-3.5 w-3.5" />
              Last invoice: <span className="font-semibold">{lastInvoiceDate}</span>
            </Badge>
          </div>

          <p className="text-muted-foreground mt-1">Dashboard • Luxury overview</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* ✅ Toggle MTD ↔ Rolling 30 */}
          <div className="flex items-center gap-2 rounded-xl border bg-card/70 px-3 py-2 shadow-premium">
            <span className={cn("text-xs font-semibold", !useRolling30 ? "text-foreground" : "text-muted-foreground")}>
              MTD
            </span>
            <Switch checked={useRolling30} onCheckedChange={(v) => setUseRolling30(!!v)} />
            <span className={cn("text-xs font-semibold", useRolling30 ? "text-foreground" : "text-muted-foreground")}>
              Last 30 Days
            </span>
          </div>

          <Button variant="outline" onClick={refetchAll} disabled={anyLoading}>
            <RefreshCw className={cn("h-4 w-4 mr-2", anyLoading && "animate-spin")} />
            {anyLoading ? "Loading..." : "Refresh"}
          </Button>

          <Button asChild className="gradient-primary shadow-glow text-primary-foreground">
            <Link to="/invoices/create">
              <Plus className="h-4 w-4 mr-2" />
              New Invoice
            </Link>
          </Button>
        </div>
      </div>

      {/* Errors */}
      {anyError ? (
        <ErrorBox
          title="Failed to load dashboard data (RLS / permissions / missing columns)"
          msg={(anyError as any)?.message || "Unknown error"}
        />
      ) : null}

      {/* KPI Grid */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title={useRolling30 ? "Revenue (Last 30 Days)" : "Revenue (MTD)"}
          value={fmtRs(kpis.revenueThis)}
          changePct={kpis.revenueChange}
          icon={RsIcon as any}
          trend={trendFromPct(kpis.revenueChange)}
          hint="From invoices.total_amount"
        />
        <StatCard
          title={useRolling30 ? "Payments (Last 30 Days)" : "Payments Received (MTD)"}
          value={fmtRs(kpis.paymentsThis)}
          changePct={kpis.paymentsChange}
          icon={Wallet}
          trend={trendFromPct(kpis.paymentsChange)}
          hint="From payments.amount"
        />
        <StatCard
          title={useRolling30 ? "Invoices (Last 30 Days)" : "Invoices Created (MTD)"}
          value={`${fmt(kpis.invoicesThisCount)}`}
          changePct={kpis.invoicesChange}
          icon={FileText}
          trend={trendFromPct(kpis.invoicesChange)}
          hint="Invoice volume"
        />
        <StatCard
          title="Stock Items (Active)"
          value={`${fmt(kpis.activeSkus)}`}
          changePct={0}
          icon={Package}
          trend="neutral"
          hint={`Low stock: ${fmt(kpis.lowStockCount)}`}
        />
      </div>

      {/* ✅ New premium KPI row: Cashflow + Paid/Outstanding donut */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="shadow-premium lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Cashflow</CardTitle>
            <CardDescription>Invoices − Payments (selected window)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-3xl font-black tracking-tight">{fmtRs(kpis.cashflow)}</div>
                <div className="mt-2 text-sm text-muted-foreground">
                  {useRolling30 ? "Last 30 days" : "MTD"} • Live
                </div>
              </div>
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <CircleDollarSign className="h-6 w-6 text-primary" />
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl border bg-card/70 p-3">
                <div className="text-xs text-muted-foreground font-semibold">Invoices</div>
                <div className="mt-1 text-sm font-extrabold">{fmtRs(kpis.revenueThis)}</div>
              </div>
              <div className="rounded-xl border bg-card/70 p-3">
                <div className="text-xs text-muted-foreground font-semibold">Payments</div>
                <div className="mt-1 text-sm font-extrabold">{fmtRs(kpis.paymentsThis)}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-premium lg:col-span-2 overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Paid vs Outstanding</CardTitle>
            <CardDescription>Based on invoice paid + balance (selected window)</CardDescription>
          </CardHeader>
          <CardContent>
            <Donut paid={kpis.paid} outstanding={kpis.outstanding} />
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions + Alerts rail (Sales chart moved UP into the blank space) */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* LEFT (2 cols) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Quick Actions</h2>
            <Badge variant="secondary" className="border">
              ERP Shortcuts
            </Badge>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {quickActions.map((action) => (
              <QuickAction key={action.title} {...action} />
            ))}
          </div>

          {/* Insights row */}
          <div className="grid gap-4 sm:grid-cols-3">
            <Card className="shadow-premium">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs text-muted-foreground">AR (Overdue)</div>
                    <div className="mt-1 text-lg font-semibold">{fmtRs(kpis.overdueTotal)}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{fmt(kpis.overdueCount)} invoices overdue</div>
                  </div>
                  <div className="h-10 w-10 rounded-xl border bg-background flex items-center justify-center text-muted-foreground">
                    <Clock className="h-5 w-5" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-premium">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs text-muted-foreground">AP Due Soon</div>
                    <div className="mt-1 text-lg font-semibold">{fmtRs(kpis.apDueSoon)}</div>
                    <div className="mt-1 text-xs text-muted-foreground">Supplier bills due ≤ 14 days</div>
                  </div>
                  <div className="h-10 w-10 rounded-xl border bg-background flex items-center justify-center text-muted-foreground">
                    <Landmark className="h-5 w-5" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-premium">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs text-muted-foreground">Low Stock Alerts</div>
                    <div className="mt-1 text-lg font-semibold">{fmt(kpis.lowStockCount)}</div>
                    <div className="mt-1 text-xs text-muted-foreground">Items at/below reorder level</div>
                  </div>
                  <div className="h-10 w-10 rounded-xl border bg-background flex items-center justify-center text-muted-foreground">
                    <Package className="h-5 w-5" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ✅ Sales chart (same size, more premium/luxury) */}
          <Card className="shadow-premium overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle>Sales per month</CardTitle>
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

        {/* RIGHT rail */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Alerts</h2>
            <Badge variant="secondary" className="border">
              Live
            </Badge>
          </div>

          <Card className="shadow-premium">
            <CardContent className="p-4 space-y-4">
              <div className="flex items-start gap-3 p-3 rounded-lg bg-warning/10">
                <Clock className="h-5 w-5 text-warning mt-0.5" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{fmt(kpis.overdueCount)} invoices overdue</p>
                  <p className="text-xs text-muted-foreground">Total outstanding: {fmtRs(kpis.overdueTotal)}</p>
                  <Button asChild variant="link" className="px-0 h-auto text-sm">
                    <Link to="/invoices">View invoices</Link>
                  </Button>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-lg bg-destructive/10">
                <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">Low stock alert</p>
                  <p className="text-xs text-muted-foreground">{fmt(kpis.lowStockCount)} items below reorder level</p>
                  <Button asChild variant="link" className="px-0 h-auto text-sm">
                    <Link to="/stock">Open stock</Link>
                  </Button>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-lg bg-primary/10">
                <Receipt className="h-5 w-5 text-primary mt-0.5" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">AP due soon</p>
                  <p className="text-xs text-muted-foreground">{fmtRs(kpis.apDueSoon)} due within 14 days</p>
                  <Button asChild variant="link" className="px-0 h-auto text-sm">
                    <Link to="/ap/bills">Supplier bills</Link>
                  </Button>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-lg bg-success/10">
                <TrendingUp className="h-5 w-5 text-success mt-0.5" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    Revenue change: {kpis.revenueChange > 0 ? "+" : ""}
                    {kpis.revenueChange.toFixed(1)}%
                  </p>
                  <p className="text-xs text-muted-foreground">Compared to last month</p>
                  <Button asChild variant="link" className="px-0 h-auto text-sm">
                    <Link to="/reports">Open reports</Link>
                  </Button>
                </div>
              </div>

              {/* Tiny quality indicator */}
              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
                <CheckCircle2 className="h-5 w-5 text-foreground/70 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">System healthy</p>
                  <p className="text-xs text-muted-foreground">Live sync from Supabase</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-premium">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Top Low Stock</CardTitle>
              <CardDescription>Action list</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {kpis.lowStockTop.map((p) => (
                  <div key={p.id} className="flex items-center justify-between rounded-lg border bg-background px-3 py-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">
                        {p.sku} • {p.name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Reorder: {fmt(p.min)} • On hand: {fmt(p.onHand)}
                      </div>
                    </div>
                    <Badge variant="secondary" className="border bg-rose-500/10 text-rose-700">
                      Low
                    </Badge>
                  </div>
                ))}
                {kpis.lowStockTop.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No low stock items 🎉</div>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ✅ Recent Invoices FULL WIDTH (down) */}
      <Card className="shadow-premium w-full">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Recent Invoices</CardTitle>
            <CardDescription>Latest invoices (real data)</CardDescription>
          </div>

          <Button asChild variant="outline">
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
              <Button asChild className="mt-4">
                <Link to="/invoices/create">Create Your First Invoice</Link>
              </Button>
            </div>
          ) : (
            <div className="overflow-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/20">
                  <tr>
                    <th className="text-left p-3">Invoice</th>
                    <th className="text-left p-3">Customer</th>
                    <th className="text-left p-3">Date</th>
                    <th className="text-left p-3">Status</th>
                    <th className="text-right p-3">Total</th>
                    <th className="text-right p-3">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {recentInvoices.map((r) => (
                    <tr key={r.id} className="hover:bg-muted/30">
                      <td className="p-3 font-medium">
                        <Link to={`/invoices/${r.id}`} className="hover:underline">
                          {r.invoice_number}
                        </Link>
                      </td>
                      <td className="p-3">{r.customer}</td>
                      <td className="p-3 text-muted-foreground">{fmtDate(r.invoice_date)}</td>
                      <td className="p-3">
                        <Badge variant="secondary" className="border">
                          {r.status}
                        </Badge>
                      </td>
                      <td className="p-3 text-right font-semibold">{fmtRs(r.total)}</td>
                      <td className="p-3 text-right">{fmtRs(r.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ✅ Footer centered */}
      <div className="pt-2 pb-2 text-xs text-muted-foreground">
        <div className="flex flex-col items-center justify-center gap-1 text-center">
          <div>© {new Date().getFullYear()} Ram Pottery Ltd. All rights reserved.</div>
          <div>
            Built by{" "}
            <a
              href="https://mobiz.mu"
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-foreground hover:underline"
            >
              mobiz.mu
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

