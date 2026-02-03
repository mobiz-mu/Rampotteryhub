import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/src/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AppRole = "admin" | "manager" | "accountant" | "sales" | "viewer";

type Body = {
  email: string;
  password?: string;
  full_name?: string;
  role: AppRole;
  is_active?: boolean;
  permissions?: Record<string, boolean>;
};

function s(v: any) {
  return String(v ?? "").trim();
}

export async function POST(req: NextRequest) {
  try {
    const sb = supabaseAdmin();

    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
    }

    const email = s(body.email).toLowerCase();
    if (!email) return NextResponse.json({ ok: false, error: "Email is required" }, { status: 400 });

    const role = (body.role || "viewer") as AppRole;
    const full_name = s(body.full_name) || null;
    const is_active = body.is_active ?? true;
    const permissions = body.permissions ?? {};

    const password =
      s(body.password) && s(body.password).length >= 6
        ? s(body.password)
        : Math.random().toString(16).slice(2) + "A!9x";

    // 1) create auth user
    const { data: created, error: createErr } = await sb.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
    });

    if (createErr) {
      return NextResponse.json({ ok: false, error: createErr.message }, { status: 400 });
    }

    const userId = created.user.id; // uuid

    // 2) profiles (your schema: id uuid, role text, full_name text, created_at default now())
    const { error: pErr } = await sb.from("profiles").upsert({
      id: userId,
      role,
      full_name,
    });

    if (pErr) return NextResponse.json({ ok: false, error: pErr.message }, { status: 400 });

    // 3) rp_users (username=email, unique)
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

    if (rpErr) return NextResponse.json({ ok: false, error: rpErr.message }, { status: 400 });

    return NextResponse.json({
      ok: true,
      user_id: userId,
      temp_password: s(body.password) ? null : password,
    });
  } catch (e: any) {
    console.error("Create user route error:", e);
    return NextResponse.json({ ok: false, error: e?.message || "Failed" }, { status: 500 });
  }
}
