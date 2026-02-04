// src/pages/Reports.tsx
import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

import {
  TrendingUp,
  FileText,
  Users,
  Package,
  Percent,
  Download,
  RefreshCw,
  Calendar,
  ArrowUpRight,
  UserRound,
  Layers,
  Receipt,
} from "lucide-react";

/* =========================
  Helpers
========================= */
function money(v: any) {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return "0.00";
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function n(v: any) {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}
type DatePreset = "TODAY" | "7D" | "30D" | "MTD" | "YTD" | "CUSTOM";
type Granularity = "DAILY" | "MONTHLY";

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
function ymKey(dateISO: string) {
  return String(dateISO || "").slice(0, 7); // YYYY-MM
}
function chunk<T>(arr: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function downloadCSV(filename: string, rows: Array<Record<string, any>>) {
  const safe = (v: any) => {
    const s = String(v ?? "");
    const x = s.replace(/"/g, '""');
    if (/[",\n]/.test(x)) return `"${x}"`;
    return x;
  };

  const headers = Array.from(
    rows.reduce((set, r) => {
      Object.keys(r || {}).forEach((k) => set.add(k));
      return set;
    }, new Set<string>())
  );

  const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => safe((r as any)[h])).join(","))].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  a.click();

  URL.revokeObjectURL(url);
}

/* =========================
  Types (from your DB)
========================= */
type InvoiceRow = {
  id: number;
  invoice_number: string;
  customer_id: number;
  invoice_date: string; // date
  subtotal: number;
  vat_amount: number;
  total_amount: number;
  gross_total: number | null;
  status: string;
  discount_amount: number | null;
  discount_percent: number | null;
  sales_rep: string | null;
  sales_rep_phone: string | null;
};

type InvoicePaymentRow = {
  id: number;
  invoice_id: number;
  payment_date: string; // date
  amount: number;
  method: string;
};

type CustomerRow = {
  id: number;
  name: string;
  client_name: string | null;
};

type ProductRow = {
  id: number;
  sku: string;
  item_code: string | null;
  name: string;
  cost_price: number | null;
  selling_price: number;
};

type InvoiceItemRow = {
  id: number;
  invoice_id: number;
  product_id: number;
  total_qty: number;
  line_total: number;
  uom: string | null;
  description: string | null;
  products?: { id: number; sku: string; item_code: string | null; name: string } | null;
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

function PillTabs<T extends string>({
  value,
  onChange,
  items,
}: {
  value: T;
  onChange: (v: T) => void;
  items: { key: T; label: string; icon?: React.ReactNode; desc?: string }[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((it) => {
        const active = it.key === value;
        return (
          <Button
            key={it.key}
            variant={active ? "default" : "outline"}
            className={active ? "gradient-primary shadow-glow text-primary-foreground" : ""}
            onClick={() => onChange(it.key)}
          >
            {it.icon ? <span className="mr-2 inline-flex">{it.icon}</span> : null}
            {it.label}
          </Button>
        );
      })}
    </div>
  );
}

/* =========================
  Page
========================= */
export default function Reports() {
  const qc = useQueryClient();

  const [preset, setPreset] = useState<DatePreset>("MTD");
  const [from, setFrom] = useState<string>(startOfMonthISO());
  const [to, setTo] = useState<string>(todayISO());

  const [granularity, setGranularity] = useState<Granularity>("DAILY");

  const REPORTS = [
    { key: "DAILY_INVOICES", label: "Daily Invoices", icon: <FileText className="h-4 w-4" /> },
    { key: "DAILY_PRODUCTS", label: "Daily Products Sold", icon: <Package className="h-4 w-4" /> },
    { key: "CUSTOMERS_DAILY", label: "Customers Purchased", icon: <Users className="h-4 w-4" /> },
    { key: "REP_DAILY", label: "Sales by Rep (Daily)", icon: <UserRound className="h-4 w-4" /> },
    { key: "REP_MONTHLY", label: "Sales by Rep (Monthly)", icon: <Layers className="h-4 w-4" /> },
    { key: "CUSTOMER_MONTHLY", label: "Sales by Customer (Monthly)", icon: <Users className="h-4 w-4" /> },
    { key: "VAT", label: "VAT Report", icon: <Percent className="h-4 w-4" /> },
    { key: "DISCOUNT", label: "Discount Report", icon: <Receipt className="h-4 w-4" /> },
  ] as const;

  type ActiveReport = (typeof REPORTS)[number]["key"];
  const [activeReport, setActiveReport] = useState<ActiveReport>("DAILY_INVOICES");

  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedAt, setGeneratedAt] = useState<string>("");

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
  }

  const salesStatuses = useMemo(() => ["ISSUED", "PARTIALLY_PAID", "PAID"], []);

  /* =========================
    Force refresh (Refresh + Generate)
  ========================= */
  async function forceRefetchAll() {
    setIsGenerating(true);
    try {
      await qc.invalidateQueries({
        predicate: (q) => String(q.queryKey?.[0] ?? "").startsWith("rpt_"),
      });
      setGeneratedAt(new Date().toLocaleString());
    } finally {
      setIsGenerating(false);
    }
  }

  /* =========================
    Queries (REAL)
  ========================= */
  const customersQ = useQuery({
    queryKey: ["rpt_customers_all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("id,name,client_name");
      if (error) throw error;
      return (data ?? []) as CustomerRow[];
    },
  });

  const productsQ = useQuery({
    queryKey: ["rpt_products_all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("id,sku,item_code,name,cost_price,selling_price");
      if (error) throw error;
      return (data ?? []) as ProductRow[];
    },
  });

  const invoicesQ = useQuery({
    queryKey: ["rpt_invoices_real", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select(
          "id,invoice_number,customer_id,invoice_date,subtotal,vat_amount,total_amount,gross_total,status,discount_amount,discount_percent,sales_rep,sales_rep_phone"
        )
        .gte("invoice_date", from)
        .lte("invoice_date", to)
        .in("status", salesStatuses);

      if (error) throw error;
      return (data ?? []) as InvoiceRow[];
    },
  });

  const invoicePaymentsQ = useQuery({
    queryKey: ["rpt_invoice_payments", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoice_payments")
        .select("id,invoice_id,payment_date,amount,method")
        .gte("payment_date", from)
        .lte("payment_date", to);

      if (error) throw error;
      return (data ?? []) as InvoicePaymentRow[];
    },
  });

  const invoiceItemsQ = useQuery({
    queryKey: ["rpt_invoice_items_for_range", from, to, invoicesQ.data?.length ?? 0],
    enabled: !!invoicesQ.data && invoicesQ.data.length > 0,
    queryFn: async () => {
      const invIds = (invoicesQ.data ?? []).map((i) => i.id);
      if (invIds.length === 0) return [] as InvoiceItemRow[];

      const parts = chunk(invIds, 500);
      const out: InvoiceItemRow[] = [];

      for (const ids of parts) {
        const { data, error } = await supabase
          .from("invoice_items")
          .select("id,invoice_id,product_id,total_qty,line_total,uom,description,products(id,sku,item_code,name)")
          .in("invoice_id", ids);

        if (error) throw error;
        (data ?? []).forEach((r: any) => out.push(r as InvoiceItemRow));
      }

      return out;
    },
  });

  const anyError =
    invoicesQ.error || invoicePaymentsQ.error || customersQ.error || productsQ.error || invoiceItemsQ.error;

  const anyLoading =
    invoicesQ.isLoading ||
    invoicePaymentsQ.isLoading ||
    customersQ.isLoading ||
    productsQ.isLoading ||
    invoiceItemsQ.isLoading;

  /* =========================
    Maps (customer: client_name + name)
  ========================= */
  const customerById = useMemo(() => {
    const m = new Map<number, CustomerRow>();
    (customersQ.data ?? []).forEach((c) => m.set(c.id, c));
    return m;
  }, [customersQ.data]);

  function customerPrimaryName(cid: number) {
    const c = customerById.get(cid);
    if (!c) return `Customer #${cid}`;
    return (c.client_name || "").trim() || (c.name || "").trim() || `Customer #${cid}`;
  }
  function customerSecondaryName(cid: number) {
    const c = customerById.get(cid);
    if (!c) return "";
    const a = (c.client_name || "").trim();
    const b = (c.name || "").trim();
    const primary = a || b;
    const other = primary === a ? b : a;
    return (other || "").trim();
  }

  const productById = useMemo(() => {
    const m = new Map<number, ProductRow>();
    (productsQ.data ?? []).forEach((p) => m.set(p.id, p));
    return m;
  }, [productsQ.data]);

  const invoiceById = useMemo(() => {
    const m = new Map<number, InvoiceRow>();
    (invoicesQ.data ?? []).forEach((i) => m.set(i.id, i));
    return m;
  }, [invoicesQ.data]);

  /* =========================
    KPI Strip
  ========================= */
  const kpi = useMemo(() => {
    const inv = invoicesQ.data ?? [];
    const pays = invoicePaymentsQ.data ?? [];
    const items = invoiceItemsQ.data ?? [];

    const revenue = inv.reduce((s, r) => s + n(r.total_amount), 0);
    const vat = inv.reduce((s, r) => s + n(r.vat_amount), 0);
    const discount = inv.reduce((s, r) => s + n(r.discount_amount), 0);
    const invoicesCount = inv.length;
    const collected = pays.reduce((s, p) => s + n(p.amount), 0);
    const qtySold = items.reduce((s, it) => s + n(it.total_qty), 0);

    const custSet = new Set<number>();
    inv.forEach((i) => custSet.add(i.customer_id));

    return { revenue, vat, discount, invoicesCount, collected, qtySold, uniqueCustomers: custSet.size };
  }, [invoicesQ.data, invoicePaymentsQ.data, invoiceItemsQ.data]);

  /* =========================
    Report 1: Daily Invoice Summary
  ========================= */
  const dailyInvoices = useMemo(() => {
    const inv = invoicesQ.data ?? [];
    const map = new Map<string, any>();

    inv.forEach((i) => {
      const key = i.invoice_date;
      const cur = map.get(key) || {
        date: key,
        invoices: 0,
        gross_total: 0,
        subtotal: 0,
        vat: 0,
        discount: 0,
        total: 0,
        unique_customers: new Set<number>(),
      };

      cur.invoices += 1;
      cur.gross_total += n(i.gross_total ?? 0);
      cur.subtotal += n(i.subtotal);
      cur.vat += n(i.vat_amount);
      cur.discount += n(i.discount_amount);
      cur.total += n(i.total_amount);
      cur.unique_customers.add(i.customer_id);

      map.set(key, cur);
    });

    return Array.from(map.values())
      .map((r) => ({
        date: r.date,
        invoices: r.invoices,
        unique_customers: r.unique_customers.size,
        gross_total: r.gross_total,
        subtotal: r.subtotal,
        vat: r.vat,
        discount: r.discount,
        total: r.total,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [invoicesQ.data]);

  /* =========================
    Report 2: Daily Products Sold
  ========================= */
  const dailyProducts = useMemo(() => {
    const items = invoiceItemsQ.data ?? [];
    const invById = invoiceById;

    const map = new Map<string, any>(); // date|product_id

    items.forEach((it) => {
      const inv = invById.get(it.invoice_id);
      if (!inv) return;

      const date = inv.invoice_date;
      const pid = it.product_id;
      const key = `${date}|${pid}`;

      const p = it.products || null;
      const p2 = productById.get(pid);

      const name = p?.name || p2?.name || it.description || `Product #${pid}`;
      const sku = p?.sku || p2?.sku || p2?.item_code || String(pid);

      const cur = map.get(key) || {
        date,
        product_id: pid,
        sku,
        product: name,
        qty: 0,
        sales: 0,
        uom: it.uom || "—",
      };

      cur.qty += n(it.total_qty);
      cur.sales += n(it.line_total);

      map.set(key, cur);
    });

    const rows = Array.from(map.values()).sort((a, b) => b.sales - a.sales);

    const byDate = new Map<string, any[]>();
    rows.forEach((r) => {
      const arr = byDate.get(r.date) || [];
      arr.push(r);
      byDate.set(r.date, arr);
    });

    const dates = Array.from(byDate.keys()).sort((a, b) => a.localeCompare(b));
    return { byDate, dates };
  }, [invoiceItemsQ.data, invoiceById, productById]);

  /* =========================
    Report 3: Customers Purchased (Daily)
  ========================= */
  const customersDaily = useMemo(() => {
    const inv = invoicesQ.data ?? [];
    const map = new Map<string, any>();

    inv.forEach((i) => {
      const key = i.invoice_date;
      const cur = map.get(key) || {
        date: key,
        unique_customers: new Set<number>(),
        invoices: 0,
        total: 0,
        byCustomer: new Map<number, number>(),
      };

      cur.unique_customers.add(i.customer_id);
      cur.invoices += 1;
      cur.total += n(i.total_amount);
      cur.byCustomer.set(i.customer_id, (cur.byCustomer.get(i.customer_id) ?? 0) + n(i.total_amount));

      map.set(key, cur);
    });

    return Array.from(map.values())
      .map((r) => {
        const topCustomers = Array.from(r.byCustomer.entries())
          .map(([cid, amt]: any) => ({
            customer_id: cid,
            customer: customerPrimaryName(cid),
            secondary: customerSecondaryName(cid),
            amount: amt,
          }))
          .sort((a: any, b: any) => b.amount - a.amount)
          .slice(0, 5);

        return {
          date: r.date,
          unique_customers: r.unique_customers.size,
          invoices: r.invoices,
          total: r.total,
          topCustomers,
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [invoicesQ.data, customerById]);

  /* =========================
    Report 4/5: Sales by Rep (Daily/Monthly)
  ========================= */
  const repDaily = useMemo(() => {
    const inv = invoicesQ.data ?? [];
    const map = new Map<string, any>(); // date|rep

    inv.forEach((i) => {
      const rep = (i.sales_rep || "—").trim() || "—";
      const key = `${i.invoice_date}|${rep}`;

      const cur = map.get(key) || {
        date: i.invoice_date,
        rep,
        rep_phone: i.sales_rep_phone || "",
        invoices: 0,
        total: 0,
        vat: 0,
        discount: 0,
      };

      cur.invoices += 1;
      cur.total += n(i.total_amount);
      cur.vat += n(i.vat_amount);
      cur.discount += n(i.discount_amount);

      map.set(key, cur);
    });

    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date) || b.total - a.total);
  }, [invoicesQ.data]);

  const repMonthly = useMemo(() => {
    const inv = invoicesQ.data ?? [];
    const map = new Map<string, any>(); // ym|rep

    inv.forEach((i) => {
      const rep = (i.sales_rep || "—").trim() || "—";
      const ym = ymKey(i.invoice_date);
      const key = `${ym}|${rep}`;

      const cur = map.get(key) || {
        month: ym,
        rep,
        invoices: 0,
        total: 0,
        vat: 0,
        discount: 0,
      };

      cur.invoices += 1;
      cur.total += n(i.total_amount);
      cur.vat += n(i.vat_amount);
      cur.discount += n(i.discount_amount);

      map.set(key, cur);
    });

    return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month) || b.total - a.total);
  }, [invoicesQ.data]);

  /* =========================
    Report 6: Monthly Sales by Customer
  ========================= */
  const customerMonthly = useMemo(() => {
    const inv = invoicesQ.data ?? [];
    const map = new Map<string, any>(); // ym|customer

    inv.forEach((i) => {
      const ym = ymKey(i.invoice_date);
      const cid = i.customer_id;
      const key = `${ym}|${cid}`;

      const cur = map.get(key) || {
        month: ym,
        customer_id: cid,
        customer: customerPrimaryName(cid),
        secondary: customerSecondaryName(cid),
        invoices: 0,
        total: 0,
        vat: 0,
        discount: 0,
      };

      cur.invoices += 1;
      cur.total += n(i.total_amount);
      cur.vat += n(i.vat_amount);
      cur.discount += n(i.discount_amount);

      map.set(key, cur);
    });

    return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month) || b.total - a.total);
  }, [invoicesQ.data, customerById]);

  /* =========================
    Report 7/8: VAT + Discount (Daily/Monthly)
  ========================= */
  const vatDailyMonthly = useMemo(() => {
    const inv = invoicesQ.data ?? [];
    const daily = new Map<string, number>();
    const monthly = new Map<string, number>();

    inv.forEach((i) => {
      const d = i.invoice_date;
      const m = ymKey(i.invoice_date);
      daily.set(d, (daily.get(d) ?? 0) + n(i.vat_amount));
      monthly.set(m, (monthly.get(m) ?? 0) + n(i.vat_amount));
    });

    const dailyRows = Array.from(daily.entries())
      .map(([date, vat]) => ({ date, vat }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const monthlyRows = Array.from(monthly.entries())
      .map(([month, vat]) => ({ month, vat }))
      .sort((a, b) => a.month.localeCompare(b.month));

    return { dailyRows, monthlyRows };
  }, [invoicesQ.data]);

  const discountDailyMonthly = useMemo(() => {
    const inv = invoicesQ.data ?? [];
    const daily = new Map<string, number>();
    const monthly = new Map<string, number>();

    inv.forEach((i) => {
      const d = i.invoice_date;
      const m = ymKey(i.invoice_date);
      daily.set(d, (daily.get(d) ?? 0) + n(i.discount_amount));
      monthly.set(m, (monthly.get(m) ?? 0) + n(i.discount_amount));
    });

    const dailyRows = Array.from(daily.entries())
      .map(([date, discount]) => ({ date, discount }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const monthlyRows = Array.from(monthly.entries())
      .map(([month, discount]) => ({ month, discount }))
      .sort((a, b) => a.month.localeCompare(b.month));

    return { dailyRows, monthlyRows };
  }, [invoicesQ.data]);

  /* =========================
    Export
  ========================= */
  function exportActiveCSV() {
    const base = { from, to, granularity };

    if (activeReport === "DAILY_INVOICES") {
      return downloadCSV(`daily_invoices_${from}_to_${to}.csv`, dailyInvoices.map((r) => ({ ...base, ...r })));
    }

    if (activeReport === "DAILY_PRODUCTS") {
      const out: any[] = [];
      dailyProducts.dates.forEach((d) => {
        (dailyProducts.byDate.get(d) ?? []).forEach((r: any) => out.push({ ...base, ...r }));
      });
      return downloadCSV(`daily_products_sold_${from}_to_${to}.csv`, out);
    }

    if (activeReport === "CUSTOMERS_DAILY") {
      const rows = customersDaily.map((d) => {
        const top =
          d.topCustomers?.map((x: any) => `${x.customer}${x.secondary ? ` (${x.secondary})` : ""} (Rs ${money(x.amount)})`).join(" | ") || "";
        return { ...base, date: d.date, unique_customers: d.unique_customers, invoices: d.invoices, total: d.total, top_customers: top };
      });
      return downloadCSV(`customers_purchased_daily_${from}_to_${to}.csv`, rows);
    }

    if (activeReport === "REP_DAILY") {
      return downloadCSV(`sales_by_rep_daily_${from}_to_${to}.csv`, repDaily.map((r) => ({ ...base, ...r })));
    }

    if (activeReport === "REP_MONTHLY") {
      return downloadCSV(`sales_by_rep_monthly_${from}_to_${to}.csv`, repMonthly.map((r) => ({ ...base, ...r })));
    }

    if (activeReport === "CUSTOMER_MONTHLY") {
      return downloadCSV(
        `sales_by_customer_monthly_${from}_to_${to}.csv`,
        customerMonthly.map((r) => ({ ...base, ...r }))
      );
    }

    if (activeReport === "VAT") {
      const rows = (granularity === "DAILY" ? vatDailyMonthly.dailyRows : vatDailyMonthly.monthlyRows).map((r: any) => ({
        ...base,
        ...r,
        vat: r.vat,
      }));
      return downloadCSV(`vat_${granularity.toLowerCase()}_${from}_to_${to}.csv`, rows);
    }

    const rows = (granularity === "DAILY" ? discountDailyMonthly.dailyRows : discountDailyMonthly.monthlyRows).map((r: any) => ({
      ...base,
      ...r,
      discount: r.discount,
    }));
    return downloadCSV(`discount_${granularity.toLowerCase()}_${from}_to_${to}.csv`, rows);
  }

  /* =========================
    UI
  ========================= */
  return (
    <div className="space-y-6 animate-fade-in">
      {/* ===== Header ===== */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight">Reports</h1>
          <p className="text-muted-foreground mt-1">Premium reporting hub • Real figures • Daily & monthly exports</p>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="border bg-primary/10 text-primary">
              Sales statuses: {salesStatuses.join(", ")}
            </Badge>

            {generatedAt ? (
              <Badge variant="secondary" className="border bg-muted/30">
                Last generated: <span className="ml-1 font-semibold">{generatedAt}</span>
              </Badge>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={forceRefetchAll} disabled={isGenerating || anyLoading}>
            <RefreshCw className={"h-4 w-4 mr-2 " + (isGenerating ? "animate-spin" : "")} />
            {isGenerating ? "Refreshing..." : "Refresh"}
          </Button>

          <Button variant="outline" onClick={exportActiveCSV} disabled={anyLoading || isGenerating}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>

          <Button className="gradient-primary shadow-glow text-primary-foreground" onClick={forceRefetchAll} disabled={isGenerating || anyLoading}>
            <ArrowUpRight className="h-4 w-4 mr-2" />
            {isGenerating ? "Generating..." : "Generate"}
          </Button>
        </div>
      </div>

      {/* ===== KPI Strip ===== */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
        <StatCard title="Revenue" value={`Rs ${money(kpi.revenue)}`} hint={`${from} → ${to}`} icon={<TrendingUp className="h-4 w-4" />} />
        <StatCard title="Invoices" value={`${kpi.invoicesCount}`} hint={`Unique customers: ${kpi.uniqueCustomers}`} icon={<FileText className="h-4 w-4" />} />
        <StatCard title="Collected" value={`Rs ${money(kpi.collected)}`} hint="From invoice_payments" icon={<Receipt className="h-4 w-4" />} />
        <StatCard title="VAT" value={`Rs ${money(kpi.vat)}`} hint={`${granularity === "DAILY" ? "Daily" : "Monthly"} view below`} icon={<Percent className="h-4 w-4" />} />
        <StatCard title="Discount" value={`Rs ${money(kpi.discount)}`} hint="From invoices.discount_amount" icon={<Receipt className="h-4 w-4" />} />
        <StatCard title="Qty Sold" value={`${money(kpi.qtySold)}`} hint="Sum invoice_items.total_qty" icon={<Package className="h-4 w-4" />} />
      </div>

      {/* ===== Filters ===== */}
      <Card className="shadow-premium">
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>Filters</CardTitle>
              <CardDescription>Choose date range, then pick the report</CardDescription>
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
          <div className="grid gap-3 md:grid-cols-[auto_auto_auto_1fr] md:items-end">
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
              <Label>Granularity</Label>
              <div className="flex gap-2">
                <Button
                  variant={granularity === "DAILY" ? "default" : "outline"}
                  className={granularity === "DAILY" ? "gradient-primary shadow-glow text-primary-foreground" : ""}
                  onClick={() => setGranularity("DAILY")}
                >
                  Daily
                </Button>
                <Button
                  variant={granularity === "MONTHLY" ? "default" : "outline"}
                  className={granularity === "MONTHLY" ? "gradient-primary shadow-glow text-primary-foreground" : ""}
                  onClick={() => setGranularity("MONTHLY")}
                >
                  Monthly
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Report Type</Label>
              <select className="h-10 w-full rounded-md border px-3 bg-background" value={activeReport} onChange={(e) => setActiveReport(e.target.value as any)}>
                {REPORTS.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ===== Quick Tabs ===== */}
      <Card className="shadow-premium">
        <CardContent className="p-4">
          <PillTabs value={activeReport} onChange={setActiveReport} items={REPORTS.map((r) => ({ key: r.key, label: r.label, icon: r.icon }))} />
        </CardContent>
      </Card>

      {/* ===== Report Center ===== */}
      <Card className="shadow-premium">
        <CardHeader>
          <CardTitle>Report Center</CardTitle>
          <CardDescription>
            Showing: <b>{REPORTS.find((r) => r.key === activeReport)?.label || activeReport}</b> • Period: <b>{from}</b> → <b>{to}</b>
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {anyError ? (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4">
              <div className="text-sm font-semibold text-destructive">Failed to load data</div>
              <div className="mt-2 text-sm text-destructive/90 whitespace-pre-wrap">{(anyError as any)?.message || "Unknown error"}</div>
              <div className="mt-3 text-xs text-muted-foreground">If other pages work but Reports is blank, it’s usually RLS for one of these tables.</div>
            </div>
          ) : null}

          {/* DAILY INVOICES */}
          {activeReport === "DAILY_INVOICES" && !anyError && (
            <div className="overflow-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/20">
                  <tr>
                    <th className="text-left p-3">Date</th>
                    <th className="text-right p-3">Invoices</th>
                    <th className="text-right p-3">Customers</th>
                    <th className="text-right p-3">Gross</th>
                    <th className="text-right p-3">Subtotal</th>
                    <th className="text-right p-3">VAT</th>
                    <th className="text-right p-3">Discount</th>
                    <th className="text-right p-3">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {dailyInvoices.map((r) => (
                    <tr key={r.date} className="hover:bg-muted/30">
                      <td className="p-3 font-medium">{r.date}</td>
                      <td className="p-3 text-right">{r.invoices}</td>
                      <td className="p-3 text-right">{r.unique_customers}</td>
                      <td className="p-3 text-right">Rs {money(r.gross_total)}</td>
                      <td className="p-3 text-right">Rs {money(r.subtotal)}</td>
                      <td className="p-3 text-right font-semibold">Rs {money(r.vat)}</td>
                      <td className="p-3 text-right">Rs {money(r.discount)}</td>
                      <td className="p-3 text-right font-semibold">Rs {money(r.total)}</td>
                    </tr>
                  ))}
                  {dailyInvoices.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-6 text-center text-muted-foreground">
                        No invoices in this range.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          )}

          {/* DAILY PRODUCTS SOLD */}
          {activeReport === "DAILY_PRODUCTS" && !anyError && (
            <div className="space-y-4">
              {dailyProducts.dates.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">No sold products found in this range.</div>
              ) : (
                dailyProducts.dates.map((d) => {
                  const all = dailyProducts.byDate.get(d) ?? [];
                  const rows = all.slice(0, 12);
                  const dayTotal = all.reduce((s: number, r: any) => s + n(r.sales), 0);
                  const dayQty = all.reduce((s: number, r: any) => s + n(r.qty), 0);

                  return (
                    <Card key={d} className="shadow-premium">
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <CardTitle className="text-base">{d}</CardTitle>
                            <CardDescription>
                              Total Sales: <b>Rs {money(dayTotal)}</b> • Qty: <b>{money(dayQty)}</b>
                            </CardDescription>
                          </div>
                          <Badge variant="secondary" className="border bg-primary/10 text-primary">
                            Top {rows.length}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="overflow-auto">
                          <table className="w-full text-sm">
                            <thead className="border-b bg-muted/20">
                              <tr>
                                <th className="text-left p-3">SKU</th>
                                <th className="text-left p-3">Product</th>
                                <th className="text-right p-3">Qty</th>
                                <th className="text-right p-3">Sales</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y">
                              {rows.map((r: any) => (
                                <tr key={`${r.date}|${r.product_id}`} className="hover:bg-muted/30">
                                  <td className="p-3 font-medium">{r.sku}</td>
                                  <td className="p-3">{r.product}</td>
                                  <td className="p-3 text-right">{money(r.qty)}</td>
                                  <td className="p-3 text-right font-semibold">Rs {money(r.sales)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="mt-3 text-xs text-muted-foreground">Based on invoice_items.line_total and total_qty.</div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          )}

          {/* CUSTOMERS PURCHASED (DAILY) */}
          {activeReport === "CUSTOMERS_DAILY" && !anyError && (
            <div className="overflow-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/20">
                  <tr>
                    <th className="text-left p-3">Date</th>
                    <th className="text-right p-3">Unique Customers</th>
                    <th className="text-right p-3">Invoices</th>
                    <th className="text-right p-3">Total</th>
                    <th className="text-left p-3">Top Customers</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {customersDaily.map((r) => (
                    <tr key={r.date} className="hover:bg-muted/30">
                      <td className="p-3 font-medium">{r.date}</td>
                      <td className="p-3 text-right">{r.unique_customers}</td>
                      <td className="p-3 text-right">{r.invoices}</td>
                      <td className="p-3 text-right font-semibold">Rs {money(r.total)}</td>
                      <td className="p-3 text-sm text-muted-foreground">
                        {r.topCustomers?.length
                          ? r.topCustomers
                              .map((c: any) => `${c.customer}${c.secondary ? ` (${c.secondary})` : ""} (Rs ${money(c.amount)})`)
                              .join(" • ")
                          : "—"}
                      </td>
                    </tr>
                  ))}
                  {customersDaily.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-muted-foreground">
                        No purchases in this range.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          )}

          {/* SALES BY REP (DAILY) */}
          {activeReport === "REP_DAILY" && !anyError && (
            <div className="overflow-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/20">
                  <tr>
                    <th className="text-left p-3">Date</th>
                    <th className="text-left p-3">Sales Rep</th>
                    <th className="text-right p-3">Invoices</th>
                    <th className="text-right p-3">Discount</th>
                    <th className="text-right p-3">VAT</th>
                    <th className="text-right p-3">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {repDaily.map((r) => (
                    <tr key={`${r.date}|${r.rep}`} className="hover:bg-muted/30">
                      <td className="p-3 font-medium">{r.date}</td>
                      <td className="p-3">
                        <div className="font-medium">{r.rep}</div>
                        {r.rep_phone ? <div className="text-xs text-muted-foreground">{r.rep_phone}</div> : null}
                      </td>
                      <td className="p-3 text-right">{r.invoices}</td>
                      <td className="p-3 text-right">Rs {money(r.discount)}</td>
                      <td className="p-3 text-right">Rs {money(r.vat)}</td>
                      <td className="p-3 text-right font-semibold">Rs {money(r.total)}</td>
                    </tr>
                  ))}
                  {repDaily.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-muted-foreground">
                        No rep sales in this range.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          )}

          {/* SALES BY REP (MONTHLY) */}
          {activeReport === "REP_MONTHLY" && !anyError && (
            <div className="overflow-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/20">
                  <tr>
                    <th className="text-left p-3">Month</th>
                    <th className="text-left p-3">Sales Rep</th>
                    <th className="text-right p-3">Invoices</th>
                    <th className="text-right p-3">Discount</th>
                    <th className="text-right p-3">VAT</th>
                    <th className="text-right p-3">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {repMonthly.map((r) => (
                    <tr key={`${r.month}|${r.rep}`} className="hover:bg-muted/30">
                      <td className="p-3 font-medium">{r.month}</td>
                      <td className="p-3 font-medium">{r.rep}</td>
                      <td className="p-3 text-right">{r.invoices}</td>
                      <td className="p-3 text-right">Rs {money(r.discount)}</td>
                      <td className="p-3 text-right">Rs {money(r.vat)}</td>
                      <td className="p-3 text-right font-semibold">Rs {money(r.total)}</td>
                    </tr>
                  ))}
                  {repMonthly.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-muted-foreground">
                        No monthly rep sales in this range.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          )}

          {/* MONTHLY SALES BY CUSTOMER */}
          {activeReport === "CUSTOMER_MONTHLY" && !anyError && (
            <div className="overflow-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/20">
                  <tr>
                    <th className="text-left p-3">Month</th>
                    <th className="text-left p-3">Customer</th>
                    <th className="text-right p-3">Invoices</th>
                    <th className="text-right p-3">Discount</th>
                    <th className="text-right p-3">VAT</th>
                    <th className="text-right p-3">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {customerMonthly.map((r) => (
                    <tr key={`${r.month}|${r.customer_id}`} className="hover:bg-muted/30">
                      <td className="p-3 font-medium">{r.month}</td>
                      <td className="p-3">
                        <div className="font-medium">{r.customer}</div>
                        {r.secondary ? <div className="text-xs text-muted-foreground">{r.secondary}</div> : null}
                        <div className="text-xs text-muted-foreground">ID: {r.customer_id}</div>
                      </td>
                      <td className="p-3 text-right">{r.invoices}</td>
                      <td className="p-3 text-right">Rs {money(r.discount)}</td>
                      <td className="p-3 text-right">Rs {money(r.vat)}</td>
                      <td className="p-3 text-right font-semibold">Rs {money(r.total)}</td>
                    </tr>
                  ))}
                  {customerMonthly.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-muted-foreground">
                        No monthly customer sales in this range.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          )}

          {/* VAT REPORT */}
          {activeReport === "VAT" && !anyError && (
            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="shadow-premium">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{granularity === "DAILY" ? "Daily VAT" : "Monthly VAT"}</CardTitle>
                  <CardDescription>From invoices.vat_amount</CardDescription>
                </CardHeader>
                <CardContent className="overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b bg-muted/20">
                      <tr>
                        <th className="text-left p-3">{granularity === "DAILY" ? "Date" : "Month"}</th>
                        <th className="text-right p-3">VAT</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {(granularity === "DAILY" ? vatDailyMonthly.dailyRows : vatDailyMonthly.monthlyRows).map((r: any) => (
                        <tr key={r.date || r.month} className="hover:bg-muted/30">
                          <td className="p-3 font-medium">{r.date || r.month}</td>
                          <td className="p-3 text-right font-semibold">Rs {money(r.vat)}</td>
                        </tr>
                      ))}
                      {(granularity === "DAILY" ? vatDailyMonthly.dailyRows : vatDailyMonthly.monthlyRows).length === 0 ? (
                        <tr>
                          <td colSpan={2} className="p-6 text-center text-muted-foreground">
                            No VAT entries in this range.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </CardContent>
              </Card>

              <Card className="shadow-premium">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Total VAT (Period)</CardTitle>
                  <CardDescription>Sum of selected range</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-semibold">Rs {money(kpi.vat)}</div>
                  <div className="mt-2 text-sm text-muted-foreground">
                    Period: <b>{from}</b> → <b>{to}</b>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* DISCOUNT REPORT */}
          {activeReport === "DISCOUNT" && !anyError && (
            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="shadow-premium">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{granularity === "DAILY" ? "Daily Discount" : "Monthly Discount"}</CardTitle>
                  <CardDescription>From invoices.discount_amount</CardDescription>
                </CardHeader>
                <CardContent className="overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b bg-muted/20">
                      <tr>
                        <th className="text-left p-3">{granularity === "DAILY" ? "Date" : "Month"}</th>
                        <th className="text-right p-3">Discount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {(granularity === "DAILY" ? discountDailyMonthly.dailyRows : discountDailyMonthly.monthlyRows).map((r: any) => (
                        <tr key={r.date || r.month} className="hover:bg-muted/30">
                          <td className="p-3 font-medium">{r.date || r.month}</td>
                          <td className="p-3 text-right font-semibold">Rs {money(r.discount)}</td>
                        </tr>
                      ))}
                      {(granularity === "DAILY" ? discountDailyMonthly.dailyRows : discountDailyMonthly.monthlyRows).length === 0 ? (
                        <tr>
                          <td colSpan={2} className="p-6 text-center text-muted-foreground">
                            No discounts in this range.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </CardContent>
              </Card>

              <Card className="shadow-premium">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Total Discount (Period)</CardTitle>
                  <CardDescription>Sum of selected range</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-semibold">Rs {money(kpi.discount)}</div>
                  <div className="mt-2 text-sm text-muted-foreground">
                    Period: <b>{from}</b> → <b>{to}</b>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="text-xs text-muted-foreground">
        Tables used: <b>invoices</b>, <b>invoice_items</b>, <b>invoice_payments</b>, <b>customers</b>, <b>products</b>. (Sales excludes DRAFT/VOID)
      </div>
    </div>
  );
}
