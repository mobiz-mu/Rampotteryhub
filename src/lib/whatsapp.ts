// src/lib/whatsapp.ts

/* =========================
   WhatsApp helpers
========================= */

/**
 * Build a WhatsApp click-to-chat link
 * - Cleans phone number to digits only
 * - Encodes message safely
 */
export function waLink(phone: string, message: string) {
  const digits = String(phone || "").replace(/[^\d]/g, "");
  const base = `https://wa.me/${digits}`;
  return `${base}?text=${encodeURIComponent(message || "")}`;
}

/**
 * Safe origin resolver (works in Vite + Vercel)
 */
export function currentOrigin() {
  if (typeof window === "undefined") return ""; // SSR / build-safe
  return window.location.origin || "";
}

/**
 * Build a print URL (prefers absolute url when possible)
 */
function printUrl(path: string) {
  const base = currentOrigin();
  return base ? `${base}${path}` : path;
}

/* =========================
   Message builders
========================= */

/**
 * Invoice share message (WhatsApp-friendly)
 */
export function invoiceShareMessage(opts: { invoiceNo: string; invoiceId: string | number }) {
  const url = printUrl(`/invoices/${opts.invoiceId}/print`);

  return [
    "🧾 *Ram Pottery Hub*",
    "",
    `Invoice No: *${opts.invoiceNo}*`,
    "",
    "View / Print Invoice:",
    url,
  ].join("\n");
}

/**
 * Quotation share message (WhatsApp-friendly)
 */
export function quotationShareMessage(opts: {
  quotationNo?: string | null;
  quotationId: string | number;
  customerName?: string | null;
}) {
  const no = (opts.quotationNo || `#${opts.quotationId}`).toString();
  const cust = String(opts.customerName || "").trim();
  const url = printUrl(`/quotations/${opts.quotationId}/print`);

  return [
    "📄 *Ram Pottery Hub*",
    "",
    `Quotation No: *${no}*${cust ? `  (${cust})` : ""}`,
    "",
    "View / Print Quotation:",
    url,
  ].join("\n");
}

/**
 * (Optional) Credit Note share message
 * If you already have credit notes print routes.
 */
export function creditNoteShareMessage(opts: { creditNoteNo: string; creditNoteId: string | number }) {
  const url = printUrl(`/credit-notes/${opts.creditNoteId}/print`);

  return [
    "🧾 *Ram Pottery Hub*",
    "",
    `Credit Note No: *${opts.creditNoteNo}*`,
    "",
    "View / Print Credit Note:",
    url,
  ].join("\n");
}
