import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "../_lib/supabaseAdmin";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST only" });

    const { token, phone, username } = req.body || {};
    if (!token) return res.status(400).json({ ok: false, error: "Missing token" });

    const sb = supabaseAdmin();

    // Validate token + not expired
    const { data, error } = await sb
      .from("qr_logins")
      .select("status, expires_at")
      .eq("token", token)
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ ok: false, error: "Token not found" });

    const expired = new Date(data.expires_at).getTime() < Date.now();
    if (expired) return res.status(400).json({ ok: false, error: "Token expired" });
    if (data.status !== "PENDING") return res.status(400).json({ ok: false, error: "Token already used" });

    // Approve with payload (customize anything you want)
    const payload = {
      phone: phone || null,
      username: username || null,
      approvedAt: new Date().toISOString(),
    };

    const { error: uerr } = await sb
      .from("qr_logins")
      .update({ status: "APPROVED", payload })
      .eq("token", token);

    if (uerr) throw uerr;

    res.status(200).json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || "Failed to approve" });
  }
}
