// src/pages/QuotationCreate.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import "@/styles/InvoiceCreate.css"; // ✅ reuse same CSS/theme as InvoiceCreate

import RamPotteryDoc from "@/components/print/RamPotteryDoc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import {
  ArrowLeft,
  BadgePercent,
  FileText,
  MoreHorizontal,
  Plus,
  Printer,
  RefreshCw,
  Save,
  Search,
  Trash2,
  Users,
} from "lucide-react";

import { listCustomers } from "@/lib/customers";
import { listProducts } from "@/lib/invoices";
import { createQuotationFull, getQuotation, getQuotationItems } from "@/lib/quotations";

/* =========================
   Types (Invoice-style)
========================= */
type CustomerRow = {
  id: number;
  name: string;
  address?: string | null;
  phone?: string | null;
  brn?: string | null;
  vat_no?: string | null;
  customer_code?: string | null;
  discount_percent?: number | null;
};

type ProductRow = {
  id: number;
  item_code?: string | null;
  sku?: string | null;
  name?: string | null;
  description?: string | null;
  units_per_box?: number | null;
  selling_price: number; // VAT-exclusive
};

type Uom = "BOX" | "PCS";

type QuoteLine = {
  id: string;
  product_id: number | null;

  item_code: string;
  description: string;

  uom: Uom;
  box_qty: number; // qty input (BOX qty or PCS qty)
  units_per_box: number; // UPB (1 for PCS)
  total_qty: number; // computed

  vat_rate: number;

  base_unit_price_excl_vat: number; // original product price (EX)
  unit_price_excl_vat: number; // discounted EX used in calc

  unit_vat: number; // per unit
  unit_price_incl_vat: number; // per unit
  line_total: number; // total_qty * unit_inc
};

type PrintNameMode = "CUSTOMER" | "CLIENT";

/* =========================
   Sales reps
========================= */
const SALES_REPS = [
  { name: "Mr Koushal", phone: "59193239" },
  { name: "Mr Akash", phone: "58060268" },
  { name: "Mr Manish", phone: "57788884" },
  { name: "Mr Adesh", phone: "57788884" },
] as const;

type SalesRepName = (typeof SALES_REPS)[number]["name"];
function repPhoneByName(name: string) {
  const r = SALES_REPS.find((x) => x.name === name);
  return r?.phone || "";
}

/* =========================
   Helpers
========================= */
const n2 = (v: any) => {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
};
const clampPct = (v: any) => Math.max(0, Math.min(100, n2(v)));

function uid() {
  try {
    return crypto.randomUUID();
  } catch {
    return String(Date.now()) + "-" + Math.random().toString(16).slice(2);
  }
}

function money(v: any) {
  const x = n2(v);
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(x);
}
function intFmt(v: any) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.trunc(n2(v)));
}

function todayISO() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function recalc(row: QuoteLine): QuoteLine {
  const qtyInput = Math.max(0, Math.trunc(n2(row.box_qty)));

  const uom: Uom = row.uom === "PCS" ? "PCS" : "BOX";
  const upb = uom === "PCS" ? 1 : Math.max(1, Math.trunc(n2(row.units_per_box) || 1));
  const totalQty = uom === "PCS" ? qtyInput : qtyInput * upb;

  const rate = clampPct(row.vat_rate);
  const unitEx = Math.max(0, n2(row.unit_price_excl_vat));
  const unitVat = unitEx * (rate / 100);
  const unitInc = unitEx + unitVat;

  return {
    ...row,
    uom,
    units_per_box: upb,
    total_qty: totalQty,
    vat_rate: rate,
    unit_vat: unitVat,
    unit_price_incl_vat: unitInc,
    line_total: totalQty * unitInc,
  };
}

function blankLine(defaultVat: number): QuoteLine {
  return recalc({
    id: uid(),
    product_id: null,
    item_code: "",
    description: "",
    uom: "BOX",
    box_qty: 0,
    units_per_box: 1,
    total_qty: 0,
    vat_rate: clampPct(defaultVat),
    base_unit_price_excl_vat: 0,
    unit_price_excl_vat: 0,
    unit_vat: 0,
    unit_price_incl_vat: 0,
    line_total: 0,
  });
}

function pickProductLabel(p?: ProductRow | null) {
  if (!p) return "";
  const code = p.item_code || p.sku || "";
  const name = p.name || "";
  return `${name}${code ? ` • ${code}` : ""}`;
}

/* =========================
   Page
========================= */
export default function QuotationCreate() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const duplicateId = params.get("duplicate");

  const [busy, setBusy] = useState(false);
  const [printing, setPrinting] = useState(false);

  const [printNameMode, setPrintNameMode] = useState<PrintNameMode>("CUSTOMER");
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [clientName, setClientName] = useState<string>("");

  const [quotationDate, setQuotationDate] = useState<string>(todayISO());
  const [validUntil, setValidUntil] = useState<string>("");

  const [vatPercent, setVatPercent] = useState<number>(15);

  const [discountPercent, setDiscountPercent] = useState<number>(0);
  const [discountTouched, setDiscountTouched] = useState(false);

  const [quotationNumber, setQuotationNumber] = useState<string>("(Auto when saved)");
  const [lines, setLines] = useState<QuoteLine[]>([blankLine(15)]);

  // row focus (Enter => next)
  const qtyRefs = useRef<Record<string, HTMLInputElement | null>>({});

  /* ===== Search modals (InvoiceCreate style) ===== */
  const [custOpen, setCustOpen] = useState(false);
  const [custSearch, setCustSearch] = useState("");

  const [prodOpen, setProdOpen] = useState(false);
  const [prodSearch, setProdSearch] = useState("");
  const [prodPickRowId, setProdPickRowId] = useState<string | null>(null);

  /* ===== Sales reps dropdown (same UX / premium) ===== */
  const [repOpen, setRepOpen] = useState(false);
  const [salesReps, setSalesReps] = useState<SalesRepName[]>([]);

  useEffect(() => {
    function close() {
      setRepOpen(false);
    }
    if (!repOpen) return;
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [repOpen]);

  /* ===== Data ===== */
  const customersQ = useQuery({
    queryKey: ["customers"],
    queryFn: () => listCustomers({ limit: 5000 } as any),
    staleTime: 30_000,
  });

  const productsQ = useQuery({
    queryKey: ["products"],
    queryFn: () => listProducts({ limit: 5000 } as any),
    staleTime: 30_000,
  });

  const customers = (customersQ.data || []) as CustomerRow[];
  const products = (productsQ.data || []) as ProductRow[];

  const customer = useMemo(() => customers.find((c) => c.id === customerId) || null, [customers, customerId]);

  const printedName = useMemo(() => {
    const cn = (customer?.name || "").trim();
    const cl = clientName.trim();
    if (printNameMode === "CLIENT") return cl || cn;
    return cn || cl;
  }, [printNameMode, customer?.name, clientName]);

  // auto discount from customer
  useEffect(() => {
    if (!customerId || !customer) return;
    if (!discountTouched) setDiscountPercent(clampPct(customer.discount_percent ?? 0));
    if (!clientName.trim()) setClientName(customer.name || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  // VAT applies to all
  useEffect(() => {
    const v = clampPct(vatPercent);
    setLines((prev) => prev.map((r) => recalc({ ...r, vat_rate: v })));
  }, [vatPercent]);

  // Discount recalculates unit_ex from base
  useEffect(() => {
    const dp = clampPct(discountPercent);
    setLines((prev) =>
      prev.map((r) => {
        if (!r.product_id) return r;
        const base = n2(r.base_unit_price_excl_vat);
        const discounted = base * (1 - dp / 100);
        return recalc({ ...r, unit_price_excl_vat: discounted });
      })
    );
  }, [discountPercent]);

  /* ===== Duplicate ===== */
  useEffect(() => {
    if (!duplicateId) return;

    Promise.all([getQuotation(Number(duplicateId)), getQuotationItems(Number(duplicateId))])
      .then(([qRow, qItems]) => {
        setCustomerId((qRow as any).customer_id ?? null);

        const qClientName = String((qRow as any)?.customer_name || "").trim();
        setClientName(qClientName || "");

        setQuotationDate(String((qRow as any).quotation_date || todayISO()));
        setValidUntil(String((qRow as any).valid_until || ""));

        setVatPercent(clampPct((qRow as any).vat_percent ?? 15));
        setDiscountPercent(clampPct((qRow as any).discount_percent ?? 0));
        setDiscountTouched(true);

        const repText = String((qRow as any).sales_rep || "").trim();
        const repList = repText ? repText.split(",").map((s: string) => s.trim()).filter(Boolean) : [];
        if (repList.length) setSalesReps(repList as SalesRepName[]);

        const cloned = (qItems || []).map((it: any) =>
          recalc({
            id: uid(),
            product_id: it.product_id ?? null,
            item_code: String(it.item_code || it.product?.item_code || it.product?.sku || ""),
            description: String(it.description || it.product?.name || ""),
            uom: String(it.uom || "BOX").toUpperCase() === "PCS" ? "PCS" : "BOX",
            box_qty: n2(it.box_qty || 0),
            units_per_box: Math.max(1, Math.trunc(n2(it.units_per_box || 1))),
            total_qty: Math.trunc(n2(it.total_qty || 0)),
            vat_rate: clampPct((it.vat_rate ?? (qRow as any).vat_percent ?? 15) as any),
            base_unit_price_excl_vat: n2(it.base_unit_price_excl_vat ?? it.unit_price_excl_vat ?? 0),
            unit_price_excl_vat: n2(it.unit_price_excl_vat ?? 0),
            unit_vat: n2(it.unit_vat || 0),
            unit_price_incl_vat: n2(it.unit_price_incl_vat || 0),
            line_total: n2(it.line_total || 0),
          })
        );

        setLines(cloned.length ? cloned : [blankLine(15)]);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duplicateId]);

  /* ===== Totals ===== */
  const realLines = useMemo(() => lines.filter((l) => !!l.product_id), [lines]);

  const subtotalEx = useMemo(
    () => realLines.reduce((sum, r) => sum + n2(r.total_qty) * n2(r.unit_price_excl_vat), 0),
    [realLines]
  );

  const vatAmount = useMemo(
    () => realLines.reduce((sum, r) => sum + n2(r.total_qty) * n2(r.unit_vat), 0),
    [realLines]
  );

  const totalAfterDiscount = useMemo(() => subtotalEx + vatAmount, [subtotalEx, vatAmount]);

  const discountAmount = useMemo(() => {
    const dp = clampPct(discountPercent);
    if (dp <= 0) return 0;

    const baseSub = realLines.reduce((sum, r) => sum + n2(r.total_qty) * n2(r.base_unit_price_excl_vat), 0);
    const baseVat = realLines.reduce((sum, r) => {
      const rate = clampPct(r.vat_rate);
      const baseUnit = n2(r.base_unit_price_excl_vat);
      return sum + n2(r.total_qty) * (baseUnit * (rate / 100));
    }, 0);

    const baseTotal = baseSub + baseVat;
    return Math.max(0, baseTotal - totalAfterDiscount);
  }, [realLines, discountPercent, totalAfterDiscount]);

  /* ===== Row helpers ===== */
  function setLine(id: string, patch: Partial<QuoteLine>) {
    setLines((prev) => prev.map((r) => (r.id === id ? recalc({ ...r, ...patch } as QuoteLine) : r)));
  }

  function addLine() {
    const row = blankLine(vatPercent);
    setLines((prev) => [...prev, row]);
    setTimeout(() => {
      qtyRefs.current[row.id]?.focus?.();
      qtyRefs.current[row.id]?.select?.();
    }, 0);
  }

  function removeLine(id: string) {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.id !== id)));
  }

  function applyProductToRow(rowId: string, product: ProductRow | null) {
    setLines((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;

        if (!product) {
          return recalc({
            ...r,
            product_id: null,
            item_code: "",
            description: "",
            units_per_box: 1,
            base_unit_price_excl_vat: 0,
            unit_price_excl_vat: 0,
            vat_rate: clampPct(vatPercent),
            uom: "BOX",
            box_qty: 0,
          });
        }

        const dp = clampPct(discountPercent);
        const baseEx = n2((product as any).selling_price || 0);
        const discountedEx = baseEx * (1 - dp / 100);

        return recalc({
          ...r,
          product_id: product.id,
          item_code: String(product.item_code || product.sku || ""),
          description: String(product.description || product.name || "").trim(),
          units_per_box: Math.max(1, Math.trunc(n2(product.units_per_box || 1))),
          base_unit_price_excl_vat: baseEx,
          unit_price_excl_vat: discountedEx,
          vat_rate: clampPct(vatPercent),
          uom: "BOX",
          box_qty: Math.max(1, Math.trunc(n2(r.box_qty || 1))),
        });
      })
    );

    setTimeout(() => {
      qtyRefs.current[rowId]?.focus?.();
      qtyRefs.current[rowId]?.select?.();
    }, 0);
  }

  function focusNextQty(currentRowId: string) {
    const idx = lines.findIndex((x) => x.id === currentRowId);
    if (idx < 0) return;
    const next = lines[idx + 1];
    if (next) {
      qtyRefs.current[next.id]?.focus?.();
      qtyRefs.current[next.id]?.select?.();
      return;
    }
    addLine();
  }

  /* ===== Search dialogs ===== */
  const filteredCustomers = useMemo(() => {
    const t = custSearch.trim().toLowerCase();
    if (!t) return customers;
    return customers.filter((c) => {
      const hay = `${c.name || ""} ${c.phone || ""} ${c.customer_code || ""} ${c.address || ""}`.toLowerCase();
      return hay.includes(t);
    });
  }, [customers, custSearch]);

  const filteredProducts = useMemo(() => {
    const t = prodSearch.trim().toLowerCase();
    if (!t) return products;
    return products.filter((p) => {
      const hay = `${p.item_code || ""} ${p.sku || ""} ${p.name || ""} ${p.description || ""}`.toLowerCase();
      return hay.includes(t);
    });
  }, [products, prodSearch]);

  function openCustomerSearch() {
    setCustSearch("");
    setCustOpen(true);
  }
  function openProductSearch(rowId: string) {
    setProdPickRowId(rowId);
    setProdSearch("");
    setProdOpen(true);
  }

  /* ===== Save / Print ===== */
  async function onSave() {
    if (!customerId) return toast.error("Please select a customer.");
    if (!quotationDate) return toast.error("Please select quotation date.");
    if (!salesReps.length) return toast.error("Please select at least one sales rep.");
    if (realLines.length === 0) return toast.error("Please add at least one item.");
    if (realLines.some((l) => Math.trunc(n2(l.box_qty)) <= 0)) return toast.error("Qty must be at least 1.");

    if (printNameMode === "CLIENT" && !clientName.trim()) {
      return toast.error("Please enter a Client Name (or switch to Customer Name).");
    }

    setBusy(true);
    try {
      const payload: any = {
        quotation_date: quotationDate,
        valid_until: validUntil ? validUntil : null,

        customer_id: customerId,
        customer_name: printNameMode === "CLIENT" ? clientName.trim() : customer?.name || null,
        customer_code: customer?.customer_code || null,

        sales_rep: salesReps.join(", "),
        sales_rep_phone: salesReps.map(repPhoneByName).filter(Boolean).join(", "),

        notes: null,

        vat_percent: clampPct(vatPercent),
        discount_percent: clampPct(discountPercent),
        discount_amount: n2(discountAmount),

        items: realLines.map((l) => {
          const qtyInput = Math.trunc(n2(l.box_qty));
          const uom: Uom = l.uom === "PCS" ? "PCS" : "BOX";
          const upb = uom === "PCS" ? 1 : Math.max(1, Math.trunc(n2(l.units_per_box) || 1));
          const totalQty = uom === "PCS" ? qtyInput : qtyInput * upb;

          const rate = clampPct(l.vat_rate);
          const unitEx = n2(l.unit_price_excl_vat);
          const unitVat = unitEx * (rate / 100);
          const unitInc = unitEx + unitVat;

          return {
            product_id: l.product_id,
            description: l.description || null,

            uom,
            box_qty: qtyInput,
            units_per_box: upb,
            total_qty: totalQty,

            unit_price_excl_vat: unitEx,
            unit_vat: unitVat,
            unit_price_incl_vat: unitInc,
            line_total: totalQty * unitInc,
          };
        }),
      };

      const res: any = await createQuotationFull(payload);

      const no = String(res?.quotation_number || res?.quotation_no || res?.number || res?.id || "(Saved)");
      setQuotationNumber(no);

      toast.success(`Quotation saved: ${no}`);

      if (res?.id) nav(`/quotations/${res.id}`, { replace: true });
    } catch (e: any) {
      toast.error(e?.message || "Failed to save quotation");
    } finally {
      setBusy(false);
    }
  }

  function onPrint() {
    setPrinting(true);
    setTimeout(() => {
      window.print();
      setPrinting(false);
    }, 120);
  }

  const DocAny: any = RamPotteryDoc;

  return (
    <div className="space-y-5">
      {/* ========= Header (match InvoiceCreate) ========= */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Button variant="outline" onClick={() => nav(-1)} className="mt-1">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>

          <div>
            <div className="flex items-center gap-2">
              <div className="text-2xl font-semibold">New Quotation</div>
              <span className="inline-flex items-center gap-1 rounded-full border bg-white px-2 py-1 text-[11px] text-slate-700">
                <FileText className="h-3.5 w-3.5" />
                Quote Create
              </span>
            </div>
            <div className="text-sm text-muted-foreground">Customer • Items • Totals • Save</div>
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              customersQ.refetch();
              productsQ.refetch();
            }}
            disabled={busy}
          >
            <RefreshCw className={"mr-2 h-4 w-4 " + (busy ? "animate-spin" : "")} />
            Refresh data
          </Button>

          <Button variant="outline" onClick={onPrint} disabled={printing}>
            <Printer className="mr-2 h-4 w-4" />
            {printing ? "Preparing..." : "Print"}
          </Button>

          <Button onClick={onSave} disabled={busy}>
            <Save className="mr-2 h-4 w-4" />
            {busy ? "Saving..." : "Save Quotation"}
          </Button>
        </div>
      </div>

      {/* ========= Main grid (same as InvoiceCreate) ========= */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Left: details */}
        <Card className="p-5 space-y-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div className="font-semibold">Quotation Details</div>
            <div className="text-xs text-muted-foreground">Auto number when saved</div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Quotation No</div>
              <Input value={quotationNumber} readOnly />
            </div>

            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Quotation Date</div>
              <Input type="date" value={quotationDate} onChange={(e) => setQuotationDate(e.target.value)} />
            </div>

            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Valid Until (optional)</div>
              <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {/* Customer selector + search */}
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Customer (account)</div>

              <div className="flex gap-2">
                <select
                  className="h-10 rounded-md border px-3 bg-background w-full"
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
                  className="h-10 w-10 px-0"
                  onClick={openCustomerSearch}
                  title="Search customer"
                >
                  <Search className="h-4 w-4" />
                </Button>
              </div>

              <div className="text-[11px] text-muted-foreground">
                Selected: <b className="text-slate-900">{customer?.name || "—"}</b>
              </div>
            </div>

            {/* Print name & client name */}
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Name Printed on Quote</div>

              <div className="flex gap-2">
                <select
                  className="h-10 rounded-md border px-3 bg-background w-[180px]"
                  value={printNameMode}
                  onChange={(e) => setPrintNameMode(e.target.value as PrintNameMode)}
                >
                  <option value="CUSTOMER">Customer</option>
                  <option value="CLIENT">Client</option>
                </select>

                <Input
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Client name (optional)"
                />
              </div>

              <div className="text-[11px] text-muted-foreground">
                Printed: <b className="text-slate-900">{printedName || "—"}</b>
              </div>
            </div>
          </div>

          {/* Customer preview (same premium card) */}
          <div className="rounded-xl border bg-white p-4">
            <div className="flex items-center justify-between">
              <div className="text-xs text-muted-foreground">Customer Preview</div>
              <span className="inline-flex items-center gap-1 rounded-full border bg-white px-2 py-1 text-[11px] text-slate-700">
                <Users className="h-3.5 w-3.5" />
                Preview
              </span>
            </div>

            <div className="mt-2 flex items-start justify-between gap-3">
              <div>
                <div className="font-semibold text-slate-900">{customer?.name || "—"}</div>
                {customer?.customer_code ? <div className="text-xs text-slate-500">{customer.customer_code}</div> : null}
              </div>
              <div className="text-right text-xs text-slate-500">
                {customer?.phone ? <div>{customer.phone}</div> : null}
                {customer?.address ? <div className="max-w-[320px] truncate">{customer.address}</div> : null}
              </div>
            </div>
          </div>

          {/* Sales reps (same premium multi-select) */}
          <div className="rounded-xl border bg-white p-4">
            <div className="flex items-center justify-between">
              <div className="text-xs text-muted-foreground">Sales Rep(s)</div>
              <span className="text-[11px] text-slate-500">Required</span>
            </div>

            <div className="mt-2 relative">
              <button
                type="button"
                className="w-full min-h-[40px] rounded-md border bg-background px-3 py-2 text-left"
                onClick={() => setRepOpen((v) => !v)}
                aria-expanded={repOpen}
              >
                <div className="flex flex-wrap gap-2">
                  {salesReps.length ? (
                    salesReps.map((n) => (
                      <span
                        key={n}
                        className="inline-flex items-center gap-2 rounded-full border bg-white px-2 py-1 text-[12px]"
                      >
                        {n} <span className="text-slate-500">({repPhoneByName(n)})</span>
                        <span
                          className="cursor-pointer text-slate-500 hover:text-slate-900"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSalesReps((prev) => prev.filter((x) => x !== n));
                          }}
                          title="Remove"
                        >
                          ×
                        </span>
                      </span>
                    ))
                  ) : (
                    <span className="text-slate-500 text-sm">Select sales reps…</span>
                  )}
                </div>
              </button>

              {repOpen ? (
                <div className="absolute z-30 mt-2 w-full rounded-xl border bg-white shadow-lg overflow-hidden">
                  <div className="max-h-[240px] overflow-auto">
                    {SALES_REPS.map((r) => {
                      const active = salesReps.includes(r.name);
                      return (
                        <button
                          key={r.name}
                          type="button"
                          className={
                            "w-full px-3 py-2 text-left hover:bg-slate-50 flex items-center justify-between " +
                            (active ? "bg-slate-50" : "")
                          }
                          onClick={() => {
                            setSalesReps((prev) =>
                              active ? prev.filter((x) => x !== r.name) : [...prev, r.name]
                            );
                            setRepOpen(false);
                          }}
                        >
                          <span className="font-medium text-slate-900">{r.name}</span>
                          <span className="text-sm text-slate-500">{r.phone}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="px-3 py-2 text-[11px] text-slate-500 border-t">Click to select/remove.</div>
                </div>
              ) : null}
            </div>
          </div>
        </Card>

        {/* Right: totals + VAT/Discount */}
        <Card className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-semibold">Totals</div>
            <span className="inline-flex items-center gap-1 rounded-full border bg-white px-2 py-1 text-[11px] text-slate-700">
              <BadgePercent className="h-3.5 w-3.5" />
              Live calc
            </span>
          </div>

          <div className="grid gap-3">
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">VAT % (applies to all items)</div>
              <Input
                inputMode="decimal"
                value={String(vatPercent)}
                onChange={(e) => setVatPercent(clampPct(e.target.value))}
              />
            </div>

            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Discount %</div>
              <Input
                inputMode="decimal"
                value={String(discountPercent)}
                onChange={(e) => {
                  setDiscountTouched(true);
                  setDiscountPercent(clampPct(e.target.value));
                }}
              />
              <div className="text-[11px] text-muted-foreground">Auto from customer unless you edit.</div>
            </div>
          </div>

          <div className="rounded-xl border bg-white p-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Subtotal (EX)</span>
              <b className="text-slate-900">Rs {money(subtotalEx)}</b>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">VAT</span>
              <b className="text-slate-900">Rs {money(vatAmount)}</b>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Discount</span>
              <b className="text-slate-900">Rs {money(discountAmount)}</b>
            </div>

            <div className="h-px bg-slate-200 my-1" />

            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total</span>
              <b className="text-xl text-slate-900">Rs {money(totalAfterDiscount)}</b>
            </div>
          </div>

          <Button variant="outline" onClick={addLine}>
            <Plus className="mr-2 h-4 w-4" />
            Add Item
          </Button>

          <div className="text-[11px] text-muted-foreground">Tip: Use the 🔎 search button per row to find products fast.</div>
        </Card>
      </div>

      {/* ========= Items table (invoice-style locked columns) ========= */}
      <Card className="overflow-hidden">
        <div className="overflow-auto">
          <table className="w-full min-w-[1180px]">
            <thead className="bg-slate-50">
              <tr className="text-[12px] uppercase tracking-wide text-slate-600 border-b">
                <th className="px-4 py-3 text-left">Product</th>
                <th className="px-4 py-3 text-left">Box / PCS</th>
                <th className="px-4 py-3 text-left">Unit</th>
                <th className="px-4 py-3 text-left">Total Qty</th>
                <th className="px-4 py-3 text-left">Unit Excl</th>
                <th className="px-4 py-3 text-left">VAT</th>
                <th className="px-4 py-3 text-left">Unit Incl</th>
                <th className="px-4 py-3 text-left">Line Total</th>
                <th className="px-3 py-3 text-right" />
              </tr>
            </thead>

            <tbody className="divide-y">
              {lines.map((r) => {
                const isReal = !!r.product_id;

                return (
                  <tr key={r.id} className="hover:bg-slate-50/60">
                    {/* product */}
                    <td className="px-4 py-3">
                      <div className="flex gap-2 items-start">
                        <div className="w-full">
                          <select
                            className="h-10 rounded-md border px-3 bg-background w-full min-w-[360px]"
                            value={r.product_id ?? ""}
                            onChange={(e) => {
                              const pid = e.target.value ? Number(e.target.value) : null;
                              const p = pid ? products.find((x) => x.id === pid) || null : null;
                              applyProductToRow(r.id, p);
                            }}
                          >
                            <option value="">Select product...</option>
                            {products.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name || "—"}
                                {p.item_code ? ` • ${p.item_code}` : ""}
                                {p.sku ? ` • ${p.sku}` : ""}
                              </option>
                            ))}
                          </select>

                          <div className="text-xs text-muted-foreground mt-1">
                            {r.product_id ? pickProductLabel(products.find((p) => p.id === r.product_id) || null) : "—"}
                          </div>
                        </div>

                        <Button
                          type="button"
                          variant="outline"
                          className="h-10 w-10 px-0"
                          onClick={() => openProductSearch(r.id)}
                          title="Search product"
                        >
                          <Search className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>

                    {/* box/pcs */}
                    <td className="px-4 py-3">
                      <div className="flex gap-2 items-center">
                        <select
                          className="h-10 rounded-md border px-3 bg-background w-[110px]"
                          value={r.uom}
                          onChange={(e) => setLine(r.id, { uom: e.target.value as any })}
                          disabled={!isReal}
                        >
                          <option value="BOX">BOX</option>
                          <option value="PCS">PCS</option>
                        </select>

                        <Input
                          ref={(el) => (qtyRefs.current[r.id] = el)}
                          inputMode="numeric"
                          value={String(r.box_qty)}
                          onChange={(e) => setLine(r.id, { box_qty: n2(e.target.value) })}
                          onKeyDown={(e) => {
                            if (e.key !== "Enter") return;
                            if (!isReal) return;
                            e.preventDefault();
                            focusNextQty(r.id);
                          }}
                          className="w-[120px]"
                          disabled={!isReal}
                          placeholder="0"
                        />
                      </div>
                    </td>

                    {/* unit (UPB) */}
                    <td className="px-4 py-3">
                      <Input
                        value={r.uom === "PCS" ? "—" : intFmt(r.units_per_box)}
                        readOnly
                        className="w-[110px]"
                      />
                    </td>

                    {/* total qty */}
                    <td className="px-4 py-3">
                      <Input value={intFmt(r.total_qty)} readOnly className="w-[110px]" />
                    </td>

                    {/* unit excl */}
                    <td className="px-4 py-3 text-sm">
                      <div className="text-slate-500">Rs</div>
                      <div className="text-slate-900">{money(r.unit_price_excl_vat)}</div>
                    </td>

                    {/* unit vat */}
                    <td className="px-4 py-3 text-sm">
                      <div className="text-slate-500">Rs</div>
                      <div className="text-slate-900">{money(r.unit_vat)}</div>
                    </td>

                    {/* unit incl */}
                    <td className="px-4 py-3 text-sm">
                      <div className="text-slate-500">Rs</div>
                      <div className="text-slate-900">{money(r.unit_price_incl_vat)}</div>
                    </td>

                    {/* line total */}
                    <td className="px-4 py-3 text-sm">
                      <div className="text-slate-500">Rs</div>
                      <div className="text-slate-900 font-semibold">{money(r.line_total)}</div>
                    </td>

                    {/* actions */}
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
                          <DropdownMenuItem onClick={() => removeLine(r.id)}>
                            <Trash2 className="mr-2 h-4 w-4" />
                            Remove
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => addLine()}>
                            <Plus className="mr-2 h-4 w-4" />
                            Add row
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
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => nav("/quotations")}>
          Cancel
        </Button>
        <Button onClick={onSave} disabled={busy}>
          <Save className="mr-2 h-4 w-4" />
          {busy ? "Saving..." : "Save Quotation"}
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
            <Input value={custSearch} onChange={(e) => setCustSearch(e.target.value)} placeholder="Search customers..." autoFocus />
            <Button variant="outline" onClick={() => setCustSearch("")}>
              Clear
            </Button>
          </div>

          <div className="mt-3 rounded-xl border overflow-hidden">
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
                      onClick={() => {
                        setCustomerId(c.id);
                        setCustOpen(false);
                      }}
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
            <Button variant="outline" onClick={() => setCustOpen(false)}>
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
            <DialogDescription>Type name / item code / SKU / description, then click a row.</DialogDescription>
          </DialogHeader>

          <div className="flex gap-2">
            <Input value={prodSearch} onChange={(e) => setProdSearch(e.target.value)} placeholder="Search products..." autoFocus />
            <Button variant="outline" onClick={() => setProdSearch("")}>
              Clear
            </Button>
          </div>

          <div className="mt-3 rounded-xl border overflow-hidden">
            <div className="max-h-[420px] overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr className="text-[12px] uppercase tracking-wide text-slate-600 border-b">
                    <th className="px-3 py-2 text-left">Name</th>
                    <th className="px-3 py-2 text-left">Item Code</th>
                    <th className="px-3 py-2 text-left">SKU</th>
                    <th className="px-3 py-2 text-right">UPB</th>
                    <th className="px-3 py-2 text-right">Unit Ex</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredProducts.map((p) => (
                    <tr
                      key={p.id}
                      className="hover:bg-slate-50 cursor-pointer"
                      onClick={() => {
                        const rowId = prodPickRowId;
                        if (rowId) applyProductToRow(rowId, p);
                        setProdOpen(false);
                      }}
                      title="Select product"
                    >
                      <td className="px-3 py-2 font-semibold text-slate-900">{p.name || "—"}</td>
                      <td className="px-3 py-2 text-slate-700">{p.item_code || "—"}</td>
                      <td className="px-3 py-2 text-slate-700">{p.sku || "—"}</td>
                      <td className="px-3 py-2 text-right text-slate-700">{intFmt(p.units_per_box ?? 1)}</td>
                      <td className="px-3 py-2 text-right text-slate-700">{money(p.selling_price ?? 0)}</td>
                    </tr>
                  ))}

                  {filteredProducts.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-sm text-muted-foreground">
                        No products match your search.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setProdOpen(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* PRINT ONLY */}
      <div className="inv-printonly">
        <DocAny
          variant="QUOTATION"
          docNoLabel="QUOTATION NO:"
          docNoValue={quotationNumber}
          dateLabel="DATE:"
          dateValue={quotationDate}
          purchaseOrderLabel={validUntil ? "VALID UNTIL:" : undefined}
          purchaseOrderValue={validUntil || ""}
          salesRepName={salesReps.join(", ")}
          salesRepPhone={salesReps.map(repPhoneByName).filter(Boolean).join(", ")}
          customer={{
            name: printedName || customer?.name || "",
            address: customer?.address || "",
            phone: customer?.phone || "",
            brn: customer?.brn || "",
            vat_no: customer?.vat_no || "",
            customer_code: customer?.customer_code || "",
          }}
          company={{ brn: "", vat_no: "" }}
          items={realLines.map((r: any, i: number) => ({
            sn: i + 1,
            item_code: r.item_code,
            uom: r.uom,
            box_qty: Math.trunc(n2(r.box_qty)),
            units_per_box: Math.trunc(n2(r.units_per_box)),
            total_qty: Math.trunc(n2(r.total_qty)),
            description: r.description,
            unit_price_excl_vat: n2(r.unit_price_excl_vat),
            unit_vat: n2(r.unit_vat),
            unit_price_incl_vat: n2(r.unit_price_incl_vat),
            line_total: n2(r.line_total),
          }))}
          totals={{
            subtotal: subtotalEx,
            vatPercentLabel: `VAT ${clampPct(vatPercent)}%`,
            vat_amount: vatAmount,
            total_amount: totalAfterDiscount,
            previous_balance: 0,
            amount_paid: 0,
            balance_remaining: 0,
            discount_percent: discountPercent,
            discount_amount: discountAmount,
          }}
          preparedBy=""
          deliveredBy=""
        />
      </div>
    </div>
  );
}


