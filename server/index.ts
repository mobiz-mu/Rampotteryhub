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
type RpUserHeader = {
  id?: number | string;
  user_id?: string;
  username?: string;
  role?: string;
  name?: string;
};

type RpUserDb = {
  id: number;
  user_id: string | null;
  username: string;
  role: string;
  is_active: boolean;
  permissions: any;
};


/* =========================
   Auth (REAL) — validate rp_users
========================= */

function looksLikeUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function parseUserHeader(raw: string | null): RpUserHeader | null {
  if (!raw) return null;
  const txt = String(raw).trim();
  if (!txt) return null;

  // JSON header
  if (txt.startsWith("{") && txt.endsWith("}")) {
    try {
      return JSON.parse(txt);
    } catch {
      return null;
    }
  }

  // plain UUID
  if (looksLikeUuid(txt)) {
    return { user_id: txt };
  }

  // plain username
  return { username: txt };
}

async function resolveUser(req: express.Request): Promise<RpUserDb | null> {
  const header = parseUserHeader(String(req.headers["x-rp-user"] || ""));
  if (!header) return null;

  const supabase = supaAdmin();

  // 1) Prefer numeric id (rp_users.id)
  if (header.id && Number.isFinite(Number(header.id))) {
    const { data, error } = await supabase
      .from("rp_users")
      .select("id,user_id,username,role,is_active,permissions")
      .eq("id", Number(header.id))
      .eq("is_active", true)
      .single();

    if (error || !data) return null;
    return data as RpUserDb;
  }

  // 2) Prefer UUID user_id (auth.users.id)
  if (header.user_id) {
    const { data, error } = await supabase
      .from("rp_users")
      .select("id,user_id,username,role,is_active,permissions")
      .eq("user_id", String(header.user_id))
      .eq("is_active", true)
      .single();

    if (error || !data) return null;
    return data as RpUserDb;
  }

  // 3) Fallback username
  if (header.username) {
    const { data, error } = await supabase
      .from("rp_users")
      .select("id,user_id,username,role,is_active,permissions")
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
    return res.status(401).json({
      ok: false,
      error: "Unauthorized - missing or invalid x-rp-user header",
    });
  }

  return user;
}

async function requireAdmin(req: express.Request, res: express.Response) {
  const user = await resolveUser(req);

  if (!user) {
    return res.status(401).json({
      ok: false,
      error: "Unauthorized - missing or invalid x-rp-user header",
    });
  }

  if (!isAdmin(user)) {
    return res.status(403).json({
      ok: false,
      error: "Forbidden - admin only",
    });
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


