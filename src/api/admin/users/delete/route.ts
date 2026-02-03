
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/src/lib/supabaseAdmin";

type Body = { user_id: string };

function s(v: any) {
  return String(v ?? "").trim();
}

export async function POST(req: NextRequest) {
  try {
    const sb = supabaseAdmin();
    const body = (await req.json()) as Body;

    const user_id = s(body.user_id);
    if (!user_id) return NextResponse.json({ ok: false, error: "user_id required" }, { status: 400 });

    // delete app rows first
    await sb.from("rp_users").delete().eq("user_id", user_id);
    await sb.from("profiles").delete().eq("id", user_id);

    // delete auth user
    const { error } = await sb.auth.admin.deleteUser(user_id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Failed" }, { status: 500 });
  }
}
