import React, { useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { toast } from "sonner";
import * as XLSX from "xlsx";
import {
  MoreHorizontal,
  Mail,
  Phone,
  FileDown,
  FileUp,
  Download,
  Plus,
  RefreshCw,
  Receipt,
  FileText,
  BookOpen,
} from "lucide-react";

/* =========================
   Types
========================= */
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

/* =========================
   Helpers
========================= */
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
function uid() {
  try {
    return crypto.randomUUID();
  } catch {
    return String(Date.now()) + "-" + Math.random().toString(16).slice(2);
  }
}
function qsGet(search: string, key: string) {
  try {
    return new URLSearchParams(search).get(key);
  } catch {
    return null;
  }
}

/* =========================
   DB
========================= */
async function listSuppliers(args: { q?: string; status?: StatusFilter; limit?: number }) {
  const q = (args.q || "").trim();
  const status = args.status ?? "ACTIVE";
  const limit = args.limit ?? 1000;

  let query = supabase
    .from("suppliers")
    .select(
      "id,supplier_code,name,phone,email,address,city,country,vat_no,opening_balance,is_active,import_batch_id,import_source,notes,created_at,updated_at"
    )
    .order("name", { ascending: true })
    .limit(limit);

  if (status === "ACTIVE") query = query.eq("is_active", true);
  if (status === "INACTIVE") query = query.eq("is_active", false);

  if (q) {
    const sQ = q.replaceAll(",", " ");
    query = query.or(
      `name.ilike.%${sQ}%,supplier_code.ilike.%${sQ}%,email.ilike.%${sQ}%,phone.ilike.%${sQ}%,vat_no.ilike.%${sQ}%`
    );
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as SupplierRow[];
}

async function listSupplierBalances() {
  const { data, error } = await supabase.from("v_supplier_balances").select("supplier_id,balance");
  if (error) throw error;
  const map = new Map<number, number>();
  for (const r of data || []) map.set(Number((r as any).supplier_id), n0((r as any).balance));
  return map;
}

async function createSupplier(payload: SupplierUpsert) {
  const row: any = {
    name: s(payload.name),
    phone: s(payload.phone) || null,
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
  const row: any = {
    name: s(payload.name),
    phone: s(payload.phone) || null,
    email: s(payload.email) || null,
    address: s(payload.address) || null,

    city: s(payload.city) || null,
    country: s(payload.country) || null,
    vat_no: s(payload.vat_no) || null,

    opening_balance: n0(payload.opening_balance),
    is_active: payload.is_active ?? true,

    notes: s(payload.notes) || null,
    updated_at: new Date().toISOString(),
  };

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

/* =========================
   Excel
========================= */
function downloadTemplateXlsx() {
  const sheetRows = [
    {
      name: "ABC Supplies Ltd",
      email: "accounts@abc.mu",
      phone: "52501234",
      address: "Zone Industrielle, Pailles",
      city: "Pailles",
      country: "Mauritius",
      vat_no: "VAT123456",
      opening_balance: 25000.0,
      is_active: "TRUE",
      notes: "Optional notes",
    },
  ];

  const ws = XLSX.utils.json_to_sheet(sheetRows);
  ws["!cols"] = [
    { wch: 26 },
    { wch: 26 },
    { wch: 14 },
    { wch: 34 },
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
    { wch: 10 },
    { wch: 28 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "SuppliersTemplate");
  XLSX.writeFile(wb, "suppliers-import-template.xlsx");
}

function parseBool(v: any, def = true) {
  if (typeof v === "boolean") return v;
  const t = String(v ?? "").trim().toLowerCase();
  if (!t) return def;
  if (["1", "true", "yes", "y", "active"].includes(t)) return true;
  if (["0", "false", "no", "n", "inactive"].includes(t)) return false;
  return def;
}
type ExcelRowAny = Record<string, any>;
function pick(r: ExcelRowAny, keys: string[]) {
  for (const k of keys) if (r[k] !== undefined) return r[k];
  return undefined;
}
function normalizeExcelRow(r: ExcelRowAny): SupplierUpsert {
  return {
    name: s(pick(r, ["name", "Name", "Supplier", "Supplier Name"]) ?? ""),
    email: s(pick(r, ["email", "Email"]) ?? "") || null,
    phone: s(pick(r, ["phone", "Phone", "Mobile"]) ?? "") || null,
    address: s(pick(r, ["address", "Address"]) ?? "") || null,
    city: s(pick(r, ["city", "City"]) ?? "") || null,
    country: s(pick(r, ["country", "Country"]) ?? "") || null,
    vat_no: s(pick(r, ["vat_no", "VAT No", "VAT", "VAT Number"]) ?? "") || null,
    opening_balance: n0(pick(r, ["opening_balance", "Opening Balance", "opening"]) ?? 0),
    is_active: parseBool(pick(r, ["is_active", "Active", "Status"]), true),
    notes: s(pick(r, ["notes", "Notes"]) ?? "") || null,
  };
}

/* =========================
   Page
========================= */
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

  const jumpTo = qsGet(location.search, "open"); // optional e.g. ?open=new
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StatusFilter>("ACTIVE");

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SupplierRow | null>(null);
  const [form, setForm] = useState<SupplierUpsert>(emptyForm);

  const fileRef = useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    const t = window.setTimeout(() => setQ(qInput.trim()), 200);
    return () => window.clearTimeout(t);
  }, [qInput]);

  const suppliersQ = useQuery({
    queryKey: ["suppliers", q, status],
    queryFn: () => listSuppliers({ q, status, limit: 5000 }),
    staleTime: 15_000,
  });

  const balancesQ = useQuery({
    queryKey: ["supplier-balances"],
    queryFn: listSupplierBalances,
    staleTime: 15_000,
  });

  const rowsRaw = suppliersQ.data || [];
  const balanceMap = balancesQ.data || new Map<number, number>();

  const rows = useMemo(() => {
    return rowsRaw.map((r) => ({
      ...r,
      _balance: balanceMap.get(r.id) ?? (n0(r.opening_balance) || 0),
    }));
  }, [rowsRaw, balanceMap]);

  const kpis = useMemo(() => {
    const total = rows.length;
    const active = rows.filter((r) => !!r.is_active).length;
    const sumOpening = rows.reduce((s0, r) => s0 + n0(r.opening_balance), 0);
    const sumBalance = rows.reduce((s0, r) => s0 + n0((r as any)._balance), 0);
    const missingVat = rows.filter((r) => !s(r.vat_no)).length;
    return { total, active, sumOpening, sumBalance, missingVat };
  }, [rows]);

  const createM = useMutation({
    mutationFn: (payload: SupplierUpsert) => createSupplier(payload),
    onSuccess: async () => {
      toast.success("Supplier created");
      await qc.invalidateQueries({ queryKey: ["suppliers"] });
      await qc.invalidateQueries({ queryKey: ["supplier-balances"] });
      setOpen(false);
    },
    onError: (e: any) => toast.error(e?.message || "Failed to create supplier"),
  });

  const updateM = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: SupplierUpsert }) => updateSupplier(id, payload),
    onSuccess: async () => {
      toast.success("Supplier updated");
      await qc.invalidateQueries({ queryKey: ["suppliers"] });
      await qc.invalidateQueries({ queryKey: ["supplier-balances"] });
      setOpen(false);
    },
    onError: (e: any) => toast.error(e?.message || "Failed to update supplier"),
  });

  const activeM = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) => setSupplierActive(id, active),
    onSuccess: async ({ is_active }) => {
      toast.success(is_active ? "Supplier activated" : "Supplier deactivated");
      await qc.invalidateQueries({ queryKey: ["suppliers"] });
    },
    onError: (e: any) => toast.error(e?.message || "Failed"),
  });

  React.useEffect(() => {
    if (jumpTo === "new") openNew();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  async function save() {
    if (!s(form.name)) return toast.error("Supplier name is required");
    if (editing) return updateM.mutate({ id: editing.id, payload: form });
    return createM.mutate(form);
  }

  function exportExcel() {
    const data = rows.map((r: any) => ({
      supplier_code: r.supplier_code || "",
      name: r.name,
      email: r.email || "",
      phone: r.phone || "",
      address: r.address || "",
      city: r.city || "",
      country: r.country || "",
      vat_no: r.vat_no || "",
      opening_balance: n0(r.opening_balance),
      balance: n0(r._balance),
      is_active: r.is_active ? "TRUE" : "FALSE",
      notes: r.notes || "",
      import_batch_id: r.import_batch_id || "",
      import_source: r.import_source || "",
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [
      { wch: 12 },
      { wch: 26 },
      { wch: 26 },
      { wch: 14 },
      { wch: 34 },
      { wch: 16 },
      { wch: 16 },
      { wch: 16 },
      { wch: 16 },
      { wch: 16 },
      { wch: 10 },
      { wch: 28 },
      { wch: 38 },
      { wch: 14 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Suppliers");
    XLSX.writeFile(wb, "suppliers.xlsx");
    toast.success("Exported suppliers.xlsx");
  }

  async function importExcel(file: File) {
    const batchId = uid();

    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheetName = wb.SheetNames?.[0];
      if (!sheetName) throw new Error("No sheet found");

      const ws = wb.Sheets[sheetName];
      const json = XLSX.utils.sheet_to_json<any>(ws, { defval: "" });
      if (!json.length) return toast.error("Excel is empty");

      // Match strategy: name + vat_no + email (ERP-safe)
      const existing = rowsRaw.slice();
      const byKey = new Map<string, SupplierRow>();
      for (const r of existing) {
        const key = [s(r.name).toLowerCase(), s(r.vat_no).toLowerCase(), s(r.email).toLowerCase()].join("|");
        byKey.set(key, r);
      }

      let created = 0;
      let updated = 0;
      let skipped = 0;

      for (const raw of json) {
        const payload = normalizeExcelRow(raw);
        if (!s(payload.name)) {
          skipped++;
          continue;
        }

        payload.import_batch_id = batchId;
        payload.import_source = "excel";

        const key = [s(payload.name).toLowerCase(), s(payload.vat_no).toLowerCase(), s(payload.email).toLowerCase()].join(
          "|"
        );
        const hit = byKey.get(key);

        if (hit) {
          await updateSupplier(hit.id, payload);
          updated++;
        } else {
          await createSupplier(payload);
          created++;
        }
      }

      await qc.invalidateQueries({ queryKey: ["suppliers"] });
      await qc.invalidateQueries({ queryKey: ["supplier-balances"] });

      toast.success(`Import done: ${created} created, ${updated} updated, ${skipped} skipped`);
      toast.message(`import_batch_id: ${batchId}`, { description: "Use it to audit/rollback this Excel batch." });
    } catch (e: any) {
      toast.error(e?.message || "Import failed");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-2xl font-semibold tracking-tight">Suppliers</div>
          <div className="text-sm text-muted-foreground">
            Vendor register • AP ledger • Real balance (Opening + Bills − Payments)
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importExcel(f);
            }}
          />

          <Button variant="outline" onClick={downloadTemplateXlsx}>
            <Download className="h-4 w-4 mr-2" />
            Template
          </Button>

          <Button variant="outline" onClick={() => fileRef.current?.click()}>
            <FileUp className="h-4 w-4 mr-2" />
            Import
          </Button>

          <Button variant="outline" onClick={exportExcel} disabled={!rows.length}>
            <FileDown className="h-4 w-4 mr-2" />
            Export
          </Button>

          <Button variant="outline" onClick={() => nav("/ap/bills")}>
            <FileText className="h-4 w-4 mr-2" />
            Bills
          </Button>

          <Button variant="outline" onClick={() => nav("/ap/payments")}>
            <Receipt className="h-4 w-4 mr-2" />
            Payments
          </Button>

          <Button className="gradient-primary shadow-glow text-primary-foreground" onClick={openNew}>
            <Plus className="h-4 w-4 mr-2" />
            New Supplier
          </Button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4 shadow-premium">
          <div className="text-xs text-muted-foreground">Suppliers</div>
          <div className="mt-1 text-xl font-semibold">{kpis.total}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            Active in view: <b>{kpis.active}</b>
          </div>
        </Card>

        <Card className="p-4 shadow-premium">
          <div className="text-xs text-muted-foreground">Opening Payables</div>
          <div className="mt-1 text-xl font-semibold">Rs {money(kpis.sumOpening)}</div>
          <div className="mt-1 text-xs text-muted-foreground">Supplier master opening balances</div>
        </Card>

        <Card className="p-4 shadow-premium">
          <div className="text-xs text-muted-foreground">Real AP Balance</div>
          <div className="mt-1 text-xl font-semibold">Rs {money(kpis.sumBalance)}</div>
          <div className="mt-1 text-xs text-muted-foreground">Opening + Bills − Payments</div>
        </Card>

        <Card className="p-4 shadow-premium">
          <div className="text-xs text-muted-foreground">Data Quality</div>
          <div className="mt-1 text-xl font-semibold">{kpis.missingVat}</div>
          <div className="mt-1 text-xs text-muted-foreground">Missing VAT No</div>
        </Card>
      </div>

      {/* Filters */}
      <Card className="p-4 shadow-premium">
        <div className="grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-center">
          <Input placeholder="Search code / name / email / phone / VAT…" value={qInput} onChange={(e) => setQInput(e.target.value)} />

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
            {suppliersQ.isFetching || balancesQ.isFetching ? "Refreshing..." : "Refresh"}
          </Button>
        </div>
      </Card>

      {/* Register */}
      <Card className="p-0 overflow-hidden shadow-premium">
        <div className="border-b bg-gradient-to-r from-background to-muted/30 px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">
              Supplier Register
              <span className="ml-2 text-xs text-muted-foreground">
                {suppliersQ.isLoading ? "Loading…" : `${rows.length} supplier(s)`}
              </span>
            </div>
            <div className="text-xs text-muted-foreground">Double-click row to edit • Balance is auto from ledger</div>
          </div>
        </div>

        <div className="overflow-auto">
          <table className="w-full min-w-[1250px] text-sm">
            <colgroup>
              <col style={{ width: "13%" }} />
              <col style={{ width: "23%" }} />
              <col style={{ width: "20%" }} />
              <col style={{ width: "18%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "5%" }} />
            </colgroup>

            <thead className="sticky top-0 z-10 bg-background/90 backdrop-blur border-b">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Code</th>
                <th className="px-4 py-3 text-left font-semibold">Supplier</th>
                <th className="px-4 py-3 text-left font-semibold">Contact</th>
                <th className="px-4 py-3 text-left font-semibold">VAT / Address</th>
                <th className="px-4 py-3 text-right font-semibold">Opening</th>
                <th className="px-4 py-3 text-right font-semibold">Balance</th>
                <th className="px-3 py-3 text-right font-semibold"></th>
              </tr>
            </thead>

            <tbody className="divide-y">
              {!suppliersQ.isLoading &&
                rows.map((r: any) => {
                  const loc = [s(r.city), s(r.country)].filter(Boolean).join(", ");
                  const addr = [s(r.address), loc].filter(Boolean).join(" • ");
                  const balance = n0(r._balance);

                  return (
                    <tr
                      key={r.id}
                      className="hover:bg-muted/30"
                      onDoubleClick={() => openEdit(r)}
                      title="Double-click to edit"
                    >
                      <td className="px-4 py-4 align-top">
                        <div className="font-semibold">{r.supplier_code || `SUP-${String(r.id).padStart(4, "0")}`}</div>
                        <div className="mt-1 text-xs text-muted-foreground">#{r.id}</div>
                      </td>

                      <td className="px-4 py-4 align-top">
                        <div className="flex items-center gap-2">
                          <div className="font-semibold">{r.name}</div>
                          {!r.is_active ? (
                            <span className="text-[11px] rounded-full px-2 py-0.5 border bg-muted text-muted-foreground">
                              Inactive
                            </span>
                          ) : (
                            <span className="text-[11px] rounded-full px-2 py-0.5 border bg-emerald-500/10 text-emerald-700">
                              Active
                            </span>
                          )}
                        </div>

                        <div className="mt-1 text-xs text-muted-foreground">
                          {r.import_source ? (
                            <>
                              Source: <b>{r.import_source}</b>
                            </>
                          ) : (
                            "Manual entry"
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-4 align-top">
                        <div className="space-y-1">
                          {r.email ? (
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Mail className="h-4 w-4" />
                              <span className="truncate">{r.email}</span>
                            </div>
                          ) : (
                            <div className="text-xs text-muted-foreground">No email</div>
                          )}

                          {r.phone ? (
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Phone className="h-4 w-4" />
                              <span>{r.phone}</span>
                            </div>
                          ) : (
                            <div className="text-xs text-muted-foreground">No phone</div>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-4 align-top">
                        <div className="font-medium">{r.vat_no || "-"}</div>
                        <div className="mt-1 text-xs text-muted-foreground line-clamp-2">{addr || "-"}</div>
                        {r.notes ? <div className="mt-2 text-xs text-muted-foreground line-clamp-2">{r.notes}</div> : null}
                      </td>

                      <td className="px-4 py-4 align-top text-right">
                        <div className="font-semibold">Rs {money(r.opening_balance)}</div>
                      </td>

                      <td className="px-4 py-4 align-top text-right">
                        <div className={"font-semibold " + (balance > 0 ? "text-rose-700" : "text-slate-900")}>
                          Rs {money(balance)}
                        </div>
                        <div className="text-xs text-muted-foreground">Auto</div>
                      </td>

                      <td className="px-3 py-3 align-top text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              className="h-9 w-9 inline-flex items-center justify-center rounded-full border bg-background hover:bg-muted/40"
                              aria-label="Actions"
                            >
                              <MoreHorizontal className="h-5 w-5 text-muted-foreground" />
                            </button>
                          </DropdownMenuTrigger>

                          <DropdownMenuContent align="end" className="w-60">
                            <DropdownMenuItem onClick={() => openEdit(r)}>Edit</DropdownMenuItem>

                            <DropdownMenuSeparator />

                            <DropdownMenuItem onClick={() => nav(`/ap/bills?supplier=${r.id}`)}>
                              <FileText className="h-4 w-4 mr-2" />
                              Open Bills
                            </DropdownMenuItem>

                            <DropdownMenuItem onClick={() => nav(`/ap/payments?supplier=${r.id}`)}>
                              <Receipt className="h-4 w-4 mr-2" />
                              Record Payment
                            </DropdownMenuItem>

                            <DropdownMenuItem onClick={() => nav(`/ap/ledger?supplier=${r.id}`)}>
                              <BookOpen className="h-4 w-4 mr-2" />
                              View Ledger (next)
                            </DropdownMenuItem>

                            <DropdownMenuSeparator />

                            {r.phone ? (
                              <DropdownMenuItem onClick={() => window.open(`tel:${r.phone}`, "_self")}>Call</DropdownMenuItem>
                            ) : null}

                            {r.email ? (
                              <DropdownMenuItem onClick={() => window.open(`mailto:${r.email}`, "_self")}>Email</DropdownMenuItem>
                            ) : null}

                            <DropdownMenuSeparator />

                            <DropdownMenuItem
                              onClick={() => activeM.mutate({ id: r.id, active: !r.is_active })}
                              disabled={activeM.isPending}
                            >
                              {r.is_active ? "Deactivate" : "Activate"}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}

              {!suppliersQ.isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-muted-foreground">
                    No suppliers found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="border-t px-4 py-3 text-xs text-muted-foreground">
          Balance = opening_balance + sum(bills total) − sum(payments). (VOID bills excluded)
        </div>
      </Card>

      {/* Create/Edit Dialog (smaller desktop size) */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[680px]">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Supplier" : "New Supplier"}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4">
            <Card className="p-4 shadow-premium">
              <div className="text-sm font-semibold">Identity</div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground">Supplier Name *</div>
                  <Input value={form.name || ""} onChange={(e) => setForm((x) => ({ ...x, name: e.target.value }))} />
                </div>

                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground">VAT No</div>
                  <Input value={form.vat_no || ""} onChange={(e) => setForm((x) => ({ ...x, vat_no: e.target.value }))} />
                </div>
              </div>
            </Card>

            <Card className="p-4 shadow-premium">
              <div className="text-sm font-semibold">Contact</div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground">Email</div>
                  <Input value={form.email || ""} onChange={(e) => setForm((x) => ({ ...x, email: e.target.value }))} />
                </div>

                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground">Phone</div>
                  <Input value={form.phone || ""} onChange={(e) => setForm((x) => ({ ...x, phone: e.target.value }))} />
                </div>
              </div>
            </Card>

            <Card className="p-4 shadow-premium">
              <div className="text-sm font-semibold">Address</div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <div className="text-xs text-muted-foreground">Address</div>
                  <Input value={form.address || ""} onChange={(e) => setForm((x) => ({ ...x, address: e.target.value }))} />
                </div>

                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground">City</div>
                  <Input value={form.city || ""} onChange={(e) => setForm((x) => ({ ...x, city: e.target.value }))} />
                </div>

                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground">Country</div>
                  <Input value={form.country || ""} onChange={(e) => setForm((x) => ({ ...x, country: e.target.value }))} />
                </div>
              </div>
            </Card>

            <Card className="p-4 shadow-premium">
              <div className="text-sm font-semibold">Finance</div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground">Opening Balance (Payable)</div>
                  <Input
                    inputMode="decimal"
                    value={String(form.opening_balance ?? 0)}
                    onChange={(e) => setForm((x) => ({ ...x, opening_balance: e.target.value as any }))}
                  />
                </div>

                <div className="flex items-center gap-3 md:pt-6">
                  <Switch checked={!!form.is_active} onCheckedChange={(v) => setForm((x) => ({ ...x, is_active: !!v }))} />
                  <div className="text-sm text-muted-foreground">Active</div>
                </div>
              </div>
            </Card>

            <Card className="p-4 shadow-premium">
              <div className="text-sm font-semibold">Notes</div>
              <div className="mt-3">
                <Input
                  placeholder="Optional notes (delivery rules, payment terms, etc.)"
                  value={form.notes || ""}
                  onChange={(e) => setForm((x) => ({ ...x, notes: e.target.value }))}
                />
              </div>
            </Card>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>

            <Button
              className="gradient-primary shadow-glow text-primary-foreground"
              onClick={save}
              disabled={createM.isPending || updateM.isPending}
            >
              {editing ? (updateM.isPending ? "Saving..." : "Save Changes") : createM.isPending ? "Creating..." : "Create Supplier"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
