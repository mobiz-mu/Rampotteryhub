import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/src/lib/supabaseAdmin";

type AppRole = "admin" | "manager" | "accountant" | "sales" | "viewer";

type Body = {
  user_id: string; // UUID
  full_name?: string;
  role?: AppRole;
  is_active?: boolean;
  permissions?: Record<string, boolean>;
  reset_password?: string;
};

function s(v: any) {
  return String(v ?? "").trim();
}

export async function POST(req: NextRequest) {
  try {
    const sb = supabaseAdmin();
    const body = (await req.json()) as Body;

    const user_id = s(body.user_id);
    if (!user_id) return NextResponse.json({ ok: false, error: "user_id required" }, { status: 400 });

    const patchProfile: any = {};
    if (typeof body.full_name !== "undefined") patchProfile.full_name = s(body.full_name) || null;
    if (typeof body.role !== "undefined") patchProfile.role = body.role;

    if (Object.keys(patchProfile).length) {
      const { error } = await sb.from("profiles").update(patchProfile).eq("id", user_id);
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    const patchRp: any = {};
    if (typeof body.role !== "undefined") patchRp.role = body.role;
    if (typeof body.permissions !== "undefined") patchRp.permissions = body.permissions;
    if (typeof body.is_active !== "undefined") patchRp.is_active = !!body.is_active;
    if (typeof body.full_name !== "undefined") patchRp.name = s(body.full_name) || null;

    if (Object.keys(patchRp).length) {
      const { error } = await sb.from("rp_users").update(patchRp).eq("user_id", user_id);
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    if (s(body.reset_password) && s(body.reset_password).length >= 6) {
      const { error } = await sb.auth.admin.updateUserById(user_id, { password: s(body.reset_password) });
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Failed" }, { status: 500 });
  }
}

