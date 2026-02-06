import { supabase } from "@/integrations/supabase/client";

export async function rotateInvoicePublicToken(invoiceId: number, extendDays?: number) {
  const { data, error } = await supabase.rpc("rotate_invoice_public_token", {
    p_invoice_id: invoiceId,
    p_extend_days: extendDays ?? null,
  });
  if (error) throw error;

  // data is array because RETURNS TABLE
  const row = Array.isArray(data) ? data[0] : data;
  return row as { public_token: string; public_token_rotated_at: string; public_token_expires_at: string | null };
}

export function buildPublicInvoicePrintLink(invoiceId: number, token: string) {
  const origin = window.location.origin; // works on localhost + vercel
  return `${origin}/invoices/${invoiceId}/print?t=${encodeURIComponent(token)}`;
}
