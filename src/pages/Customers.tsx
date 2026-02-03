// src/pages/Customers.tsx
import React, { useMemo, useRef, useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import type { Customer, CustomerUpsert } from "@/types/customer";
import { createCustomer, listCustomers, setCustomerActive, updateCustomer } from "@/lib/customers";
import { supabase } from "@/integrations/supabase/client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
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
import { MoreHorizontal, FileText, Plus, MessageCircle, BookOpen, Upload, Download, Undo2 } from "lucide-react";

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
function clampPct(v: any) {
  const x = n0(v);
  return Math.max(0, Math.min(100, x));
}
function normalizePhone(v: any) {
  return String(v ?? "").replace(/[^\d]/g, "");
}
function uid() {
  try {
    return crypto.randomUUID();
  } catch {
    return String(Date.now()) + "-" + Math.random().toString(16).slice(2);
  }
}
function pick(row: Record<string, any>, keys: string[]) {
  for (const k of keys) if (row[k] !== undefined) return row[k];
  return undefined;
}
function normalizeExcelRow(row: Record<string, any>): CustomerUpsert {
  // Required format:
  // customer_code	name	address	phone	brn	vat_no	whatsapp	discount%
  // Optional:
  // opening_balance, email
  const customer_code = s(pick(row, ["customer_code", "Customer Code", "CUSTOMER_CODE", "Code", "code"]) ?? "");
  const name = s(pick(row, ["name", "Name", "NAME", "Customer Name", "customer_name"]) ?? "");
  const address = s(pick(row, ["address", "Address", "ADDRESS"]) ?? "");
  const phone = normalizePhone(pick(row, ["phone", "Phone", "PHONE"]) ?? "");
  const brn = s(pick(row, ["brn", "BRN", "Brn"]) ?? "");
  const vat_no = s(pick(row, ["vat_no", "VAT No", "VAT", "vat", "Vat No"]) ?? "");
  const whatsapp = normalizePhone(pick(row, ["whatsapp", "WhatsApp", "WHATSAPP", "wa"]) ?? "");
  const discount_percent = clampPct(
    pick(row, ["discount%", "discount_percent", "Discount%", "Discount %", "DISCOUNT", "discount"]) ?? 0
  );

  const opening_balance = n0(pick(row, ["opening_balance", "Opening Balance", "opening", "Opening"]) ?? 0);
  const email = s(pick(row, ["email", "Email", "EMAIL"]) ?? "");

  return {
    name,
    customer_code: customer_code || "",
    address,
    phone,
    brn,
    vat_no,
    whatsapp,
    discount_percent,
    opening_balance,
    email,
    client_name: "",
    is_active: true,
  } as any;
}

function downloadTemplateXlsx() {
  const sheetRows = [
    {
      customer_code: "CUST-001",
      name: "Sample Customer",
      address: "Port Louis, Mauritius",
      phone: "57551234",
      brn: "C12345678",
      vat_no: "VAT123456",
      whatsapp: "57551234",
      "discount%": 5,
      opening_balance: 0,
      email: "customer@example.com",
    },
  ];

  const ws = XLSX.utils.json_to_sheet(sheetRows);
  ws["!cols"] = [
    { wch: 16 }, // customer_code
    { wch: 28 }, // name
    { wch: 36 }, // address
    { wch: 14 }, // phone
    { wch: 14 }, // brn
    { wch: 14 }, // vat_no
    { wch: 14 }, // whatsapp
    { wch: 10 }, // discount%
    { wch: 16 }, // opening_balance
    { wch: 26 }, // email
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "CustomersTemplate");
  XLSX.writeFile(wb, "customers-import-template.xlsx");
}

function waLink(to: string, text: string) {
  const phone = normalizePhone(to);
  if (!phone) return "";
  const withCountry = phone.length === 8 ? `230${phone}` : phone;
  return `https://wa.me/${withCountry}?text=${encodeURIComponent(text)}`;
}

type ActiveFilter = "ACTIVE" | "INACTIVE" | "ALL";

const emptyForm: CustomerUpsert = {
  name: "",
  phone: "",
  whatsapp: "",
  email: "",
  address: "",
  customer_code: "",
  opening_balance: 0,
  discount_percent: 0,
  vat_no: "",
  brn: "",
  client_name: "",
  is_active: true,
  whatsapp_template_invoice: "",
  whatsapp_template_statement: "",
  whatsapp_template_overdue: "",
} as any;

/* =========================
   Page
========================= */
export default function Customers() {
  const nav = useNavigate();
  const qc = useQueryClient();

  const [q, setQ] = useState("");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("ACTIVE");

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState<CustomerUpsert>(emptyForm);

  const fileRef = useRef<HTMLInputElement | null>(null);

  // last import batch (for rollback convenience)
  const [lastBatchId, setLastBatchId] = useState<string>("");

  const key = useMemo(() => ["customers", { q, activeFilter }], [q, activeFilter]);

  const customersQ = useQuery({
    queryKey: key,
    queryFn: async () => {
      const activeOnly = activeFilter === "ACTIVE";
      const rows = await listCustomers({ q, activeOnly, limit: 5000 });

      // If INACTIVE, filter client-side (since listCustomers only supports activeOnly)
      if (activeFilter === "INACTIVE") return (rows || []).filter((r: any) => !r.is_active);

      // ALL: we need both active + inactive
      if (activeFilter === "ALL") {
        const active = await listCustomers({ q, activeOnly: true, limit: 5000 });
        const inactive = (await listCustomers({ q, activeOnly: false, limit: 5000 })) || [];
        // listCustomers(activeOnly:false) likely returns all; if it does, return directly.
        // But to be safe, merge unique by id.
        const map = new Map<number, any>();
        [...(active || []), ...(inactive || [])].forEach((c: any) => map.set(c.id, c));
        return Array.from(map.values());
      }

      return rows;
    },
    staleTime: 20_000,
  });

  const rows = (customersQ.data || []) as Customer[];

  // Find last batch id (best-effort, non-blocking)
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from("customers")
          .select("import_batch_id,updated_at")
          .not("import_batch_id", "is", null)
          .order("updated_at", { ascending: false })
          .limit(1);

        const id = data?.[0]?.import_batch_id;
        if (id) setLastBatchId(String(id));
      } catch {
        // ignore
      }
    })();
  }, []);

  const createM = useMutation({
    mutationFn: (payload: CustomerUpsert) => createCustomer(payload),
    onSuccess: () => {
      toast.success("Customer created");
      qc.invalidateQueries({ queryKey: ["customers"], exact: false });
      setOpen(false);
    },
    onError: (e: any) => toast.error(e?.message || "Failed to create customer"),
  });

  const updateM = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: CustomerUpsert }) => updateCustomer(id, payload),
    onSuccess: () => {
      toast.success("Customer updated");
      qc.invalidateQueries({ queryKey: ["customers"], exact: false });
      setOpen(false);
    },
    onError: (e: any) => toast.error(e?.message || "Failed to update customer"),
  });

  const activeM = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) => setCustomerActive(id, active),
    onSuccess: ({ is_active }) => {
      toast.success(is_active ? "Customer activated" : "Customer deactivated");
      qc.invalidateQueries({ queryKey: ["customers"], exact: false });
    },
    onError: (e: any) => toast.error(e?.message || "Failed to change status"),
  });

  function openNew() {
    setEditing(null);
    setForm({ ...emptyForm, is_active: true });
    setOpen(true);
  }

  function openEdit(c: Customer) {
    setEditing(c);
    setForm({
      name: c.name,
      phone: c.phone ?? "",
      whatsapp: c.whatsapp ?? "",
      email: (c as any).email ?? "",
      address: c.address ?? "",
      customer_code: c.customer_code ?? "",
      opening_balance: (c as any).opening_balance ?? 0,
      discount_percent: (c as any).discount_percent ?? 0,
      vat_no: c.vat_no ?? "",
      brn: c.brn ?? "",
      client_name: (c as any).client_name ?? "",
      is_active: c.is_active,
      whatsapp_template_invoice: (c as any).whatsapp_template_invoice ?? "",
      whatsapp_template_statement: (c as any).whatsapp_template_statement ?? "",
      whatsapp_template_overdue: (c as any).whatsapp_template_overdue ?? "",
    } as any);
    setOpen(true);
  }

  function save() {
    if (!form.name?.trim()) {
      toast.error("Customer name is required");
      return;
    }
    if (editing) updateM.mutate({ id: editing.id, payload: form });
    else createM.mutate(form);
  }

  const exportExcel = () => {
    const data = rows.map((c) => ({
      customer_code: c.customer_code || "",
      name: c.name || "",
      address: c.address || "",
      phone: c.phone || "",
      brn: c.brn || "",
      vat_no: c.vat_no || "",
      whatsapp: c.whatsapp || "",
      "discount%": Number((c as any).discount_percent ?? 0),
      opening_balance: Number((c as any).opening_balance ?? 0),
      email: String((c as any).email ?? ""),
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [
      { wch: 16 },
      { wch: 28 },
      { wch: 36 },
      { wch: 14 },
      { wch: 14 },
      { wch: 14 },
      { wch: 14 },
      { wch: 10 },
      { wch: 16 },
      { wch: 26 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Customers");
    XLSX.writeFile(wb, "customers.xlsx");
    toast.success("Exported customers.xlsx");
  };

  const importExcel = async (file: File) => {
    const batchId = uid(); // uuid per import run
    setLastBatchId(batchId);

    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheetName = wb.SheetNames?.[0];
      if (!sheetName) throw new Error("No sheet found");

      const ws = wb.Sheets[sheetName];
      const json = XLSX.utils.sheet_to_json<any>(ws, { defval: "" });

      if (!json.length) {
        toast.error("Excel is empty");
        return;
      }

      // Build lookup maps
      const byCode = new Map<string, Customer>();
      const byNamePhone = new Map<string, Customer>();

      for (const c of rows) {
        const code = s(c.customer_code).toLowerCase();
        if (code) byCode.set(code, c);

        const key = `${s(c.name).toLowerCase()}|${normalizePhone(c.phone)}`;
        if (s(c.name)) byNamePhone.set(key, c);
      }

      let created = 0;
      let updated = 0;
      let skipped = 0;

      for (const raw of json) {
        const payload = normalizeExcelRow(raw);

        const name = s(payload.name);
        const code = s((payload as any).customer_code).toLowerCase();
        const phone = normalizePhone((payload as any).phone);

        if (!name) {
          skipped++;
          continue;
        }

        const matchByNamePhone = `${name.toLowerCase()}|${phone}`;
        const existing =
          (code ? byCode.get(code) : undefined) ||
          (phone ? byNamePhone.get(matchByNamePhone) : undefined);

        // stamp batch id + source (for rollback)
        const stamped: any = {
          ...payload,
          import_batch_id: batchId,
          import_source: "excel",
        };

        if (existing) {
          await updateCustomer(existing.id, {
            ...stamped,
            // preserve active state unless Excel includes it (we don't)
            is_active: existing.is_active,
          } as any);
          updated++;
        } else {
          await createCustomer(stamped);
          created++;
        }
      }

      await qc.invalidateQueries({ queryKey: ["customers"], exact: false });
      toast.success(`Import done: ${created} created, ${updated} updated, ${skipped} skipped`);
    } catch (e: any) {
      toast.error(e?.message || "Import failed");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const rollbackImportBatch = async () => {
    if (!lastBatchId) return toast.error("No batch id to rollback");
    if (!confirm(`Rollback import batch ${lastBatchId}? This will delete customers in that batch.`)) return;

    try {
      const { error } = await supabase.from("customers").delete().eq("import_batch_id", lastBatchId);
      if (error) throw error;

      toast.success("Rollback completed (batch deleted)");
      await qc.invalidateQueries({ queryKey: ["customers"], exact: false });
      setLastBatchId("");
    } catch (e: any) {
      toast.error(e?.message || "Rollback failed");
    }
  };

  const openStatement = (c: Customer) => {
    // You can implement statement page under /reports/statement?customerId=...
    nav(`/reports?tab=statement&customerId=${c.id}`);
  };

  const openLedger = (c: Customer) => {
    // Ledger view under reports as well
    nav(`/reports?tab=ledger&customerId=${c.id}`);
  };

  const createInvoiceForCustomer = (c: Customer) => {
    // Your InvoiceCreate page should read ?customerId=...
    nav(`/invoices/create?customerId=${c.id}`);
  };

  const whatsappCustomer = (c: Customer) => {
    const msg =
      `Hello ${c.name},\n` +
      `\n` +
      `This is Ram Pottery Ltd.\n` +
      `How can we help you today?\n`;
    const link = waLink(c.whatsapp || c.phone, msg);
    if (!link) return toast.error("No WhatsApp/Phone on customer");
    window.open(link, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="space-y-5">
      {/* Premium Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-2xl font-semibold tracking-tight">Customers</div>
          <div className="text-sm text-muted-foreground">
            customer_code • name • address • phone • brn • vat_no • whatsapp • discount% (opening_balance + email optional)
          </div>

          {lastBatchId ? (
            <div className="mt-2 text-xs text-muted-foreground flex items-center gap-2">
              <span className="inline-flex rounded-full border bg-muted/30 px-2 py-0.5">
                Last import batch: <b className="ml-1">{lastBatchId}</b>
              </span>
              <Button variant="outline" className="h-7 px-2" onClick={rollbackImportBatch}>
                <Undo2 className="h-4 w-4 mr-1" />
                Rollback Batch
              </Button>
            </div>
          ) : null}
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
            Download Template
          </Button>

          <Button variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4 mr-2" />
            Import Excel
          </Button>

          <Button variant="outline" onClick={exportExcel} disabled={rows.length === 0}>
            <Download className="h-4 w-4 mr-2" />
            Export Excel
          </Button>

          <Button className="gradient-primary shadow-glow text-primary-foreground" onClick={openNew}>
            <Plus className="h-4 w-4 mr-2" />
            New Customer
          </Button>
        </div>
      </div>

      {/* Filter Bar */}
      <Card className="p-4 shadow-premium">
        <div className="grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-center">
          <Input
            placeholder="Search: name, customer code, phone, whatsapp…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />

          <select
            className="h-10 rounded-md border px-3 bg-background"
            value={activeFilter}
            onChange={(e) => setActiveFilter(e.target.value as ActiveFilter)}
            title="Active filter"
          >
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
            <option value="ALL">All</option>
          </select>

          <Button variant="outline" onClick={() => customersQ.refetch()} disabled={customersQ.isFetching}>
            {customersQ.isFetching ? "Refreshing..." : "Refresh"}
          </Button>
        </div>
      </Card>

      {/* Premium Table */}
      <Card className="p-0 overflow-hidden shadow-premium">
        <div className="border-b bg-gradient-to-r from-background to-muted/30 px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">
              Register
              <span className="ml-2 text-xs text-muted-foreground">
                {customersQ.isLoading ? "Loading…" : `${rows.length} customer(s)`}
              </span>
            </div>
            <div className="text-xs text-muted-foreground">Tip: Double click a row to edit • Use the ⋯ menu for actions</div>
          </div>
        </div>

        <div className="overflow-auto">
          <table className="w-full min-w-[1180px] text-sm">
            <colgroup>
              <col style={{ width: "14%" }} />
              <col style={{ width: "18%" }} />
              <col style={{ width: "22%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "8%" }} />
            </colgroup>

            <thead className="sticky top-0 z-10 bg-background/90 backdrop-blur border-b">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Customer Code</th>
                <th className="px-4 py-3 text-left font-semibold">Name</th>
                <th className="px-4 py-3 text-left font-semibold">Address</th>
                <th className="px-4 py-3 text-left font-semibold">Phone</th>
                <th className="px-4 py-3 text-left font-semibold">BRN</th>
                <th className="px-4 py-3 text-left font-semibold">VAT No</th>
                <th className="px-4 py-3 text-left font-semibold">WhatsApp</th>
                <th className="px-4 py-3 text-right font-semibold">Discount%</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y">
              {customersQ.isLoading ? (
                <tr>
                  <td className="px-4 py-10 text-muted-foreground" colSpan={9}>
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td className="px-4 py-10 text-muted-foreground" colSpan={9}>
                    No customers found.
                  </td>
                </tr>
              ) : (
                rows.map((c, idx) => (
                  <tr
                    key={c.id}
                    className={idx % 2 === 0 ? "bg-background hover:bg-muted/40" : "bg-muted/10 hover:bg-muted/40"}
                    onDoubleClick={() => openEdit(c)}
                    title="Double click to edit"
                  >
                    <td className="px-4 py-4 align-top">
                      <div className="font-semibold tracking-wide">{c.customer_code || "-"}</div>
                      <div className="mt-2 flex items-center gap-2">
                        <span
                          className={
                            "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium " +
                            (c.is_active ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-600")
                          }
                        >
                          {c.is_active ? "ACTIVE" : "INACTIVE"}
                        </span>
                        <Switch
                          checked={!!c.is_active}
                          onCheckedChange={(v) => activeM.mutate({ id: c.id, active: !!v })}
                          disabled={activeM.isPending}
                        />
                      </div>
                    </td>

                    <td className="px-4 py-4 align-top">
                      <div className="font-semibold">{c.name}</div>
                      {(c as any).email ? <div className="mt-1 text-xs text-muted-foreground">{String((c as any).email)}</div> : null}
                    </td>

                    <td className="px-4 py-4 align-top">
                      <div className="text-muted-foreground">{c.address || "-"}</div>
                    </td>

                    <td className="px-4 py-4 align-top">
                      <div className="font-medium">{c.phone || "-"}</div>
                    </td>

                    <td className="px-4 py-4 align-top">
                      <div className="text-muted-foreground">{c.brn || "-"}</div>
                    </td>

                    <td className="px-4 py-4 align-top">
                      <div className="text-muted-foreground">{c.vat_no || "-"}</div>
                    </td>

                    <td className="px-4 py-4 align-top">
                      <div className="font-medium">{c.whatsapp || "-"}</div>
                    </td>

                    <td className="px-4 py-4 align-top text-right">
                      <div className="font-semibold">{Number((c as any).discount_percent ?? 0).toFixed(0)}%</div>
                    </td>

                    <td className="px-4 py-4 align-top">
                      <div className="flex justify-end gap-2">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" className="h-8 px-3">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>

                          <DropdownMenuContent align="end" className="w-56">
                            <DropdownMenuItem onClick={() => openEdit(c)}>
                              <BookOpen className="mr-2 h-4 w-4" />
                              Edit Customer
                            </DropdownMenuItem>

                            <DropdownMenuSeparator />

                            <DropdownMenuItem onClick={() => openStatement(c)}>
                              <FileText className="mr-2 h-4 w-4" />
                              Open Statement
                            </DropdownMenuItem>

                            <DropdownMenuItem onClick={() => openLedger(c)}>
                              <BookOpen className="mr-2 h-4 w-4" />
                              View Ledger
                            </DropdownMenuItem>

                            <DropdownMenuItem onClick={() => createInvoiceForCustomer(c)}>
                              <Plus className="mr-2 h-4 w-4" />
                              Create Invoice
                            </DropdownMenuItem>

                            <DropdownMenuItem onClick={() => whatsappCustomer(c)}>
                              <MessageCircle className="mr-2 h-4 w-4" />
                              WhatsApp
                            </DropdownMenuItem>

                            <DropdownMenuSeparator />

                            <DropdownMenuItem
                              onClick={() => activeM.mutate({ id: c.id, active: !c.is_active })}
                              disabled={activeM.isPending}
                            >
                              {c.is_active ? "Deactivate" : "Activate"}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="border-t px-4 py-3 text-xs text-muted-foreground">
          Excel format: <b>customer_code, name, address, phone, brn, vat_no, whatsapp, discount%</b> (+ optional{" "}
          <b>opening_balance</b>, <b>email</b>) • Imports are stamped with <b>import_batch_id</b> for rollback.
        </div>
      </Card>

      {/* Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Customer" : "New Customer"}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Name *</label>
              <Input value={form.name} onChange={(e) => setForm((st) => ({ ...st, name: e.target.value }))} />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Customer Code</label>
              <Input
                value={(form as any).customer_code ?? ""}
                onChange={(e) => setForm((st) => ({ ...st, customer_code: e.target.value } as any))}
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium">Address</label>
              <Input
                value={(form as any).address ?? ""}
                onChange={(e) => setForm((st) => ({ ...st, address: e.target.value } as any))}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Phone</label>
              <Input
                value={(form as any).phone ?? ""}
                onChange={(e) => setForm((st) => ({ ...st, phone: e.target.value } as any))}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">WhatsApp</label>
              <Input
                value={(form as any).whatsapp ?? ""}
                onChange={(e) => setForm((st) => ({ ...st, whatsapp: e.target.value } as any))}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Email</label>
              <Input
                value={(form as any).email ?? ""}
                onChange={(e) => setForm((st) => ({ ...st, email: e.target.value } as any))}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Opening Balance</label>
              <Input
                inputMode="decimal"
                value={String((form as any).opening_balance ?? 0)}
                onChange={(e) => setForm((st) => ({ ...st, opening_balance: e.target.value as any } as any))}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Discount %</label>
              <Input
                inputMode="decimal"
                value={String((form as any).discount_percent ?? 0)}
                onChange={(e) => setForm((st) => ({ ...st, discount_percent: e.target.value as any } as any))}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">BRN</label>
              <Input
                value={(form as any).brn ?? ""}
                onChange={(e) => setForm((st) => ({ ...st, brn: e.target.value } as any))}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">VAT No</label>
              <Input
                value={(form as any).vat_no ?? ""}
                onChange={(e) => setForm((st) => ({ ...st, vat_no: e.target.value } as any))}
              />
            </div>

            <div className="flex items-center gap-2 md:col-span-2">
              <Switch
                checked={!!(form as any).is_active}
                onCheckedChange={(v) => setForm((st) => ({ ...st, is_active: !!v } as any))}
              />
              <div className="text-sm text-muted-foreground">Active</div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              className="gradient-primary shadow-glow text-primary-foreground"
              onClick={save}
              disabled={createM.isPending || updateM.isPending}
            >
              {editing ? (updateM.isPending ? "Saving..." : "Save Changes") : createM.isPending ? "Creating..." : "Create"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}



