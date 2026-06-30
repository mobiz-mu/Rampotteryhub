// src/components/print/dotMatrixLayout.ts
//
// Absolute positions (in points, 1in = 72pt) for the RAM POTTERY pre-printed
// continuous stationery. Page box is 661.28pt x 907.89pt (9.18in x 12.61in).
//
// Coordinates were measured directly from the supplied stationery PDF so the
// data-only overlay drops each value into the correct blank space. Static
// label positions are kept too, so FULL-TEMPLATE mode can reproduce the form
// on blank paper.

export const DM_PAGE_W = 661.28; // pt
export const DM_PAGE_H = 907.89; // pt

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
  { key: "docNo", left: 432, top: 258, width: 200, align: "left" },
  { key: "date", left: 432, top: 276, width: 200, align: "left" },
  { key: "po", left: 432, top: 294, width: 200, align: "left" },
  { key: "salesRep", left: 432, top: 312, width: 200, align: "left" },
  { key: "salesRepCell", left: 432, top: 330, width: 200, align: "left" },
];

/** Customer detail values (left column). */
export const CUSTOMER_FIELDS: FieldBox[] = [
  { key: "name", left: 138, top: 258, width: 205, align: "left" },
  { key: "address", left: 138, top: 276, width: 205, align: "left" },
  { key: "cell", left: 138, top: 294, width: 205, align: "left" },
  { key: "brn", left: 138, top: 312, width: 205, align: "left" },
  { key: "vat_no", left: 138, top: 330, width: 205, align: "left" },
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
  { key: "sn", left: 72, width: 22, align: "center" },
  { key: "item_code", left: 95, width: 42, align: "left" },
  { key: "qty", left: 130, width: 30, align: "right" },
  { key: "units_per_box", left: 162, width: 30, align: "right" },
  { key: "total_qty", left: 196, width: 32, align: "right" },
  { key: "description", left: 234, width: 114, align: "left" },
  { key: "unit_price_excl_vat", left: 350, width: 50, align: "right" },
  { key: "vat", left: 402, width: 34, align: "right" },
  { key: "unit_price_incl_vat", left: 440, width: 58, align: "right" },
  { key: "total_amount_incl_vat", left: 502, width: 96, align: "right" },
];

/** Totals values (right column, right-aligned into the printed boxes). */
export const TOTAL_FIELDS: FieldBox[] = [
  { key: "subtotal", left: 498, top: 624, width: 132, align: "right" },
  { key: "vat", left: 498, top: 646, width: 132, align: "right" },
  { key: "total", left: 498, top: 668, width: 132, align: "right" },
  { key: "previousBalance", left: 498, top: 690, width: 132, align: "right" },
  { key: "grossTotal", left: 498, top: 711, width: 132, align: "right" },
  { key: "amountPaid", left: 498, top: 733, width: 132, align: "right" },
  { key: "balanceRemaining", left: 498, top: 755, width: 132, align: "right" },
];

/** Signature-area values. */
export const SIGNATURE_FIELDS: FieldBox[] = [
  { key: "preparedBy", left: 165, top: 850, width: 120, align: "left" },
  { key: "deliveredBy", left: 362, top: 850, width: 120, align: "left" },
  { key: "customerName", left: 500, top: 866, width: 130, align: "left" },
];

/* =====================================================================
   Static labels — rendered ONLY in full-template mode (blank paper).
   Measured from the same stationery PDF.
   ===================================================================== */

export type StaticLabel = { text: string; left: number; top: number; bold?: boolean; size?: number };

export const STATIC_LABELS: StaticLabel[] = [
  { text: "RAM POTTERY LTD", left: 199.8, top: 112, bold: true, size: 16 },
  { text: "MANUFACTURER & IMPORTER OF QUALITY CLAY", left: 228.6, top: 136, size: 8 },
  { text: "PRODUCTS AND OTHER RELIGIOUS ITEMS", left: 242.1, top: 146, size: 8 },
  { text: "Robert Kennedy Street, Reunion Maurel, Petit Raffray, Mauritius", left: 197.8, top: 157, size: 8 },
  { text: "Cell: +230 57788884  +230 58060268  +230 52522844", left: 221, top: 167, size: 8 },
  { text: "Email: info@rampottery.mu", left: 273.3, top: 177, size: 8 },
  { text: "Web: www.rampottery.mu", left: 277.1, top: 186, size: 8 },

  { text: "CUSTOMER DETAILS", left: 149.3, top: 233, bold: true, size: 9 },
  { text: "BRN: C17144377  -  VAT NO.: 27490894", left: 367.9, top: 233, size: 9 },

  { text: "Name:", left: 77.5, top: 258 },
  { text: "Address:", left: 77.5, top: 276 },
  { text: "Cell:", left: 77.5, top: 294 },
  { text: "BRN:", left: 77.5, top: 312 },
  { text: "VAT NO:", left: 77.5, top: 330 },

  { text: "DOCUMENT NO.:", left: 356.8, top: 258 },
  { text: "DATE.:", left: 356.8, top: 276 },
  { text: "P.O No.:", left: 356.8, top: 294 },
  { text: "Sales Rep:", left: 356.8, top: 312 },
  { text: "Cell:", left: 356.8, top: 330 },

  // Item table headers (compact)
  { text: "SN", left: 74, top: 366, size: 7, bold: true },
  { text: "ITEM CODE", left: 95, top: 366, size: 7, bold: true },
  { text: "QTY", left: 130, top: 366, size: 7, bold: true },
  { text: "U/BOX", left: 160, top: 366, size: 7, bold: true },
  { text: "TOT QTY", left: 194, top: 366, size: 7, bold: true },
  { text: "DESCRIPTION", left: 264, top: 366, size: 7, bold: true },
  { text: "U.PRICE EXCL", left: 350, top: 366, size: 7, bold: true },
  { text: "VAT", left: 405, top: 366, size: 7, bold: true },
  { text: "U.PRICE INCL", left: 440, top: 366, size: 7, bold: true },
  { text: "TOTAL (INCL)", left: 520, top: 366, size: 7, bold: true },

  { text: "SUB-TOTAL", left: 398.3, top: 624, size: 9 },
  { text: "VAT 15%", left: 398.3, top: 646, size: 9 },
  { text: "TOTAL AMOUNT", left: 398.2, top: 668, size: 9 },
  { text: "PREVIOUS BALANCE", left: 398.3, top: 690, size: 9 },
  { text: "GROSS TOTAL", left: 398.3, top: 711, size: 9 },
  { text: "AMOUNT PAID", left: 398.3, top: 733, size: 9 },
  { text: "BALANCE REMAINING", left: 398.3, top: 755, size: 9 },

  { text: "Prepared by :", left: 108.2, top: 852, size: 8 },
  { text: "Delivered by :", left: 304.7, top: 852, size: 8 },
  { text: "Customer name :", left: 495.3, top: 852, size: 8 },
];

/** Frame boxes drawn only in full-template mode. */
export const FULL_FRAMES = [
  { left: 70, top: 250, width: 521, height: 90 }, // details block
  { left: 70, top: 352, width: 521, height: 262 }, // items block
  { left: 392, top: 618, width: 199, height: 152 }, // totals block
];
