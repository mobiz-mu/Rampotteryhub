// src/lib/invoiceTotals.ts
// Selling price in products = EXCL VAT (per your DB)

export function round2(n: number) {
  return Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
}

function n2(v: any) {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}

function int0(v: any) {
  // safe integer >= 0
  const x = Math.trunc(n2(v));
  return x < 0 ? 0 : x;
}

/**
 * Calculates a single invoice line.
 * - product.selling_price is EXCL VAT
 * - vatRate is % e.g. 15
 * - total_qty = box_qty * units_per_box + pcs_qty
 * - line_total is INCL VAT
 */
export function calcLine(params: {
  boxQty: number;
  pcsQty: number;
  unitsPerBox: number;
  sellingPriceExclVat: number; // ✅ product.selling_price is EXCL VAT
  vatRate: number; // e.g. 15
}) {
  const boxQty = int0(params.boxQty);
  const pcsQty = int0(params.pcsQty);

  // IMPORTANT:
  // If user uses BOX, unitsPerBox must be >= 1.
  // If user uses PCS only, unitsPerBox doesn't matter much, but keep it >= 1 anyway.
  const unitsPerBox = Math.max(1, int0(params.unitsPerBox));

  const totalQty = int0(boxQty * unitsPerBox + pcsQty);

  const unitExcl = round2(n2(params.sellingPriceExclVat));
  const vatRate = n2(params.vatRate);

  const unitVat = vatRate > 0 ? round2((unitExcl * vatRate) / 100) : 0;
  const unitIncl = round2(unitExcl + unitVat);

  const lineTotal = round2(totalQty * unitIncl);

  return {
    box_qty: boxQty,
    pcs_qty: pcsQty,
    units_per_box: unitsPerBox,
    total_qty: totalQty,

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
 * - total_amount = sum(line_total)  (best, because it's the real incl VAT per line)
 */
export function calcInvoiceTotalsFromItems(items: Array<{
  total_qty: number;
  unit_price_excl_vat: number;
  unit_vat: number;
  line_total: number;
}>) {
  const subtotal = round2(
    items.reduce((s, it) => s + round2(n2(it.total_qty)) * round2(n2(it.unit_price_excl_vat)), 0)
  );

  const vat_amount = round2(
    items.reduce((s, it) => s + round2(n2(it.total_qty)) * round2(n2(it.unit_vat)), 0)
  );

  const gross_total = round2(subtotal + vat_amount);

  const total_amount = round2(items.reduce((s, it) => s + round2(n2(it.line_total)), 0));

  return { subtotal, vat_amount, gross_total, total_amount };
}
