// src/components/print/DotMatrixDocument.tsx
//
// Renders a document (invoice / quotation / credit note) for dot-matrix /
// continuous printing on RAM POTTERY pre-printed stationery, and AUTO-OPENS
// the browser print dialog once the data has rendered.
//
// DATA-ONLY: only variable values are overlaid into the blank spaces of the
// pre-printed paper (no company header, labels, boxes, headings, notes,
// totals labels or signature lines).
//
// There are NO calibration controls (per client request). Alignment is driven
// by fixed internal constants in dotMatrixLayout.ts + DEFAULT_DOT_MATRIX_SETTINGS;
// these can be tuned in code if a printer ever needs it, but are never shown.

import React, { useEffect, useMemo, useRef, useState } from "react";
import "@/styles/dotMatrixPrint.css";
import {
  DM_PAGE_H,
  DOC_FIELDS,
  CUSTOMER_FIELDS,
  TOTAL_FIELDS,
  SIGNATURE_FIELDS,
  ITEM_COLUMNS,
  type Align,
} from "./dotMatrixLayout";
import type { RamPotteryDocItem } from "./RamPotteryDoc";
import { DEFAULT_DOT_MATRIX_SETTINGS as CFG } from "@/lib/printSettings";

/* ---------- data shape ---------- */
export type DotMatrixDocData = {
  /** "INVOICE" | "QUOTATION" | "CREDIT NOTE" */
  docType?: string;
  docNo?: string;
  date?: string;
  po?: string;
  salesRep?: string;
  salesRepCell?: string;
  customer?: {
    name?: string;
    address?: string;
    cell?: string;
    brn?: string;
    vat_no?: string;
  };
  items: RamPotteryDocItem[];
  totals?: {
    subtotal?: number | null;
    vat?: number | null;
    total?: number | null;
    previousBalance?: number | null;
    grossTotal?: number | null;
    amountPaid?: number | null;
    balanceRemaining?: number | null;
  };
  preparedBy?: string | null;
  deliveredBy?: string | null;
  customerName?: string | null;
};

export type DotMatrixDocumentProps = {
  data: DotMatrixDocData;
  docKindLabel?: string;
  /** When true (default) the print dialog opens automatically once rendered. */
  autoPrint?: boolean;
  /** Back button handler (screen only). */
  onBack?: () => void;
  /** When provided, shows a "Print PDF" button (screen only) to switch to the PDF/A4 view. */
  onSwitchToPdf?: () => void;
};

/* ---------- helpers ---------- */
const PT = (v: number) => `${v}pt`;

function money(v: any): string {
  if (v === null || v === undefined || String(v).trim() === "") return "";
  const x = Number(v);
  if (!Number.isFinite(x)) return "";
  return x.toLocaleString("en-MU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function txt(v: any): string {
  return String(v ?? "").trim();
}

function rowQty(it: RamPotteryDocItem): string {
  const uom = String(it.uom || "BOX").toUpperCase();
  if (uom === "PCS") return txt(it.pcs_qty ?? "");
  if (uom === "BAG") return txt(it.bags_qty ?? "");
  if (uom === "G") return txt(it.grams_qty ?? "");
  const b = it.box_qty;
  return b === null || b === undefined || b === "" ? "" : String(b);
}

function cellValue(it: RamPotteryDocItem, key: string): string {
  switch (key) {
    case "sn":
      return String(it.sn ?? "");
    case "item_code":
      return txt(it.item_code);
    case "qty":
      return rowQty(it);
    case "units_per_box":
      return txt(it.units_per_box ?? it.unit_per_box ?? "");
    case "total_qty":
      return txt(it.total_qty ?? "");
    case "description":
      return txt(it.description);
    case "unit_price_excl_vat":
      return money(it.unit_price_excl_vat);
    case "vat":
      return money(it.unit_vat);
    case "unit_price_incl_vat":
      return money(it.unit_price_incl_vat);
    case "total_amount_incl_vat":
      return money(it.line_total);
    default:
      return "";
  }
}

function fieldStyle(
  left: number,
  top: number,
  opts: { width?: number; align?: Align } = {}
): React.CSSProperties {
  return {
    left: PT(left),
    top: PT(top),
    width: opts.width ? PT(opts.width) : undefined,
    textAlign: opts.align,
    fontSize: PT(CFG.fontSize),
    lineHeight: PT(CFG.lineHeight),
  };
}

/* ---------- one page ---------- */
function DotMatrixPage({
  showDetails,
  showTotals,
  showSignatures,
  rows,
  data,
}: {
  showDetails: boolean;
  showTotals: boolean;
  showSignatures: boolean;
  rows: RamPotteryDocItem[];
  data: DotMatrixDocData;
}) {
  const docMap: Record<string, string> = {
    docNo: txt(data.docNo),
    date: txt(data.date),
    po: txt(data.po),
    salesRep: txt(data.salesRep),
    salesRepCell: txt(data.salesRepCell),
  };
  const custMap: Record<string, string> = {
    name: txt(data.customer?.name),
    address: txt(data.customer?.address),
    cell: txt(data.customer?.cell),
    brn: txt(data.customer?.brn),
    vat_no: txt(data.customer?.vat_no),
  };
  const totalsMap: Record<string, string> = {
    subtotal: money(data.totals?.subtotal),
    vat: money(data.totals?.vat),
    total: money(data.totals?.total),
    previousBalance: money(data.totals?.previousBalance),
    grossTotal: money(data.totals?.grossTotal),
    amountPaid: money(data.totals?.amountPaid),
    balanceRemaining: money(data.totals?.balanceRemaining),
  };
  const sigMap: Record<string, string> = {
    preparedBy: txt(data.salesRep || data.preparedBy),
    deliveredBy: txt(data.deliveredBy),
    // NOTE: customer name is intentionally NOT printed in the signature area.
    // It only appears in the top customer-details block (CUSTOMER_FIELDS.name).
  };

  return (
    <div
      className="dot-matrix-page"
      style={{ width: `${CFG.paperWidthIn}in`, height: `${CFG.paperHeightIn}in` }}
    >
      {/* Document type value (top area) */}
      {/* Document type title — centered under the pre-printed "Web:" line.
          (The stationery has NO document-type title, so printing it is allowed.) */}
      {showDetails && data.docType ? (
        <div className="dm-document-title">{txt(data.docType)}</div>
      ) : null}

      {/* Document + customer details: page 1 only */}
      {showDetails &&
        DOC_FIELDS.map((f) =>
          docMap[f.key] ? (
            <div key={`doc-${f.key}`} className="dm-field" style={fieldStyle(f.left, f.top, { width: f.width, align: f.align })}>
              {docMap[f.key]}
            </div>
          ) : null
        )}
      {showDetails &&
        CUSTOMER_FIELDS.map((f) =>
          custMap[f.key] ? (
            <div key={`cust-${f.key}`} className="dm-field" style={fieldStyle(f.left, f.top, { width: f.width, align: f.align })}>
              {custMap[f.key]}
            </div>
          ) : null
        )}

      {/* Item rows */}
      {rows.map((it, rIdx) => {
        const top = CFG.firstRowTop + rIdx * CFG.rowHeight;
        return ITEM_COLUMNS.map((col) => {
          const v = cellValue(it, col.key);
          if (!v) return null;
          return (
            <div
              key={`r${rIdx}-${col.key}`}
              className={`dm-field${col.align === "right" ? " dm-right" : col.align === "center" ? " dm-center" : ""}`}
              style={fieldStyle(col.left, top, { width: col.width, align: col.align })}
            >
              {v}
            </div>
          );
        });
      })}

      {/* Totals + signatures: last page only */}
      {showTotals &&
        TOTAL_FIELDS.map((f) =>
          totalsMap[f.key] ? (
            <div key={`tot-${f.key}`} className="dm-field dm-right" style={fieldStyle(f.left, f.top, { width: f.width, align: "right" })}>
              {totalsMap[f.key]}
            </div>
          ) : null
        )}
      {showSignatures &&
        SIGNATURE_FIELDS.map((f) =>
          sigMap[f.key] ? (
            <div key={`sig-${f.key}`} className="dm-field" style={fieldStyle(f.left, f.top, { width: f.width, align: f.align })}>
              {sigMap[f.key]}
            </div>
          ) : null
        )}
    </div>
  );
}

/* ---------- pages for one document (reused by bulk print) ---------- */
/**
 * Renders just the `.dot-matrix-page` element(s) for one document's data —
 * no toolbar, no `dm-print-root`/`dm-screen-wrap` wrapper, no auto-print.
 * `DotMatrixDocument` renders exactly one of these inside its own wrapper;
 * bulk print pages render several inside ONE shared wrapper so the existing
 * `.dot-matrix-page { break-after: page }` CSS paginates them correctly
 * (each `DotMatrixDocument` has its own `dm-print-root`, and stacking several
 * of those would make their `position: absolute` print rule overlap them on
 * the same physical page instead of one page per document).
 */
export function DotMatrixPages({ data }: { data: DotMatrixDocData }) {
  const pages: RamPotteryDocItem[][] = useMemo(() => {
    const perPage = Math.max(1, Math.floor(CFG.rowsPerPage));
    const out: RamPotteryDocItem[][] = [];
    const items = data.items || [];
    if (!items.length) return [[]];
    for (let i = 0; i < items.length; i += perPage) out.push(items.slice(i, i + perPage));
    return out;
  }, [data.items]);

  const pageCount = pages.length;
  const hasData = !!(data.docNo || (data.items && data.items.length));

  if (!hasData) {
    return (
      <div className="dm-no-print" style={{ color: "#b91c1c", fontSize: 13 }}>
        No document data to print.
      </div>
    );
  }

  return (
    <>
      {pages.map((rows, idx) => (
        <DotMatrixPage
          key={idx}
          rows={rows}
          data={data}
          showDetails={true}
          showTotals={idx === pageCount - 1}
          showSignatures={idx === pageCount - 1}
        />
      ))}
    </>
  );
}

/* ---------- main ---------- */
export default function DotMatrixDocument({
  data,
  docKindLabel = "Document",
  autoPrint = true,
  onBack,
  onSwitchToPdf,
}: DotMatrixDocumentProps) {
  const printedRef = useRef(false);
  const rafRef = useRef<number | undefined>(undefined);

  const hasData = !!(data.docNo || (data.items && data.items.length));

  // Auto-open the print dialog once the data-only layout has actually painted.
  useEffect(() => {
    if (!autoPrint || printedRef.current || !hasData) return;

    let cancelled = false;
    let timer: number | undefined;

    // Two animation frames guarantee the absolutely-positioned fields are laid
    // out, then a short delay lets fonts settle before printing.
    const raf1 = requestAnimationFrame(() => {
      const raf2 = requestAnimationFrame(() => {
        if (cancelled) return;
        timer = window.setTimeout(() => {
          if (cancelled || printedRef.current) return;
          printedRef.current = true;
          window.print();
        }, 300);
      });
      rafRef.current = raf2;
    });
    rafRef.current = raf1;

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (timer) window.clearTimeout(timer);
    };
  }, [autoPrint, hasData]);

  return (
    <div className="dm-print-root">
      <div className="dm-screen-wrap">
        {/* Screen-only minimal toolbar (no calibration controls) */}
        <div
          className="dm-toolbar dm-no-print"
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
        >
          <strong style={{ fontSize: 14 }}>Dot Matrix Print — {docKindLabel}</strong>
          <div style={{ display: "flex", gap: 8 }}>
            {onBack ? (
              <button
                onClick={onBack}
                style={{
                  background: "#fff",
                  color: "#0f172a",
                  border: "1px solid #cbd5e1",
                  borderRadius: 8,
                  padding: "8px 14px",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Back
              </button>
            ) : null}
            {onSwitchToPdf ? (
              <button
                onClick={onSwitchToPdf}
                style={{
                  background: "#fff",
                  color: "#0f172a",
                  border: "1px solid #cbd5e1",
                  borderRadius: 8,
                  padding: "8px 14px",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Print PDF
              </button>
            ) : null}
            <button
              onClick={() => window.print()}
              style={{
                background: "#0f172a",
                color: "#fff",
                border: 0,
                borderRadius: 8,
                padding: "8px 14px",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Print
            </button>
          </div>
        </div>

        {/* Fixed @page size for continuous stationery (overrides any A4 @page). */}
        <style>{`@page { size: ${CFG.paperWidthIn}in ${CFG.paperHeightIn}in; margin: 0; }`}</style>

        <DotMatrixPages data={data} />
      </div>
    </div>
  );
}
