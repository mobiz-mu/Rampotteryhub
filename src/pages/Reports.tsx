// src/pages/Reports.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import html2pdf from "html2pdf.js";
import { toast } from "sonner";

import "@/styles/reports.css";

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
  Mail,
  MessageCircle,
  Printer,
  ChevronRight,
  Search,
  AlertTriangle,
} from "lucide-react";

/* =========================
  Helpers
========================= */
function money(v: any) {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return "0.00";
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function moneySigned(v: any) {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n) || n === 0) return "0.00";
  const abs = Math.abs(n);
  const s = abs.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `-${s}` : s;
}
function n(v: any) {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}
function clamp(num: number, a: number, b: number) {
  return Math.max(a, Math.min(b, num));
}
function isBetweenInclusive(dateISO: string, from: string, to: string) {
  return !!dateISO && !!from && !!to && dateISO >= from && dateISO <= to;
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
  return String(dateISO || "").slice(0, 7);
}
function chunk<T>(arr: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function downloadCSV(filename: string, rows: Array<Record<string, any>>) {
  if (!rows?.length) {
    toast.error("No data to export");
    return;
  }

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
  Types
========================= */
type InvoiceRow = {
  id: number;
  invoice_number: string;
  customer_id: number;
  invoice_date: string;
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
  payment_date: string;
  amount: number;
  method: string;
};

type CreditNoteRow = {
  id: number;
  credit_note_number: string;
  credit_note_date: string;
  customer_id: number;
  invoice_id: number | null;
  reason: string | null;
  subtotal: number;
  vat_amount: number;
  total_amount: number;
  status: string;
  sales_rep: string | null;
  sales_rep_phone: string | null;
};

type CreditNoteItemRow = {
  id: number;
  credit_note_id: number;
  product_id: number | null;
  total_qty: number;
  line_total: number;
  uom: string | null;
  description: string | null;
  products?: { id: number; sku: string; item_code: string | null; name: string } | null;
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
  Ultra-light Virtual List
========================= */
function VirtualList<T>({
  items,
  height,
  rowHeight,
  overscan = 10,
  renderRow,
}: {
  items: T[];
  height: number;
  rowHeight: number;
  overscan?: number;
  renderRow: (item: T, index: number) => React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);

  const totalHeight = items.length * rowHeight;
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const endIndex = Math.min(items.length - 1, Math.ceil((scrollTop + height) / rowHeight) + overscan);

  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    setScrollTop(el.scrollTop);
  };

  const visible: React.ReactNode[] = [];
  for (let i = startIndex; i <= endIndex; i++) {
    const top = i * rowHeight;
    visible.push(
      <div key={i} style={{ position: "absolute", top, left: 0, right: 0, height: rowHeight }}>
        {renderRow(items[i], i)}
      </div>
    );
  }

  return (
    <div
      ref={ref}
      onScroll={onScroll}
      style={{ height, overflow: "auto", position: "relative", willChange: "transform" }}
      className="scroll-smooth"
    >
      <div style={{ height: totalHeight, position: "relative" }}>{visible}</div>
    </div>
  );
}

/* =========================
  Premium UI bits
========================= */
function StatCard(props: { title: string; value: string; hint?: string; icon?: React.ReactNode; loading?: boolean }) {
  return (
    <Card className="reports-card">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-medium text-muted-foreground">{props.title}</div>
            <div className="mt-1 text-lg md:text-xl font-semibold tracking-tight tabular-nums">
              {props.loading ? <span className="inline-block h-6 w-28 rounded bg-muted animate-pulse" /> : props.value}
            </div>
            {props.hint ? <div className="mt-1 text-[11px] text-muted-foreground">{props.hint}</div> : null}
          </div>
          {props.icon ? (
            <div className="h-9 w-9 rounded-2xl border bg-white/70 flex items-center justify-center text-muted-foreground">
              {props.icon}
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function ReportNavCard(props: {
  active: boolean;
  label: string;
  desc: string;
  icon: React.ReactNode;
  onClick: () => void;
  badge?: string;
}) {
  return (
    <button
      onClick={props.onClick}
      className={[
        "w-full text-left rounded-2xl border px-4 py-3 transition relative overflow-hidden",
        props.active
          ? "bg-red-800 text-white border-red-900 shadow-[0_18px_60px_rgba(127,29,29,0.28)]"
          : "bg-white hover:bg-muted/30",
      ].join(" ")}
      type="button"
    >
      {props.active ? (
        <div className="pointer-events-none absolute inset-0 opacity-70 bg-[radial-gradient(800px_circle_at_0%_0%,rgba(255,255,255,0.18),transparent_55%),radial-gradient(900px_circle_at_100%_0%,rgba(255,255,255,0.10),transparent_60%)]" />
      ) : null}

      <div className="relative flex items-start gap-3">
        <div
          className={[
            "h-9 w-9 rounded-2xl flex items-center justify-center border",
            props.active ? "bg-white/10 border-white/15" : "bg-background",
          ].join(" ")}
        >
          {props.icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="font-semibold truncate">{props.label}</div>
            <div className="flex items-center gap-2">
              {props.badge ? (
                <span
                  className={[
                    "text-[10px] px-2 py-0.5 rounded-full border",
                    props.active ? "border-white/20 bg-white/10" : "border-border bg-muted/30",
                  ].join(" ")}
                >
                  {props.badge}
                </span>
              ) : null}
              <ChevronRight className={["h-4 w-4", props.active ? "text-white/90" : "text-muted-foreground"].join(" ")} />
            </div>
          </div>
          <div
            className={[
              "text-[11px] mt-0.5 leading-snug",
              props.active ? "text-white/80" : "text-muted-foreground",
            ].join(" ")}
          >
            {props.desc}
          </div>
        </div>
      </div>
    </button>
  );
}

function ReportNavTile(props: {
  active: boolean;
  label: string;
  desc: string;
  icon: React.ReactNode;
  onClick: () => void;
  badge?: string;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={[
        "reports-tile",
        props.active ? "is-active" : "",
      ].join(" ")}
    >
      <div className="reports-tileInner">
        <div className="reports-tileTop">
          <div className={["reports-tileIcon", props.active ? "is-active" : ""].join(" ")}>
            {props.icon}
          </div>

          {props.badge ? (
            <div className={["reports-tileBadge", props.active ? "is-active" : ""].join(" ")}>
              {props.badge}
            </div>
          ) : (
            <div className="reports-tileChevron">›</div>
          )}
        </div>

        <div className="reports-tileTitle">{props.label}</div>
        <div className="reports-tileDesc">{props.desc}</div>
      </div>
    </button>
  );
}



function RedButton(props: React.ComponentProps<typeof Button>) {
  const { className, ...rest } = props;
  return (
    <Button
      {...rest}
      className={[
        "bg-red-800 text-white hover:bg-red-900 shadow-[0_16px_46px_rgba(127,29,29,0.22)]",
        "focus-visible:ring-2 focus-visible:ring-red-700/40",
        className || "",
      ].join(" ")}
    />
  );
}

function TableWrap(props: { children: React.ReactNode; maxHeight?: number }) {
  return (
    <div
      className="rpt-tableWrap"
      data-pdf-nosroll="1"
      style={{ maxHeight: props.maxHeight ?? 520 }}
    >
      {props.children}
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

  // print/pdf container ONLY
  const reportPrintRef = useRef<HTMLDivElement | null>(null);

  const REPORTS = [
    {
      key: "DAILY_INVOICES",
      label: "Daily Invoices (Net)",
      desc: "Net daily totals (Invoices minus Credit Notes). Payments shown as deductions, matched to invoice_date.",
      icon: <FileText className="h-4 w-4" />,
    },
    { key: "DAILY_PRODUCTS", label: "Daily Products Sold (Net)", desc: "Net products sold per day (sales minus returns)", icon: <Package className="h-4 w-4" /> },
    { key: "CUSTOMERS_DAILY", label: "Customers Purchased (Net)", desc: "Net totals per day (sales minus credits)", icon: <Users className="h-4 w-4" /> },
    { key: "REP_DAILY", label: "Sales by Rep (Daily • Net)", desc: "Net daily sales by salesman (includes credits)", icon: <UserRound className="h-4 w-4" /> },
    { key: "REP_MONTHLY", label: "Sales by Rep (Monthly • Net)", desc: "Net monthly sales by salesman (includes credits)", icon: <Layers className="h-4 w-4" /> },
    { key: "CUSTOMER_MONTHLY", label: "Sales by Customer (Monthly • Net)", desc: "Net monthly customer totals (includes credits)", icon: <Users className="h-4 w-4" /> },
    { key: "VAT", label: "VAT Report (Net)", desc: "Net VAT (Invoices VAT minus Credit Notes VAT)", icon: <Percent className="h-4 w-4" /> },
    { key: "DISCOUNT", label: "Discount Report", desc: "Discount totals (from invoices only)", icon: <Receipt className="h-4 w-4" /> },
    { key: "SALESMAN_PERIOD", label: "Report by Salesman (Period • Net)", desc: "Net period totals per salesman (includes credits)", icon: <UserRound className="h-4 w-4" /> },
    { key: "PRODUCTS_PERIOD", label: "Report by Products Sold (Period • Net)", desc: "Net totals per product (sales minus returns)", icon: <Package className="h-4 w-4" /> },
    {
      key: "STATEMENT_CUSTOMER",
      label: "Statement of Account (Customer)",
      desc: "Full history: Invoices (+), Payments (-), Credit Notes (-) with running balance + Balance Due",
      icon: <FileText className="h-4 w-4" />,
      badge: "PDF",
    },
  ] as const;

  type ActiveReport = (typeof REPORTS)[number]["key"];
  const [activeReport, setActiveReport] = useState<ActiveReport>("DAILY_INVOICES");

  const [statementCustomerId, setStatementCustomerId] = useState<number>(0);

  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedAt, setGeneratedAt] = useState<string>("");

  const [navSearch, setNavSearch] = useState("");

  // frozen timestamp for print header
  const printStamp = useMemo(() => new Date().toLocaleString(), [activeReport, from, to, generatedAt]);

  // statuses
  const salesStatuses = useMemo(() => ["ISSUED", "PARTIALLY_PAID", "PAID"], []);
  const creditStatuses = useMemo(() => ["ISSUED", "REFUNDED"], []);

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

  function needInvoiceItems(r: ActiveReport) {
    return r === "DAILY_PRODUCTS" || r === "PRODUCTS_PERIOD";
  }
  function needCreditNoteItems(r: ActiveReport) {
    return r === "DAILY_PRODUCTS" || r === "PRODUCTS_PERIOD";
  }
  function needProducts(r: ActiveReport) {
    return r === "DAILY_PRODUCTS" || r === "PRODUCTS_PERIOD";
  }
  function needCustomers(r: ActiveReport) {
    return r === "CUSTOMERS_DAILY" || r === "CUSTOMER_MONTHLY" || r === "STATEMENT_CUSTOMER";
  }
  function needCredits(r: ActiveReport) {
    return (
      r === "DAILY_INVOICES" ||
      r === "DAILY_PRODUCTS" ||
      r === "CUSTOMERS_DAILY" ||
      r === "REP_DAILY" ||
      r === "REP_MONTHLY" ||
      r === "CUSTOMER_MONTHLY" ||
      r === "VAT" ||
      r === "SALESMAN_PERIOD" ||
      r === "PRODUCTS_PERIOD" ||
      r === "STATEMENT_CUSTOMER"
    );
  }

  async function forceRefetchAll() {
    if (from && to && from > to) return toast.error("Invalid date range");
    setIsGenerating(true);
    try {
      await qc.invalidateQueries({ predicate: (q) => String(q.queryKey?.[0] ?? "").startsWith("rpt_") });
      setGeneratedAt(new Date().toLocaleString());
      toast.success("Reports refreshed");
    } finally {
      setIsGenerating(false);
    }
  }

  /* =========================
    Queries (optimized)
  ========================= */
  const rangeIsValid = !!from && !!to && from <= to;

  const invoicesQ = useQuery({
    queryKey: ["rpt_invoices_real", from, to, salesStatuses.join("|")],
    enabled: rangeIsValid,
    staleTime: 30_000,
    gcTime: 10 * 60_000,
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

  // ✅ Accrual-matched payments: only payments for invoices whose invoice_date is in [from..to]
  // (and payment_date <= to)
  const invoicePaymentsQ = useQuery({
    queryKey: ["rpt_invoice_payments_accrual", from, to, salesStatuses.join("|")],
    enabled: rangeIsValid,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoice_payments")
        .select("id,invoice_id,payment_date,amount,method,invoices!inner(invoice_date,status)")
        .gte("invoices.invoice_date", from)
        .lte("invoices.invoice_date", to)
        .in("invoices.status", salesStatuses)
        .lte("payment_date", to);

      if (error) throw error;

      return (data ?? []).map((r: any) => ({
        id: r.id,
        invoice_id: r.invoice_id,
        payment_date: r.payment_date,
        amount: r.amount,
        method: r.method,
      })) as InvoicePaymentRow[];
    },
  });

  const creditNotesQ = useQuery({
    queryKey: ["rpt_credit_notes", from, to, creditStatuses.join("|")],
    enabled: rangeIsValid && needCredits(activeReport),
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credit_notes")
        .select(
          "id,credit_note_number,credit_note_date,customer_id,invoice_id,reason,subtotal,vat_amount,total_amount,status,sales_rep,sales_rep_phone"
        )
        .gte("credit_note_date", from)
        .lte("credit_note_date", to)
        .in("status", creditStatuses);

      if (error) throw error;
      return (data ?? []) as CreditNoteRow[];
    },
  });

  const customersQ = useQuery({
    queryKey: ["rpt_customers_all"],
    enabled: needCustomers(activeReport),
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("id,name,client_name");
      if (error) throw error;
      return (data ?? []) as CustomerRow[];
    },
  });

  const productsQ = useQuery({
    queryKey: ["rpt_products_all"],
    enabled: needProducts(activeReport),
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("id,sku,item_code,name,cost_price,selling_price");
      if (error) throw error;
      return (data ?? []) as ProductRow[];
    },
  });

  const invoiceItemsQ = useQuery({
    queryKey: ["rpt_invoice_items_for_range", from, to, invoicesQ.data?.length ?? 0],
    enabled: needInvoiceItems(activeReport) && !!invoicesQ.data && (invoicesQ.data?.length ?? 0) > 0,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
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

  const creditNoteItemsQ = useQuery({
    queryKey: ["rpt_credit_note_items_for_range", from, to, creditNotesQ.data?.length ?? 0],
    enabled: needCreditNoteItems(activeReport) && !!creditNotesQ.data && (creditNotesQ.data?.length ?? 0) > 0,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    queryFn: async () => {
      const cnIds = (creditNotesQ.data ?? []).map((c) => c.id);
      if (cnIds.length === 0) return [] as CreditNoteItemRow[];

      const parts = chunk(cnIds, 500);
      const out: CreditNoteItemRow[] = [];

      for (const ids of parts) {
        const { data, error } = await supabase
          .from("credit_note_items")
          .select("id,credit_note_id,product_id,total_qty,line_total,uom,description,products(id,sku,item_code,name)")
          .in("credit_note_id", ids);

        if (error) throw error;
        (data ?? []).forEach((r: any) => out.push(r as CreditNoteItemRow));
      }

      return out;
    },
  });

  /* =========================
    Statement "full history" queries
  ========================= */
  const statementEnabled = rangeIsValid && activeReport === "STATEMENT_CUSTOMER" && !!statementCustomerId;

  const stmtInvoicesAllQ = useQuery({
    queryKey: ["rpt_stmt_invoices_all", statementCustomerId, to, salesStatuses.join("|")],
    enabled: statementEnabled,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select(
          "id,invoice_number,customer_id,invoice_date,subtotal,vat_amount,total_amount,gross_total,status,discount_amount,discount_percent,sales_rep,sales_rep_phone"
        )
        .eq("customer_id", statementCustomerId)
        .lte("invoice_date", to)
        .in("status", salesStatuses);

      if (error) throw error;
      return (data ?? []) as InvoiceRow[];
    },
  });

  const stmtCreditNotesAllQ = useQuery({
    queryKey: ["rpt_stmt_credit_notes_all", statementCustomerId, to, creditStatuses.join("|")],
    enabled: statementEnabled,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credit_notes")
        .select(
          "id,credit_note_number,credit_note_date,customer_id,invoice_id,reason,subtotal,vat_amount,total_amount,status,sales_rep,sales_rep_phone"
        )
        .eq("customer_id", statementCustomerId)
        .lte("credit_note_date", to)
        .in("status", creditStatuses);

      if (error) throw error;
      return (data ?? []) as CreditNoteRow[];
    },
  });

  const stmtPaymentsAllQ = useQuery({
    queryKey: ["rpt_stmt_payments_all", statementCustomerId, to, stmtInvoicesAllQ.data?.length ?? 0],
    enabled: statementEnabled && !!stmtInvoicesAllQ.data && (stmtInvoicesAllQ.data?.length ?? 0) > 0,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    queryFn: async () => {
      const invIds = (stmtInvoicesAllQ.data ?? []).map((i) => i.id);
      if (invIds.length === 0) return [] as InvoicePaymentRow[];

      const parts = chunk(invIds, 500);
      const out: InvoicePaymentRow[] = [];

      for (const ids of parts) {
        const { data, error } = await supabase
          .from("invoice_payments")
          .select("id,invoice_id,payment_date,amount,method")
          .in("invoice_id", ids)
          .lte("payment_date", to);

        if (error) throw error;
        (data ?? []).forEach((r: any) => out.push(r as InvoicePaymentRow));
      }

      return out;
    },
  });

  const anyError =
    invoicesQ.error ||
    invoicePaymentsQ.error ||
    creditNotesQ.error ||
    customersQ.error ||
    productsQ.error ||
    invoiceItemsQ.error ||
    creditNoteItemsQ.error ||
    stmtInvoicesAllQ.error ||
    stmtCreditNotesAllQ.error ||
    stmtPaymentsAllQ.error;

  const anyLoading =
    !rangeIsValid ||
    invoicesQ.isLoading ||
    invoicePaymentsQ.isLoading ||
    (needCredits(activeReport) ? creditNotesQ.isLoading : false) ||
    customersQ.isLoading ||
    productsQ.isLoading ||
    invoiceItemsQ.isLoading ||
    creditNoteItemsQ.isLoading ||
    (statementEnabled ? stmtInvoicesAllQ.isLoading || stmtCreditNotesAllQ.isLoading || stmtPaymentsAllQ.isLoading : false);

  /* =========================
    Maps
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

  const creditById = useMemo(() => {
    const m = new Map<number, CreditNoteRow>();
    (creditNotesQ.data ?? []).forEach((c) => m.set(c.id, c));
    return m;
  }, [creditNotesQ.data]);

  // ✅ Payments grouped by invoice_date (accrual matched)
  const paymentsByInvoiceDate = useMemo(() => {
    const m = new Map<string, number>(); // invoice_date -> sum(payments)
    const invById = new Map<number, InvoiceRow>();
    (invoicesQ.data ?? []).forEach((i) => invById.set(i.id, i));

    (invoicePaymentsQ.data ?? []).forEach((p) => {
      const inv = invById.get(p.invoice_id);
      if (!inv) return;
      const d = inv.invoice_date;
      m.set(d, (m.get(d) ?? 0) + n(p.amount));
    });

    return m;
  }, [invoicePaymentsQ.data, invoicesQ.data]);

  /* =========================
    KPI Strip
    - Revenue/Gross/VAT remain NET (Invoices - Credit Notes)
    - "Collected" here is accrual-matched payments for invoices issued in range
    - "Net After Payments" = Revenue - Collected
  ========================= */
  const kpi = useMemo(() => {
    const inv = invoicesQ.data ?? [];
    const cn = creditNotesQ.data ?? [];
    const pays = invoicePaymentsQ.data ?? [];
    const items = invoiceItemsQ.data ?? [];
    const cnItems = creditNoteItemsQ.data ?? [];

    const revenue = inv.reduce((s, r) => s + n(r.total_amount), 0) - cn.reduce((s, r) => s + n(r.total_amount), 0);
    const vat = inv.reduce((s, r) => s + n(r.vat_amount), 0) - cn.reduce((s, r) => s + n(r.vat_amount), 0);
    const discount = inv.reduce((s, r) => s + n(r.discount_amount), 0);
    const invoicesCount = inv.length;
    const creditNotesCount = cn.length;

    const collected = pays.reduce((s, p) => s + n(p.amount), 0);
    const netAfterPayments = revenue - collected;

    const qtySold = items.reduce((s, it) => s + n(it.total_qty), 0) - cnItems.reduce((s, it) => s + n(it.total_qty), 0);

    const custSet = new Set<number>();
    inv.forEach((i) => custSet.add(i.customer_id));
    cn.forEach((c) => custSet.add(c.customer_id));

    const grossInv = inv.reduce((s, r) => {
      const g = r.gross_total != null ? n(r.gross_total) : n(r.subtotal) + n(r.vat_amount);
      return s + g;
    }, 0);
    const grossCn = cn.reduce((s, r) => s + (n(r.subtotal) + n(r.vat_amount)), 0);
    const gross = grossInv - grossCn;

    return {
      revenue,
      gross,
      vat,
      discount,
      invoicesCount,
      creditNotesCount,
      collected,
      netAfterPayments,
      qtySold,
      uniqueCustomers: custSet.size,
    };
  }, [invoicesQ.data, invoicePaymentsQ.data, creditNotesQ.data, invoiceItemsQ.data, creditNoteItemsQ.data]);

  /* =========================
    Active Report Computations
  ========================= */
  const dailyInvoices = useMemo(() => {
    if (activeReport !== "DAILY_INVOICES") return [];
    const inv = invoicesQ.data ?? [];
    const cn = creditNotesQ.data ?? [];
    const map = new Map<string, any>();

    // invoices (+)
    inv.forEach((i) => {
      const key = i.invoice_date;
      const cur = map.get(key) || {
        date: key,
        invoices: 0,
        credit_notes: 0,
        gross_total: 0,
        subtotal: 0,
        vat: 0,
        discount: 0,
        total: 0,
        collected: 0, // accrual-matched payments by invoice_date
        unique_customers: new Set<number>(),
      };

      const gross = i.gross_total != null ? n(i.gross_total) : n(i.subtotal) + n(i.vat_amount);

      cur.invoices += 1;
      cur.gross_total += gross;
      cur.subtotal += n(i.subtotal);
      cur.vat += n(i.vat_amount);
      cur.discount += n(i.discount_amount);
      cur.total += n(i.total_amount);
      cur.unique_customers.add(i.customer_id);

      map.set(key, cur);
    });

    // credit notes (-)
    cn.forEach((c) => {
      const key = c.credit_note_date;
      const cur = map.get(key) || {
        date: key,
        invoices: 0,
        credit_notes: 0,
        gross_total: 0,
        subtotal: 0,
        vat: 0,
        discount: 0,
        total: 0,
        collected: 0,
        unique_customers: new Set<number>(),
      };

      const gross = n(c.subtotal) + n(c.vat_amount);

      cur.credit_notes += 1;
      cur.gross_total -= gross;
      cur.subtotal -= n(c.subtotal);
      cur.vat -= n(c.vat_amount);
      cur.total -= n(c.total_amount);
      cur.unique_customers.add(c.customer_id);

      map.set(key, cur);
    });

    // ✅ payments (deduction) — bucketed by invoice_date (accrual matched)
    for (const [d, amt] of paymentsByInvoiceDate.entries()) {
      if (!isBetweenInclusive(d, from, to)) continue;
      const cur = map.get(d) || {
        date: d,
        invoices: 0,
        credit_notes: 0,
        gross_total: 0,
        subtotal: 0,
        vat: 0,
        discount: 0,
        total: 0,
        collected: 0,
        unique_customers: new Set<number>(),
      };
      cur.collected += n(amt);
      map.set(d, cur);
    }

    return Array.from(map.values())
      .map((r) => ({
        date: r.date,
        invoices: r.invoices,
        credit_notes: r.credit_notes,
        unique_customers: r.unique_customers.size,
        gross_total: r.gross_total,
        subtotal: r.subtotal,
        vat: r.vat,
        discount: r.discount,
        total: r.total,
        collected: r.collected,
        net_after_payments: n(r.total) - n(r.collected),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [activeReport, invoicesQ.data, creditNotesQ.data, paymentsByInvoiceDate, from, to]);

  const dailyProducts = useMemo(() => {
    if (activeReport !== "DAILY_PRODUCTS") return { byDate: new Map<string, any[]>(), dates: [] as string[] };

    const invItems = invoiceItemsQ.data ?? [];
    const cnItems = creditNoteItemsQ.data ?? [];
    const invById = invoiceById;
    const cnById = creditById;

    const map = new Map<string, any>(); // date|product_id

    // invoices items (+)
    invItems.forEach((it) => {
      const inv = invById.get(it.invoice_id);
      if (!inv) return;

      const date = inv.invoice_date;
      const pid = it.product_id;
      const key = `${date}|${pid}`;

      const p = it.products || null;
      const p2 = productById.get(pid);

      const name = p?.name || p2?.name || it.description || `Product #${pid}`;
      const sku = p?.sku || p2?.sku || p2?.item_code || String(pid);

      const cur = map.get(key) || { date, product_id: pid, sku, product: name, qty: 0, sales: 0, uom: it.uom || "—" };
      cur.qty += n(it.total_qty);
      cur.sales += n(it.line_total);
      map.set(key, cur);
    });

    // credit note items (-)
    cnItems.forEach((it) => {
      const cn = cnById.get(it.credit_note_id);
      if (!cn) return;

      const date = cn.credit_note_date;
      const pid = it.product_id ?? 0;
      const key = `${date}|${pid}`;

      const p = it.products || null;
      const p2 = pid ? productById.get(pid) : undefined;

      const name = p?.name || p2?.name || it.description || (pid ? `Product #${pid}` : "Returned item");
      const sku = p?.sku || p2?.sku || p2?.item_code || (pid ? String(pid) : "—");

      const cur = map.get(key) || { date, product_id: pid, sku, product: name, qty: 0, sales: 0, uom: it.uom || "—" };
      cur.qty -= n(it.total_qty);
      cur.sales -= n(it.line_total);
      map.set(key, cur);
    });

    const rows = Array.from(map.values()).sort((a, b) => Math.abs(b.sales) - Math.abs(a.sales));

    const byDate = new Map<string, any[]>();
    rows.forEach((r) => {
      const arr = byDate.get(r.date) || [];
      arr.push(r);
      byDate.set(r.date, arr);
    });

    const dates = Array.from(byDate.keys()).sort((a, b) => a.localeCompare(b));
    return { byDate, dates };
  }, [activeReport, invoiceItemsQ.data, creditNoteItemsQ.data, invoiceById, creditById, productById]);

  const customersDaily = useMemo(() => {
    if (activeReport !== "CUSTOMERS_DAILY") return [];
    const inv = invoicesQ.data ?? [];
    const cn = creditNotesQ.data ?? [];
    const map = new Map<string, any>();

    inv.forEach((i) => {
      const key = i.invoice_date;
      const cur = map.get(key) || {
        date: key,
        unique_customers: new Set<number>(),
        invoices: 0,
        credit_notes: 0,
        total: 0,
        byCustomer: new Map<number, number>(),
      };

      cur.unique_customers.add(i.customer_id);
      cur.invoices += 1;
      cur.total += n(i.total_amount);
      cur.byCustomer.set(i.customer_id, (cur.byCustomer.get(i.customer_id) ?? 0) + n(i.total_amount));
      map.set(key, cur);
    });

    cn.forEach((c) => {
      const key = c.credit_note_date;
      const cur = map.get(key) || {
        date: key,
        unique_customers: new Set<number>(),
        invoices: 0,
        credit_notes: 0,
        total: 0,
        byCustomer: new Map<number, number>(),
      };

      cur.unique_customers.add(c.customer_id);
      cur.credit_notes += 1;
      cur.total -= n(c.total_amount);
      cur.byCustomer.set(c.customer_id, (cur.byCustomer.get(c.customer_id) ?? 0) - n(c.total_amount));
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
          .sort((a: any, b: any) => Math.abs(b.amount) - Math.abs(a.amount))
          .slice(0, 6);

        return {
          date: r.date,
          unique_customers: r.unique_customers.size,
          invoices: r.invoices,
          credit_notes: r.credit_notes,
          total: r.total,
          topCustomers,
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [activeReport, invoicesQ.data, creditNotesQ.data, customerById]);

  const repDaily = useMemo(() => {
    if (activeReport !== "REP_DAILY") return [];
    const inv = invoicesQ.data ?? [];
    const cn = creditNotesQ.data ?? [];
    const map = new Map<string, any>(); // date|rep

    inv.forEach((i) => {
      const rep = (i.sales_rep || "—").trim() || "—";
      const key = `${i.invoice_date}|${rep}`;

      const cur = map.get(key) || {
        date: i.invoice_date,
        rep,
        rep_phone: i.sales_rep_phone || "",
        invoices: 0,
        credit_notes: 0,
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

    cn.forEach((c) => {
      const rep = (c.sales_rep || "—").trim() || "—";
      const key = `${c.credit_note_date}|${rep}`;

      const cur = map.get(key) || {
        date: c.credit_note_date,
        rep,
        rep_phone: c.sales_rep_phone || "",
        invoices: 0,
        credit_notes: 0,
        total: 0,
        vat: 0,
        discount: 0,
      };

      cur.credit_notes += 1;
      cur.total -= n(c.total_amount);
      cur.vat -= n(c.vat_amount);
      map.set(key, cur);
    });

    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date) || b.total - a.total);
  }, [activeReport, invoicesQ.data, creditNotesQ.data]);

  const repMonthly = useMemo(() => {
    if (activeReport !== "REP_MONTHLY") return [];
    const inv = invoicesQ.data ?? [];
    const cn = creditNotesQ.data ?? [];
    const map = new Map<string, any>(); // ym|rep

    inv.forEach((i) => {
      const rep = (i.sales_rep || "—").trim() || "—";
      const ym = ymKey(i.invoice_date);
      const key = `${ym}|${rep}`;

      const cur = map.get(key) || { month: ym, rep, invoices: 0, credit_notes: 0, total: 0, vat: 0, discount: 0 };
      cur.invoices += 1;
      cur.total += n(i.total_amount);
      cur.vat += n(i.vat_amount);
      cur.discount += n(i.discount_amount);
      map.set(key, cur);
    });

    cn.forEach((c) => {
      const rep = (c.sales_rep || "—").trim() || "—";
      const ym = ymKey(c.credit_note_date);
      const key = `${ym}|${rep}`;

      const cur = map.get(key) || { month: ym, rep, invoices: 0, credit_notes: 0, total: 0, vat: 0, discount: 0 };
      cur.credit_notes += 1;
      cur.total -= n(c.total_amount);
      cur.vat -= n(c.vat_amount);
      map.set(key, cur);
    });

    return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month) || b.total - a.total);
  }, [activeReport, invoicesQ.data, creditNotesQ.data]);

  const customerMonthly = useMemo(() => {
    if (activeReport !== "CUSTOMER_MONTHLY") return [];
    const inv = invoicesQ.data ?? [];
    const cn = creditNotesQ.data ?? [];
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
        credit_notes: 0,
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

    cn.forEach((c) => {
      const ym = ymKey(c.credit_note_date);
      const cid = c.customer_id;
      const key = `${ym}|${cid}`;

      const cur = map.get(key) || {
        month: ym,
        customer_id: cid,
        customer: customerPrimaryName(cid),
        secondary: customerSecondaryName(cid),
        invoices: 0,
        credit_notes: 0,
        total: 0,
        vat: 0,
        discount: 0,
      };

      cur.credit_notes += 1;
      cur.total -= n(c.total_amount);
      cur.vat -= n(c.vat_amount);
      map.set(key, cur);
    });

    return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month) || b.total - a.total);
  }, [activeReport, invoicesQ.data, creditNotesQ.data, customerById]);

  const vatDailyMonthly = useMemo(() => {
    if (activeReport !== "VAT") return { dailyRows: [] as any[], monthlyRows: [] as any[] };

    const inv = invoicesQ.data ?? [];
    const cn = creditNotesQ.data ?? [];
    const daily = new Map<string, number>();
    const monthly = new Map<string, number>();

    inv.forEach((i) => {
      const d = i.invoice_date;
      const m = ymKey(i.invoice_date);
      daily.set(d, (daily.get(d) ?? 0) + n(i.vat_amount));
      monthly.set(m, (monthly.get(m) ?? 0) + n(i.vat_amount));
    });

    cn.forEach((c) => {
      const d = c.credit_note_date;
      const m = ymKey(c.credit_note_date);
      daily.set(d, (daily.get(d) ?? 0) - n(c.vat_amount));
      monthly.set(m, (monthly.get(m) ?? 0) - n(c.vat_amount));
    });

    const dailyRows = Array.from(daily.entries())
      .map(([date, vat]) => ({ date, vat }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const monthlyRows = Array.from(monthly.entries())
      .map(([month, vat]) => ({ month, vat }))
      .sort((a, b) => a.month.localeCompare(b.month));

    return { dailyRows, monthlyRows };
  }, [activeReport, invoicesQ.data, creditNotesQ.data]);

  const discountDailyMonthly = useMemo(() => {
    if (activeReport !== "DISCOUNT") return { dailyRows: [] as any[], monthlyRows: [] as any[] };

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
  }, [activeReport, invoicesQ.data]);

  const salesmanPeriod = useMemo(() => {
    if (activeReport !== "SALESMAN_PERIOD") return [];
    const inv = invoicesQ.data ?? [];
    const cn = creditNotesQ.data ?? [];
    const map = new Map<string, any>(); // rep

    inv.forEach((i) => {
      const rep = (i.sales_rep || "—").trim() || "—";
      const cur = map.get(rep) || {
        rep,
        rep_phone: i.sales_rep_phone || "",
        invoices: 0,
        credit_notes: 0,
        total: 0,
        vat: 0,
        discount: 0,
      };

      cur.invoices += 1;
      cur.total += n(i.total_amount);
      cur.vat += n(i.vat_amount);
      cur.discount += n(i.discount_amount);

      if (!cur.rep_phone && i.sales_rep_phone) cur.rep_phone = i.sales_rep_phone;
      map.set(rep, cur);
    });

    cn.forEach((c) => {
      const rep = (c.sales_rep || "—").trim() || "—";
      const cur = map.get(rep) || {
        rep,
        rep_phone: c.sales_rep_phone || "",
        invoices: 0,
        credit_notes: 0,
        total: 0,
        vat: 0,
        discount: 0,
      };

      cur.credit_notes += 1;
      cur.total -= n(c.total_amount);
      cur.vat -= n(c.vat_amount);

      if (!cur.rep_phone && c.sales_rep_phone) cur.rep_phone = c.sales_rep_phone;
      map.set(rep, cur);
    });

    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [activeReport, invoicesQ.data, creditNotesQ.data]);

  const productsPeriod = useMemo(() => {
    if (activeReport !== "PRODUCTS_PERIOD") return [];
    const invItems = invoiceItemsQ.data ?? [];
    const cnItems = creditNoteItemsQ.data ?? [];
    const invById = invoiceById;
    const cnById = creditById;

    const map = new Map<number, any>();

    invItems.forEach((it) => {
      const inv = invById.get(it.invoice_id);
      if (!inv) return;

      const pid = it.product_id;
      const p = it.products || null;
      const p2 = productById.get(pid);

      const name = p?.name || p2?.name || it.description || `Product #${pid}`;
      const sku = p?.sku || p2?.sku || p2?.item_code || String(pid);

      const cur = map.get(pid) || { product_id: pid, sku, product: name, qty: 0, sales: 0 };
      cur.qty += n(it.total_qty);
      cur.sales += n(it.line_total);
      map.set(pid, cur);
    });

    cnItems.forEach((it) => {
      const cn = cnById.get(it.credit_note_id);
      if (!cn) return;

      const pid = it.product_id ?? 0;
      if (!pid) return;

      const p = it.products || null;
      const p2 = productById.get(pid);

      const name = p?.name || p2?.name || it.description || `Product #${pid}`;
      const sku = p?.sku || p2?.sku || p2?.item_code || String(pid);

      const cur = map.get(pid) || { product_id: pid, sku, product: name, qty: 0, sales: 0 };
      cur.qty -= n(it.total_qty);
      cur.sales -= n(it.line_total);
      map.set(pid, cur);
    });

    return Array.from(map.values()).sort((a, b) => b.sales - a.sales);
  }, [activeReport, invoiceItemsQ.data, creditNoteItemsQ.data, invoiceById, creditById, productById]);

  const customersForSelect = useMemo(() => {
    const list = (customersQ.data ?? []).map((c) => {
      const primary = String(c.client_name || "").trim() || String(c.name || "").trim() || `Customer #${c.id}`;
      const secondary =
        String(c.client_name || "").trim() &&
        String(c.name || "").trim() &&
        String(c.client_name || "").trim() !== String(c.name || "").trim()
          ? String(c.name || "").trim()
          : "";
      return { id: c.id, label: primary, secondary };
    });
    list.sort((a, b) => a.label.localeCompare(b.label));
    return list;
  }, [customersQ.data]);

  /* =========================
    Statement helpers
  ========================= */
  function openStatementPrint(autoPrint = false) {
    if (!statementCustomerId) return;
    const sp = new URLSearchParams();
    sp.set("customerId", String(statementCustomerId));
    sp.set("from", from);
    sp.set("to", to);
    if (autoPrint) sp.set("autoprint", "1");
    window.open(`/statement/print?${sp.toString()}`, "_blank", "noopener,noreferrer");
  }

  function statementShareText() {
    const cust = customersForSelect.find((c) => c.id === statementCustomerId);
    const cname = cust?.label || "Customer";
    return `Ram Pottery Ltd — Statement of Account\nCustomer: ${cname}\nPeriod: ${from} → ${to}\n\nPlease find the statement attached (PDF).`;
  }

  function openStatementWhatsApp() {
    const msg = statementShareText() + `\n\nTip: Save the PDF from the system and attach it in WhatsApp.`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank", "noopener,noreferrer");
  }

  function openStatementEmail() {
    const cust = customersForSelect.find((c) => c.id === statementCustomerId);
    const cname = cust?.label || "Customer";
    const subject = `Statement of Account — ${cname} (${from} to ${to})`;
    const body = `Dear ${cname},\n\nPlease find attached the Statement of Account for the period ${from} to ${to}.\n\nRegards,\nRam Pottery Ltd`;
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  /* =========================
    Statement rows (FULL HISTORY + running balance)
  ========================= */
  type StatementRow = {
    date: string;
    type: "INVOICE" | "PAYMENT" | "CREDIT_NOTE";
    ref: string;
    details: string;
    amount: number; // signed
    balance?: number; // running balance (full history)
  };

  const statementPack = useMemo(() => {
    if (!statementEnabled) return { opening: 0, closing: 0, rowsInRange: [] as StatementRow[], allRows: [] as StatementRow[] };

    const invAll = stmtInvoicesAllQ.data ?? [];
    const cnAll = stmtCreditNotesAllQ.data ?? [];
    const payAll = stmtPaymentsAllQ.data ?? [];

    const invByIdAll = new Map<number, InvoiceRow>();
    invAll.forEach((x) => invByIdAll.set(x.id, x));

    const rows: StatementRow[] = [];

    invAll.forEach((i) => {
      rows.push({
        date: i.invoice_date,
        type: "INVOICE",
        ref: i.invoice_number,
        details:
          i.status === "PAID" ? "Invoice (Paid)" : i.status === "PARTIALLY_PAID" ? "Invoice (Partially Paid)" : "Invoice",
        amount: n(i.total_amount),
      });
    });

    // Build payments map per invoice
    const paidByInvoice = new Map<number, number>();
    payAll.forEach((p) => paidByInvoice.set(p.invoice_id, (paidByInvoice.get(p.invoice_id) ?? 0) + n(p.amount)));

    payAll.forEach((p) => {
      const inv = invByIdAll.get(p.invoice_id);
      rows.push({
        date: p.payment_date,
        type: "PAYMENT",
        ref: inv?.invoice_number ? `INV ${inv.invoice_number}` : `Invoice #${p.invoice_id}`,
        details: `Payment • ${p.method || "—"}`,
        amount: -n(p.amount),
      });
    });

    // ✅ If invoice is PAID but payments are missing/incomplete, create a synthetic deduction
    invAll.forEach((i) => {
      if (i.status !== "PAID") return;
      const already = paidByInvoice.get(i.id) ?? 0;
      const due = n(i.total_amount) - already;

      if (due > 0.0001) {
        rows.push({
          date: i.invoice_date, // safest (no real payment date)
          type: "PAYMENT",
          ref: `INV ${i.invoice_number}`,
          details: "Payment • (Auto) Status = PAID",
          amount: -due,
        });
      }
    });

    cnAll.forEach((c) => {
      rows.push({
        date: c.credit_note_date,
        type: "CREDIT_NOTE",
        ref: c.credit_note_number,
        details: c.reason ? `Credit Note • ${c.reason}` : "Credit Note",
        amount: -n(c.total_amount),
      });
    });

    const typeRank: Record<string, number> = { INVOICE: 1, CREDIT_NOTE: 2, PAYMENT: 3 };
    rows.sort((a, b) => a.date.localeCompare(b.date) || typeRank[a.type] - typeRank[b.type] || a.ref.localeCompare(b.ref));

    const opening = rows.filter((r) => r.date < from).reduce((s, r) => s + n(r.amount), 0);

    let bal = 0;
    const allRowsWithBal = rows.map((r) => {
      bal += n(r.amount);
      return { ...r, balance: bal };
    });

    const rowsInRange = allRowsWithBal.filter((r) => isBetweenInclusive(r.date, from, to));
    const closing = allRowsWithBal.length ? (allRowsWithBal[allRowsWithBal.length - 1].balance ?? 0) : 0;

    return { opening, closing, rowsInRange, allRows: allRowsWithBal };
  }, [statementEnabled, stmtInvoicesAllQ.data, stmtCreditNotesAllQ.data, stmtPaymentsAllQ.data, from, to]);

  // ✅ Statement summary (Balance Due etc.)
  const statementSummary = useMemo(() => {
    if (!statementEnabled) return null;

    const rows = statementPack.allRows;

    const inv = rows.filter((r) => r.type === "INVOICE").reduce((s, r) => s + n(r.amount), 0);
    const pays = rows.filter((r) => r.type === "PAYMENT").reduce((s, r) => s + Math.abs(n(r.amount)), 0);
    const credits = rows.filter((r) => r.type === "CREDIT_NOTE").reduce((s, r) => s + Math.abs(n(r.amount)), 0);

    const opening = statementPack.opening;
    const periodMovements = statementPack.rowsInRange.reduce((s, r) => s + n(r.amount), 0);
    const closingInPeriod = opening + periodMovements;

    return {
      opening,
      inv,
      pays,
      credits,
      balanceDue: statementPack.closing, // balance as of "to"
      closingInPeriod, // opening + in-range movements
    };
  }, [statementEnabled, statementPack]);

  /* =========================
    Export CSV
  ========================= */
  function exportActiveCSV() {
    if (anyLoading || isGenerating) return toast.message("Please wait until the report finishes loading.");
    const base = { from, to, granularity, report: activeReport };

    if (activeReport === "DAILY_INVOICES") {
      return downloadCSV(`daily_invoices_net_${from}_to_${to}.csv`, dailyInvoices.map((r) => ({ ...base, ...r })));
    }

    if (activeReport === "DAILY_PRODUCTS") {
      const out: any[] = [];
      dailyProducts.dates.forEach((d) => {
        (dailyProducts.byDate.get(d) ?? []).forEach((r: any) => out.push({ ...base, ...r }));
      });
      return downloadCSV(`daily_products_sold_net_${from}_to_${to}.csv`, out);
    }

    if (activeReport === "CUSTOMERS_DAILY") {
      const rows = customersDaily.map((d) => {
        const top =
          d.topCustomers
            ?.map((x: any) => `${x.customer}${x.secondary ? ` (${x.secondary})` : ""} (Rs ${moneySigned(x.amount)})`)
            .join(" | ") || "";
        return {
          ...base,
          date: d.date,
          unique_customers: d.unique_customers,
          invoices: d.invoices,
          credit_notes: d.credit_notes,
          total_net: d.total,
          top_customers: top,
        };
      });
      return downloadCSV(`customers_purchased_daily_net_${from}_to_${to}.csv`, rows);
    }

    if (activeReport === "REP_DAILY") return downloadCSV(`sales_by_rep_daily_net_${from}_to_${to}.csv`, repDaily.map((r) => ({ ...base, ...r })));
    if (activeReport === "REP_MONTHLY") return downloadCSV(`sales_by_rep_monthly_net_${from}_to_${to}.csv`, repMonthly.map((r) => ({ ...base, ...r })));
    if (activeReport === "CUSTOMER_MONTHLY")
      return downloadCSV(`sales_by_customer_monthly_net_${from}_to_${to}.csv`, customerMonthly.map((r) => ({ ...base, ...r })));

    if (activeReport === "VAT") {
      const rows = (granularity === "DAILY" ? vatDailyMonthly.dailyRows : vatDailyMonthly.monthlyRows).map((r: any) => ({
        ...base,
        ...r,
      }));
      return downloadCSV(`vat_net_${granularity.toLowerCase()}_${from}_to_${to}.csv`, rows);
    }

    if (activeReport === "DISCOUNT") {
      const rows = (granularity === "DAILY" ? discountDailyMonthly.dailyRows : discountDailyMonthly.monthlyRows).map((r: any) => ({
        ...base,
        ...r,
      }));
      return downloadCSV(`discount_${granularity.toLowerCase()}_${from}_to_${to}.csv`, rows);
    }

    if (activeReport === "SALESMAN_PERIOD") return downloadCSV(`salesman_period_net_${from}_to_${to}.csv`, salesmanPeriod.map((r) => ({ ...base, ...r })));
    if (activeReport === "PRODUCTS_PERIOD") return downloadCSV(`products_sold_period_net_${from}_to_${to}.csv`, productsPeriod.map((r) => ({ ...base, ...r })));

    if (activeReport === "STATEMENT_CUSTOMER") {
      if (!statementCustomerId) return toast.error("Select a customer first");
      const cust = customersForSelect.find((c) => c.id === statementCustomerId);
      const cname = cust?.label || "";

      const rows = statementPack.rowsInRange.map((r, idx) => ({
        sn: idx + 1,
        date: r.date,
        customer: cname,
        type: r.type,
        reference: r.ref,
        details: r.details,
        amount: r.amount,
        balance: r.balance ?? 0,
      }));

      rows.unshift({
        sn: 0,
        date: from,
        customer: cname,
        type: "OPENING",
        reference: "",
        details: "Opening balance (before period)",
        amount: statementPack.opening,
        balance: statementPack.opening,
      } as any);

      return downloadCSV(`statement_${statementCustomerId}_${from}_to_${to}.csv`, rows as any);
    }

    toast.message("No export available for this report.");
  }

  /* =========================
    PDF Export (ONLY report output)
  ========================= */
  function pdfOrientationForReport(key: ActiveReport) {
    const landscape = new Set<ActiveReport>([
      "DAILY_PRODUCTS",
      "CUSTOMERS_DAILY",
      "REP_DAILY",
      "REP_MONTHLY",
      "CUSTOMER_MONTHLY",
      "SALESMAN_PERIOD",
      "PRODUCTS_PERIOD",
      "STATEMENT_CUSTOMER",
      "DAILY_INVOICES",
    ]);
    return landscape.has(key) ? "landscape" : "portrait";
  }

  // ✅ Replace buildPdfNode (removes sticky + scroll + truncation)
  function buildPdfNode() {
    const node = reportPrintRef.current;
    if (!node) return null;

    const clone = node.cloneNode(true) as HTMLElement;

    // remove UI-only parts
    clone.querySelectorAll(".no-pdf, .no-print, .no-pdf-only").forEach((el) => el.remove());

    // remove sticky headers (pdf/print hates sticky)
    clone.querySelectorAll("thead").forEach((thead) => {
      (thead as HTMLElement).style.position = "static";
      (thead as HTMLElement).style.top = "auto";
    });

    // remove any internal scroll wrappers
    clone.querySelectorAll("[data-pdf-nosroll='1'], .rpt-tableWrap, .overflow-auto").forEach((el) => {
      const e = el as HTMLElement;
      e.style.maxHeight = "none";
      e.style.overflow = "visible";
    });

    // normalize container
    clone.style.background = "#ffffff";
    clone.style.padding = "0";
    clone.style.margin = "0";
    clone.style.overflow = "visible";

    // remove shadows for clean PDF
    clone.querySelectorAll(".shadow-premium, .reports-card, .reports-hero").forEach((el) => ((el as HTMLElement).style.boxShadow = "none"));

    return clone;
  }

  // ✅ Replace exportActivePDF (true “report-only PDF”)
  async function exportActivePDF() {
    if (anyLoading || isGenerating) return toast.message("Please wait until the report finishes loading.");

    const clone = buildPdfNode();
    if (!clone) return toast.error("Nothing to export yet.");

    const label = REPORTS.find((r) => r.key === activeReport)?.label || activeReport;
    const filename = `${label.replace(/[^\w]+/g, "_")}_${from}_to_${to}.pdf`;

    const orientation = pdfOrientationForReport(activeReport);

    const opt: any = {
      margin: [8, 8, 10, 8],
      filename,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: {
        scale: 3,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
        scrollY: 0,
        windowWidth: Math.max(1400, clone.scrollWidth || 1400),
      },
      pagebreak: { mode: ["css", "legacy"], avoid: ["tr", "thead", ".avoid-break"] },
      jsPDF: { unit: "mm", format: "a4", orientation },
    };

    try {
      toast.message("Generating PDF…");
      await (html2pdf() as any).set(opt).from(clone).save();
      toast.success("PDF downloaded");
    } catch (e: any) {
      toast.error(e?.message || "PDF export failed");
    }
  }

  function printBrowser() {
    if (anyLoading || isGenerating) return toast.message("Please wait until the report finishes loading.");
    setTimeout(() => window.print(), 80);
  }

  /* =========================
    Print isolation (prints ONLY #report-print)
  ========================= */
  const printStyles = `
@media print{
  html, body{ background:#fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body *{ visibility:hidden !important; }
  #report-print, #report-print *{ visibility:visible !important; }
  #report-print{
    position:absolute !important; left:0 !important; top:0 !important;
    width:100% !important; padding:0 !important; margin:0 !important;
    border-radius:0 !important; border:none !important; overflow:visible !important;
  }
  .no-print{ display:none !important; }
  thead, th{ position:static !important; }
  thead{ display: table-header-group !important; }
  tr{ break-inside: avoid !important; page-break-inside: avoid !important; }
  [data-pdf-nosroll="1"]{ max-height:none !important; overflow:visible !important; }
}
`;

  /* =========================
    Nav filter
  ========================= */
  const filteredReports = useMemo(() => {
    const q = navSearch.trim().toLowerCase();
    if (!q) return REPORTS as any[];
    return (REPORTS as any[]).filter(
      (r) => String(r.label).toLowerCase().includes(q) || String(r.desc).toLowerCase().includes(q)
    );
  }, [navSearch, REPORTS]);

  const activeMeta = REPORTS.find((r) => r.key === activeReport);

  /* =========================
    Small UX: keep right view top on report switch
  ========================= */
  const rightTopRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    rightTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [activeReport]);

  const viewerRowCap = 520;

  return (
    <div className="reports-page space-y-6 animate-fade-in">
      <style>{printStyles}</style>

      {/* ===== Premium Hero ===== */}
      <div className="no-print">
        <div className="reports-hero">
          <div className="p-6 md:p-7 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">Reports</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Net reporting (Invoices − Credit Notes) • Payments matched to invoice_date for deductions • Export CSV / PDF • Print-ready
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="border bg-white/70">
                  Invoice statuses: <span className="ml-1 font-semibold">{salesStatuses.join(", ")}</span>
                </Badge>

                <Badge variant="secondary" className="border bg-white/70">
                  Credit statuses: <span className="ml-1 font-semibold">{creditStatuses.join(", ")}</span>
                </Badge>

                {generatedAt ? (
                  <Badge variant="secondary" className="border bg-white/70">
                    Last generated: <span className="ml-1 font-semibold">{generatedAt}</span>
                  </Badge>
                ) : null}

                {!rangeIsValid ? (
                  <Badge variant="secondary" className="border bg-amber-500/10 text-amber-800">
                    Fix date range
                  </Badge>
                ) : anyLoading ? (
                  <Badge variant="secondary" className="border bg-white/70">
                    Loading…
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="border bg-emerald-500/10 text-emerald-700">
                    Ready
                  </Badge>
                )}
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

              <Button variant="outline" onClick={exportActivePDF} disabled={anyLoading || isGenerating}>
                <Download className="h-4 w-4 mr-2" />
                Download PDF
              </Button>

              <Button variant="outline" onClick={printBrowser} disabled={anyLoading || isGenerating}>
                <Printer className="h-4 w-4 mr-2" />
                Print
              </Button>

              <RedButton onClick={forceRefetchAll} disabled={isGenerating || anyLoading}>
                <ArrowUpRight className="h-4 w-4 mr-2" />
                {isGenerating ? "Generating..." : "Generate"}
              </RedButton>
            </div>
          </div>
        </div>
      </div>

      {/* ===== KPI Strip ===== */}
      <div className="no-print grid gap-3 sm:grid-cols-2 lg:grid-cols-9">
        <StatCard title="Revenue (Net)" value={`Rs ${money(kpi.revenue)}`} hint={`${from} → ${to}`} icon={<TrendingUp className="h-4 w-4" />} loading={anyLoading} />
        <StatCard title="Net After Payments" value={`Rs ${money(kpi.netAfterPayments)}`} hint="Revenue − Payments (matched)" icon={<Receipt className="h-4 w-4" />} loading={anyLoading} />
        <StatCard title="Gross (Net)" value={`Rs ${money(kpi.gross)}`} hint="Before discount (CN uses Subtotal+VAT)" icon={<TrendingUp className="h-4 w-4" />} loading={anyLoading} />
        <StatCard title="Payments (Matched)" value={`Rs ${money(kpi.collected)}`} hint="Payments for invoices issued in range" icon={<Receipt className="h-4 w-4" />} loading={invoicePaymentsQ.isLoading || !rangeIsValid} />
        <StatCard title="Invoices" value={`${kpi.invoicesCount}`} hint={`Credit Notes: ${kpi.creditNotesCount}`} icon={<FileText className="h-4 w-4" />} loading={anyLoading} />
        <StatCard title="Unique Customers" value={`${kpi.uniqueCustomers}`} hint="Invoices + Credits" icon={<Users className="h-4 w-4" />} loading={anyLoading} />
        <StatCard title="VAT (Net)" value={`Rs ${money(kpi.vat)}`} hint={`${granularity === "DAILY" ? "Daily" : "Monthly"} view`} icon={<Percent className="h-4 w-4" />} loading={anyLoading} />
        <StatCard title="Discount" value={`Rs ${money(kpi.discount)}`} hint="Invoices only" icon={<Receipt className="h-4 w-4" />} loading={anyLoading} />
        <StatCard
          title="Qty Sold (Net)"
          value={`${money(kpi.qtySold)}`}
          hint="Sales minus returns"
          icon={<Package className="h-4 w-4" />}
          loading={needInvoiceItems(activeReport) ? invoiceItemsQ.isLoading || creditNoteItemsQ.isLoading : false}
        />
      </div>

{/* ===== Horizontal Layout (Topbar + Full-width Viewer) ===== */}
<div className="reports-grid-horizontal">
  {/* ===================== TOP BAR ===================== */}
  <div className="no-print reports-topbar">
    {/* ----------- Report Library ----------- */}
    <Card className="reports-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-base reports-panelTitle">Report Library</CardTitle>
        <CardDescription>Pick a report, then export CSV/PDF</CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="relative">
          <Search className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            value={navSearch}
            onChange={(e) => setNavSearch(e.target.value)}
            className="pl-9"
            placeholder="Search reports…"
          />
        </div>

        {/* Premium grid */}
<div className="reports-libraryGrid">
  {filteredReports.map((r: any) => (
    <ReportNavTile
      key={r.key}
      active={r.key === activeReport}
      label={r.label}
      desc={r.desc}
      icon={r.icon}
      badge={r.badge}
      onClick={() => setActiveReport(r.key)}
    />
  ))}
</div>


        <div className="text-[11px] text-muted-foreground">
          Sources: <b>invoices</b>, <b>invoice_payments</b>, <b>credit_notes</b>,{" "}
          <b>credit_note_items</b>, <b>invoice_items</b>, <b>customers</b>, <b>products</b>
        </div>
      </CardContent>
    </Card>

    {/* ----------- Filters ----------- */}
    <Card className="reports-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-base reports-panelTitle">Filters</CardTitle>
        <CardDescription>Choose range and granularity</CardDescription>
      </CardHeader>

      <CardContent>
        <div className="flex flex-wrap gap-2 mb-4">
          {(["TODAY", "7D", "30D", "MTD", "YTD"] as DatePreset[]).map((p) => (
            <Button
              key={p}
              variant={preset === p ? "default" : "outline"}
              className={preset === p ? "bg-red-800 text-white hover:bg-red-900" : ""}
              onClick={() => applyPreset(p)}
            >
              <Calendar className="h-4 w-4 mr-2" />
              {p}
            </Button>
          ))}

          <Button
            variant={preset === "CUSTOM" ? "default" : "outline"}
            className={preset === "CUSTOM" ? "bg-red-800 text-white hover:bg-red-900" : ""}
            onClick={() => setPreset("CUSTOM")}
          >
            Custom
          </Button>
        </div>

        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>From</Label>
              <Input
                type="date"
                value={from}
                onChange={(e) => {
                  setPreset("CUSTOM");
                  setFrom(e.target.value);
                  if (to && e.target.value && e.target.value > to) setTo(e.target.value);
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
                  if (from && e.target.value && e.target.value < from) setFrom(e.target.value);
                }}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Granularity</Label>
            <div className="flex gap-2">
              <Button
                variant={granularity === "DAILY" ? "default" : "outline"}
                className={granularity === "DAILY" ? "bg-red-800 text-white hover:bg-red-900" : ""}
                onClick={() => setGranularity("DAILY")}
              >
                Daily
              </Button>

              <Button
                variant={granularity === "MONTHLY" ? "default" : "outline"}
                className={granularity === "MONTHLY" ? "bg-red-800 text-white hover:bg-red-900" : ""}
                onClick={() => setGranularity("MONTHLY")}
              >
                Monthly
              </Button>
            </div>
          </div>

          {!rangeIsValid ? (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5" />
              <div>
                <div className="font-semibold">Invalid range</div>
                <div className="text-xs text-destructive/90">From date cannot be after To date.</div>
              </div>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  </div>

  {/* ===================== VIEWER (FULL WIDTH) ===================== */}
  <div className="reports-viewerWide space-y-4 min-w-0">
    <div ref={rightTopRef} />

    {/* Viewer header */}
    <div className="no-print sticky top-3 z-10">
      <Card className="reports-card">
        <CardContent className="p-4 md:p-5 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <div className="text-[11px] font-medium text-muted-foreground">Active report</div>
            <div className="text-lg md:text-xl font-extrabold tracking-tight truncate">
              {activeMeta?.label || activeReport}
            </div>
            <div className="text-[11px] text-muted-foreground mt-1">
              Period: <b>{from}</b> → <b>{to}</b> • Granularity: <b>{granularity}</b>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={exportActiveCSV} disabled={anyLoading || isGenerating}>
              <Download className="h-4 w-4 mr-2" />
              CSV
            </Button>
            <Button variant="outline" onClick={exportActivePDF} disabled={anyLoading || isGenerating}>
              <Download className="h-4 w-4 mr-2" />
              PDF
            </Button>
            <Button variant="outline" onClick={printBrowser} disabled={anyLoading || isGenerating}>
              <Printer className="h-4 w-4 mr-2" />
              Print
            </Button>
            <RedButton onClick={forceRefetchAll} disabled={anyLoading || isGenerating}>
              <RefreshCw className={"h-4 w-4 mr-2 " + (isGenerating ? "animate-spin" : "")} />
              {isGenerating ? "Generating..." : "Generate"}
            </RedButton>
          </div>
        </CardContent>
      </Card>
    </div>


          {/* ===== PRINT/PDF CONTAINER ===== */}
          <div id="report-print" ref={reportPrintRef} className="rpt-print">
            <div className="rpt-printHeader">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xl font-bold leading-tight">Ram Pottery Ltd — Reports</div>
                  <div className="text-sm text-muted-foreground">{activeMeta?.label || activeReport}</div>
                </div>

                <div className="text-right">
                  <div className="text-sm font-semibold">Period: {from} → {to}</div>
                  <div className="text-xs text-muted-foreground">Generated: {printStamp}</div>
                </div>
              </div>
              <div className="rpt-printHeaderLine" />
            </div>

            <Card className="reports-card">
              <CardHeader>
                <CardTitle>Report Output</CardTitle>
                <CardDescription>{activeMeta?.desc || ""}</CardDescription>
              </CardHeader>

              <CardContent className="space-y-6">
                {anyError ? (
                  <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4">
                    <div className="text-sm font-semibold text-destructive">Failed to load data</div>
                    <div className="mt-2 text-sm text-destructive/90 whitespace-pre-wrap">
                      {(anyError as any)?.message || "Unknown error"}
                    </div>
                    <div className="mt-3 text-xs text-muted-foreground">
                      If other pages work but Reports fails, it’s usually RLS or missing permissions for a table.
                    </div>
                  </div>
                ) : null}

                {/* ===== STATEMENT ===== */}
                {activeReport === "STATEMENT_CUSTOMER" && !anyError && (
                  <>
                    <Card className="no-print no-pdf border bg-white/90">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base">Statement of Account (Customer)</CardTitle>
                        <CardDescription>Payments and credit notes are deducted (-). Balance Due is as of the To date.</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                          <div className="space-y-2">
                            <Label>Select Customer</Label>
                            <select
                              className="h-10 w-full rounded-md border px-3 bg-background"
                              value={statementCustomerId || ""}
                              onChange={(e) => setStatementCustomerId(Number(e.target.value) || 0)}
                            >
                              <option value="">— Choose customer —</option>
                              {customersForSelect.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.label}
                                  {c.secondary ? ` (${c.secondary})` : ""}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <Button variant="outline" disabled={!statementCustomerId} onClick={() => openStatementPrint(false)}>
                              <FileText className="h-4 w-4 mr-2" />
                              Open Print View
                            </Button>

                            <RedButton disabled={!statementCustomerId} onClick={() => openStatementPrint(true)}>
                              <Printer className="h-4 w-4 mr-2" />
                              Save PDF / Print
                            </RedButton>

                            <Button variant="outline" disabled={!statementCustomerId} onClick={openStatementWhatsApp}>
                              <MessageCircle className="h-4 w-4 mr-2" />
                              WhatsApp
                            </Button>

                            <Button variant="outline" disabled={!statementCustomerId} onClick={openStatementEmail}>
                              <Mail className="h-4 w-4 mr-2" />
                              Email
                            </Button>
                          </div>
                        </div>

                        <div className="text-xs text-muted-foreground">
                          Tip: Click <b>Open Print View</b> in a new tab, then browser <b>Save as PDF</b>.
                        </div>
                      </CardContent>
                    </Card>

                    {!statementCustomerId ? (
                      <div className="rounded-xl border bg-muted/20 p-6 text-center text-muted-foreground">
                        Select a customer to generate the statement.
                      </div>
                    ) : (
                      <div className="rounded-2xl border bg-white p-6" data-pdf-nosroll="1">
                        {/* Header row */}
                        <div className="flex items-start justify-between gap-6">
                          <div>
                            <div className="text-2xl font-extrabold tracking-tight">STATEMENT OF ACCOUNT</div>
                            <div className="text-sm text-muted-foreground mt-1">
                              Generated: {printStamp} • Period: {from} → {to}
                            </div>
                          </div>

                          <div className="text-right">
                            <div className="text-sm font-semibold">Ram Pottery Ltd</div>
                            <div className="text-sm text-muted-foreground">Mauritius</div>
                          </div>
                        </div>

                        <div className="mt-5 grid gap-4 md:grid-cols-2">
                          {/* Customer box */}
                          <div className="rounded-2xl border p-4">
                            <div className="text-xs tracking-widest text-muted-foreground">CUSTOMER</div>
                            <div className="mt-2 text-lg font-bold">
                              {customersForSelect.find((c) => c.id === statementCustomerId)?.label || "Customer"}
                            </div>
                            {customersForSelect.find((c) => c.id === statementCustomerId)?.secondary ? (
                              <div className="text-sm text-muted-foreground">
                                {customersForSelect.find((c) => c.id === statementCustomerId)?.secondary}
                              </div>
                            ) : null}
                          </div>

                          {/* Summary box */}
                          <div className="rounded-2xl border p-4">
                            <div className="text-xs tracking-widest text-muted-foreground">SUMMARY</div>

                            <div className="mt-3 flex items-center justify-between">
                              <div className="text-sm text-muted-foreground">Invoices</div>
                              <div className="font-semibold tabular-nums">Rs {money(statementSummary?.inv ?? 0)}</div>
                            </div>

                            <div className="mt-1 flex items-center justify-between">
                              <div className="text-sm text-muted-foreground">Payments (–)</div>
                              <div className="font-semibold tabular-nums text-emerald-700">Rs {money(statementSummary?.pays ?? 0)}</div>
                            </div>

                            <div className="mt-1 flex items-center justify-between">
                              <div className="text-sm text-muted-foreground">Credit Notes (–)</div>
                              <div className="font-semibold tabular-nums text-amber-700">Rs {money(statementSummary?.credits ?? 0)}</div>
                            </div>

                            <div className="mt-3 h-px bg-border" />

                            <div className="mt-3 flex items-center justify-between">
                              <div className="text-sm font-semibold">Balance Due</div>
                              <div className="text-lg font-extrabold tabular-nums">Rs {money(statementSummary?.balanceDue ?? 0)}</div>
                            </div>

                            <div className="mt-1 text-xs text-muted-foreground">
                              Opening: Rs {money(statementSummary?.opening ?? 0)} • Period closing: Rs {money(statementSummary?.closingInPeriod ?? 0)}
                            </div>
                          </div>
                        </div>

                        {/* Table (NO internal scroll) */}
                        <div className="mt-5 rounded-2xl border overflow-hidden">
                          <table className="w-full text-sm">
                            <thead className="bg-muted/20 border-b">
                              <tr>
                                <th className="text-left p-3 w-[60px]">SN</th>
                                <th className="text-left p-3 w-[130px]">Date</th>
                                <th className="text-left p-3 w-[160px]">Reference</th>
                                <th className="text-left p-3">Details</th>
                                <th className="text-right p-3 w-[160px]">Amount</th>
                                <th className="text-right p-3 w-[170px]">Balance</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y">
                              {/* Opening row */}
                              <tr className="bg-muted/10">
                                <td className="p-3 font-semibold">—</td>
                                <td className="p-3 font-medium">{from}</td>
                                <td className="p-3">—</td>
                                <td className="p-3 text-muted-foreground">Opening balance (before period)</td>
                                <td className="p-3 text-right tabular-nums">Rs {money(statementPack.opening)}</td>
                                <td className="p-3 text-right tabular-nums font-extrabold">Rs {money(statementPack.opening)}</td>
                              </tr>

                              {statementPack.rowsInRange.map((r, idx) => (
                                <tr key={`${r.type}|${r.ref}|${r.date}|${idx}`}>
                                  <td className="p-3 font-semibold">{idx + 1}</td>
                                  <td className="p-3 font-medium">{r.date}</td>
                                  <td className="p-3 font-semibold">{r.ref}</td>
                                  <td className="p-3 text-muted-foreground">{r.details}</td>
                                  <td className="p-3 text-right tabular-nums font-semibold">
                                    Rs <span className={r.amount < 0 ? "text-red-700" : ""}>{moneySigned(r.amount)}</span>
                                  </td>
                                  <td className="p-3 text-right tabular-nums font-extrabold">Rs {money(r.balance ?? 0)}</td>
                                </tr>
                              ))}

                              {statementPack.rowsInRange.length === 0 ? (
                                <tr>
                                  <td colSpan={6} className="p-6 text-center text-muted-foreground">
                                    No statement movements in this period.
                                  </td>
                                </tr>
                              ) : null}
                            </tbody>
                          </table>
                        </div>

                        <div className="mt-4 text-xs text-muted-foreground">
                          This statement is generated from system records. Please contact Ram Pottery Ltd for clarifications.
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* ===== DAILY INVOICES ===== */}
                {activeReport === "DAILY_INVOICES" && !anyError && (
                  <TableWrap maxHeight={viewerRowCap}>
                    <table className="w-full text-sm">
                      <thead className="border-b bg-muted/20 sticky top-0">
                        <tr>
                          <th className="text-left p-3">Date</th>
                          <th className="text-right p-3">Invoices</th>
                          <th className="text-right p-3">Credit Notes</th>
                          <th className="text-right p-3">Customers</th>
                          <th className="text-right p-3">Gross (Net)</th>
                          <th className="text-right p-3">Subtotal (Net)</th>
                          <th className="text-right p-3">VAT (Net)</th>
                          <th className="text-right p-3">Discount</th>
                          <th className="text-right p-3">Total (Net)</th>
                          <th className="text-right p-3">Payments (Matched)</th>
                          <th className="text-right p-3">Net After Payments</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {dailyInvoices.map((r) => (
                          <tr key={r.date} className="hover:bg-muted/30">
                            <td className="p-3 font-medium">{r.date}</td>
                            <td className="p-3 text-right tabular-nums">{r.invoices}</td>
                            <td className="p-3 text-right tabular-nums">{r.credit_notes}</td>
                            <td className="p-3 text-right tabular-nums">{r.unique_customers}</td>
                            <td className="p-3 text-right tabular-nums">Rs {money(r.gross_total)}</td>
                            <td className="p-3 text-right tabular-nums">Rs {money(r.subtotal)}</td>
                            <td className="p-3 text-right tabular-nums font-semibold">Rs {money(r.vat)}</td>
                            <td className="p-3 text-right tabular-nums">Rs {money(r.discount)}</td>
                            <td className="p-3 text-right tabular-nums font-semibold">Rs {money(r.total)}</td>
                            <td className="p-3 text-right tabular-nums font-semibold">Rs {money(r.collected)}</td>
                            <td className="p-3 text-right tabular-nums font-semibold">
                              Rs <span className={n(r.net_after_payments) < 0 ? "text-red-700" : ""}>{money(r.net_after_payments)}</span>
                            </td>
                          </tr>
                        ))}
                        {dailyInvoices.length === 0 ? (
                          <tr>
                            <td colSpan={11} className="p-6 text-center text-muted-foreground">
                              No data in this range.
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </TableWrap>
                )}

                {/* ===== DAILY PRODUCTS ===== */}
                {activeReport === "DAILY_PRODUCTS" && !anyError && (
                  <div className="space-y-4">
                    {dailyProducts.dates.length === 0 ? (
                      <div className="text-center text-muted-foreground py-8">No sales/returns found in this range.</div>
                    ) : (
                      dailyProducts.dates.map((d) => {
                        const all = dailyProducts.byDate.get(d) ?? [];
                        const rows = all.slice(0, 12);
                        const dayTotal = all.reduce((s: number, r: any) => s + n(r.sales), 0);
                        const dayQty = all.reduce((s: number, r: any) => s + n(r.qty), 0);

                        return (
                          <Card key={d} className="reports-card">
                            <CardHeader className="pb-3">
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <CardTitle className="text-base">{d}</CardTitle>
                                  <CardDescription>
                                    Net Sales: <b>Rs {money(dayTotal)}</b> • Net Qty: <b>{money(dayQty)}</b>
                                  </CardDescription>
                                </div>
                                <Badge variant="secondary" className="border bg-muted/30">
                                  Top {rows.length}
                                </Badge>
                              </div>
                            </CardHeader>
                            <CardContent>
                              <TableWrap maxHeight={380}>
                                <table className="w-full text-sm">
                                  <thead className="border-b bg-muted/20 sticky top-0">
                                    <tr>
                                      <th className="text-left p-3">SKU</th>
                                      <th className="text-left p-3">Product</th>
                                      <th className="text-right p-3">Qty (Net)</th>
                                      <th className="text-right p-3">Sales (Net)</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y">
                                    {rows.map((r: any) => (
                                      <tr key={`${r.date}|${r.product_id}|${r.sku}`} className="hover:bg-muted/30">
                                        <td className="p-3 font-medium">{r.sku}</td>
                                        <td className="p-3">{r.product}</td>
                                        <td className="p-3 text-right tabular-nums">{moneySigned(r.qty)}</td>
                                        <td className="p-3 text-right tabular-nums font-semibold">
                                          Rs <span className={r.sales < 0 ? "text-red-700" : ""}>{moneySigned(r.sales)}</span>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </TableWrap>
                              <div className="mt-3 text-xs text-muted-foreground">
                                Net = <b>invoice_items</b> minus <b>credit_note_items</b>.
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })
                    )}
                  </div>
                )}

                {/* ===== CUSTOMERS DAILY ===== */}
                {activeReport === "CUSTOMERS_DAILY" && !anyError && (
                  <TableWrap maxHeight={viewerRowCap}>
                    <table className="w-full text-sm">
                      <thead className="border-b bg-muted/20 sticky top-0">
                        <tr>
                          <th className="text-left p-3">Date</th>
                          <th className="text-right p-3">Unique Customers</th>
                          <th className="text-right p-3">Invoices</th>
                          <th className="text-right p-3">Credit Notes</th>
                          <th className="text-right p-3">Total (Net)</th>
                          <th className="text-left p-3">Top Customers (Net)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {customersDaily.map((r) => (
                          <tr key={r.date} className="hover:bg-muted/30">
                            <td className="p-3 font-medium">{r.date}</td>
                            <td className="p-3 text-right tabular-nums">{r.unique_customers}</td>
                            <td className="p-3 text-right tabular-nums">{r.invoices}</td>
                            <td className="p-3 text-right tabular-nums">{r.credit_notes}</td>
                            <td className="p-3 text-right tabular-nums font-semibold">Rs {money(r.total)}</td>
                            <td className="p-3 text-sm text-muted-foreground">
                              {r.topCustomers?.length
                                ? r.topCustomers
                                    .map((c: any) => `${c.customer}${c.secondary ? ` (${c.secondary})` : ""} (Rs ${moneySigned(c.amount)})`)
                                    .join(" • ")
                                : "—"}
                            </td>
                          </tr>
                        ))}
                        {customersDaily.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="p-6 text-center text-muted-foreground">
                              No data in this range.
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </TableWrap>
                )}

                {/* ===== REP DAILY (virtual for big lists) ===== */}
                {activeReport === "REP_DAILY" && !anyError && (
                  <div className="rounded-xl border overflow-hidden bg-white">
                    <div className="grid grid-cols-[140px_1.3fr_110px_130px_140px_160px] gap-0 border-b bg-muted/20 px-3 py-2 text-[12px] text-muted-foreground">
                      <div>Date</div>
                      <div>Sales Rep</div>
                      <div className="text-right">Invoices/CN</div>
                      <div className="text-right">Discount</div>
                      <div className="text-right">VAT (Net)</div>
                      <div className="text-right">Total (Net)</div>
                    </div>

                    <VirtualList
                      items={repDaily}
                      height={clamp(repDaily.length * 56, 220, viewerRowCap)}
                      rowHeight={56}
                      overscan={12}
                      renderRow={(r: any) => (
                        <div className="grid grid-cols-[140px_1.3fr_110px_130px_140px_160px] gap-0 px-3 py-3 text-sm border-b last:border-b-0 hover:bg-muted/30">
                          <div className="font-medium">{r.date}</div>
                          <div className="min-w-0">
                            <div className="font-medium truncate">{r.rep}</div>
                            {r.rep_phone ? <div className="text-xs text-muted-foreground truncate">{r.rep_phone}</div> : null}
                          </div>
                          <div className="text-right tabular-nums">
                            {r.invoices}/{r.credit_notes}
                          </div>
                          <div className="text-right tabular-nums">Rs {money(r.discount)}</div>
                          <div className="text-right tabular-nums">Rs {money(r.vat)}</div>
                          <div className="text-right tabular-nums font-semibold">Rs {money(r.total)}</div>
                        </div>
                      )}
                    />

                    {repDaily.length === 0 ? <div className="p-6 text-center text-muted-foreground">No rep sales in this range.</div> : null}
                  </div>
                )}

                {/* ===== REP MONTHLY ===== */}
                {activeReport === "REP_MONTHLY" && !anyError && (
                  <TableWrap maxHeight={viewerRowCap}>
                    <table className="w-full text-sm">
                      <thead className="border-b bg-muted/20 sticky top-0">
                        <tr>
                          <th className="text-left p-3">Month</th>
                          <th className="text-left p-3">Sales Rep</th>
                          <th className="text-right p-3">Invoices</th>
                          <th className="text-right p-3">Credit Notes</th>
                          <th className="text-right p-3">Discount</th>
                          <th className="text-right p-3">VAT (Net)</th>
                          <th className="text-right p-3">Total (Net)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {repMonthly.map((r) => (
                          <tr key={`${r.month}|${r.rep}`} className="hover:bg-muted/30">
                            <td className="p-3 font-medium">{r.month}</td>
                            <td className="p-3 font-medium">{r.rep}</td>
                            <td className="p-3 text-right tabular-nums">{r.invoices}</td>
                            <td className="p-3 text-right tabular-nums">{r.credit_notes}</td>
                            <td className="p-3 text-right tabular-nums">Rs {money(r.discount)}</td>
                            <td className="p-3 text-right tabular-nums">Rs {money(r.vat)}</td>
                            <td className="p-3 text-right tabular-nums font-semibold">Rs {money(r.total)}</td>
                          </tr>
                        ))}
                        {repMonthly.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="p-6 text-center text-muted-foreground">
                              No monthly rep sales in this range.
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </TableWrap>
                )}

                {/* ===== CUSTOMER MONTHLY ===== */}
                {activeReport === "CUSTOMER_MONTHLY" && !anyError && (
                  <TableWrap maxHeight={viewerRowCap}>
                    <table className="w-full text-sm">
                      <thead className="border-b bg-muted/20 sticky top-0">
                        <tr>
                          <th className="text-left p-3">Month</th>
                          <th className="text-left p-3">Customer</th>
                          <th className="text-right p-3">Invoices</th>
                          <th className="text-right p-3">Credit Notes</th>
                          <th className="text-right p-3">Discount</th>
                          <th className="text-right p-3">VAT (Net)</th>
                          <th className="text-right p-3">Total (Net)</th>
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
                            <td className="p-3 text-right tabular-nums">{r.invoices}</td>
                            <td className="p-3 text-right tabular-nums">{r.credit_notes}</td>
                            <td className="p-3 text-right tabular-nums">Rs {money(r.discount)}</td>
                            <td className="p-3 text-right tabular-nums">Rs {money(r.vat)}</td>
                            <td className="p-3 text-right tabular-nums font-semibold">Rs {money(r.total)}</td>
                          </tr>
                        ))}
                        {customerMonthly.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="p-6 text-center text-muted-foreground">
                              No monthly customer sales in this range.
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </TableWrap>
                )}

                {/* ===== SALESMAN PERIOD ===== */}
                {activeReport === "SALESMAN_PERIOD" && !anyError && (
                  <TableWrap maxHeight={viewerRowCap}>
                    <table className="w-full text-sm">
                      <thead className="border-b bg-muted/20 sticky top-0">
                        <tr>
                          <th className="text-left p-3">Salesman</th>
                          <th className="text-left p-3">Phone</th>
                          <th className="text-right p-3">Invoices</th>
                          <th className="text-right p-3">Credit Notes</th>
                          <th className="text-right p-3">Discount</th>
                          <th className="text-right p-3">VAT (Net)</th>
                          <th className="text-right p-3">Total (Net)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {salesmanPeriod.map((r) => (
                          <tr key={r.rep} className="hover:bg-muted/30">
                            <td className="p-3 font-medium">{r.rep}</td>
                            <td className="p-3 text-muted-foreground">{r.rep_phone || "—"}</td>
                            <td className="p-3 text-right tabular-nums">{r.invoices}</td>
                            <td className="p-3 text-right tabular-nums">{r.credit_notes}</td>
                            <td className="p-3 text-right tabular-nums">Rs {money(r.discount)}</td>
                            <td className="p-3 text-right tabular-nums">Rs {money(r.vat)}</td>
                            <td className="p-3 text-right tabular-nums font-semibold">Rs {money(r.total)}</td>
                          </tr>
                        ))}
                        {salesmanPeriod.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="p-6 text-center text-muted-foreground">
                              No salesman sales in this range.
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </TableWrap>
                )}

                {/* ===== PRODUCTS PERIOD ===== */}
                {activeReport === "PRODUCTS_PERIOD" && !anyError && (
                  <TableWrap maxHeight={viewerRowCap}>
                    <table className="w-full text-sm">
                      <thead className="border-b bg-muted/20 sticky top-0">
                        <tr>
                          <th className="text-left p-3">SKU</th>
                          <th className="text-left p-3">Product</th>
                          <th className="text-right p-3">Qty (Net)</th>
                          <th className="text-right p-3">Sales (Net)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {productsPeriod.map((r) => (
                          <tr key={r.product_id} className="hover:bg-muted/30">
                            <td className="p-3 font-medium">{r.sku}</td>
                            <td className="p-3">{r.product}</td>
                            <td className="p-3 text-right tabular-nums">{moneySigned(r.qty)}</td>
                            <td className="p-3 text-right tabular-nums font-semibold">
                              Rs <span className={r.sales < 0 ? "text-red-700" : ""}>{moneySigned(r.sales)}</span>
                            </td>
                          </tr>
                        ))}
                        {productsPeriod.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="p-6 text-center text-muted-foreground">
                              No sales/returns in this range.
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </TableWrap>
                )}

                {/* ===== VAT ===== */}
                {activeReport === "VAT" && !anyError && (
                  <div className="grid gap-6 lg:grid-cols-2">
                    <Card className="reports-card">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base">{granularity === "DAILY" ? "Daily VAT (Net)" : "Monthly VAT (Net)"}</CardTitle>
                        <CardDescription>Invoices VAT minus Credit Notes VAT</CardDescription>
                      </CardHeader>
                      <CardContent className="p-0">
                        <TableWrap maxHeight={viewerRowCap}>
                          <table className="w-full text-sm">
                            <thead className="border-b bg-muted/20 sticky top-0">
                              <tr>
                                <th className="text-left p-3">{granularity === "DAILY" ? "Date" : "Month"}</th>
                                <th className="text-right p-3">VAT (Net)</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y">
                              {(granularity === "DAILY" ? vatDailyMonthly.dailyRows : vatDailyMonthly.monthlyRows).map((r: any) => (
                                <tr key={r.date || r.month} className="hover:bg-muted/30">
                                  <td className="p-3 font-medium">{r.date || r.month}</td>
                                  <td className="p-3 text-right tabular-nums font-semibold">Rs {money(r.vat)}</td>
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
                        </TableWrap>
                      </CardContent>
                    </Card>

                    <Card className="reports-card">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base">Total VAT (Net)</CardTitle>
                        <CardDescription>Sum of selected range</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl md:text-3xl font-extrabold tabular-nums">Rs {money(kpi.vat)}</div>
                        <div className="mt-2 text-sm text-muted-foreground">
                          Period: <b>{from}</b> → <b>{to}</b>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}

                {/* ===== DISCOUNT ===== */}
                {activeReport === "DISCOUNT" && !anyError && (
                  <div className="grid gap-6 lg:grid-cols-2">
                    <Card className="reports-card">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base">{granularity === "DAILY" ? "Daily Discount" : "Monthly Discount"}</CardTitle>
                        <CardDescription>From invoices.discount_amount (Credit notes don’t carry discount)</CardDescription>
                      </CardHeader>
                      <CardContent className="p-0">
                        <TableWrap maxHeight={viewerRowCap}>
                          <table className="w-full text-sm">
                            <thead className="border-b bg-muted/20 sticky top-0">
                              <tr>
                                <th className="text-left p-3">{granularity === "DAILY" ? "Date" : "Month"}</th>
                                <th className="text-right p-3">Discount</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y">
                              {(granularity === "DAILY" ? discountDailyMonthly.dailyRows : discountDailyMonthly.monthlyRows).map((r: any) => (
                                <tr key={r.date || r.month} className="hover:bg-muted/30">
                                  <td className="p-3 font-medium">{r.date || r.month}</td>
                                  <td className="p-3 text-right tabular-nums font-semibold">Rs {money(r.discount)}</td>
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
                        </TableWrap>
                      </CardContent>
                    </Card>

                    <Card className="reports-card">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base">Total Discount (Period)</CardTitle>
                        <CardDescription>Sum of selected range</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl md:text-3xl font-extrabold tabular-nums">Rs {money(kpi.discount)}</div>
                        <div className="mt-2 text-sm text-muted-foreground">
                          Period: <b>{from}</b> → <b>{to}</b>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="no-print text-xs text-muted-foreground">
            ✅ Credit Notes deducted in all “Net” reports. ✅ Payments matched to invoice_date for “Daily Invoices” + KPI. ✅ Statement shows Balance Due with proper deductions and no internal scroll (PDF/Print).
          </div>
        </div>
      </div>
    </div>
  );
}

