import { Router } from "express";
import { supaAdmin } from "../supabaseAdmin";

const r = Router();

function isNumericId(s: string) {
  return /^[0-9]+$/.test(String(s || ""));
}
function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || "").trim());
}

/** GET /api/quotations (admin list) */
r.get("/", async (req, res) => {
  try {
    const supabase = supaAdmin();

    const { data, error } = await supabase
      .from("quotations")
      .select(
        `
        id,
        quotation_number,
        quotation_date,
        status,
        total_amount,
        customer_id,
        customer_name,
        customer_code,
        customers:customer_id ( name, customer_code )
        `
      )
      .order("id", { ascending: false });

    if (error) throw error;

    res.json({ ok: true, quotations: data || [] });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || "Failed to load quotations" });
  }
});

/** GET /api/quotations/:id (admin get by numeric id OR quotation_number) */
r.get("/:id", async (req, res) => {
  try {
    const supabase = supaAdmin();
    const raw = String(req.params.id || "").trim();
    if (!raw) return res.status(400).json({ ok: false, error: "Missing id" });

    let q = supabase
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
        customers:customer_id ( id, name, address, phone, whatsapp, brn, vat_no, customer_code )
        `
      );

    q = isNumericId(raw) ? q.eq("id", Number(raw)) : q.eq("quotation_number", raw);

    const { data: quotation, error: qErr } = await q.maybeSingle();
    if (qErr) throw qErr;
    if (!quotation) return res.status(404).json({ ok: false, error: "Quotation not found" });

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
      .eq("quotation_id", quotation.id)
      .order("id", { ascending: true });

    if (itErr) throw itErr;

    res.json({
      ok: true,
      quotation,
      items: (itemsRaw || []).map((it: any) => ({ ...it, product: it.products ?? null })),
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || "Server error" });
  }
});

/**
 * POST /api/quotations/:id/share
 * body: { expiresInDays?: number, note?: string, rotate?: boolean }
 * returns: { ok:true, token, url }
 */
r.post("/:id/share", async (req, res) => {
  try {
    const supabase = supaAdmin();
    const quotationId = Number(req.params.id);
    if (!quotationId) return res.status(400).json({ ok: false, error: "Invalid id" });

    const expiresInDays = Number(req.body?.expiresInDays || 0);
    const note = req.body?.note ?? null;
    const rotate = req.body?.rotate !== false; // default true

    // Ensure quotation exists
    const { data: qRow, error: qErr } = await supabase
      .from("quotations")
      .select("id, quotation_number")
      .eq("id", quotationId)
      .maybeSingle();

    if (qErr) throw qErr;
    if (!qRow) return res.status(404).json({ ok: false, error: "Quotation not found" });

    // Rotate = revoke previous active tokens (optional)
    if (rotate) {
      await supabase
        .from("quotation_public_links")
        .update({ revoked_at: new Date().toISOString() })
        .eq("quotation_id", quotationId)
        .is("revoked_at", null);
    }

    const expires_at =
      expiresInDays > 0 ? new Date(Date.now() + expiresInDays * 86400_000).toISOString() : null;

    const { data: link, error: linkErr } = await supabase
      .from("quotation_public_links")
      .insert({ quotation_id: quotationId, expires_at, note })
      .select("token")
      .single();

    if (linkErr) throw linkErr;

    const token = String((link as any)?.token || "").trim();
    if (!isUuid(token)) throw new Error("Failed to generate token");

    const url = `/quotations/${quotationId}/print?t=${encodeURIComponent(token)}`;

    res.json({ ok: true, token, url });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || "Failed to create share link" });
  }
});

export default r;

