import type { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "crypto";
import { supabaseAdmin } from "../_lib/supabaseAdmin";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const sb = supabaseAdmin();

    const token = crypto.randomBytes(24).toString("base64url");
    const now = new Date();
    const expires = new Date(now.getTime() + 3 * 60 * 1000); // 3 minutes

    const { error } = await sb.from("qr_logins").insert({
      token,
      status: "PENDING",
      expires_at: expires.toISOString(),
    });

    if (error) throw error;

    const origin = process.env.APP_ORIGIN || "";
    const approveUrl = `${origin}/qr/approve?token=${encodeURIComponent(token)}`;

    res.status(200).json({
      ok: true,
      token,
      approveUrl,
      expiresAt: expires.toISOString(),
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || "Failed to create token" });
  }
}
