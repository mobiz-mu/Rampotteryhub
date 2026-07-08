// src/components/print/dotMatrixLayout.ts
//
// Absolute positions (in points, 1in = 72pt) for the RAM POTTERY pre-printed
// continuous stationery. Real paper box is 612pt x 864pt (8.5in x 12in).
//
// Coordinates were derived from the supplied stationery and rescaled from the
// original measurement canvas (661.28 x 907.89pt) onto the real 8.5in x 12in
// paper (scale x=0.9255, y=0.9517). The data-only overlay drops each value into
// the correct blank space. Static label positions are kept too, so
// FULL-TEMPLATE mode can reproduce the form on blank paper.
//
// If a specific printer is a hair off, nudge the constants here (and
// firstRowTop / rowHeight in src/lib/printSettings.ts).

export const DM_PAGE_W = 612; // pt  (8.5in)
export const DM_PAGE_H = 864; // pt  (12in)

export type Align = "left" | "right" | "center";

export type FieldBox = {
  key: string;
  left: number; // pt
  top: number; // pt
  width?: number; // pt (needed for right/center alignment)
  align?: Align;
};

/** Document detail values (right column). */
export const DOC_FIELDS: FieldBox[] = [
  // Slightly up so document details sit better in the pre-printed fields.
  { key: "docNo", left: 399.8, top: 231.5, width: 185, align: "left" },
  { key: "date", left: 399.8, top: 248.7, width: 185, align: "left" },
  { key: "po", left: 399.8, top: 265.8, width: 185, align: "left" },
  { key: "salesRep", left: 399.8, top: 282.9, width: 185, align: "left" },
  { key: "salesRepCell", left: 399.8, top: 300.0, width: 185, align: "left" },
];

/** Customer detail values (left column). */
export const CUSTOMER_FIELDS: FieldBox[] = [
  // Slightly up so customer details align with the printed form rows.
  { key: "name", left: 127.7, top: 231.5, width: 190, align: "left" },
  { key: "address", left: 127.7, top: 248.7, width: 190, align: "left" },
  { key: "cell", left: 127.7, top: 265.8, width: 190, align: "left" },
  { key: "brn", left: 127.7, top: 282.9, width: 190, align: "left" },
  { key: "vat_no", left: 127.7, top: 300.0, width: 190, align: "left" },
];

/** Item table column geometry (value positions). */
export type ItemColumn = {
  key:
    | "sn"
    | "item_code"
    | "qty"
    | "units_per_box"
    | "total_qty"
    | "description"
    | "unit_price_excl_vat"
    | "vat"
    | "unit_price_incl_vat"
    | "total_amount_incl_vat";
  left: number;
  width: number;
  align: Align;
};

export const ITEM_COLUMNS: ItemColumn[] = [
  // Columns are slightly left overall for the pre-printed form.
  { key: "sn", left: 54, width: 22, align: "center" },
  { key: "item_code", left: 76, width: 44, align: "left" },
  { key: "qty", left: 119, width: 24, align: "right" },
  { key: "units_per_box", left: 146, width: 26, align: "right" },

  // Total Qty pulled left to create more breathing space before Description.
  { key: "total_qty", left: 166, width: 30, align: "right" },

  // Description moved right to stop values like "12White..." touching.
  // Width reduced slightly so it does not crash into Unit Price Excl VAT.
  { key: "description", left: 228, width: 108, align: "left" },

  // Better spacing between Description, Unit Excl, VAT and Unit Incl for 11pt Courier.
  { key: "unit_price_excl_vat", left: 346, width: 44, align: "right" },
  { key: "vat", left: 400, width: 38, align: "right" },
  { key: "unit_price_incl_vat", left: 452, width: 52, align: "right" },

  // Total Amount moved left so it does not sit too close to the right border.
  { key: "total_amount_incl_vat", left: 494, width: 72, align: "right" },
];

/**
 * Totals values (right column, right-aligned into the printed boxes).
 *
 * IMPORTANT:
 * Balance Remaining is intentionally NOT printed for Dot Matrix.
 * The pre-printed Balance Remaining box must stay blank.
 */
export const TOTAL_FIELDS: FieldBox[] = [
  // Moved left so totals sit inside the printed value boxes.
  { key: "subtotal", left: 428, top: 596, width: 130, align: "right" },
  { key: "vat", left: 428, top: 617, width: 130, align: "right" },
  { key: "total", left: 428, top: 638, width: 130, align: "right" },
  { key: "previousBalance", left: 428, top: 659, width: 130, align: "right" },
  { key: "grossTotal", left: 428, top: 680, width: 130, align: "right" },
  { key: "amountPaid", left: 428, top: 701, width: 130, align: "right" },

  // Do not print Balance Remaining.
  // { key: "balanceRemaining", left: 428, top: 722, width: 130, align: "right" },
];

/**
 * Signature-area values.
 * Only Prepared by / Delivered by values are printed.
 * The bottom "Customer name" value is intentionally NOT printed.
 */
export const SIGNATURE_FIELDS: FieldBox[] = [
  // Prepared by moved further down and slightly right, closer to the Prepared by area.
  { key: "preparedBy", left: 138, top: 838, width: 155, align: "left" },
  { key: "deliveredBy", left: 316, top: 838, width: 155, align: "left" },
];

/* =====================================================================
   Static labels — rendered ONLY in full-template mode (blank paper).
   Rescaled to the 8.5in x 12in canvas.
   ===================================================================== */

export type StaticLabel = {
  text: string;
  left: number;
  top: number;
  bold?: boolean;
  size?: number;
};

export const STATIC_LABELS: StaticLabel[] = [
  { text: "RAM POTTERY LTD", left: 185.0, top: 106.6, bold: true, size: 16 },
  { text: "MANUFACTURER & IMPORTER OF QUALITY CLAY", left: 211.6, top: 129.4, size: 8 },
  { text: "PRODUCTS AND OTHER RELIGIOUS ITEMS", left: 224.1, top: 138.9, size: 8 },
  { text: "Robert Kennedy Street, Reunion Maurel, Petit Raffray, Mauritius", left: 183.1, top: 149.4, size: 8 },
  { text: "Cell: +230 57788884  +230 58060268  +230 52522844", left: 204.6, top: 158.9, size: 8 },
  { text: "Email: info@rampottery.mu", left: 253.0, top: 168.4, size: 8 },
  { text: "Web: www.rampottery.mu", left: 256.5, top: 177.0, size: 8 },

  { text: "CUSTOMER DETAILS", left: 138.2, top: 221.7, bold: true, size: 9 },
  { text: "BRN: C17144377  -  VAT NO.: 27490894", left: 340.5, top: 221.7, size: 9 },

  { text: "Name:", left: 71.7, top: 238.5 },
  { text: "Address:", left: 71.7, top: 255.7 },
  { text: "Cell:", left: 71.7, top: 272.8 },
  { text: "BRN:", left: 71.7, top: 289.9 },
  { text: "VAT NO:", left: 71.7, top: 307.0 },

  { text: "DOCUMENT NO.:", left: 330.2, top: 238.5 },
  { text: "DATE.:", left: 330.2, top: 255.7 },
  { text: "P.O No.:", left: 330.2, top: 272.8 },
  { text: "Sales Rep:", left: 330.2, top: 289.9 },
  { text: "Cell:", left: 330.2, top: 307.0 },

  // Item table headers (compact)
  { text: "SN", left: 68.5, top: 348.3, size: 7, bold: true },
  { text: "ITEM CODE", left: 87.9, top: 348.3, size: 7, bold: true },
  { text: "QTY", left: 120.3, top: 348.3, size: 7, bold: true },
  { text: "U/BOX", left: 148.1, top: 348.3, size: 7, bold: true },
  { text: "TOT QTY", left: 179.5, top: 348.3, size: 7, bold: true },
  { text: "DESCRIPTION", left: 244.3, top: 348.3, size: 7, bold: true },
  { text: "U.PRICE EXCL", left: 323.9, top: 348.3, size: 7, bold: true },
  { text: "VAT", left: 374.8, top: 348.3, size: 7, bold: true },
  { text: "U.PRICE INCL", left: 407.2, top: 348.3, size: 7, bold: true },
  { text: "TOTAL (INCL)", left: 481.2, top: 348.3, size: 7, bold: true },

  { text: "SUB-TOTAL", left: 368.6, top: 593.8, size: 9 },
  { text: "VAT 15%", left: 368.6, top: 614.8, size: 9 },
  { text: "TOTAL AMOUNT", left: 368.5, top: 635.7, size: 9 },
  { text: "PREVIOUS BALANCE", left: 368.6, top: 656.6, size: 9 },
  { text: "GROSS TOTAL", left: 368.6, top: 676.6, size: 9 },
  { text: "AMOUNT PAID", left: 368.6, top: 697.6, size: 9 },
  { text: "BALANCE REMAINING", left: 368.6, top: 718.5, size: 9 },

  { text: "Prepared by :", left: 100.1, top: 810.8, size: 8 },
  { text: "Delivered by :", left: 282.0, top: 810.8, size: 8 },
  { text: "Customer name :", left: 458.5, top: 810.8, size: 8 },
];

/** Frame boxes drawn only in full-template mode. */
export const FULL_FRAMES = [
  { left: 64.8, top: 237.9, width: 482.2, height: 85.6 }, // details block
  { left: 64.8, top: 334.9, width: 482.2, height: 249.4 }, // items block
  { left: 362.8, top: 588.1, width: 184.2, height: 144.7 }, // totals block
];