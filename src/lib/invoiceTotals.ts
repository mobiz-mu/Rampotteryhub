// src/lib/invoiceTotals.ts
// Selling price in products = EXCL VAT (per your DB)

export function round2(n: number) {
  return Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
}

export function roundTo(n: any, dp = 3) {
  const x = Number(n ?? 0);
  if (!Number.isFinite(x)) return 0;
  const m = Math.pow(10, dp);
  return Math.round((x + Number.EPSILON) * m) / m;
}

function n2(v: any) {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}

function nonNeg(v: any) {
  const x = n2(v);
  return x < 0 ? 0 : x;
}

/**
 * Convert input qty fields into a consistent "total_qty" that pricing uses.
 *
 * Conventions (matches SQL trigger):
 * - BOX: total_qty = box_qty * units_per_box
 * - PCS: total_qty = pcs_qty
 * - KG:  total_qty = box_qty
 * - BAG: total_qty = box_qty * units_per_box (default 25)
 * - G:   total_qty = box_qty * 0.001   (grams -> kg)
 */
export function computeTotalQty(params: {
  uom: string;
  box_qty?: number;
  pcs_qty?: number;
  units_per_box?: number;
}) {
  const u = String(params.uom || "BOX").toUpperCase();

  const b = nonNeg(params.box_qty ?? 0);
  const p = nonNeg(params.pcs_qty ?? 0);
  const upbRaw = n2(params.units_per_box ?? 1);

  if (u === "PCS") return roundTo(p, 3);

  if (u === "G") {
    // grams -> kg
    return roundTo(b * 0.001, 6);
  }

  if (u === "KG") return roundTo(b, 3);

  if (u === "BAG") {
    const upb = upbRaw > 0 ? upbRaw : 25;
    return roundTo(b * upb, 3);
  }

  // BOX default
  const upb = upbRaw > 0 ? upbRaw : 1;
  return roundTo(b * upb, 3);
}

/**
 * Calculates a single invoice line.
 * - product.selling_price is EXCL VAT
 * - vatRate is % e.g. 15
 * - total_qty determined by UOM rules above
 * - line_total is INCL VAT
 */
export function calcLine(params: {
  uom: string;
  boxQty: number;
  pcsQty: number;
  unitsPerBox: number;
  sellingPriceExclVat: number; // product.selling_price is EXCL VAT
  vatRate: number; // e.g. 15
}) {
  const uom = String(params.uom || "BOX").toUpperCase();

  // allow decimals everywhere
  let box_qty = roundTo(nonNeg(params.boxQty), uom === "G" ? 3 : 3);
  let pcs_qty = roundTo(nonNeg(params.pcsQty), 3);

  let units_per_box = n2(params.unitsPerBox);
  if (!Number.isFinite(units_per_box) || units_per_box <= 0) units_per_box = 1;

  if (uom === "PCS") {
    box_qty = 0;
    units_per_box = 1;
  } else if (uom === "KG") {
    pcs_qty = 0;
    units_per_box = 1;
  } else if (uom === "G") {
    pcs_qty = 0;
    units_per_box = 0.001;
  } else if (uom === "BAG") {
    pcs_qty = 0;
    if (params.unitsPerBox == null || n2(params.unitsPerBox) <= 0) units_per_box = 25;
  }

  const total_qty = computeTotalQty({ uom, box_qty, pcs_qty, units_per_box });

  const unitExcl = round2(n2(params.sellingPriceExclVat));
  const vatRate = n2(params.vatRate);

  const unitVat = vatRate > 0 ? round2((unitExcl * vatRate) / 100) : 0;
  const unitIncl = round2(unitExcl + unitVat);

  const lineTotal = round2(n2(total_qty) * unitIncl);

  return {
    uom,
    box_qty,
    pcs_qty,
    units_per_box,
    total_qty,

    unit_price_excl_vat: unitExcl,
    unit_vat: unitVat,
    unit_price_incl_vat: unitIncl,

    line_total: lineTotal,
    vat_rate: vatRate,
  };
}

/**
 * Totals from items (recommended)
 * - subtotal = sum(total_qty * unit_price_excl_vat)
 * - vat_amount = sum(total_qty * unit_vat)
 * - gross_total = subtotal + vat_amount
 * - total_amount = sum(line_total)
 */
export function calcInvoiceTotalsFromItems(items: Array<{
  total_qty: number;
  unit_price_excl_vat: number;
  unit_vat: number;
  line_total: number;
}>) {
  const subtotal = round2(items.reduce((s, it) => s + n2(it.total_qty) * n2(it.unit_price_excl_vat), 0));
  const vat_amount = round2(items.reduce((s, it) => s + n2(it.total_qty) * n2(it.unit_vat), 0));
  const gross_total = round2(subtotal + vat_amount);
  const total_amount = round2(items.reduce((s, it) => s + n2(it.line_total), 0));
  return { subtotal, vat_amount, gross_total, total_amount };
}
