// server/index.ts
import "dotenv/config";
import express from "express";
import cors from "cors";

import publicPrint from "./routes/publicPrint";
import { supaAdmin } from "./supabaseAdmin"; // ✅ KEEP this (single source of truth)

import { adminUsersRouter } from "./routes/adminUsers";
import { publicLinksRouter } from "./routes/publicLinks";
import publicRoutes from "./routes/public";

import quotationsRouter from "./routes/quotations";
import publicQuotations from "./routes/publicQuotations";
import publicQuotationPrint from "./routes/publicQuotationPrint";

/* =========================
   Types
========================= */
type RpUserHeader = { id?: number; username?: string; role?: string; name?: string };
type RpUserDb = { id: number; username: string; role: string; is_active: boolean; permissions: any };

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

  const { error } = await supabase.from("audit_logs").insert({
    actor: { id: actor.id, username: actor.username, role: actor.role },
    action,
    entity_table,
    entity_id,
    meta: meta ?? null,
  });

  if (error) console.warn("auditLog insert failed:", error.message);
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
    const code = (error as any)?.code;
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
   Routers
========================= */
app.use(
  "/api",
  publicLinksRouter({
    requireUser,
  })
);

// Your existing public bundle routes
app.use("/api/public", publicRoutes);
app.use("/api/public", publicPrint);

// Admin users
app.use(
  "/api/admin/users",
  adminUsersRouter({
    requireAdmin,
  })
);

// Quotations
app.use("/api/quotations", quotationsRouter);
app.use("/api/public", publicQuotations);
app.use("/api/public", publicQuotationPrint);

/* =========================
   Debug auth (optional)
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
   CREDIT NOTES — your existing endpoints (unchanged)
   (keep the rest of your credit notes code here as-is)
========================= */

// ... keep your credit notes + audit endpoints exactly as you have them ...

/* =========================
   Start
========================= */
const PORT = Number(process.env.API_PORT || process.env.PORT || 3001);
app.listen(PORT, () => console.log(`✅ API running on http://localhost:${PORT}`));


