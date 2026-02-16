// src/app/api/admin/users/create/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/src/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* =====================================================
   Types
===================================================== */

type AppRole = "admin" | "manager" | "accountant" | "sales" | "viewer";

type Body = {
  email: string;
  password?: string;
  full_name?: string;
  role?: AppRole;
  is_active?: boolean;
  permissions?: Record<string, boolean>;
};

const VALID_ROLES: AppRole[] = [
  "admin",
  "manager",
  "accountant",
  "sales",
  "viewer",
];

/* =====================================================
   Helpers
===================================================== */

function s(v: any) {
  return String(v ?? "").trim();
}

function isEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim().toLowerCase());
}

function genTempPassword() {
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  let out = "";
  for (let i = 0; i < 16; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function sanitizePermissions(input: any) {
  if (!input || typeof input !== "object") return {};

  const out: Record<string, boolean> = {};

  for (const [k, v] of Object.entries(input)) {
    if (
      typeof k === "string" &&
      k.length <= 64 &&
      /^[a-zA-Z0-9._-]+$/.test(k)
    ) {
      out[k] = !!v;
    }
  }

  return out;
}

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

/* =====================================================
   Route
===================================================== */

export async function POST(req: NextRequest) {
  let sb: ReturnType<typeof supabaseAdmin>;

  try {
    sb = supabaseAdmin();
  } catch (e: any) {
    console.error("Supabase admin init failed:", e);
    return jsonError(500, "Supabase admin client misconfigured");
  }

  let body: Body;

  try {
    body = (await req.json()) as Body;
  } catch {
    return jsonError(400, "Invalid JSON body");
  }

  /* =========================
     Validate Inputs
  ========================= */

  const email = s(body.email).toLowerCase();
  if (!email) return jsonError(400, "Email is required");
  if (!isEmail(email)) return jsonError(400, "Invalid email address");

  const role: AppRole = VALID_ROLES.includes(body.role as AppRole)
    ? (body.role as AppRole)
    : "viewer";

  const full_name = s(body.full_name) || null;
  const is_active =
    typeof body.is_active === "boolean" ? body.is_active : true;

  const permissions = sanitizePermissions(body.permissions);

  const providedPassword = s(body.password);

  if (providedPassword && providedPassword.length < 8) {
    return jsonError(
      400,
      "Password must be at least 8 characters (or leave blank to auto-generate)"
    );
  }

  const password = providedPassword || genTempPassword();

  const userAgent = req.headers.get("user-agent") || "";
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null;

  try {
    /* =========================
       Prevent duplicate email
    ========================= */

    const { data: existing } = await sb.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });

    const alreadyExists = existing?.users?.some(
      (u) => u.email?.toLowerCase() === email
    );

    if (alreadyExists) {
      return jsonError(400, "User with this email already exists");
    }

    /* =========================
       1) CREATE AUTH USER
    ========================= */

    const { data: created, error: createErr } =
      await sb.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name },
      });

    if (createErr || !created?.user?.id) {
      return jsonError(
        400,
        createErr?.message || "Auth user creation failed"
      );
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
      await sb.auth.admin.deleteUser(userId).catch(() => {});
      return jsonError(400, `profiles upsert failed: ${pErr.message}`);
    }

    /* =========================
       3) RP USERS
    ========================= */

    const { error: rpErr } = await sb
      .from("rp_users")
      .insert({
        user_id: userId,
        username: email,
        name: full_name,
        role,
        permissions,
        is_active,
      });

    if (rpErr) {
      await sb.from("profiles").delete().eq("id", userId).catch(() => {});
      await sb.auth.admin.deleteUser(userId).catch(() => {});
      return jsonError(400, `rp_users insert failed: ${rpErr.message}`);
    }

    /* =========================
       4) AUDIT LOG (optional)
    ========================= */

    const adminId = req.headers.get("x-user-id");

    if (adminId) {
      await sb.from("user_activity").insert({
        user_id: adminId,
        event: "user.create",
        entity: "user",
        entity_id: userId,
        meta: { email, role, is_active },
        ip,
        user_agent: userAgent,
      }).catch(() => {});
    }

    /* =========================
       SUCCESS
    ========================= */

    return NextResponse.json({
      ok: true,
      user_id: userId,
      temp_password: providedPassword ? null : password,
    });
  } catch (e: any) {
    console.error("Create user route error:", e);
    return jsonError(500, "Failed to create user");
  }
}

