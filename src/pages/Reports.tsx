// src/pages/Reports.tsx
import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

import {
  BarChart3,
  TrendingUp,
  FileText,
  Users,
  Package,
  Wallet,
  Landmark,
  Receipt,
  Percent,
  Download,
  RefreshCw,
  Calendar,
  ArrowUpRight,
} from "lucide-react";

/* =========================
  Helpers
========================= */
function money(v: any) {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return "0.00";
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function pct(v: any) {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return "0%";
  return `${n.toFixed(1)}%`;
}
type DatePreset = "TODAY" | "7D" | "30D" | "MTD" | "YTD" | "CUSTOM";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function startOfMonthISO() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function startOfYearISO() {
  const d = new Date();
  return new Date(d.getFullYear(), 0, 1).toISOString().slice(0, 10);
}
function isBetweenDateISO(dateISO: string | null | undefined, from: string, to: string) {
  if (!dateISO) return false;
  return dateISO >= from && dateISO <= to;
}

function downloadCSV(filename: string, rows: Array<Record<string, any>>) {
  const safe = (v: any) => {
    const s = String(v ?? "");
    // escape quotes
    const x = s.replace(/"/g, '""');
    // wrap if needed
    if (/[",\n]/.test(x)) return `"${x}"`;
    return x;
  };

  const headers = Array.from(
    rows.reduce((set, r) => {
      Object.keys(r || {}).forEach((k) => set.add(k));
      return set;
    }, new Set<string>())
  );

  const csv = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => safe((r as any)[h])).join(",")),
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  a.click();

  URL.revokeObjectURL(url);
}

/* =========================
  Types (based on your DB)
========================= */
type InvoiceRow = {
  id: number;
  invoice_number: string | null;
  customer_id: number;
  invoice_date: string; // date
  due_date: string | null;
  subtotal: number | null;
  vat_amount: number | null;
  total_amount: number | null;
  status: string | null;
  amount_paid: number | null;
  balance_remaining: number | null;
  previous_balance: number | null;
  discount_percent: number | null;
  discount_amount: number | null;
  vat_percent: number | null;
};

type InvoicePaymentRow = {
  id: number;
  invoice_id: number;
  payment_date: string; // date
  amount: number | null;
  method: string | null;
  reference: string | null;
  notes: string | null;
  created_at: string;
};

type PaymentRow = {
  id: number;
  customer_id: number;
  invoice_id: number | null;
  payment_date: string;
  amount: number | null;
  payment_method: string | null;
  notes: string | null;
  created_at: string | null;
};

type CustomerRow = {
  id: number;
  name?: string | null;
  company_name?: string | null;
  full_name?: string | null;
  phone?: string | null;
  email?: string | null;
};

type ProductRow = {
  id: number;
  sku: string | null;
  item_code: string | null;
  name: string;
  current_stock: number | null;
  reorder_level: number | null;
  selling_price: number | null;
  cost_price: number | null;
  is_active: boolean | null;
};

type StockMoveRow = {
  id: number;
  product_id: number;
  movement_date: string;
  movement_type: "IN" | "OUT" | "ADJUSTMENT";
  quantity: number | null;
  reference: string | null;
  source_table: string | null;
  source_id: number | null;
  notes: string | null;
};

type SupplierBillRow = {
  id: number;
  supplier_id: number;
  bill_no: string | null;
  bill_date: string;
  due_date: string | null;
  currency: string | null;
  subtotal: number | null;
  vat_amount: number | null;
  total_amount: number | null;
  status: "OPEN" | "PARTIALLY_PAID" | "PAID" | "VOID" | string;
};

type SupplierPaymentRow = {
  id: number;
  supplier_id: number;
  payment_date: string;
  amount: number | null;
  method: string | null;
  reference: string | null;
  notes: string | null;
  created_at: string;
};

type SupplierRow = {
  id: number;
  name?: string | null;
  company_name?: string | null;
};

/* =========================
  UI bits
========================= */
function StatCard(props: { title: string; value: string; hint?: string; icon?: React.ReactNode }) {
  return (
    <Card className="shadow-premium">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs text-muted-foreground">{props.title}</div>
            <div className="mt-1 text-xl font-semibold">{props.value}</div>
            {props.hint ? <div className="mt-1 text-xs text-muted-foreground">{props.hint}</div> : null}
          </div>
          {props.icon ? (
            <div className="h-9 w-9 rounded-xl border bg-background flex items-center justify-center text-muted-foreground">
              {props.icon}
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function ErrorBox({ title, msg }: { title: string; msg: string }) {
  return (
    <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4">
      <div className="text-sm font-semibold text-destructive">{title}</div>
      <div className="mt-2 text-sm text-destructive/90 whitespace-pre-wrap">{msg}</div>
      <div className="mt-3 text-xs text-muted-foreground">
        Tip: If other pages load data but Reports fails, it’s usually querying a wrong column. If everything fails, it’s RLS.
      </div>
    </div>
  );
}

/* =========================
  Page
========================= */
export default function Reports() {
  const [preset, setPreset] = useState<DatePreset>("MTD");
  const [from, setFrom] = useState<string>(startOfMonthISO());
  const [to, setTo] = useState<string>(todayISO());

  const [activeReport, setActiveReport] = useState<
    "SALES" | "INVOICES" | "CUSTOMERS" | "STOCK" | "AR" | "AP" | "VAT" | "PROFIT"
  >("SALES");

  function applyPreset(p: DatePreset) {
    setPreset(p);
    const t = todayISO();

    if (p === "TODAY") return (setFrom(t), setTo(t));
    if (p === "7D") {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      return (setFrom(d.toISOString().slice(0, 10)), setTo(t));
    }
    if (p === "30D") {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      return (setFrom(d.toISOString().slice(0, 10)), setTo(t));
    }
    if (p === "MTD") return (setFrom(startOfMonthISO()), setTo(t));
    if (p === "YTD") return (setFrom(startOfYearISO()), setTo(t));
    // CUSTOM => user edits fields
  }

  /* =========================
    Queries (REAL)
  ========================= */

  // Invoices in period
  const invoicesQ = useQuery({
    queryKey: ["rpt_invoices", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select(
          "id,invoice_number,customer_id,invoice_date,due_date,subtotal,vat_amount,total_amount,status,amount_paid,balance_remaining,previous_balance,discount_percent,discount_amount,vat_percent"
        )
        .gte("invoice_date", from)
        .lte("invoice_date", to);

      if (error) throw error;
      return (data ?? []) as InvoiceRow[];
    },
  });

  // Invoice payments in period (your table has invoice_id, method)
  const invoicePaymentsQ = useQuery({
    queryKey: ["rpt_invoice_payments", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoice_payments")
        .select("id,invoice_id,payment_date,amount,method,reference,notes,created_at")
        .gte("payment_date", from)
        .lte("payment_date", to);

      if (error) throw error;
      return (data ?? []) as InvoicePaymentRow[];
    },
  });

  // Customers (for names)
  const customersQ = useQuery({
    queryKey: ["rpt_customers"],
    queryFn: async () => {
      // keep it flexible (your customers table fields may vary)
      const { data, error } = await supabase.from("customers").select("*");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // Products (for stock report)
  const productsQ = useQuery({
    queryKey: ["rpt_products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id,sku,item_code,name,current_stock,reorder_level,selling_price,cost_price,is_active")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ProductRow[];
    },
  });

  // Stock movements in period
  const stockMovesQ = useQuery({
    queryKey: ["rpt_stock_moves", from, to],
    queryFn: async () => {
      const fromTS = `${from}T00:00:00.000Z`;
      const toTS = `${to}T23:59:59.999Z`;
      const { data, error } = await supabase
        .from("stock_movements")
        .select("id,product_id,movement_date,movement_type,quantity,reference,source_table,source_id,notes")
        .gte("movement_date", fromTS)
        .lte("movement_date", toTS)
        .order("movement_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as StockMoveRow[];
    },
  });

  // Supplier bills in period
  const supplierBillsQ = useQuery({
    queryKey: ["rpt_supplier_bills", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supplier_bills")
        .select("id,supplier_id,bill_no,bill_date,due_date,currency,subtotal,vat_amount,total_amount,status")
        .gte("bill_date", from)
        .lte("bill_date", to);

      if (error) throw error;
      return (data ?? []) as SupplierBillRow[];
    },
  });

  // Supplier payments in period
  const supplierPaymentsQ = useQuery({
    queryKey: ["rpt_supplier_payments", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supplier_payments")
        .select("id,supplier_id,payment_date,amount,method,reference,notes,created_at")
        .gte("payment_date", from)
        .lte("payment_date", to);

      if (error) throw error;
      return (data ?? []) as SupplierPaymentRow[];
    },
  });

  // Suppliers (names)
  const suppliersQ = useQuery({
    queryKey: ["rpt_suppliers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("*");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // Customer payments (your "payments" table includes customer_id + payment_method)
  const paymentsQ = useQuery({
    queryKey: ["rpt_payments", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("id,customer_id,invoice_id,payment_date,amount,payment_method,notes,created_at,updated_at")
        .gte("payment_date", from)
        .lte("payment_date", to);

      if (error) throw error;
      return (data ?? []) as PaymentRow[];
    },
  });

  const anyError =
    invoicesQ.error ||
    invoicePaymentsQ.error ||
    customersQ.error ||
    productsQ.error ||
    stockMovesQ.error ||
    supplierBillsQ.error ||
    supplierPaymentsQ.error ||
    suppliersQ.error ||
    paymentsQ.error;

  const anyLoading =
    invoicesQ.isLoading ||
    invoicePaymentsQ.isLoading ||
    customersQ.isLoading ||
    productsQ.isLoading ||
    stockMovesQ.isLoading ||
    supplierBillsQ.isLoading ||
    supplierPaymentsQ.isLoading ||
    suppliersQ.isLoading ||
    paymentsQ.isLoading;

  /* =========================
    Derived maps
  ========================= */
  const customerNameById = useMemo(() => {
    const m = new Map<number, string>();
    (customersQ.data ?? []).forEach((c: any) => {
      const id = Number(c.id);
      const name =
        c.company_name ||
        c.name ||
        c.full_name ||
        c.customer_name ||
        c.business_name ||
        `Customer #${id}`;
      if (Number.isFinite(id)) m.set(id, String(name));
    });
    return m;
  }, [customersQ.data]);

  const supplierNameById = useMemo(() => {
    const m = new Map<number, string>();
    (suppliersQ.data ?? []).forEach((s: any) => {
      const id = Number(s.id);
      const name = s.company_name || s.name || s.supplier_name || `Supplier #${id}`;
      if (Number.isFinite(id)) m.set(id, String(name));
    });
    return m;
  }, [suppliersQ.data]);

  const productById = useMemo(() => {
    const m = new Map<number, ProductRow>();
    (productsQ.data ?? []).forEach((p) => m.set(p.id, p));
    return m;
  }, [productsQ.data]);

  /* =========================
    KPI + report calculations
  ========================= */
  const salesKPIs = useMemo(() => {
    const invoices = invoicesQ.data ?? [];
    const invPays = invoicePaymentsQ.data ?? [];

    const revenue = invoices.reduce((s, r) => s + Number(r.total_amount ?? 0), 0);
    const vat = invoices.reduce((s, r) => s + Number(r.vat_amount ?? 0), 0);

    const collected = invPays.reduce((s, p) => s + Number(p.amount ?? 0), 0);

    const invoicesCount = invoices.length;

    const norm = (x: any) => String(x ?? "").trim().toUpperCase();
    const paid = invoices.filter((i) => norm(i.status) === "PAID").length;
    const pending = invoices.filter((i) => norm(i.status) === "PENDING" || norm(i.status) === "OPEN").length;
    const overdue = invoices.filter((i) => norm(i.status) === "OVERDUE").length;

    const avgInvoice = invoicesCount ? revenue / invoicesCount : 0;

    // Top customers by invoice totals
    const byCustomer = new Map<number, number>();
    invoices.forEach((inv) => {
      byCustomer.set(inv.customer_id, (byCustomer.get(inv.customer_id) ?? 0) + Number(inv.total_amount ?? 0));
    });

    const topCustomers = Array.from(byCustomer.entries())
      .map(([customer_id, amount]) => ({
        customer_id,
        name: customerNameById.get(customer_id) || `Customer #${customer_id}`,
        amount,
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8);

    return {
      revenue,
      vat,
      collected,
      invoicesCount,
      paid,
      pending,
      overdue,
      avgInvoice,
      topCustomers,
    };
  }, [invoicesQ.data, invoicePaymentsQ.data, customerNameById]);

  // AR Aging (based on invoices.balance_remaining + due_date)
  const arAging = useMemo(() => {
    const invoices = invoicesQ.data ?? [];
    const now = new Date();

    const buckets = {
      "0–30": 0,
      "31–60": 0,
      "61–90": 0,
      "90+": 0,
    };

    let totalReceivable = 0;

    invoices.forEach((inv) => {
      const bal = Number(inv.balance_remaining ?? 0);
      if (!bal || bal <= 0) return;
      totalReceivable += bal;

      const due = inv.due_date ? new Date(inv.due_date) : null;
      const diffDays = due ? Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)) : 0;

      // Not overdue => treat as 0–30 bucket
      if (!due || diffDays <= 0) buckets["0–30"] += bal;
      else if (diffDays <= 30) buckets["0–30"] += bal;
      else if (diffDays <= 60) buckets["31–60"] += bal;
      else if (diffDays <= 90) buckets["61–90"] += bal;
      else buckets["90+"] += bal;
    });

    return { totalReceivable, buckets };
  }, [invoicesQ.data]);

  // AP Snapshot (based on supplier_bills total_amount by status)
  const apSnapshot = useMemo(() => {
    const bills = supplierBillsQ.data ?? [];
    const norm = (x: any) => String(x ?? "").trim().toUpperCase();

    const open = bills
      .filter((b) => norm(b.status) === "OPEN" || norm(b.status) === "PARTIALLY_PAID")
      .reduce((s, b) => s + Number(b.total_amount ?? 0), 0);

    const paid = bills
      .filter((b) => norm(b.status) === "PAID")
      .reduce((s, b) => s + Number(b.total_amount ?? 0), 0);

    const voided = bills
      .filter((b) => norm(b.status) === "VOID")
      .reduce((s, b) => s + Number(b.total_amount ?? 0), 0);

    // due soon + overdue based on due_date
    const now = new Date();
    let dueSoon = 0;
    let overdue = 0;

    bills.forEach((b) => {
      const st = norm(b.status);
      if (!(st === "OPEN" || st === "PARTIALLY_PAID")) return;

      const amt = Number(b.total_amount ?? 0);
      const due = b.due_date ? new Date(b.due_date) : null;
      if (!due) return;

      const days = Math.floor((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)); // future positive
      if (days >= 0 && days <= 14) dueSoon += amt;
      if (days < 0) overdue += amt;
    });

    // Top suppliers by bills
    const bySupplier = new Map<number, number>();
    bills.forEach((b) => {
      bySupplier.set(b.supplier_id, (bySupplier.get(b.supplier_id) ?? 0) + Number(b.total_amount ?? 0));
    });

    const topSuppliers = Array.from(bySupplier.entries())
      .map(([supplier_id, amount]) => ({
        supplier_id,
        name: supplierNameById.get(supplier_id) || `Supplier #${supplier_id}`,
        amount,
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8);

    return { open, paid, voided, dueSoon, overdue, topSuppliers };
  }, [supplierBillsQ.data, supplierNameById]);

  // VAT Report (simple: Output VAT from invoices.vat_amount, Input VAT from supplier_bills.vat_amount)
  const vatReport = useMemo(() => {
    const inv = invoicesQ.data ?? [];
    const bills = supplierBillsQ.data ?? [];

    const outputVat = inv.reduce((s, r) => s + Number(r.vat_amount ?? 0), 0);
    const inputVat = bills.reduce((s, r) => s + Number(r.vat_amount ?? 0), 0);

    const netVat = outputVat - inputVat;

    return { outputVat, inputVat, netVat };
  }, [invoicesQ.data, supplierBillsQ.data]);

  // Profit Summary (approx: revenue - cost based on stock OUT movements * cost_price)
  const profit = useMemo(() => {
    const inv = invoicesQ.data ?? [];
    const moves = stockMovesQ.data ?? [];

    const revenue = inv.reduce((s, r) => s + Number(r.total_amount ?? 0), 0);

    // estimate cost from stock OUT movements in period
    // cost += qty * product.cost_price (if exists)
    let cost = 0;
    moves.forEach((m) => {
      if (m.movement_type !== "OUT") return;
      const qty = Number(m.quantity ?? 0);
      const p = productById.get(m.product_id);
      const cp = Number(p?.cost_price ?? 0);
      cost += qty * cp;
    });

    const grossProfit = revenue - cost;
    const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;

    return { revenue, cost, grossProfit, grossMargin };
  }, [invoicesQ.data, stockMovesQ.data, productById]);

  // Stock report
  const stockReport = useMemo(() => {
    const products = productsQ.data ?? [];
    const low = products
      .filter((p) => (p.is_active ?? true) && Number(p.reorder_level ?? 0) > 0)
      .filter((p) => Number(p.current_stock ?? 0) <= Number(p.reorder_level ?? 0))
      .map((p) => ({
        sku: p.sku || p.item_code || `#${p.id}`,
        name: p.name,
        onHand: Number(p.current_stock ?? 0),
        min: Number(p.reorder_level ?? 0),
      }))
      .sort((a, b) => a.onHand - b.onHand)
      .slice(0, 12);

    const activeSkus = products.filter((p) => p.is_active ?? true).length;
    return { activeSkus, lowCount: low.length, low };
  }, [productsQ.data]);

  // Customers report
  const customerReport = useMemo(() => {
    const payments = paymentsQ.data ?? [];
    const invoices = invoicesQ.data ?? [];

    // totals by customer
    const billed = new Map<number, number>();
    const paid = new Map<number, number>();

    invoices.forEach((inv) => {
      billed.set(inv.customer_id, (billed.get(inv.customer_id) ?? 0) + Number(inv.total_amount ?? 0));
    });
    payments.forEach((p) => {
      paid.set(p.customer_id, (paid.get(p.customer_id) ?? 0) + Number(p.amount ?? 0));
    });

    const rows = Array.from(new Set<number>([
      ...Array.from(billed.keys()),
      ...Array.from(paid.keys()),
    ])).map((cid) => {
      const b = billed.get(cid) ?? 0;
      const p = paid.get(cid) ?? 0;
      const bal = b - p;
      return {
        customer_id: cid,
        customer: customerNameById.get(cid) || `Customer #${cid}`,
        billed: b,
        paid: p,
        balance: bal,
      };
    });

    rows.sort((a, b) => b.balance - a.balance);

    return {
      topBalances: rows.slice(0, 15),
      totalCustomers: customerNameById.size,
    };
  }, [paymentsQ.data, invoicesQ.data, customerNameById]);

  const reportTiles = useMemo(
    () => [
      { key: "SALES", title: "Sales Report", desc: "Sales performance & trends", icon: <TrendingUp className="h-5 w-5" /> },
      { key: "INVOICES", title: "Invoice Report", desc: "Status, totals & collections", icon: <FileText className="h-5 w-5" /> },
      { key: "CUSTOMERS", title: "Customer Report", desc: "Balances, payments & activity", icon: <Users className="h-5 w-5" /> },
      { key: "STOCK", title: "Stock Report", desc: "Inventory levels & low stock", icon: <Package className="h-5 w-5" /> },
      { key: "AR", title: "AR Aging", desc: "Receivables & aging buckets", icon: <Wallet className="h-5 w-5" /> },
      { key: "AP", title: "AP Snapshot", desc: "Payables & due amounts", icon: <Landmark className="h-5 w-5" /> },
      { key: "VAT", title: "VAT Report", desc: "Output vs input VAT summary", icon: <Percent className="h-5 w-5" /> },
      { key: "PROFIT", title: "Profit Summary", desc: "Revenue, cost & margin (est.)", icon: <Receipt className="h-5 w-5" /> },
    ],
    []
  );

  function refetchAll() {
    invoicesQ.refetch();
    invoicePaymentsQ.refetch();
    paymentsQ.refetch();
    customersQ.refetch();
    productsQ.refetch();
    stockMovesQ.refetch();
    supplierBillsQ.refetch();
    supplierPaymentsQ.refetch();
    suppliersQ.refetch();
  }

  function exportActiveCSV() {
    // Build export rows depending on active report
    if (activeReport === "SALES") {
      const rows = (salesKPIs.topCustomers ?? []).map((r) => ({
        customer: r.name,
        amount: r.amount,
        from,
        to,
      }));
      return downloadCSV(`sales_top_customers_${from}_to_${to}.csv`, rows);
    }

    if (activeReport === "INVOICES") {
      const rows = (invoicesQ.data ?? []).map((i) => ({
        invoice_id: i.id,
        invoice_number: i.invoice_number,
        customer: customerNameById.get(i.customer_id) || i.customer_id,
        invoice_date: i.invoice_date,
        due_date: i.due_date,
        status: i.status,
        subtotal: i.subtotal,
        vat_amount: i.vat_amount,
        total_amount: i.total_amount,
        amount_paid: i.amount_paid,
        balance_remaining: i.balance_remaining,
      }));
      return downloadCSV(`invoices_${from}_to_${to}.csv`, rows);
    }

    if (activeReport === "CUSTOMERS") {
      const rows = (customerReport.topBalances ?? []).map((r) => ({
        customer: r.customer,
        billed: r.billed,
        paid: r.paid,
        balance: r.balance,
        from,
        to,
      }));
      return downloadCSV(`customers_balances_${from}_to_${to}.csv`, rows);
    }

    if (activeReport === "STOCK") {
      const rows = (stockReport.low ?? []).map((r) => ({
        sku: r.sku,
        name: r.name,
        on_hand: r.onHand,
        reorder_level: r.min,
      }));
      return downloadCSV(`stock_low_${from}_to_${to}.csv`, rows);
    }

    if (activeReport === "AR") {
      const rows = Object.entries(arAging.buckets).map(([bucket, amount]) => ({
        bucket,
        amount,
        from,
        to,
      }));
      return downloadCSV(`ar_aging_${from}_to_${to}.csv`, rows);
    }

    if (activeReport === "AP") {
      const rows = (apSnapshot.topSuppliers ?? []).map((r) => ({
        supplier: r.name,
        billed: r.amount,
        from,
        to,
      }));
      return downloadCSV(`ap_top_suppliers_${from}_to_${to}.csv`, rows);
    }

    if (activeReport === "VAT") {
      const rows = [
        { metric: "Output VAT (Sales)", amount: vatReport.outputVat, from, to },
        { metric: "Input VAT (Purchases)", amount: vatReport.inputVat, from, to },
        { metric: "Net VAT", amount: vatReport.netVat, from, to },
      ];
      return downloadCSV(`vat_${from}_to_${to}.csv`, rows);
    }

    // PROFIT
    const rows = [
      { metric: "Revenue", amount: profit.revenue, from, to },
      { metric: "Estimated Cost (Stock OUT x cost_price)", amount: profit.cost, from, to },
      { metric: "Gross Profit", amount: profit.grossProfit, from, to },
      { metric: "Gross Margin %", amount: profit.grossMargin, from, to },
    ];
    return downloadCSV(`profit_${from}_to_${to}.csv`, rows);
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ===== Header ===== */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight">Reports</h1>
          <p className="text-muted-foreground mt-1">
            Premium reporting hub • Real Supabase data • Export-ready • Luxury ERP feel
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={refetchAll} disabled={anyLoading}>
            <RefreshCw className="h-4 w-4 mr-2" />
            {anyLoading ? "Loading..." : "Refresh"}
          </Button>

          <Button variant="outline" onClick={exportActiveCSV} disabled={anyLoading}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>

          <Button
            className="gradient-primary shadow-glow text-primary-foreground"
            onClick={() => setActiveReport(activeReport)} // keeps UX consistent
            disabled={anyLoading}
          >
            <ArrowUpRight className="h-4 w-4 mr-2" />
            Generate
          </Button>
        </div>
      </div>

      {/* ===== KPI Strip ===== */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard title="Revenue (period)" value={`Rs ${money(profit.revenue)}`} hint={`${from} → ${to}`} icon={<TrendingUp className="h-4 w-4" />} />
        <StatCard title="Invoices" value={`${salesKPIs.invoicesCount}`} hint={`Paid: ${salesKPIs.paid} • Pending: ${salesKPIs.pending}`} icon={<FileText className="h-4 w-4" />} />
        <StatCard title="AR (Receivable)" value={`Rs ${money(arAging.totalReceivable)}`} hint="Based on invoices.balance_remaining" icon={<Wallet className="h-4 w-4" />} />
        <StatCard title="AP (Open)" value={`Rs ${money(apSnapshot.open)}`} hint={`Due soon: Rs ${money(apSnapshot.dueSoon)}`} icon={<Landmark className="h-4 w-4" />} />
        <StatCard title="Gross Margin" value={pct(profit.grossMargin)} hint={`GP: Rs ${money(profit.grossProfit)}`} icon={<Receipt className="h-4 w-4" />} />
      </div>

      {/* ===== Filters ===== */}
      <Card className="shadow-premium">
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>Filters</CardTitle>
              <CardDescription>Choose date range and report type</CardDescription>
            </div>

            <div className="flex flex-wrap gap-2">
              {(["TODAY", "7D", "30D", "MTD", "YTD"] as DatePreset[]).map((p) => (
                <Button
                  key={p}
                  variant={preset === p ? "default" : "outline"}
                  className={preset === p ? "gradient-primary shadow-glow text-primary-foreground" : ""}
                  onClick={() => applyPreset(p)}
                >
                  <Calendar className="h-4 w-4 mr-2" />
                  {p}
                </Button>
              ))}

              <Button
                variant={preset === "CUSTOM" ? "default" : "outline"}
                className={preset === "CUSTOM" ? "gradient-primary shadow-glow text-primary-foreground" : ""}
                onClick={() => setPreset("CUSTOM")}
              >
                Custom
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <div className="grid gap-3 md:grid-cols-[auto_auto_1fr] md:items-end">
            <div className="space-y-2">
              <Label>From</Label>
              <Input
                type="date"
                value={from}
                onChange={(e) => {
                  setPreset("CUSTOM");
                  setFrom(e.target.value);
                }}
              />
            </div>

            <div className="space-y-2">
              <Label>To</Label>
              <Input
                type="date"
                value={to}
                onChange={(e) => {
                  setPreset("CUSTOM");
                  setTo(e.target.value);
                }}
              />
            </div>

            <div className="space-y-2">
              <Label>Report Type</Label>
              <select
                className="h-10 w-full rounded-md border px-3 bg-background"
                value={activeReport}
                onChange={(e) => setActiveReport(e.target.value as any)}
              >
                <option value="SALES">Sales</option>
                <option value="INVOICES">Invoices</option>
                <option value="CUSTOMERS">Customers</option>
                <option value="STOCK">Stock</option>
                <option value="AR">AR Aging</option>
                <option value="AP">AP Snapshot</option>
                <option value="VAT">VAT</option>
                <option value="PROFIT">Profit Summary</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ===== Tiles ===== */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {reportTiles.map((t) => {
          const selected = activeReport === (t.key as any);
          return (
            <Card
              key={t.key}
              className={
                "shadow-premium hover:shadow-lg transition-all cursor-pointer group " +
                (selected ? "ring-2 ring-primary/30" : "")
              }
              onClick={() => setActiveReport(t.key as any)}
            >
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div
                    className={
                      "flex h-14 w-14 items-center justify-center rounded-xl transition-colors " +
                      (selected
                        ? "bg-primary text-primary-foreground"
                        : "bg-primary/10 group-hover:bg-primary group-hover:text-primary-foreground")
                    }
                  >
                    {t.icon}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-lg text-foreground">{t.title}</h3>
                    <p className="text-sm text-muted-foreground">{t.desc}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ===== Report Center ===== */}
      <Card className="shadow-premium">
        <CardHeader>
          <CardTitle>Report Center</CardTitle>
          <CardDescription>
            Showing: <b>{activeReport}</b> • Period: <b>{from}</b> → <b>{to}</b>
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {anyError ? (
            <ErrorBox
              title="Failed to load data (RLS / permissions)"
              msg={(anyError as any)?.message || "Unknown error"}
            />
          ) : null}

          {/* SALES */}
          {activeReport === "SALES" && !anyError && (
            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="shadow-premium">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Sales Summary</CardTitle>
                  <CardDescription>Revenue + invoice volume</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border bg-background p-3">
                      <div className="text-xs text-muted-foreground">Revenue</div>
                      <div className="mt-1 text-lg font-semibold">Rs {money(salesKPIs.revenue)}</div>
                    </div>
                    <div className="rounded-xl border bg-background p-3">
                      <div className="text-xs text-muted-foreground">Collected</div>
                      <div className="mt-1 text-lg font-semibold">Rs {money(salesKPIs.collected)}</div>
                    </div>
                    <div className="rounded-xl border bg-background p-3">
                      <div className="text-xs text-muted-foreground">Avg Invoice</div>
                      <div className="mt-1 text-lg font-semibold">Rs {money(salesKPIs.avgInvoice)}</div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary" className="border bg-emerald-500/10 text-emerald-700">
                      Paid: {salesKPIs.paid}
                    </Badge>
                    <Badge variant="secondary" className="border bg-amber-500/10 text-amber-700">
                      Pending: {salesKPIs.pending}
                    </Badge>
                    <Badge variant="secondary" className="border bg-rose-500/10 text-rose-700">
                      Overdue: {salesKPIs.overdue}
                    </Badge>
                    <Badge variant="secondary" className="border bg-sky-500/10 text-sky-700">
                      VAT: Rs {money(salesKPIs.vat)}
                    </Badge>
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-premium">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Top Customers</CardTitle>
                  <CardDescription>Highest billed customers in period</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b">
                        <tr>
                          <th className="text-left py-2">Customer</th>
                          <th className="text-right py-2">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {salesKPIs.topCustomers.map((c) => (
                          <tr key={c.customer_id} className="hover:bg-muted/30">
                            <td className="py-2 font-medium">{c.name}</td>
                            <td className="py-2 text-right font-semibold">Rs {money(c.amount)}</td>
                          </tr>
                        ))}
                        {salesKPIs.topCustomers.length === 0 ? (
                          <tr>
                            <td className="py-4 text-muted-foreground" colSpan={2}>
                              No invoices in this period.
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* INVOICES */}
          {activeReport === "INVOICES" && !anyError && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-3">
                <Badge variant="secondary" className="border bg-muted/30">
                  Count: {(invoicesQ.data ?? []).length}
                </Badge>
                <Badge variant="secondary" className="border bg-primary/10 text-primary">
                  Total: Rs {money((invoicesQ.data ?? []).reduce((s, i) => s + Number(i.total_amount ?? 0), 0))}
                </Badge>
              </div>

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
                    {(invoicesQ.data ?? []).map((i) => (
                      <tr key={i.id} className="hover:bg-muted/30">
                        <td className="p-3 font-medium">{i.invoice_number || `#${i.id}`}</td>
                        <td className="p-3">{customerNameById.get(i.customer_id) || `Customer #${i.customer_id}`}</td>
                        <td className="p-3 text-muted-foreground">{i.invoice_date}</td>
                        <td className="p-3">
                          <Badge variant="secondary" className="border">
                            {String(i.status ?? "—")}
                          </Badge>
                        </td>
                        <td className="p-3 text-right font-semibold">Rs {money(i.total_amount)}</td>
                        <td className="p-3 text-right">Rs {money(i.balance_remaining)}</td>
                      </tr>
                    ))}
                    {(invoicesQ.data ?? []).length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-6 text-center text-muted-foreground">
                          No invoices found in this date range.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* CUSTOMERS */}
          {activeReport === "CUSTOMERS" && !anyError && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-3">
                <Badge variant="secondary" className="border bg-muted/30">
                  Customers: {customerReport.totalCustomers}
                </Badge>
                <Badge variant="secondary" className="border bg-primary/10 text-primary">
                  Highest balances
                </Badge>
              </div>

              <div className="overflow-auto rounded-xl border">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/20">
                    <tr>
                      <th className="text-left p-3">Customer</th>
                      <th className="text-right p-3">Billed</th>
                      <th className="text-right p-3">Paid</th>
                      <th className="text-right p-3">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {customerReport.topBalances.map((r) => (
                      <tr key={r.customer_id} className="hover:bg-muted/30">
                        <td className="p-3 font-medium">{r.customer}</td>
                        <td className="p-3 text-right">Rs {money(r.billed)}</td>
                        <td className="p-3 text-right">Rs {money(r.paid)}</td>
                        <td className="p-3 text-right font-semibold">Rs {money(r.balance)}</td>
                      </tr>
                    ))}
                    {customerReport.topBalances.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-6 text-center text-muted-foreground">
                          No customer balances found in this period.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* STOCK */}
          {activeReport === "STOCK" && !anyError && (
            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="shadow-premium">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Stock Snapshot</CardTitle>
                  <CardDescription>Products and low-stock alerts</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary" className="border bg-muted/30">
                      Active SKUs: {stockReport.activeSkus}
                    </Badge>
                    <Badge variant="secondary" className="border bg-rose-500/10 text-rose-700">
                      Low Stock: {stockReport.lowCount}
                    </Badge>
                    <Badge variant="secondary" className="border bg-primary/10 text-primary">
                      Movements: {(stockMovesQ.data ?? []).length}
                    </Badge>
                  </div>

                  <div className="text-xs text-muted-foreground">
                    Low stock = current_stock ≤ reorder_level
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-premium">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Low Stock List</CardTitle>
                  <CardDescription>Action items for purchasing</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b">
                        <tr>
                          <th className="text-left py-2">SKU</th>
                          <th className="text-left py-2">Product</th>
                          <th className="text-right py-2">On hand</th>
                          <th className="text-right py-2">Min</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {stockReport.low.map((p) => (
                          <tr key={p.sku} className="hover:bg-muted/30">
                            <td className="py-2 font-medium">{p.sku}</td>
                            <td className="py-2">{p.name}</td>
                            <td className="py-2 text-right font-semibold">{p.onHand}</td>
                            <td className="py-2 text-right">{p.min}</td>
                          </tr>
                        ))}
                        {stockReport.low.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="py-4 text-muted-foreground">
                              No low stock items 🎉
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* AR */}
          {activeReport === "AR" && !anyError && (
            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="shadow-premium">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">AR Summary</CardTitle>
                  <CardDescription>Based on invoices.balance_remaining + due_date</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="rounded-xl border p-3">
                    <div className="text-xs text-muted-foreground">Total Receivable</div>
                    <div className="mt-1 text-lg font-semibold">Rs {money(arAging.totalReceivable)}</div>
                  </div>
                  <div className="grid gap-2">
                    {Object.entries(arAging.buckets).map(([k, v]) => (
                      <div key={k} className="flex items-center justify-between rounded-lg border bg-background px-3 py-2">
                        <div className="text-sm font-medium">{k} days</div>
                        <div className="text-sm font-semibold">Rs {money(v)}</div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-premium">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Collection Hint</CardTitle>
                  <CardDescription>Use this list to call customers</CardDescription>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  (Next upgrade) I can add “Top overdue invoices” table by sorting invoices where balance_remaining &gt; 0
                  and due_date &lt; today.
                </CardContent>
              </Card>
            </div>
          )}

          {/* AP */}
          {activeReport === "AP" && !anyError && (
            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="shadow-premium">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">AP Snapshot</CardTitle>
                  <CardDescription>Supplier bills status</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border bg-background p-3">
                      <div className="text-xs text-muted-foreground">Open</div>
                      <div className="mt-1 text-lg font-semibold">Rs {money(apSnapshot.open)}</div>
                    </div>
                    <div className="rounded-xl border bg-background p-3">
                      <div className="text-xs text-muted-foreground">Due Soon (≤14d)</div>
                      <div className="mt-1 text-lg font-semibold">Rs {money(apSnapshot.dueSoon)}</div>
                    </div>
                    <div className="rounded-xl border bg-background p-3">
                      <div className="text-xs text-muted-foreground">Overdue</div>
                      <div className="mt-1 text-lg font-semibold">Rs {money(apSnapshot.overdue)}</div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary" className="border bg-emerald-500/10 text-emerald-700">
                      Paid: Rs {money(apSnapshot.paid)}
                    </Badge>
                    <Badge variant="secondary" className="border bg-slate-500/10 text-slate-700">
                      Void: Rs {money(apSnapshot.voided)}
                    </Badge>
                    <Badge variant="secondary" className="border bg-primary/10 text-primary">
                      Supplier Payments: {(supplierPaymentsQ.data ?? []).length}
                    </Badge>
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-premium">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Top Suppliers</CardTitle>
                  <CardDescription>Highest billed suppliers in period</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b">
                        <tr>
                          <th className="text-left py-2">Supplier</th>
                          <th className="text-right py-2">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {apSnapshot.topSuppliers.map((s) => (
                          <tr key={s.supplier_id} className="hover:bg-muted/30">
                            <td className="py-2 font-medium">{s.name}</td>
                            <td className="py-2 text-right font-semibold">Rs {money(s.amount)}</td>
                          </tr>
                        ))}
                        {apSnapshot.topSuppliers.length === 0 ? (
                          <tr>
                            <td colSpan={2} className="py-4 text-muted-foreground">
                              No supplier bills found in this period.
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* VAT */}
          {activeReport === "VAT" && !anyError && (
            <div className="grid gap-6 lg:grid-cols-3">
              <Card className="shadow-premium">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Output VAT</CardTitle>
                  <CardDescription>From invoices.vat_amount</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-semibold">Rs {money(vatReport.outputVat)}</div>
                </CardContent>
              </Card>

              <Card className="shadow-premium">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Input VAT</CardTitle>
                  <CardDescription>From supplier_bills.vat_amount</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-semibold">Rs {money(vatReport.inputVat)}</div>
                </CardContent>
              </Card>

              <Card className="shadow-premium">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Net VAT</CardTitle>
                  <CardDescription>Output - Input</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-semibold">Rs {money(vatReport.netVat)}</div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* PROFIT */}
          {activeReport === "PROFIT" && !anyError && (
            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="shadow-premium">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Profit Summary</CardTitle>
                  <CardDescription>
                    Revenue from invoices • Cost estimated from stock OUT × products.cost_price
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border bg-background p-3">
                      <div className="text-xs text-muted-foreground">Revenue</div>
                      <div className="mt-1 text-lg font-semibold">Rs {money(profit.revenue)}</div>
                    </div>
                    <div className="rounded-xl border bg-background p-3">
                      <div className="text-xs text-muted-foreground">Estimated Cost</div>
                      <div className="mt-1 text-lg font-semibold">Rs {money(profit.cost)}</div>
                    </div>
                    <div className="rounded-xl border bg-background p-3">
                      <div className="text-xs text-muted-foreground">Gross Profit</div>
                      <div className="mt-1 text-lg font-semibold">Rs {money(profit.grossProfit)}</div>
                    </div>
                    <div className="rounded-xl border bg-background p-3">
                      <div className="text-xs text-muted-foreground">Gross Margin</div>
                      <div className="mt-1 text-lg font-semibold">{pct(profit.grossMargin)}</div>
                    </div>
                  </div>

                  <div className="text-xs text-muted-foreground">
                    Note: This is a solid estimate if stock movements are always recorded for invoices/credit notes.
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-premium">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Next Upgrade</CardTitle>
                  <CardDescription>Make profit exact</CardDescription>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  If you want exact COGS, we can compute it from invoice_items.product_id × invoice_items.total_qty × products.cost_price,
                  but only if invoice_items.total_qty is always filled correctly for every item.
                </CardContent>
              </Card>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="text-xs text-muted-foreground">
        Tables used: invoices, invoice_payments, payments, customers, products, stock_movements, supplier_bills, supplier_payments, suppliers.
      </div>
    </div>
  );
}
