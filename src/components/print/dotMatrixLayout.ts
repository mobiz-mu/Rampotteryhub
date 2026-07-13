// src/components/print/dotMatrixLayout.ts
//
// Absolute positions (in points, 1in = 72pt) for the RAM POTTERY pre-printed
// continuous stationery. Real paper box is 612pt x 864pt (8.5in x 12in).
//
// Reworked from the physical printed test page + handwritten measurements.
// Dot Matrix remains DATA-ONLY: values only, no boxes/labels/headers.
//
// Important:
// - Paper: 8.5in x 12in
// - Font: 11pt Courier New
// - Rows per page: controlled in src/lib/printSettings.ts
// - Balance Remaining is intentionally blank in Dot Matrix.

export const DM_PAGE_W = 612; // pt  (8.5in)
export const DM_PAGE_H = 864; // pt  (12in)

export type Align = "left" | "right" | "center";

export type FieldBox = {
  key: string;
  left: number; // pt
  top: number; // pt
  width?: number; // pt
  align?: Align;
};

/** Document detail values - right customer/document block. */
export const DOC_FIELDS: FieldBox[] = [
  // Kept slightly high to match the pre-printed document fields.
  { key: "docNo", left: 397, top: 231.5, width: 175, align: "left" },
  { key: "date", left: 397, top: 248.7, width: 175, align: "left" },
  { key: "po", left: 397, top: 265.8, width: 175, align: "left" },
  { key: "salesRep", left: 397, top: 282.9, width: 175, align: "left" },
  { key: "salesRepCell", left: 397, top: 300.0, width: 175, align: "left" },
];

/** Customer detail values - left customer block. */
export const CUSTOMER_FIELDS: FieldBox[] = [
  // Left value start aligned with the printed customer box.
  { key: "name", left: 126, top: 231.5, width: 220, align: "left" },
  { key: "address", left: 126, top: 248.7, width: 220, align: "left" },
  { key: "cell", left: 126, top: 265.8, width: 220, align: "left" },
  { key: "brn", left: 126, top: 282.9, width: 220, align: "left" },
  { key: "vat_no", left: 126, top: 300.0, width: 220, align: "left" },
];

/** Item table column geometry. */
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
  /*
    Column calibration from the marked paper:
    SN ≈ 0.8cm
    Item Code ≈ 1.4cm
    Qty ≈ 1.0cm
    Unit Per Box ≈ 1.2cm
    Total Qty ≈ 1.5cm
    Description ≈ 3.9cm
    Unit Price Excl ≈ 1.7cm
    VAT ≈ 1.4cm
    Unit Price Incl ≈ 2.3cm
    Total Amount ≈ 3.0cm

    Values are placed inside each printed box with safe spacing.
  */

  { key: "sn", left: 52, width: 22, align: "center" },
  { key: "item_code", left: 75, width: 42, align: "left" },
  { key: "qty", left: 116, width: 26, align: "right" },
  { key: "units_per_box", left: 145, width: 32, align: "right" },

  // Pulled left to create clear space before Description.
  { key: "total_qty", left: 174, width: 36, align: "right" },

  // Starts later than Total Qty, but is clipped before Unit Price.
  { key: "description", left: 222, width: 104, align: "left" },

  // Price/VAT columns re-spaced so values no longer touch.
  { key: "unit_price_excl_vat", left: 333, width: 48, align: "right" },
  { key: "vat", left: 386, width: 40, align: "right" },
  { key: "unit_price_incl_vat", left: 431, width: 66, align: "right" },

  // Moved left so it stays inside the Total Amount box.
  { key: "total_amount_incl_vat", left: 492, width: 72, align: "right" },
];

/**
 * Totals values.
 *
 * Balance Remaining is intentionally NOT printed.
 * The printed Balance Remaining box must remain blank.
 */
export const TOTAL_FIELDS: FieldBox[] = [
  // Moved left from previous version so values sit inside the amount boxes.
  { key: "subtotal", left: 408, top: 596, width: 130, align: "right" },
  { key: "vat", left: 408, top: 617, width: 130, align: "right" },
  { key: "total", left: 408, top: 638, width: 130, align: "right" },
  { key: "previousBalance", left: 408, top: 659, width: 130, align: "right" },
  { key: "grossTotal", left: 408, top: 680, width: 130, align: "right" },
  { key: "amountPaid", left: 408, top: 701, width: 130, align: "right" },

  // Do not print this in Dot Matrix.
  // { key: "balanceRemaining", left: 408, top: 722, width: 130, align: "right" },
];

/**
 * Signature-area values.
 * Prepared By is printed beside the pre-printed "Prepared by:" label.
 * Customer name is intentionally NOT printed at the bottom.
 */
export const SIGNATURE_FIELDS: FieldBox[] = [
  { key: "preparedBy", left: 148, top: 842, width: 145, align: "left" },
  { key: "deliveredBy", left: 330, top: 842, width: 145, align: "left" },
];

/* =====================================================================
   Static labels — rendered ONLY in full-template mode on blank paper.
   These do not affect normal Dot Matrix data-only print.
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
  { left: 64.8, top: 237.9, width: 482.2, height: 85.6 },
  { left: 64.8, top: 334.9, width: 482.2, height: 249.4 },
  { left: 362.8, top: 588.1, width: 184.2, height: 144.7 },
];