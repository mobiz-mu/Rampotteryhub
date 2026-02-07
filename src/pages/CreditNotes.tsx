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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import {
  MoreHorizontal,
  Eye,
  Printer,
  Ban,
  Undo2,
  BadgeCheck,
  RefreshCw,
  Search,
  Filter,
  FileText,
} from "lucide-react";
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

/* =========================
   Helpers
========================= */
const n = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);

const rs = (v: any) =>
  `Rs ${n(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function fmtDateYMD(v: any) {
  const s = String(v || "").trim();
  if (!s) return "—";
  // already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return s;
}

function statusPillClass(st: CreditNoteStatus) {
  if (st === "REFUNDED") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (st === "PENDING") return "bg-amber-50 text-amber-700 border-amber-200";
  if (st === "VOID") return "bg-slate-50 text-slate-600 border-slate-200";
  return "bg-rose-50 text-rose-700 border-rose-200"; // ISSUED
}

function statusLabel(st: CreditNoteStatus) {
  if (st === "ISSUED") return "Issued";
  if (st === "PENDING") return "Pending";
  if (st === "VOID") return "Voided";
  if (st === "REFUNDED") return "Refunded";
  return st;
}

function canRefund(st: CreditNoteStatus) {
  return st !== "REFUNDED" && st !== "VOID";
}
function canVoid(st: CreditNoteStatus) {
  return st !== "VOID";
}
function canRestore(st: CreditNoteStatus) {
  return st === "VOID" || st === "REFUNDED";
}

type Row = any;

export default function CreditNotes() {
  const nav = useNavigate();
  const qc = useQueryClient();

  /* =========================
     UI STATE (matches invoices behavior)
  ========================= */
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<CreditNoteStatus | "ALL">("ALL");

  // keyboard focus for search
  const searchRef = useRef<HTMLInputElement | null>(null);

  /* Undo window bookkeeping */
  const undoTimers = useRef<Record<number, number>>({}); // cnId -> timeoutId

  /* Debounced search */
  useEffect(() => {
    const t = window.setTimeout(() => setQ(qInput.trim()), 250);
    return () => window.clearTimeout(t);
  }, [qInput]);

  /* =========================
     Data
  ========================= */
  const creditNotesQ = useQuery({
    queryKey: ["credit-notes", q, status],
    queryFn: () => listCreditNotes({ q, status, limit: 500 }),
    staleTime: 10_000,
  });

  const rows: Row[] = Array.isArray(creditNotesQ.data) ? creditNotesQ.data : [];

  /* KPIs */
  const kpis = useMemo(() => {
    const total = rows.reduce((s: number, r: any) => s + n(r.total_amount), 0);
    const issued = rows.filter((r) => normalizeCreditStatus(r.status) === "ISSUED").length;
    const pending = rows.filter((r) => normalizeCreditStatus(r.status) === "PENDING").length;
    const voided = rows.filter((r) => normalizeCreditStatus(r.status) === "VOID").length;
    const refunded = rows.filter((r) => normalizeCreditStatus(r.status) === "REFUNDED").length;
    return { count: rows.length, total, issued, pending, voided, refunded };
  }, [rows]);

  /* =========================
     Cache patch helpers (optimistic)
  ========================= */
  function patchRowStatusInCache(cnId: number, newStatus: CreditNoteStatus) {
    // broad key
    qc.setQueriesData({ queryKey: ["credit-notes"] }, (old: any) => {
      if (!Array.isArray(old)) return old;
      return old.map((r: any) => (r?.id === cnId ? { ...r, status: newStatus } : r));
    });

    // current filtered key
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

  /* =========================
     Mutations (void/refund/restore)
  ========================= */
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

  const voidM = useMutation({
    mutationFn: async (creditNoteId: number) => voidCreditNote(creditNoteId),

    onMutate: async (creditNoteId: number) => {
      await qc.cancelQueries({ queryKey: ["credit-notes"] });

      const prev = qc.getQueryData(["credit-notes", q, status]) as any[] | undefined;
      const prevRow = (prev || []).find((x) => x?.id === creditNoteId);

      patchRowStatusInCache(creditNoteId, "VOID");

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
      const prev = ctx?.prevRow;
      if (prev) patchRowStatusInCache(creditNoteId, normalizeCreditStatus(prev.status));
      toast("Void failed", { description: err?.message || "Error" });
    },

    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["credit-notes"] });
    },
  });

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

  const busy = voidM.isPending || refundM.isPending || restoreM.isPending;

  /* =========================
     Action handlers
  ========================= */
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

  function clearFilters() {
    setQInput("");
    setStatus("ALL");
    window.setTimeout(() => searchRef.current?.focus?.(), 0);
  }

  /* =========================
     Render
  ========================= */
  return (
    <div className="space-y-5">
      {/* Premium background hint (same vibe as invoices pages) */}
      <div className="pointer-events-none fixed inset-0 -z-10 opacity-60">
        <div className="absolute -top-24 left-1/2 h-72 w-[60rem] -translate-x-1/2 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-40 right-[-10rem] h-96 w-96 rounded-full bg-white/5 blur-3xl" />
      </div>

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 inline-flex h-10 w-10 items-center justify-center rounded-2xl border bg-white shadow-sm">
            <FileText className="h-5 w-5 text-slate-800" />
          </div>

          <div>
            <div className="text-2xl font-semibold tracking-tight">Credit Notes</div>
            <div className="text-sm text-muted-foreground">VAT Credit Notes • Reprint • Refund • Void</div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => nav("/dashboard")}>
            Back
          </Button>
          <Button onClick={() => nav("/credit-notes/create")}>+ New Credit Note</Button>
        </div>
      </div>

      {/* KPI strip (same compact card feel as invoices) */}
      <div className="grid gap-3 sm:grid-cols-5">
        <Card className="p-4 rounded-2xl border bg-white/80 shadow-sm">
          <div className="text-xs text-muted-foreground">Credit Notes</div>
          <div className="mt-2 text-2xl font-semibold">{kpis.count}</div>
          <div className="mt-1 text-xs text-slate-500">Total records in view</div>
        </Card>

        <Card className="p-4 rounded-2xl border bg-white/80 shadow-sm">
          <div className="text-xs text-muted-foreground">Total Value</div>
          <div className="mt-2 text-2xl font-semibold">{rs(kpis.total)}</div>
          <div className="mt-1 text-xs text-slate-500">Sum of totals</div>
        </Card>

        <Card className="p-4 rounded-2xl border bg-white/80 shadow-sm">
          <div className="text-xs text-muted-foreground">Issued</div>
          <div className="mt-2 text-2xl font-semibold">{kpis.issued}</div>
          <div className="mt-1 text-xs text-slate-500">Active credit notes</div>
        </Card>

        <Card className="p-4 rounded-2xl border bg-white/80 shadow-sm">
          <div className="text-xs text-muted-foreground">Refunded</div>
          <div className="mt-2 text-2xl font-semibold">{kpis.refunded}</div>
          <div className="mt-1 text-xs text-slate-500">Money returned</div>
        </Card>

        <Card className="p-4 rounded-2xl border bg-white/80 shadow-sm">
          <div className="text-xs text-muted-foreground">Voided</div>
          <div className="mt-2 text-2xl font-semibold">{kpis.voided}</div>
          <div className="mt-1 text-xs text-slate-500">Cancelled notes</div>
        </Card>
      </div>

      {/* Filters (match Invoice list style: search + status + refresh) */}
      <Card className="p-4 rounded-2xl border bg-white/80 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full max-w-[520px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              ref={searchRef}
              placeholder="Search: credit note no • customer • code • date"
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              className="pl-9"
              onKeyDown={(e) => {
                if (e.key === "Escape") clearFilters();
              }}
            />
          </div>

          <div className="inline-flex items-center gap-2">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl border bg-white">
              <Filter className="h-4 w-4 text-slate-700" />
            </div>

            <select
              className="h-10 rounded-xl border px-3 bg-white text-sm text-slate-900 outline-none"
              value={status}
              onChange={(e) => setStatus(e.target.value as any)}
            >
              <option value="ALL">All</option>
              <option value="ISSUED">Issued</option>
              <option value="PENDING">Pending</option>
              <option value="REFUNDED">Refunded</option>
              <option value="VOID">Void</option>
            </select>

            <Button variant="outline" onClick={clearFilters} className="rounded-xl">
              Clear
            </Button>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => creditNotesQ.refetch()}
              disabled={creditNotesQ.isFetching}
              className="rounded-xl"
            >
              <RefreshCw className={"mr-2 h-4 w-4 " + (creditNotesQ.isFetching ? "animate-spin" : "")} />
              {creditNotesQ.isFetching ? "Refreshing..." : "Refresh"}
            </Button>
          </div>
        </div>
      </Card>

      {/* Table (polished, consistent spacing, better empty/loading states) */}
      <Card className="overflow-hidden rounded-2xl border bg-white/80 shadow-sm">
        {/* header row inside card */}
        <div className="px-4 py-4 border-b flex flex-wrap items-center justify-between gap-2 bg-white/60">
          <div>
            <div className="text-sm font-semibold text-slate-900">Credit Notes</div>
            <div className="text-xs text-muted-foreground">
              {status !== "ALL" ? (
                <>
                  Filter: <b>{statusLabel(status as CreditNoteStatus)}</b>
                </>
              ) : (
                <>All statuses</>
              )}
              {q ? (
                <>
                  {" "}
                  • Search: <b>{q}</b>
                </>
              ) : null}
            </div>
          </div>

          <div className="text-xs text-slate-600">
            {creditNotesQ.isFetching ? (
              <span className="inline-flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                Updating…
              </span>
            ) : (
              <span className="inline-flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Live
              </span>
            )}
          </div>
        </div>

        <div className="overflow-auto">
          <table className="w-full min-w-[1040px]">
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
              {creditNotesQ.isLoading ? (
                <tr>
                  <td colSpan={6} className="p-10">
                    <div className="text-sm text-muted-foreground">Loading credit notes…</div>
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-10 text-center">
                    <div className="mx-auto max-w-sm">
                      <div className="text-base font-semibold text-slate-900">No credit notes found</div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        Try clearing filters or create your first credit note.
                      </div>
                      <div className="mt-4 flex items-center justify-center gap-2">
                        <Button variant="outline" onClick={clearFilters}>
                          Clear filters
                        </Button>
                        <Button onClick={() => nav("/credit-notes/create")}>+ New Credit Note</Button>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                rows.map((r: any) => {
                  const st = normalizeCreditStatus(r.status);
                  const c = normalizeCustomer(r.customers);

                  const custName = c?.name || "—";
                  const custCode = c?.customer_code || "";
                  const cnNo = r.credit_note_number || `#${r.id}`;

                  return (
                    <tr key={r.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3">
                        <div className="inline-flex items-center gap-2">
                          <div className="inline-flex items-center justify-center rounded-xl border bg-white px-3 py-2 font-semibold tracking-wide text-slate-900 shadow-sm">
                            {cnNo}
                          </div>
                        </div>
                        <div className="mt-1 text-xs text-slate-500">ID: {r.id}</div>
                      </td>

                      <td className="px-4 py-3 text-sm text-slate-700">{fmtDateYMD(r.credit_note_date)}</td>

                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{custName}</div>
                        {custCode ? <div className="text-xs text-slate-500">{custCode}</div> : null}
                      </td>

                      <td className="px-4 py-3">
                        <div className="text-xs text-slate-500">Total</div>
                        <div className="text-sm font-semibold text-slate-900">{rs(r.total_amount)}</div>
                      </td>

                      <td className="px-4 py-3">
                        <span
                          className={
                            "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold " +
                            statusPillClass(st)
                          }
                        >
                          {statusLabel(st)}
                        </span>
                      </td>

                      {/* Actions */}
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

                          <DropdownMenuContent align="end" className="w-56">
                            <DropdownMenuLabel className="text-xs text-muted-foreground">
                              Actions
                            </DropdownMenuLabel>

                            <DropdownMenuItem onClick={() => nav(`/credit-notes/${r.id}`)}>
                              <Eye className="mr-2 h-4 w-4" />
                              Open
                            </DropdownMenuItem>

                            <DropdownMenuItem
                              onClick={() =>
                                window.open(`/credit-notes/${r.id}/print`, "_blank", "noopener,noreferrer")
                              }
                            >
                              <Printer className="mr-2 h-4 w-4" />
                              Print
                            </DropdownMenuItem>

                            <DropdownMenuSeparator />

                            {canRefund(st) ? (
                              <DropdownMenuItem onClick={() => onRefund(r)} disabled={busy}>
                                <BadgeCheck className="mr-2 h-4 w-4" />
                                Mark Refunded
                              </DropdownMenuItem>
                            ) : null}

                            {canVoid(st) ? (
                              <DropdownMenuItem onClick={() => onVoid(r)} disabled={busy}>
                                <Ban className="mr-2 h-4 w-4" />
                                Void
                              </DropdownMenuItem>
                            ) : null}

                            {canRestore(st) ? (
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
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer (same as invoice list style) */}
        <div className="border-t bg-white/70 px-4 py-3 text-xs text-slate-600 flex flex-wrap items-center justify-between gap-2">
          <div>
            Showing <b>{rows.length}</b> result(s)
            {status !== "ALL" ? (
              <>
                {" "}
                • Status: <b>{statusLabel(status as CreditNoteStatus)}</b>
              </>
            ) : null}
            {q ? (
              <>
                {" "}
                • Search: <b>{q}</b>
              </>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-2">
              <span className={"h-2 w-2 rounded-full " + (creditNotesQ.isFetching ? "bg-amber-500" : "bg-emerald-500")} />
              {creditNotesQ.isFetching ? "Updating…" : "Live"}
            </span>
          </div>
        </div>
      </Card>
    </div>
  );
}



