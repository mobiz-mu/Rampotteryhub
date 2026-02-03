import { waLink } from "@/lib/whatsapp";

function cleanPhone(p: string) {
  return String(p || "").replace(/[^\d]/g, "");
}

export function invoicePdfUrl(invoiceId: number | string) {
  // This is your existing print page.
  // If you later generate a real PDF file, replace this with the Storage PDF URL.
  return `${window.location.origin}/invoices/${invoiceId}/print`;
}

export function buildInvoicePaidMessage(opts: {
  invoiceNo: string;
  invoiceId: number | string;
  status: "PAID" | "PARTIALLY_PAID";
  total: number;
  paid: number;
  balance: number;
}) {
  const url = invoicePdfUrl(opts.invoiceId);

  const line1 =
    opts.status === "PAID"
      ? `✅ Payment received for Invoice ${opts.invoiceNo}`
      : `🟡 Partial payment received for Invoice ${opts.invoiceNo}`;

  return (
    `${line1}\n` +
    `Total: Rs ${Number(opts.total || 0).toFixed(2)}\n` +
    `Paid: Rs ${Number(opts.paid || 0).toFixed(2)}\n` +
    `Balance: Rs ${Number(opts.balance || 0).toFixed(2)}\n\n` +
    `Download / View PDF:\n${url}\n\n` +
    `Thank you.`
  );
}

export function openWhatsAppToCustomer(opts: {
  customerPhone: string;
  message: string;
}) {
  const phone = cleanPhone(opts.customerPhone);
  if (!phone) throw new Error("Customer phone is missing");
  const href = waLink(phone, opts.message);
  window.open(href, "_blank", "noopener,noreferrer");
}
