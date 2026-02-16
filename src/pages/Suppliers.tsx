// src/pages/Suppliers.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";

import {
  Users,
  Plus,
  RefreshCw,
  FileDown,
  Receipt,
  FileText,
  Landmark,
  AlertTriangle,
  ShieldCheck,
  ShieldX,
  Search,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  X,
} from "lucide-react";

/* =========================================================
   Types (match your table + AP views)
========================================================= */
type SupplierRow = {
  id: number;
  supplier_code: string | null;

  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;

  city: string | null;
  country: string | null;
  vat_no: string | null;

  opening_balance: number | null;
  is_active: boolean;

  import_batch_id: string | null;
  import_source: string | null;

  notes: string | null;

  created_at: string | null;
  updated_at: string | null;
};

type SupplierUpsert = {
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;

  city?: string | null;
  country?: string | null;
  vat_no?: string | null;

  opening_balance?: any;
  is_active?: boolean;

  import_batch_id?: string | null;
  import_source?: string | null;

  notes?: string | null;
};

type StatusFilter = "ACTIVE" | "INACTIVE" | "ALL";

type ApKpis = {
  total_payables: number;
  total_outstanding: number;
  open_bills: number;
  partial_bills: number;
  paid_bills: number;
  overdue_amount: number;
  active_suppliers: number;
};

type AgingRow = {
  supplier_id: number;
  supplier_name: string;
  total_outstanding: number;
  bucket_0_30: number;
  bucket_31_60: number;
  bucket_61_90: number;
  bucket_90_plus: number;
};

type ExposureRow = {
  supplier_id: number;
  supplier_name: string;
  balance: number;
  total_outstanding: number;
  bucket_90_plus: number;
};

type LedgerLine = {
  supplier_id: number;
  txn_date: string; // date
  txn_type: "BILL" | "PAYMENT";
  txn_id: number;
  reference: string;
  status: string | null;
  debit: number;
  credit: number;
};

/* =========================================================
   Helpers
========================================================= */
function s(v: any) {
  return String(v ?? "").trim();
}
function n0(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function money(v: any) {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return "0.00";
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function normalizePhone(v: any) {
  return String(v ?? "").replace(/[^\d]/g, "");
}
function qsGet(search: string, key: string) {
  try {
    return new URLSearchParams(search).get(key);
  } catch {
    return null;
  }
}
function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}
function downloadCsv(filename: string, rows: Record<string, any>[]) {
  if (!rows.length) return toast.error("Nothing to export");
  const header = Object.keys(rows[0]);
  const csv = [
    header.join(","),
    ...rows.map((r) =>
      header
        .map((k) => `"${String(r[k] ?? "").replace(/"/g, '""')}"`)
        .join(",")
    ),
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* =========================================================
   Premium UI bits
========================================================= */
function StatCard({
  icon,
  label,
  value,
  sub,
  tone = "muted",
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "muted" | "ok" | "bad" | "warn";
}) {
  const ring =
    tone === "ok"
      ? "ring-emerald-500/20 bg-emerald-500/5"
      : tone === "bad"
      ? "ring-red-500/20 bg-red-500/5"
      : tone === "warn"
      ? "ring-amber-500/20 bg-amber-500/5"
      : "ring-border bg-muted/10";

  return (
    <Card className={`p-3 shadow-premium ring-1 ${ring}`}>
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-xl bg-background ring-1 ring-border flex items-center justify-center">
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-[11px] text-muted-foreground">{label}</div>
          <div className="text-sm font-semibold truncate">{value}</div>
          {sub ? <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{sub}</div> : null}
        </div>
      </div>
    </Card>
  );
}

function Badge({ tone, children }: { tone: "ok" | "bad" | "muted" | "warn"; children: React.ReactNode }) {
  const cls =
    tone === "ok"
      ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/20"
      : tone === "bad"
      ? "bg-red-500/10 text-red-700 border-red-500/20"
      : tone === "warn"
      ? "bg-amber-500/10 text-amber-800 border-amber-500/20"
      : "bg-muted/30 text-muted-foreground border-border";
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${cls}`}>
      {children}
    </span>
  );
}

function MiniBar({ value, max, label }: { value: number; max: number; label?: string }) {
  const pct = max <= 0 ? 0 : clamp((value / max) * 100, 0, 100);
  return (
    <div className="w-full">
      {label ? <div className="text-[11px] text-muted-foreground mb-1">{label}</div> : null}
      <div className="h-2 rounded-full bg-muted/30 overflow-hidden">
        <div className="h-2 rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/* =========================================================
   DB (server-side pagination)
========================================================= */
async function listSuppliersPaged(args: { q?: string; status?: StatusFilter; page: number; pageSize: number }) {
  const q = (args.q || "").trim();
  const status = args.status ?? "ACTIVE";
  const page = Math.max(0, Math.trunc(args.page || 0));
  const pageSize = Math.max(1, Math.trunc(args.pageSize || 50));
  const from = page * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("suppliers")
    .select(
      "id,supplier_code,name,phone,email,address,city,country,vat_no,opening_balance,is_active,import_batch_id,import_source,notes,created_at,updated_at",
      { count: "exact" }
    )
    .order("name", { ascending: true })
    .range(from, to);

  if (status === "ACTIVE") query = query.eq("is_active", true);
  if (status === "INACTIVE") query = query.eq("is_active", false);

  if (q) {
    const sQ = q.replaceAll(",", " ");
    query = query.or(
      `name.ilike.%${sQ}%,supplier_code.ilike.%${sQ}%,email.ilike.%${sQ}%,phone.ilike.%${sQ}%,vat_no.ilike.%${sQ}%`
    );
  }

  const { data, error, count } = await query;
  if (error) throw error;
  return { rows: (data || []) as SupplierRow[], total: Number(count || 0) };
}

async function listSupplierBalancesFor(ids: number[]) {
  if (!ids.length) return new Map<number, number>();
  const { data, error } = await supabase.from("v_supplier_balances").select("supplier_id,balance").in("supplier_id", ids);
  if (error) throw error;
  const map = new Map<number, number>();
  for (const r of data || []) map.set(Number((r as any).supplier_id), n0((r as any).balance));
  return map;
}

async function getApKpis(): Promise<ApKpis> {
  const { data, error } = await supabase.from("v_ap_kpis").select("*").maybeSingle();
  if (error) throw error;
  const d = (data || {}) as any;
  return {
    total_payables: n0(d.total_payables),
    total_outstanding: n0(d.total_outstanding),
    open_bills: n0(d.open_bills),
    partial_bills: n0(d.partial_bills),
    paid_bills: n0(d.paid_bills),
    overdue_amount: n0(d.overdue_amount),
    active_suppliers: n0(d.active_suppliers),
  };
}

async function listTopExposure(limit = 10): Promise<ExposureRow[]> {
  const { data, error } = await supabase
    .from("v_ap_top_exposure_suppliers")
    .select("supplier_id,supplier_name,balance,total_outstanding,bucket_90_plus")
    .order("balance", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).map((r: any) => ({
    supplier_id: Number(r.supplier_id),
    supplier_name: String(r.supplier_name || ""),
    balance: n0(r.balance),
    total_outstanding: n0(r.total_outstanding),
    bucket_90_plus: n0(r.bucket_90_plus),
  }));
}

async function listAgingAll(limit = 5000): Promise<AgingRow[]> {
  const { data, error } = await supabase
    .from("v_supplier_aging")
    .select("supplier_id,supplier_name,total_outstanding,bucket_0_30,bucket_31_60,bucket_61_90,bucket_90_plus")
    .order("total_outstanding", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).map((r: any) => ({
    supplier_id: Number(r.supplier_id),
    supplier_name: String(r.supplier_name || ""),
    total_outstanding: n0(r.total_outstanding),
    bucket_0_30: n0(r.bucket_0_30),
    bucket_31_60: n0(r.bucket_31_60),
    bucket_61_90: n0(r.bucket_61_90),
    bucket_90_plus: n0(r.bucket_90_plus),
  }));
}

async function getSupplierAging(supplierId: number) {
  const { data, error } = await supabase
    .from("v_supplier_aging")
    .select("supplier_id,supplier_name,total_outstanding,bucket_0_30,bucket_31_60,bucket_61_90,bucket_90_plus")
    .eq("supplier_id", supplierId)
    .maybeSingle();
  if (error) throw error;
  const r: any = data || {};
  return {
    supplier_id: Number(r.supplier_id || supplierId),
    supplier_name: String(r.supplier_name || ""),
    total_outstanding: n0(r.total_outstanding),
    bucket_0_30: n0(r.bucket_0_30),
    bucket_31_60: n0(r.bucket_31_60),
    bucket_61_90: n0(r.bucket_61_90),
    bucket_90_plus: n0(r.bucket_90_plus),
  } as AgingRow;
}

async function getSupplierLedger(supplierId: number, limit = 200): Promise<LedgerLine[]> {
  const { data, error } = await supabase
    .from("v_supplier_ledger_lines")
    .select("supplier_id,txn_date,txn_type,txn_id,reference,status,debit,credit")
    .eq("supplier_id", supplierId)
    .order("txn_date", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).map((r: any) => ({
    supplier_id: Number(r.supplier_id),
    txn_date: String(r.txn_date),
    txn_type: r.txn_type,
    txn_id: Number(r.txn_id),
    reference: String(r.reference || ""),
    status: r.status ? String(r.status) : null,
    debit: n0(r.debit),
    credit: n0(r.credit),
  }));
}

function sanitizeSupplierPayload(payload: SupplierUpsert) {
  const row: any = {
    name: s(payload.name),
    phone: normalizePhone(payload.phone) || null,
    email: s(payload.email) || null,
    address: s(payload.address) || null,
    city: s(payload.city) || null,
    country: s(payload.country) || null,
    vat_no: s(payload.vat_no) || null,
    opening_balance: n0(payload.opening_balance),
    is_active: payload.is_active ?? true,
    import_batch_id: payload.import_batch_id ?? null,
    import_source: payload.import_source ?? null,
    notes: s(payload.notes) || null,
    updated_at: new Date().toISOString(),
  };

  const nullable = ["phone", "email", "address", "city", "country", "vat_no", "notes"];
  for (const k of nullable) if (row[k] === "") row[k] = null;

  return row;
}

async function createSupplier(payload: SupplierUpsert) {
  const row = sanitizeSupplierPayload(payload);
  const { data, error } = await supabase
    .from("suppliers")
    .insert(row)
    .select(
      "id,supplier_code,name,phone,email,address,city,country,vat_no,opening_balance,is_active,import_batch_id,import_source,notes,created_at,updated_at"
    )
    .single();
  if (error) throw error;
  return data as SupplierRow;
}

async function updateSupplier(id: number, payload: SupplierUpsert) {
  const row = sanitizeSupplierPayload(payload);
  const { data, error } = await supabase
    .from("suppliers")
    .update(row)
    .eq("id", id)
    .select(
      "id,supplier_code,name,phone,email,address,city,country,vat_no,opening_balance,is_active,import_batch_id,import_source,notes,created_at,updated_at"
    )
    .single();
  if (error) throw error;
  return data as SupplierRow;
}

async function setSupplierActive(id: number, active: boolean) {
  const { data, error } = await supabase
    .from("suppliers")
    .update({ is_active: active, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id,is_active")
    .single();
  if (error) throw error;
  return data as { id: number; is_active: boolean };
}

/* =========================================================
   Ultra-light Virtual List (smooth scroll)
========================================================= */
function VirtualList<T>({
  items,
  height,
  rowHeight,
  overscan = 8,
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

/* =========================================================
   Page
========================================================= */
const emptyForm: SupplierUpsert = {
  name: "",
  email: "",
  phone: "",
  address: "",
  city: "",
  country: "Mauritius",
  vat_no: "",
  opening_balance: 0,
  is_active: true,
  notes: "",
};

export default function Suppliers() {
  const nav = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();

  // supports both /suppliers?open=new and /suppliers/new
  const jumpTo = qsGet(location.search, "open");
  const pathWantsNew = useMemo(() => location.pathname.endsWith("/new"), [location.pathname]);

  const pageSize = 50;

  const [tab, setTab] = useState<"DASHBOARD" | "REGISTER">("DASHBOARD");

  // search debounce (server-side)
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StatusFilter>("ACTIVE");

  const [page, setPage] = useState(0);

  // dialog: create/edit supplier
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SupplierRow | null>(null);
  const [form, setForm] = useState<SupplierUpsert>(emptyForm);

  // ledger popup
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [ledgerSupplier, setLedgerSupplier] = useState<SupplierRow | null>(null);

  // aging report popup
  const [agingOpen, setAgingOpen] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setQ(qInput.trim()), 250);
    return () => window.clearTimeout(t);
  }, [qInput]);

  // reset paging when filter changes
  useEffect(() => {
    setPage(0);
  }, [q, status]);

  const suppliersQ = useQuery({
    queryKey: ["suppliersPaged", q, status, page, pageSize],
    queryFn: () => listSuppliersPaged({ q, status, page, pageSize }),
    staleTime: 12_000,
    keepPreviousData: true,
  });

  const rowsPage = suppliersQ.data?.rows || [];
  const total = suppliersQ.data?.total || 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  // balances for current page only (fast)
  const balancesQ = useQuery({
    queryKey: ["supplierBalancesFor", rowsPage.map((r) => r.id).join(",")],
    enabled: rowsPage.length > 0,
    queryFn: () => listSupplierBalancesFor(rowsPage.map((r) => r.id)),
    staleTime: 12_000,
  });

  const balanceMap = balancesQ.data || new Map<number, number>();

  const rows = useMemo(() => {
    return rowsPage.map((r) => ({
      ...r,
      _balance: balanceMap.get(r.id) ?? (n0(r.opening_balance) || 0),
    }));
  }, [rowsPage, balanceMap]);

  // CFO dashboard data
  const kpisQ = useQuery({
    queryKey: ["apKpis"],
    queryFn: getApKpis,
    staleTime: 12_000,
  });

  const topExposureQ = useQuery({
    queryKey: ["apTopExposure"],
    queryFn: () => listTopExposure(10),
    staleTime: 12_000,
  });

  const agingAllQ = useQuery({
    queryKey: ["apAgingAll"],
    queryFn: () => listAgingAll(5000),
    staleTime: 30_000,
  });

  const agingSummary = useMemo(() => {
    const list = agingAllQ.data || [];
    const sum = { total: 0, b0_30: 0, b31_60: 0, b61_90: 0, b90p: 0 };
    for (const r of list) {
      sum.total += n0(r.total_outstanding);
      sum.b0_30 += n0(r.bucket_0_30);
      sum.b31_60 += n0(r.bucket_31_60);
      sum.b61_90 += n0(r.bucket_61_90);
      sum.b90p += n0(r.bucket_90_plus);
    }
    return sum;
  }, [agingAllQ.data]);

  const maxAgingBucket = Math.max(agingSummary.b0_30, agingSummary.b31_60, agingSummary.b61_90, agingSummary.b90p, 1);

  function openNew() {
    setEditing(null);
    setForm({ ...emptyForm, country: "Mauritius", is_active: true, opening_balance: 0 });
    setOpen(true);
  }

  function openEdit(sup: SupplierRow) {
    setEditing(sup);
    setForm({
      name: sup.name,
      email: sup.email ?? "",
      phone: sup.phone ?? "",
      address: sup.address ?? "",
      city: sup.city ?? "",
      country: sup.country ?? "Mauritius",
      vat_no: sup.vat_no ?? "",
      opening_balance: n0(sup.opening_balance),
      is_active: sup.is_active,
      notes: sup.notes ?? "",
    });
    setOpen(true);
  }

  function saveSupplier() {
    if (!s(form.name)) return toast.error("Supplier name is required");
    const payload: SupplierUpsert = {
      ...form,
      phone: normalizePhone(form.phone),
      opening_balance: n0(form.opening_balance),
      is_active: !!form.is_active,
    };
    if (editing) return updateM.mutate({ id: editing.id, payload });
    return createM.mutate(payload);
  }

  function openLedger(sup: SupplierRow) {
    setLedgerSupplier(sup);
    setLedgerOpen(true);
  }

  // ✅ URL -> open modal (reactive)
  useEffect(() => {
    const wantsNew = jumpTo === "new" || pathWantsNew;
    if (wantsNew && !open) {
      setTab("REGISTER");
      openNew();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpTo, pathWantsNew]);

  // mutations
  const createM = useMutation({
    mutationFn: (payload: SupplierUpsert) => createSupplier(payload),
    onSuccess: async () => {
      toast.success("Supplier created");
      await qc.invalidateQueries({ queryKey: ["suppliersPaged"], exact: false });
      await qc.invalidateQueries({ queryKey: ["apKpis"], exact: false });
      await qc.invalidateQueries({ queryKey: ["apTopExposure"], exact: false });
      await qc.invalidateQueries({ queryKey: ["apAgingAll"], exact: false });

      setOpen(false);

      // clean URL after create
      if (location.pathname.endsWith("/new") || qsGet(location.search, "open") === "new") {
        nav("/suppliers", { replace: true });
      }
    },
    onError: (e: any) => toast.error(e?.message || "Failed to create supplier"),
  });

  const updateM = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: SupplierUpsert }) => updateSupplier(id, payload),
    onSuccess: async () => {
      toast.success("Supplier updated");
      await qc.invalidateQueries({ queryKey: ["suppliersPaged"], exact: false });
      await qc.invalidateQueries({ queryKey: ["apKpis"], exact: false });
      await qc.invalidateQueries({ queryKey: ["apTopExposure"], exact: false });
      await qc.invalidateQueries({ queryKey: ["apAgingAll"], exact: false });
      setOpen(false);
    },
    onError: (e: any) => toast.error(e?.message || "Failed to update supplier"),
  });

  const activeM = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) => setSupplierActive(id, active),
    onSuccess: async ({ is_active }) => {
      toast.success(is_active ? "Supplier activated" : "Supplier deactivated");
      await qc.invalidateQueries({ queryKey: ["suppliersPaged"], exact: false });
    },
    onError: (e: any) => toast.error(e?.message || "Failed"),
  });

  // ledger + aging (supplier-specific)
  const ledgerQ = useQuery({
    queryKey: ["supplierLedger", ledgerSupplier?.id || 0],
    enabled: ledgerOpen && !!ledgerSupplier?.id,
    queryFn: () => getSupplierLedger(Number(ledgerSupplier!.id), 250),
    staleTime: 10_000,
  });

  const supplierAgingQ = useQuery({
    queryKey: ["supplierAging", ledgerSupplier?.id || 0],
    enabled: ledgerOpen && !!ledgerSupplier?.id,
    queryFn: () => getSupplierAging(Number(ledgerSupplier!.id)),
    staleTime: 10_000,
  });

  // derived KPIs (page-level)
  const pageKpis = useMemo(() => {
    const totalInPage = rows.length;
    const active = rows.filter((r: any) => !!r.is_active).length;
    const inactive = totalInPage - active;
    const sumOpening = rows.reduce((a, r: any) => a + n0(r.opening_balance), 0);
    const sumBalance = rows.reduce((a, r: any) => a + n0(r._balance), 0);
    const missingVat = rows.filter((r: any) => !s(r.vat_no)).length;
    return { totalInPage, active, inactive, sumOpening, sumBalance, missingVat };
  }, [rows]);

  const topExposure = topExposureQ.data || [];
  const maxExposure = Math.max(...topExposure.map((x) => x.balance), 1);

  function exportSuppliersCsvCurrentPage() {
    const csvRows = rows.map((r: any) => ({
      supplier_code: r.supplier_code || "",
      name: r.name || "",
      phone: r.phone || "",
      email: r.email || "",
      vat_no: r.vat_no || "",
      city: r.city || "",
      country: r.country || "",
      opening_balance: n0(r.opening_balance),
      balance: n0(r._balance),
      is_active: r.is_active ? "TRUE" : "FALSE",
      notes: r.notes || "",
      import_source: r.import_source || "",
      import_batch_id: r.import_batch_id || "",
    }));
    downloadCsv(`suppliers_page_${page + 1}.csv`, csvRows);
    toast.success("Exported CSV (current page)");
  }

  return (
    <div className="space-y-5 pb-10">
      {/* Top Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <div className="text-2xl font-semibold tracking-tight">Accounts Payable</div>
              <div className="text-xs text-muted-foreground">CFO dashboard • Supplier register • Ledger • Aging</div>
            </div>
          </div>

          {/* Tabs */}
          <div className="mt-2 inline-flex rounded-xl border bg-muted/10 p-1">
            <button
              type="button"
              className={
                "px-3 py-1.5 text-sm rounded-lg transition " +
                (tab === "DASHBOARD" ? "bg-background shadow-sm font-semibold" : "text-muted-foreground hover:text-foreground")
              }
              onClick={() => setTab("DASHBOARD")}
            >
              Dashboard
            </button>
            <button
              type="button"
              className={
                "px-3 py-1.5 text-sm rounded-lg transition " +
                (tab === "REGISTER" ? "bg-background shadow-sm font-semibold" : "text-muted-foreground hover:text-foreground")
              }
              onClick={() => setTab("REGISTER")}
            >
              Suppliers
            </button>
          </div>
        </div>

        {/* Primary actions */}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => nav("/ap/bills")}>
            <FileText className="h-4 w-4 mr-2" />
            Bills
          </Button>
          <Button variant="outline" onClick={() => nav("/ap/payments")}>
            <Receipt className="h-4 w-4 mr-2" />
            Payments
          </Button>

          {/* ✅ Premium "New Supplier" (opens immediately + updates URL; no 404; works after click) */}
          <Button
            className="gradient-primary shadow-glow text-primary-foreground"
            onClick={() => {
              setTab("REGISTER");
              openNew(); // opens immediately
              nav("/suppliers?open=new", { replace: true }); // keeps URL for share/bookmark
            }}
          >
            <Plus className="h-4 w-4 mr-2" />
            New Supplier
          </Button>
        </div>
      </div>

      {/* DASHBOARD */}
      {tab === "DASHBOARD" ? (
        <>
          {/* KPI Cards */}
          <div className="grid gap-3 md:grid-cols-5">
            <StatCard
              icon={<Landmark className="h-4 w-4 text-muted-foreground" />}
              label="Total Payables"
              value={`Rs ${money(kpisQ.data?.total_payables ?? 0)}`}
              sub="Balance across suppliers"
            />
            <StatCard
              icon={<Receipt className="h-4 w-4 text-muted-foreground" />}
              label="Outstanding"
              value={`Rs ${money(kpisQ.data?.total_outstanding ?? 0)}`}
              sub="Open + partially paid bills"
            />
            <StatCard
              icon={<AlertTriangle className="h-4 w-4 text-amber-700" />}
              label="Overdue"
              value={`Rs ${money(kpisQ.data?.overdue_amount ?? 0)}`}
              sub="Past due_date"
              tone="warn"
            />
            <StatCard
              icon={<ShieldCheck className="h-4 w-4 text-emerald-700" />}
              label="Active Suppliers"
              value={kpisQ.data?.active_suppliers ?? 0}
              sub="Supplier master"
              tone="ok"
            />
            <StatCard
              icon={<Users className="h-4 w-4 text-muted-foreground" />}
              label="Bills Status"
              value={`${kpisQ.data?.open_bills ?? 0} open • ${kpisQ.data?.partial_bills ?? 0} partial`}
              sub={`${kpisQ.data?.paid_bills ?? 0} paid`}
            />
          </div>

          {/* Exposure + Aging */}
          <div className="grid gap-3 lg:grid-cols-2">
            {/* Top exposure suppliers */}
            <Card className="p-4 shadow-premium">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">Top Exposure Suppliers</div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    qc.invalidateQueries({ queryKey: ["apTopExposure"] });
                    qc.invalidateQueries({ queryKey: ["apKpis"] });
                  }}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
              </div>

              <div className="mt-3 space-y-2">
                {topExposureQ.isLoading ? (
                  <div className="text-sm text-muted-foreground py-6">Loading…</div>
                ) : topExposure.length === 0 ? (
                  <div className="text-sm text-muted-foreground py-6">No exposure data (create views + bills/payments).</div>
                ) : (
                  topExposure.map((x) => (
                    <div key={x.supplier_id} className="rounded-xl border bg-muted/10 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-semibold truncate">{x.supplier_name}</div>
                          <div className="text-[11px] text-muted-foreground">
                            Outstanding: <b>Rs {money(x.total_outstanding)}</b>
                            {x.bucket_90_plus > 0 ? (
                              <>
                                {" "}
                                • 90+: <b className="text-amber-700">Rs {money(x.bucket_90_plus)}</b>
                              </>
                            ) : null}
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-sm font-semibold">Rs {money(x.balance)}</div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-2"
                            onClick={() => {
                              const sup: SupplierRow = {
                                id: x.supplier_id,
                                supplier_code: null,
                                name: x.supplier_name,
                                phone: null,
                                email: null,
                                address: null,
                                city: null,
                                country: null,
                                vat_no: null,
                                opening_balance: 0,
                                is_active: true,
                                import_batch_id: null,
                                import_source: null,
                                notes: null,
                                created_at: null,
                                updated_at: null,
                              };
                              openLedger(sup);
                            }}
                          >
                            <BookOpen className="h-4 w-4 mr-2" />
                            Ledger
                          </Button>
                        </div>
                      </div>

                      <div className="mt-3">
                        <MiniBar value={x.balance} max={maxExposure} label="Exposure rank" />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Card>

            {/* Aging summary */}
            <Card className="p-4 shadow-premium">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">Aging Summary</div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setAgingOpen(true)}>
                    View report
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ["apAgingAll"] })}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Refresh
                  </Button>
                </div>
              </div>

              <div className="mt-3 grid gap-3">
                <div className="rounded-xl border bg-muted/10 p-3">
                  <div className="text-[11px] text-muted-foreground">Total Outstanding</div>
                  <div className="text-lg font-semibold">Rs {money(agingSummary.total)}</div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border bg-muted/10 p-3">
                    <div className="flex items-center justify-between">
                      <Badge tone="muted">0–30</Badge>
                      <div className="text-sm font-semibold">Rs {money(agingSummary.b0_30)}</div>
                    </div>
                    <div className="mt-2">
                      <MiniBar value={agingSummary.b0_30} max={maxAgingBucket} />
                    </div>
                  </div>
                  <div className="rounded-xl border bg-muted/10 p-3">
                    <div className="flex items-center justify-between">
                      <Badge tone="warn">31–60</Badge>
                      <div className="text-sm font-semibold">Rs {money(agingSummary.b31_60)}</div>
                    </div>
                    <div className="mt-2">
                      <MiniBar value={agingSummary.b31_60} max={maxAgingBucket} />
                    </div>
                  </div>
                  <div className="rounded-xl border bg-muted/10 p-3">
                    <div className="flex items-center justify-between">
                      <Badge tone="warn">61–90</Badge>
                      <div className="text-sm font-semibold">Rs {money(agingSummary.b61_90)}</div>
                    </div>
                    <div className="mt-2">
                      <MiniBar value={agingSummary.b61_90} max={maxAgingBucket} />
                    </div>
                  </div>
                  <div className="rounded-xl border bg-muted/10 p-3">
                    <div className="flex items-center justify-between">
                      <Badge tone="bad">90+</Badge>
                      <div className="text-sm font-semibold">Rs {money(agingSummary.b90p)}</div>
                    </div>
                    <div className="mt-2">
                      <MiniBar value={agingSummary.b90p} max={maxAgingBucket} />
                    </div>
                  </div>
                </div>

                <div className="text-[11px] text-muted-foreground">
                  Powered by views: <b>v_ap_kpis</b>, <b>v_supplier_aging</b>, <b>v_ap_top_exposure_suppliers</b>,{" "}
                  <b>v_supplier_ledger_lines</b>.
                </div>
              </div>
            </Card>
          </div>
        </>
      ) : null}

      {/* REGISTER */}
      {tab === "REGISTER" ? (
        <>
          {/* Page-level KPI */}
          <div className="grid gap-3 md:grid-cols-5">
            <StatCard
              icon={<Users className="h-4 w-4 text-muted-foreground" />}
              label="In Page"
              value={pageKpis.totalInPage}
              sub={`Page ${page + 1}/${pageCount}`}
            />
            <StatCard icon={<ShieldCheck className="h-4 w-4 text-emerald-700" />} label="Active" value={pageKpis.active} tone="ok" />
            <StatCard icon={<ShieldX className="h-4 w-4 text-red-700" />} label="Inactive" value={pageKpis.inactive} tone="bad" />
            <StatCard
              icon={<Landmark className="h-4 w-4 text-muted-foreground" />}
              label="Opening (page)"
              value={`Rs ${money(pageKpis.sumOpening)}`}
              sub="Current page sum"
            />
            <StatCard
              icon={<AlertTriangle className="h-4 w-4 text-amber-700" />}
              label="Missing VAT"
              value={pageKpis.missingVat}
              sub="Page data quality"
              tone="warn"
            />
          </div>

          {/* Filters */}
          <Card className="p-4 shadow-premium">
            <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto_auto] lg:items-center">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-5 w-5 text-muted-foreground" />
                <Input
                  className="pl-10"
                  placeholder="Search: code, name, email, phone, VAT…"
                  value={qInput}
                  onChange={(e) => setQInput(e.target.value)}
                />
              </div>

              <select
                className="h-10 rounded-md border px-3 bg-background"
                value={status}
                onChange={(e) => setStatus(e.target.value as StatusFilter)}
                title="Status filter"
              >
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
                <option value="ALL">All</option>
              </select>

              <Button
                variant="outline"
                onClick={() => {
                  suppliersQ.refetch();
                  balancesQ.refetch();
                }}
                disabled={suppliersQ.isFetching || balancesQ.isFetching}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                {suppliersQ.isFetching || balancesQ.isFetching ? "Refreshing…" : "Refresh"}
              </Button>

              <Button variant="outline" onClick={exportSuppliersCsvCurrentPage} disabled={!rows.length}>
                <FileDown className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
            </div>

            <div className="mt-2 text-xs text-muted-foreground">
              Total matching: <b>{total}</b> • Page size: <b>{pageSize}</b>
            </div>
          </Card>

          {/* Virtual Register */}
          <Card className="p-0 overflow-hidden shadow-premium">
            <div className="border-b bg-gradient-to-r from-background to-muted/30 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium">
                  Supplier Register{" "}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {suppliersQ.isLoading ? "Loading…" : `${rows.length} row(s) • page ${page + 1}/${pageCount}`}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    size="icon"
                    variant="outline"
                    disabled={page <= 0}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    title="Previous page"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>

                  <Button
                    size="icon"
                    variant="outline"
                    disabled={page >= pageCount - 1}
                    onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                    title="Next page"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Header row */}
            <div className="hidden lg:grid grid-cols-[220px_1.6fr_1.3fr_1.2fr_160px_170px_160px] gap-0 border-b bg-background/80 backdrop-blur px-4 py-2 text-[12px] text-muted-foreground">
              <div>Code / Status</div>
              <div>Supplier</div>
              <div>Contact</div>
              <div>VAT / Address</div>
              <div className="text-right">Opening</div>
              <div className="text-right">Balance</div>
              <div className="text-right">Actions</div>
            </div>

            <div className="px-2 py-2">
              {suppliersQ.isLoading ? (
                <div className="px-4 py-10 text-sm text-muted-foreground">Loading…</div>
              ) : rows.length === 0 ? (
                <div className="px-4 py-10 text-sm text-muted-foreground">No suppliers found.</div>
              ) : (
                <VirtualList
                  items={rows as any[]}
                  height={560}
                  rowHeight={108}
                  overscan={10}
                  renderRow={(r: any, idx: number) => {
                    const loc = [s(r.city), s(r.country)].filter(Boolean).join(", ");
                    const addr = [s(r.address), loc].filter(Boolean).join(" • ");
                    const balance = n0(r._balance);
                    const code = r.supplier_code || `SUP-${String(r.id).padStart(4, "0")}`;

                    return (
                      <div
                        className={
                          "mx-2 my-1 rounded-xl border bg-background hover:bg-muted/30 transition px-3 py-3 " +
                          (idx % 2 === 1 ? "shadow-[0_1px_0_rgba(0,0,0,0.03)]" : "")
                        }
                        onDoubleClick={() => openEdit(r)}
                        title="Double click to edit"
                      >
                        <div className="grid lg:grid-cols-[220px_1.6fr_1.3fr_1.2fr_160px_170px_160px] gap-3 items-start">
                          {/* Code / status */}
                          <div>
                            <div className="font-semibold">{code}</div>
                            <div className="mt-2 flex items-center gap-2">
                              <Badge tone={r.is_active ? "ok" : "bad"}>{r.is_active ? "ACTIVE" : "INACTIVE"}</Badge>
                              <Switch
                                checked={!!r.is_active}
                                onCheckedChange={(v) => activeM.mutate({ id: r.id, active: !!v })}
                                disabled={activeM.isPending}
                              />
                            </div>
                            <div className="mt-2 text-[11px] text-muted-foreground">
                              {r.import_source ? (
                                <>
                                  Source: <b>{r.import_source}</b>
                                </>
                              ) : (
                                "Manual entry"
                              )}
                            </div>
                          </div>

                          {/* Supplier */}
                          <div className="min-w-0">
                            <div className="font-semibold truncate">{r.name}</div>
                            {r.notes ? <div className="mt-1 text-xs text-muted-foreground line-clamp-2">{r.notes}</div> : null}
                            <div className="mt-2 flex flex-wrap gap-2">
                              <Button size="sm" variant="outline" onClick={() => openLedger(r)} className="h-8">
                                <BookOpen className="h-4 w-4 mr-2" />
                                Ledger
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => nav(`/ap/bills?supplier=${r.id}`)} className="h-8">
                                <FileText className="h-4 w-4 mr-2" />
                                Bills
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => nav(`/ap/payments?supplier=${r.id}`)} className="h-8">
                                <Receipt className="h-4 w-4 mr-2" />
                                Pay
                              </Button>
                            </div>
                          </div>

                          {/* Contact */}
                          <div className="text-sm">
                            <div className="text-muted-foreground truncate">{r.email || "—"}</div>
                            <div className="mt-1">{r.phone || "—"}</div>
                          </div>

                          {/* VAT / Address */}
                          <div className="min-w-0">
                            <div className="font-medium">{r.vat_no || "-"}</div>
                            <div className="mt-1 text-xs text-muted-foreground line-clamp-2">{addr || "-"}</div>
                          </div>

                          {/* Opening */}
                          <div className="text-right">
                            <div className="font-semibold">Rs {money(r.opening_balance)}</div>
                            <div className="text-[11px] text-muted-foreground">Opening</div>
                          </div>

                          {/* Balance */}
                          <div className="text-right">
                            <div className={"font-semibold " + (balance > 0 ? "text-rose-700" : "text-foreground")}>
                              Rs {money(balance)}
                            </div>
                            <div className="text-[11px] text-muted-foreground">Auto (views)</div>
                          </div>

                          {/* Actions */}
                          <div className="flex lg:justify-end gap-2">
                            <Button size="sm" variant="outline" className="h-8" onClick={() => openEdit(r)}>
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8"
                              onClick={() => activeM.mutate({ id: r.id, active: !r.is_active })}
                              disabled={activeM.isPending}
                            >
                              {r.is_active ? "Deactivate" : "Activate"}
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  }}
                />
              )}
            </div>

            <div className="border-t px-4 py-3 text-xs text-muted-foreground">
              Server-side pagination: <b>range()</b> + exact <b>count</b> • Ledger & aging use AP views.
            </div>
          </Card>
        </>
      ) : null}

      {/* Create/Edit Supplier Dialog */}
      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);

          // ✅ clean URL when modal closes (prevents re-open on refresh)
          if (!v) {
            if (location.pathname.endsWith("/new") || qsGet(location.search, "open") === "new") {
              nav("/suppliers", { replace: true });
            }
          }
        }}
      >
        <DialogContent className="max-w-lg p-0 overflow-hidden">
          <div className="p-5 border-b bg-gradient-to-r from-background to-muted/20">
            <DialogHeader>
              <DialogTitle className="text-base">{editing ? "Edit Supplier" : "New Supplier"}</DialogTitle>
              <DialogDescription className="text-xs">
                Only <b>Name</b> is required. Phone saved digits-only.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="max-h-[72vh] overflow-auto p-5 space-y-4">
            <div className="rounded-xl border bg-muted/10 p-4 space-y-3">
              <div className="text-[11px] font-semibold text-muted-foreground tracking-wide">ESSENTIALS</div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Supplier Name *</label>
                <Input value={form.name || ""} onChange={(e) => setForm((x) => ({ ...x, name: e.target.value }))} placeholder="ABC Supplies Ltd" />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">VAT No</label>
                  <Input value={form.vat_no || ""} onChange={(e) => setForm((x) => ({ ...x, vat_no: e.target.value }))} placeholder="VAT123456" />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Opening Balance (Rs)</label>
                  <Input
                    inputMode="decimal"
                    value={String(form.opening_balance ?? 0)}
                    onChange={(e) => setForm((x) => ({ ...x, opening_balance: e.target.value as any }))}
                    placeholder="0"
                  />
                </div>

                <div className="flex items-center gap-2 md:col-span-2 pt-1">
                  <Switch checked={!!form.is_active} onCheckedChange={(v) => setForm((x) => ({ ...x, is_active: !!v }))} />
                  <div className="text-sm text-muted-foreground">Active</div>
                </div>
              </div>
            </div>

            <div className="rounded-xl border bg-muted/10 p-4 space-y-3">
              <div className="text-[11px] font-semibold text-muted-foreground tracking-wide">CONTACT</div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Email</label>
                  <Input value={form.email || ""} onChange={(e) => setForm((x) => ({ ...x, email: e.target.value }))} placeholder="accounts@abc.mu" />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Phone</label>
                  <Input
                    inputMode="numeric"
                    value={form.phone || ""}
                    onChange={(e) => setForm((x) => ({ ...x, phone: e.target.value }))}
                    onBlur={() => setForm((x) => ({ ...x, phone: normalizePhone(x.phone) }))}
                    placeholder="52501234"
                  />
                </div>

                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-sm font-medium">Address</label>
                  <Input value={form.address || ""} onChange={(e) => setForm((x) => ({ ...x, address: e.target.value }))} placeholder="Zone Industrielle, Pailles" />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">City</label>
                  <Input value={form.city || ""} onChange={(e) => setForm((x) => ({ ...x, city: e.target.value }))} placeholder="Pailles" />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Country</label>
                  <Input value={form.country || ""} onChange={(e) => setForm((x) => ({ ...x, country: e.target.value }))} placeholder="Mauritius" />
                </div>
              </div>
            </div>

            <div className="rounded-xl border bg-muted/10 p-4 space-y-2">
              <div className="text-[11px] font-semibold text-muted-foreground tracking-wide">NOTES</div>
              <Input
                placeholder="Payment terms, delivery rules, etc."
                value={form.notes || ""}
                onChange={(e) => setForm((x) => ({ ...x, notes: e.target.value }))}
              />
            </div>
          </div>

          <div className="p-4 border-t bg-background flex items-center justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>

            <Button className="gradient-primary shadow-glow text-primary-foreground" onClick={saveSupplier} disabled={createM.isPending || updateM.isPending}>
              {editing ? (updateM.isPending ? "Saving…" : "Save Changes") : createM.isPending ? "Creating…" : "Create Supplier"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Ledger + Aging Popup */}
      <Dialog open={ledgerOpen} onOpenChange={setLedgerOpen}>
        <DialogContent className="w-[96vw] max-w-4xl p-0 overflow-hidden">
          <div className="p-5 border-b bg-gradient-to-r from-background to-muted/20">
            <div className="flex items-start justify-between gap-3">
              <div>
                <DialogHeader>
                  <DialogTitle className="text-base">Supplier Ledger</DialogTitle>
                  <DialogDescription className="text-xs">
                    {ledgerSupplier ? (
                      <>
                        <b>{ledgerSupplier.name}</b> • ID {ledgerSupplier.id}
                      </>
                    ) : (
                      "—"
                    )}
                  </DialogDescription>
                </DialogHeader>
              </div>
              <Button variant="outline" size="icon" onClick={() => setLedgerOpen(false)} title="Close">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="p-5 space-y-4 max-h-[78vh] overflow-auto">
            {/* Aging cards (supplier) */}
            <div className="grid gap-3 md:grid-cols-5">
              <StatCard
                icon={<Landmark className="h-4 w-4 text-muted-foreground" />}
                label="Total Outstanding"
                value={`Rs ${money(supplierAgingQ.data?.total_outstanding ?? 0)}`}
                sub="From aging view"
              />
              <StatCard label="0–30" value={`Rs ${money(supplierAgingQ.data?.bucket_0_30 ?? 0)}`} icon={<span />} />
              <StatCard label="31–60" value={`Rs ${money(supplierAgingQ.data?.bucket_31_60 ?? 0)}`} icon={<span />} />
              <StatCard label="61–90" value={`Rs ${money(supplierAgingQ.data?.bucket_61_90 ?? 0)}`} icon={<span />} />
              <StatCard label="90+" value={`Rs ${money(supplierAgingQ.data?.bucket_90_plus ?? 0)}`} icon={<span />} tone="warn" />
            </div>

            {/* Ledger table */}
            <Card className="p-0 overflow-hidden shadow-premium">
              <div className="border-b bg-gradient-to-r from-background to-muted/30 px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">Ledger Lines</div>
                  <Button variant="outline" size="sm" onClick={() => ledgerQ.refetch()} disabled={ledgerQ.isFetching}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    {ledgerQ.isFetching ? "Refreshing…" : "Refresh"}
                  </Button>
                </div>
              </div>

              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-background border-b">
                    <tr>
                      <th className="px-4 py-3 text-left">Date</th>
                      <th className="px-4 py-3 text-left">Type</th>
                      <th className="px-4 py-3 text-left">Reference</th>
                      <th className="px-4 py-3 text-left">Status</th>
                      <th className="px-4 py-3 text-right">Debit</th>
                      <th className="px-4 py-3 text-right">Credit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {ledgerQ.isLoading ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-10 text-muted-foreground">
                          Loading ledger…
                        </td>
                      </tr>
                    ) : (ledgerQ.data || []).length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-10 text-muted-foreground">
                          No ledger lines (create bills / payments).
                        </td>
                      </tr>
                    ) : (
                      (ledgerQ.data || []).map((l, i) => (
                        <tr key={`${l.txn_type}-${l.txn_id}-${i}`} className="hover:bg-muted/30">
                          <td className="px-4 py-3">{l.txn_date}</td>
                          <td className="px-4 py-3">
                            <Badge tone={l.txn_type === "BILL" ? "warn" : "ok"}>{l.txn_type}</Badge>
                          </td>
                          <td className="px-4 py-3 font-medium">{l.reference}</td>
                          <td className="px-4 py-3 text-muted-foreground">{l.status || "—"}</td>
                          <td className="px-4 py-3 text-right font-semibold">Rs {money(l.debit)}</td>
                          <td className="px-4 py-3 text-right font-semibold">Rs {money(l.credit)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="border-t px-4 py-3 text-xs text-muted-foreground">
                Ledger stream from view <b>v_supplier_ledger_lines</b> (Bills + Payments).
              </div>
            </Card>
          </div>
        </DialogContent>
      </Dialog>

      {/* Aging Report Popup (global) */}
      <Dialog open={agingOpen} onOpenChange={setAgingOpen}>
        <DialogContent className="w-[96vw] max-w-5xl p-0 overflow-hidden">
          <div className="p-5 border-b bg-gradient-to-r from-background to-muted/20">
            <DialogHeader>
              <DialogTitle className="text-base">Aging Report (All Suppliers)</DialogTitle>
              <DialogDescription className="text-xs">
                Top suppliers by outstanding • Powered by <b>v_supplier_aging</b>
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="p-5 max-h-[78vh] overflow-auto space-y-4">
            <div className="grid gap-3 md:grid-cols-5">
              <StatCard icon={<Landmark className="h-4 w-4 text-muted-foreground" />} label="Total" value={`Rs ${money(agingSummary.total)}`} sub="Outstanding" />
              <StatCard label="0–30" value={`Rs ${money(agingSummary.b0_30)}`} icon={<span />} />
              <StatCard label="31–60" value={`Rs ${money(agingSummary.b31_60)}`} icon={<span />} />
              <StatCard label="61–90" value={`Rs ${money(agingSummary.b61_90)}`} icon={<span />} />
              <StatCard label="90+" value={`Rs ${money(agingSummary.b90p)}`} icon={<span />} tone="warn" />
            </div>

            <Card className="p-0 overflow-hidden shadow-premium">
              <div className="border-b bg-gradient-to-r from-background to-muted/30 px-4 py-3 flex items-center justify-between">
                <div className="text-sm font-semibold">Top Outstanding (Aging)</div>
                <Button variant="outline" size="sm" onClick={() => agingAllQ.refetch()} disabled={agingAllQ.isFetching}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  {agingAllQ.isFetching ? "Refreshing…" : "Refresh"}
                </Button>
              </div>

              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-background border-b">
                    <tr>
                      <th className="px-4 py-3 text-left">Supplier</th>
                      <th className="px-4 py-3 text-right">Total</th>
                      <th className="px-4 py-3 text-right">0–30</th>
                      <th className="px-4 py-3 text-right">31–60</th>
                      <th className="px-4 py-3 text-right">61–90</th>
                      <th className="px-4 py-3 text-right">90+</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {agingAllQ.isLoading ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-10 text-muted-foreground">
                          Loading…
                        </td>
                      </tr>
                    ) : (agingAllQ.data || []).length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-10 text-muted-foreground">
                          No aging rows.
                        </td>
                      </tr>
                    ) : (
                      (agingAllQ.data || []).slice(0, 50).map((r) => (
                        <tr key={r.supplier_id} className="hover:bg-muted/30">
                          <td className="px-4 py-3 font-medium">{r.supplier_name}</td>
                          <td className="px-4 py-3 text-right font-semibold">Rs {money(r.total_outstanding)}</td>
                          <td className="px-4 py-3 text-right">Rs {money(r.bucket_0_30)}</td>
                          <td className="px-4 py-3 text-right">Rs {money(r.bucket_31_60)}</td>
                          <td className="px-4 py-3 text-right">Rs {money(r.bucket_61_90)}</td>
                          <td className="px-4 py-3 text-right font-semibold text-amber-800">Rs {money(r.bucket_90_plus)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="border-t px-4 py-3 text-xs text-muted-foreground">
                Showing top 50 suppliers by outstanding. Increase limit in query if needed.
              </div>
            </Card>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
