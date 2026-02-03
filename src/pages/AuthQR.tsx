import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { QRCodeCanvas } from "qrcode.react";

type CreateResp = { ok: boolean; token?: string; approveUrl?: string; expiresAt?: string; error?: string };
type StatusResp = { ok: boolean; status?: "PENDING" | "APPROVED" | "EXPIRED"; payload?: any; error?: string };

export default function AuthQR() {
  const nav = useNavigate();
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [token, setToken] = useState<string | null>(null);
  const [approveUrl, setApproveUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<"PENDING" | "APPROVED" | "EXPIRED" | null>(null);

  const pollRef = useRef<number | null>(null);

  async function createToken() {
    setErr(null);
    setBusy(true);
    setStatus(null);

    try {
      const r = await fetch("/api/qr/create");
      const j = (await r.json()) as CreateResp;
      if (!j.ok || !j.token || !j.approveUrl) throw new Error(j.error || "Failed to create QR token");
      setToken(j.token);
      setApproveUrl(j.approveUrl);
      setStatus("PENDING");
    } catch (e: any) {
      setErr(e?.message || "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function poll(t: string) {
    try {
      const r = await fetch(`/api/qr/status?token=${encodeURIComponent(t)}`);
      const j = (await r.json()) as StatusResp;
      if (!j.ok) return;

      setStatus(j.status || "PENDING");

      if (j.status === "APPROVED") {
        // ✅ your “logged in” state: store a lightweight session flag
        // (Later you can map this payload to a Supabase user/session if you want.)
        localStorage.setItem("rp_qr_session", JSON.stringify({ token: t, payload: j.payload, at: Date.now() }));
        if (pollRef.current) window.clearInterval(pollRef.current);
        nav("/dashboard", { replace: true });
      }

      if (j.status === "EXPIRED") {
        if (pollRef.current) window.clearInterval(pollRef.current);
      }
    } catch {
      // ignore transient errors
    }
  }

  useEffect(() => {
    createToken();
  }, []);

  useEffect(() => {
    if (!token) return;

    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = window.setInterval(() => poll(token), 1500);

    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [token]);

  const hint = useMemo(() => {
    if (busy) return "Generating QR…";
    if (err) return "Error creating QR.";
    if (status === "PENDING") return "Scan this QR with your phone to sign in.";
    if (status === "APPROVED") return "Approved. Signing you in…";
    if (status === "EXPIRED") return "QR expired. Generate a new one.";
    return "";
  }, [busy, err, status]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background text-foreground">
      <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-premium text-center">
        <div className="text-2xl font-semibold">RamPottery Hub</div>
        <div className="text-sm text-muted-foreground mt-1">{hint}</div>

        <div className="mt-6 flex items-center justify-center">
          {approveUrl ? (
            <div className="rounded-2xl border bg-white p-4">
              <QRCodeCanvas value={approveUrl} size={220} includeMargin />
            </div>
          ) : (
            <div className="h-[260px] w-[260px] rounded-2xl border bg-muted/40 flex items-center justify-center text-sm text-muted-foreground">
              {busy ? "Loading…" : "No QR"}
            </div>
          )}
        </div>

        {err && (
          <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive text-left">
            {err}
          </div>
        )}

        <div className="mt-5 flex gap-2">
          <button
            className="flex-1 rounded-xl border px-4 py-2 text-sm"
            onClick={() => createToken()}
            disabled={busy}
          >
            New QR
          </button>

          {approveUrl && (
            <a
              className="flex-1 rounded-xl px-4 py-2 text-sm text-primary-foreground gradient-primary shadow-glow"
              href={approveUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open on phone
            </a>
          )}
        </div>

        <div className="mt-4 text-xs text-muted-foreground">
          No email. Scan QR → approve → desktop signs in.
        </div>
      </div>
    </div>
  );
}
