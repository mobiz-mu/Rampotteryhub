// src/pages/CreditNoteView.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import "@/styles/InvoiceCreate.css"; // ✅ reuse same theme/css as InvoiceCreate

import { supabase } from "@/integrations/supabase/client";
import { rpFetch } from "@/lib/rpFetch";
import { getAuditLogs } from "@/lib/creditNotes";
import { applyCreditNoteToInvoice, syncInvoiceCredits } from "@/lib/creditNotes"; // ✅ ensure these exist (see note below)

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { toast } from "sonner";
import {
  ArrowLeft,
  Ban,
  MoreHorizontal,
  Printer,
  Plus,
  RefreshCw,
  FileText,
  BadgeCheck,
  AlertTriangle,
  Link as LinkIcon,
  RotateCcw,
  HandCoins,
} from "lucide-react";

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
  if (st === "REFUNDED") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (st === "PENDING") return "bg-amber-50 text-amber-700 border-amber-200";
  if (st === "VOID") return "bg-slate-50 text-slate-600 border-slate-200";
  return "bg-rose-50 text-rose-700 border-rose-200"; // ISSUED
}

function fmtDate(v: any) {
  const s = String(v || "").trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  try {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d.toLocaleDateString();
  } catch {}
  return s || "—";
}

function fmtWhen(v: any) {
  try {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d.toLocaleString();
  } catch {}
  return String(v || "—");
}

type CN_UOM = "BOX" | "PCS" | "KG" | "G" | "BAG";

function normCnUom(it: any): CN_UOM {
  const u = String(it?.uom || "BOX").trim().toUpperCase();

  if (u === "PCS") return "PCS";
  if (u === "KG" || u === "KGS") return "KG";
  if (u === "G" || u === "GRAM" || u === "GRAMS") return "G";
  if (u === "BAG" || u === "BAGS") return "BAG";
  return "BOX";
}

function cnQtyInput(it: any): number | null {
  const u = normCnUom(it);

  const pick = (v: any) => {
    if (v === null || v === undefined || v === "") return null;
    const x = Number(v);
    return Number.isFinite(x) ? x : null;
  };

  if (u === "PCS") return pick(it?.pcs_qty) ?? pick(it?.total_qty);
  if (u === "G") return pick(it?.grams_qty) ?? pick(it?.total_qty);
  if (u === "BAG") return pick(it?.bags_qty) ?? pick(it?.total_qty);

  // BOX + KG use box_qty in your system
  return pick(it?.box_qty) ?? pick(it?.total_qty);
}

function fmtCnQty(u: CN_UOM, v: number | null) {
  if (v === null) return "";
  if (u === "KG") return String(Number(v.toFixed(3))); // 0.450
  if (u === "G") return String(Math.trunc(v));         // 250
  if (u === "BAG") return String(Math.trunc(v));       // 2
  return String(Math.trunc(v));                        // BOX/PCS
}


type CnRow = any;
type ItemRow = any;

export default function CreditNoteView() {
  const nav = useNavigate();
  const { id } = useParams();

  // ✅ stable/safe cnId
  const cnId = useMemo(() => {
    const raw = String(id || "").trim();
    const num = Number(raw);
    return Number.isFinite(num) && num > 0 ? num : 0;
  }, [id]);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [cn, setCn] = useState<CnRow | null>(null);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [actionBusy, setActionBusy] = useState(false);

  // hooks must be above returns
  const st = useMemo(() => cnStatus(cn?.status), [cn?.status]);
  const customer = useMemo(() => cn?.customers || null, [cn?.customers]);

  const totals = useMemo(() => {
    const subtotal = n(cn?.subtotal);
    const vat = n(cn?.vat_amount);
    const total = n(cn?.total_amount);
    return { subtotal, vat, total };
  }, [cn?.subtotal, cn?.vat_amount, cn?.total_amount]);

  const canVoid = useMemo(() => st !== "VOID", [st]);
  const canRefund = useMemo(() => st === "ISSUED" || st === "PENDING", [st]);
  const canRestore = useMemo(() => st === "VOID" || st === "REFUNDED", [st]);

  async function load() {
    setLoading(true);
    setErr(null);

    try {
      if (!cnId) throw new Error("Invalid credit note id");

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
          reason_note,
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

      const itQ = await supabase
  .from("credit_note_items")
  .select(
    `
    id,
    product_id,

    uom,
    box_qty,
    pcs_qty,
    grams_qty,
    bags_qty,
    units_per_box,

    total_qty,
    unit_price_excl_vat,
    unit_vat,
    unit_price_incl_vat,
    line_total,
    description,
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
      setCn(null);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cnId]);

  // Audit logs
  const auditQ = useQuery({
    queryKey: ["audit", "credit_notes", cnId],
    queryFn: () => getAuditLogs({ entity: "credit_notes", id: cnId }),
    enabled: cnId > 0,
    staleTime: 5_000,
  });

  async function afterStatusChange() {
    await load();
    await auditQ.refetch();

    // ✅ If linked invoice: recompute invoice credits+balance
    const invoiceId = Number(cn?.invoice_id || 0);
    if (invoiceId > 0) {
      try {
        await syncInvoiceCredits({ invoiceId }); // best: sums issued credit notes and updates invoice totals
      } catch (e: any) {
        // keep the page usable even if invoice sync fails
        toast("Invoice sync warning", { description: e?.message || "Could not refresh invoice balance automatically." });
      }
    }
  }

  async function onVoid() {
    if (!cn?.id) return;
    if (!canVoid) return;
    if (!confirm("Void this credit note?")) return;

    try {
      setActionBusy(true);

      const res = await rpFetch(`/api/credit-notes/${cn.id}/void`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) throw new Error(json?.error || "Void failed");

      toast("Voided", { description: "Credit note status updated." });
      await afterStatusChange();
    } catch (e: any) {
      toast("Void failed", { description: e?.message || "Error" });
    } finally {
      setActionBusy(false);
    }
  }

  async function onRefund() {
    if (!cn?.id) return;
    if (!canRefund) return;
    if (!confirm("Mark this credit note as REFUNDED?")) return;

    try {
      setActionBusy(true);

      const res = await rpFetch(`/api/credit-notes/${cn.id}/refund`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) throw new Error(json?.error || "Refund failed");

      toast("Refunded", { description: "Credit note marked as REFUNDED." });
      await afterStatusChange();
    } catch (e: any) {
      toast("Refund failed", { description: e?.message || "Error" });
    } finally {
      setActionBusy(false);
    }
  }

  async function onRestore() {
    if (!cn?.id) return;
    if (!canRestore) return;
    if (!confirm("Restore this credit note back to ISSUED?")) return;

    try {
      setActionBusy(true);

      const res = await rpFetch(`/api/credit-notes/${cn.id}/restore`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) throw new Error(json?.error || "Restore failed");

      toast("Restored", { description: "Credit note restored to ISSUED." });

      // ✅ If it was linked to an invoice, ensure it’s applied again (idempotent)
      if (cn.invoice_id) {
        try {
          await applyCreditNoteToInvoice({
            creditNoteId: cn.id,
            invoiceId: Number(cn.invoice_id),
            reason: cn.reason || null,
            reasonNote: cn.reason_note || null,
          });
        } catch (e: any) {
          toast("Restore note", { description: e?.message || "Could not re-apply invoice credit automatically." });
        }
      }

      await afterStatusChange();
    } catch (e: any) {
      toast("Restore failed", { description: e?.message || "Error" });
    } finally {
      setActionBusy(false);
    }
  }

  /** ✅ INTERNAL print */
  function onPrint() {
    if (!cn?.id) return;
    window.open(`/credit-notes/${cn.id}/print`, "_blank", "noopener,noreferrer");
  }

  /** ✅ PUBLIC share link */
  async function onSharePrint() {
    if (!cn?.id) return;

    try {
      setActionBusy(true);

      const res = await rpFetch(`/api/credit-notes/${cn.id}/public-link`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) throw new Error(json?.error || "Failed to generate share link");

      const token = String(json?.token || "").trim();
      if (!token) throw new Error("Token missing from server response");

      const origin = window.location.origin || "https://rampotteryhub.com";
      const url = `${origin}/credit-notes/${cn.id}/print?t=${encodeURIComponent(token)}`;

      try {
        await navigator.clipboard.writeText(url);
        toast("Public link copied", { description: "Link copied to clipboard and opened in a new tab." });
      } catch {
        toast("Public link generated", { description: "Opened in a new tab." });
      }

      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      toast("Share failed", { description: e?.message || "Error" });
    } finally {
      setActionBusy(false);
    }
  }

  // ===== returns after hooks =====
  if (loading) {
    return (
      <div className="space-y-4">
        <Card className="p-6 rounded-2xl border bg-white/80 shadow-sm text-sm text-muted-foreground">
          Loading...
        </Card>
      </div>
    );
  }

  if (err || !cn) {
    return (
      <div className="space-y-4">
        <Card className="p-6 rounded-2xl border bg-white/80 shadow-sm">
          <div className="flex items-start gap-2 text-rose-800">
            <AlertTriangle className="mt-0.5 h-4 w-4" />
            <div>
              <div className="font-semibold">Error</div>
              <div className="text-sm mt-1">{err || "Not found"}</div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => nav("/dashboard")} className="rounded-xl">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Dashboard
            </Button>
            <Button variant="outline" onClick={() => nav("/credit-notes")} className="rounded-xl">
              Back to list
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5 invoiceCreate">
      {/* Premium background hint */}
      <div className="pointer-events-none fixed inset-0 -z-10 opacity-60">
        <div className="absolute -top-24 left-1/2 h-72 w-[60rem] -translate-x-1/2 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-40 right-[-10rem] h-96 w-96 rounded-full bg-white/5 blur-3xl" />
      </div>

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => nav("/dashboard")} className="rounded-xl">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Dashboard
            </Button>
            <Button variant="outline" onClick={() => nav("/credit-notes")} className="rounded-xl">
              Back to list
            </Button>
          </div>

          <div className="hidden sm:block w-px bg-slate-200 mx-2" />

          <div>
            <div className="flex items-center gap-2">
              <div className="text-2xl font-semibold tracking-tight">
                Credit Note <span className="text-slate-900">{cn.credit_note_number || `#${cn.id}`}</span>
              </div>
              <span className={"inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold " + pillClass(st)}>
                {st}
              </span>
            </div>

            <div className="text-sm text-muted-foreground">
              Date: <b className="text-slate-800">{fmtDate(cn.credit_note_date)}</b>
              {cn.invoice_id ? (
                <>
                  {" "}
                  • Linked invoice:{" "}
                  <button
                    type="button"
                    className="underline text-slate-800 hover:text-slate-950"
                    onClick={() => nav(`/invoices/${cn.invoice_id}`)}
                    title="Open invoice"
                  >
                    #{cn.invoice_id}
                  </button>
                </>
              ) : (
                <> • <span className="text-slate-500">Standalone</span></>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onPrint} className="rounded-xl" disabled={actionBusy}>
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

            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuItem onClick={onPrint}>
                <Printer className="mr-2 h-4 w-4" />
                Print (internal)
              </DropdownMenuItem>

              <DropdownMenuItem onClick={onSharePrint}>
                <LinkIcon className="mr-2 h-4 w-4" />
                Share public print link
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem onClick={() => nav(`/credit-notes/create`)}>
                <Plus className="mr-2 h-4 w-4" />
                New Credit Note
              </DropdownMenuItem>

              <DropdownMenuItem onClick={() => load()} disabled={loading || actionBusy}>
                <RefreshCw className={"mr-2 h-4 w-4 " + (loading ? "animate-spin" : "")} />
                Refresh
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              {canRefund ? (
                <DropdownMenuItem onClick={onRefund} disabled={actionBusy}>
                  <HandCoins className="mr-2 h-4 w-4" />
                  Mark as Refunded
                </DropdownMenuItem>
              ) : null}

              {canRestore ? (
                <DropdownMenuItem onClick={onRestore} disabled={actionBusy}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Restore to Issued
                </DropdownMenuItem>
              ) : null}

              {canVoid ? (
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
        <Card className="p-4 rounded-2xl border bg-white/80 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-xs text-muted-foreground">Customer</div>
            <div className="inline-flex h-8 w-8 items-center justify-center rounded-xl border bg-white">
              <FileText className="h-4 w-4 text-slate-700" />
            </div>
          </div>

          <div className="mt-2 font-semibold text-slate-900">{customer?.name || "—"}</div>
          {customer?.customer_code ? <div className="text-xs text-slate-500">{customer.customer_code}</div> : null}
          <div className="mt-2 text-xs text-slate-500 space-y-1">
            {customer?.phone ? <div>{customer.phone}</div> : null}
            {customer?.email ? <div>{customer.email}</div> : null}
            {customer?.address ? (
              <div className="truncate" title={customer.address}>
                {customer.address}
              </div>
            ) : null}
          </div>
        </Card>

        <Card className="p-4 rounded-2xl border bg-white/80 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-xs text-muted-foreground">Status</div>
            <div className="inline-flex h-8 w-8 items-center justify-center rounded-xl border bg-white">
              <BadgeCheck className="h-4 w-4 text-slate-700" />
            </div>
          </div>

          <div className="mt-2">
            <span className={"inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold " + pillClass(st)}>
              {st}
            </span>
          </div>

          {cn.reason ? <div className="text-xs text-slate-500 mt-3">Reason: <b className="text-slate-800">{cn.reason}</b></div> : null}
          {cn.reason_note ? (
            <div className="text-xs text-slate-500 mt-1" title={cn.reason_note}>
              Note: <span className="text-slate-800">{cn.reason_note}</span>
            </div>
          ) : null}

          {cn.created_at ? <div className="text-xs text-slate-400 mt-2">Created: {fmtWhen(cn.created_at)}</div> : null}
        </Card>

        <Card className="p-4 rounded-2xl border bg-white/80 shadow-sm">
          <div className="text-xs text-muted-foreground">Totals</div>
          <div className="mt-2 space-y-1 text-sm">
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
      <Card className="overflow-hidden rounded-2xl border bg-white/80 shadow-sm">
        <div className="px-4 py-3 border-b bg-white/60">
          <div className="font-semibold">Items</div>
          <div className="text-xs text-muted-foreground">Products credited on this credit note</div>
        </div>

        <div className="overflow-auto">
          <table className="w-full min-w-[980px]">
            <thead className="bg-slate-50">
              <tr className="text-[12px] uppercase tracking-wide text-slate-600 border-b">
                <th className="px-4 py-3 text-left">#</th>
                <th className="px-4 py-3 text-left">Item</th>
                <th className="px-4 py-3 text-left">Code</th>
                <th className="px-4 py-3 text-right">Qty</th>
                <th className="px-4 py-3 text-right">Unit Ex</th>
                <th className="px-4 py-3 text-right">VAT</th>
                <th className="px-4 py-3 text-right">Total</th>
              </tr>
            </thead>

            <tbody className="divide-y">
              {items.map((it: any, idx: number) => {
                const code = it.products?.item_code || it.products?.sku || "—";
                return (
                  <tr key={it.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3">{idx + 1}</td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900">{it.products?.name || "—"}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">{code}</td>
                    <td className="px-4 py-3 text-right">
                        {(() => {
                          const u = normCnUom(it);
                          const q = cnQtyInput(it);
                          const t = fmtCnQty(u, q);
                          return t ? `${t} ${u}` : "—";
                     })()}
                    </td>
                    <td className="px-4 py-3 text-right">{n(it.unit_price_excl_vat).toFixed(2)}</td>
                    <td className="px-4 py-3 text-right">{n(it.unit_vat).toFixed(2)}</td>
                    <td className="px-4 py-3 text-right font-semibold">{n(it.line_total).toFixed(2)}</td>
                  </tr>
                );
              })}

              {items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-sm text-muted-foreground">
                    No items found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Audit Trail */}
      <Card className="p-4 rounded-2xl border bg-white/80 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="font-semibold">Audit trail</div>
            <div className="text-xs text-muted-foreground">Latest actions for this credit note</div>
          </div>

          <Button variant="outline" className="rounded-xl" onClick={() => auditQ.refetch()} disabled={auditQ.isFetching}>
            <RefreshCw className={"mr-2 h-4 w-4 " + (auditQ.isFetching ? "animate-spin" : "")} />
            {auditQ.isFetching ? "Refreshing..." : "Refresh"}
          </Button>
        </div>

        <div className="mt-3 overflow-auto">
          {auditQ.isError ? (
            <div className="text-sm text-rose-700">
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
                  const metaText = a.meta ? JSON.stringify(a.meta) : "";
                  return (
                    <tr key={a.id} className="hover:bg-slate-50/60">
                      <td className="px-3 py-2 whitespace-nowrap">{fmtWhen(a.created_at)}</td>
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


