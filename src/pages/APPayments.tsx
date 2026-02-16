import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";

import {
  Receipt,
  Plus,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
  FileText,
  BookOpen,
} from "lucide-react";

type BillStatus = "OPEN" | "PARTIALLY_PAID" | "PAID" | "VOID";

type SupplierLite = { id: number; name: string; supplier_code: string | null };

type SupplierBill = {
  id: number;
  supplier_id: number;
  bill_no: string | null;
  bill_date: string;
  due_date: string | null;
  currency: string;
  total_amount: number;
  status: BillStatus;
};

type SupplierPayment = {
  id: number;
  supplier_id: number;
  payment_date: string;
  amount: number;
  method: string | null;
  reference: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type Allocation = {
  id: number;
  payment_id: number;
  bill_id: number;
  amount_applied: number;
  created_at: string;
};

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
function qsGet(search: string, key: string) {
  try {
    return new URLSearchParams(search).get(key);
  } catch {
    return null;
  }
}

function Badge({ tone, children }: { tone: "ok" | "warn" | "bad" | "muted"; children: React.ReactNode }) {
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

/* =========================
   DB helpers
========================= */
async function listSuppliersLite(q?: string) {
  let query = supabase.from("suppliers").select("id,name,supplier_code").order("name", { ascending: true }).limit(300);
  const t = (q || "").trim();
  if (t) query = query.ilike("name", `%${t}%`);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as SupplierLite[];
}

async function listPaymentsPaged(args: { q?: string; supplierId?: number | null; page: number; pageSize: number }) {
  const page = Math.max(0, Math.trunc(args.page || 0));
  const pageSize = Math.max(1, Math.trunc(args.pageSize || 50));
  const from = page * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("supplier_payments")
    .select("id,supplier_id,payment_date,amount,method,reference,notes,created_at,updated_at", { count: "exact" })
    .order("payment_date", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to);

  const q = (args.q || "").trim();
  if (q) {
    const sQ = q.replaceAll(",", " ");
    query = query.or(`reference.ilike.%${sQ}%,method.ilike.%${sQ}%,notes.ilike.%${sQ}%`);
  }

  if (args.supplierId) query = query.eq("supplier_id", args.supplierId);

  const { data, error, count } = await query;
  if (error) throw error;
  return { rows: (data || []) as SupplierPayment[], total: Number(count || 0) };
}

async function listAllocationsForPayment(paymentId: number) {
  const { data, error } = await supabase
    .from("supplier_payment_allocations")
    .select("id,payment_id,bill_id,amount_applied,created_at")
    .eq("payment_id", paymentId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []) as Allocation[];
}

async function listBillsForSupplier(supplierId: number, limit = 300) {
  const { data, error } = await supabase
    .from("supplier_bills")
    .select("id,supplier_id,bill_no,bill_date,due_date,currency,total_amount,status")
    .eq("supplier_id", supplierId)
    .order("bill_date", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []) as SupplierBill[];
}

async function listAllocSumsForBills(billIds: number[]) {
  if (!billIds.length) return new Map<number, number>();
  const { data, error } = await supabase
    .from("supplier_payment_allocations")
    .select("bill_id,amount_applied")
    .in("bill_id", billIds);
  if (error) throw error;
  const m = new Map<number, number>();
  for (const r of data || []) {
    const bid = Number((r as any).bill_id);
    m.set(bid, (m.get(bid) || 0) + n0((r as any).amount_applied));
  }
  return m;
}

async function recomputeBillStatus(billId: number) {
  const { data: bill, error: e1 } = await supabase
    .from("supplier_bills")
    .select("id,total_amount,status")
    .eq("id", billId)
    .single();
  if (e1) throw e1;

  const st = (bill as any).status as BillStatus;
  if (st === "VOID") return;

  const total = n0((bill as any).total_amount);

  const { data: allocs, error: e2 } = await supabase
    .from("supplier_payment_allocations")
    .select("amount_applied")
    .eq("bill_id", billId);
  if (e2) throw e2;

  let applied = 0;
  for (const a of allocs || []) applied += n0((a as any).amount_applied);

  let next: BillStatus = "OPEN";
  if (applied <= 0) next = "OPEN";
  else if (applied + 0.0001 < total) next = "PARTIALLY_PAID";
  else next = "PAID";

  if (next !== st) {
    const { error } = await supabase
      .from("supplier_bills")
      .update({ status: next, updated_at: new Date().toISOString() })
      .eq("id", billId);
    if (error) throw error;
  }
}

async function upsertAllocation(paymentId: number, billId: number, amountApplied: number) {
  const { data: existing, error: e1 } = await supabase
    .from("supplier_payment_allocations")
    .select("id,amount_applied")
    .eq("payment_id", paymentId)
    .eq("bill_id", billId)
    .maybeSingle();
  if (e1) throw e1;

  if (existing?.id) {
    const { error } = await supabase
      .from("supplier_payment_allocations")
      .update({ amount_applied: amountApplied })
      .eq("id", existing.id);
    if (error) throw error;
    return Number(existing.id);
  } else {
    const { data, error } = await supabase
      .from("supplier_payment_allocations")
      .insert({ payment_id: paymentId, bill_id: billId, amount_applied: amountApplied })
      .select("id")
      .single();
    if (error) throw error;
    return Number((data as any).id);
  }
}

async function deleteAllocation(paymentId: number, billId: number) {
  const { error } = await supabase
    .from("supplier_payment_allocations")
    .delete()
    .eq("payment_id", paymentId)
    .eq("bill_id", billId);
  if (error) throw error;
}

/* =========================
   Page
========================= */
const emptyPay = { supplier_id: 0, payment_date: "", amount: "", method: "", reference: "", notes: "" };

export default function APPayments() {
  const nav = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();

  const pageSize = 50;
  const supplierFromQs = qsGet(location.search, "supplier");
  const supplierId = supplierFromQs ? Number(supplierFromQs) : null;

  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);

  const [payOpen, setPayOpen] = useState(false);
  const [payForm, setPayForm] = useState<any>(emptyPay);

  const [allocOpen, setAllocOpen] = useState(false);
  const [activePay, setActivePay] = useState<SupplierPayment | null>(null);

  const [draft, setDraft] = useState<Record<number, any>>({});
  const [savingAlloc, setSavingAlloc] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setQ(qInput.trim()), 250);
    return () => window.clearTimeout(t);
  }, [qInput]);

  useEffect(() => setPage(0), [q, supplierId]);

  const suppliersLiteQ = useQuery({
    queryKey: ["suppliersLite"],
    queryFn: () => listSuppliersLite(""),
    staleTime: 30_000,
  });

  const paymentsQ = useQuery({
    queryKey: ["apPaymentsPaged", q, supplierId || 0, page, pageSize],
    queryFn: () => listPaymentsPaged({ q, supplierId, page, pageSize }),
    staleTime: 12_000,
    keepPreviousData: true,
  });

  const rows = paymentsQ.data?.rows || [];
  const total = paymentsQ.data?.total || 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  const allocsQ = useQuery({
    queryKey: ["allocsForPayment", activePay?.id || 0],
    enabled: allocOpen && !!activePay?.id,
    queryFn: () => listAllocationsForPayment(Number(activePay!.id)),
    staleTime: 10_000,
  });

  const billsQ = useQuery({
    queryKey: ["billsForSupplier", activePay?.supplier_id || 0],
    enabled: allocOpen && !!activePay?.supplier_id,
    queryFn: () => listBillsForSupplier(Number(activePay!.supplier_id), 600),
    staleTime: 10_000,
  });

  const openBills = useMemo(() => {
    const list = billsQ.data || [];
    return list.filter((b) => b.status !== "VOID" && b.status !== "PAID");
  }, [billsQ.data]);

  const billAllocSumsQ = useQuery({
    queryKey: ["allocSumsForBills", (openBills || []).map((b) => b.id).join(",")],
    enabled: allocOpen && openBills.length > 0,
    queryFn: () => listAllocSumsForBills(openBills.map((b) => b.id)),
    staleTime: 10_000,
  });

  const allocSum = useMemo(() => {
    let sum = 0;
    for (const a of allocsQ.data || []) sum += n0(a.amount_applied);
    return sum;
  }, [allocsQ.data]);

  const unallocated = useMemo(() => {
    const amt = n0(activePay?.amount);
    return Math.max(0, amt - allocSum);
  }, [activePay?.amount, allocSum]);

  useEffect(() => {
    if (!allocOpen) return;
    const map: Record<number, any> = {};
    for (const a of allocsQ.data || []) map[a.bill_id] = String(a.amount_applied);
    setDraft(map);
  }, [allocOpen, allocsQ.data]);

  const createPayM = useMutation({
    mutationFn: async (payload: any) => {
      const row = {
        supplier_id: Number(payload.supplier_id),
        payment_date: payload.payment_date || new Date().toISOString().slice(0, 10),
        amount: n0(payload.amount),
        method: s(payload.method) || null,
        reference: s(payload.reference) || null,
        notes: s(payload.notes) || null,
        updated_at: new Date().toISOString(),
      };

      if (!row.supplier_id) throw new Error("Supplier is required");
      if (row.amount <= 0) throw new Error("Amount must be > 0");

      const { data, error } = await supabase
        .from("supplier_payments")
        .insert(row)
        .select("id,supplier_id,payment_date,amount,method,reference,notes,created_at,updated_at")
        .single();
      if (error) throw error;
      return data as SupplierPayment;
    },
    onSuccess: async () => {
      toast.success("Payment recorded");
      await qc.invalidateQueries({ queryKey: ["apPaymentsPaged"], exact: false });
      setPayOpen(false);
    },
    onError: (e: any) => toast.error(e?.message || "Failed to record payment"),
  });

  function openCreate() {
    setPayForm({
      ...emptyPay,
      supplier_id: supplierId || 0,
      payment_date: new Date().toISOString().slice(0, 10),
      amount: "",
    });
    setPayOpen(true);
  }

  async function openAllocations(p: SupplierPayment) {
    setActivePay(p);
    setAllocOpen(true);
  }

  async function saveAllocations() {
    if (!activePay) return;
    setSavingAlloc(true);

    try {
      const paymentId = activePay.id;
      const payAmt = n0(activePay.amount);

      const existing = await listAllocationsForPayment(paymentId);
      const existingMap = new Map<number, Allocation>();
      for (const a of existing) existingMap.set(a.bill_id, a);

      const desired: { billId: number; amt: number }[] = [];
      for (const [billIdStr, val] of Object.entries(draft)) {
        const billId = Number(billIdStr);
        const amt = n0(val);
        if (amt > 0) desired.push({ billId, amt });
      }

      const desiredSum = desired.reduce((a, x) => a + x.amt, 0);
      if (desiredSum - 0.0001 > payAmt) {
        throw new Error(`Allocated Rs ${money(desiredSum)} exceeds payment amount Rs ${money(payAmt)}`);
      }

      // Validate remaining using bulk sums (open bills)
      const bills = await listBillsForSupplier(activePay.supplier_id, 1200);
      const allBillIds = bills.map((b) => b.id);
      const allocSums = await listAllocSumsForBills(allBillIds);

      for (const d of desired) {
        const bill = bills.find((b) => b.id === d.billId);
        if (!bill) throw new Error(`Bill ${d.billId} not found`);
        if (bill.status === "VOID") throw new Error(`Bill ${bill.bill_no || bill.id} is VOID`);

        const alreadyApplied = n0(allocSums.get(d.billId) || 0);
        const existingForThisPayment = n0(existingMap.get(d.billId)?.amount_applied || 0);

        // remaining = total - (applied - this payment existing)
        const remaining = Math.max(0, n0(bill.total_amount) - (alreadyApplied - existingForThisPayment));
        if (d.amt - 0.0001 > remaining) {
          throw new Error(`Allocation exceeds remaining for bill ${bill.bill_no || bill.id}. Remaining Rs ${money(remaining)}`);
        }
      }

      // Deletes (removed)
      for (const a of existing) {
        const keep = desired.find((d) => d.billId === a.bill_id);
        if (!keep) await deleteAllocation(paymentId, a.bill_id);
      }

      // Upserts
      for (const d of desired) {
        await upsertAllocation(paymentId, d.billId, d.amt);
      }

      // Recompute impacted bills
      const impacted = new Set<number>();
      for (const a of existing) impacted.add(a.bill_id);
      for (const d of desired) impacted.add(d.billId);

      for (const billId of impacted) {
        await recomputeBillStatus(billId);
      }

      toast.success("Allocations saved");

      await qc.invalidateQueries({ queryKey: ["allocsForPayment"], exact: false });
      await qc.invalidateQueries({ queryKey: ["billsForSupplier"], exact: false });
      await qc.invalidateQueries({ queryKey: ["apBillsPaged"], exact: false });
      await qc.invalidateQueries({ queryKey: ["apPaymentsPaged"], exact: false });

      await allocsQ.refetch();
      await billsQ.refetch();
      await billAllocSumsQ.refetch();
    } catch (e: any) {
      toast.error(e?.message || "Failed to save allocations");
    } finally {
      setSavingAlloc(false);
    }
  }

  function autoAllocate() {
    if (!activePay) return;
    const amt = n0(activePay.amount);

    const sums = billAllocSumsQ.data || new Map<number, number>();
    let remaining = amt;

    const nextDraft: Record<number, any> = { ...draft };

    // pay oldest first (use due_date/bill_date already sorted in query? bills are bill_date desc; reverse to oldest)
    const ordered = [...openBills].reverse();

    for (const b of ordered) {
      if (remaining <= 0) break;
      const already = n0(sums.get(b.id) || 0);
      const existingForThisPayment = n0(nextDraft[b.id] || 0);
      const billRemaining = Math.max(0, n0(b.total_amount) - (already - existingForThisPayment));
      if (billRemaining <= 0) continue;

      const applied = Math.min(remaining, billRemaining);
      nextDraft[b.id] = String(applied);
      remaining -= applied;
    }

    setDraft(nextDraft);
    toast.message("Auto allocation filled (oldest first)");
  }

  return (
    <div className="space-y-5 pb-10">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="space-y-1">
          <div className="text-2xl font-semibold tracking-tight">AP Payments</div>
          <div className="text-sm text-muted-foreground">
            Server paging (50) • Allocate payments to bills • Auto status update
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => nav("/ap")}>
            <BookOpen className="h-4 w-4 mr-2" />
            Dashboard
          </Button>
          <Button variant="outline" onClick={() => nav("/ap/bills")}>
            <FileText className="h-4 w-4 mr-2" />
            Bills
          </Button>
          <Button className="gradient-primary shadow-glow text-primary-foreground" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" />
            New Payment
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="p-4 shadow-premium">
        <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto_auto] lg:items-center">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-5 w-5 text-muted-foreground" />
            <Input
              className="pl-10"
              placeholder="Search: reference / method / notes…"
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
            />
          </div>

          <select
            className="h-10 rounded-md border px-3 bg-background"
            value={String(supplierId || "")}
            onChange={(e) => {
              const v = e.target.value;
              if (!v) nav("/ap/payments");
              else nav(`/ap/payments?supplier=${v}`);
            }}
            title="Supplier"
          >
            <option value="">All suppliers</option>
            {(suppliersLiteQ.data || []).map((s) => (
              <option key={s.id} value={String(s.id)}>
                {s.name}
              </option>
            ))}
          </select>

          <Button variant="outline" onClick={() => paymentsQ.refetch()} disabled={paymentsQ.isFetching}>
            <RefreshCw className="h-4 w-4 mr-2" />
            {paymentsQ.isFetching ? "Refreshing…" : "Refresh"}
          </Button>

          <div className="flex items-center gap-2 justify-end">
            <Button size="icon" variant="outline" disabled={page <= 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="text-xs text-muted-foreground">
              Page <b>{page + 1}</b> / <b>{pageCount}</b> • Total <b>{total}</b>
            </div>
            <Button size="icon" variant="outline" disabled={page >= pageCount - 1} onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>

      {/* Register */}
      <Card className="p-0 overflow-hidden shadow-premium">
        <div className="border-b bg-gradient-to-r from-background to-muted/30 px-4 py-3 flex items-center justify-between">
          <div className="text-sm font-semibold">
            Payments Register{" "}
            <span className="ml-2 text-xs text-muted-foreground">
              {paymentsQ.isLoading ? "Loading…" : `${rows.length} row(s)`}
            </span>
          </div>
          <div className="text-xs text-muted-foreground">Click row for allocations</div>
        </div>

        <div className="overflow-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <colgroup>
              <col style={{ width: "18%" }} />
              <col style={{ width: "14%" }} />
              <col style={{ width: "14%" }} />
              <col style={{ width: "18%" }} />
              <col style={{ width: "18%" }} />
              <col style={{ width: "18%" }} />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-background/90 backdrop-blur border-b">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Payment</th>
                <th className="px-4 py-3 text-left font-semibold">Date</th>
                <th className="px-4 py-3 text-right font-semibold">Amount</th>
                <th className="px-4 py-3 text-left font-semibold">Method</th>
                <th className="px-4 py-3 text-left font-semibold">Reference</th>
                <th className="px-4 py-3 text-left font-semibold">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {paymentsQ.isLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-muted-foreground">
                    No payments found.
                  </td>
                </tr>
              ) : (
                rows.map((p, idx) => (
                  <tr
                    key={p.id}
                    className={idx % 2 === 0 ? "bg-background hover:bg-muted/40 cursor-pointer" : "bg-muted/10 hover:bg-muted/40 cursor-pointer"}
                    onClick={() => openAllocations(p)}
                    title="Open allocations"
                  >
                    <td className="px-4 py-4">
                      <div className="font-semibold">PAY-{String(p.id).padStart(5, "0")}</div>
                      <div className="text-xs text-muted-foreground">Supplier #{p.supplier_id}</div>
                    </td>
                    <td className="px-4 py-4">{p.payment_date}</td>
                    <td className="px-4 py-4 text-right font-semibold">Rs {money(p.amount)}</td>
                    <td className="px-4 py-4">{p.method || "-"}</td>
                    <td className="px-4 py-4">{p.reference || "-"}</td>
                    <td className="px-4 py-4 text-muted-foreground">{p.notes || "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="border-t px-4 py-3 text-xs text-muted-foreground">
          Allocation updates bill status automatically (OPEN / PARTIALLY_PAID / PAID). VOID bills are excluded.
        </div>
      </Card>

      {/* Create Payment */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="max-w-lg p-0 overflow-hidden">
          <div className="p-5 border-b bg-gradient-to-r from-background to-muted/20">
            <DialogHeader>
              <DialogTitle className="text-base">New Payment</DialogTitle>
              <DialogDescription className="text-xs">Record supplier payment. You can allocate it right after.</DialogDescription>
            </DialogHeader>
          </div>

          <div className="p-5 space-y-3">
            <select
              className="h-10 rounded-md border px-3 bg-background w-full"
              value={String(payForm.supplier_id || "")}
              onChange={(e) => setPayForm((x: any) => ({ ...x, supplier_id: Number(e.target.value || 0) }))}
            >
              <option value="">Select supplier…</option>
              {(suppliersLiteQ.data || []).map((s) => (
                <option key={s.id} value={String(s.id)}>
                  {s.name}
                </option>
              ))}
            </select>

            <div className="grid grid-cols-2 gap-2">
              <Input
                type="date"
                value={payForm.payment_date || ""}
                onChange={(e) => setPayForm((x: any) => ({ ...x, payment_date: e.target.value }))}
              />
              <Input
                placeholder="Amount (Rs)"
                inputMode="decimal"
                value={String(payForm.amount ?? "")}
                onChange={(e) => setPayForm((x: any) => ({ ...x, amount: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Method (Bank/MCB/Juice/Cash…)" value={payForm.method || ""} onChange={(e) => setPayForm((x: any) => ({ ...x, method: e.target.value }))} />
              <Input placeholder="Reference" value={payForm.reference || ""} onChange={(e) => setPayForm((x: any) => ({ ...x, reference: e.target.value }))} />
            </div>

            <Input placeholder="Notes (optional)" value={payForm.notes || ""} onChange={(e) => setPayForm((x: any) => ({ ...x, notes: e.target.value }))} />
          </div>

          <div className="p-4 border-t flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPayOpen(false)}>Cancel</Button>
            <Button
              className="gradient-primary shadow-glow text-primary-foreground"
              disabled={createPayM.isPending}
              onClick={() => createPayM.mutate(payForm)}
            >
              {createPayM.isPending ? "Saving…" : "Save Payment"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Allocations */}
      <Dialog open={allocOpen} onOpenChange={setAllocOpen}>
        <DialogContent className="w-[96vw] max-w-6xl p-0 overflow-hidden">
          <div className="p-5 border-b bg-gradient-to-r from-background to-muted/20">
            <div className="flex items-start justify-between gap-3">
              <DialogHeader>
                <DialogTitle className="text-base">Allocate Payment</DialogTitle>
                <DialogDescription className="text-xs">
                  {activePay ? (
                    <>
                      Payment <b>PAY-{String(activePay.id).padStart(5, "0")}</b> • Supplier #{activePay.supplier_id} • Amount{" "}
                      <b>Rs {money(activePay.amount)}</b>
                    </>
                  ) : (
                    "—"
                  )}
                </DialogDescription>
              </DialogHeader>

              <Button variant="outline" size="icon" onClick={() => setAllocOpen(false)} title="Close">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="p-5 space-y-4 max-h-[78vh] overflow-auto">
            <div className="grid gap-3 md:grid-cols-4">
              <Card className="p-3 ring-1 ring-border bg-muted/10">
                <div className="text-[11px] text-muted-foreground">Payment</div>
                <div className="text-sm font-semibold">Rs {money(activePay?.amount)}</div>
              </Card>
              <Card className="p-3 ring-1 ring-border bg-muted/10">
                <div className="text-[11px] text-muted-foreground">Allocated</div>
                <div className="text-sm font-semibold">Rs {money(allocSum)}</div>
              </Card>
              <Card className="p-3 ring-1 ring-border bg-muted/10">
                <div className="text-[11px] text-muted-foreground">Unallocated</div>
                <div className={"text-sm font-semibold " + (unallocated > 0 ? "text-amber-800" : "text-emerald-700")}>
                  Rs {money(unallocated)}
                </div>
              </Card>
              <Card className="p-3 ring-1 ring-border bg-muted/10">
                <div className="text-[11px] text-muted-foreground">Actions</div>
                <div className="flex gap-2 mt-2">
                  <Button variant="outline" size="sm" onClick={autoAllocate} disabled={!activePay || openBills.length === 0}>
                    Auto allocate
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      await allocsQ.refetch();
                      await billsQ.refetch();
                      await billAllocSumsQ.refetch();
                      toast.success("Refreshed");
                    }}
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Refresh
                  </Button>
                </div>
              </Card>
            </div>

            <Card className="p-0 overflow-hidden shadow-premium">
              <div className="border-b bg-gradient-to-r from-background to-muted/30 px-4 py-3 flex items-center justify-between">
                <div className="text-sm font-semibold">Open Bills</div>
                <div className="text-xs text-muted-foreground">Type amount to apply per bill • Remaining is protected</div>
              </div>

              <div className="overflow-auto">
                <table className="w-full min-w-[1200px] text-sm">
                  <colgroup>
                    <col style={{ width: "18%" }} />
                    <col style={{ width: "14%" }} />
                    <col style={{ width: "14%" }} />
                    <col style={{ width: "14%" }} />
                    <col style={{ width: "14%" }} />
                    <col style={{ width: "14%" }} />
                    <col style={{ width: "12%" }} />
                  </colgroup>
                  <thead className="sticky top-0 bg-background border-b">
                    <tr>
                      <th className="px-4 py-3 text-left">Bill</th>
                      <th className="px-4 py-3 text-left">Bill Date</th>
                      <th className="px-4 py-3 text-left">Due</th>
                      <th className="px-4 py-3 text-right">Total</th>
                      <th className="px-4 py-3 text-right">Already Applied</th>
                      <th className="px-4 py-3 text-right">Remaining</th>
                      <th className="px-4 py-3 text-right">Apply Now</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {billsQ.isLoading || billAllocSumsQ.isLoading ? (
                      <tr><td colSpan={7} className="px-4 py-10 text-muted-foreground">Loading…</td></tr>
                    ) : openBills.length === 0 ? (
                      <tr><td colSpan={7} className="px-4 py-10 text-muted-foreground">No open bills found.</td></tr>
                    ) : (
                      openBills.map((b, idx) => {
                        const sums = billAllocSumsQ.data || new Map<number, number>();
                        const alreadyApplied = n0(sums.get(b.id) || 0);
                        const existingForThisPayment = n0(draft[b.id] || 0);
                        const remaining = Math.max(0, n0(b.total_amount) - (alreadyApplied - existingForThisPayment));

                        return (
                          <tr key={b.id} className={idx % 2 === 0 ? "bg-background hover:bg-muted/40" : "bg-muted/10 hover:bg-muted/40"}>
                            <td className="px-4 py-3">
                              <div className="font-semibold">{b.bill_no || `BILL-${String(b.id).padStart(5, "0")}`}</div>
                              <div className="text-xs text-muted-foreground">
                                <Badge tone="warn">{b.status}</Badge>
                              </div>
                            </td>
                            <td className="px-4 py-3">{b.bill_date}</td>
                            <td className="px-4 py-3">{b.due_date || "-"}</td>
                            <td className="px-4 py-3 text-right font-semibold">{b.currency} {money(b.total_amount)}</td>
                            <td className="px-4 py-3 text-right">Rs {money(alreadyApplied)}</td>
                            <td className={"px-4 py-3 text-right font-semibold " + (remaining > 0 ? "text-amber-800" : "text-emerald-700")}>
                              Rs {money(remaining)}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <Input
                                className="h-9 w-32 ml-auto text-right"
                                inputMode="decimal"
                                value={String(draft[b.id] ?? "")}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setDraft((d) => ({ ...d, [b.id]: v }));
                                }}
                                onBlur={() => {
                                  const v = n0(draft[b.id]);
                                  if (v <= 0) {
                                    setDraft((d) => {
                                      const next = { ...d };
                                      delete next[b.id];
                                      return next;
                                    });
                                    return;
                                  }
                                  const safe = Math.min(v, remaining);
                                  setDraft((d) => ({ ...d, [b.id]: String(safe) }));
                                }}
                                placeholder="0"
                              />
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              <div className="border-t px-4 py-3 text-xs text-muted-foreground">
                Save allocations to update bill statuses automatically.
              </div>
            </Card>
          </div>

          <div className="p-4 border-t flex items-center justify-end gap-2">
            <Button variant="outline" onClick={() => setAllocOpen(false)}>Close</Button>
            <Button
              className="gradient-primary shadow-glow text-primary-foreground"
              disabled={savingAlloc}
              onClick={saveAllocations}
            >
              {savingAlloc ? "Saving…" : "Save Allocations"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
