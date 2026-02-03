import { Router } from "express";
import { supaAdmin } from "../supabaseAdmin";

const r = Router();

const n2 = (v: any) => {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
};

function isNumericId(s: string) {
  return /^[0-9]+$/.test(String(s || ""));
}

async function nextCreditNoteNumber(supabase: ReturnType<typeof supaAdmin>) {
  // Example format: CN-00000123
  const { data, error } = await supabase
    .from("credit_notes")
    .select("credit_note_number")
    .order("id", { ascending: false })
    .limit(1);

  if (error) throw error;

  const last = data?.[0]?.credit_note_number || "CN-00000000";
  const m = String(last).match(/(\d+)\s*$/);
  const lastNum = m ? Number(m[1]) : 0;
  const next = lastNum + 1;

  return `CN-${String(next).padStart(8, "0")}`;
}

/** GET /api/credit-notes */
r.get("/", async (req, res) => {
  try {
    const supabase = supaAdmin();

    const { data, error } = await supabase
      .from("credit_notes")
      .select(
        `
        id,
        credit_note_number,
        credit_note_date,
        total_amount,
        status,
        customers:customer_id ( name, customer_code )
      `
      )
      .order("id", { ascending: false });

    if (error) throw error;

    res.json({ ok: true, creditNotes: data || [] });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || "Failed to load credit notes" });
  }
});

/** GET /api/credit-notes/:id */
r.get("/:id", async (req, res) => {
  try {
    const supabase = supaAdmin();
    const raw = String(req.params.id || "").trim();
    if (!raw) return res.status(400).json({ ok: false, error: "Missing id" });

    let cnQ = supabase
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
        created_at,
        stock_reversed_at,
        customers:customer_id (
          id,
          name,
          phone,
          email,
          address,
          opening_balance,
          client,
          customer_code
        )
      `
      );

    cnQ = isNumericId(raw) ? cnQ.eq("id", Number(raw)) : cnQ.eq("credit_note_number", raw);

    const { data: credit_note, error: cnErr } = await cnQ.maybeSingle();
    if (cnErr) return res.status(500).json({ ok: false, error: cnErr.message });
    if (!credit_note) return res.status(404).json({ ok: false, error: "Credit note not found" });

    const { data: items, error: itErr } = await supabase
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
        products:product_id (
          id,
          item_code,
          sku,
          name
        )
      `
      )
      .eq("credit_note_id", credit_note.id)
      .order("id", { ascending: true });

    if (itErr) return res.status(500).json({ ok: false, error: itErr.message });

    res.json({ ok: true, credit_note, items: items || [] });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || "Server error" });
  }
});

/** POST /api/credit-notes/create */
r.post("/create", async (req, res) => {
  try {
    const supabase = supaAdmin();

    const body = req.body || {};
    const customerId = Number(body.customerId);
    const creditNoteDate = String(body.creditNoteDate || "").slice(0, 10);
    const invoiceId = body.invoiceId ? Number(body.invoiceId) : null;
    const reason = body.reason ?? null;

    const subtotal = n2(body.subtotal);
    const vatAmount = n2(body.vatAmount);
    const totalAmount = n2(body.totalAmount);

    const items = Array.isArray(body.items) ? body.items : [];
    if (!customerId) return res.status(400).json({ ok: false, error: "customerId required" });
    if (!creditNoteDate) return res.status(400).json({ ok: false, error: "creditNoteDate required" });
    if (!items.length) return res.status(400).json({ ok: false, error: "items required" });

    const credit_note_number = await nextCreditNoteNumber(supabase);

    // 1) insert header
    const { data: cn, error: cnErr } = await supabase
      .from("credit_notes")
      .insert({
        credit_note_number,
        credit_note_date: creditNoteDate,
        customer_id: customerId,
        invoice_id: invoiceId,
        reason,
        subtotal,
        vat_amount: vatAmount,
        total_amount: totalAmount,
        status: "ISSUED",
      })
      .select("id")
      .single();

    if (cnErr) throw cnErr;

    // 2) insert items
    const mapped = items.map((it: any) => ({
      credit_note_id: cn.id,
      product_id: it.product_id ? Number(it.product_id) : null,
      total_qty: n2(it.total_qty),
      unit_price_excl_vat: n2(it.unit_price_excl_vat),
      unit_vat: n2(it.unit_vat),
      unit_price_incl_vat: n2(it.unit_price_incl_vat),
      line_total: n2(it.line_total),
    }));

    const { error: itErr } = await supabase.from("credit_note_items").insert(mapped);
    if (itErr) throw itErr;

    // NOTE: your DB triggers (credit_note_issued_stock / stock_movements) will run on UPDATE,
    // not INSERT. If your trigger expects an update to ISSUED, you can do a no-op update:
    // await supabase.from("credit_notes").update({ status: "ISSUED" }).eq("id", cn.id);

    res.json({ ok: true, creditNoteId: cn.id, credit_note_number });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || "Failed to create credit note" });
  }
});

/** POST /api/credit-notes/:id/void  (stock OUT reversal once) */
r.post("/:id/void", async (req, res) => {
  try {
    const supabase = supaAdmin();
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ ok: false, error: "Invalid id" });

    const { data: cn, error: cnErr } = await supabase
      .from("credit_notes")
      .select("id, credit_note_number, status")
      .eq("id", id)
      .single();

    if (cnErr || !cn) return res.status(404).json({ ok: false, error: "Credit note not found" });
    if (String(cn.status).toUpperCase() === "VOID") return res.json({ ok: true, alreadyVoid: true });

    const { data: items, error: itErr } = await supabase
      .from("credit_note_items")
      .select("product_id, total_qty")
      .eq("credit_note_id", id);

    if (itErr) throw itErr;

    const movements = (items || [])
      .map((it: any) => {
        const pid = Number(it.product_id);
        const qty = Math.abs(n2(it.total_qty));
        if (!pid || qty <= 0) return null;
        return {
          product_id: pid,
          movement_type: "OUT",
          quantity: qty,
          reference: `VOID:${cn.credit_note_number}`,
          source_table: "credit_notes",
          source_id: id,
          notes: "Auto stock OUT on credit note VOID",
        };
      })
      .filter(Boolean);

    // unique index uniq_stock_void_once prevents double void stock movement
    if (movements.length) {
      const { error: mvErr } = await supabase.from("stock_movements").insert(movements);
      if (mvErr) throw mvErr;
    }

    const { error: updErr } = await supabase
      .from("credit_notes")
      .update({ status: "VOID", stock_reversed_at: new Date().toISOString() })
      .eq("id", id);

    if (updErr) throw updErr;

    res.json({ ok: true, status: "VOID" });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || "Failed to void credit note" });
  }
});

/** POST /api/credit-notes/:id/refund */
r.post("/:id/refund", async (req, res) => {
  try {
    const supabase = supaAdmin();
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ ok: false, error: "Invalid id" });

    const { data: cn, error: cnErr } = await supabase
      .from("credit_notes")
      .select("id, status")
      .eq("id", id)
      .single();

    if (cnErr || !cn) return res.status(404).json({ ok: false, error: "Credit note not found" });

    const st = String(cn.status || "").toUpperCase();
    if (st === "VOID") return res.status(400).json({ ok: false, error: "Cannot refund a VOID credit note" });

    const { error: updErr } = await supabase.from("credit_notes").update({ status: "REFUNDED" }).eq("id", id);
    if (updErr) throw updErr;

    res.json({ ok: true, status: "REFUNDED" });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || "Failed to refund credit note" });
  }
});

/** POST /api/credit-notes/:id/restore  (Undo VOID by adding IN movements) */
r.post("/:id/restore", async (req, res) => {
  try {
    const supabase = supaAdmin();
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ ok: false, error: "Invalid id" });

    const { data: cn, error: cnErr } = await supabase
      .from("credit_notes")
      .select("id, credit_note_number, status")
      .eq("id", id)
      .single();

    if (cnErr || !cn) return res.status(404).json({ ok: false, error: "Credit note not found" });

    const st = String(cn.status || "").toUpperCase();
    if (st !== "VOID") return res.status(400).json({ ok: false, error: "Only VOID credit notes can be restored" });

    const { data: items, error: itErr } = await supabase
      .from("credit_note_items")
      .select("product_id, total_qty")
      .eq("credit_note_id", id);

    if (itErr) throw itErr;

    // Restore means we add stock back IN (reverse the OUT made on VOID)
    const movements = (items || [])
      .map((it: any) => {
        const pid = Number(it.product_id);
        const qty = Math.abs(n2(it.total_qty));
        if (!pid || qty <= 0) return null;
        return {
          product_id: pid,
          movement_type: "IN",
          quantity: qty,
          reference: `RESTORE:${cn.credit_note_number}`,
          source_table: "credit_notes",
          source_id: id,
          notes: "Auto stock IN on credit note RESTORE",
        };
      })
      .filter(Boolean);

    if (movements.length) {
      const { error: mvErr } = await supabase.from("stock_movements").insert(movements);
      if (mvErr) throw mvErr;
    }

    const { error: updErr } = await supabase
      .from("credit_notes")
      .update({ status: "ISSUED", stock_reversed_at: null })
      .eq("id", id);

    if (updErr) throw updErr;

    res.json({ ok: true, status: "ISSUED", restored: true });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || "Failed to restore credit note" });
  }
});

export default r;
