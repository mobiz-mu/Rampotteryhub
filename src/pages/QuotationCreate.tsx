// src/pages/QuotationCreate.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import RamPotteryDoc from "@/components/print/RamPotteryDoc";

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

export default function QuotationCreate() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const duplicateId = params.get("duplicate");

  const [saving, setSaving] = useState(false);
  const [printing, setPrinting] = useState(false);

  const [printNameMode, setPrintNameMode] = useState<PrintNameMode>("CUSTOMER");
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [clientName, setClientName] = useState<string>("");

  const [quotationDate, setQuotationDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [validUntil, setValidUntil] = useState<string>("");

  const [vatPercent, setVatPercent] = useState<number>(15);

  const [discountPercent, setDiscountPercent] = useState<number>(0);
  const [discountTouched, setDiscountTouched] = useState(false);

  const [quotationNumber, setQuotationNumber] = useState<string>("(Auto when saved)");
  const [lines, setLines] = useState<QuoteLine[]>([blankLine(15)]);

  const qtyRefs = useRef<Record<string, HTMLInputElement | null>>({});

  /* ===== Search Modals (same pattern as invoice) ===== */
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);
  const [customerSearchTerm, setCustomerSearchTerm] = useState("");

  const [productSearchOpen, setProductSearchOpen] = useState(false);
  const [productSearchRowId, setProductSearchRowId] = useState<string | null>(null);
  const [productSearchTerm, setProductSearchTerm] = useState("");

  function openCustomerSearch() {
    setCustomerSearchTerm("");
    setCustomerSearchOpen(true);
    setTimeout(() => (document.getElementById("qCustomerSearchInput") as HTMLInputElement | null)?.focus?.(), 0);
  }
  function closeCustomerSearch() {
    setCustomerSearchOpen(false);
    setCustomerSearchTerm("");
  }

  function openProductSearch(rowId: string) {
    setProductSearchRowId(rowId);
    setProductSearchTerm("");
    setProductSearchOpen(true);
    setTimeout(() => (document.getElementById("qProductSearchInput") as HTMLInputElement | null)?.focus?.(), 0);
  }
  function closeProductSearch() {
    setProductSearchOpen(false);
    setProductSearchRowId(null);
    setProductSearchTerm("");
  }

  /* ===== Sales reps dropdown (same UX) ===== */
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

  /* ===== Which name prints ===== */
  const printedName = useMemo(() => {
    const cn = (customer?.name || "").trim();
    const cl = clientName.trim();
    if (printNameMode === "CLIENT") return cl || cn;
    return cn || cl;
  }, [printNameMode, customer?.name, clientName]);

  /* ===== Customer change ===== */
  useEffect(() => {
    if (!customerId || !customer) return;
    if (!discountTouched) setDiscountPercent(clampPct(customer.discount_percent ?? 0));
    if (!clientName.trim()) setClientName(customer.name || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  /* ===== VAT applies to all ===== */
  useEffect(() => {
    const v = clampPct(vatPercent);
    setLines((prev) => prev.map((r) => recalc({ ...r, vat_rate: v })));
  }, [vatPercent]);

  /* ===== Discount recalculates unit_ex from base ===== */
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

        setQuotationDate(String((qRow as any).quotation_date || new Date().toISOString().slice(0, 10)));
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

  /* ===== Totals (Invoice-style, no balances) ===== */
  const realLines = useMemo(() => lines.filter((l) => !!l.product_id), [lines]);

  const subtotalEx = useMemo(
    () => realLines.reduce((sum, r) => sum + n2(r.total_qty) * n2(r.unit_price_excl_vat), 0),
    [realLines]
  );

  const vatAmount = useMemo(() => {
    return realLines.reduce((sum, r) => sum + n2(r.total_qty) * n2(r.unit_vat), 0);
  }, [realLines]);

  // Total AFTER discount (because unit_price_excl_vat already includes discount)
  const totalAfterDiscount = useMemo(() => subtotalEx + vatAmount, [subtotalEx, vatAmount]);

  // How much discount was applied vs base prices
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

    setSaving(true);
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

      // ✅ Go to view page
      if (res?.id) nav(`/quotations/${res.id}`);
    } catch (e: any) {
      toast.error(e?.message || "Failed to save quotation");
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
            {saving ? "Saving…" : "Save Quotation"}
          </Button>
        </div>
      </div>

      {/* FORM */}
      <div className="inv-screen inv-form-shell inv-form-shell--tight">
        <div className="inv-form-card">
          <div className="inv-form-head inv-form-head--tight">
            <div>
              <div className="inv-form-title">New Quotation</div>
              <div className="inv-form-sub">UI matches invoice creation (A4 columns locked).</div>
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
            </div>
          </div>

          {/* ===== 2 ROWS ONLY ===== */}
          <div className="inv-form-2rows">
            {/* ROW 1 */}
            <div className="inv-form-row inv-form-row--top">
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

                <div className="inv-help">Only one name prints on the quotation header.</div>
              </div>

              <div className="inv-field">
                <label>Client Name</label>
                <input
                  className="inv-input"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Type a client name (optional)"
                />
                <div className="inv-help">If “Client Name” is selected, it prints as the customer name.</div>
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
                <label>Quotation Date</label>
                <input
                  className="inv-input"
                  type="date"
                  value={quotationDate}
                  onChange={(e) => setQuotationDate(e.target.value)}
                />
              </div>

              <div className="inv-field">
                <label>Valid Until (optional)</label>
                <input className="inv-input" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
              </div>
            </div>

            {/* ROW 2 */}
            <div className="inv-form-row inv-form-row--bottom">
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
                                setSalesReps((prev) => prev.filter((x) => x !== n));
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
                              setSalesReps((prev) => (active ? prev.filter((x) => x !== r.name) : [...prev, r.name]));
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

                <div className="inv-help">Prints on quotation + saved to record.</div>
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

              {/* filler to keep row aligned like invoice */}
              <div className="inv-field" />
              <div className="inv-field" />
              <div className="inv-field" />
            </div>
          </div>

          {/* ITEMS */}
          <div className="inv-items">
            <div className="inv-items-head">
              <div>
                <div className="inv-items-title">Items</div>
                <div className="inv-items-sub">Matches printed quotation columns (A4).</div>
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

            {/* Totals tiles (same vibe as invoice) */}
            <div className="inv-totalsbar inv-totalsbar--premium">
              <div className="inv-totalsbar__cell">
                <span className="k">Subtotal</span>
                <span className="v">Rs {money(subtotalEx)}</span>
              </div>
              <div className="inv-totalsbar__cell">
                <span className="k">VAT</span>
                <span className="v">Rs {money(vatAmount)}</span>
              </div>
              <div className="inv-totalsbar__cell">
                <span className="k">Discount</span>
                <span className="v">Rs {money(discountAmount)}</span>
              </div>
              <div className="inv-totalsbar__cell inv-totalsbar__cell--balance">
                <span className="k">Total</span>
                <span className="v">Rs {money(totalAfterDiscount)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CUSTOMER SEARCH MODAL */}
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
                id="qCustomerSearchInput"
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

      {/* PRODUCT SEARCH MODAL */}
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
                id="qProductSearchInput"
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
          variant="QUOTATION"
          docNoLabel="QUOTATION NO:"
          docNoValue={quotationNumber}
          dateLabel="DATE:"
          dateValue={quotationDate}
          // Use PO row as VALID UNTIL for quotation (no doc component change needed)
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
          // TODO: replace with your real company BRN/VAT from settings if you store it
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

