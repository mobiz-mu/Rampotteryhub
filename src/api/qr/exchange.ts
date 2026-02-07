// src/api/qr/exchange.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "../_lib/supabaseAdmin";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "POST only" });
    }

    const { token } = req.body || {};
    if (!token) return res.status(400).json({ ok: false, error: "Missing token" });

    const sb = supabaseAdmin();

    const { data, error } = await sb
      .from("qr_logins")
      .select("status, user_id, expires_at, used_at")
      .eq("token", token)
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ ok: false, error: "Token not found" });

    if (data.used_at) {
      return res.status(400).json({ ok: false, error: "Token already used" });
    }

    if (data.status !== "APPROVED") {
      return res.status(400).json({ ok: false, error: "Token not approved" });
    }

    if (new Date(data.expires_at).getTime() < Date.now()) {
      return res.status(400).json({ ok: false, error: "Token expired" });
    }

    if (!data.user_id) {
      return res.status(400).json({ ok: false, error: "No user bound to token" });
    }

    // 🔑 Create real Supabase session
    const { data: session, error: sErr } =
      await sb.auth.admin.createSession({ userId: data.user_id });

    if (sErr || !session) {
      return res.status(500).json({ ok: false, error: "Failed to create session" });
    }

    // Mark token as used (replay protection)
    await sb
      .from("qr_logins")
      .update({ used_at: new Date().toISOString() })
      .eq("token", token);

    return res.status(200).json({
      ok: true,
      session,
    });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || "Exchange failed" });
  }
}
