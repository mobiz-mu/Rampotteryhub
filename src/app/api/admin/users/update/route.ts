// src/app/api/admin/users/update/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/src/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AppRole = "admin" | "manager" | "accountant" | "sales" | "viewer";

type Body = {
  user_id: string; // UUID
  full_name?: string;
  role?: AppRole;
  is_active?: boolean;
  permissions?: Record<string, boolean>;
  reset_password?: string;

  // optional future extension:
  // email?: string;
};

function s(v: any) {
  return String(v ?? "").trim();
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function isRole(v: any): v is AppRole {
  return v === "admin" || v === "manager" || v === "accountant" || v === "sales" || v === "viewer";
}

async function safeJson(req: NextRequest): Promise<Body | null> {
  try {
    return (await req.json()) as Body;
  } catch {
    return null;
  }
}

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

/**
 * IMPORTANT: Keep identical to frontend PermissionKey union.
 * Prevents permission injection (unknown keys are discarded).
 */
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

function sanitizePerms(input: Record<string, boolean> | null | undefined): Record<PermissionKey, boolean> {
  const src = input || {};
  const out: any = {};
  for (const k of ALL_PERMISSION_KEYS) out[k] = !!src[k];
  return out;
}

export async function POST(req: NextRequest) {
  let sb: ReturnType<typeof supabaseAdmin>;
  try {
    sb = supabaseAdmin();
  } catch (e: any) {
    console.error("supabaseAdmin init failed:", e);
    return jsonError(500, "Supabase admin client misconfigured");
  }

  try {
    /* =========================
       1) Parse + validate input
    ========================= */
    const body = await safeJson(req);
    if (!body) return jsonError(400, "Invalid JSON body");

    const user_id = s(body.user_id);
    if (!user_id) return jsonError(400, "user_id required");
    if (!isUuid(user_id)) return jsonError(400, "Invalid user_id (UUID expected)");

    // Admin context (for audit)
    const adminId = s(req.headers.get("x-user-id"));
    const userAgent = req.headers.get("user-agent") || "";
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip")?.trim() ||
      null;

    // Normalize + validate role (if provided)
    let nextRole: AppRole | undefined = undefined;
    if (typeof body.role !== "undefined") {
      const raw = String(body.role).toLowerCase().trim();
      if (!isRole(raw)) return jsonError(400, "Invalid role");
      nextRole = raw;
    }

    // Password rules (if provided)
    const resetPwd = s(body.reset_password);
    if (resetPwd && resetPwd.length < 8) {
      return jsonError(400, "Password too short (min 8 characters)");
    }

    /* =========================
       2) Snapshot (best-effort)
    ========================= */
    let before: any = null;
    try {
      const { data: rp } = await sb
        .from("rp_users")
        .select("username,name,role,is_active,permissions")
        .eq("user_id", user_id)
        .maybeSingle();
      const { data: p } = await sb.from("profiles").select("full_name,role").eq("id", user_id).maybeSingle();
      before = { rp, profile: p };
    } catch {
      // ignore
    }

    /* =========================
       3) Build patches
    ========================= */
    const patchProfile: any = {};
    const patchRp: any = {};

    if (typeof body.full_name !== "undefined") {
      const nm = s(body.full_name) || null;
      patchProfile.full_name = nm;
      patchRp.name = nm;
    }

    if (typeof nextRole !== "undefined") {
      patchProfile.role = nextRole;
      patchRp.role = nextRole;
    }

    if (typeof body.is_active !== "undefined") {
      patchRp.is_active = !!body.is_active;
    }

    if (typeof body.permissions !== "undefined") {
      patchRp.permissions = sanitizePerms(body.permissions);
    }

    /* =========================
       4) Apply updates
    ========================= */
    if (Object.keys(patchProfile).length) {
      const { error } = await sb.from("profiles").update(patchProfile).eq("id", user_id);
      if (error) return jsonError(400, `profiles update failed: ${error.message}`);
    }

    if (Object.keys(patchRp).length) {
      const { error } = await sb.from("rp_users").update(patchRp).eq("user_id", user_id);
      if (error) return jsonError(400, `rp_users update failed: ${error.message}`);
    }

    if (resetPwd) {
      const { error } = await sb.auth.admin.updateUserById(user_id, { password: resetPwd });
      if (error) return jsonError(400, `auth password update failed: ${error.message}`);
    }

    /* =========================
       5) After snapshot (best-effort)
    ========================= */
    let after: any = null;
    try {
      const { data: rp } = await sb
        .from("rp_users")
        .select("username,name,role,is_active,permissions")
        .eq("user_id", user_id)
        .maybeSingle();
      const { data: p } = await sb.from("profiles").select("full_name,role").eq("id", user_id).maybeSingle();
      after = { rp, profile: p };
    } catch {
      // ignore
    }

    /* =========================
       6) Audit log (best-effort)
    ========================= */
    if (adminId && isUuid(adminId)) {
      try {
        await sb.from("user_activity").insert({
          user_id: adminId,
          event: "user.update",
          entity: "user",
          entity_id: user_id,
          meta: {
            changed: {
              full_name: typeof body.full_name !== "undefined",
              role: typeof nextRole !== "undefined",
              is_active: typeof body.is_active !== "undefined",
              permissions: typeof body.permissions !== "undefined",
              reset_password: !!resetPwd,
            },
            before,
            after,
          },
          ip,
          user_agent: userAgent,
        });
      } catch (e: any) {
        console.warn("Audit log failed (ignored):", e?.message);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("Update user route error:", e);
    return jsonError(500, e?.message || "Failed");
  }
}
