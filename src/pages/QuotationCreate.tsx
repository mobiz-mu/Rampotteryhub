// src/pages/QuotationCreate.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import "@/styles/InvoiceCreate.css"; // ✅ reuse same CSS/theme as InvoiceCreate

import RamPotteryDoc from "@/components/print/RamPotteryDoc";
import { Button } from "@/components/ui/button";

import { listCustomers } from "@/lib/customers";
import { listProducts } from "@/lib/invoices";
import { createQuotationFull, getQuotation, getQuotationItems } from "@/lib/quotations";

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

type Uom = "BOX" | "PCS" | "KG" | "G" | "BAG";
type PrintNameMode = "CUSTOMER" | "CLIENT";

type QuoteLine = {
  id: string;
  product_id: number | null;

  item_code: string;
  description: string;

  uom: Uom;

  // stored qty inputs (multi-uom)
  box_qty: number;   // BOX => integer boxes, KG => decimal kg
  pcs_qty: number;   // PCS => integer pcs
  grams_qty: number; // G => integer grams
  bags_qty: number;  // BAG => integer bags

  units_per_box: number; // BOX only (>=1)
  total_qty: number;     // computed: BOX => box_qty*upb, PCS => pcs_qty, KG => kg, G => grams, BAG => bags

  vat_rate: number; // per row

  base_unit_price_excl_vat: number;
  unit_price_excl_vat: number;
  unit_vat: number;
  unit_price_incl_vat: number;
  line_total: number;

  price_overridden?: boolean;
};

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
function todayISO() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
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
function safeUpb(v: any) {
  return Math.max(1, Math.trunc(n2(v) || 1));
}
function roundKg(v: any) {
  return Math.round(n2(v) * 1000) / 1000; // 3dp
}

/* =========================
   Recalc (multi-UOM)
========================= */
function recalc(row: QuoteLine): QuoteLine {
  const uom: Uom =
    row.uom === "PCS" ? "PCS" :
    row.uom === "KG" ? "KG" :
    row.uom === "G" ? "G" :
    row.uom === "BAG" ? "BAG" :
    "BOX";

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
    box_qty = Math.max(0, roundKg(row.box_qty)); // reuse box_qty as KG
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

function blankLine(defaultVat: number): QuoteLine {
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

function isQtyValid(l: QuoteLine) {
  if (l.uom === "BOX") return Math.trunc(n2(l.box_qty)) > 0;
  if (l.uom === "PCS") return Math.trunc(n2(l.pcs_qty)) > 0;
  if (l.uom === "KG") return n2(l.box_qty) > 0;
  if (l.uom === "G") return Math.trunc(n2(l.grams_qty)) > 0;
  return Math.trunc(n2(l.bags_qty)) > 0; // BAG
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

  const [vatPercentText, setVatPercentText] = useState<string>("15");
  const [discountPercentText, setDiscountPercentText] = useState<string>("");
  const [discountTouched, setDiscountTouched] = useState(false);

  const vatPercent = clampPct(vatPercentText);
  const discountPercent = clampPct(discountPercentText);

  const [quotationNumber, setQuotationNumber] = useState<string>("(Auto when saved)");
  const [lines, setLines] = useState<QuoteLine[]>([blankLine(15)]);

  const qtyRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const [editingEx, setEditingEx] = useState<Record<string, string>>({});
  const [editingVat, setEditingVat] = useState<Record<string, string>>({});
  const [editingInc, setEditingInc] = useState<Record<string, string>>({});

  const [custOpen, setCustOpen] = useState(false);
  const [custSearch, setCustSearch] = useState("");

  const [prodOpen, setProdOpen] = useState(false);
  const [prodSearch, setProdSearch] = useState("");
  const [prodPickRowId, setProdPickRowId] = useState<string | null>(null);

  const repBoxRef = useRef<HTMLDivElement | null>(null);
  const [repOpen, setRepOpen] = useState(false);
  const [salesReps, setSalesReps] = useState<SalesRepName[]>([]);

  useEffect(() => {
    if (!repOpen) return;
    const onDown = (e: PointerEvent) => {
      const box = repBoxRef.current;
      if (!box) return;
      if (box.contains(e.target as Node)) return;
      setRepOpen(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [repOpen]);

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

  useEffect(() => {
    if (!customerId || !customer) return;

    if (!discountTouched) {
      const dp = customer.discount_percent ?? null;
      if (dp !== null && dp !== undefined && String(dp) !== "0") setDiscountPercentText(String(dp));
      else setDiscountPercentText("");
    }

    if (!clientName.trim()) setClientName(customer.name || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  // Default VAT updates all rows (still editable per row)
  useEffect(() => {
    const v = clampPct(vatPercentText);
    setLines((prev) => prev.map((r) => recalc({ ...r, vat_rate: v } as QuoteLine)));
  }, [vatPercentText]);

  // Discount: updates unit_ex from base unless price_overridden
  useEffect(() => {
    const dp = clampPct(discountPercentText);
    setLines((prev) =>
      prev.map((r) => {
        if (!r.product_id) return r;
        if (r.price_overridden) return r;
        const base = n2(r.base_unit_price_excl_vat);
        const discounted = roundTo(base * (1 - dp / 100), 6);
        return recalc({ ...r, unit_price_excl_vat: discounted } as QuoteLine);
      })
    );
  }, [discountPercentText]);

  /* ===== Duplicate quotation ===== */
  useEffect(() => {
    if (!duplicateId) return;

    Promise.all([getQuotation(Number(duplicateId)), getQuotationItems(Number(duplicateId))])
      .then(([qRow, qItems]) => {
        setCustomerId((qRow as any).customer_id ?? null);

        const qClientName = String((qRow as any)?.customer_name || "").trim();
        setClientName(qClientName || "");

        setQuotationDate(String((qRow as any).quotation_date || todayISO()));
        setValidUntil(String((qRow as any).valid_until || ""));

        const vat = clampPct((qRow as any).vat_percent ?? 15);
        setVatPercentText(String(vat));

        const disc = clampPct((qRow as any).discount_percent ?? 0);
        setDiscountPercentText(disc ? String(disc) : "");
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
            uom: (String(it.uom || "BOX").toUpperCase() as any) as Uom,

            box_qty: n2(it.box_qty || 0),
            pcs_qty: n2(it.pcs_qty || 0),
            grams_qty: n2(it.grams_qty || 0),
            bags_qty: n2(it.bags_qty || 0),

            units_per_box: Math.max(1, Math.trunc(n2(it.units_per_box || 1))),
            total_qty: n2(it.total_qty || 0),

            vat_rate: clampPct((it.vat_rate ?? vat) as any),
            base_unit_price_excl_vat: n2(it.base_unit_price_excl_vat ?? it.unit_price_excl_vat ?? 0),
            unit_price_excl_vat: n2(it.unit_price_excl_vat ?? 0),
            unit_vat: n2(it.unit_vat || 0),
            unit_price_incl_vat: n2(it.unit_price_incl_vat || 0),
            line_total: n2(it.line_total || 0),
            price_overridden: !!it.price_overridden,
          } as QuoteLine)
        );

        setLines(cloned.length ? cloned : [blankLine(15)]);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duplicateId]);

  /* ===== Totals ===== */
  const realLines = useMemo(() => lines.filter((l) => !!l.product_id), [lines]);

  const subtotalEx = useMemo(
    () => r2(realLines.reduce((sum, r) => sum + n2(r.total_qty) * n2(r.unit_price_excl_vat), 0)),
    [realLines]
  );

  const vatAmount = useMemo(() => {
    return r2(
      realLines.reduce((sum, r) => {
        const rate = clampPct(r.vat_rate);
        const ex = n2(r.unit_price_excl_vat);
        return sum + n2(r.total_qty) * (ex * (rate / 100));
      }, 0)
    );
  }, [realLines]);

  const totalAfterDiscount = useMemo(() => r2(subtotalEx + vatAmount), [subtotalEx, vatAmount]);

  const discountAmount = useMemo(() => {
    const dp = clampPct(discountPercentText);
    if (dp <= 0) return 0;

    const baseSub = realLines.reduce((sum, r) => sum + n2(r.total_qty) * n2(r.base_unit_price_excl_vat), 0);
    const baseVat = realLines.reduce((sum, r) => {
      const rate = clampPct(r.vat_rate);
      const baseUnit = n2(r.base_unit_price_excl_vat);
      return sum + n2(r.total_qty) * (baseUnit * (rate / 100));
    }, 0);

    const baseTotal = baseSub + baseVat;
    return Math.max(0, r2(baseTotal - totalAfterDiscount));
  }, [realLines, discountPercentText, totalAfterDiscount]);

  /* ===== Row helpers ===== */
  function setLine(id: string, patch: Partial<QuoteLine>) {
    setLines((prev) => prev.map((r) => (r.id === id ? recalc({ ...r, ...patch } as QuoteLine) : r)));
  }

  function setLinePriceEx(id: string, unitEx: number) {
    setLines((prev) =>
      prev.map((r) => (r.id === id ? recalc({ ...r, unit_price_excl_vat: Math.max(0, n2(unitEx)), price_overridden: true } as QuoteLine) : r))
    );
  }

  function setLinePriceInc(id: string, unitInc: number) {
    setLines((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const rate = clampPct(r.vat_rate);
        const inc = Math.max(0, n2(unitInc));
        const denom = 1 + rate / 100;
        const ex = denom > 0 ? inc / denom : inc;
        return recalc({ ...r, unit_price_excl_vat: Math.max(0, ex), price_overridden: true } as QuoteLine);
      })
    );
  }

  function addRowAndFocus() {
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
            uom: "BOX",
            box_qty: 0,
            pcs_qty: 0,
            grams_qty: 0,
            bags_qty: 0,
            units_per_box: 1,
            base_unit_price_excl_vat: 0,
            unit_price_excl_vat: 0,
            vat_rate: clampPct(vatPercent),
            price_overridden: false,
          } as QuoteLine);
        }

        const dp = clampPct(discountPercentText);
        const baseEx = n2((product as any).selling_price || 0);
        const discountedEx = roundTo(baseEx * (1 - dp / 100), 6);
        const upb = Math.max(1, Math.trunc(n2(product.units_per_box || 1)));

        // keep existing uom choice but default BOX
        const nextUom: Uom = r.uom || "BOX";

        return recalc({
          ...r,
          product_id: product.id,
          item_code: String(product.item_code || product.sku || ""),
          description: String(product.description || product.name || "").trim(),

          uom: nextUom,
          units_per_box: upb,

          base_unit_price_excl_vat: baseEx,
          unit_price_excl_vat: discountedEx,
          vat_rate: clampPct(r.vat_rate || vatPercent),

          // set a sensible initial qty
          box_qty: nextUom === "KG" ? Math.max(0, roundKg(r.box_qty || 0)) : Math.max(1, Math.trunc(n2(r.box_qty || 1))),
          pcs_qty: nextUom === "PCS" ? Math.max(1, Math.trunc(n2(r.pcs_qty || 1))) : 0,
          grams_qty: nextUom === "G" ? Math.max(1, Math.trunc(n2(r.grams_qty || 1))) : 0,
          bags_qty: nextUom === "BAG" ? Math.max(1, Math.trunc(n2(r.bags_qty || 1))) : 0,

          price_overridden: false,
        } as QuoteLine);
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

  /* ===== Keyboard shortcuts ===== */
  const saveBtnRef = useRef<HTMLButtonElement | null>(null);
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
        openCustomerSearch();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prodOpen, custOpen]);

  /* ===== Save / Print ===== */
  async function onSave() {
    if (!customerId) return toast.error("Please select a customer.");
    if (!quotationDate) return toast.error("Please select quotation date.");
    if (!salesReps.length) return toast.error("Please select at least one sales rep.");
    if (realLines.length === 0) return toast.error("Please add at least one item.");
    if (realLines.some((l) => !isQtyValid(l))) return toast.error("Qty must be greater than 0.");

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

        vat_percent: vatPercent,
        discount_percent: discountPercent,
        discount_amount: n2(discountAmount),

        items: realLines.map((l) => {
          const uom: Uom =
            l.uom === "PCS" ? "PCS" :
            l.uom === "KG" ? "KG" :
            l.uom === "G" ? "G" :
            l.uom === "BAG" ? "BAG" :
            "BOX";

          const upb = uom === "BOX" ? safeUpb(l.units_per_box) : 1;

          const box_qty =
            uom === "BOX" ? Math.max(0, Math.trunc(n2(l.box_qty))) :
            uom === "KG" ? Math.max(0, roundKg(l.box_qty)) :
            0;

          const pcs_qty = uom === "PCS" ? Math.max(0, Math.trunc(n2(l.pcs_qty))) : 0;
          const grams_qty = uom === "G" ? Math.max(0, Math.trunc(n2(l.grams_qty))) : 0;
          const bags_qty = uom === "BAG" ? Math.max(0, Math.trunc(n2(l.bags_qty))) : 0;

          const total_qty =
            uom === "BOX" ? box_qty * upb :
            uom === "PCS" ? pcs_qty :
            uom === "KG" ? box_qty :
            uom === "G" ? grams_qty :
            bags_qty;

          const rate = clampPct(l.vat_rate);
          const unitEx = Math.max(0, n2(l.unit_price_excl_vat));
          const unitVat = roundTo(unitEx * (rate / 100), 3);
          const unitInc = roundTo(unitEx + unitVat, 3);
          const lineTotal = r2(total_qty * unitInc);

          return {
            product_id: l.product_id,
            item_code: l.item_code || null,
            description: l.description || null,

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

            base_unit_price_excl_vat: n2(l.base_unit_price_excl_vat),
            vat_rate: rate,
            price_overridden: !!l.price_overridden,
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

  // Qty input display depends on UOM
  function qtyDisplayFor(r: QuoteLine) {
    if (r.uom === "PCS") return rawNum(r.pcs_qty);
    if (r.uom === "KG") return rawNum(r.box_qty);
    if (r.uom === "G") return rawNum(r.grams_qty);
    if (r.uom === "BAG") return rawNum(r.bags_qty);
    return rawNum(r.box_qty); // BOX
  }

  return (
    <div className="inv-page">
      <div className="inv-actions inv-screen inv-actions--tight">
        <Button variant="outline" onClick={() => nav(-1)}>
          ← Back
        </Button>

        <div className="inv-actions-right">
          <Button
            variant="outline"
            onClick={() => {
              customersQ.refetch();
              productsQ.refetch();
            }}
            disabled={busy}
          >
            {busy ? "Refreshing…" : "Refresh"}
          </Button>

          <Button variant="outline" onClick={onPrint} disabled={printing}>
            {printing ? "Preparing…" : "Print"}
          </Button>

          <Button ref={saveBtnRef as any} onClick={onSave} disabled={busy}>
            {busy ? "Saving…" : "Save Quotation"}
          </Button>
        </div>
      </div>

      <div className="inv-screen inv-form-shell inv-form-shell--tight">
        <div className="inv-form-card">
          <div className="inv-form-head inv-form-head--tight">
            <div>
              <div className="inv-form-title">New Quotation</div>
              <div className="inv-form-sub">Customer • Items • Totals • Save (Ctrl/⌘+S)</div>
            </div>

            <div className="inv-form-meta">
              <div className="inv-meta-row">
                <span className="inv-meta-k">Quotation No</span>
                <span className="inv-meta-v">{quotationNumber}</span>
              </div>
              <div className="inv-meta-row">
                <span className="inv-meta-k">Date</span>
                <span className="inv-meta-v">{quotationDate}</span>
              </div>
              {validUntil ? (
                <div className="inv-meta-row">
                  <span className="inv-meta-k">Valid Until</span>
                  <span className="inv-meta-v">{validUntil}</span>
                </div>
              ) : null}
            </div>
          </div>

          <div className="inv-form-2rows">
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
                    Only one name prints on the quotation header (based on selection).
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
                        {c.customer_code ? `${c.name} (${c.customer_code})` : c.name}
                      </option>
                    ))}
                  </select>

                  <button type="button" className="inv-iconBtn" onClick={openCustomerSearch} title="Search customer (Ctrl/⌘+K)">
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
                <label>Quotation Date</label>
                <input className="inv-input" type="date" value={quotationDate} onChange={(e) => setQuotationDate(e.target.value)} />
              </div>

              <div className="inv-field">
                <label>Valid Until (optional)</label>
                <input className="inv-input" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
              </div>
            </div>

            <div className="inv-form-row inv-form-row--bottom inv-row-red">
              <div className="inv-field inv-field--salesrep">
                <label>Sales Rep(s)</label>

                <div ref={repBoxRef} className="inv-rep">
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

                <div className="inv-help">This prints on the quotation + is saved to the record.</div>
              </div>

              <div className="inv-field">
                <label>Default VAT %</label>
                <input className="inv-input inv-input--right inv-input--sm" inputMode="decimal" value={vatPercentText} onChange={(e) => setVatPercentText(e.target.value)} />
                <div className="inv-help">Applies to all rows (you can still override a row VAT).</div>
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
                <div className="inv-help">Auto from customer unless you edit.</div>
              </div>

              <div className="inv-field">
                <label>Subtotal (EX)</label>
                <input className="inv-input inv-input--right inv-input--sm" value={money(subtotalEx)} readOnly />
              </div>

              <div className="inv-field">
                <label>VAT</label>
                <input className="inv-input inv-input--right inv-input--sm" value={money(vatAmount)} readOnly />
              </div>

              <div className="inv-field">
                <label>Total</label>
                <input className="inv-input inv-input--right inv-input--sm" value={money(totalAfterDiscount)} readOnly />
              </div>
            </div>
          </div>

          <div className="inv-items">
            <div className="inv-items-head">
              <div>
                <div className="inv-items-title">Items</div>
                <div className="inv-items-sub">UOM supports BOX / PCS / KG / Grams / Bags. Press Enter in Qty to go next (adds row).</div>
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

                        {/* QTY + UOM */}
                        <td className="inv-td inv-center">
                          <div className="inv-boxcell inv-boxcell--oneRow">
                            <select className="inv-input inv-input--uom" value={r.uom} onChange={(e) => setLine(r.id, { uom: e.target.value as any })} disabled={!isReal}>
                              <option value="BOX">BOX</option>
                              <option value="PCS">PCS</option>
                              <option value="KG">Kg</option>
                              <option value="G">Grams</option>
                              <option value="BAG">Bags</option>
                            </select>

                            <input
                              ref={(el) => (qtyRefs.current[r.id] = el)}
                              className="inv-input inv-input--qty inv-center"
                              value={qtyDisplayFor(r)}
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
                            <input className="inv-input inv-center" value={r.uom === "KG" ? "Kg" : "—"} readOnly />
                          )}
                        </td>

                        {/* TOTAL QTY */}
                        <td className="inv-td inv-center">
                          <input className="inv-input inv-center" value={rawNum(r.total_qty)} readOnly />
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

                        {/* TOTAL */}
                        <td className="inv-td inv-right inv-td-total">
                          <input className="inv-input inv-input--right inv-input--total" value={money(r.line_total)} readOnly />
                        </td>

                        {/* DELETE */}
                        <td className="inv-td inv-center inv-td-del">
                          <button type="button" className="inv-xmini inv-xmini--red" onClick={() => removeLine(r.id)} title="Remove row" aria-label="Remove row">
                            ✕
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

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
                  <span className="v">Rs {money(totalAfterDiscount)}</span>
                </div>
              </div>
            </div>

            <div className="inv-form-footer inv-form-footer--tight">
              <Button variant="outline" onClick={() => nav("/quotations")}>
                Cancel
              </Button>
              <Button onClick={onSave} disabled={busy}>
                {busy ? "Saving…" : "Save Quotation"}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Customer Search Modal */}
      {custOpen ? (
        <div className="inv-modal-backdrop" onMouseDown={() => setCustOpen(false)}>
          <div className="inv-modal inv-modal--sm" onMouseDown={(e) => e.stopPropagation()}>
            <div className="inv-modal-head">
              <div className="inv-modal-title">Search Customer</div>
              <button className="inv-modal-x" onClick={() => setCustOpen(false)} type="button" aria-label="Close">
                ✕
              </button>
            </div>

            <div className="inv-modal-body">
              <input className="inv-input" value={custSearch} onChange={(e) => setCustSearch(e.target.value)} placeholder="Search customers…" autoFocus />

              <div className="inv-modal-list">
                {filteredCustomers.slice(0, 250).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="inv-modal-item"
                    onClick={() => {
                      setCustomerId(c.id);
                      setCustOpen(false);
                    }}
                  >
                    <div className="inv-modal-item-title">
                      <b>{c.name}</b> {c.customer_code ? <span className="inv-muted">({c.customer_code})</span> : null}
                    </div>
                    <div className="inv-modal-item-sub">{[c.phone, c.address].filter(Boolean).join(" · ")}</div>
                  </button>
                ))}

                {filteredCustomers.length === 0 ? <div className="inv-modal-empty">No customers match your search.</div> : null}
              </div>

              <div className="inv-modal-actions">
                <Button variant="outline" onClick={() => setCustOpen(false)}>
                  Close
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Product Search Modal */}
      {prodOpen ? (
        <div className="inv-modal-backdrop" onMouseDown={() => setProdOpen(false)}>
          <div className="inv-modal inv-modal--sm" onMouseDown={(e) => e.stopPropagation()}>
            <div className="inv-modal-head">
              <div className="inv-modal-title">Search Product</div>
              <button className="inv-modal-x" onClick={() => setProdOpen(false)} type="button" aria-label="Close">
                ✕
              </button>
            </div>

            <div className="inv-modal-body">
              <input className="inv-input" value={prodSearch} onChange={(e) => setProdSearch(e.target.value)} placeholder="Search products…" autoFocus />

              <div className="inv-modal-list">
                {filteredProducts.slice(0, 250).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="inv-modal-item"
                    onClick={() => {
                      const rowId = prodPickRowId;
                      if (rowId) applyProductToRow(rowId, p);
                      setProdOpen(false);
                    }}
                  >
                    <div className="inv-modal-item-title">
                      <b>{p.item_code || p.sku || "—"}</b> — {p.name || "—"}
                    </div>
                    <div className="inv-modal-item-sub">UPB {intFmt(p.units_per_box ?? 1)} · Unit Ex {money(p.selling_price ?? 0)}</div>
                  </button>
                ))}

                {filteredProducts.length === 0 ? <div className="inv-modal-empty">No products match your search.</div> : null}
              </div>

              <div className="inv-modal-actions">
                <Button variant="outline" onClick={() => setProdOpen(false)}>
                  Close
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

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
            vat_rate: n2(r.vat_rate),
          }))}
          totals={{
            subtotal: subtotalEx,
            vatPercentLabel: `VAT ${vatPercent}%`,
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
