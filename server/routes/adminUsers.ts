// server/routes/adminUsers.ts
import { Router } from "express";
import { supaAdmin } from "../supabaseAdmin.js";


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
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim().toLowerCase());
}
function normRole(v: any): AppRole {
  const x = String(v ?? "").trim().toLowerCase();
  if (x === "admin" || x === "manager" || x === "accountant" || x === "sales" || x === "viewer") return x;
  return "viewer";
}
function isRole(v: any): v is AppRole {
  const x = String(v ?? "").trim().toLowerCase();
  return x === "admin" || x === "manager" || x === "accountant" || x === "sales" || x === "viewer";
}
function sanitizePerms(input: Record<string, boolean> | null | undefined): Record<PermissionKey, boolean> {
  const src = input || {};
  const out: any = {};
  for (const k of ALL_PERMISSION_KEYS) out[k] = !!(src as any)[k];
  return out as Record<PermissionKey, boolean>;
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

      const roleRaw = s(req.body?.role || "viewer");
      const role = normRole(roleRaw);

      const is_active = typeof req.body?.is_active === "boolean" ? req.body.is_active : true;
      const perms = sanitizePerms(req.body?.permissions);

      if (!email || !isEmail(email)) return res.status(400).json({ ok: false, error: "Invalid email" });
      if (!isRole(role)) return res.status(400).json({ ok: false, error: "Invalid role" });

      const sb = supaAdmin();

      const providedPwd = s(req.body?.password);
      if (providedPwd && providedPwd.length < 8) {
        return res.status(400).json({ ok: false, error: "Password too short (min 8 chars)" });
      }

      const temp_password = providedPwd ? null : generatePassword(12);
      const password = providedPwd || temp_password!;

      // 1) Create Auth User
      const { data: created, error: aErr } = await sb.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name },
      });

      if (aErr || !created?.user?.id) {
        return res.status(400).json({ ok: false, error: aErr?.message || "Auth creation failed" });
      }

      const user_id = created.user.id;

      // 2) profiles (keep in sync)
      const { error: pErr } = await sb
        .from("profiles")
        .upsert({ id: user_id, full_name, role }, { onConflict: "id" });

      if (pErr) {
        // rollback auth user to avoid orphans (best-effort)
        try {
          await sb.auth.admin.deleteUser(user_id);
        } catch {}
        return res.status(400).json({ ok: false, error: pErr.message });
      }

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

      if (rErr) {
        // rollback profile + auth to avoid half-created users (best-effort)
        try {
          await sb.from("profiles").delete().eq("id", user_id);
        } catch {}
        try {
          await sb.auth.admin.deleteUser(user_id);
        } catch {}
        return res.status(400).json({ ok: false, error: rErr.message });
      }

      // 4) Audit (best-effort, never break)
      try {
        await sb.from("user_activity").insert({
          user_id: actor.user_id ?? actor.id, // actor.user_id is UUID in your setup
          event: "user.create",
          entity: "user",
          entity_id: user_id,
          meta: { created_user: email, role, is_active },
        });
      } catch {}

      return res.json({ ok: true, user_id, temp_password });
    } catch (e: any) {
      console.error("Create error:", e);
      return res.status(500).json({ ok: false, error: e?.message || "Server error" });
    }
  });

  /* =========================
     LIST USERS
     ✅ returns BOTH profiles + rp_users merged
     ✅ includes "orphans" (rp_users without profiles)
  ========================= */
  r.get("/list", async (req, res) => {
    try {
      const actor = await requireAdmin(req, res);
      if (!actor) return;

      const sb = supaAdmin();

      const { data: profiles, error: pErr } = await sb.from("profiles").select("id, role, full_name, created_at");
      if (pErr) return res.status(400).json({ ok: false, error: pErr.message });

      const { data: rpUsers, error: rErr } = await sb
        .from("rp_users")
        .select("user_id, username, name, role, permissions, is_active, created_at");
      if (rErr) return res.status(400).json({ ok: false, error: rErr.message });

      const pMap = new Map<string, any>();
      (profiles || []).forEach((p: any) => p?.id && pMap.set(p.id, p));

      const rpMap = new Map<string, any>();
      (rpUsers || []).forEach((u: any) => u?.user_id && rpMap.set(u.user_id, u));

      // union of ids (profiles.id + rp_users.user_id)
      const ids = new Set<string>();
      (profiles || []).forEach((p: any) => p?.id && ids.add(p.id));
      (rpUsers || []).forEach((u: any) => u?.user_id && ids.add(u.user_id));

      const merged = Array.from(ids).map((id) => {
        const p = pMap.get(id);
        const rp = rpMap.get(id);

        const role = normRole(rp?.role ?? p?.role);

        return {
          user_id: id,
          full_name: p?.full_name ?? rp?.name ?? null,
          email: rp?.username ?? null,
          role,
          is_active: typeof rp?.is_active === "boolean" ? rp.is_active : true,
          permissions: (rp?.permissions && typeof rp.permissions === "object" ? rp.permissions : {}) as Record<
            string,
            boolean
          >,
          created_at: p?.created_at ?? rp?.created_at ?? null,
        };
      });

      // sort: name then email
      merged.sort((a: any, b: any) => {
        const an = (a.full_name || a.email || "").toLowerCase();
        const bn = (b.full_name || b.email || "").toLowerCase();
        return an.localeCompare(bn);
      });

      return res.json({ ok: true, users: merged });
    } catch (e: any) {
      console.error("admin users list error:", e);
      return res.status(500).json({ ok: false, error: e?.message || "Server error" });
    }
  });

  /* =========================
     UPDATE USER
     ✅ updates BOTH rp_users + profiles
  ========================= */
  r.post("/update", async (req, res) => {
    try {
      const actor = await requireAdmin(req, res);
      if (!actor) return;

      const user_id = s(req.body?.user_id);
      if (!user_id) return res.status(400).json({ ok: false, error: "user_id required" });

      const sb = supaAdmin();

      const nextRole = typeof req.body?.role === "undefined" ? undefined : normRole(req.body.role);
      if (typeof nextRole !== "undefined" && !isRole(nextRole)) {
        return res.status(400).json({ ok: false, error: "Invalid role" });
      }

      const nextName = typeof req.body?.full_name === "undefined" ? undefined : (s(req.body.full_name) || null);

      const nextActive = typeof req.body?.is_active === "undefined" ? undefined : !!req.body.is_active;

      const nextPerms =
        typeof req.body?.permissions === "undefined" ? undefined : sanitizePerms(req.body.permissions);

      // 1) profiles
      if (typeof nextRole !== "undefined" || typeof nextName !== "undefined") {
        const patchP: any = {};
        if (typeof nextRole !== "undefined") patchP.role = nextRole;
        if (typeof nextName !== "undefined") patchP.full_name = nextName;

        const { error } = await sb.from("profiles").update(patchP).eq("id", user_id);
        // profiles row may not exist: don't hard-fail; just warn
        if (error) console.warn("profiles update warning:", error.message);
      }

      // 2) rp_users
      const patchRp: any = {};
      if (typeof nextRole !== "undefined") patchRp.role = nextRole;
      if (typeof nextActive !== "undefined") patchRp.is_active = nextActive;
      if (typeof nextPerms !== "undefined") patchRp.permissions = nextPerms;
      if (typeof nextName !== "undefined") patchRp.name = nextName;

      if (Object.keys(patchRp).length) {
        const { error } = await sb.from("rp_users").update(patchRp).eq("user_id", user_id);
        if (error) return res.status(400).json({ ok: false, error: error.message });
      }

      // 3) reset password (optional)
      const resetPwd = s(req.body?.reset_password);
      if (resetPwd) {
        if (resetPwd.length < 8) {
          return res.status(400).json({ ok: false, error: "Password too short (min 8 chars)" });
        }
        const { error } = await sb.auth.admin.updateUserById(user_id, { password: resetPwd });
        if (error) return res.status(400).json({ ok: false, error: error.message });
      }

      // 4) audit
      try {
        await sb.from("user_activity").insert({
          user_id: actor.user_id ?? actor.id,
          event: "user.update",
          entity: "user",
          entity_id: user_id,
          meta: {
            changed: {
              role: nextRole,
              full_name: nextName,
              is_active: nextActive,
              reset_password: !!resetPwd,
            },
          },
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
      if (!user_id) return res.status(400).json({ ok: false, error: "user_id required" });

      const sb = supaAdmin();

      const { error } = await sb.auth.admin.deleteUser(user_id);
      if (error) return res.status(400).json({ ok: false, error: error.message });

      // cleanup (best-effort)
      try {
        await sb.from("rp_users").delete().eq("user_id", user_id);
        await sb.from("profiles").delete().eq("id", user_id);
      } catch {}

      try {
        await sb.from("user_activity").insert({
          user_id: actor.user_id ?? actor.id,
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

