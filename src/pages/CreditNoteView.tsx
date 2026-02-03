// src/pages/CreditNoteView.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { createClient } from "@supabase/supabase-js";
import { useQuery } from "@tanstack/react-query";

import { rpFetch } from "@/lib/rpFetch";
import { getAuditLogs } from "@/lib/creditNotes";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { MoreHorizontal, Printer, Eye, Ban, ArrowLeft } from "lucide-react";

/* =========================
   Supabase (Direct - Vite)
========================= */
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

function mustEnv(v: string | undefined, name: string) {
  if (!v) throw new Error(`${name} missing in .env (restart Vite after adding it).`);
  return v;
}

const supabase = createClient(
  mustEnv(SUPABASE_URL, "VITE_SUPABASE_URL"),
  mustEnv(SUPABASE_ANON_KEY, "VITE_SUPABASE_ANON_KEY")
);

/* =========================
   Helpers
========================= */
const n = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);

function rs(v: any) {
  return `Rs ${n(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function cnStatus(s: any) {
  const v = String(s || "").toUpperCase();
  if (v === "VOID") return "VOID";
  if (v === "REFUNDED") return "REFUNDED";
  if (v === "PENDING") return "PENDING";
  return "ISSUED";
}

function pillClass(st: string) {
  if (st === "REFUNDED") return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (st === "PENDING") return "bg-amber-100 text-amber-700 border-amber-200";
  if (st === "VOID") return "bg-slate-100 text-slate-600 border-slate-200";
  return "bg-rose-100 text-rose-700 border-rose-200";
}

function fmtDate(v: any) {
  const s = String(v || "").trim();
  // supports yyyy-mm-dd
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  // fallback to locale
  try {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d.toLocaleDateString();
  } catch {}
  return s || "—";
}

export default function CreditNoteView() {
  const nav = useNavigate();
  const { id } = useParams();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [cn, setCn] = useState<any | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [actionBusy, setActionBusy] = useState(false);

  const st = useMemo(() => cnStatus(cn?.status), [cn?.status]);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const raw = String(id || "").trim();
      if (!raw) throw new Error("Missing credit note id");

      const cnId = Number(raw);
      if (!Number.isFinite(cnId) || cnId <= 0) throw new Error("Invalid credit note id");

      // header + customer
      const cnQ = await supabase
        .from("credit_notes")
        .select(
          `
          id,
          credit_note_number,
          credit_note_date,
          customer_id,
          invoice_id,
          reason,
          subtotal,
          vat_amount,
          total_amount,
          status,
          created_at,
          customers:customer_id (
            id,
            name,
            phone,
            email,
            address,
            customer_code
          )
        `
        )
        .eq("id", cnId)
        .single();

      if (cnQ.error) throw new Error(cnQ.error.message);

      const creditNote = cnQ.data;

      // items + product
      const itQ = await supabase
        .from("credit_note_items")
        .select(
          `
          id,
          product_id,
          total_qty,
          unit_price_excl_vat,
          unit_vat,
          unit_price_incl_vat,
          line_total,
          products:product_id (
            id,
            name,
            item_code,
            sku
          )
        `
        )
        .eq("credit_note_id", creditNote.id)
        .order("id", { ascending: true });

      if (itQ.error) throw new Error(itQ.error.message);

      setCn(creditNote);
      setItems(itQ.data || []);
    } catch (e: any) {
      setErr(e?.message || "Failed to load credit note");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // ✅ Audit logs via backend endpoint
  const cnId = Number(id || 0);
  const auditQ = useQuery({
    queryKey: ["audit", "credit_notes", cnId],
    queryFn: () => getAuditLogs({ entity: "credit_notes", id: cnId }),
    enabled: Number.isFinite(cnId) && cnId > 0,
    staleTime: 5_000,
  });

  async function onVoid() {
    if (!cn?.id) return;
    if (st === "VOID") return;
    if (!confirm("Void this credit note? This cannot be undone.")) return;

    try {
      setActionBusy(true);

      // ✅ Use backend route (works even if RLS blocks anon UPDATE)
      const res = await rpFetch(`/api/credit-notes/${cn.id}/void`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) throw new Error(json?.error || "Void failed");

      await load();
      await auditQ.refetch();
    } catch (e: any) {
      alert(e?.message || "Void failed");
    } finally {
      setActionBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Card className="p-6 text-sm text-muted-foreground">Loading...</Card>
      </div>
    );
  }

  if (err || !cn) {
    return (
      <div className="space-y-4">
        <Card className="p-6">
          <div className="font-semibold text-rose-700">Error</div>
          <div className="text-sm text-rose-700/90 mt-1">{err || "Not found"}</div>
          <div className="mt-4 flex gap-2">
            <Button variant="outline" onClick={() => nav("/dashboard")}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Dashboard
            </Button>
            <Button variant="outline" onClick={() => nav("/credit-notes")}>
              Back to list
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const customer = cn.customers || null;

  const totals = useMemo(() => {
    const subtotal = n(cn?.subtotal);
    const vat = n(cn?.vat_amount);
    const total = n(cn?.total_amount);
    return { subtotal, vat, total };
  }, [cn?.subtotal, cn?.vat_amount, cn?.total_amount]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-start gap-3">
          {/* ✅ Back to Dashboard */}
          <Button variant="outline" onClick={() => nav("/dashboard")} className="mt-1">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Dashboard
          </Button>

          {/* Keep your back-to-list too (no redesign, just useful) */}
          <Button variant="outline" onClick={() => nav("/credit-notes")} className="mt-1">
            Back to list
          </Button>

          <div>
            <div className="text-2xl font-semibold">
              Credit Note{" "}
              <span className="text-slate-900">{cn.credit_note_number || `#${cn.id}`}</span>
            </div>
            <div className="text-sm text-muted-foreground">
              Date: <b className="text-slate-800">{fmtDate(cn.credit_note_date)}</b>
              {cn.invoice_id ? (
                <>
                  {" "}
                  • Invoice ID: <b className="text-slate-800">{cn.invoice_id}</b>
                </>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => nav(`/credit-notes/${cn.id}/print`)}>
            <Printer className="mr-2 h-4 w-4" />
            Print
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="h-10 w-10 inline-flex items-center justify-center rounded-full border bg-white hover:bg-slate-50"
                aria-label="Actions"
                disabled={actionBusy}
                title={actionBusy ? "Please wait..." : "Actions"}
              >
                <MoreHorizontal className="h-5 w-5 text-slate-700" />
              </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={() => nav(`/credit-notes/${cn.id}/print`)}>
                <Printer className="mr-2 h-4 w-4" />
                Print
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem onClick={() => nav(`/credit-notes/create`)}>
                <Eye className="mr-2 h-4 w-4" />
                New Credit Note
              </DropdownMenuItem>

              {st !== "VOID" ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onVoid} disabled={actionBusy}>
                    <Ban className="mr-2 h-4 w-4" />
                    Void
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Top cards */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Customer</div>
          <div className="font-semibold text-slate-900">{customer?.name || "—"}</div>
          {customer?.customer_code ? (
            <div className="text-xs text-slate-500">{customer.customer_code}</div>
          ) : null}
          {customer?.phone ? <div className="text-xs text-slate-500 mt-1">{customer.phone}</div> : null}
        </Card>

        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Status</div>
          <div className="mt-1">
            <span
              className={
                "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold " +
                pillClass(st)
              }
            >
              {st}
            </span>
          </div>
          {cn.reason ? <div className="text-xs text-slate-500 mt-2">Reason: {cn.reason}</div> : null}
        </Card>

        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Totals</div>
          <div className="mt-1 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-600">Subtotal</span>
              <b className="text-slate-900">{rs(totals.subtotal)}</b>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">VAT</span>
              <b className="text-slate-900">{rs(totals.vat)}</b>
            </div>
            <div className="h-px bg-slate-200 my-1" />
            <div className="flex justify-between">
              <span className="text-slate-600">Total</span>
              <b className="text-slate-900">{rs(totals.total)}</b>
            </div>
          </div>
        </Card>
      </div>

      {/* Items */}
      <Card className="overflow-hidden">
        <div className="overflow-auto">
          <table className="w-full min-w-[980px]">
            <thead className="bg-slate-50">
              <tr className="text-[12px] uppercase tracking-wide text-slate-600 border-b">
                <th className="px-4 py-3 text-left">#</th>
                <th className="px-4 py-3 text-left">Item</th>
                <th className="px-4 py-3 text-left">Description</th>
                <th className="px-4 py-3 text-right">Qty</th>
                <th className="px-4 py-3 text-right">Unit Ex</th>
                <th className="px-4 py-3 text-right">VAT</th>
                <th className="px-4 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((it: any, idx: number) => (
                <tr key={it.id}>
                  <td className="px-4 py-3">{idx + 1}</td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-900">{it.products?.name || "—"}</div>
                    <div className="text-xs text-slate-500">{it.products?.item_code || it.products?.sku || ""}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">{it.description || "—"}</td>
                  <td className="px-4 py-3 text-right">{n(it.total_qty)}</td>
                  <td className="px-4 py-3 text-right">{n(it.unit_price_excl_vat).toFixed(2)}</td>
                  <td className="px-4 py-3 text-right">{n(it.unit_vat).toFixed(2)}</td>
                  <td className="px-4 py-3 text-right font-semibold">{n(it.line_total).toFixed(2)}</td>
                </tr>
              ))}
              {items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-sm text-muted-foreground">
                    No items found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ✅ Audit Trail (simple section, no redesign) */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-semibold">Audit trail</div>
            <div className="text-xs text-muted-foreground">Latest actions for this credit note</div>
          </div>
          <Button variant="outline" onClick={() => auditQ.refetch()} disabled={auditQ.isFetching}>
            {auditQ.isFetching ? "Refreshing..." : "Refresh"}
          </Button>
        </div>

        <div className="mt-3 overflow-auto">
          {auditQ.isError ? (
            <div className="text-sm text-red-600">
              {String((auditQ.error as any)?.message || "Failed to load audit")}
            </div>
          ) : null}

          {!auditQ.isLoading && (auditQ.data?.length || 0) === 0 ? (
            <div className="text-sm text-muted-foreground">No audit entries yet.</div>
          ) : null}

          {(auditQ.data?.length || 0) > 0 ? (
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-slate-50">
                <tr className="text-[12px] uppercase tracking-wide text-slate-600 border-b">
                  <th className="px-3 py-2 text-left">When</th>
                  <th className="px-3 py-2 text-left">Action</th>
                  <th className="px-3 py-2 text-left">By</th>
                  <th className="px-3 py-2 text-left">Meta</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {auditQ.data!.map((a: any) => {
                  const by = a.actor?.name || a.actor?.username || a.actor?.id || (a.actor ? "User" : "System");
                  const when = new Date(a.created_at).toLocaleString();
                  const metaText = a.meta ? JSON.stringify(a.meta) : "";

                  return (
                    <tr key={a.id}>
                      <td className="px-3 py-2 whitespace-nowrap">{when}</td>
                      <td className="px-3 py-2 font-semibold">{a.action}</td>
                      <td className="px-3 py-2">{by}</td>
                      <td className="px-3 py-2">
                        <div className="max-w-[520px] truncate" title={metaText}>
                          {metaText}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : null}
        </div>
      </Card>
    </div>
  );
}

