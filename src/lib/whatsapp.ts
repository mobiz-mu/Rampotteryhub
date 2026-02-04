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
 * Resolve PUBLIC site URL (production-safe)
 * Priority:
 * 1) VITE_PUBLIC_SITE_URL
 * 2) window.location.origin (dev fallback)
 */
export function publicSiteUrl() {
  const envUrl = import.meta?.env?.VITE_PUBLIC_SITE_URL;
  if (envUrl) return String(envUrl).replace(/\/$/, "");

  if (typeof window !== "undefined") return window.location.origin || "";
  return "";
}

/**
 * Build a print URL (ALWAYS absolute when possible)
 * - baseUrl overrides everything
 * - otherwise uses VITE_PUBLIC_SITE_URL
 */
function printUrl(path: string, baseUrl?: string) {
  const base =
    (baseUrl || "").trim().replace(/\/$/, "") ||
    publicSiteUrl();

  return base ? `${base}${path}` : path;
}

/* =========================
   Formatting helpers
========================= */

function n2(v: any) {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}

/** Rs 1,400.00 */
function moneyRs(v: any) {
  const n = n2(v);
  return n.toLocaleString("en-MU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* =========================
   Message builders
========================= */

/**
 * ✅ Invoice share message (Professional / accountant style)
 *
 * Example:
 * Ram Pottery Ltd
 * Invoice details:
 * Customer: Mobiz.mu
 * Invoice: RP-0030
 * Invoice Amount: Rs 1,400.00
 * Amount Paid: Rs 1,400.00
 * Amount Due: Rs 0.00
 * Invoice PDF: http://rampotteryhub.com/invoices/37/print
 */
export function invoiceShareMessage(opts: {
  companyName?: string;
  customerName?: string | null;
  invoiceNo: string;
  invoiceId: string | number;

  invoiceAmount?: number | string | null;
  amountPaid?: number | string | null;
  amountDue?: number | string | null;

  /** Optional override if you want a fixed domain in production */
  baseUrl?: string;
}) {
  const company = (opts.companyName || "Ram Pottery Ltd").trim();
  const customer = String(opts.customerName || "").trim() || "Customer";
  const invoiceNo = String(opts.invoiceNo || "").trim() || `#${opts.invoiceId}`;
  const url = printUrl(`/invoices/${opts.invoiceId}/print`, opts.baseUrl);

  const invoiceAmount = moneyRs(opts.invoiceAmount);
  const amountPaid = moneyRs(opts.amountPaid);
  const amountDue = moneyRs(opts.amountDue);

  return [
    company,
    "Invoice details:",
    `Customer: ${customer}`,
    `Invoice: ${invoiceNo}`,
    `Invoice Amount: Rs ${invoiceAmount}`,
    `Amount Paid: Rs ${amountPaid}`,
    `Amount Due: Rs ${amountDue}`,
    `Invoice PDF: ${url}`,
  ].join("\n");
}

/**
 * Quotation share message (clean / premium)
 */
export function quotationShareMessage(opts: {
  companyName?: string;
  quotationNo?: string | null;
  quotationId: string | number;
  customerName?: string | null;
  baseUrl?: string;
}) {
  const company = (opts.companyName || "Ram Pottery Ltd").trim();
  const no = (opts.quotationNo || `#${opts.quotationId}`).toString();
  const cust = String(opts.customerName || "").trim();
  const url = printUrl(`/quotations/${opts.quotationId}/print`, opts.baseUrl);

  return [
    company,
    "Quotation details:",
    `Customer: ${cust || "Customer"}`,
    `Quotation: ${no}`,
    `Quotation PDF: ${url}`,
  ].join("\n");
}

/**
 * Credit Note share message (clean / premium)
 */
export function creditNoteShareMessage(opts: {
  companyName?: string;
  creditNoteNo: string;
  creditNoteId: string | number;
  customerName?: string | null;
  baseUrl?: string;
}) {
  const company = (opts.companyName || "Ram Pottery Ltd").trim();
  const cust = String(opts.customerName || "").trim();
  const no = String(opts.creditNoteNo || "").trim() || `#${opts.creditNoteId}`;
  const url = printUrl(`/credit-notes/${opts.creditNoteId}/print`, opts.baseUrl);

  return [
    company,
    "Credit Note details:",
    `Customer: ${cust || "Customer"}`,
    `Credit Note: ${no}`,
    `Credit Note PDF: ${url}`,
  ].join("\n");
}
