// server/routes/publicLinks.ts
import express from "express";
import crypto from "crypto";
import { supaAdmin } from "../supabaseAdmin";

export function publicLinksRouter(opts: {
  requireUser: (req: express.Request, res: express.Response) => Promise<any | null>;
}) {
  const { requireUser } = opts;
  const router = express.Router();

  function num(v: any) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  // POST /api/invoices/:id/public-link
  // body: { expiresDays?: number }  (optional)
  router.post("/invoices/:id/public-link", async (req, res) => {
    try {
      const user = await requireUser(req, res);
      if (!user) return;

      const invoiceId = num(req.params.id);
      if (!invoiceId) return res.status(400).json({ ok: false, error: "Invalid invoice id" });

      const expiresDays = num(req.body?.expiresDays);
      const expiresAt =
        expiresDays > 0 ? new Date(Date.now() + expiresDays * 24 * 60 * 60 * 1000).toISOString() : null;

      const supabase = supaAdmin();

      // read existing token
      const { data: inv, error: invErr } = await supabase
        .from("invoices")
        .select("id, public_token, public_token_revoked, public_token_expires_at")
        .eq("id", invoiceId)
        .maybeSingle();

      if (invErr) throw invErr;
      if (!inv) return res.status(404).json({ ok: false, error: "Invoice not found" });

      // reuse token if valid
      const stillValid =
        !!inv.public_token &&
        !inv.public_token_revoked &&
        (!inv.public_token_expires_at || new Date(inv.public_token_expires_at).getTime() >= Date.now());

      if (stillValid) {
        return res.json({
          ok: true,
          invoiceId,
          token: inv.public_token,
          expires_at: inv.public_token_expires_at || null,
          reused: true,
        });
      }

      const token = crypto.randomUUID();

      const { error: updErr } = await supabase
        .from("invoices")
        .update({
          public_token: token,
          public_token_revoked: false,
          public_token_expires_at: expiresAt,
        })
        .eq("id", invoiceId);

      if (updErr) throw updErr;

      return res.json({ ok: true, invoiceId, token, expires_at: expiresAt, reused: false });
    } catch (e: any) {
      return res.status(500).json({ ok: false, error: e?.message || "Server error" });
    }
  });

  // POST /api/invoices/:id/public-link/revoke
  router.post("/invoices/:id/public-link/revoke", async (req, res) => {
    try {
      const user = await requireUser(req, res);
      if (!user) return;

      const invoiceId = num(req.params.id);
      if (!invoiceId) return res.status(400).json({ ok: false, error: "Invalid invoice id" });

      const supabase = supaAdmin();
      const { error } = await supabase
        .from("invoices")
        .update({ public_token_revoked: true })
        .eq("id", invoiceId);

      if (error) throw error;

      return res.json({ ok: true, invoiceId });
    } catch (e: any) {
      return res.status(500).json({ ok: false, error: e?.message || "Server error" });
    }
  });

  return router;
}
