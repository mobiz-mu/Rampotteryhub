// src/app/api/admin/users/create/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/src/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AppRole = "admin" | "manager" | "accountant" | "sales" | "viewer";

type Body = {
  email: string;
  password?: string;
  full_name?: string;
  role?: AppRole;
  is_active?: boolean;
  permissions?: Record<string, boolean>;
};

function s(v: any) {
  return String(v ?? "").trim();
}

function isEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim().toLowerCase());
}

function genTempPassword() {
  // 14-18 chars, includes upper/lower/num/symbol
  const base = Math.random().toString(36).slice(2);
  const extra = Math.random().toString(36).slice(2);
  return (base + extra).slice(0, 14) + "A!9";
}

function sanitizePermissions(input: any) {
  // Prevent weird JSON types / prototypes. Store a plain object of booleans only.
  const src = input && typeof input === "object" ? input : {};
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(src)) {
    // only accept simple keys, and coerce to boolean
    if (typeof k === "string" && k.length <= 64) out[k] = !!v;
  }
  return out;
}

function jsonError(status: number, error: string, extra?: Record<string, any>) {
  return NextResponse.json({ ok: false, error, ...(extra || {}) }, { status });
}

export async function POST(req: NextRequest) {
  // Always return JSON — never allow “empty 500”
  let sb: ReturnType<typeof supabaseAdmin>;
  try {
    sb = supabaseAdmin();
  } catch (e: any) {
    console.error("supabaseAdmin misconfigured:", e);
    return jsonError(500, e?.message || "Supabase admin client misconfigured");
  }

  // Parse body safely
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return jsonError(400, "Invalid JSON body");
  }

  // Validate inputs
  const email = s(body.email).toLowerCase();
  if (!email) return jsonError(400, "Email is required");
  if (!isEmail(email)) return jsonError(400, "Invalid email address");

  const role: AppRole = (body.role || "viewer") as AppRole;
  const full_name = s(body.full_name) || null;
  const is_active = typeof body.is_active === "boolean" ? body.is_active : true;
  const permissions = sanitizePermissions(body.permissions);

  // Password policy (client can pass password, else generate)
  const providedPassword = s(body.password);
  if (providedPassword && providedPassword.length < 8) {
    return jsonError(400, "Password must be at least 8 characters (or leave blank to auto-generate)");
  }
  const password = providedPassword ? providedPassword : genTempPassword();

  // Useful request context for audit
  const userAgent = req.headers.get("user-agent") || "";
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null;

  try {
    /* =========================
       1) CREATE AUTH USER
    ========================= */
    const { data: created, error: createErr } = await sb.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
    });

    if (createErr || !created?.user?.id) {
      return jsonError(400, createErr?.message || "Auth user creation failed");
    }

    const userId = created.user.id;

    /* =========================
       2) PROFILES
    ========================= */
    const { error: pErr } = await sb.from("profiles").upsert({
      id: userId,
      role,
      full_name,
    });

    if (pErr) {
      // rollback auth user to avoid orphan records
      await sb.auth.admin.deleteUser(userId).catch(() => {});
      return jsonError(400, `profiles upsert failed: ${pErr.message}`);
    }

    /* =========================
       3) RP USERS
    ========================= */
    const { error: rpErr } = await sb
      .from("rp_users")
      .upsert(
        {
          user_id: userId,
          username: email,
          name: full_name,
          role,
          permissions,
          is_active,
        },
        { onConflict: "user_id" }
      );

    if (rpErr) {
      // rollback auth user + profile to avoid half-created users
      await sb.from("profiles").delete().eq("id", userId).catch(() => {});
      await sb.auth.admin.deleteUser(userId).catch(() => {});
      return jsonError(400, `rp_users upsert failed: ${rpErr.message}`);
    }

    /* =========================
       4) AUDIT LOG (ADMIN ACTION)
       - Do NOT break user creation if audit fails
       - Determine adminId from a trusted source
    ========================= */
    let adminId: string | null = null;

    // Preferred: the middleware forwards admin id
    const hdrAdminId = req.headers.get("x-user-id");
    if (hdrAdminId && s(hdrAdminId)) adminId = s(hdrAdminId);

    // Fallback: if you later add a server session, replace this with your verified auth user id.
    // (Leaving as-is; audit is optional and must never crash this route.)

    if (adminId) {
      const { error: aErr } = await sb.from("user_activity").insert({
        user_id: adminId,
        event: "user.create",
        entity: "user",
        entity_id: userId,
        meta: { email, role, is_active },
        ip,
        user_agent: userAgent,
      });

      if (aErr) {
        console.warn("user_activity insert failed (ignored):", aErr.message);
      }
    }

    return NextResponse.json({
      ok: true,
      user_id: userId,
      temp_password: providedPassword ? null : password,
    });
  } catch (e: any) {
    console.error("Create user route error:", e);
    // Always return JSON
    return jsonError(500, e?.message || "Failed");
  }
}

