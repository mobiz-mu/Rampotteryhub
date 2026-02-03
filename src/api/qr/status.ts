import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "../_lib/supabaseAdmin";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const token = String(req.query.token || "");
    if (!token) return res.status(400).json({ ok: false, error: "Missing token" });

    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from("qr_logins")
      .select("status, payload, expires_at")
      .eq("token", token)
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ ok: false, error: "Token not found" });

    const expired = new Date(data.expires_at).getTime() < Date.now();
    if (expired && data.status === "PENDING") {
      await sb.from("qr_logins").update({ status: "EXPIRED" }).eq("token", token);
      return res.status(200).json({ ok: true, status: "EXPIRED" });
    }

    return res.status(200).json({ ok: true, status: data.status, payload: data.payload ?? null });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || "Failed" });
  }
}
