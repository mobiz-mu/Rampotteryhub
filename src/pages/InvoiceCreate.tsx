// src/pages/InvoiceCreate.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import RamPotteryDoc from "@/components/print/RamPotteryDoc";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

import { listCustomers, listProducts, getInvoiceById, createInvoice } from "@/lib/invoices";

/* ============================
   Types
============================ */
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

type Uom = "BOX" | "PCS";

type InvoiceLine = {
  id: string;
  product_id: number | null;

  item_code: string;
  description: string;

  uom: Uom;
  box_qty: number;
  units_per_box: number;
  total_qty: number;

  vat_rate: number;
  base_unit_price_excl_vat: number;
  unit_price_excl_vat: number;

  unit_vat: number;
  unit_price_incl_vat: number;
  line_total: number;
};

type PrintNameMode = "CUSTOMER" | "CLIENT";

/* ============================
   Sales reps (static for now)
============================ */
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

/* ============================
   Helpers
============================ */
function n2(v: any) {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}
function clampPct(v: any) {
  const x = n2(v);
  return Math.max(0, Math.min(100, x));
}
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

function recalc(row: InvoiceLine): InvoiceLine {
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

function blankLine(defaultVat: number): InvoiceLine {
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

/* ============================
   Page
============================ */
export default function InvoiceCreate() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const duplicateId = params.get("duplicate");

  const [saving, setSaving] = useState(false);
  const [printing, setPrinting] = useState(false);

  // Print name choice: ONLY ONE will appear on invoice header
  const [printNameMode, setPrintNameMode] = useState<PrintNameMode>("CUSTOMER");

  // Account customer (always selected for ledger)
  const [customerId, setCustomerId] = useState<number | null>(null);

  // Client name free text (always editable; only used when printNameMode === CLIENT)
  const [clientName, setClientName] = useState<string>("");

  const [invoiceDate, setInvoiceDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [purchaseOrderNo, setPurchaseOrderNo] = useState<string>("");

  // VAT editable (0–100)
  const [vatPercent, setVatPercent] = useState<number>(15);

  // Discount editable (0–100)
  const [discountPercent, setDiscountPercent] = useState<number>(0);
  const [discountTouched, setDiscountTouched] = useState(false);

  // Paid / Remaining
  const [previousBalance, setPreviousBalance] = useState<number>(0);
  const [amountPaid, setAmountPaid] = useState<number>(0);
  const [balanceTouched, setBalanceTouched] = useState(false);
  const [balanceManual, setBalanceManual] = useState<number>(0);

  const [invoiceNumber, setInvoiceNumber] = useState<string>("(Auto when saved)");
  const [lines, setLines] = useState<InvoiceLine[]>([blankLine(15)]);

  // Enter → next row focus
  const qtyRefs = useRef<Record<string, HTMLInputElement | null>>({});

  /* ============================
     Customer/Product search modals
  ============================ */
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

  /* ============================
     Sales reps (premium dropdown + chips)
  ============================ */
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

  /* ============================
     Data
  ============================ */
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

  /* ============================
     Which name prints on invoice header
  ============================ */
  const printedName = useMemo(() => {
    const cn = (customer?.name || "").trim();
    const cl = clientName.trim();
    if (printNameMode === "CLIENT") return cl || cn;
    return cn || cl;
  }, [printNameMode, customer?.name, clientName]);

  /* ============================
     Customer change
  ============================ */
  useEffect(() => {
    if (!customerId || !customer) return;

    setPreviousBalance(n2(customer.opening_balance ?? 0));

    // Auto-fill discount from customer unless user already edited
    if (!discountTouched) setDiscountPercent(clampPct(customer.discount_percent ?? 0));

    // If clientName empty, suggest customer name (still editable anytime)
    if (!clientName.trim()) setClientName(customer.name || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  /* ============================
     VAT applies to all lines
  ============================ */
  useEffect(() => {
    const v = clampPct(vatPercent);
    setLines((prev) => prev.map((r) => recalc({ ...r, vat_rate: v } as InvoiceLine)));
  }, [vatPercent]);

  /* ============================
     Discount recalculates unit_ex from base
  ============================ */
  useEffect(() => {
    const dp = clampPct(discountPercent);
    setLines((prev) =>
      prev.map((r) => {
        if (!r.product_id) return r;
        const base = n2(r.base_unit_price_excl_vat);
        const discounted = base * (1 - dp / 100);
        return recalc({ ...r, unit_price_excl_vat: discounted } as InvoiceLine);
      })
    );
  }, [discountPercent]);

  /* ============================
     Duplicate logic
  ============================ */
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

        setVatPercent(clampPct(inv.vat_percent ?? inv.vatPercent ?? 15));
        setDiscountPercent(clampPct(inv.discount_percent ?? inv.discountPercent ?? 0));
        setDiscountTouched(true);

        setPreviousBalance(n2(inv.previous_balance ?? 0));
        setAmountPaid(n2(inv.amount_paid ?? 0));
        setBalanceTouched(false);
        setBalanceManual(0);

        // sales reps (if stored as text)
        const repText = String(inv.sales_rep || inv.salesRep || "").trim();
        const repList = repText ? repText.split(",").map((s: string) => s.trim()).filter(Boolean) : [];
        if (repList.length) setSalesReps(repList as SalesRepName[]);

        const cloned = (inv.items || []).map((it: any) =>
          recalc({
            id: uid(),
            product_id: it.product_id,
            item_code: it.item_code || it.product?.item_code || it.product?.sku || "",
            description: it.description || it.product?.name || "",
            uom: it.uom === "PCS" ? "PCS" : "BOX",
            box_qty: n2(it.box_qty || it.pcs_qty || 0),
            units_per_box: Math.max(1, Math.trunc(n2(it.units_per_box || 1))),
            total_qty: Math.trunc(n2(it.total_qty || 0)),
            vat_rate: clampPct(it.vat_rate ?? inv.vat_percent ?? 15),
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

  /* ============================
     Totals
  ============================ */
  const realLines = useMemo(() => lines.filter((l) => !!l.product_id), [lines]);

  const subtotalEx = useMemo(
    () => realLines.reduce((sum, r) => sum + n2(r.total_qty) * n2(r.unit_price_excl_vat), 0),
    [realLines]
  );

  const vatAmount = useMemo(() => {
    return realLines.reduce((sum, r) => {
      const rate = clampPct(r.vat_rate);
      const unitEx = n2(r.unit_price_excl_vat);
      return sum + n2(r.total_qty) * (unitEx * (rate / 100));
    }, 0);
  }, [realLines]);

  const totalAmount = useMemo(() => subtotalEx + vatAmount, [subtotalEx, vatAmount]);
  const grossTotal = useMemo(() => totalAmount + n2(previousBalance), [totalAmount, previousBalance]);

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
    return Math.max(0, baseTotal - totalAmount);
  }, [realLines, discountPercent, totalAmount]);

  const balanceAuto = useMemo(() => Math.max(0, grossTotal - n2(amountPaid)), [grossTotal, amountPaid]);
  const balanceRemaining = balanceTouched ? Math.max(0, n2(balanceManual)) : balanceAuto;

  useEffect(() => {
    if (!balanceTouched) return;
    const wanted = Math.max(0, n2(balanceManual));
    setAmountPaid(Math.max(0, grossTotal - wanted));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [balanceManual, balanceTouched, grossTotal]);

  /* ============================
     Row helpers
  ============================ */
  function setLine(id: string, patch: Partial<InvoiceLine>) {
    setLines((prev) => prev.map((r) => (r.id === id ? recalc({ ...r, ...patch } as InvoiceLine) : r)));
  }

  function addRowAndFocus() {
    const newRow = blankLine(vatPercent);
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
    addRowAndFocus();
  }

  /* ============================
     Save / Print
  ============================ */
  async function onSave() {
    if (!customerId) return toast.error("Please select a customer.");
    if (!invoiceDate) return toast.error("Please select invoice date.");
    if (!salesReps.length) return toast.error("Please select at least one sales rep.");
    if (realLines.length === 0) return toast.error("Please add at least one item.");
    if (realLines.some((l) => Math.trunc(n2(l.box_qty)) <= 0)) return toast.error("Qty must be at least 1.");

    // If CLIENT mode, require a client name (still editable anytime)
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

        vatPercent: clampPct(vatPercent),
        discountPercent: clampPct(discountPercent),

        previousBalance: n2(previousBalance),
        amountPaid: n2(amountPaid),

        salesRep: salesReps.join(", "),
        salesRepPhone: salesReps.map(repPhoneByName).filter(Boolean).join(", "),

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
            box_qty: uom === "BOX" ? qtyInput : null,
            pcs_qty: uom === "PCS" ? qtyInput : null,
            units_per_box: upb,
            total_qty: totalQty,
            unit_price_excl_vat: unitEx,
            vat_rate: rate,
            unit_vat: unitVat,
            unit_price_incl_vat: unitInc,
            line_total: totalQty * unitInc,
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

  /* ============================
     Render
  ============================ */
  const DocAny: any = RamPotteryDoc;

  return (
    <div className="inv-page">
      {/* TOP ACTIONS (tight) */}
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
                <span className="inv-meta-v">{invoiceDate}</span>
              </div>
            </div>
          </div>

          {/* ===== 2 ROWS ONLY (premium aligned) ===== */}
          <div className="inv-form-2rows">
            {/* ROW 1 */}
            <div className="inv-form-row inv-form-row--top">
              {/* Print name */}
              <div className="inv-field inv-field--printname">
                <label>Print Name</label>

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

                <div className="inv-help">Only one name prints on the invoice header (based on selection).</div>
              </div>

              {/* Client name (ALWAYS editable) */}
              <div className="inv-field">
                <label>Client Name</label>
                <input
                  className="inv-input"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Type a client name (optional)"
                />
                <div className="inv-help">
                  If “Client Name” is selected, this prints as the invoice customer name.
                </div>
              </div>

              {/* Customer (account) BIG + small search icon */}
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

              {/* Date */}
              <div className="inv-field">
                <label>Invoice Date</label>
                <input
                  className="inv-input"
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                />
              </div>

              {/* PO */}
              <div className="inv-field">
                <label>Purchase Order No (optional)</label>
                <input
                  className="inv-input"
                  value={purchaseOrderNo}
                  onChange={(e) => setPurchaseOrderNo(e.target.value)}
                  placeholder="Optional"
                />
              </div>
            </div>

            {/* ROW 2 */}
            <div className="inv-form-row inv-form-row--bottom">
              {/* Sales reps (premium dropdown multi) */}
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
                        salesReps.map((n) => (
                          <span key={n} className="inv-chip">
                            {n} ({repPhoneByName(n)})
                            <span
                              className="inv-chip-x"
                              onClick={(e) => {
                                e.stopPropagation();
                                const next = salesReps.filter((x) => x !== n);
                                setSalesReps(next);
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
                              // Optional UX: close after selection
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
                <label>VAT %</label>
                <input
                  className="inv-input inv-input--right inv-input--sm"
                  inputMode="decimal"
                  value={vatPercent}
                  onChange={(e) => setVatPercent(clampPct(e.target.value))}
                />
                <div className="inv-help">0–100 allowed (applies to all items).</div>
              </div>

              <div className="inv-field">
                <label>Discount %</label>
                <input
                  className="inv-input inv-input--right inv-input--sm"
                  inputMode="decimal"
                  value={discountPercent}
                  onChange={(e) => {
                    setDiscountTouched(true);
                    setDiscountPercent(clampPct(e.target.value));
                  }}
                />
                <div className="inv-help">Auto from customer unless you edit.</div>
              </div>

              <div className="inv-field">
                <label>Previous Balance</label>
                <input
                  className="inv-input inv-input--right inv-input--sm"
                  inputMode="decimal"
                  value={previousBalance}
                  onChange={(e) => setPreviousBalance(n2(e.target.value))}
                />
              </div>

              <div className="inv-field">
                <label>Amount Paid</label>
                <input
                  className="inv-input inv-input--right inv-input--sm"
                  inputMode="decimal"
                  value={amountPaid}
                  onChange={(e) => {
                    setBalanceTouched(false);
                    setAmountPaid(n2(e.target.value));
                  }}
                />
                <div className="inv-help">If Amount Paid &gt; 0, WhatsApp opens after Save with PDF share.</div>
              </div>

              <div className="inv-field">
                <label>Amount Remaining</label>
                <input
                  className="inv-input inv-input--right inv-input--sm"
                  inputMode="decimal"
                  value={balanceRemaining}
                  onChange={(e) => {
                    setBalanceTouched(true);
                    setBalanceManual(n2(e.target.value));
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
                <div className="inv-items-sub">Matches printed invoice columns (A4).</div>
              </div>

              <div className="inv-items-actions">
                <Button onClick={addRowAndFocus}>+ Add Row</Button>
              </div>
            </div>

            <div className="inv-table-wrap">
              <table className="inv-table inv-table--invoiceCols">
                <colgroup>
                  <col style={{ width: "4%" }} />
                  <col style={{ width: "32%" }} />
                  <col style={{ width: "14%" }} />
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
                    <th className="inv-th inv-th-center">BOX / PCS</th>
                    <th className="inv-th inv-th-center">UNIT</th>
                    <th className="inv-th inv-th-center">TOTAL QTY</th>
                    <th className="inv-th inv-th-right">UNIT EX</th>
                    <th className="inv-th inv-th-right">VAT</th>
                    <th className="inv-th inv-th-right">UNIT INC</th>
                    <th className="inv-th inv-th-right">TOTAL</th>
                    <th className="inv-th inv-th-center" />
                  </tr>
                </thead>

                <tbody>
                  {lines.map((r, idx) => {
                    const isReal = !!r.product_id;

                    return (
                      <tr key={r.id}>
                        <td className="inv-td inv-center">{idx + 1}</td>

                        {/* Product select + small icon search */}
                        <td className="inv-td">
                          <div className="inv-prodRow">
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

                            <button
                              type="button"
                              className="inv-iconBtn inv-iconBtn--table"
                              onClick={() => openProductSearch(r.id)}
                              title="Search product"
                            >
                              🔍
                            </button>
                          </div>
                        </td>

                        <td className="inv-td inv-center">
                          <div className="inv-boxcell">
                            <select
                              className="inv-input inv-input--uom"
                              value={r.uom}
                              onChange={(e) => setLine(r.id, { uom: e.target.value as any })}
                              disabled={!isReal}
                            >
                              <option value="BOX">BOX</option>
                              <option value="PCS">PCS</option>
                            </select>

                            <input
                              ref={(el) => (qtyRefs.current[r.id] = el)}
                              className="inv-input inv-input--qty inv-input--qtywide inv-center"
                              value={r.box_qty}
                              onChange={(e) => setLine(r.id, { box_qty: n2(e.target.value) })}
                              onKeyDown={(e) => {
                                if (e.key !== "Enter") return;
                                if (!isReal) return;
                                e.preventDefault();
                                focusNextQty(r.id);
                              }}
                              disabled={!isReal}
                              inputMode="numeric"
                              placeholder="0"
                            />
                          </div>
                        </td>

                        <td className="inv-td inv-center">
                          <input className="inv-input inv-center" value={r.uom === "PCS" ? "" : intFmt(r.units_per_box)} readOnly />
                        </td>

                        <td className="inv-td inv-center">
                          <input className="inv-input inv-center" value={intFmt(r.total_qty)} readOnly />
                        </td>

                        <td className="inv-td inv-right">
                          <input className="inv-input inv-input--right" value={money(r.unit_price_excl_vat)} readOnly />
                        </td>

                        <td className="inv-td inv-right">
                          <input className="inv-input inv-input--right" value={money(r.unit_vat)} readOnly />
                        </td>

                        <td className="inv-td inv-right">
                          <input className="inv-input inv-input--right" value={money(r.unit_price_incl_vat)} readOnly />
                        </td>

                        <td className="inv-td inv-right">
                          <input className="inv-input inv-input--right inv-input--total" value={money(r.line_total)} readOnly />
                        </td>

                        <td className="inv-td inv-center">
                          <button
                            type="button"
                            className="inv-xmini"
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

            {/* Premium tiles row */}
            <div className="inv-totalsbar inv-totalsbar--premium">
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
              <div className="inv-totalsbar__cell">
                <span className="k">Discount</span>
                <span className="v">Rs {money(discountAmount)}</span>
              </div>
              <div className="inv-totalsbar__cell">
                <span className="k">Total after discount</span>
                <span className="v">Rs {money(totalAmount)}</span>
              </div>
              <div className="inv-totalsbar__cell inv-totalsbar__cell--balance">
                <span className="k">Balance</span>
                <span className="v">Rs {money(balanceRemaining)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* =========================
          Customer Search Modal (small)
      ========================= */}
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

      {/* =========================
          Product Search Modal (small)
      ========================= */}
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
          dateValue={invoiceDate}
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
            total_amount: totalAmount,
            previous_balance: previousBalance,
            amount_paid: amountPaid,
            balance_remaining: balanceRemaining,
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

