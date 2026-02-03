import "dotenv/config";
import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";

/* =========================
   Types
========================= */
type RpUserHeader = { id?: number; username?: string; role?: string; name?: string };
type RpUserDb = { id: number; username: string; role: string; is_active: boolean; permissions: any };

/* =========================
   Supabase admin
========================= */
function supaAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY; // strongly recommended
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !(service || anon)) throw new Error("Missing Supabase env (URL + SERVICE_ROLE or ANON)");
  return createClient(url, (service || anon)!, { auth: { persistSession: false } });
}

/* =========================
   Auth (REAL) — validate rp_users
========================= */
function parseUserHeader(raw: string | null): RpUserHeader | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw);
    if (!obj) return null;
    return obj;
  } catch {
    return null;
  }
}

async function resolveUser(req: express.Request): Promise<RpUserDb | null> {
  const header = parseUserHeader(String(req.headers["x-rp-user"] || ""));
  if (!header) return null;

  const supabase = supaAdmin();

  // Prefer numeric id (recommended)
  if (header.id && Number.isFinite(Number(header.id))) {
    const { data, error } = await supabase
      .from("rp_users")
      .select("id, username, role, is_active, permissions")
      .eq("id", Number(header.id))
      .eq("is_active", true)
      .single();

    if (error || !data) return null;
    return data as RpUserDb;
  }

  // Fallback: username
  if (header.username) {
    const { data, error } = await supabase
      .from("rp_users")
      .select("id, username, role, is_active, permissions")
      .eq("username", String(header.username))
      .eq("is_active", true)
      .single();

    if (error || !data) return null;
    return data as RpUserDb;
  }

  return null;
}

function isAdmin(user: RpUserDb | null) {
  return String(user?.role || "").toLowerCase() === "admin";
}

async function requireUser(req: express.Request, res: express.Response) {
  const user = await resolveUser(req);
  if (!user) {
    res.status(401).json({ ok: false, error: "Unauthorized" });
    return null;
  }
  return user;
}

async function requireAdmin(req: express.Request, res: express.Response) {
  const user = await requireUser(req, res);
  if (!user) return null;
  if (!isAdmin(user)) {
    res.status(403).json({ ok: false, error: "Forbidden" });
    return null;
  }
  return user;
}

/* =========================
   Helpers
========================= */
function safeNum(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function auditLog(opts: {
  supabase: ReturnType<typeof supaAdmin>;
  actor: RpUserDb;
  action: string;
  entity_table: string;
  entity_id: number;
  meta?: any;
}) {
  const { supabase, actor, action, entity_table, entity_id, meta } = opts;

  // never crash the whole API on audit failures
  const { error } = await supabase.from("audit_logs").insert({
    actor: { id: actor.id, username: actor.username, role: actor.role },
    action,
    entity_table,
    entity_id,
    meta: meta ?? null,
  });

  if (error) {
    console.warn("auditLog insert failed:", error.message);
  }
}

async function getCreditNoteById(supabase: any, id: number) {
  const { data, error } = await supabase
    .from("credit_notes")
    .select("id, credit_note_number, status, customer_id, invoice_id, total_amount")
    .eq("id", id)
    .single();

  if (error) throw error;
  return data;
}

async function getCreditNoteItems(supabase: any, creditNoteId: number) {
  const { data, error } = await supabase
    .from("credit_note_items")
    .select("product_id, total_qty")
    .eq("credit_note_id", creditNoteId);

  if (error) throw error;
  return data || [];
}

/**
 * Stock movements — idempotent:
 * relies on unique constraint in stock_movements to prevent duplicates.
 * We ignore duplicate violation (Postgres code 23505).
 */
async function insertStockMovements(opts: {
  supabase: any;
  creditNoteId: number;
  creditNoteNumber: string;
  movement_type: "IN" | "OUT";
  referencePrefix: "VOID" | "REFUND" | "RESTORE";
  notes: string;
}) {
  const { supabase, creditNoteId, creditNoteNumber, movement_type, referencePrefix, notes } = opts;

  const items = await getCreditNoteItems(supabase, creditNoteId);

  const rows = (items || [])
    .map((it: any) => {
      const pid = Number(it.product_id);
      const qty = Math.abs(safeNum(it.total_qty));
      if (!pid || qty <= 0) return null;

      return {
        product_id: pid,
        movement_type,
        quantity: qty,
        reference: `${referencePrefix}:${creditNoteNumber}`,
        source_table: "credit_notes",
        source_id: creditNoteId,
        notes,
      };
    })
    .filter(Boolean);

  if (!rows.length) return { inserted: 0 };

  const { error } = await supabase.from("stock_movements").insert(rows);

  if (error) {
    const code = (error as any)?.code; // supabase error often includes postgres code
    const msg = String(error.message || "");
    const isDup = code === "23505" || msg.toLowerCase().includes("duplicate");
    if (!isDup) throw error;
  }

  return { inserted: rows.length };
}

/* =========================
   App
========================= */
const app = express();
app.use(express.json());

app.use(
  cors({
    origin: ["http://localhost:8080"],
    credentials: true,
  })
);

app.use((req, _res, next) => {
  if (req.url.startsWith("/api")) {
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("API CALL:", req.method, req.url);
    console.log("x-rp-user header =", req.headers["x-rp-user"]);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  }
  next();
});



/* =========================
   Debug auth (optional but VERY useful)
========================= */
app.get("/api/auth/me", async (req, res) => {
  try {
    const user = await resolveUser(req);
    if (!user) return res.status(401).json({ ok: false, error: "Unauthorized" });
    return res.json({ ok: true, user });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || "Server error" });
  }
});

/* =========================
   CREDIT NOTES — LIST
   GET /api/credit-notes
========================= */
app.get("/api/credit-notes", async (req, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;

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
          customers ( name, customer_code )
        `
      )
      .order("id", { ascending: false });

    if (error) throw error;

    return res.json({ ok: true, creditNotes: data || [] });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || "Failed to load credit notes" });
  }
});

/* =========================
   CREDIT NOTES — CREATE
   POST /api/credit-notes/create
   body: { customerId, creditNoteDate, invoiceId, reason, subtotal, vatAmount, totalAmount, items: [...] }
========================= */
app.post("/api/credit-notes/create", async (req, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;

    const supabase = supaAdmin();

    const customerId = Number(req.body?.customerId || 0);
    const creditNoteDate = String(req.body?.creditNoteDate || "").trim();
    const invoiceId = req.body?.invoiceId ? Number(req.body.invoiceId) : null;

    const reason = req.body?.reason ? String(req.body.reason) : null;
    const subtotal = safeNum(req.body?.subtotal);
    const vatAmount = safeNum(req.body?.vatAmount);
    const totalAmount = safeNum(req.body?.totalAmount);

    const items = Array.isArray(req.body?.items) ? req.body.items : [];

    if (!customerId || !creditNoteDate || !items.length) {
      return res.status(400).json({ ok: false, error: "Missing required fields" });
    }

    // 1) Insert credit note
    const { data: cn, error: cnErr } = await supabase
      .from("credit_notes")
      .insert({
        customer_id: customerId,
        credit_note_date: creditNoteDate,
        invoice_id: invoiceId,
        reason,
        subtotal,
        vat_amount: vatAmount,
        total_amount: totalAmount,
        status: "ISSUED",
      })
      .select("id, credit_note_number")
      .single();

    if (cnErr || !cn) throw cnErr || new Error("Failed to create credit note");

    // 2) Insert items
    const mapped = items.map((it: any) => ({
      credit_note_id: cn.id,
      product_id: Number(it.product_id),
      total_qty: safeNum(it.total_qty),
      unit_price_excl_vat: safeNum(it.unit_price_excl_vat),
      unit_vat: safeNum(it.unit_vat),
      unit_price_incl_vat: safeNum(it.unit_price_incl_vat),
      line_total: safeNum(it.line_total),
      description: it.description ? String(it.description) : null,
    }));

    const { error: itErr } = await supabase.from("credit_note_items").insert(mapped);
    if (itErr) throw itErr;

    await auditLog({
      supabase,
      actor: user,
      action: "CREDIT_NOTE_CREATE",
      entity_table: "credit_notes",
      entity_id: cn.id,
      meta: { total_amount: totalAmount, items: mapped.length },
    });

    return res.json({ ok: true, creditNoteId: cn.id });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || "Failed to create credit note" });
  }
});

/* =========================
   CREDIT NOTES — VIEW
   GET /api/credit-notes/:id
========================= */
app.get("/api/credit-notes/:id", async (req, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;

    const raw = String(req.params.id || "").trim();
    if (!raw) return res.status(400).json({ ok: false, error: "Missing id" });

    const supabase = supaAdmin();
    const numeric = /^[0-9]+$/.test(raw);

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

    cnQ = numeric ? cnQ.eq("id", Number(raw)) : cnQ.eq("credit_note_number", raw);

    const { data: creditNote, error: cnErr } = await cnQ.maybeSingle();
    if (cnErr) return res.status(500).json({ ok: false, error: cnErr.message });
    if (!creditNote) return res.status(404).json({ ok: false, error: "Credit note not found" });

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
          description,
          products:product_id (
            id,
            item_code,
            sku,
            name
          )
        `
      )
      .eq("credit_note_id", creditNote.id)
      .order("id", { ascending: true });

    if (itErr) return res.status(500).json({ ok: false, error: itErr.message });

    return res.json({ ok: true, credit_note: creditNote, items: items || [] });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || "Server error" });
  }
});

/* =========================
   AUDIT — history
   GET /api/audit?entity=credit_notes&id=123
========================= */
app.get("/api/audit", async (req, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;

    const entity = String(req.query.entity || "").trim();
    const id = Number(req.query.id || 0);

    if (!entity) return res.status(400).json({ ok: false, error: "entity is required" });
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: "id is required" });

    const supabase = supaAdmin();

    const { data, error } = await supabase
      .from("audit_logs")
      .select("id, created_at, actor, action, entity_table, entity_id, meta")
      .eq("entity_table", entity)
      .eq("entity_id", id)
      .order("id", { ascending: false })
      .limit(100);

    if (error) throw error;

    return res.json({ ok: true, logs: data || [] });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || "Failed to load audit logs" });
  }
});

/* =========================
   VOID (admin) — stock OUT + audit
   POST /api/credit-notes/:id/void
========================= */
app.post("/api/credit-notes/:id/void", async (req, res) => {
  try {
    const user = await requireAdmin(req, res);
    if (!user) return;

    const creditNoteId = Number(req.params.id || 0);
    if (!Number.isFinite(creditNoteId) || creditNoteId <= 0) {
      return res.status(400).json({ ok: false, error: "Invalid credit note id" });
    }

    const supabase = supaAdmin();
    const cn = await getCreditNoteById(supabase, creditNoteId);

    const current = String(cn.status || "").toUpperCase();
    if (current === "VOID") return res.json({ ok: true, status: "VOID", already: true });

    await insertStockMovements({
      supabase,
      creditNoteId,
      creditNoteNumber: cn.credit_note_number || String(cn.id),
      movement_type: "OUT",
      referencePrefix: "VOID",
      notes: "Auto stock OUT on credit note VOID",
    });

    const { error: updErr } = await supabase.from("credit_notes").update({ status: "VOID" }).eq("id", creditNoteId);
    if (updErr) throw updErr;

    await auditLog({
      supabase,
      actor: user,
      action: "CREDIT_NOTE_VOID",
      entity_table: "credit_notes",
      entity_id: creditNoteId,
      meta: { from: current, to: "VOID" },
    });

    return res.json({ ok: true, status: "VOID" });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || "Failed to void credit note" });
  }
});

/* =========================
   REFUND (admin) — stock OUT + audit
   POST /api/credit-notes/:id/refund
========================= */
app.post("/api/credit-notes/:id/refund", async (req, res) => {
  try {
    const user = await requireAdmin(req, res);
    if (!user) return;

    const creditNoteId = Number(req.params.id || 0);
    if (!Number.isFinite(creditNoteId) || creditNoteId <= 0) {
      return res.status(400).json({ ok: false, error: "Invalid credit note id" });
    }

    const supabase = supaAdmin();
    const cn = await getCreditNoteById(supabase, creditNoteId);

    const current = String(cn.status || "").toUpperCase();
    if (current === "REFUNDED") return res.json({ ok: true, status: "REFUNDED", already: true });

    const refundNote = String(req.body?.note || "").trim() || null;

    await insertStockMovements({
      supabase,
      creditNoteId,
      creditNoteNumber: cn.credit_note_number || String(cn.id),
      movement_type: "OUT",
      referencePrefix: "REFUND",
      notes: "Auto stock OUT on credit note REFUND",
    });

    const { error: updErr } = await supabase.from("credit_notes").update({ status: "REFUNDED" }).eq("id", creditNoteId);
    if (updErr) throw updErr;

    await auditLog({
      supabase,
      actor: user,
      action: "CREDIT_NOTE_REFUND",
      entity_table: "credit_notes",
      entity_id: creditNoteId,
      meta: { from: current, to: "REFUNDED", note: refundNote },
    });

    return res.json({ ok: true, status: "REFUNDED" });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || "Failed to refund credit note" });
  }
});

/* =========================
   RESTORE (admin) — stock IN + audit
   POST /api/credit-notes/:id/restore
========================= */
app.post("/api/credit-notes/:id/restore", async (req, res) => {
  try {
    const user = await requireAdmin(req, res);
    if (!user) return;

    const creditNoteId = Number(req.params.id || 0);
    if (!Number.isFinite(creditNoteId) || creditNoteId <= 0) {
      return res.status(400).json({ ok: false, error: "Invalid credit note id" });
    }

    const supabase = supaAdmin();
    const cn = await getCreditNoteById(supabase, creditNoteId);

    const current = String(cn.status || "").toUpperCase();
    if (current !== "VOID" && current !== "REFUNDED") {
      return res.status(400).json({ ok: false, error: `Cannot restore from status ${current}` });
    }

    await insertStockMovements({
      supabase,
      creditNoteId,
      creditNoteNumber: cn.credit_note_number || String(cn.id),
      movement_type: "IN",
      referencePrefix: "RESTORE",
      notes: "Auto stock IN on credit note RESTORE",
    });

    const { error: updErr } = await supabase.from("credit_notes").update({ status: "ISSUED" }).eq("id", creditNoteId);
    if (updErr) throw updErr;

    await auditLog({
      supabase,
      actor: user,
      action: "CREDIT_NOTE_RESTORE",
      entity_table: "credit_notes",
      entity_id: creditNoteId,
      meta: { from: current, to: "ISSUED" },
    });

    return res.json({ ok: true, status: "ISSUED" });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || "Failed to restore credit note" });
  }
});

/* =========================
   Start
========================= */
const PORT = Number(process.env.API_PORT || 3001);
app.listen(PORT, () => console.log(`✅ API running on http://localhost:${PORT}`));


