// src/app/api/admin/users/delete/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/src/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { user_id: string };

function s(v: any) {
  return String(v ?? "").trim();
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
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
       1) Parse & validate input
    ========================= */
    const body = await safeJson(req);
    if (!body) return jsonError(400, "Invalid JSON body");

    const user_id = s(body.user_id);
    if (!user_id) return jsonError(400, "user_id required");
    if (!isUuid(user_id)) return jsonError(400, "Invalid user_id (UUID expected)");

    /* =========================
       2) Admin context (audit)
    ========================= */
    const adminId = s(req.headers.get("x-user-id"));
    const userAgent = req.headers.get("user-agent") || "";
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip")?.trim() ||
      null;

    /* =========================
       3) Load target info (audit)
    ========================= */
    let targetEmail: string | null = null;
    let targetName: string | null = null;

    try {
      const { data } = await sb
        .from("rp_users")
        .select("username,name")
        .eq("user_id", user_id)
        .maybeSingle();

      targetEmail = (data as any)?.username ?? null;
      targetName = (data as any)?.name ?? null;
    } catch {
      // ignore lookup failures
    }

    /* =========================
       4) Audit log (best-effort)
    ========================= */
    if (adminId && isUuid(adminId)) {
      try {
        await sb.from("user_activity").insert({
          user_id: adminId,
          event: "user.delete",
          entity: "user",
          entity_id: user_id,
          meta: {
            target_email: targetEmail,
            target_name: targetName,
          },
          ip,
          user_agent: userAgent,
        });
      } catch (e: any) {
        console.warn("Audit log failed (ignored):", e?.message);
      }
    }

    /* =========================
       5) Delete application rows
    ========================= */
    const { error: rpErr } = await sb.from("rp_users").delete().eq("user_id", user_id);
    if (rpErr) return jsonError(400, `rp_users delete failed: ${rpErr.message}`);

    const { error: pErr } = await sb.from("profiles").delete().eq("id", user_id);
    if (pErr) return jsonError(400, `profiles delete failed: ${pErr.message}`);

    /* =========================
       6) Delete auth user LAST
    ========================= */
    const { error: authErr } = await sb.auth.admin.deleteUser(user_id);
    if (authErr) return jsonError(400, `auth delete failed: ${authErr.message}`);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("Delete user route error:", e);
    return jsonError(500, e?.message || "Failed");
  }
}

