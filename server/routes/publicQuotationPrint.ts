// server/routes/publicQuotationPrint.ts
import { Router } from "express";
import { supaAdmin } from "../supabaseAdmin.js";

const r = Router();

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || "").trim());
}

function isNumericId(s: string) {
  return /^[0-9]+$/.test(String(s || ""));
}

function nowIso() {
  return new Date().toISOString();
}

/**
 * GET /api/public/quotation-print?id=123&t=UUID
 * Returns: { ok:true, quotation, customer, items, server_time }
 */
r.get("/quotation-print", async (req, res) => {
  try {
    const supabase = supaAdmin();

    const rawId = String(req.query.id || "").trim();
    const token = String(req.query.t || "").trim();

    if (!rawId) return res.status(400).json({ ok: false, error: "Missing id" });
    if (!isNumericId(rawId)) return res.status(400).json({ ok: false, error: "Invalid id" });

    const quotationId = Number(rawId);
    if (!Number.isFinite(quotationId) || quotationId <= 0) {
      return res.status(400).json({ ok: false, error: "Invalid id" });
    }

    if (!isUuid(token)) {
      // Match your pattern: invalid token behaves like not found
      return res.status(404).json({ ok: false, error: "Not found / invalid link" });
    }

    // 1) Validate token (exists, not revoked, not expired, matches quotation)
    const { data: link, error: linkErr } = await supabase
      .from("quotation_public_links")
      .select("id, quotation_id, expires_at, revoked_at")
      .eq("token", token)
      .maybeSingle();

    if (linkErr) throw linkErr;

    if (!link || Number(link.quotation_id) !== quotationId) {
      return res.status(404).json({ ok: false, error: "Not found / invalid link" });
    }

    if (link.revoked_at) {
      return res.status(404).json({ ok: false, error: "Link revoked" });
    }

    if (link.expires_at) {
      const exp = new Date(link.expires_at).getTime();
      if (Number.isFinite(exp) && Date.now() > exp) {
        return res.status(404).json({ ok: false, error: "Link expired" });
      }
    }

    // 2) Load quotation header + customer
    const { data: quotation, error: qErr } = await supabase
      .from("quotations")
      .select(
        `
        id,
        quotation_number,
        quotation_date,
        valid_until,
        status,
        customer_id,
        customer_name,
        customer_code,
        sales_rep,
        sales_rep_phone,
        notes,
        subtotal,
        discount_percent,
        discount_amount,
        vat_percent,
        vat_amount,
        total_amount,
        created_at,
        converted_invoice_id,
        converted_at,
        customers:customer_id (
          id,
          name,
          address,
          phone,
          whatsapp,
          brn,
          vat_no,
          customer_code
        )
      `
      )
      .eq("id", quotationId)
      .maybeSingle();

    if (qErr) throw qErr;
    if (!quotation) return res.status(404).json({ ok: false, error: "Not found / invalid link" });

    // 3) Load items (+ product)
    const { data: itemsRaw, error: itErr } = await supabase
      .from("quotation_items")
      .select(
        `
        id,
        quotation_id,
        product_id,
        description,
        uom,
        box_qty,
        units_per_box,
        total_qty,
        unit_price_excl_vat,
        unit_vat,
        unit_price_incl_vat,
        line_total,
        products:product_id ( id, item_code, sku, name, units_per_box )
      `
      )
      .eq("quotation_id", quotationId)
      .order("id", { ascending: true });

    if (itErr) throw itErr;

    const items = (itemsRaw || []).map((it: any) => ({ ...it, product: it.products ?? null }));

    res.json({
      ok: true,
      server_time: nowIso(),
      quotation,
      customer: (quotation as any).customers ?? null,
      items,
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || "Server error" });
  }
});

export default r;


