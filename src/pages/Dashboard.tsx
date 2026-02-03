// src/pages/Dashboard.tsx
import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import {
  FileText,
  Users,
  Package,
  TrendingUp,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  Plus,
  Clock,
  AlertCircle,
  RefreshCw,
  Wallet,
  Landmark,
  Receipt,
} from "lucide-react";

import { cn } from "@/lib/utils";

/* =========================
   Helpers
========================= */
function money(v: any) {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return "0.00";
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function safeNum(v: any) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function startOfMonthISO() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function startOfPrevMonthISO() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() - 1, 1).toISOString().slice(0, 10);
}
function endOfPrevMonthISO() {
  const d = new Date();
  // day 0 of current month => last day of previous month
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

/* =========================
   Small UI components
========================= */
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
            <Icon className="h-6 w-6 text-primary" />
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
        If other pages load fine but Dashboard fails, it’s usually a missing column in a query. If everything fails, it’s
        RLS/policies.
      </div>
    </div>
  );
}

/* =========================
   Page
========================= */
export default function Dashboard() {
  const fromThisMonth = startOfMonthISO();
  const toToday = todayISO();
  const fromPrev = startOfPrevMonthISO();
  const toPrev = endOfPrevMonthISO();

  /* =========================
     Queries (REAL DATA)
     Uses your tables:
     invoices, invoice_payments, customers, products, supplier_bills
  ========================= */

  const invoicesThisQ = useQuery({
    queryKey: ["dash_invoices_this", fromThisMonth, toToday],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select(
          "id,invoice_number,customer_id,invoice_date,due_date,total_amount,vat_amount,subtotal,status,amount_paid,balance_remaining"
        )
        .gte("invoice_date", fromThisMonth)
        .lte("invoice_date", toToday)
        .order("invoice_date", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as any[];
    },
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
  });

  // Payments received (customer receipts) — payments table includes customer_id + payment_method
  const paymentsThisQ = useQuery({
    queryKey: ["dash_payments_this", fromThisMonth, toToday],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("id,customer_id,invoice_id,payment_date,amount,payment_method,notes")
        .gte("payment_date", fromThisMonth)
        .lte("payment_date", toToday)
        .order("payment_date", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as any[];
    },
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
  });

  const customersQ = useQuery({
    queryKey: ["dash_customers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("*");
      if (error) throw error;
      return (data ?? []) as any[];
    },
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
  });

  const anyLoading =
    invoicesThisQ.isLoading ||
    invoicesPrevQ.isLoading ||
    paymentsThisQ.isLoading ||
    paymentsPrevQ.isLoading ||
    customersQ.isLoading ||
    productsQ.isLoading ||
    supplierBillsOpenQ.isLoading;

  const anyError =
    invoicesThisQ.error ||
    invoicesPrevQ.error ||
    paymentsThisQ.error ||
    paymentsPrevQ.error ||
    customersQ.error ||
    productsQ.error ||
    supplierBillsOpenQ.error;

  /* =========================
     Derived maps + KPIs
  ========================= */
  const customerNameById = useMemo(() => {
    const m = new Map<number, string>();
    (customersQ.data ?? []).forEach((c: any) => {
      const id = Number(c.id);
      const name =
        c.company_name || c.name || c.full_name || c.customer_name || c.business_name || `Customer #${id}`;
      if (Number.isFinite(id)) m.set(id, String(name));
    });
    return m;
  }, [customersQ.data]);

  const kpis = useMemo(() => {
    const invThis = invoicesThisQ.data ?? [];
    const invPrev = invoicesPrevQ.data ?? [];
    const payThis = paymentsThisQ.data ?? [];
    const payPrev = paymentsPrevQ.data ?? [];
    const prods = productsQ.data ?? [];
    const openBills = supplierBillsOpenQ.data ?? [];

    const revenueThis = invThis.reduce((s, r) => s + safeNum(r.total_amount), 0);
    const revenuePrev = invPrev.reduce((s, r) => s + safeNum(r.total_amount), 0);

    const paymentsThis = payThis.reduce((s, r) => s + safeNum(r.amount), 0);
    const paymentsPrev = payPrev.reduce((s, r) => s + safeNum(r.amount), 0);

    const invoicesThisCount = invThis.length;
    const invoicesPrevCount = invPrev.length;

    const customersCount = (customersQ.data ?? []).length;

    const activeSkus = prods.filter((p: any) => p.is_active ?? true).length;

    const lowStock = prods
      .filter((p: any) => (p.is_active ?? true) && safeNum(p.reorder_level) > 0)
      .filter((p: any) => safeNum(p.current_stock) <= safeNum(p.reorder_level));

    const lowStockCount = lowStock.length;

    // Overdue invoices (balance_remaining > 0 and due_date < today)
    const t = todayISO();
    const overdue = invThis
      .filter((i: any) => safeNum(i.balance_remaining) > 0 && i.due_date && String(i.due_date) < t)
      .map((i: any) => ({ ...i, balance: safeNum(i.balance_remaining) }))
      .sort((a: any, b: any) => b.balance - a.balance);

    const overdueCount = overdue.length;
    const overdueTotal = overdue.reduce((s: number, r: any) => s + safeNum(r.balance_remaining), 0);

    // Open supplier bills due soon/overdue (for AP alert)
    let apDueSoon = 0;
    let apOverdue = 0;
    const now = new Date();
    openBills.forEach((b: any) => {
      if (!b.due_date) return;
      const due = new Date(b.due_date);
      const days = Math.floor((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)); // future positive
      const amt = safeNum(b.total_amount);
      if (days >= 0 && days <= 14) apDueSoon += amt;
      if (days < 0) apOverdue += amt;
    });

    const revenueChange = pctChange(revenueThis, revenuePrev);
    const paymentsChange = pctChange(paymentsThis, paymentsPrev);
    const invoicesChange = pctChange(invoicesThisCount, invoicesPrevCount);
    // customers change needs historical snapshots, so keep neutral
    const customersChange = 0;
    const stockChange = 0;

    return {
      revenueThis,
      revenueChange,
      invoicesThisCount,
      invoicesChange,
      customersCount,
      customersChange,
      activeSkus,
      stockChange,
      paymentsThis,
      paymentsChange,
      overdueCount,
      overdueTotal,
      lowStockCount,
      apDueSoon,
      apOverdue,
      overdueTop: overdue.slice(0, 8),
      lowStockTop: lowStock
        .map((p: any) => ({
          id: p.id,
          sku: p.sku || p.item_code || `#${p.id}`,
          name: p.name,
          onHand: safeNum(p.current_stock),
          min: safeNum(p.reorder_level),
        }))
        .sort((a: any, b: any) => a.onHand - b.onHand)
        .slice(0, 8),
    };
  }, [
    invoicesThisQ.data,
    invoicesPrevQ.data,
    paymentsThisQ.data,
    paymentsPrevQ.data,
    customersQ.data,
    productsQ.data,
    supplierBillsOpenQ.data,
  ]);

  const recentInvoices = useMemo(() => {
    const list = invoicesThisQ.data ?? [];
    return list.slice(0, 10).map((i: any) => ({
      id: i.id,
      invoice_number: i.invoice_number || `INV-${shortId(i.id)}`,
      invoice_date: i.invoice_date,
      due_date: i.due_date,
      customer: customerNameById.get(Number(i.customer_id)) || `Customer #${i.customer_id}`,
      total: safeNum(i.total_amount),
      balance: safeNum(i.balance_remaining),
      status: String(i.status ?? "—"),
    }));
  }, [invoicesThisQ.data, customerNameById]);

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
  }

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Premium overview • Real-time figures • Month-to-date: <b>{fromThisMonth}</b> → <b>{toToday}</b>
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={refetchAll} disabled={anyLoading}>
            <RefreshCw className="h-4 w-4 mr-2" />
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
        <ErrorBox title="Failed to load dashboard data (RLS / permissions)" msg={(anyError as any)?.message || "Unknown error"} />
      ) : null}

      {/* KPI Grid (premium) */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Revenue (MTD)"
          value={`Rs ${money(kpis.revenueThis)}`}
          changePct={kpis.revenueChange}
          icon={DollarSign}
          trend={trendFromPct(kpis.revenueChange)}
          hint="From invoices.total_amount"
        />
        <StatCard
          title="Payments Received (MTD)"
          value={`Rs ${money(kpis.paymentsThis)}`}
          changePct={kpis.paymentsChange}
          icon={Wallet}
          trend={trendFromPct(kpis.paymentsChange)}
          hint="From payments.amount"
        />
        <StatCard
          title="Invoices Created (MTD)"
          value={`${kpis.invoicesThisCount}`}
          changePct={kpis.invoicesChange}
          icon={FileText}
          trend={trendFromPct(kpis.invoicesChange)}
          hint="Invoice volume"
        />
        <StatCard
          title="Stock Items (Active)"
          value={`${kpis.activeSkus}`}
          changePct={kpis.stockChange}
          icon={Package}
          trend="neutral"
          hint={`Low stock: ${kpis.lowStockCount}`}
        />
      </div>

      {/* Quick Actions + Right Rail */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Quick Actions */}
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

          {/* Premium “Insights” row */}
          <div className="grid gap-4 sm:grid-cols-3">
            <Card className="shadow-premium">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs text-muted-foreground">AR (Overdue)</div>
                    <div className="mt-1 text-lg font-semibold">Rs {money(kpis.overdueTotal)}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{kpis.overdueCount} invoices overdue</div>
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
                    <div className="mt-1 text-lg font-semibold">Rs {money(kpis.apDueSoon)}</div>
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
                    <div className="mt-1 text-lg font-semibold">{kpis.lowStockCount}</div>
                    <div className="mt-1 text-xs text-muted-foreground">Items at/below reorder level</div>
                  </div>
                  <div className="h-10 w-10 rounded-xl border bg-background flex items-center justify-center text-muted-foreground">
                    <Package className="h-5 w-5" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Alerts & Notifications */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Alerts</h2>
            <Badge variant="secondary" className="border">
              Live
            </Badge>
          </div>

          <Card className="shadow-premium">
            <CardContent className="p-4 space-y-4">
              {/* Overdue invoices */}
              <div className="flex items-start gap-3 p-3 rounded-lg bg-warning/10">
                <Clock className="h-5 w-5 text-warning mt-0.5" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{kpis.overdueCount} invoices overdue</p>
                  <p className="text-xs text-muted-foreground">Total outstanding: Rs {money(kpis.overdueTotal)}</p>
                  <Button asChild variant="link" className="px-0 h-auto text-sm">
                    <Link to="/invoices">View invoices</Link>
                  </Button>
                </div>
              </div>

              {/* Low stock */}
              <div className="flex items-start gap-3 p-3 rounded-lg bg-destructive/10">
                <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">Low stock alert</p>
                  <p className="text-xs text-muted-foreground">{kpis.lowStockCount} items below reorder level</p>
                  <Button asChild variant="link" className="px-0 h-auto text-sm">
                    <Link to="/stock">Open stock</Link>
                  </Button>
                </div>
              </div>

              {/* AP */}
              <div className="flex items-start gap-3 p-3 rounded-lg bg-primary/10">
                <Receipt className="h-5 w-5 text-primary mt-0.5" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">AP due soon</p>
                  <p className="text-xs text-muted-foreground">Rs {money(kpis.apDueSoon)} due within 14 days</p>
                  <Button asChild variant="link" className="px-0 h-auto text-sm">
                    <Link to="/ap/bills">Supplier bills</Link>
                  </Button>
                </div>
              </div>

              {/* Growth hint */}
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
                        Reorder: {p.min} • On hand: {p.onHand}
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

      {/* Recent Invoices (real) */}
      <Card className="shadow-premium">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Recent Invoices</CardTitle>
            <CardDescription>Latest invoices created (this month)</CardDescription>
          </div>

          <Button asChild variant="outline">
            <Link to="/invoices">View all</Link>
          </Button>
        </CardHeader>

        <CardContent>
          {anyLoading ? (
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
                      <td className="p-3 text-muted-foreground">{r.invoice_date}</td>
                      <td className="p-3">
                        <Badge variant="secondary" className="border">
                          {r.status}
                        </Badge>
                      </td>
                      <td className="p-3 text-right font-semibold">Rs {money(r.total)}</td>
                      <td className="p-3 text-right">Rs {money(r.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Small footer note */}
      <div className="text-xs text-muted-foreground">
        Data sources: invoices (MTD + prev), payments (MTD + prev), customers, products, supplier_bills (OPEN/PARTIALLY_PAID).
      </div>
    </div>
  );
}
