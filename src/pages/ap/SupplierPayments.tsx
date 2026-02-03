import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { MoreHorizontal, Plus, RefreshCw, ArrowLeft, Receipt, Link2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

/* =========================
   Types
========================= */
type SupplierMini = { id: number; name: string; supplier_code: string | null };

type SupplierPaymentRow = {
  id: number;
  supplier_id: number;
  payment_date: string;
  amount: number | null;
  method: string | null;
  reference: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;

  suppliers?: SupplierMini | null;
};

type SupplierPaymentUpsert = {
  supplier_id: number | "";
  payment_date: string;
  amount: any;
  method?: string | null;
  reference?: string | null;
  notes?: string | null;

  // optional single allocation
  allocate_bill_id?: number | "";
  allocate_amount?: any;
};

type BillMini = {
  id: number;
  supplier_id: number;
  bill_no: string | null;
  bill_date: string;
  total_amount: number | null;
  status: string;
};

type BillPaidInfo = { bill_id: number; paid: number };

/* =========================
   Helpers
========================= */
function s(v: any) {
  return String(v ?? "").trim();
}
function n0(v: any) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}
function money(v: any) {
  const x = Number(v ?? 0);
  if (!Number.isFinite(x)) return "0.00";
  return x.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function todayYmd() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
function qsGet(search: string, key: string) {
  try {
    return new URLSearchParams(search).get(key);
  } catch {
    return null;
  }
}
function statusFromPaid(total: number, paid: number) {
  if (paid <= 0) return "OPEN";
  if (paid + 0.0001 >= total) return "PAID";
  return "PARTIALLY_PAID";
}

/* =========================
   DB
========================= */
async function listSuppliersMini() {
  const { data, error } = await supabase
    .from("suppliers")
    .select("id,name,supplier_code")
    .eq("is_active", true)
    .order("name", { ascending: true })
    .limit(5000);

  if (error) throw error;
  return (data || []) as SupplierMini[];
}

async function listPayments(args: { q?: string; supplierId?: number | null; limit?: number }) {
  const q = s(args.q);
  const limit = args.limit ?? 5000;

  let query = supabase
    .from("supplier_payments")
    .select(
      `
      id,supplier_id,payment_date,amount,method,reference,notes,created_at,updated_at,
      suppliers:supplier_id ( id,name,supplier_code )
    `
    )
    .order("payment_date", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);

  if (args.supplierId) query = query.eq("supplier_id", args.supplierId);

  if (q) {
    const qq = q.replaceAll(",", " ");
    query = query.or(`method.ilike.%${qq}%,reference.ilike.%${qq}%,notes.ilike.%${qq}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as SupplierPaymentRow[];
}

async function listOpenBillsForSupplier(supplierId: number) {
  const { data, error } = await supabase
    .from("supplier_bills")
    .select("id,supplier_id,bill_no,bill_date,total_amount,status")
    .eq("supplier_id", supplierId)
    .neq("status", "VOID")
    .order("bill_date", { ascending: false })
    .limit(500);

  if (error) throw error;
  return (data || []) as BillMini[];
}

async function createPayment(payload: SupplierPaymentUpsert) {
  const row: any = {
    supplier_id: Number(payload.supplier_id),
    payment_date: payload.payment_date,
    amount: n0(payload.amount),
    method: s(payload.method) || null,
    reference: s(payload.reference) || null,
    notes: s(payload.notes) || null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase.from("supplier_payments").insert(row).select("*").single();
  if (error) throw error;
  return data as SupplierPaymentRow;
}

async function createAllocation(paymentId: number, billId: number, amountApplied: number) {
  const { data, error } = await supabase
    .from("supplier_payment_allocations")
    .insert({ payment_id: paymentId, bill_id: billId, amount_applied: amountApplied })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

async function sumPaidForBill(billId: number): Promise<number> {
  const { data, error } = await supabase
    .from("supplier_payment_allocations")
    .select("amount_applied")
    .eq("bill_id", billId);

  if (error) throw error;
  return (data || []).reduce((sum: number, r: any) => sum + n0(r.amount_applied), 0);
}

async function patchBillStatus(billId: number, status: string) {
  const { error } = await supabase
    .from("supplier_bills")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", billId);

  if (error) throw error;
}

async function deletePayment(id: number) {
  // NOTE: allocations will cascade delete due to FK
  const { error } = await supabase.from("supplier_payments").delete().eq("id", id);
  if (error) throw error;
  return true;
}

/* =========================
   Page
========================= */
const emptyForm: SupplierPaymentUpsert = {
  supplier_id: "",
  payment_date: todayYmd(),
  amount: 0,
  method: "BANK",
  reference: "",
  notes: "",
  allocate_bill_id: "",
  allocate_amount: "",
};

export default function SupplierPayments() {
  const nav = useNavigate();
  const loc = useLocation();
  const qc = useQueryClient();

  const supplierParam = qsGet(loc.search, "supplier");
  const preSupplierId = supplierParam ? Number(supplierParam) : null;

  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [supplierId, setSupplierId] = useState<number | "">(
    Number.isFinite(preSupplierId as any) ? (preSupplierId as number) : ""
  );

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<SupplierPaymentUpsert>(emptyForm);
  const firstRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setQ(qInput.trim()), 220);
    return () => window.clearTimeout(t);
  }, [qInput]);

  const suppliersQ = useQuery({
    queryKey: ["suppliers-mini"],
    queryFn: listSuppliersMini,
    staleTime: 60_000,
  });

  const paymentsQ = useQuery({
    queryKey: ["supplier-payments", q, supplierId],
    queryFn: () => listPayments({ q, supplierId: supplierId ? Number(supplierId) : null, limit: 5000 }),
    staleTime: 15_000,
  });

  const openBillsQ = useQuery({
    queryKey: ["supplier-open-bills", supplierId],
    queryFn: () => (supplierId ? listOpenBillsForSupplier(Number(supplierId)) : Promise.resolve([])),
    enabled: !!supplierId,
    staleTime: 10_000,
  });

  const rows = paymentsQ.data || [];
  const suppliers = suppliersQ.data || [];
  const bills = openBillsQ.data || [];

  const kpis = useMemo(() => {
    const count = rows.length;
    const totalPaid = rows.reduce((sum, r) => sum + n0(r.amount), 0);
    const byMethod = rows.reduce((acc: Record<string, number>, r) => {
      const key = s(r.method || "OTHER").toUpperCase();
      acc[key] = (acc[key] || 0) + n0(r.amount);
      return acc;
    }, {});
    const topMethod = Object.entries(byMethod).sort((a, b) => b[1] - a[1])[0]?.[0] || "—";
    return { count, totalPaid, topMethod };
  }, [rows]);

  const createM = useMutation({
    mutationFn: async (payload: SupplierPaymentUpsert) => {
      if (!payload.supplier_id) throw new Error("Supplier is required");
      const amount = n0(payload.amount);
      if (amount <= 0) throw new Error("Amount must be > 0");

      const created = await createPayment(payload);

      // Optional allocation to one bill (ERP-friendly)
      const billId = payload.allocate_bill_id ? Number(payload.allocate_bill_id) : null;
      const allocAmt = payload.allocate_amount ? n0(payload.allocate_amount) : 0;

      if (billId && allocAmt > 0) {
        await createAllocation(created.id, billId, allocAmt);

        // Auto status update based on allocations sum vs bill total
        const bill = bills.find((b) => b.id === billId);
        if (bill) {
          const paid = await sumPaidForBill(billId);
          const total = n0(bill.total_amount);
          await patchBillStatus(billId, statusFromPaid(total, paid));
        }
      }

      return created;
    },
    onSuccess: async () => {
      toast.success("Payment recorded");
      await qc.invalidateQueries({ queryKey: ["supplier-payments"] });
      await qc.invalidateQueries({ queryKey: ["supplier-open-bills"] });
      await qc.invalidateQueries({ queryKey: ["supplier-bills"] });
      await qc.invalidateQueries({ queryKey: ["supplier-balances"] });
      setOpen(false);
    },
    onError: (e: any) => toast.error(e?.message || "Failed to record payment"),
  });

  const deleteM = useMutation({
    mutationFn: async (id: number) => deletePayment(id),
    onSuccess: async () => {
      toast.success("Payment deleted");
      await qc.invalidateQueries({ queryKey: ["supplier-payments"] });
      await qc.invalidateQueries({ queryKey: ["supplier-balances"] });
      await qc.invalidateQueries({ queryKey: ["supplier-bills"] });
    },
    onError: (e: any) => toast.error(e?.message || "Failed to delete payment"),
  });

  function openNew() {
    setForm({
      ...emptyForm,
      supplier_id: supplierId ? Number(supplierId) : "",
      payment_date: todayYmd(),
      amount: 0,
      method: "BANK",
      reference: "",
      notes: "",
      allocate_bill_id: "",
      allocate_amount: "",
    });
    setOpen(true);
    setTimeout(() => firstRef.current?.focus(), 50);
  }

  function save() {
    createM.mutate(form);
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={() => nav("/suppliers")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Suppliers
            </Button>
            <div>
              <div className="text-2xl font-semibold tracking-tight">Supplier Payments</div>
              <div className="text-sm text-muted-foreground">Accounts Payable • Payments • References</div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => paymentsQ.refetch()} disabled={paymentsQ.isFetching}>
            <RefreshCw className="h-4 w-4 mr-2" />
            {paymentsQ.isFetching ? "Refreshing..." : "Refresh"}
          </Button>

          <Button className="gradient-primary shadow-glow text-primary-foreground" onClick={openNew}>
            <Plus className="h-4 w-4 mr-2" />
            Record Payment
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4 shadow-premium">
          <div className="text-xs text-muted-foreground">Payments</div>
          <div className="mt-1 text-xl font-semibold">{kpis.count}</div>
          <div className="mt-1 text-xs text-muted-foreground">In current view</div>
        </Card>

        <Card className="p-4 shadow-premium">
          <div className="text-xs text-muted-foreground">Total Paid</div>
          <div className="mt-1 text-xl font-semibold">Rs {money(kpis.totalPaid)}</div>
          <div className="mt-1 text-xs text-muted-foreground">Sum of payment amounts</div>
        </Card>

        <Card className="p-4 shadow-premium">
          <div className="text-xs text-muted-foreground">Top Method</div>
          <div className="mt-1 text-xl font-semibold">{kpis.topMethod}</div>
          <div className="mt-1 text-xs text-muted-foreground">Based on totals</div>
        </Card>

        <Card className="p-4 shadow-premium">
          <div className="text-xs text-muted-foreground">Quick Links</div>
          <div className="mt-2 flex gap-2">
            <Button variant="outline" onClick={() => nav(`/ap/bills${supplierId ? `?supplier=${supplierId}` : ""}`)}>
              Bills
            </Button>
            <Button variant="outline" onClick={() => nav("/suppliers")}>
              Suppliers
            </Button>
          </div>
        </Card>
      </div>

      {/* Filters */}
      <Card className="p-4 shadow-premium">
        <div className="grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-center">
          <Input
            placeholder="Search method / reference / notes…"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
          />

          <select
            className="h-10 rounded-md border px-3 bg-background"
            value={supplierId ? String(supplierId) : ""}
            onChange={(e) => setSupplierId(e.target.value ? Number(e.target.value) : "")}
            title="Supplier filter"
          >
            <option value="">All suppliers</option>
            {suppliers.map((sp) => (
              <option key={sp.id} value={String(sp.id)}>
                {(sp.supplier_code ? `${sp.supplier_code} • ` : "") + sp.name}
              </option>
            ))}
          </select>

          <Button variant="outline" onClick={openNew}>
            <Receipt className="h-4 w-4 mr-2" />
            Record
          </Button>
        </div>
      </Card>

      {/* Table */}
      <Card className="p-0 overflow-hidden shadow-premium">
        <div className="border-b bg-gradient-to-r from-background to-muted/30 px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">
              Register
              <span className="ml-2 text-xs text-muted-foreground">
                {paymentsQ.isLoading ? "Loading…" : `${rows.length} payment(s)`}
              </span>
            </div>
            <div className="text-xs text-muted-foreground">Payments reduce supplier balance automatically</div>
          </div>
        </div>

        <div className="overflow-auto">
          <table className="w-full min-w-[1050px] text-sm">
            <colgroup>
              <col style={{ width: "14%" }} />
              <col style={{ width: "28%" }} />
              <col style={{ width: "14%" }} />
              <col style={{ width: "18%" }} />
              <col style={{ width: "18%" }} />
              <col style={{ width: "8%" }} />
            </colgroup>

            <thead className="sticky top-0 z-10 bg-background/90 backdrop-blur border-b">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Date</th>
                <th className="px-4 py-3 text-left font-semibold">Supplier</th>
                <th className="px-4 py-3 text-right font-semibold">Amount</th>
                <th className="px-4 py-3 text-left font-semibold">Method</th>
                <th className="px-4 py-3 text-left font-semibold">Reference</th>
                <th className="px-3 py-3 text-right font-semibold"></th>
              </tr>
            </thead>

            <tbody className="divide-y">
              {!paymentsQ.isLoading &&
                rows.map((r) => {
                  const sup = r.suppliers as any;
                  const supLabel = sup
                    ? `${sup?.supplier_code ? sup.supplier_code + " • " : ""}${sup?.name || ""}`
                    : `#${r.supplier_id}`;

                  return (
                    <tr key={r.id} className="hover:bg-muted/30">
                      <td className="px-4 py-4 text-muted-foreground">
                        {r.payment_date ? format(new Date(r.payment_date), "dd MMM yyyy") : "-"}
                      </td>

                      <td className="px-4 py-4">
                        <div className="font-semibold">{supLabel}</div>
                        {r.notes ? <div className="mt-1 text-xs text-muted-foreground line-clamp-2">{r.notes}</div> : null}
                      </td>

                      <td className="px-4 py-4 text-right">
                        <div className="text-xs text-muted-foreground">MUR</div>
                        <div className="font-semibold">Rs {money(r.amount)}</div>
                      </td>

                      <td className="px-4 py-4">
                        <span className="inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold bg-slate-500/10 text-slate-700 border-slate-200">
                          {s(r.method || "OTHER").toUpperCase()}
                        </span>
                      </td>

                      <td className="px-4 py-4">
                        <div className="font-medium">{r.reference || "-"}</div>
                      </td>

                      <td className="px-3 py-3 text-right">
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

                          <DropdownMenuContent align="end" className="w-56">
                            <DropdownMenuItem onClick={() => nav(`/ap/bills?supplier=${r.supplier_id}`)}>
                              View Supplier Bills
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => nav(`/suppliers`)}>
                              Supplier Register
                            </DropdownMenuItem>

                            <DropdownMenuSeparator />

                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => {
                                if (!confirm("Delete this payment? (Allocations will also be deleted)")) return;
                                deleteM.mutate(r.id);
                              }}
                              disabled={deleteM.isPending}
                            >
                              Delete Payment
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}

              {!paymentsQ.isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-muted-foreground">
                    No payments found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="border-t px-4 py-3 text-xs text-muted-foreground">
          Optional ERP feature: allocate a payment to a bill to auto-close bill status.
        </div>
      </Card>

      {/* Record Payment Dialog (compact) */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[680px]">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4">
            <Card className="p-4 shadow-premium">
              <div className="text-sm font-semibold">Payment</div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground">Supplier *</div>
                  <select
                    className="h-10 w-full rounded-md border px-3 bg-background"
                    value={form.supplier_id ? String(form.supplier_id) : ""}
                    onChange={(e) => {
                      const id = e.target.value ? Number(e.target.value) : "";
                      setSupplierId(id as any);
                      setForm((x) => ({ ...x, supplier_id: id, allocate_bill_id: "", allocate_amount: "" }));
                    }}
                  >
                    <option value="">Select supplier</option>
                    {suppliers.map((sp) => (
                      <option key={sp.id} value={String(sp.id)}>
                        {(sp.supplier_code ? `${sp.supplier_code} • ` : "") + sp.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground">Payment Date *</div>
                  <Input
                    ref={firstRef}
                    value={form.payment_date}
                    onChange={(e) => setForm((x) => ({ ...x, payment_date: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground">Amount *</div>
                  <Input
                    inputMode="decimal"
                    value={String(form.amount ?? 0)}
                    onChange={(e) => setForm((x) => ({ ...x, amount: e.target.value as any }))}
                  />
                </div>

                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground">Method</div>
                  <select
                    className="h-10 w-full rounded-md border px-3 bg-background"
                    value={form.method || "BANK"}
                    onChange={(e) => setForm((x) => ({ ...x, method: e.target.value }))}
                  >
                    <option value="BANK">BANK</option>
                    <option value="CASH">CASH</option>
                    <option value="JUICE">JUICE</option>
                    <option value="CHEQUE">CHEQUE</option>
                    <option value="TRANSFER">TRANSFER</option>
                    <option value="OTHER">OTHER</option>
                  </select>
                </div>

                <div className="space-y-2 md:col-span-2">
                  <div className="text-xs text-muted-foreground">Reference</div>
                  <Input
                    value={form.reference || ""}
                    onChange={(e) => setForm((x) => ({ ...x, reference: e.target.value }))}
                    placeholder="Bank ref / receipt no"
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <div className="text-xs text-muted-foreground">Notes</div>
                  <Input
                    value={form.notes || ""}
                    onChange={(e) => setForm((x) => ({ ...x, notes: e.target.value }))}
                    placeholder="Optional note"
                  />
                </div>
              </div>
            </Card>

            <Card className="p-4 shadow-premium">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">Optional Allocation</div>
                <span className="text-xs text-muted-foreground">Apply this payment to one bill</span>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground">Bill</div>
                  <select
                    className="h-10 w-full rounded-md border px-3 bg-background"
                    value={form.allocate_bill_id ? String(form.allocate_bill_id) : ""}
                    onChange={(e) => setForm((x) => ({ ...x, allocate_bill_id: e.target.value ? Number(e.target.value) : "" }))}
                    disabled={!form.supplier_id}
                    title={!form.supplier_id ? "Select a supplier first" : ""}
                  >
                    <option value="">No allocation</option>
                    {bills.map((b) => (
                      <option key={b.id} value={String(b.id)}>
                        {(b.bill_no ? b.bill_no : `BILL-${b.id}`) +
                          ` • Rs ${money(b.total_amount)} • ${format(new Date(b.bill_date), "dd MMM yyyy")}`}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground">Amount Applied</div>
                  <Input
                    inputMode="decimal"
                    value={String(form.allocate_amount ?? "")}
                    onChange={(e) => setForm((x) => ({ ...x, allocate_amount: e.target.value as any }))}
                    placeholder="0.00"
                    disabled={!form.allocate_bill_id}
                  />
                </div>

                <div className="md:col-span-2 text-xs text-muted-foreground">
                  <Link2 className="h-4 w-4 inline-block mr-2" />
                  If you allocate, bill status updates automatically (OPEN → PARTIALLY → PAID).
                </div>
              </div>
            </Card>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              className="gradient-primary shadow-glow text-primary-foreground"
              onClick={() => save()}
              disabled={createM.isPending}
            >
              {createM.isPending ? "Saving..." : "Save Payment"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
