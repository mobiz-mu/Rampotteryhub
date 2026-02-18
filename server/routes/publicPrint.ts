// server/routes/publicPrint.ts
import express from "express";
import { supaAdmin } from "../supabaseAdmin.js";

const router = express.Router();

/* =========================
   helpers
========================= */
function num(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function str(v: any) {
  return String(v ?? "").trim();
}
function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}
function nowISO() {
  return new Date().toISOString();
}
function deny(res: express.Response) {
  // 404 on purpose (do not leak whether invoice exists)
  return res.status(404).json({ ok: false, error: "Not found / invalid link" });
}
function isUuidCastError(err: any) {
  const msg = String(err?.message || "").toLowerCase();
  // postgres: invalid input syntax for type uuid
  return msg.includes("invalid input syntax") && msg.includes("uuid");
}

/* =========================
   GET /api/public/invoice-print?id=48&t=<uuid>
========================= */
router.get("/invoice-print", async (req, res) => {
  const invoiceId = num(req.query.id);
  const token = str(req.query.t);

  if (!invoiceId || !token) return deny(res);
  if (!isUuid(token)) return deny(res);

  try {
    const supabase = supaAdmin();

    // 1) Invoice (validate token + not revoked + not expired)
    const { data: inv, error: invErr } = await supabase
      .from("invoices")
      .select(
        `
        id,
        invoice_number,
        customer_id,
        invoice_date,
        due_date,
        purchase_order_no,
        sales_rep,
        sales_rep_phone,

        subtotal,
        vat_percent,
        vat_amount,
        total_amount,
        gross_total,

        previous_balance,
        amount_paid,
        balance_remaining,

        status,

        public_token,
        public_token_revoked,
        public_token_expires_at
      `
      )
      .eq("id", invoiceId)
      .eq("public_token", token)
      .maybeSingle();

    if (invErr) {
      if (isUuidCastError(invErr)) return deny(res);
      throw invErr;
    }
    if (!inv) return deny(res);

    // optional: block draft links publicly
    // if (String(inv.status).toUpperCase() === "DRAFT") return deny(res);

    if (inv.public_token_revoked) return deny(res);
    if (inv.public_token_expires_at && new Date(inv.public_token_expires_at).getTime() < Date.now()) return deny(res);

    // 2) Items (+ product)
    const { data: itemsRaw, error: itErr } = await supabase
      .from("invoice_items")
      .select(
        `
        id,
        invoice_id,
        product_id,
        description,
        uom,
        units_per_box,
        total_qty,
        pcs_qty,
        unit_price_excl_vat,
        unit_vat,
        unit_price_incl_vat,
        line_total,
        vat_rate,
        products:product_id (
          id,
          name,
          item_code,
          sku
        )
      `
      )
      .eq("invoice_id", invoiceId)
      .order("id", { ascending: true });

    if (itErr) throw itErr;

    const items = (itemsRaw || []).map((it: any) => ({
      id: it.id,
      invoice_id: it.invoice_id,
      product_id: it.product_id,
      description: it.description,
      uom: it.uom,
      units_per_box: it.units_per_box,
      total_qty: it.total_qty,
      pcs_qty: it.pcs_qty,
      unit_price_excl_vat: it.unit_price_excl_vat,
      unit_vat: it.unit_vat,
      unit_price_incl_vat: it.unit_price_incl_vat,
      line_total: it.line_total,
      vat_rate: it.vat_rate,
      product: it.products || null,
    }));

    // 3) Customer
    const { data: customer, error: cErr } = await supabase
      .from("customers")
      .select("id, name, address, phone, whatsapp, brn, vat_no, customer_code")
      .eq("id", inv.customer_id)
      .maybeSingle();

    if (cErr) throw cErr;

    return res.json({
      ok: true,
      server_time: nowISO(),
      invoice: inv,
      customer: customer || null,
      items,
    });
  } catch (e: any) {
    console.error("public invoice-print error:", e?.message || e);
    return res.status(500).json({ ok: false, error: e?.message || "Server error" });
  }
});

/* =========================
   CREDIT NOTE PUBLIC PRINT
   Only if credit_notes has public_token columns
========================= */
router.get("/credit-note-print", async (req, res) => {
  const creditNoteId = num(req.query.id);
  const token = str(req.query.t);

  if (!creditNoteId || !token) return deny(res);
  if (!isUuid(token)) return deny(res);

  try {
    const supabase = supaAdmin();

    const { data: cn, error: cnErr } = await supabase
      .from("credit_notes")
      .select(
        `
        id,
        credit_note_number,
        credit_note_date,
        invoice_id,
        customer_id,
        reason,
        subtotal,
        vat_amount,
        total_amount,
        status,
        created_at,
        public_token,
        public_token_revoked,
        public_token_expires_at
      `
      )
      .eq("id", creditNoteId)
      .eq("public_token", token)
      .maybeSingle();

    if (cnErr) {
      if (isUuidCastError(cnErr)) return deny(res);
      throw cnErr;
    }
    if (!cn) return deny(res);

    if (cn.public_token_revoked) return deny(res);
    if (cn.public_token_expires_at && new Date(cn.public_token_expires_at).getTime() < Date.now()) return deny(res);

    const { data: itemsRaw, error: itErr } = await supabase
      .from("credit_note_items")
      .select(
        `
        id,
        credit_note_id,
        product_id,
        description,
        total_qty,
        unit_price_excl_vat,
        unit_vat,
        unit_price_incl_vat,
        line_total,
        products:product_id ( id, name, item_code, sku )
      `
      )
      .eq("credit_note_id", creditNoteId)
      .order("id", { ascending: true });

    if (itErr) throw itErr;

    const items = (itemsRaw || []).map((it: any) => ({
      id: it.id,
      credit_note_id: it.credit_note_id,
      product_id: it.product_id,
      description: it.description,
      total_qty: it.total_qty,
      unit_price_excl_vat: it.unit_price_excl_vat,
      unit_vat: it.unit_vat,
      unit_price_incl_vat: it.unit_price_incl_vat,
      line_total: it.line_total,
      product: it.products || null,
    }));

    const { data: customer, error: cErr } = await supabase
      .from("customers")
      .select("id, name, address, phone, whatsapp, brn, vat_no, customer_code")
      .eq("id", cn.customer_id)
      .maybeSingle();

    if (cErr) throw cErr;

    return res.json({
      ok: true,
      server_time: nowISO(),
      credit_note: cn,
      customer: customer || null,
      items,
    });
  } catch (e: any) {
    console.error("public credit-note-print error:", e?.message || e);
    return res.status(500).json({ ok: false, error: e?.message || "Server error" });
  }
});

export default router;

