import { Router } from "express";
import { supaAdmin } from "../supabaseAdmin";

const r = Router();

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || "").trim());
}

async function safeJson(res: any) {
  return res;
}

/** GET /api/public/credit-note-print?id=9&t=UUID */
r.get("/credit-note-print", async (req, res) => {
  try {
    const supabase = supaAdmin();

    const idRaw = String(req.query.id || "").trim();
    const t = String(req.query.t || "").trim();

    const cnId = Number(idRaw);
    if (!Number.isFinite(cnId) || cnId <= 0) {
      return res.status(400).json({ ok: false, error: "Invalid id" });
    }
    if (!isUuid(t)) {
      return res.status(404).json({ ok: false, error: "Not found / invalid link" });
    }

    // validate token exists + not revoked
    const { data: link, error: linkErr } = await supabase
      .from("credit_note_public_links")
      .select("credit_note_id, revoked_at")
      .eq("credit_note_id", cnId)
      .eq("token", t)
      .maybeSingle();

    if (linkErr) throw linkErr;
    if (!link || link.revoked_at) {
      return res.status(404).json({ ok: false, error: "Not found / invalid link" });
    }

    // load credit note
    const { data: credit_note, error: cnErr } = await supabase
      .from("credit_notes")
      .select(
        `
        id,
        credit_note_number,
        credit_note_date,
        customer_id,
        invoice_id,
        reason,
        subtotal,
        vat_amount,
        total_amount,
        status,
        created_at
      `
      )
      .eq("id", cnId)
      .single();

    if (cnErr) throw cnErr;
    if (!credit_note) return res.status(404).json({ ok: false, error: "Not found / invalid link" });

    // items (+ product)
    const { data: itemsRaw, error: itErr } = await supabase
      .from("credit_note_items")
      .select(
        `
        id,
        product_id,
        total_qty,
        unit_price_excl_vat,
        unit_vat,
        unit_price_incl_vat,
        line_total,
        products:product_id ( id, item_code, sku, name )
      `
      )
      .eq("credit_note_id", cnId)
      .order("id", { ascending: true });

    if (itErr) throw itErr;

    const items = (itemsRaw || []).map((it: any) => ({
      ...it,
      product: it.products ?? null,
    }));

    // customer
    let customer = null as any;
    if (credit_note.customer_id) {
      const { data: c, error: cErr } = await supabase
        .from("customers")
        .select("id,name,address,phone,whatsapp,brn,vat_no,customer_code")
        .eq("id", credit_note.customer_id)
        .maybeSingle();
      if (cErr) throw cErr;
      customer = c || null;
    }

    return res.json({
      ok: true,
      server_time: new Date().toISOString(),
      credit_note,
      customer,
      items,
    });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || "Server error" });
  }
});

export default r;
