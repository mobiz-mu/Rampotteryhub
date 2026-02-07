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

type PermissionKey = (typeof ALL_PERMISSION_KEYS)[number];

function s(v: any) {
  return String(v ?? "").trim();
}
function isEmail(v: string) {
  const x = v.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x);
}
function isRole(v: any): v is AppRole {
  return v === "admin" || v === "manager" || v === "accountant" || v === "sales" || v === "viewer";
}
function sanitizePerms(input: Record<string, boolean> | null | undefined): Record<PermissionKey, boolean> {
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

  // POST /api/admin/users/create
  r.post("/create", async (req, res) => {
    try {
      const actor = await requireAdmin(req, res);
      if (!actor) return;

      const email = s(req.body?.email).toLowerCase();
      const full_name = s(req.body?.full_name) || null;

      const roleRaw = s(req.body?.role).toLowerCase();
      const role = (roleRaw || "viewer") as AppRole;

      const is_active = typeof req.body?.is_active === "boolean" ? req.body.is_active : true;
      const perms = sanitizePerms(req.body?.permissions);

      if (!email || !isEmail(email)) return res.status(400).json({ ok: false, error: "Invalid email" });
      if (!isRole(role)) return res.status(400).json({ ok: false, error: "Invalid role" });

      const sb = supaAdmin();

      const providedPwd = s(req.body?.password);
      const temp_password = providedPwd ? null : generatePassword(12);
      const password = providedPwd || temp_password!;

      // 1) Create auth user
      const { data: created, error: aErr } = await sb.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name },
      });

      if (aErr || !created?.user) {
        return res.status(400).json({ ok: false, error: aErr?.message || "Failed to create auth user" });
      }

      const user_id = created.user.id;

      // 2) profiles
      const { error: pErr } = await sb.from("profiles").upsert(
        {
          id: user_id,
          full_name,
          role,
        },
        { onConflict: "id" }
      );
      if (pErr) return res.status(400).json({ ok: false, error: pErr.message });

      // 3) rp_users
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
      if (rErr) return res.status(400).json({ ok: false, error: rErr.message });

      // 4) audit user_activity (best-effort)
      try {
        await sb.from("user_activity").insert({
          user_id: user_id, // created user (or actor id if you prefer)
          event: "user.create",
          entity: "user",
          entity_id: user_id,
          meta: { actor: { id: actor.id, username: actor.username, role: actor.role } },
        });
      } catch {}

      return res.json({ ok: true, user_id, temp_password });
    } catch (e: any) {
      console.error("admin users create error:", e);
      return res.status(500).json({ ok: false, error: e?.message || "Server error" });
    }
  });

  // POST /api/admin/users/update
  r.post("/update", async (req, res) => {
    try {
      const actor = await requireAdmin(req, res);
      if (!actor) return;

      const user_id = s(req.body?.user_id);
      if (!user_id) return res.status(400).json({ ok: false, error: "user_id required" });

      const nextRoleRaw = s(req.body?.role).toLowerCase();
      const nextRole = nextRoleRaw ? (nextRoleRaw as AppRole) : undefined;
      if (typeof nextRole !== "undefined" && !isRole(nextRole)) {
        return res.status(400).json({ ok: false, error: "Invalid role" });
      }

      const full_name = typeof req.body?.full_name === "undefined" ? undefined : s(req.body?.full_name) || null;
      const is_active = typeof req.body?.is_active === "undefined" ? undefined : !!req.body.is_active;
      const permissions = typeof req.body?.permissions === "undefined" ? undefined : sanitizePerms(req.body.permissions);

      const resetPwd = s(req.body?.reset_password);
      if (resetPwd && resetPwd.length < 8) {
        return res.status(400).json({ ok: false, error: "Password too short (min 8 characters)" });
      }

      const sb = supaAdmin();

      if (typeof full_name !== "undefined" || typeof nextRole !== "undefined") {
        const patch: any = {};
        if (typeof full_name !== "undefined") patch.full_name = full_name;
        if (typeof nextRole !== "undefined") patch.role = nextRole;
        const { error } = await sb.from("profiles").update(patch).eq("id", user_id);
        if (error) return res.status(400).json({ ok: false, error: error.message });
      }

      const patchRp: any = {};
      if (typeof full_name !== "undefined") patchRp.name = full_name;
      if (typeof nextRole !== "undefined") patchRp.role = nextRole;
      if (typeof is_active !== "undefined") patchRp.is_active = is_active;
      if (typeof permissions !== "undefined") patchRp.permissions = permissions;

      if (Object.keys(patchRp).length) {
        const { error } = await sb.from("rp_users").update(patchRp).eq("user_id", user_id);
        if (error) return res.status(400).json({ ok: false, error: error.message });
      }

      if (resetPwd) {
        const { error } = await sb.auth.admin.updateUserById(user_id, { password: resetPwd });
        if (error) return res.status(400).json({ ok: false, error: error.message });
      }

      // audit best-effort
      try {
        await sb.from("user_activity").insert({
          user_id: actor.id, // actor is better here
          event: "user.update",
          entity: "user",
          entity_id: user_id,
          meta: { changed: { full_name, nextRole, is_active, permissions, resetPwd: !!resetPwd } },
        });
      } catch {}

      return res.json({ ok: true });
    } catch (e: any) {
      console.error("admin users update error:", e);
      return res.status(500).json({ ok: false, error: e?.message || "Server error" });
    }
  });

  // POST /api/admin/users/delete
  r.post("/delete", async (req, res) => {
    try {
      const actor = await requireAdmin(req, res);
      if (!actor) return;

      const user_id = s(req.body?.user_id);
      if (!user_id) return res.status(400).json({ ok: false, error: "user_id required" });

      const sb = supaAdmin();

      // delete auth user (also cascades user_activity via FK if user_id matches auth.users)
      const { error } = await sb.auth.admin.deleteUser(user_id);
      if (error) return res.status(400).json({ ok: false, error: error.message });

      // best-effort cleanup app tables
      try {
        await sb.from("rp_users").delete().eq("user_id", user_id);
        await sb.from("profiles").delete().eq("id", user_id);
      } catch {}

      // audit best-effort
      try {
        await sb.from("user_activity").insert({
          user_id: actor.id,
          event: "user.delete",
          entity: "user",
          entity_id: user_id,
          meta: {},
        });
      } catch {}

      return res.json({ ok: true });
    } catch (e: any) {
      console.error("admin users delete error:", e);
      return res.status(500).json({ ok: false, error: e?.message || "Server error" });
    }
  });

  return r;
}
