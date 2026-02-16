// server/routes/adminUsers.ts
import { Router } from "express";
import { supaAdmin } from "../supabaseAdmin";

type AppRole = "admin" | "manager" | "accountant" | "sales" | "viewer";

const ALL_PERMISSION_KEYS = [
  "ap.view",
  "ap.bills",
  "ap.payments",
  "ar.view",
  "ar.invoices",
  "stock.view",
  "stock.edit",
  "customers.view",
  "customers.edit",
  "reports.view",
  "settings.view",
  "settings.edit",
  "users.manage",
] as const;

function s(v: any) {
  return String(v ?? "").trim();
}
function isEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim().toLowerCase());
}
function isRole(v: any): v is AppRole {
  return ["admin", "manager", "accountant", "sales", "viewer"].includes(v);
}
function sanitizePerms(input: Record<string, boolean> | null | undefined) {
  const src = input || {};
  const out: any = {};
  for (const k of ALL_PERMISSION_KEYS) out[k] = !!src[k];
  return out;
}
function generatePassword(len = 12) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export function adminUsersRouter(opts: {
  requireAdmin: (req: any, res: any) => Promise<any>;
}) {
  const { requireAdmin } = opts;
  const r = Router();

  /* =========================
     CREATE USER
  ========================= */
  r.post("/create", async (req, res) => {
    try {
      const actor = await requireAdmin(req, res);
      if (!actor) return;

      const email = s(req.body?.email).toLowerCase();
      const full_name = s(req.body?.full_name) || null;
      const role = s(req.body?.role || "viewer").toLowerCase();
      const is_active = typeof req.body?.is_active === "boolean" ? req.body.is_active : true;
      const perms = sanitizePerms(req.body?.permissions);

      if (!isEmail(email))
        return res.status(400).json({ ok: false, error: "Invalid email" });

      if (!isRole(role))
        return res.status(400).json({ ok: false, error: "Invalid role" });

      const sb = supaAdmin();

      const providedPwd = s(req.body?.password);
      const temp_password = providedPwd ? null : generatePassword(12);
      const password = providedPwd || temp_password!;

      /* 1️⃣ Create Auth User */
      const { data: created, error: aErr } = await sb.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name },
      });

      if (aErr || !created?.user) {
        return res.status(400).json({
          ok: false,
          error: aErr?.message || "Auth creation failed",
        });
      }

      const user_id = created.user.id;

      /* 2️⃣ Profiles */
      const { error: pErr } = await sb.from("profiles").upsert({
        id: user_id,
        full_name,
        role,
      });

      if (pErr)
        return res.status(400).json({ ok: false, error: pErr.message });

      /* 3️⃣ rp_users */
      const { error: rErr } = await sb.from("rp_users").upsert(
        {
          user_id,
          username: email,
          name: full_name,
          role,
          is_active,
          permissions: perms,
        },
        { onConflict: "user_id" }
      );

      if (rErr)
        return res.status(400).json({ ok: false, error: rErr.message });

      /* 4️⃣ Audit (non-breaking) */
      try {
        await sb.from("user_activity").insert({
          user_id: actor.user_id, // ✅ FIXED (UUID)
          event: "user.create",
          entity: "user",
          entity_id: user_id,
          meta: { created_user: email },
        });
      } catch {}

      return res.json({ ok: true, user_id, temp_password });
    } catch (e: any) {
      console.error("Create error:", e);
      return res.status(500).json({ ok: false, error: e?.message || "Server error" });
    }
  });

  // ✅ GET /api/admin/users/list
r.get("/list", async (req, res) => {
  try {
    const actor = await requireAdmin(req, res);
    if (!actor) return;

    const sb = supaAdmin();

    // profiles
    const { data: profiles, error: pErr } = await sb
      .from("profiles")
      .select("id, role, full_name, created_at");

    if (pErr) return res.status(400).json({ ok: false, error: pErr.message });

    // rp_users
    const { data: rpUsers, error: rErr } = await sb
      .from("rp_users")
      .select("user_id, username, name, role, permissions, is_active, created_at");

    if (rErr) return res.status(400).json({ ok: false, error: rErr.message });

    const rpMap = new Map<string, any>();
    (rpUsers || []).forEach((r: any) => {
      if (r?.user_id) rpMap.set(r.user_id, r);
    });

    const normRole = (v: any) => {
      const x = String(v || "").toLowerCase();
      if (x === "admin" || x === "manager" || x === "accountant" || x === "sales" || x === "viewer") return x;
      return "viewer";
    };

    const merged = (profiles || []).map((p: any) => {
      const rp = rpMap.get(p.id);
      const role = normRole(rp?.role ?? p.role);

      return {
        user_id: p.id,
        full_name: p.full_name ?? rp?.name ?? null,
        email: rp?.username ?? null,
        role,
        is_active: typeof rp?.is_active === "boolean" ? rp.is_active : true,
        permissions: (rp?.permissions && typeof rp.permissions === "object" ? rp.permissions : {}) as Record<string, boolean>,
        created_at: p.created_at || rp?.created_at || null,
      };
    });

    return res.json({ ok: true, users: merged });
  } catch (e: any) {
    console.error("admin users list error:", e);
    return res.status(500).json({ ok: false, error: e?.message || "Server error" });
  }
});


  /* =========================
     UPDATE USER
  ========================= */
  r.post("/update", async (req, res) => {
    try {
      const actor = await requireAdmin(req, res);
      if (!actor) return;

      const user_id = s(req.body?.user_id);
      if (!user_id)
        return res.status(400).json({ ok: false, error: "user_id required" });

      const sb = supaAdmin();

      const patchRp: any = {};
      if (req.body?.role) patchRp.role = req.body.role;
      if (typeof req.body?.is_active === "boolean")
        patchRp.is_active = req.body.is_active;
      if (req.body?.permissions)
        patchRp.permissions = sanitizePerms(req.body.permissions);
      if (req.body?.full_name)
        patchRp.name = req.body.full_name;

      if (Object.keys(patchRp).length) {
        const { error } = await sb
          .from("rp_users")
          .update(patchRp)
          .eq("user_id", user_id);

        if (error)
          return res.status(400).json({ ok: false, error: error.message });
      }

      if (req.body?.reset_password) {
        const { error } = await sb.auth.admin.updateUserById(user_id, {
          password: req.body.reset_password,
        });
        if (error)
          return res.status(400).json({ ok: false, error: error.message });
      }

      try {
        await sb.from("user_activity").insert({
          user_id: actor.user_id, // ✅ FIXED
          event: "user.update",
          entity: "user",
          entity_id: user_id,
        });
      } catch {}

      return res.json({ ok: true });
    } catch (e: any) {
      console.error("Update error:", e);
      return res.status(500).json({ ok: false, error: e?.message || "Server error" });
    }
  });

  /* =========================
     DELETE USER
  ========================= */
  r.post("/delete", async (req, res) => {
    try {
      const actor = await requireAdmin(req, res);
      if (!actor) return;

      const user_id = s(req.body?.user_id);
      if (!user_id)
        return res.status(400).json({ ok: false, error: "user_id required" });

      const sb = supaAdmin();

      const { error } = await sb.auth.admin.deleteUser(user_id);
      if (error)
        return res.status(400).json({ ok: false, error: error.message });

      try {
        await sb.from("rp_users").delete().eq("user_id", user_id);
      } catch {}

      try {
        await sb.from("user_activity").insert({
          user_id: actor.user_id, // ✅ FIXED
          event: "user.delete",
          entity: "user",
          entity_id: user_id,
        });
      } catch {}

      return res.json({ ok: true });
    } catch (e: any) {
      console.error("Delete error:", e);
      return res.status(500).json({ ok: false, error: e?.message || "Server error" });
    }
  });

  return r;
}

