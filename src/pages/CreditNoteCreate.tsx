// src/pages/CreditNoteCreate.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

import "@/styles/InvoiceCreate.css"; // ✅ reuse same exact CSS/theme as InvoiceCreate

import RamPotteryDoc from "@/components/print/RamPotteryDoc";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

/* =========================================================
   CreditNoteCreate — CLEAN REWORK (no duplicates)
   ✅ Links invoice correctly (dropdown per customer)
   ✅ Writes reason + reason_note to credit_notes
   ✅ Correct qty handling for BOX / PCS / KG / G / BAG
   ✅ DB triggers handle stock + invoice credits (no manual stock_movements)
========================================================= */

/* =========================
   Types
========================= */
type CustomerRow = {
  id: number;
  name: string;
  address?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  brn?: string | null;
  vat_no?: string | null;
  customer_code?: string | null;
  opening_balance?: number | null;
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

type InvoiceLite = {
  id: number;
  invoice_number: string | null;
  invoice_date: string | null;
  status: string | null;
  gross_total: number | null;
  total_amount: number | null;
  amount_paid: number | null;
  credits_applied: number | null;
  balance_remaining: number | null;
};

type Uom = "BOX" | "PCS" | "KG" | "G" | "BAG";
type CreditReason = "DAMAGED" | "RETURN" | "OTHERS";

type CreditLine = {
  id: string;
  product_id: number | null;

  item_code: string;
  description: string;

  uom: Uom;

  // stored qty fields
  box_qty: number; // BOX integer; KG decimal stored here
  pcs_qty: number; // PCS numeric(12,3) but we treat as integer in UI
  grams_qty: number; // G numeric(12,3) but UI uses integer
  bags_qty: number; // BAG numeric(12,3) but UI uses integer

  units_per_box: number; // BOX only
  total_qty: number; // computed by recalc

  vat_rate: number;

  base_unit_price_excl_vat: number;
  unit_price_excl_vat: number;
  unit_vat: number;
  unit_price_incl_vat: number;
  line_total: number;

  price_overridden?: boolean;
};

type PrintNameMode = "CUSTOMER" | "CLIENT";

/* =========================
   Sales reps (same as InvoiceCreate)
========================= */
const SALES_REPS = [
  { name: "Mr Koushal", phone: "59193239" },
  { name: "Mr Akash", phone: "59194918" },
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
function n2(v: any) {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}
function r2(v: any) {
  return Math.round(n2(v) * 100) / 100;
}
function roundTo(v: any, dp: number) {
  const x = n2(v);
  const m = Math.pow(10, dp);
  return Math.round(x * m) / m;
}
function round3(v: any) {
  return Math.round(n2(v) * 1000) / 1000;
}
function clampPct(v: any) {
  const x = n2(v);
  return Math.max(0, Math.min(100, x));
}
function money(v: any) {
  const x = n2(v);
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(x);
}
function intFmt(v: any) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.trunc(n2(v)));
}
function uid() {
  try {
    return crypto.randomUUID();
  } catch {
    return String(Date.now()) + "-" + Math.random().toString(16).slice(2);
  }
}
function safeUpb(v: any) {
  return Math.max(1, Math.trunc(n2(v) || 1));
}
function roundKg(v: any) {
  return Math.round(n2(v) * 1000) / 1000; // KG: 3dp
}
function parseNumInput(s: string) {
  const cleaned = String(s ?? "").replace(/,/g, "").trim();
  if (cleaned === "" || cleaned === ".") return 0;
  return n2(cleaned);
}
function rawNum(v: any) {
  const x = n2(v);
  return x === 0 ? "" : String(x);
}
function formatDateDMY(v: any) {
  const s = String(v ?? "").slice(0, 10);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return s || "—";
  return `${m[3]}-${m[2]}-${m[1]}`;
}
function normUomDb(u: any): Uom {
  const x = String(u || "BOX").trim().toUpperCase();
  if (x === "PCS") return "PCS";
  if (x === "KG" || x === "KGS") return "KG";
  if (x === "G" || x === "GRAM" || x === "GRAMS") return "G";
  if (x === "BAG" || x === "BAGS") return "BAG";
  return "BOX";
}

/* =========================
   Qty + totals recalc
========================= */
function recalc(row: CreditLine): CreditLine {
  const uom: Uom = normUomDb(row.uom);

  const upb = uom === "BOX" ? safeUpb(row.units_per_box) : 1;
  const rate = clampPct(row.vat_rate);

  let box_qty = 0;
  let pcs_qty = 0;
  let grams_qty = 0;
  let bags_qty = 0;
  let total_qty = 0;

  if (uom === "BOX") {
    box_qty = Math.max(0, Math.trunc(n2(row.box_qty)));
    total_qty = box_qty * upb;
  } else if (uom === "PCS") {
    pcs_qty = Math.max(0, Math.trunc(n2(row.pcs_qty)));
    total_qty = pcs_qty;
  } else if (uom === "KG") {
    box_qty = Math.max(0, roundKg(row.box_qty)); // store KG in box_qty
    total_qty = box_qty;
  } else if (uom === "G") {
    grams_qty = Math.max(0, Math.trunc(n2(row.grams_qty)));
    total_qty = grams_qty;
  } else {
    bags_qty = Math.max(0, Math.trunc(n2(row.bags_qty)));
    total_qty = bags_qty;
  }

  const unitEx = Math.max(0, n2(row.unit_price_excl_vat));
  const unitVat = unitEx * (rate / 100);
  const unitInc = unitEx + unitVat;

  return {
    ...row,
    uom,
    units_per_box: upb,
    vat_rate: rate,

    box_qty,
    pcs_qty,
    grams_qty,
    bags_qty,
    total_qty,

    unit_vat: roundTo(unitVat, 3),
    unit_price_incl_vat: roundTo(unitInc, 3),
    line_total: r2(total_qty * unitInc),
  };
}

function blankLine(defaultVat: number): CreditLine {
  return recalc({
    id: uid(),
    product_id: null,

    item_code: "",
    description: "",

    uom: "BOX",
    box_qty: 0,
    pcs_qty: 0,
    grams_qty: 0,
    bags_qty: 0,

    units_per_box: 1,
    total_qty: 0,

    vat_rate: clampPct(defaultVat),

    base_unit_price_excl_vat: 0,
    unit_price_excl_vat: 0,
    unit_vat: 0,
    unit_price_incl_vat: 0,
    line_total: 0,

    price_overridden: false,
  });
}

/* =========================
   CN numbering (CN-0001…)
========================= */
function pad4(x: number) {
  return String(x).padStart(4, "0");
}

async function nextCreditNoteNumber(): Promise<string> {
  const { data, error } = await supabase.from("credit_notes").select("credit_note_number, id").order("id", { ascending: false }).limit(1);
  if (error) throw new Error(error.message);

  const last = data?.[0]?.credit_note_number || "";
  const m = String(last).match(/(\d+)\s*$/);
  const next = m ? Number(m[1]) + 1 : data?.[0]?.id ? Number(data[0].id) + 1 : 1;

  return `CN-${pad4(next)}`;
}

/* =========================
   Invoices by customer (dropdown)
========================= */
async function listInvoicesByCustomer(customerId: number): Promise<InvoiceLite[]> {
  const { data, error } = await supabase
    .from("invoices")
    .select("id,invoice_number,invoice_date,status,gross_total,total_amount,amount_paid,credits_applied,balance_remaining")
    .eq("customer_id", customerId)
    .neq("status", "VOID")
    .order("invoice_date", { ascending: false })
    .order("id", { ascending: false })
    .limit(500);

  if (error) throw new Error(error.message);
  return (data || []) as any;
}

/* =========================
   Page
========================= */
export default function CreditNoteCreate() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const duplicateId = params.get("duplicate"); // reserved for future

  const [saving, setSaving] = useState(false);
  const [printing, setPrinting] = useState(false);

  // header fields
  const [printNameMode, setPrintNameMode] = useState<PrintNameMode>("CUSTOMER");
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [clientName, setClientName] = useState<string>("");

  // invoice dropdown
  const [invoiceId, setInvoiceId] = useState<number | null>(null);
  const [invoicesForCustomer, setInvoicesForCustomer] = useState<InvoiceLite[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);

  // reason
  const [reason, setReason] = useState<CreditReason>("RETURN");
  const [reasonNote, setReasonNote] = useState<string>("");

  const [creditNoteDate, setCreditNoteDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [purchaseOrderNo, setPurchaseOrderNo] = useState<string>("");

  // optional UX knobs
  const [vatPercentText, setVatPercentText] = useState<string>("15");
  const [discountPercentText, setDiscountPercentText] = useState<string>("");
  const [discountTouched, setDiscountTouched] = useState(false);

  const [previousBalanceText, setPreviousBalanceText] = useState<string>("");
  const [amountPaidText, setAmountPaidText] = useState<string>("");

  const [balanceTouched, setBalanceTouched] = useState(false);
  const [balanceManualText, setBalanceManualText] = useState<string>("");

  const [creditNoteNumber, setCreditNoteNumber] = useState<string>("(Auto when saved)");

  // sales reps
  const [repOpen, setRepOpen] = useState(false);
  const [salesReps, setSalesReps] = useState<SalesRepName[]>([]);

  // options
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);

  // rows
  const vatDefault = clampPct(vatPercentText);
  const discountPercent = clampPct(discountPercentText);

  const [lines, setLines] = useState<CreditLine[]>([blankLine(15)]);
  const qtyRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // decimal-safe edit buffers
  const [editingEx, setEditingEx] = useState<Record<string, string>>({});
  const [editingVat, setEditingVat] = useState<Record<string, string>>({});
  const [editingInc, setEditingInc] = useState<Record<string, string>>({});

  // search modals
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);
  const [customerSearchTerm, setCustomerSearchTerm] = useState("");

  const [productSearchOpen, setProductSearchOpen] = useState(false);
  const [productSearchRowId, setProductSearchRowId] = useState<string | null>(null);
  const [productSearchTerm, setProductSearchTerm] = useState("");

  const customer = useMemo(() => customers.find((c) => c.id === customerId) || null, [customers, customerId]);

  const selectedInvoice = useMemo(() => {
    if (!invoiceId) return null;
    return invoicesForCustomer.find((x) => x.id === invoiceId) || null;
  }, [invoiceId, invoicesForCustomer]);

  const filteredCustomers = useMemo(() => {
    const t = customerSearchTerm.trim().toLowerCase();
    if (!t) return customers;
    return customers.filter((c) => {
      const name = String(c.name || "").toLowerCase();
      const phone = String(c.phone || "").toLowerCase();
      const code = String(c.customer_code || "").toLowerCase();
      const addr = String(c.address || "").toLowerCase();
      return name.includes(t) || phone.includes(t) || code.includes(t) || addr.includes(t);
    });
  }, [customers, customerSearchTerm]);

  const filteredProducts = useMemo(() => {
    const t = productSearchTerm.trim().toLowerCase();
    if (!t) return products;
    return products.filter((p) => {
      const code = String(p.item_code || "").toLowerCase();
      const sku = String(p.sku || "").toLowerCase();
      const name = String(p.name || "").toLowerCase();
      const desc = String(p.description || "").toLowerCase();
      return code.includes(t) || sku.includes(t) || name.includes(t) || desc.includes(t);
    });
  }, [products, productSearchTerm]);

  // printed name
  const printedName = useMemo(() => {
    const cn = (customer?.name || "").trim();
    const cl = clientName.trim();
    if (printNameMode === "CLIENT") return cl || cn;
    return cn || cl;
  }, [printNameMode, customer?.name, clientName]);

  // close rep pop on outside click
  useEffect(() => {
    function close() {
      setRepOpen(false);
    }
    if (!repOpen) return;
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [repOpen]);

  /* =========================
     Load options + next CN
  ========================= */
  async function loadOptions() {
    try {
      const [cnNo, custQ, prodQ] = await Promise.all([
        nextCreditNoteNumber(),
        supabase
          .from("customers")
          .select("id,name,address,phone,whatsapp,brn,vat_no,customer_code,opening_balance,discount_percent")
          .order("name", { ascending: true })
          .limit(5000),
        supabase.from("products").select("id,item_code,sku,name,description,units_per_box,selling_price").order("name", { ascending: true }).limit(5000),
      ]);

      if (custQ.error) throw new Error(custQ.error.message);
      if (prodQ.error) throw new Error(prodQ.error.message);

      setCreditNoteNumber(cnNo);
      setCustomers((custQ.data || []) as any);
      setProducts((prodQ.data || []) as any);

      // reserved: if you later implement duplicate
      void duplicateId;
    } catch (e: any) {
      toast.error(e?.message || "Failed to load customers/products");
    }
  }

  useEffect(() => {
    void loadOptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* =========================
     Customer change
========================= */
  useEffect(() => {
    if (!customerId || !customer) return;

    // opening balance
    const ob = customer.opening_balance ?? null;
    if (ob !== null && ob !== undefined && String(ob) !== "0") setPreviousBalanceText(String(ob));
    else setPreviousBalanceText("");

    // discount default
    if (!discountTouched) {
      const dp = customer.discount_percent ?? null;
      if (dp !== null && dp !== undefined && String(dp) !== "0") setDiscountPercentText(String(dp));
      else setDiscountPercentText("");
    }

    if (!clientName.trim()) setClientName(customer.name || "");

    // invoices dropdown
    setInvoiceId(null);
    setInvoicesForCustomer([]);
    setLoadingInvoices(true);

    (async () => {
      try {
        const list = await listInvoicesByCustomer(customerId);
        setInvoicesForCustomer(list);

        const firstOpen = (list || []).find((x) => n2(x.balance_remaining) > 0);
        setInvoiceId(firstOpen?.id ?? (list?.[0]?.id ?? null));
      } catch (e: any) {
        toast.error(e?.message || "Failed to load customer invoices");
        setInvoicesForCustomer([]);
        setInvoiceId(null);
      } finally {
        setLoadingInvoices(false);
      }
    })();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  /* =========================
     Discount recalculates unit_ex from base
========================= */
  useEffect(() => {
    const dp = clampPct(discountPercentText);
    setLines((prev) =>
      prev.map((r) => {
        if (!r.product_id) return r;
        if (r.price_overridden) return r;
        const base = n2(r.base_unit_price_excl_vat);
        const discounted = roundTo(base * (1 - dp / 100), 6);
        return recalc({ ...r, unit_price_excl_vat: discounted } as CreditLine);
      })
    );
  }, [discountPercentText]);

  /* =========================
     Row helpers
========================= */
  function setLine(id: string, patch: Partial<CreditLine>) {
    setLines((prev) => prev.map((r) => (r.id === id ? recalc({ ...r, ...patch } as CreditLine) : r)));
  }

  function setLinePriceEx(id: string, unitEx: number) {
    setLines((prev) => prev.map((r) => (r.id === id ? recalc({ ...r, unit_price_excl_vat: Math.max(0, n2(unitEx)), price_overridden: true } as CreditLine) : r)));
  }

  function setLinePriceInc(id: string, unitInc: number) {
    setLines((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const rate = clampPct(r.vat_rate);
        const inc = Math.max(0, n2(unitInc));
        const denom = 1 + rate / 100;
        const ex = denom > 0 ? inc / denom : inc;
        return recalc({ ...r, unit_price_excl_vat: Math.max(0, ex), price_overridden: true } as CreditLine);
      })
    );
  }

  function setLineTotalQty(id: string, totalQty: number) {
    setLines((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;

        if (r.uom === "BOX") {
          const upb = safeUpb(r.units_per_box);
          const tq = Math.max(0, Math.trunc(n2(totalQty)));
          const bq = upb > 0 ? tq / upb : 0;
          return recalc({ ...r, box_qty: bq } as CreditLine);
        }

        if (r.uom === "PCS") {
          const tq = Math.max(0, Math.trunc(n2(totalQty)));
          return recalc({ ...r, pcs_qty: tq } as CreditLine);
        }

        if (r.uom === "G") {
          const g = Math.max(0, Math.trunc(n2(totalQty)));
          return recalc({ ...r, grams_qty: g } as CreditLine);
        }

        if (r.uom === "BAG") {
          const b = Math.max(0, Math.trunc(n2(totalQty)));
          return recalc({ ...r, bags_qty: b } as CreditLine);
        }

        // KG
        const kg = Math.max(0, roundKg(totalQty));
        return recalc({ ...r, box_qty: kg } as CreditLine);
      })
    );
  }

  function addRowAndFocus() {
    const newRow = blankLine(vatDefault);
    setLines((prev) => [...prev, newRow]);
    setTimeout(() => {
      qtyRefs.current[newRow.id]?.focus?.();
      qtyRefs.current[newRow.id]?.select?.();
    }, 0);
  }

  function removeRow(id: string) {
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
            uom: "BOX",
            box_qty: 0,
            pcs_qty: 0,
            grams_qty: 0,
            bags_qty: 0,
            units_per_box: 1,
            total_qty: 0,
            base_unit_price_excl_vat: 0,
            unit_price_excl_vat: 0,
            vat_rate: vatDefault,
            price_overridden: false,
          } as CreditLine);
        }

        const dp = clampPct(discountPercentText);
        const baseEx = n2(product.selling_price || 0);
        const discountedEx = roundTo(baseEx * (1 - dp / 100), 6);

        const upb = Math.max(1, Math.trunc(n2(product.units_per_box || 1)));
        const nextUom = normUomDb(r.uom || "BOX");

        // pick sane initial qty per uom
        const next: Partial<CreditLine> = {};
        if (nextUom === "KG") next.box_qty = Math.max(0, roundKg(r.box_qty || 0));
        else if (nextUom === "PCS") next.pcs_qty = Math.max(1, Math.trunc(n2(r.pcs_qty || 1)));
        else if (nextUom === "G") next.grams_qty = Math.max(1, Math.trunc(n2(r.grams_qty || 1)));
        else if (nextUom === "BAG") next.bags_qty = Math.max(1, Math.trunc(n2(r.bags_qty || 1)));
        else next.box_qty = Math.max(1, Math.trunc(n2(r.box_qty || 1)));

        return recalc({
          ...r,
          product_id: product.id,
          item_code: String(product.item_code || product.sku || "").trim(),
          description: String(product.description || product.name || "").trim(),
          uom: nextUom,
          units_per_box: upb,

          base_unit_price_excl_vat: baseEx,
          unit_price_excl_vat: discountedEx,
          vat_rate: clampPct(r.vat_rate || vatDefault),

          price_overridden: false,
          ...next,
        } as CreditLine);
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
    addRowAndFocus();
  }

  /* =========================
     Search modals
========================= */
  function openCustomerSearch() {
    setCustomerSearchTerm("");
    setCustomerSearchOpen(true);
    setTimeout(() => {
      const el = document.getElementById("invCustomerSearchInput") as HTMLInputElement | null;
      el?.focus?.();
    }, 0);
  }
  function closeCustomerSearch() {
    setCustomerSearchOpen(false);
    setCustomerSearchTerm("");
  }

  function openProductSearch(rowId: string) {
    setProductSearchRowId(rowId);
    setProductSearchTerm("");
    setProductSearchOpen(true);
    setTimeout(() => {
      const el = document.getElementById("invProductSearchInput") as HTMLInputElement | null;
      el?.focus?.();
    }, 0);
  }
  function closeProductSearch() {
    setProductSearchOpen(false);
    setProductSearchRowId(null);
    setProductSearchTerm("");
  }

  /* =========================
     Totals
========================= */
  const realLines = useMemo(() => lines.filter((l) => !!l.product_id), [lines]);

  const subtotalEx = useMemo(() => r2(realLines.reduce((sum, r) => sum + n2(r.total_qty) * n2(r.unit_price_excl_vat), 0)), [realLines]);

  const vatAmount = useMemo(() => {
    return r2(
      realLines.reduce((sum, r) => {
        const rate = clampPct(r.vat_rate);
        const ex = n2(r.unit_price_excl_vat);
        return sum + n2(r.total_qty) * (ex * (rate / 100));
      }, 0)
    );
  }, [realLines]);

  const totalAmount = useMemo(() => r2(subtotalEx + vatAmount), [subtotalEx, vatAmount]);

  const discountAmount = useMemo(() => {
    const baseEx = realLines.reduce((sum, r) => sum + n2(r.total_qty) * n2(r.base_unit_price_excl_vat), 0);
    const discEx = realLines.reduce((sum, r) => sum + n2(r.total_qty) * n2(r.unit_price_excl_vat), 0);
    return Math.max(0, r2(baseEx - discEx));
  }, [realLines]);

  const previousBalance = useMemo(() => n2(previousBalanceText), [previousBalanceText]);
  const amountPaid = useMemo(() => n2(amountPaidText), [amountPaidText]);

  const grossTotal = useMemo(() => r2(totalAmount + previousBalance), [totalAmount, previousBalance]);
  const balanceAuto = useMemo(() => Math.max(0, r2(grossTotal - amountPaid)), [grossTotal, amountPaid]);

  const balanceRemaining = useMemo(() => {
    if (!balanceTouched) return balanceAuto;
    const wanted = Math.max(0, n2(balanceManualText));
    return r2(wanted);
  }, [balanceTouched, balanceManualText, balanceAuto]);

  useEffect(() => {
    if (!balanceTouched) return;
    const wanted = Math.max(0, n2(balanceManualText));
    const newPaid = Math.max(0, r2(grossTotal - wanted));
    setAmountPaidText(newPaid ? String(newPaid) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [balanceManualText, balanceTouched, grossTotal]);

  /* =========================
     Save / Print
========================= */
  function isQtyValid(l: CreditLine) {
    const u = normUomDb(l.uom);
    if (u === "BOX") return Math.trunc(n2(l.box_qty)) > 0;
    if (u === "PCS") return Math.trunc(n2(l.pcs_qty)) > 0;
    if (u === "KG") return n2(l.box_qty) > 0;
    if (u === "G") return Math.trunc(n2(l.grams_qty)) > 0;
    return Math.trunc(n2(l.bags_qty)) > 0; // BAG
  }

  async function onSave() {
    if (!customerId) return toast.error("Please select a customer.");
    if (!creditNoteDate) return toast.error("Please select credit note date.");
    if (!salesReps.length) return toast.error("Please select at least one sales rep.");
    if (realLines.length === 0) return toast.error("Please add at least one item.");
    if (realLines.some((l) => !isQtyValid(l))) return toast.error("Qty must be greater than 0.");

    if (printNameMode === "CLIENT" && !clientName.trim()) {
      return toast.error("Please enter a Client Name (or switch to Customer Name).");
    }

    setSaving(true);
    try {
      const headerPayload: any = {
        credit_note_number: creditNoteNumber,
        credit_note_date: creditNoteDate,
        customer_id: customerId,
        invoice_id: invoiceId ?? null,
        reason: reason ?? null,
        reason_note: reasonNote?.trim() ? reasonNote.trim() : null,
        subtotal: subtotalEx,
        vat_amount: vatAmount,
        total_amount: totalAmount,
        status: "ISSUED",
      };

      const cnIns = await supabase.from("credit_notes").insert(headerPayload).select("id, credit_note_number").single();
      if (cnIns.error) throw new Error(cnIns.error.message);

      const cnId = cnIns.data?.id as number;
      if (!cnId) throw new Error("Failed to create credit note");

      const savedNo = String(cnIns.data?.credit_note_number || creditNoteNumber);
      setCreditNoteNumber(savedNo);

      // ✅ Insert items (align to credit_note_items DDL precision + normalized uom)
      const itemsPayload = realLines.map((l) => {
        const uom = normUomDb(l.uom);
        const upb = uom === "BOX" ? round3(Math.max(1, n2(l.units_per_box || 1))) : round3(1);

        const box_qty =
          uom === "BOX" ? Math.max(0, Math.trunc(n2(l.box_qty))) :
          uom === "KG" ? Math.max(0, round3(l.box_qty)) :
          0;

        const pcs_qty = uom === "PCS" ? Math.max(0, round3(l.pcs_qty)) : 0;
        const grams_qty = uom === "G" ? Math.max(0, round3(l.grams_qty)) : 0;
        const bags_qty = uom === "BAG" ? Math.max(0, round3(l.bags_qty)) : 0;

        const total_qty =
          uom === "BOX" ? round3(box_qty * upb) :
          uom === "PCS" ? round3(pcs_qty) :
          uom === "KG" ? round3(box_qty) :
          uom === "G" ? round3(grams_qty) :
          round3(bags_qty);

        const rate = clampPct(l.vat_rate);
        const unitEx = Math.max(0, n2(l.unit_price_excl_vat));
        const unitVat = round3(unitEx * (rate / 100));
        const unitInc = round3(unitEx + unitVat);
        const lineTotal = r2(total_qty * unitInc);

        return {
          credit_note_id: cnId,
          product_id: l.product_id,

          uom,
          box_qty,
          pcs_qty,
          grams_qty,
          bags_qty,
          units_per_box: upb,
          total_qty,

          unit_price_excl_vat: unitEx,
          unit_vat: unitVat,
          unit_price_incl_vat: unitInc,
          line_total: lineTotal,

          description: l.description?.trim() ? l.description.trim() : null,
          vat_rate: rate,

          price_overridden: !!l.price_overridden,
          base_unit_price_excl_vat: n2(l.base_unit_price_excl_vat),
        };
      });

      const itIns = await supabase.from("credit_note_items").insert(itemsPayload as any);
      if (itIns.error) throw new Error(itIns.error.message);

      toast.success(invoiceId ? `Credit note saved & applied: ${savedNo}` : `Credit note saved: ${savedNo}`);
      nav(`/credit-notes/${cnId}`, { replace: true });
    } catch (e: any) {
      toast.error(e?.message || "Failed to save credit note");
    } finally {
      setSaving(false);
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
    <div className="inv-page">
      {/* TOP ACTIONS */}
      <div className="inv-actions inv-screen inv-actions--tight">
        <Button variant="outline" onClick={() => nav(-1)}>
          ← Back
        </Button>

        <div className="inv-actions-right">
          <Button variant="outline" onClick={onPrint} disabled={printing}>
            {printing ? "Preparing…" : "Print"}
          </Button>

          <Button onClick={onSave} disabled={saving}>
            {saving ? "Saving…" : "Save Credit Note"}
          </Button>
        </div>
      </div>

      {/* FORM */}
      <div className="inv-screen inv-form-shell inv-form-shell--tight">
        <div className="inv-form-card">
          <div className="inv-form-head inv-form-head--tight">
            <div>
              <div className="inv-form-title">New Credit Note</div>
              <div className="inv-form-sub">A4 Print Template Locked (Ram Pottery Ltd)</div>
            </div>

            <div className="inv-form-meta">
              <div className="inv-meta-row">
                <span className="inv-meta-k">Credit Note No</span>
                <span className="inv-meta-v">{creditNoteNumber}</span>
              </div>
              <div className="inv-meta-row">
                <span className="inv-meta-k">Date</span>
                <span className="inv-meta-v">{creditNoteDate}</span>
              </div>
            </div>
          </div>

          {/* 2 STRAIGHT ROWS */}
          <div className="inv-form-2rows">
            {/* ROW 1 */}
            <div className="inv-form-row inv-form-row--top inv-row-red">
              <div className="inv-field inv-field--printblock">
                <label>Print Name</label>

                <div className="inv-printblock-inner">
                  <div className="inv-radioRow">
                    <label className="inv-radioOpt">
                      <input type="radio" checked={printNameMode === "CUSTOMER"} onChange={() => setPrintNameMode("CUSTOMER")} />
                      <span>Customer Name</span>
                    </label>

                    <label className="inv-radioOpt">
                      <input type="radio" checked={printNameMode === "CLIENT"} onChange={() => setPrintNameMode("CLIENT")} />
                      <span>Client Name</span>
                    </label>
                  </div>

                  <input className="inv-input" value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Type a client name (optional)" />

                  <div className="inv-help">
                    Only one name prints on the credit note header (based on selection).
                    <br />
                    If “Client Name” is selected, this input prints as the customer name.
                  </div>
                </div>
              </div>

              <div className="inv-field inv-field--customerBig">
                <label>Customer (account)</label>

                <div className="inv-customerRow">
                  <select className="inv-input inv-input--customerSelect" value={customerId ?? ""} onChange={(e) => setCustomerId(e.target.value ? Number(e.target.value) : null)}>
                    <option value="">Select…</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>

                  <button type="button" className="inv-iconBtn" onClick={openCustomerSearch} title="Search customer">
                    🔍
                  </button>
                </div>

                <div className="inv-help">
                  {customer ? (
                    <>
                      <span>{customer.address || ""}</span>
                      {customer.phone ? (
                        <>
                          {" "}
                          · <span>{customer.phone}</span>
                        </>
                      ) : null}
                      {customer.customer_code ? (
                        <>
                          {" "}
                          · <span className="inv-muted">{customer.customer_code}</span>
                        </>
                      ) : null}
                    </>
                  ) : (
                    <span>Select a customer</span>
                  )}
                </div>
              </div>

              {/* Invoice dropdown */}
              <div className="inv-field">
                <label>Apply to Invoice</label>
                <select
                  className="inv-input"
                  value={invoiceId ?? ""}
                  onChange={(e) => setInvoiceId(e.target.value ? Number(e.target.value) : null)}
                  disabled={!customerId || loadingInvoices}
                >
                  <option value="">
                    {!customerId ? "Select customer first" : loadingInvoices ? "Loading invoices…" : "None (Standalone credit note)"}
                  </option>
                  {invoicesForCustomer.map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      {(inv.invoice_number || `#${inv.id}`) +
                        " • " +
                        formatDateDMY(inv.invoice_date) +
                        " • Bal: Rs " +
                        money(inv.balance_remaining ?? 0) +
                        " • " +
                        String(inv.status || "")}
                    </option>
                  ))}
                </select>
                <div className="inv-help">
                  If you select an invoice, the DB trigger will update invoice <b>credits_applied</b> and <b>balance/status</b>.
                </div>
              </div>

              {/* Reason */}
              <div className="inv-field">
                <label>Reason</label>
                <select className="inv-input" value={reason} onChange={(e) => setReason(e.target.value as any)}>
                  <option value="DAMAGED">Damaged</option>
                  <option value="RETURN">Return</option>
                  <option value="OTHERS">Others</option>
                </select>

                <input
                  className="inv-input"
                  value={reasonNote}
                  onChange={(e) => setReasonNote(e.target.value)}
                  placeholder={reason === "OTHERS" ? "Type your reason..." : "Optional details"}
                  style={{ marginTop: 6 }}
                />
              </div>

              <div className="inv-field">
                <label>Credit Note Date</label>
                <input className="inv-input" type="date" value={creditNoteDate} onChange={(e) => setCreditNoteDate(e.target.value)} />
              </div>

              <div className="inv-field">
                <label>Purchase Order No (optional)</label>
                <input className="inv-input" value={purchaseOrderNo} onChange={(e) => setPurchaseOrderNo(e.target.value)} placeholder="Optional" />
              </div>
            </div>

            {/* ROW 2 */}
            <div className="inv-form-row inv-form-row--bottom inv-row-red">
              <div className="inv-field inv-field--salesrep">
                <label>Sales Rep(s)</label>

                <div className="inv-rep">
                  <button type="button" className="inv-rep-btn" onClick={() => setRepOpen((v) => !v)} aria-expanded={repOpen}>
                    <div className="inv-rep-chips">
                      {salesReps.length ? (
                        salesReps.map((n) => (
                          <span key={n} className="inv-chip">
                            {n} ({repPhoneByName(n)})
                            <span
                              className="inv-chip-x"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSalesReps(salesReps.filter((x) => x !== n));
                              }}
                              title="Remove"
                            >
                              ×
                            </span>
                          </span>
                        ))
                      ) : (
                        <span className="inv-rep-placeholder">Select sales reps…</span>
                      )}
                    </div>
                    <span className="inv-rep-caret">▾</span>
                  </button>

                  {repOpen ? (
                    <div className="inv-rep-pop" onMouseDown={(e) => e.stopPropagation()}>
                      {SALES_REPS.map((r) => {
                        const active = salesReps.includes(r.name);
                        return (
                          <button
                            key={r.name}
                            type="button"
                            className={"inv-rep-item" + (active ? " is-active" : "")}
                            onClick={() => {
                              const next = active ? salesReps.filter((x) => x !== r.name) : [...salesReps, r.name];
                              setSalesReps(next);
                              setRepOpen(false);
                            }}
                          >
                            <span className="inv-rep-name">{r.name}</span>
                            <span className="inv-rep-phone">{r.phone}</span>
                            <span className="inv-rep-check">{active ? "✓" : ""}</span>
                          </button>
                        );
                      })}
                      <div className="inv-rep-hint">Click to select. Click again to remove.</div>
                    </div>
                  ) : null}
                </div>

                <div className="inv-help">This prints on the credit note + is saved to the record (if you store it later).</div>
              </div>

              <div className="inv-field">
                <label>Default VAT %</label>
                <input className="inv-input inv-input--right inv-input--sm" inputMode="decimal" value={vatPercentText} onChange={(e) => setVatPercentText(e.target.value)} />
                <div className="inv-help">Used for NEW rows only. Each row VAT is editable.</div>
              </div>

              <div className="inv-field">
                <label>Discount %</label>
                <input
                  className="inv-input inv-input--right inv-input--sm"
                  inputMode="decimal"
                  value={discountPercentText}
                  onChange={(e) => {
                    setDiscountTouched(true);
                    setDiscountPercentText(e.target.value);
                  }}
                  placeholder="e.g. 2.5"
                />
                <div className="inv-help">Decimals allowed. Will not overwrite edited row prices.</div>
              </div>

              <div className="inv-field">
                <label>Previous Balance</label>
                <input className="inv-input inv-input--right inv-input--sm" inputMode="decimal" value={previousBalanceText} onChange={(e) => setPreviousBalanceText(e.target.value)} />
              </div>

              <div className="inv-field">
                <label>Amount Paid</label>
                <input
                  className="inv-input inv-input--right inv-input--sm"
                  inputMode="decimal"
                  value={amountPaidText}
                  onChange={(e) => {
                    setBalanceTouched(false);
                    setAmountPaidText(e.target.value);
                  }}
                />
              </div>

              <div className="inv-field">
                <label>Amount Remaining</label>
                <input
                  className="inv-input inv-input--right inv-input--sm"
                  inputMode="decimal"
                  value={balanceTouched ? balanceManualText : balanceRemaining ? String(balanceRemaining) : ""}
                  onChange={(e) => {
                    setBalanceTouched(true);
                    setBalanceManualText(e.target.value);
                  }}
                />
                <div className="inv-help">Editable → updates Amount Paid automatically.</div>
              </div>
            </div>
          </div>

          {/* invoice preview */}
          {selectedInvoice ? (
            <div className="inv-help" style={{ marginTop: 10 }}>
              <b>Selected Invoice:</b> {selectedInvoice.invoice_number || `#${selectedInvoice.id}`} • Date: {formatDateDMY(selectedInvoice.invoice_date)} • Balance: Rs{" "}
              {money(selectedInvoice.balance_remaining ?? 0)}
            </div>
          ) : null}

          {/* ITEMS */}
          <div className="inv-items">
            <div className="inv-items-head">
              <div>
                <div className="inv-items-title">Items</div>
                <div className="inv-items-sub">Row VAT is editable. BOX/PCS/KG/G/BAG qty is correct and stored in DB.</div>
              </div>

              <div className="inv-items-actions">
                <Button onClick={addRowAndFocus}>+ Add Row</Button>
              </div>
            </div>

            <div className="inv-table-wrap">
              <table className="inv-table inv-table--invoiceCols">
                <colgroup>
                    <col style={{ width: "44px" }} />   {/* # */}
                    <col style={{ width: "360px" }} />  {/* PRODUCT */}
                    <col style={{ width: "56px" }} />   {/* 🔍 */}
                    <col style={{ width: "190px" }} />  {/* QTY (UOM + Qty input) */}
                    <col style={{ width: "90px" }} />   {/* UNIT */}
                    <col style={{ width: "110px" }} />  {/* TOTAL QTY */}
                    <col style={{ width: "120px" }} />  {/* UNIT EX */}
                    <col style={{ width: "90px" }} />   {/* VAT % */}
                    <col style={{ width: "120px" }} />  {/* UNIT INC */}
                    <col style={{ width: "140px" }} />  {/* TOTAL */}
                    <col style={{ width: "44px" }} />   {/* X */}
               </colgroup>

                <thead>
                  <tr>
                    <th className="inv-th inv-th-center">#</th>
                    <th className="inv-th">PRODUCT</th>
                    <th className="inv-th inv-th-center" />
                    <th className="inv-th inv-th-center">QTY</th>
                    <th className="inv-th inv-th-center">UNIT</th>
                    <th className="inv-th inv-th-center">TOTAL QTY</th>
                    <th className="inv-th inv-th-right">UNIT EX</th>
                    <th className="inv-th inv-th-right">VAT %</th>
                    <th className="inv-th inv-th-right">UNIT INC</th>
                    <th className="inv-th inv-th-right">TOTAL</th>
                    <th className="inv-th inv-th-center" />
                  </tr>
                </thead>

                <tbody>
                  {lines.map((r, idx) => {
                    const isReal = !!r.product_id;

                    const qtyDisplay =
                      r.uom === "PCS" ? rawNum(r.pcs_qty) :
                      r.uom === "KG" ? rawNum(r.box_qty) :
                      r.uom === "G" ? rawNum(r.grams_qty) :
                      r.uom === "BAG" ? rawNum(r.bags_qty) :
                      rawNum(r.box_qty); // BOX

                    return (
                      <tr key={r.id} className="inv-tr-red">
                        <td className="inv-td inv-center">{idx + 1}</td>

                        <td className="inv-td">
                          <select
                            className="inv-input inv-input--prod"
                            value={r.product_id ?? ""}
                            onChange={(e) => {
                              const pid = e.target.value ? Number(e.target.value) : null;
                              const p = pid ? products.find((x) => x.id === pid) || null : null;
                              applyProductToRow(r.id, p);
                            }}
                          >
                            <option value="">Select…</option>
                            {products.map((p) => (
                              <option key={p.id} value={p.id}>
                                {(p.item_code || p.sku || "").toString()} — {(p.name || "").toString()}
                              </option>
                            ))}
                          </select>
                        </td>

                        <td className="inv-td inv-center">
                          <button type="button" className="inv-iconBtn inv-iconBtn--table inv-prodSearchBtn" onClick={() => openProductSearch(r.id)} title="Search product">
                            🔍
                          </button>
                        </td>

                        {/* Qty input (UOM + qty) */}
                        <td className="inv-td inv-center">
                          <div className="inv-boxcell inv-boxcell--oneRow">
                            <select
                              className="inv-input inv-input--uom"
                              value={r.uom}
                              onChange={(e) => setLine(r.id, { uom: e.target.value as any })}
                              disabled={!isReal}
                            >
                              <option value="BOX">BOX</option>
                              <option value="PCS">PCS</option>
                              <option value="KG">Kg</option>
                              <option value="G">Grams</option>
                              <option value="BAG">Bags</option>
                            </select>

                            <input
                              ref={(el) => (qtyRefs.current[r.id] = el)}
                              className="inv-input inv-input--qty inv-center"
                              value={qtyDisplay}
                              onChange={(e) => {
                                const v = parseNumInput(e.target.value);
                                if (r.uom === "PCS") setLine(r.id, { pcs_qty: v });
                                else if (r.uom === "KG") setLine(r.id, { box_qty: v });
                                else if (r.uom === "G") setLine(r.id, { grams_qty: v });
                                else if (r.uom === "BAG") setLine(r.id, { bags_qty: v });
                                else setLine(r.id, { box_qty: v }); // BOX
                              }}
                              onFocus={(e) => e.currentTarget.select()}
                              onWheel={(e) => (e.currentTarget as HTMLInputElement).blur()}
                              onKeyDown={(e) => {
                                if (e.key !== "Enter") return;
                                if (!isReal) return;
                                e.preventDefault();
                                focusNextQty(r.id);
                              }}
                              disabled={!isReal}
                              inputMode="decimal"
                              step="any"
                              placeholder={r.uom === "KG" ? "0.000" : "0"}
                            />
                          </div>
                        </td>

                        {/* UNIT / UPB */}
                        <td className="inv-td inv-center">
                          {r.uom === "BOX" ? (
                            <input
                              className="inv-input inv-center"
                              value={rawNum(r.units_per_box)}
                              onChange={(e) => setLine(r.id, { units_per_box: parseNumInput(e.target.value) })}
                              onFocus={(e) => e.currentTarget.select()}
                              onWheel={(e) => (e.currentTarget as HTMLInputElement).blur()}
                              disabled={!isReal}
                              inputMode="decimal"
                              step="any"
                            />
                          ) : (
                            <input className="inv-input inv-center" value={r.uom === "KG" ? "Kg" : ""} readOnly />
                          )}
                        </td>

                        {/* TOTAL QTY */}
                        <td className="inv-td inv-center">
                          <input
                            className="inv-input inv-center"
                            value={rawNum(r.total_qty)}
                            onChange={(e) => setLineTotalQty(r.id, parseNumInput(e.target.value))}
                            onFocus={(e) => e.currentTarget.select()}
                            onWheel={(e) => (e.currentTarget as HTMLInputElement).blur()}
                            disabled={!isReal}
                            inputMode="decimal"
                            step="any"
                          />
                        </td>

                        {/* UNIT EX */}
                        <td className="inv-td inv-right">
                          <input
                            className="inv-input inv-input--right"
                            inputMode="decimal"
                            placeholder="0.0000"
                            value={editingEx[r.id] !== undefined ? editingEx[r.id] : rawNum(r.unit_price_excl_vat) || ""}
                            onChange={(e) => {
                              const v = e.target.value.replace(/,/g, "");
                              if (v !== "" && v !== "." && !/^\d*\.?\d*$/.test(v)) return;
                              setEditingEx((prev) => ({ ...prev, [r.id]: v }));
                            }}
                            onBlur={() => {
                              const v = editingEx[r.id];
                              const commit = v === undefined ? rawNum(r.unit_price_excl_vat) : v;
                              setLinePriceEx(r.id, parseNumInput(commit));
                              setEditingEx((prev) => {
                                const { [r.id]: _, ...rest } = prev;
                                return rest;
                              });
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") e.currentTarget.blur();
                              if (e.key === "Escape") {
                                setEditingEx((prev) => {
                                  const { [r.id]: _, ...rest } = prev;
                                  return rest;
                                });
                                e.currentTarget.blur();
                              }
                            }}
                            disabled={!isReal}
                          />
                        </td>

                        {/* VAT % */}
                        <td className="inv-td inv-right">
                          <input
                            className="inv-input inv-input--right"
                            inputMode="decimal"
                            placeholder="15"
                            value={editingVat[r.id] !== undefined ? editingVat[r.id] : rawNum(r.vat_rate) || ""}
                            onChange={(e) => {
                              const v = e.target.value.replace(/,/g, "");
                              if (v !== "" && v !== "." && !/^\d*\.?\d*$/.test(v)) return;
                              setEditingVat((prev) => ({ ...prev, [r.id]: v }));
                            }}
                            onBlur={() => {
                              const v = editingVat[r.id];
                              const commit = v === undefined ? rawNum(r.vat_rate) : v;
                              setLine(r.id, { vat_rate: parseNumInput(commit) });
                              setEditingVat((prev) => {
                                const copy = { ...prev };
                                delete copy[r.id];
                                return copy;
                              });
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") e.currentTarget.blur();
                              if (e.key === "Escape") {
                                setEditingVat((prev) => {
                                  const copy = { ...prev };
                                  delete copy[r.id];
                                  return copy;
                                });
                                e.currentTarget.blur();
                              }
                            }}
                            disabled={!isReal}
                          />
                        </td>

                        {/* UNIT INC */}
                        <td className="inv-td inv-right">
                          <input
                            className="inv-input inv-input--right"
                            inputMode="decimal"
                            placeholder="0.0000"
                            value={editingInc[r.id] !== undefined ? editingInc[r.id] : rawNum(r.unit_price_incl_vat) || ""}
                            onChange={(e) => {
                              const v = e.target.value.replace(/,/g, "");
                              if (v !== "" && v !== "." && !/^\d*\.?\d*$/.test(v)) return;
                              setEditingInc((prev) => ({ ...prev, [r.id]: v }));
                            }}
                            onBlur={() => {
                              const v = editingInc[r.id];
                              const commit = v === undefined ? rawNum(r.unit_price_incl_vat) : v;
                              setLinePriceInc(r.id, parseNumInput(commit));
                              setEditingInc((prev) => {
                                const copy = { ...prev };
                                delete copy[r.id];
                                return copy;
                              });
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") e.currentTarget.blur();
                              if (e.key === "Escape") {
                                setEditingInc((prev) => {
                                  const copy = { ...prev };
                                  delete copy[r.id];
                                  return copy;
                                });
                                e.currentTarget.blur();
                              }
                            }}
                            disabled={!isReal}
                          />
                        </td>

                        {/* TOTAL */}
                        <td className="inv-td inv-right inv-td-total">
                          <input className="inv-input inv-input--right inv-input--total" value={money(r.line_total)} readOnly />
                        </td>

                        {/* DELETE */}
                        <td className="inv-td inv-center inv-td-del">
                          <button type="button" className="inv-xmini inv-xmini--red" onClick={() => removeRow(r.id)} title="Remove row" aria-label="Remove row">
                            ✕
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Bottom action row */}
            <div className="inv-bottomRow">
              <div className="inv-bottomLeft">
                <button type="button" className="inv-addrows" onClick={addRowAndFocus}>
                  + Add Row
                </button>
                <div className="inv-addrows-help">
                  Adds 1 row. Press <b>Enter</b> in Qty to create the next row.
                </div>
              </div>

              <div className="inv-totalsbar inv-totalsbar--red">
                <div className="inv-totalsbar__cell">
                  <span className="k">Discount</span>
                  <span className="v">Rs {money(discountAmount)}</span>
                </div>

                <div className="inv-totalsbar__cell">
                  <span className="k">VAT</span>
                  <span className="v">Rs {money(vatAmount)}</span>
                </div>

                <div className="inv-totalsbar__cell">
                  <span className="k">Total</span>
                  <span className="v">Rs {money(totalAmount)}</span>
                </div>

                <div className="inv-totalsbar__cell">
                  <span className="k">Gross</span>
                  <span className="v">Rs {money(grossTotal)}</span>
                </div>

                <div className="inv-totalsbar__cell inv-totalsbar__cell--balance">
                  <span className="k">Balance</span>
                  <span className="v">Rs {money(balanceRemaining)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Customer Search Modal */}
      {customerSearchOpen ? (
        <div className="inv-modal-backdrop" onMouseDown={closeCustomerSearch}>
          <div className="inv-modal inv-modal--sm" onMouseDown={(e) => e.stopPropagation()}>
            <div className="inv-modal-head">
              <div className="inv-modal-title">Search Customer</div>
              <button className="inv-modal-x" onClick={closeCustomerSearch} type="button" aria-label="Close">
                ✕
              </button>
            </div>

            <div className="inv-modal-body">
              <input
                id="invCustomerSearchInput"
                className="inv-input"
                value={customerSearchTerm}
                onChange={(e) => setCustomerSearchTerm(e.target.value)}
                placeholder="Search by name, phone, code, address…"
              />

              <div className="inv-modal-list">
                {filteredCustomers.slice(0, 250).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="inv-modal-item"
                    onClick={() => {
                      setCustomerId(c.id);
                      closeCustomerSearch();
                    }}
                  >
                    <div className="inv-modal-item-title">
                      <b>{c.name}</b> {c.customer_code ? <span className="inv-muted">({c.customer_code})</span> : null}
                    </div>
                    <div className="inv-modal-item-sub">{[c.phone, c.address].filter(Boolean).join(" · ")}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Product Search Modal */}
      {productSearchOpen ? (
        <div className="inv-modal-backdrop" onMouseDown={closeProductSearch}>
          <div className="inv-modal inv-modal--sm" onMouseDown={(e) => e.stopPropagation()}>
            <div className="inv-modal-head">
              <div className="inv-modal-title">Search Product</div>
              <button className="inv-modal-x" onClick={closeProductSearch} type="button" aria-label="Close">
                ✕
              </button>
            </div>

            <div className="inv-modal-body">
              <input
                id="invProductSearchInput"
                className="inv-input"
                value={productSearchTerm}
                onChange={(e) => setProductSearchTerm(e.target.value)}
                placeholder="Search by code, sku, name, description…"
              />

              <div className="inv-modal-list">
                {filteredProducts.slice(0, 250).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="inv-modal-item"
                    onClick={() => {
                      const rowId = productSearchRowId;
                      if (rowId) applyProductToRow(rowId, p);
                      closeProductSearch();
                    }}
                  >
                    <div className="inv-modal-item-title">
                      <b>{p.item_code || p.sku}</b> — {p.name}
                    </div>
                    <div className="inv-modal-item-sub">
                      UNIT/BOX: {intFmt(p.units_per_box ?? 1)} · Unit Ex: {money((p as any).selling_price ?? 0)}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* PRINT ONLY */}
      <div className="inv-printonly">
        <DocAny
          variant="CREDIT_NOTE"
          docNoLabel="CREDIT NOTE NO:"
          docNoValue={creditNoteNumber}
          dateLabel="DATE:"
          dateValue={creditNoteDate}
          purchaseOrderLabel="PURCHASE ORDER NO:"
          purchaseOrderValue={purchaseOrderNo || ""}
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
          company={{ brn: "C17144377", vat_no: "123456789" }}
          items={realLines.map((r: any, i: number) => ({
            sn: i + 1,
            item_code: r.item_code,
            uom: r.uom,

            box_qty: r.uom === "BOX" || r.uom === "KG" ? n2(r.box_qty) : 0,
            pcs_qty: r.uom === "PCS" ? Math.trunc(n2(r.pcs_qty)) : 0,
            grams_qty: r.uom === "G" ? Math.trunc(n2(r.grams_qty)) : 0,
            bags_qty: r.uom === "BAG" ? Math.trunc(n2(r.bags_qty)) : 0,

            units_per_box: r.uom === "BOX" ? Math.trunc(n2(r.units_per_box)) : 1,
            total_qty: n2(r.total_qty),

            description: r.description,
            unit_price_excl_vat: n2(r.unit_price_excl_vat),
            unit_vat: n2(r.unit_vat),
            unit_price_incl_vat: n2(r.unit_price_incl_vat),
            line_total: n2(r.line_total),
          }))}
          totals={{
            subtotal: subtotalEx,
            vatPercentLabel: `VAT ${vatDefault}%`,
            vat_amount: vatAmount,
            total_amount: totalAmount,
            previous_balance: previousBalance || null,
            amount_paid: null,
            balance_remaining: null,
            discount_percent: discountPercent || null,
            discount_amount: discountAmount || null,
          }}
          preparedBy=""
          deliveredBy=""
        />
      </div>
    </div>
  );
}

