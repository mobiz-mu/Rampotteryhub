// src/pages/CreditNoteCreate.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

import "@/styles/InvoiceCreate.css"; // ✅ reuse same theme/css as InvoiceCreate

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { toast } from "sonner";

import {
  MoreHorizontal,
  Plus,
  Save,
  Trash2,
  Search,
  ArrowLeft,
  RefreshCw,
  Receipt,
  BadgePercent,
  FileText,
  AlertTriangle,
} from "lucide-react";

/* =========================
   Helpers
========================= */
const n = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);

function rs(v: any) {
  return `Rs ${n(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function todayISO() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function pad4(x: number) {
  return String(x).padStart(4, "0");
}

async function nextCreditNoteNumber(): Promise<string> {
  const { data, error } = await supabase
    .from("credit_notes")
    .select("credit_note_number, id")
    .order("id", { ascending: false })
    .limit(1);

  if (error) throw new Error(error.message);

  const last = data?.[0]?.credit_note_number || "";
  const m = String(last).match(/(\d+)\s*$/);
  const next = m ? Number(m[1]) + 1 : data?.[0]?.id ? Number(data[0].id) + 1 : 1;

  return `CN-${pad4(next)}`;
}

/* =========================
   Types
========================= */
type CustomerOpt = {
  id: number;
  name: string;
  customer_code?: string | null;
  phone?: string | null;
  address?: string | null;
};

type ProductOpt = {
  id: number;
  name: string;
  item_code?: string | null;
  sku?: string | null;
};

/** Same editable row structure as InvoiceCreate */
type Line = {
  key: string;
  product_id: number | null;
  product_label: string;
  qty: number;
  unit_excl: number;
  vat_rate: number; // percent
};

function lineCalc(l: Line) {
  const qty = Math.max(0, n(l.qty));
  const unitEx = Math.max(0, n(l.unit_excl));
  const rate = Math.max(0, n(l.vat_rate));
  const unitVat = unitEx * (rate / 100);
  const unitInc = unitEx + unitVat;
  const lineTotal = qty * unitInc;
  return { qty, unitEx, unitVat, unitInc, lineTotal };
}

function pickLabel(p?: ProductOpt | null) {
  if (!p) return "";
  return `${p.name}${p.item_code ? ` • ${p.item_code}` : ""}${p.sku ? ` • ${p.sku}` : ""}`;
}

/* =========================
   Page
========================= */
export default function CreditNoteCreate() {
  const nav = useNavigate();

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // header fields
  const [creditNoteNo, setCreditNoteNo] = useState<string>("");
  const [date, setDate] = useState<string>(todayISO());

  // links / metadata
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [invoiceId, setInvoiceId] = useState<string>(""); // optional
  const [reason, setReason] = useState<string>("");

  // options
  const [customers, setCustomers] = useState<CustomerOpt[]>([]);
  const [products, setProducts] = useState<ProductOpt[]>([]);

  // lines
  const [lines, setLines] = useState<Line[]>([
    { key: crypto.randomUUID(), product_id: null, product_label: "", qty: 1, unit_excl: 0, vat_rate: 15 },
  ]);

  // dialogs
  const [custOpen, setCustOpen] = useState(false);
  const [prodOpen, setProdOpen] = useState(false);
  const [custSearch, setCustSearch] = useState("");
  const [prodSearch, setProdSearch] = useState("");
  const [prodPickForLine, setProdPickForLine] = useState<string | null>(null);

  // refs (nice UX like InvoiceCreate)
  const saveBtnRef = useRef<HTMLButtonElement | null>(null);

  const customerLabel = useMemo(() => {
    const c = customers.find((x) => x.id === customerId);
    if (!c) return "";
    return c.customer_code ? `${c.name} (${c.customer_code})` : c.name;
  }, [customers, customerId]);

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === customerId) || null,
    [customers, customerId]
  );

  const totals = useMemo(() => {
    const computed = lines.map(lineCalc);
    const subtotal = computed.reduce((s, r) => s + r.qty * r.unitEx, 0);
    const vat_amount = computed.reduce((s, r) => s + r.qty * r.unitVat, 0);
    const total_amount = subtotal + vat_amount;
    return { subtotal, vat_amount, total_amount };
  }, [lines]);

  const filteredCustomers = useMemo(() => {
    const q = custSearch.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) => {
      const hay = `${c.name || ""} ${c.customer_code || ""} ${c.phone || ""} ${c.address || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [customers, custSearch]);

  const filteredProducts = useMemo(() => {
    const q = prodSearch.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => {
      const hay = `${p.name || ""} ${p.item_code || ""} ${p.sku || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [products, prodSearch]);

  async function loadOptions() {
    setErr(null);
    try {
      const [cnNo, custQ, prodQ] = await Promise.all([
        nextCreditNoteNumber(),
        supabase
          .from("customers")
          .select("id,name,customer_code,phone,address")
          .order("name", { ascending: true })
          .limit(2000),
        supabase.from("products").select("id,name,item_code,sku").order("name", { ascending: true }).limit(5000),
      ]);

      if (custQ.error) throw new Error(custQ.error.message);
      if (prodQ.error) throw new Error(prodQ.error.message);

      setCreditNoteNo(cnNo);
      setCustomers((custQ.data || []) as any);
      setProducts((prodQ.data || []) as any);
    } catch (e: any) {
      setErr(e?.message || "Failed to load options");
      toast("Failed to load data", { description: e?.message || "Error" });
    }
  }

  useEffect(() => {
    void loadOptions();
  }, []);

  // keyboard shortcuts like a "pro" create screen
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (prodOpen) setProdOpen(false);
        if (custOpen) setCustOpen(false);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveBtnRef.current?.click();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCustOpen(true);
        setCustSearch("");
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [prodOpen, custOpen]);

  function setLine(key: string, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function addLine() {
    setLines((prev) => [
      ...prev,
      { key: crypto.randomUUID(), product_id: null, product_label: "", qty: 1, unit_excl: 0, vat_rate: 15 },
    ]);
  }

  function removeLine(key: string) {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.key !== key)));
  }

  function pickProduct(lineKey: string, productId: number) {
    const p = products.find((x) => x.id === productId) || null;
    setLine(lineKey, { product_id: productId, product_label: pickLabel(p) });
  }

  function openCustomerSearch() {
    setCustSearch("");
    setCustOpen(true);
  }

  function openProductSearch(lineKey: string) {
    setProdPickForLine(lineKey);
    setProdSearch("");
    setProdOpen(true);
  }

  function selectCustomerFromModal(c: CustomerOpt) {
    setCustomerId(c.id);
    setCustOpen(false);
  }

  function selectProductFromModal(p: ProductOpt) {
    if (!prodPickForLine) return;
    pickProduct(prodPickForLine, p.id);
    setProdOpen(false);
  }

  function validate(): string | null {
    if (!creditNoteNo.trim()) return "Missing credit note number";
    if (!date.trim()) return "Missing date";
    if (!customerId) return "Please select a customer";
    const okLines = lines.some((l) => l.product_id && n(l.qty) > 0);
    if (!okLines) return "Select products + quantity > 0";
    return null;
  }

  async function save() {
    setErr(null);

    const v = validate();
    if (v) {
      setErr(v);
      toast("Cannot save", { description: v });
      return;
    }

    const cleanLines = lines
      .map((l) => {
        const c = lineCalc(l);
        return {
          product_id: l.product_id,
          total_qty: c.qty,
          unit_price_excl_vat: c.unitEx,
          unit_vat: c.unitVat,
          unit_price_incl_vat: c.unitInc,
          line_total: c.lineTotal,
          ok: !!l.product_id && c.qty > 0,
        };
      })
      .filter((x) => x.ok);

    setBusy(true);
    try {
      const invIdNum = invoiceId.trim() ? Number(invoiceId.trim()) : null;

      const { data: cn, error: cnErr } = await supabase
        .from("credit_notes")
        .insert({
          credit_note_number: creditNoteNo.trim(),
          credit_note_date: date,
          customer_id: customerId,
          invoice_id: Number.isFinite(Number(invIdNum)) ? invIdNum : null,
          reason: reason.trim() || null,
          subtotal: totals.subtotal,
          vat_amount: totals.vat_amount,
          total_amount: totals.total_amount,
          status: "ISSUED",
        })
        .select("id")
        .single();

      if (cnErr) throw new Error(cnErr.message);
      if (!cn?.id) throw new Error("Failed to create credit note");

      const credit_note_id = cn.id as number;

      const { error: itErr } = await supabase.from("credit_note_items").insert(
        cleanLines.map((x) => ({
          credit_note_id,
          product_id: x.product_id,
          total_qty: x.total_qty,
          unit_price_excl_vat: x.unit_price_excl_vat,
          unit_vat: x.unit_vat,
          unit_price_incl_vat: x.unit_price_incl_vat,
          line_total: x.line_total,
        }))
      );

      if (itErr) throw new Error(itErr.message);

      toast("Saved", { description: `Credit note ${creditNoteNo} created.` });
      nav(`/credit-notes/${credit_note_id}`, { replace: true });
    } catch (e: any) {
      const msg = e?.message || "Failed to save credit note";
      setErr(msg);
      toast("Save failed", { description: msg });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5 invoiceCreate">
      {/* Premium background hint (same vibe as InvoiceCreate) */}
      <div className="pointer-events-none fixed inset-0 -z-10 opacity-60">
        <div className="absolute -top-24 left-1/2 h-72 w-[60rem] -translate-x-1/2 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-40 right-[-10rem] h-96 w-96 rounded-full bg-white/5 blur-3xl" />
      </div>

      {/* ========= Header (same structure as InvoiceCreate) ========= */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Button variant="outline" onClick={() => nav("/credit-notes")} className="mt-1 rounded-xl">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>

          <div>
            <div className="flex items-center gap-2">
              <div className="text-2xl font-semibold tracking-tight">New Credit Note</div>
              <span className="inline-flex items-center gap-1 rounded-full border bg-white px-2 py-1 text-[11px] text-slate-700">
                <Receipt className="h-3.5 w-3.5" />
                CN Create
              </span>
              <span className="hidden sm:inline-flex items-center gap-1 rounded-full border bg-white px-2 py-1 text-[11px] text-slate-700">
                <FileText className="h-3.5 w-3.5" />
                Ctrl/⌘ + S to save
              </span>
            </div>
            <div className="text-sm text-muted-foreground">Customer • Items • Totals • Save</div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => loadOptions()} disabled={busy} className="rounded-xl">
            <RefreshCw className={"mr-2 h-4 w-4 " + (busy ? "animate-spin" : "")} />
            Refresh data
          </Button>
          <Button ref={saveBtnRef as any} onClick={save} disabled={busy} className="rounded-xl">
            <Save className="mr-2 h-4 w-4" />
            {busy ? "Saving..." : "Save Credit Note"}
          </Button>
        </div>
      </div>

      {err ? (
        <Card className="p-4 rounded-2xl border-rose-200 bg-rose-50 text-rose-800 text-sm">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4" />
            <div>
              <b>Error:</b> {err}
            </div>
          </div>
        </Card>
      ) : null}

      {/* ========= Main layout ========= */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Left: details + customer */}
        <Card className="p-5 rounded-2xl border bg-white/80 shadow-sm space-y-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div className="font-semibold">Credit Note Details</div>
            <div className="text-xs text-muted-foreground">Auto-numbered • editable</div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Credit Note No</div>
              <Input value={creditNoteNo} onChange={(e) => setCreditNoteNo(e.target.value)} />
            </div>

            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Date</div>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>

            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Invoice ID (optional)</div>
              <Input value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)} placeholder="e.g. 28" />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {/* Customer row with quick search */}
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Customer</div>
              <div className="flex gap-2">
                <select
                  className="h-10 rounded-xl border px-3 bg-white w-full text-sm text-slate-900 outline-none"
                  value={customerId ?? ""}
                  onChange={(e) => setCustomerId(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">Select customer...</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.customer_code ? `${c.name} (${c.customer_code})` : c.name}
                    </option>
                  ))}
                </select>

                <Button
                  type="button"
                  variant="outline"
                  className="h-10 w-10 px-0 rounded-xl"
                  onClick={openCustomerSearch}
                  title="Search customer (Ctrl/⌘+K)"
                >
                  <Search className="h-4 w-4" />
                </Button>
              </div>

              <div className="text-[11px] text-muted-foreground">
                Selected: <b className="text-slate-900">{customerLabel || "—"}</b>
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Reason (optional)</div>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Return / price adjustment / damage..."
              />
            </div>
          </div>

          {/* Customer preview (same premium panel style) */}
          <div className="rounded-2xl border bg-white p-4">
            <div className="flex items-center justify-between">
              <div className="text-xs text-muted-foreground">Customer Preview</div>
              <span className="inline-flex items-center gap-1 rounded-full border bg-white px-2 py-1 text-[11px] text-slate-700">
                <FileText className="h-3.5 w-3.5" />
                Preview
              </span>
            </div>

            <div className="mt-2 flex items-start justify-between gap-3">
              <div>
                <div className="font-semibold text-slate-900">{selectedCustomer?.name || "—"}</div>
                {selectedCustomer?.customer_code ? (
                  <div className="text-xs text-slate-500">{selectedCustomer.customer_code}</div>
                ) : null}
              </div>
              <div className="text-right text-xs text-slate-500">
                {selectedCustomer?.phone ? <div>{selectedCustomer.phone}</div> : null}
                {selectedCustomer?.address ? (
                  <div className="max-w-[320px] truncate">{selectedCustomer.address}</div>
                ) : null}
              </div>
            </div>
          </div>
        </Card>

        {/* Right: totals */}
        <Card className="p-5 rounded-2xl border bg-white/80 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-semibold">Totals</div>
            <span className="inline-flex items-center gap-1 rounded-full border bg-white px-2 py-1 text-[11px] text-slate-700">
              <BadgePercent className="h-3.5 w-3.5" />
              Live calc
            </span>
          </div>

          <div className="rounded-2xl border bg-white p-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <b className="text-slate-900">{rs(totals.subtotal)}</b>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">VAT</span>
              <b className="text-slate-900">{rs(totals.vat_amount)}</b>
            </div>

            <div className="h-px bg-slate-200 my-1" />

            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total</span>
              <b className="text-xl text-slate-900">{rs(totals.total_amount)}</b>
            </div>
          </div>

          <Button variant="outline" onClick={addLine} className="rounded-xl">
            <Plus className="mr-2 h-4 w-4" />
            Add Item
          </Button>

          <div className="text-[11px] text-muted-foreground">
            Tip: Use the 🔎 search button per row to find products fast.
          </div>
        </Card>
      </div>

      {/* ========= Items table (same structure as InvoiceCreate, keep logic CN) ========= */}
      <Card className="overflow-hidden rounded-2xl border bg-white/80 shadow-sm">
        <div className="overflow-auto">
          <table className="w-full min-w-[1120px]">
            <thead className="bg-slate-50">
              <tr className="text-[12px] uppercase tracking-wide text-slate-600 border-b">
                <th className="px-4 py-3 text-left">Product</th>
                <th className="px-4 py-3 text-left">Qty</th>
                <th className="px-4 py-3 text-left">Unit Excl</th>
                <th className="px-4 py-3 text-left">VAT %</th>
                <th className="px-4 py-3 text-left">Unit VAT</th>
                <th className="px-4 py-3 text-left">Unit Incl</th>
                <th className="px-4 py-3 text-left">Line Total</th>
                <th className="px-3 py-3 text-right" />
              </tr>
            </thead>

            <tbody className="divide-y">
              {lines.map((l) => {
                const c = lineCalc(l);

                return (
                  <tr key={l.key} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3">
                      <div className="flex gap-2 items-start">
                        <div className="w-full">
                          <select
                            className="h-10 rounded-xl border px-3 bg-white w-full min-w-[360px] text-sm text-slate-900 outline-none"
                            value={l.product_id ?? ""}
                            onChange={(e) => pickProduct(l.key, Number(e.target.value))}
                          >
                            <option value="">Select product...</option>
                            {products.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                                {p.item_code ? ` • ${p.item_code}` : ""}
                                {p.sku ? ` • ${p.sku}` : ""}
                              </option>
                            ))}
                          </select>

                          <div className="text-xs text-muted-foreground mt-1">{l.product_label || "—"}</div>
                        </div>

                        <Button
                          type="button"
                          variant="outline"
                          className="h-10 w-10 px-0 rounded-xl"
                          onClick={() => openProductSearch(l.key)}
                          title="Search product"
                        >
                          <Search className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <Input
                        inputMode="decimal"
                        value={String(l.qty)}
                        onChange={(e) => setLine(l.key, { qty: n(e.target.value) })}
                        className="w-[110px]"
                      />
                    </td>

                    <td className="px-4 py-3">
                      <Input
                        inputMode="decimal"
                        value={String(l.unit_excl)}
                        onChange={(e) => setLine(l.key, { unit_excl: n(e.target.value) })}
                        className="w-[140px]"
                      />
                    </td>

                    <td className="px-4 py-3">
                      <Input
                        inputMode="decimal"
                        value={String(l.vat_rate)}
                        onChange={(e) => setLine(l.key, { vat_rate: n(e.target.value) })}
                        className="w-[110px]"
                      />
                    </td>

                    <td className="px-4 py-3 text-sm">
                      <div className="text-slate-500">Rs</div>
                      <div className="text-slate-900">{c.unitVat.toFixed(2)}</div>
                    </td>

                    <td className="px-4 py-3 text-sm">
                      <div className="text-slate-500">Rs</div>
                      <div className="text-slate-900">{c.unitInc.toFixed(2)}</div>
                    </td>

                    <td className="px-4 py-3 text-sm">
                      <div className="text-slate-500">Rs</div>
                      <div className="text-slate-900 font-semibold">{c.lineTotal.toFixed(2)}</div>
                    </td>

                    <td className="px-3 py-3 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className="h-9 w-9 inline-flex items-center justify-center rounded-full border bg-white hover:bg-slate-50"
                            aria-label="Row actions"
                          >
                            <MoreHorizontal className="h-5 w-5 text-slate-700" />
                          </button>
                        </DropdownMenuTrigger>

                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem onClick={() => removeLine(l.key)}>
                            <Trash2 className="mr-2 h-4 w-4" />
                            Remove
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="border-t bg-white/70 px-4 py-3 text-xs text-slate-600 flex flex-wrap items-center justify-between gap-2">
          <div>
            Lines: <b>{lines.length}</b> • Subtotal: <b>{rs(totals.subtotal)}</b> • VAT:{" "}
            <b>{rs(totals.vat_amount)}</b> • Total: <b>{rs(totals.total_amount)}</b>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={addLine} className="h-8 rounded-xl">
              <Plus className="mr-2 h-4 w-4" />
              Add
            </Button>
          </div>
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => nav("/credit-notes")} className="rounded-xl">
          Cancel
        </Button>
        <Button onClick={save} disabled={busy} className="rounded-xl">
          <Save className="mr-2 h-4 w-4" />
          {busy ? "Saving..." : "Save Credit Note"}
        </Button>
      </div>

      {/* =========================
          Customer Search Dialog
      ========================= */}
      <Dialog open={custOpen} onOpenChange={setCustOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Search Customer</DialogTitle>
            <DialogDescription>Type name / code / phone / address, then click a row.</DialogDescription>
          </DialogHeader>

          <div className="flex gap-2">
            <Input
              value={custSearch}
              onChange={(e) => setCustSearch(e.target.value)}
              placeholder="Search customers..."
              className="flex-1"
              autoFocus
            />
            <Button variant="outline" onClick={() => setCustSearch("")} className="rounded-xl">
              Clear
            </Button>
          </div>

          <div className="mt-3 rounded-2xl border overflow-hidden">
            <div className="max-h-[420px] overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr className="text-[12px] uppercase tracking-wide text-slate-600 border-b">
                    <th className="px-3 py-2 text-left">Name</th>
                    <th className="px-3 py-2 text-left">Code</th>
                    <th className="px-3 py-2 text-left">Phone</th>
                    <th className="px-3 py-2 text-left">Address</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredCustomers.map((c) => (
                    <tr
                      key={c.id}
                      className="hover:bg-slate-50 cursor-pointer"
                      onClick={() => selectCustomerFromModal(c)}
                      title="Select customer"
                    >
                      <td className="px-3 py-2 font-semibold text-slate-900">{c.name}</td>
                      <td className="px-3 py-2 text-slate-700">{c.customer_code || "—"}</td>
                      <td className="px-3 py-2 text-slate-700">{c.phone || "—"}</td>
                      <td className="px-3 py-2 text-slate-700">
                        <div className="max-w-[360px] truncate">{c.address || "—"}</div>
                      </td>
                    </tr>
                  ))}

                  {filteredCustomers.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-6 text-center text-sm text-muted-foreground">
                        No customers match your search.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCustOpen(false)} className="rounded-xl">
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* =========================
          Product Search Dialog
      ========================= */}
      <Dialog open={prodOpen} onOpenChange={setProdOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Search Product</DialogTitle>
            <DialogDescription>Type name / item code / SKU, then click a row.</DialogDescription>
          </DialogHeader>

          <div className="flex gap-2">
            <Input
              value={prodSearch}
              onChange={(e) => setProdSearch(e.target.value)}
              placeholder="Search products..."
              className="flex-1"
              autoFocus
            />
            <Button variant="outline" onClick={() => setProdSearch("")} className="rounded-xl">
              Clear
            </Button>
          </div>

          <div className="mt-3 rounded-2xl border overflow-hidden">
            <div className="max-h-[420px] overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr className="text-[12px] uppercase tracking-wide text-slate-600 border-b">
                    <th className="px-3 py-2 text-left">Name</th>
                    <th className="px-3 py-2 text-left">Item Code</th>
                    <th className="px-3 py-2 text-left">SKU</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredProducts.map((p) => (
                    <tr
                      key={p.id}
                      className="hover:bg-slate-50 cursor-pointer"
                      onClick={() => selectProductFromModal(p)}
                      title="Select product"
                    >
                      <td className="px-3 py-2 font-semibold text-slate-900">{p.name}</td>
                      <td className="px-3 py-2 text-slate-700">{p.item_code || "—"}</td>
                      <td className="px-3 py-2 text-slate-700">{p.sku || "—"}</td>
                    </tr>
                  ))}

                  {filteredProducts.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="p-6 text-center text-sm text-muted-foreground">
                        No products match your search.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setProdOpen(false)} className="rounded-xl">
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

