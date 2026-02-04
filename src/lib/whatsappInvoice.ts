import { waLink } from "@/lib/whatsapp";

/* =========================
   Helpers
========================= */

function cleanPhone(p: string) {
  return String(p || "").replace(/[^\d]/g, "");
}

function n2(v: any) {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}

function moneyRs(v: any) {
  const n = n2(v);
  return n.toLocaleString("en-MU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Public site url resolver
 * Priority:
 * 1) VITE_PUBLIC_SITE_URL (production)
 * 2) window.location.origin (dev fallback)
 */
export function publicSiteUrl() {
  const envUrl = import.meta?.env?.VITE_PUBLIC_SITE_URL;
  if (envUrl) return String(envUrl).replace(/\/$/, "");

  if (typeof window !== "undefined") return window.location.origin || "";
  return "";
}

/**
 * Build Invoice Print/PDF URL (always absolute when possible)
 */
export function invoicePdfUrl(invoiceId: number | string, baseUrl?: string) {
  const base = (baseUrl || "").trim().replace(/\/$/, "") || publicSiteUrl();
  const path = `/invoices/${invoiceId}/print`;
  return base ? `${base}${path}` : path;
}

/* =========================
   Message builders
========================= */

/**
 * ✅ EXACT format you requested (no emojis, professional)
 */
export function buildInvoiceShareMessage(opts: {
  invoiceNo: string;
  invoiceId: number | string;
  customerName: string;

  total: number;
  paid: number;
  balance: number;

  /** optional fixed domain override */
  baseUrl?: string;

  /** optional company name */
  companyName?: string;
}) {
  const url = invoicePdfUrl(opts.invoiceId, opts.baseUrl);

  return [
    (opts.companyName || "Ram Pottery Ltd").trim(),
    "Invoice details:",
    `Customer: ${String(opts.customerName || "Customer").trim()}`,
    `Invoice: ${String(opts.invoiceNo || `#${opts.invoiceId}`).trim()}`,
    `Invoice Amount: Rs ${moneyRs(opts.total)}`,
    `Amount Paid: Rs ${moneyRs(opts.paid)}`,
    `Amount Due: Rs ${moneyRs(opts.balance)}`,
    `Invoice PDF: ${url}`,
  ].join("\n");
}

/**
 * Optional: if you still want PAID / PARTIAL notification style
 * (kept clean + still includes the PDF link)
 */
export function buildInvoicePaidMessage(opts: {
  invoiceNo: string;
  invoiceId: number | string;
  status: "PAID" | "PARTIALLY_PAID";
  total: number;
  paid: number;
  balance: number;
  customerName?: string;
  baseUrl?: string;
  companyName?: string;
}) {
  const url = invoicePdfUrl(opts.invoiceId, opts.baseUrl);

  const headline =
    opts.status === "PAID"
      ? `Payment received for Invoice ${opts.invoiceNo}`
      : `Partial payment received for Invoice ${opts.invoiceNo}`;

  return [
    (opts.companyName || "Ram Pottery Ltd").trim(),
    headline,
    `Customer: ${String(opts.customerName || "Customer").trim()}`,
    `Invoice Amount: Rs ${moneyRs(opts.total)}`,
    `Amount Paid: Rs ${moneyRs(opts.paid)}`,
    `Amount Due: Rs ${moneyRs(opts.balance)}`,
    `Invoice PDF: ${url}`,
  ].join("\n");
}

/* =========================
   Action
========================= */

export function openWhatsAppToCustomer(opts: { customerPhone: string; message: string }) {
  const phone = cleanPhone(opts.customerPhone);
  if (!phone) throw new Error("Customer phone is missing");
  const href = waLink(phone, opts.message);
  window.open(href, "_blank", "noopener,noreferrer");
}

