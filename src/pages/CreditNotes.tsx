// src/pages/CreditNotes.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { MoreHorizontal, Eye, Printer, Ban, Undo2, BadgeCheck } from "lucide-react";
import { toast } from "sonner";

import {
  listCreditNotes,
  normalizeCustomer,
  normalizeCreditStatus,
  voidCreditNote,
  refundCreditNote,
  restoreCreditNote,
  type CreditNoteStatus,
} from "@/lib/creditNotes";

const n = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const rs = (v: any) =>
  `Rs ${n(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function statusPillClass(st: CreditNoteStatus) {
  if (st === "REFUNDED") return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (st === "PENDING") return "bg-amber-100 text-amber-700 border-amber-200";
  if (st === "VOID") return "bg-slate-100 text-slate-600 border-slate-200";
  return "bg-rose-100 text-rose-700 border-rose-200"; // ISSUED
}

type Row = any;

export default function CreditNotes() {
  const nav = useNavigate();
  const qc = useQueryClient();

  /* UI state */
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<CreditNoteStatus | "ALL">("ALL");

  /* Undo window bookkeeping */
  const undoTimers = useRef<Record<number, number>>({}); // cnId -> timeoutId

  /* Debounced search */
  useEffect(() => {
    const t = window.setTimeout(() => setQ(qInput.trim()), 250);
    return () => window.clearTimeout(t);
  }, [qInput]);

  const creditNotesQ = useQuery({
    queryKey: ["credit-notes", q, status],
    queryFn: () => listCreditNotes({ q, status, limit: 500 }),
    staleTime: 10_000,
  });

  const rows: Row[] = creditNotesQ.data || [];

  /* KPIs */
  const kpis = useMemo(() => {
    const total = rows.reduce((s: number, r: any) => s + n(r.total_amount), 0);
    const issued = rows.filter((r) => normalizeCreditStatus(r.status) === "ISSUED").length;
    const pending = rows.filter((r) => normalizeCreditStatus(r.status) === "PENDING").length;
    const voided = rows.filter((r) => normalizeCreditStatus(r.status) === "VOID").length;
    const refunded = rows.filter((r) => normalizeCreditStatus(r.status) === "REFUNDED").length;
    return { count: rows.length, total, issued, pending, voided, refunded };
  }, [rows]);

  // ---- helpers to update cache row status (optimistic) ----
  function patchRowStatusInCache(cnId: number, newStatus: CreditNoteStatus) {
    qc.setQueriesData({ queryKey: ["credit-notes"] }, (old: any) => {
      if (!Array.isArray(old)) return old;
      return old.map((r: any) => (r?.id === cnId ? { ...r, status: newStatus } : r));
    });

    // Your query key includes q/status, so also patch the exact key:
    qc.setQueryData(["credit-notes", q, status], (old: any) => {
      if (!Array.isArray(old)) return old;
      return old.map((r: any) => (r?.id === cnId ? { ...r, status: newStatus } : r));
    });
  }

  function clearUndoTimer(cnId: number) {
    const t = undoTimers.current[cnId];
    if (t) window.clearTimeout(t);
    delete undoTimers.current[cnId];
  }

  // ---- MUTATIONS ----

  // VOID (optimistic + undo window)
  const voidM = useMutation({
    mutationFn: async (creditNoteId: number) => voidCreditNote(creditNoteId),

    onMutate: async (creditNoteId: number) => {
      await qc.cancelQueries({ queryKey: ["credit-notes"] });

      // snapshot previous row
      const prev = qc.getQueryData(["credit-notes", q, status]) as any[] | undefined;
      const prevRow = (prev || []).find((x) => x?.id === creditNoteId);

      patchRowStatusInCache(creditNoteId, "VOID");

      // undo toast (10s)
      clearUndoTimer(creditNoteId);
      toast("Credit note voided", {
        description: "Undo available for 10 seconds.",
        action: {
          label: "Undo",
          onClick: () => restoreM.mutate(creditNoteId),
        },
      });

      undoTimers.current[creditNoteId] = window.setTimeout(() => {
        clearUndoTimer(creditNoteId);
      }, 10_000);

      return { prevRow };
    },

    onError: (err: any, creditNoteId: number, ctx: any) => {
      // revert
      const prev = ctx?.prevRow;
      if (prev) patchRowStatusInCache(creditNoteId, normalizeCreditStatus(prev.status));
      toast("Void failed", { description: err?.message || "Error" });
    },

    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["credit-notes"] });
    },
  });

  // REFUND (optimistic + undo window)
  const refundM = useMutation({
    mutationFn: async (creditNoteId: number) => refundCreditNote(creditNoteId),

    onMutate: async (creditNoteId: number) => {
      await qc.cancelQueries({ queryKey: ["credit-notes"] });

      const prev = qc.getQueryData(["credit-notes", q, status]) as any[] | undefined;
      const prevRow = (prev || []).find((x) => x?.id === creditNoteId);

      patchRowStatusInCache(creditNoteId, "REFUNDED");

      clearUndoTimer(creditNoteId);
      toast("Credit note refunded", {
        description: "Undo available for 10 seconds.",
        action: {
          label: "Undo",
          onClick: () => restoreM.mutate(creditNoteId),
        },
      });

      undoTimers.current[creditNoteId] = window.setTimeout(() => {
        clearUndoTimer(creditNoteId);
      }, 10_000);

      return { prevRow };
    },

    onError: (err: any, creditNoteId: number, ctx: any) => {
      const prev = ctx?.prevRow;
      if (prev) patchRowStatusInCache(creditNoteId, normalizeCreditStatus(prev.status));
      toast("Refund failed", { description: err?.message || "Error" });
    },

    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["credit-notes"] });
    },
  });

  // RESTORE (undo)
  const restoreM = useMutation({
    mutationFn: async (creditNoteId: number) => restoreCreditNote(creditNoteId),

    onMutate: async (creditNoteId: number) => {
      await qc.cancelQueries({ queryKey: ["credit-notes"] });

      const prev = qc.getQueryData(["credit-notes", q, status]) as any[] | undefined;
      const prevRow = (prev || []).find((x) => x?.id === creditNoteId);

      patchRowStatusInCache(creditNoteId, "ISSUED");
      clearUndoTimer(creditNoteId);

      return { prevRow };
    },

    onError: (err: any) => {
      toast("Undo failed", { description: err?.message || "Error" });
    },

    onSuccess: async () => {
      toast("Restored", { description: "Credit note is back to ISSUED." });
      await qc.invalidateQueries({ queryKey: ["credit-notes"] });
    },
  });

  // ---- ACTION HANDLERS ----
  function onVoid(r: Row) {
    if (!confirm("Void this credit note? This will reverse stock and can be undone for 10s.")) return;
    voidM.mutate(r.id);
  }

  function onRefund(r: Row) {
    if (!confirm("Mark as REFUNDED? This will reverse stock and can be undone for 10s.")) return;
    refundM.mutate(r.id);
  }

  function onRestore(r: Row) {
    if (!confirm("Restore this credit note back to ISSUED?")) return;
    restoreM.mutate(r.id);
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-2xl font-semibold">Credit Notes</div>
          <div className="text-sm text-muted-foreground">Reprint • Refunds • Void</div>
        </div>

        <div className="flex gap-2">
          {/* ✅ Back button (to dashboard) */}
          <Button variant="outline" onClick={() => nav("/dashboard")}>
            Back
          </Button>

          <Button onClick={() => nav("/credit-notes/create")}>+ New Credit Note</Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-4">
        <Card className="p-4">
          <b>{kpis.count}</b>
          <div className="text-xs text-muted-foreground">Credit Notes</div>
        </Card>

        <Card className="p-4">
          <b>{rs(kpis.total)}</b>
          <div className="text-xs text-muted-foreground">Total Value</div>
        </Card>

        <Card className="p-4">
          <b>{kpis.refunded}</b>
          <div className="text-xs text-muted-foreground">Refunded</div>
        </Card>

        <Card className="p-4">
          <b>{kpis.voided}</b>
          <div className="text-xs text-muted-foreground">Voided</div>
        </Card>
      </div>

      {/* Filters */}
      <Card className="p-4 flex flex-wrap gap-3 items-center">
        <Input
          placeholder="Search credit note / customer / code"
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
          className="max-w-[420px]"
        />

        <select
          className="h-10 rounded-md border px-3 bg-background"
          value={status}
          onChange={(e) => setStatus(e.target.value as any)}
        >
          <option value="ALL">All</option>
          <option value="ISSUED">Issued</option>
          <option value="PENDING">Pending</option>
          <option value="REFUNDED">Refunded</option>
          <option value="VOID">Void</option>
        </select>

        <Button variant="outline" onClick={() => creditNotesQ.refetch()} disabled={creditNotesQ.isFetching}>
          {creditNotesQ.isFetching ? "Refreshing..." : "Refresh"}
        </Button>
      </Card>

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="overflow-auto">
          <table className="w-full min-w-[980px]">
            <thead className="bg-slate-50">
              <tr className="text-[12px] uppercase tracking-wide text-slate-600 border-b">
                <th className="px-4 py-3 text-left">Credit Note</th>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Customer</th>
                <th className="px-4 py-3 text-left">Total</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-3 py-3 text-right" />
              </tr>
            </thead>

            <tbody className="divide-y">
              {rows.map((r: any) => {
                const st = normalizeCreditStatus(r.status);
                const c = normalizeCustomer(r.customers);

                const custName = c?.name || "—";
                const custCode = c?.customer_code || "";
                const cnNo = r.credit_note_number || `#${r.id}`;

                const busy = voidM.isPending || refundM.isPending || restoreM.isPending;

                return (
                  <tr key={r.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3">
                      <div className="inline-flex items-center justify-center border rounded-md px-3 py-2 font-semibold text-slate-800 bg-white">
                        {cnNo}
                      </div>
                    </td>

                    <td className="px-4 py-3 text-sm text-slate-700">{r.credit_note_date || "—"}</td>

                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900">{custName}</div>
                      {custCode ? <div className="text-xs text-slate-500">{custCode}</div> : null}
                    </td>

                    <td className="px-4 py-3 text-sm">
                      <div className="text-slate-500">Rs</div>
                      <div className="text-slate-900">{n(r.total_amount).toFixed(2)}</div>
                    </td>

                    <td className="px-4 py-3">
                      <span
                        className={
                          "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold " +
                          statusPillClass(st)
                        }
                      >
                        {st === "PENDING" ? "Pending" : st === "ISSUED" ? "Issued" : st}
                      </span>
                    </td>

                    {/* 3 dots menu (logic expanded) */}
                    <td className="px-3 py-3 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className="h-9 w-9 inline-flex items-center justify-center rounded-full border bg-white hover:bg-slate-50"
                            aria-label="Actions"
                          >
                            <MoreHorizontal className="h-5 w-5 text-slate-700" />
                          </button>
                        </DropdownMenuTrigger>

                        <DropdownMenuContent align="end" className="w-52">
                          <DropdownMenuItem onClick={() => nav(`/credit-notes/${r.id}`)}>
                            <Eye className="mr-2 h-4 w-4" />
                            Open
                          </DropdownMenuItem>

                          <DropdownMenuItem onClick={() => nav(`/credit-notes/${r.id}/print`)}>
                            <Printer className="mr-2 h-4 w-4" />
                            Print
                          </DropdownMenuItem>

                          <DropdownMenuSeparator />

                          {/* REFUND vs VOID split */}
                          {st !== "REFUNDED" && st !== "VOID" ? (
                            <>
                              <DropdownMenuItem onClick={() => onRefund(r)} disabled={busy}>
                                <BadgeCheck className="mr-2 h-4 w-4" />
                                Mark Refunded
                              </DropdownMenuItem>

                              <DropdownMenuItem onClick={() => onVoid(r)} disabled={busy}>
                                <Ban className="mr-2 h-4 w-4" />
                                Void
                              </DropdownMenuItem>
                            </>
                          ) : null}

                          {/* Restore (Undo) if already VOID/REFUNDED */}
                          {st === "VOID" || st === "REFUNDED" ? (
                            <DropdownMenuItem onClick={() => onRestore(r)} disabled={busy}>
                              <Undo2 className="mr-2 h-4 w-4" />
                              Restore to Issued
                            </DropdownMenuItem>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                );
              })}

              {!creditNotesQ.isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-sm text-muted-foreground">
                    No credit notes found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}



