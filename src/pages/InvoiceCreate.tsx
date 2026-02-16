// src/pages/InvoiceCreate.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import "@/styles/InvoiceCreate.css";

import RamPotteryDoc from "@/components/print/RamPotteryDoc";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

import { listCustomers, listProducts, getInvoiceById, createInvoice } from "@/lib/invoices";

/* =========================================================
   Types
========================================================= */
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

/**
 * ✅ UOMs supported:
 * BOX  -> total_qty = box_qty * units_per_box
 * PCS  -> total_qty = pcs_qty
 * KG   -> total_qty = box_qty
 * G    -> total_qty = box_qty / 1000 (grams to kg)
 * BAG  -> total_qty = box_qty * units_per_box (default 25 kg per bag)
 */
type Uom = "BOX" | "PCS" | "KG" | "G" | "BAG";

type InvoiceLine = {
  id: string;
  product_id: number | null;

  item_code: string;
  description: string;

  uom: Uom;

  /** UI input field (we keep it as box_qty for consistent UI wiring)
   * - BOX:  box_qty = number of boxes (decimals allowed)
   * - KG:   box_qty = kg (decimals allowed)
   * - G:    box_qty = grams (decimals allowed)
   * - BAG:  box_qty = bags (decimals allowed) ; units_per_box default 25
   * - PCS:  box_qty used only as a UI bridge (we store pcs_qty for PCS)
   */
  box_qty: number;

  /** PCS qty (decimals allowed as requested) */
  pcs_qty: number;

  /** Used for BOX (units/box) and BAG (kg/bag default 25) */
  units_per_box: number;

  /** Computed base quantity:
   * - BOX: pcs
   * - PCS: pcs
   * - KG: kg
   * - G:  kg
   * - BAG: kg
   */
  total_qty: number;

  vat_rate: number; // per-row editable

  base_unit_price_excl_vat: number; // product base ex (used for discount calc)
  unit_price_excl_vat: number; // editable (ex)
  unit_vat: number;
  unit_price_incl_vat: number; // derived (inc)
  line_total: number;

  price_overridden?: boolean;
};

type PrintNameMode = "CUSTOMER" | "CLIENT";

/* =========================================================
   Sales reps
========================================================= */
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

/* =========================================================
   Helpers (Premium + safe)
========================================================= */
function n(v: any) {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}
function clampPct(v: any) {
  const x = n(v);
  return Math.max(0, Math.min(100, x));
}
function uid() {
  try {
    return crypto.randomUUID();
  } catch {
    return String(Date.now()) + "-" + Math.random().toString(16).slice(2);
  }
}
function roundTo(v: any, dp: number) {
  const x = n(v);
  const m = Math.pow(10, dp);
  return Math.round(x * m) / m;
}
function r2(v: any) {
  return roundTo(v, 2);
}
function money(v: any) {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n(v));
}
function intFmt(v: any) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.trunc(n(v)));
}

/** ✅ For inputs: show empty string when 0, allow decimals */
function rawNum(v: any) {
  const x = n(v);
  return x === 0 ? "" : String(x);
}
function parseNumInput(s: string) {
  const cleaned = String(s ?? "").replace(/,/g, "").trim();
  if (cleaned === "" || cleaned === "." || cleaned === "-" || cleaned === "-.") return 0;
  return n(cleaned);
}

/** ISO YYYY-MM-DD → DD-MM-YYYY */
function fmtDDMMYYYY(iso?: string) {
  if (!iso) return "—";
  const d = new Date(String(iso));
  if (Number.isNaN(d.getTime())) return String(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear());
  return `${dd}-${mm}-${yy}`;
}

/** UOM display label */
function uomLabel(u: Uom) {
  if (u === "KG") return "Kg";
  if (u === "G") return "g";
  return u;
}

/** Default "units_per_box" based on UOM */
function defaultUnitsPerBoxFor(uom: Uom, current: any) {
  const cur = n(current);
  if (uom === "BAG") return cur > 0 ? cur : 25; // ✅ 1 BAG = 25 KG
  if (uom === "BOX") return Math.max(1, roundTo(cur || 1, 3));
  return 1;
}

/* =========================================================
   Recalc (single source of truth)
   ✅ Decimals allowed for BOX/PCS/KG/G/BAG
========================================================= */
function recalc(row: InvoiceLine): InvoiceLine {
  const uom: Uom =
    row.uom === "PCS" ? "PCS" : row.uom === "KG" ? "KG" : row.uom === "G" ? "G" : row.uom === "BAG" ? "BAG" : "BOX";

  // normalize inputs
  const input = Math.max(0, n(row.box_qty));
  const pcsInput = Math.max(0, n(row.pcs_qty));

  const upb = defaultUnitsPerBoxFor(uom, row.units_per_box);

  let box_qty = 0;
  let pcs_qty = 0;
  let total_qty = 0;

  if (uom === "BOX") {
    box_qty = roundTo(input, 3); // decimals allowed
    total_qty = roundTo(box_qty * upb, 3);
  } else if (uom === "PCS") {
    pcs_qty = roundTo(pcsInput || input, 3); // allow decimals; input field writes into box_qty, we copy to pcs_qty
    total_qty = roundTo(pcs_qty, 3);
    box_qty = roundTo(pcs_qty, 3);
  } else if (uom === "KG") {
    box_qty = roundTo(input, 3);
    total_qty = roundTo(box_qty, 3);
  } else if (uom === "G") {
    // grams input -> store box_qty as grams; total_qty = kg
    box_qty = roundTo(input, 3);
    total_qty = roundTo(box_qty / 1000, 3);
  } else {
    // BAG
    box_qty = roundTo(input, 3); // bag count
    total_qty = roundTo(box_qty * upb, 3); // kg total
  }

  const rate = clampPct(row.vat_rate);

  const unitEx = Math.max(0, n(row.unit_price_excl_vat));
  const unitVatRaw = unitEx * (rate / 100);
  const unitIncRaw = unitEx + unitVatRaw;

  return {
    ...row,
    uom,
    box_qty,
    pcs_qty,
    units_per_box: upb,
    total_qty,
    vat_rate: rate,
    unit_vat: roundTo(unitVatRaw, 3),
    unit_price_incl_vat: roundTo(unitIncRaw, 3),
    line_total: r2(total_qty * unitIncRaw),
  };
}

function blankLine(defaultVat: number): InvoiceLine {
  return recalc({
    id: uid(),
    product_id: null,
    item_code: "",
    description: "",
    uom: "BOX",
    box_qty: 0,
    pcs_qty: 0,
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

/* =========================================================
   Page
========================================================= */
export default function InvoiceCreate() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const duplicateId = params.get("duplicate");

  const [saving, setSaving] = useState(false);
  const [printing, setPrinting] = useState(false);

  const [printNameMode, setPrintNameMode] = useState<PrintNameMode>("CUSTOMER");
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [clientName, setClientName] = useState<string>("");

  // Keep stored as ISO for DB; display as DD-MM-YYYY
  const [invoiceDate, setInvoiceDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [purchaseOrderNo, setPurchaseOrderNo] = useState<string>("");

  // Default VAT for NEW rows only
  const [vatPercentText, setVatPercentText] = useState<string>("15");

  // Discount
  const [discountPercentText, setDiscountPercentText] = useState<string>("");
  const [discountTouched, setDiscountTouched] = useState(false);

  const [previousBalanceText, setPreviousBalanceText] = useState<string>("");
  const [amountPaidText, setAmountPaidText] = useState<string>("");

  // allow user to edit remaining
  const [balanceTouched, setBalanceTouched] = useState(false);
  const [balanceManualText, setBalanceManualText] = useState<string>("");

  const vatDefault = clampPct(vatPercentText);
  const discountPercent = clampPct(discountPercentText);

  // Invoice number comes from DB trigger (INV-xxxxx)
  const [invoiceNumber, setInvoiceNumber] = useState<string>("(Auto when saved)");

  const [lines, setLines] = useState<InvoiceLine[]>([blankLine(15)]);

  // Numeric edit buffers for premium typing UX
  const [editingEx, setEditingEx] = useState<Record<string, string>>({});
  const [editingVat, setEditingVat] = useState<Record<string, string>>({});
  const [editingInc, setEditingInc] = useState<Record<string, string>>({});

  const qtyRefs = useRef<Record<string, HTMLInputElement | null>>({});

  /* =========================
     Customer/Product search modals
  ========================= */
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);
  const [customerSearchTerm, setCustomerSearchTerm] = useState("");

  const [productSearchOpen, setProductSearchOpen] = useState(false);
  const [productSearchRowId, setProductSearchRowId] = useState<string | null>(null);
  const [productSearchTerm, setProductSearchTerm] = useState("");

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
     Sales reps
  ========================= */
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

  /* =========================
     Data
  ========================= */
  const customersQ = useQuery({
    queryKey: ["customers"],
    queryFn: () => listCustomers({ limit: 5000 }),
    staleTime: 30_000,
  });

  const productsQ = useQuery({
    queryKey: ["products"],
    queryFn: () => listProducts({ limit: 5000 }),
    staleTime: 30_000,
  });

  const customers = (customersQ.data || []) as CustomerRow[];
  const products = (productsQ.data || []) as ProductRow[];

  const customer = useMemo(() => customers.find((c) => c.id === customerId) || null, [customers, customerId]);

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

  /* =========================
     Which name prints
  ========================= */
  const printedName = useMemo(() => {
    const cn = (customer?.name || "").trim();
    const cl = clientName.trim();
    if (printNameMode === "CLIENT") return cl || cn;
    return cn || cl;
  }, [printNameMode, customer?.name, clientName]);

  /* =========================
     Customer change
  ========================= */
  useEffect(() => {
    if (!customerId || !customer) return;

    const ob = customer.opening_balance ?? null;
    if (ob !== null && ob !== undefined && String(ob) !== "0") setPreviousBalanceText(String(ob));
    else setPreviousBalanceText("");

    if (!discountTouched) {
      const dp = customer.discount_percent ?? null;
      if (dp !== null && dp !== undefined && String(dp) !== "0") setDiscountPercentText(String(dp));
      else setDiscountPercentText("");
    }

    if (!clientName.trim()) setClientName(customer.name || "");
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
        const base = n(r.base_unit_price_excl_vat);
        const discounted = roundTo(base * (1 - dp / 100), 6);
        return recalc({ ...r, unit_price_excl_vat: discounted } as InvoiceLine);
      })
    );
  }, [discountPercentText]);

  /* =========================
     Duplicate logic
  ========================= */
  useEffect(() => {
    if (!duplicateId) return;

    getInvoiceById(duplicateId)
      .then((inv: any) => {
        setCustomerId(inv.customer_id ?? null);

        const invClientName = String(inv?.client_name || inv?.clientName || "").trim();
        const invMode = String(inv?.print_name_mode || inv?.printNameMode || "").toUpperCase();
        if (invMode === "CLIENT" || invMode === "CUSTOMER") setPrintNameMode(invMode as PrintNameMode);
        else setPrintNameMode(invClientName ? "CLIENT" : "CUSTOMER");

        setClientName(invClientName || "");
        setInvoiceDate(String(inv.invoice_date || new Date().toISOString().slice(0, 10)));
        setPurchaseOrderNo(String(inv.purchase_order_no || ""));

        const v = clampPct(inv.vat_percent ?? inv.vatPercent ?? 15);
        setVatPercentText(String(v));

        const d = clampPct(inv.discount_percent ?? inv.discountPercent ?? 0);
        setDiscountPercentText(d > 0 ? String(d) : "");
        setDiscountTouched(true);

        const pb = n(inv.previous_balance ?? 0);
        setPreviousBalanceText(pb > 0 ? String(pb) : "");

        const ap = n(inv.amount_paid ?? 0);
        setAmountPaidText(ap > 0 ? String(ap) : "");

        setBalanceTouched(false);
        setBalanceManualText("");

        const repText = String(inv.sales_rep || inv.salesRep || "").trim();
        const repList = repText ? repText.split(",").map((s: string) => s.trim()).filter(Boolean) : [];
        if (repList.length) setSalesReps(repList as SalesRepName[]);

        const cloned = (inv.items || []).map((it: any) =>
          recalc({
            id: uid(),
            product_id: it.product_id,
            item_code: it.item_code || it.product?.item_code || it.product?.sku || "",
            description: it.description || it.product?.name || "",
            uom: (it.uom || "BOX") as Uom,
            box_qty: n(it.box_qty ?? 0),
            pcs_qty: n(it.pcs_qty ?? 0),
            units_per_box: n(it.units_per_box ?? 1),
            total_qty: n(it.total_qty ?? 0),
            vat_rate: clampPct(it.vat_rate ?? v),
            base_unit_price_excl_vat: n(it.base_unit_price_excl_vat ?? it.unit_price_excl_vat ?? 0),
            unit_price_excl_vat: n(it.unit_price_excl_vat ?? 0),
            unit_vat: n(it.unit_vat || 0),
            unit_price_incl_vat: n(it.unit_price_incl_vat || 0),
            line_total: n(it.line_total || 0),
            price_overridden: !!it.price_overridden,
          } as InvoiceLine)
        );

        setLines(cloned.length ? cloned : [blankLine(v)]);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duplicateId]);

  /* =========================
     Totals (Discount BEFORE VAT)
  ========================= */
  const realLines = useMemo(() => lines.filter((l) => !!l.product_id), [lines]);

  const subtotalEx = useMemo(() => {
    return r2(realLines.reduce((sum, r) => sum + n(r.total_qty) * n(r.unit_price_excl_vat), 0));
  }, [realLines]);

  const vatAmount = useMemo(() => {
    return r2(
      realLines.reduce((sum, r) => {
        const rate = clampPct(r.vat_rate);
        const ex = n(r.unit_price_excl_vat);
        return sum + n(r.total_qty) * (ex * (rate / 100));
      }, 0)
    );
  }, [realLines]);

  const totalAmount = useMemo(() => r2(subtotalEx + vatAmount), [subtotalEx, vatAmount]);

  const discountAmount = useMemo(() => {
    const baseEx = realLines.reduce((sum, r) => sum + n(r.total_qty) * n(r.base_unit_price_excl_vat), 0);
    const discEx = realLines.reduce((sum, r) => sum + n(r.total_qty) * n(r.unit_price_excl_vat), 0);
    return Math.max(0, r2(baseEx - discEx));
  }, [realLines]);

  const previousBalance = useMemo(() => n(previousBalanceText), [previousBalanceText]);
  const amountPaid = useMemo(() => n(amountPaidText), [amountPaidText]);

  const grossTotal = useMemo(() => r2(totalAmount + previousBalance), [totalAmount, previousBalance]);
  const balanceAuto = useMemo(() => Math.max(0, r2(grossTotal - amountPaid)), [grossTotal, amountPaid]);

  const balanceRemaining = useMemo(() => {
    if (!balanceTouched) return balanceAuto;
    const wanted = Math.max(0, n(balanceManualText));
    return r2(wanted);
  }, [balanceTouched, balanceManualText, balanceAuto]);

  useEffect(() => {
    if (!balanceTouched) return;
    const wanted = Math.max(0, n(balanceManualText));
    const newPaid = Math.max(0, r2(grossTotal - wanted));
    setAmountPaidText(newPaid ? String(newPaid) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [balanceManualText, balanceTouched, grossTotal]);

  /* =========================
     Row helpers
  ========================= */
  function setLine(id: string, patch: Partial<InvoiceLine>) {
    setLines((prev) => prev.map((r) => (r.id === id ? recalc({ ...r, ...patch } as InvoiceLine) : r)));
  }

  function setLineTotalQty(id: string, wantedTotal: number) {
    setLines((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;

        const tq = Math.max(0, roundTo(wantedTotal, 3));
        const u = r.uom;

        if (u === "BOX") {
          const upb = defaultUnitsPerBoxFor("BOX", r.units_per_box);
          const boxes = upb > 0 ? tq / upb : 0;
          return recalc({ ...r, units_per_box: upb, box_qty: boxes, total_qty: tq } as InvoiceLine);
        }
        if (u === "PCS") {
          return recalc({ ...r, pcs_qty: tq, box_qty: tq, total_qty: tq } as InvoiceLine);
        }
        if (u === "KG") {
          return recalc({ ...r, box_qty: tq, total_qty: tq } as InvoiceLine);
        }
        if (u === "G") {
          // total_qty is KG; convert back to grams for input
          const grams = tq * 1000;
          return recalc({ ...r, box_qty: grams, total_qty: tq } as InvoiceLine);
        }
        // BAG: tq is KG -> bags = tq / kgPerBag
        const kgPerBag = defaultUnitsPerBoxFor("BAG", r.units_per_box);
        const bags = kgPerBag > 0 ? tq / kgPerBag : 0;
        return recalc({ ...r, units_per_box: kgPerBag, box_qty: bags, total_qty: tq } as InvoiceLine);
      })
    );
  }

  function setLinePriceEx(id: string, unitEx: number) {
    setLines((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        return recalc({ ...r, unit_price_excl_vat: Math.max(0, n(unitEx)), price_overridden: true } as InvoiceLine);
      })
    );
  }

  function setLinePriceInc(id: string, unitInc: number) {
    setLines((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const rate = clampPct(r.vat_rate);
        const inc = Math.max(0, n(unitInc));
        const denom = 1 + rate / 100;
        const ex = denom > 0 ? inc / denom : inc;
        return recalc({ ...r, unit_price_excl_vat: Math.max(0, ex), price_overridden: true } as InvoiceLine);
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
            units_per_box: 1,
            base_unit_price_excl_vat: 0,
            unit_price_excl_vat: 0,
            vat_rate: vatDefault,
            uom: "BOX",
            box_qty: 0,
            pcs_qty: 0,
            price_overridden: false,
          } as InvoiceLine);
        }

        const dp = clampPct(discountPercentText);
        const baseEx = n((product as any).selling_price || 0);
        const discountedEx = roundTo(baseEx * (1 - dp / 100), 6);

        // Keep the current row uom, but enforce BAG default units_per_box=25
        const nextUom: Uom = (r.uom || "BOX") as Uom;
        const nextUpb =
          nextUom === "BAG"
            ? 25
            : nextUom === "BOX"
            ? Math.max(1, roundTo(n(product.units_per_box || 1), 3))
            : 1;

        // If selecting a product into an empty row, use a premium default qty = 1 (except KG/G => 0.000)
        const defaultQty =
          nextUom === "KG" || nextUom === "G" ? 0 : 1;

        const nextBoxQty =
          r.product_id ? n(r.box_qty) : defaultQty;

        const nextPcsQty =
          nextUom === "PCS" ? (r.product_id ? n(r.pcs_qty || r.box_qty) : 1) : 0;

        return recalc({
          ...r,
          product_id: product.id,
          item_code: String(product.item_code || product.sku || ""),
          description: String(product.description || product.name || "").trim(),
          units_per_box: nextUpb,
          base_unit_price_excl_vat: baseEx,
          unit_price_excl_vat: discountedEx,
          vat_rate: clampPct(r.vat_rate || vatDefault),
          uom: nextUom,
          box_qty: nextBoxQty,
          pcs_qty: nextPcsQty,
          price_overridden: false,
        } as InvoiceLine);
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

  function isQtyValid(l: InvoiceLine) {
    // ✅ all UOMs allow decimals now
    if (l.uom === "PCS") return n(l.pcs_qty) > 0;
    return n(l.box_qty) > 0;
  }

  /* =========================
     Save / Print
  ========================= */
  async function onSave() {
    if (!customerId) return toast.error("Please select a customer.");
    if (!invoiceDate) return toast.error("Please select invoice date.");
    if (!salesReps.length) return toast.error("Please select at least one sales rep.");
    if (realLines.length === 0) return toast.error("Please add at least one item.");
    if (realLines.some((l) => !isQtyValid(l))) return toast.error("Qty must be greater than 0.");

    if (printNameMode === "CLIENT" && !clientName.trim()) {
      return toast.error("Please enter a Client Name (or switch to Customer Name).");
    }

    setSaving(true);
    try {
      const payload: any = {
        customerId,
        clientName: printNameMode === "CLIENT" ? clientName.trim() : null,
        print_name_mode: printNameMode,

        invoiceDate,
        purchaseOrderNo: purchaseOrderNo || null,

        vatPercent: vatDefault,
        discountPercent: discountPercent,

        previousBalance: previousBalance,
        amountPaid: amountPaid,

        salesRep: salesReps.join(", "),
        salesRepPhone: salesReps.map(repPhoneByName).filter(Boolean).join(", "),

        items: realLines.map((l) => {
          const uom: Uom = (l.uom || "BOX") as Uom;

          const rate = clampPct(l.vat_rate);
          const unitEx = Math.max(0, n(l.unit_price_excl_vat));
          const unitVat = r2(unitEx * (rate / 100));
          const unitInc = r2(unitEx + unitVat);

          // Normalize qty per UOM for DB storage
          let box_qty = 0;
          let pcs_qty = 0;
          let units_per_box = 1;
          let total_qty = 0;

          if (uom === "BOX") {
            units_per_box = defaultUnitsPerBoxFor("BOX", l.units_per_box);
            box_qty = roundTo(n(l.box_qty), 3);
            total_qty = roundTo(box_qty * units_per_box, 3);
          } else if (uom === "PCS") {
            pcs_qty = roundTo(n(l.pcs_qty), 3);
            box_qty = 0;
            units_per_box = 1;
            total_qty = roundTo(pcs_qty, 3);
          } else if (uom === "KG") {
            box_qty = roundTo(n(l.box_qty), 3);
            pcs_qty = 0;
            units_per_box = 1;
            total_qty = roundTo(box_qty, 3);
          } else if (uom === "G") {
            // store box_qty as grams; total_qty as kg
            box_qty = roundTo(n(l.box_qty), 3);
            pcs_qty = 0;
            units_per_box = 1;
            total_qty = roundTo(box_qty / 1000, 3);
          } else {
            // BAG
            units_per_box = defaultUnitsPerBoxFor("BAG", l.units_per_box); // default 25
            box_qty = roundTo(n(l.box_qty), 3);
            pcs_qty = 0;
            total_qty = roundTo(box_qty * units_per_box, 3);
          }

          return {
            product_id: l.product_id,
            description: l.description || null,
            uom,

            box_qty,
            pcs_qty,

            units_per_box,
            total_qty,

            unit_price_excl_vat: unitEx,
            vat_rate: rate,
            unit_vat: unitVat,
            unit_price_incl_vat: unitInc,
            line_total: r2(total_qty * unitInc),

            price_overridden: !!l.price_overridden,
            base_unit_price_excl_vat: n(l.base_unit_price_excl_vat),
          };
        }),
      };

      const res: any = await createInvoice(payload);
      const invNo = String(res?.invoice_number || res?.invoiceNumber || res?.invoice_no || res?.number || "(Saved)");
      setInvoiceNumber(invNo);
      toast.success(`Invoice saved: ${invNo}`);
    } catch (e: any) {
      toast.error(e?.message || "Failed to save invoice");
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
            {saving ? "Saving…" : "Save Invoice"}
          </Button>
        </div>
      </div>

      {/* FORM */}
      <div className="inv-screen inv-form-shell inv-form-shell--tight">
        <div className="inv-form-card">
          <div className="inv-form-head inv-form-head--tight">
            <div>
              <div className="inv-form-title">New VAT Invoice</div>
              <div className="inv-form-sub">A4 Print Template Locked (Ram Pottery Ltd)</div>
            </div>

            <div className="inv-form-meta">
              <div className="inv-meta-row">
                <span className="inv-meta-k">Invoice No</span>
                <span className="inv-meta-v">{invoiceNumber}</span>
              </div>
              <div className="inv-meta-row">
                <span className="inv-meta-k">Date</span>
                <span className="inv-meta-v">{fmtDDMMYYYY(invoiceDate)}</span>
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
                      <input
                        type="radio"
                        checked={printNameMode === "CUSTOMER"}
                        onChange={() => setPrintNameMode("CUSTOMER")}
                      />
                      <span>Customer Name</span>
                    </label>

                    <label className="inv-radioOpt">
                      <input
                        type="radio"
                        checked={printNameMode === "CLIENT"}
                        onChange={() => setPrintNameMode("CLIENT")}
                      />
                      <span>Client Name</span>
                    </label>
                  </div>

                  <input
                    className="inv-input"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="Type a client name (optional)"
                  />

                  <div className="inv-help">
                    Only one name prints on the invoice header (based on selection).
                    <br />
                    If “Client Name” is selected, this input prints as the invoice customer name.
                  </div>
                </div>
              </div>

              <div className="inv-field inv-field--customerBig">
                <label>Customer (account)</label>

                <div className="inv-customerRow">
                  <select
                    className="inv-input inv-input--customerSelect"
                    value={customerId ?? ""}
                    onChange={(e) => setCustomerId(e.target.value ? Number(e.target.value) : null)}
                  >
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

              <div className="inv-field">
                <label>Invoice Date</label>
                <input
                  className="inv-input"
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                />
              </div>

              <div className="inv-field">
                <label>PO. NO. (optional)</label>
                <input
                  className="inv-input"
                  value={purchaseOrderNo}
                  onChange={(e) => setPurchaseOrderNo(e.target.value)}
                  placeholder="Optional"
                />
              </div>
            </div>

            {/* ROW 2 */}
            <div className="inv-form-row inv-form-row--bottom inv-row-red">
              <div className="inv-field inv-field--salesrep">
                <label>Sales Rep(s)</label>

                <div className="inv-rep">
                  <button
                    type="button"
                    className="inv-rep-btn"
                    onClick={() => setRepOpen((v) => !v)}
                    aria-expanded={repOpen}
                  >
                    <div className="inv-rep-chips">
                      {salesReps.length ? (
                        salesReps.map((name) => (
                          <span key={name} className="inv-chip">
                            {name} ({repPhoneByName(name)})
                            <span
                              className="inv-chip-x"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSalesReps(salesReps.filter((x) => x !== name));
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

                <div className="inv-help">This prints on the invoice + is saved to the invoice record.</div>
              </div>

              <div className="inv-field">
                <label>Default VAT %</label>
                <input
                  className="inv-input inv-input--right inv-input--sm"
                  inputMode="decimal"
                  value={vatPercentText}
                  onChange={(e) => setVatPercentText(e.target.value)}
                />
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
                <input
                  className="inv-input inv-input--right inv-input--sm"
                  inputMode="decimal"
                  value={previousBalanceText}
                  onChange={(e) => setPreviousBalanceText(e.target.value)}
                />
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

          {/* ITEMS */}
          <div className="inv-items">
            <div className="inv-items-head">
              <div>
                <div className="inv-items-title">Items</div>
                <div className="inv-items-sub">All fields editable. Row VAT does not affect other rows.</div>
              </div>

              <div className="inv-items-actions">
                <Button onClick={addRowAndFocus}>+ Add Row</Button>
              </div>
            </div>

            <div className="inv-table-wrap">
              <table className="inv-table inv-table--invoiceCols">
                <colgroup>
                  <col style={{ width: "4%" }} />
                  <col style={{ width: "29%" }} />
                  <col style={{ width: "5%" }} />
                  <col style={{ width: "16%" }} />
                  <col style={{ width: "7%" }} />
                  <col style={{ width: "8%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "7%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "4%" }} />
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
                          <button
                            type="button"
                            className="inv-iconBtn inv-iconBtn--table inv-prodSearchBtn"
                            onClick={() => openProductSearch(r.id)}
                            title="Search product"
                          >
                            🔍
                          </button>
                        </td>

                        <td className="inv-td inv-center">
                          <div className="inv-boxcell inv-boxcell--oneRow">
                            <select
                              className="inv-input inv-input--uom"
                              value={r.uom}
                              onChange={(e) => {
                                const nextUom = e.target.value as Uom;

                                // Premium defaults when changing UOM:
                                // - BAG => units_per_box = 25
                                // - G   => keep units_per_box = 1
                                // - PCS => sync pcs_qty with current input
                                const nextPatch: Partial<InvoiceLine> = { uom: nextUom };

                                if (nextUom === "BAG") nextPatch.units_per_box = 25;
                                if (nextUom === "PCS") nextPatch.pcs_qty = n(r.pcs_qty || r.box_qty);
                                if (nextUom !== "PCS") nextPatch.pcs_qty = 0;

                                setLine(r.id, nextPatch);
                              }}
                              disabled={!isReal}
                            >
                              <option value="BOX">BOX</option>
                              <option value="PCS">PCS</option>
                              <option value="KG">Kg</option>
                              <option value="G">g</option>
                              <option value="BAG">BAG</option>
                            </select>

                            <input
                              ref={(el) => (qtyRefs.current[r.id] = el)}
                              className="inv-input inv-input--qty inv-center"
                              value={rawNum(r.box_qty)}
                              onChange={(e) => {
                                const v = parseNumInput(e.target.value);
                                // If PCS, also mirror into pcs_qty for perfect UX
                                if (r.uom === "PCS") setLine(r.id, { box_qty: v, pcs_qty: v });
                                else setLine(r.id, { box_qty: v });
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
                              placeholder={r.uom === "KG" ? "0.000" : r.uom === "G" ? "0.000" : "0"}
                            />
                          </div>
                        </td>

                        <td className="inv-td inv-center">
                          {r.uom === "BOX" || r.uom === "BAG" ? (
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
                            <input className="inv-input inv-center" value={uomLabel(r.uom)} readOnly />
                          )}
                        </td>

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

                        {/* UNIT EX (decimal-safe) */}
                        <td className="inv-td inv-right">
                          <input
                            className="inv-input inv-input--right"
                            inputMode="decimal"
                            placeholder="0.0000"
                            value={editingEx[r.id] !== undefined ? editingEx[r.id] : rawNum(r.unit_price_excl_vat)}
                            onChange={(e) => {
                              const v = e.target.value.replace(/,/g, "");
                              if (v !== "" && v !== "." && !/^\d*\.?\d*$/.test(v)) return;
                              setEditingEx((prev) => ({ ...prev, [r.id]: v }));
                            }}
                            onBlur={() => {
                              const v = editingEx[r.id];
                              const commit = v === undefined ? rawNum(r.unit_price_excl_vat) : v;
                              setLinePriceEx(r.id, parseNumInput(commit === "." || commit === "" ? "0" : commit));
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

                        {/* VAT % (decimal-safe) */}
                        <td className="inv-td inv-right">
                          <input
                            className="inv-input inv-input--right"
                            inputMode="decimal"
                            placeholder="15"
                            value={editingVat[r.id] !== undefined ? editingVat[r.id] : rawNum(r.vat_rate)}
                            onChange={(e) => {
                              const v = e.target.value.replace(/,/g, "");
                              if (v !== "" && v !== "." && !/^\d*\.?\d*$/.test(v)) return;
                              setEditingVat((prev) => ({ ...prev, [r.id]: v }));
                            }}
                            onBlur={() => {
                              const v = editingVat[r.id];
                              const commit = v === undefined ? rawNum(r.vat_rate) : v;
                              setLine(r.id, { vat_rate: parseNumInput(commit === "." || commit === "" ? "0" : commit) });
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

                        {/* UNIT INC (decimal-safe) */}
                        <td className="inv-td inv-right">
                          <input
                            className="inv-input inv-input--right"
                            inputMode="decimal"
                            placeholder="0.0000"
                            value={editingInc[r.id] !== undefined ? editingInc[r.id] : rawNum(r.unit_price_incl_vat)}
                            onChange={(e) => {
                              const v = e.target.value.replace(/,/g, "");
                              if (v !== "" && v !== "." && !/^\d*\.?\d*$/.test(v)) return;
                              setEditingInc((prev) => ({ ...prev, [r.id]: v }));
                            }}
                            onBlur={() => {
                              const v = editingInc[r.id];
                              const commit = v === undefined ? rawNum(r.unit_price_incl_vat) : v;
                              setLinePriceInc(r.id, parseNumInput(commit === "." || commit === "" ? "0" : commit));
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

                        {/* TOTAL (read-only) */}
                        <td className="inv-td inv-right inv-td-total">
                          <input className="inv-input inv-input--right inv-input--total" value={money(r.line_total)} readOnly />
                        </td>

                        {/* DELETE */}
                        <td className="inv-td inv-center inv-td-del">
                          <button
                            type="button"
                            className="inv-xmini inv-xmini--red"
                            onClick={() => removeRow(r.id)}
                            title="Remove row"
                            aria-label="Remove row"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Bottom action row — OUTSIDE table */}
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
                      UNIT: {intFmt(p.units_per_box ?? 1)} · Unit Ex: {money(p.selling_price ?? 0)}
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
          variant="INVOICE"
          docNoLabel="INVOICE NO:"
          docNoValue={invoiceNumber}
          dateLabel="DATE:"
          dateValue={fmtDDMMYYYY(invoiceDate)}
          purchaseOrderLabel="PO. NO.:"
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
          company={{ brn: "C17144377", vat_no: "27490894" }}
          items={realLines.map((r: any, i: number) => ({
            sn: i + 1,
            item_code: r.item_code,
            uom: r.uom,
            box_qty: r.uom === "PCS" ? 0 : n(r.box_qty),
            pcs_qty: r.uom === "PCS" ? n(r.pcs_qty) : 0,
            units_per_box: r.uom === "BOX" || r.uom === "BAG" ? n(r.units_per_box) : 1,
            total_qty: n(r.total_qty),
            description: r.description,
            unit_price_excl_vat: n(r.unit_price_excl_vat),
            unit_vat: n(r.unit_vat),
            unit_price_incl_vat: n(r.unit_price_incl_vat),
            line_total: n(r.line_total),
            vat_rate: n(r.vat_rate),
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

