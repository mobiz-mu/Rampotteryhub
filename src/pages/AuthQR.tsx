// src/pages/AuthQR.tsx
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
      const r = await fetch("/api/qr/create", { method: "GET" });
      const j = (await r.json()) as CreateResp;
      if (!j.ok || !j.token || !j.approveUrl) throw new Error(j.error || "Failed to create QR token");
      setToken(j.token);
      setApproveUrl(j.approveUrl);
      setStatus("PENDING");
    } catch (e: any) {
      setErr(e?.message || "Failed to create QR");
      setToken(null);
      setApproveUrl(null);
    } finally {
      setBusy(false);
    }
  }

  async function poll(t: string) {
    try {
      const r = await fetch(`/api/qr/status?token=${encodeURIComponent(t)}`);
      const j = (await r.json()) as StatusResp;
      if (!j.ok) return;

      const st = j.status || "PENDING";
      setStatus(st);

      if (st === "APPROVED") {
        localStorage.setItem("rp_qr_session", JSON.stringify({ token: t, payload: j.payload, at: Date.now() }));
        if (pollRef.current) window.clearInterval(pollRef.current);
        nav("/dashboard", { replace: true });
      }

      if (st === "EXPIRED") {
        if (pollRef.current) window.clearInterval(pollRef.current);
      }
    } catch {
      // ignore transient errors
    }
  }

  useEffect(() => {
    createToken();
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!token) return;

    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = window.setInterval(() => poll(token), 1500);

    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const hint = useMemo(() => {
    if (busy) return "Generating secure QR…";
    if (err) return "Could not generate QR. Try again.";
    if (status === "PENDING") return "Scan with your phone to approve sign-in.";
    if (status === "APPROVED") return "Approved. Signing you in…";
    if (status === "EXPIRED") return "QR expired. Generate a new one.";
    return "";
  }, [busy, err, status]);

  const showNoQR = !approveUrl && !busy;

  return (
    <div className="rp-authRoot min-h-screen relative flex items-center justify-center p-6 bg-background text-foreground overflow-hidden">
      {/* ===== Premium animated orbs (MAX 4 COLORS) ===== */}
      <div className="rp-orbs pointer-events-none absolute inset-0 -z-10">
        <span className="rp-orb rp-orbRed" />
        <span className="rp-orb rp-orbBlue" />
        <span className="rp-orb rp-orbYellow" />
        <span className="rp-orb rp-orbGreen" />
      </div>

      {/* soft vignette */}
      <div className="pointer-events-none absolute inset-0 -z-10 rp-vignette" />

      <div className="relative w-full max-w-md">
        {/* Card */}
        <div className="rp-card rounded-2xl border bg-card/85 backdrop-blur-xl p-6 shadow-premium text-center">
          <div className="rp-enter">
            <div className="text-2xl font-semibold tracking-tight">Ram Pottery Hub</div>
            <div className="text-sm text-muted-foreground mt-1">{hint}</div>
          </div>

          {/* QR */}
          <div className="mt-6 flex items-center justify-center rp-enterDelay">
            {approveUrl ? (
              <div className="rounded-2xl border bg-white p-4 shadow-[0_18px_50px_rgba(0,0,0,.12)]">
                <QRCodeCanvas value={approveUrl} size={220} includeMargin />
              </div>
            ) : (
              <div className="relative">
                <div className="h-[260px] w-[260px] rounded-2xl border bg-muted/40 flex items-center justify-center text-sm text-muted-foreground">
                  {busy ? "Loading…" : "No QR"}
                </div>

                {/* comic pointer near empty QR */}
                {showNoQR && (
                  <div className="rp-comicPointer rp-comicPointerQR" aria-hidden="true">
                    <span className="rp-comicBubble">Click “New QR”</span>
                    <span className="rp-comicArrow" />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* error */}
          {err && (
            <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive text-left">
              {err}
            </div>
          )}

          {/* buttons */}
          <div className="mt-5 flex gap-2">
            <button
              className="flex-1 rounded-xl border px-4 py-2 text-sm hover:bg-muted/30 transition disabled:opacity-60"
              onClick={createToken}
              disabled={busy}
            >
              {busy ? "Please wait…" : "New QR"}
            </button>

            {approveUrl && (
              <div className="relative flex-1">
                <a
                  className="block w-full rounded-xl px-4 py-2 text-sm text-primary-foreground gradient-primary shadow-glow hover:opacity-95 transition"
                  href={approveUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open on phone
                </a>

                {/* comic pointer next to open button */}
                <div className="rp-comicPointer rp-comicPointerBtn" aria-hidden="true" title="Open on phone">
                  <span className="rp-comicBubble">Tap here</span>
                  <span className="rp-comicArrow" />
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 text-xs text-muted-foreground">Scan → approve → desktop signs in.</div>
        </div>
      </div>

      <style>{`
        /* =========================
           Same premium scene as Auth.tsx
        ========================== */
        .rp-authRoot{
          background:
            radial-gradient(circle at 18% 12%, rgba(255,255,255,.06), transparent 45%),
            radial-gradient(circle at 80% 18%, rgba(255,255,255,.05), transparent 45%),
            radial-gradient(circle at 50% 100%, rgba(255,255,255,.03), transparent 55%);
        }
        .rp-vignette{
          background:
            radial-gradient(circle at 50% 40%, transparent 0%, rgba(0,0,0,.22) 70%, rgba(0,0,0,.40) 100%);
          opacity: .55;
        }

        /* =========================
           4 orbs (premium + subtle)
        ========================== */
        .rp-orbs{ position:absolute; inset:0; overflow:hidden; }
        .rp-orb{
          position:absolute;
          width: 220px;
          height: 220px;
          border-radius: 9999px;
          opacity: .38;
          mix-blend-mode: screen;
          transform: translateZ(0);
        }
        .rp-orb::after{
          content:"";
          position:absolute;
          inset:-22px;
          border-radius: 9999px;
          filter: blur(18px);
          opacity: .65;
        }

        .rp-orbRed{
          left: -90px; top: 120px;
          background: rgba(220,38,38,.58);
          animation: rpOrbA 10.5s ease-in-out infinite;
        }
        .rp-orbRed::after{ background: rgba(220,38,38,.26); }

        .rp-orbBlue{
          right: -110px; top: 80px;
          background: rgba(37,99,235,.50);
          animation: rpOrbB 12.5s ease-in-out infinite;
        }
        .rp-orbBlue::after{ background: rgba(37,99,235,.22); }

        .rp-orbYellow{
          left: 60px; bottom: -140px;
          background: rgba(234,179,8,.45);
          animation: rpOrbC 11.5s ease-in-out infinite;
        }
        .rp-orbYellow::after{ background: rgba(234,179,8,.20); }

        .rp-orbGreen{
          right: 30px; bottom: -150px;
          background: rgba(34,197,94,.42);
          animation: rpOrbD 13.5s ease-in-out infinite;
        }
        .rp-orbGreen::after{ background: rgba(34,197,94,.18); }

        @keyframes rpOrbA{
          0%   { transform: translate(0,0) rotate(0deg) scale(1); }
          50%  { transform: translate(45px,-18px) rotate(150deg) scale(1.06); }
          100% { transform: translate(0,0) rotate(300deg) scale(1); }
        }
        @keyframes rpOrbB{
          0%   { transform: translate(0,0) rotate(0deg) scale(1); }
          50%  { transform: translate(-40px,24px) rotate(-140deg) scale(1.05); }
          100% { transform: translate(0,0) rotate(-280deg) scale(1); }
        }
        @keyframes rpOrbC{
          0%   { transform: translate(0,0) rotate(0deg) scale(1); }
          50%  { transform: translate(18px,-40px) rotate(160deg) scale(1.08); }
          100% { transform: translate(0,0) rotate(320deg) scale(1); }
        }
        @keyframes rpOrbD{
          0%   { transform: translate(0,0) rotate(0deg) scale(1); }
          50%  { transform: translate(-22px,-35px) rotate(-160deg) scale(1.06); }
          100% { transform: translate(0,0) rotate(-320deg) scale(1); }
        }

        /* =========================
           Card premium look
        ========================== */
        .rp-card{
          position: relative;
          border-color: rgba(255,255,255,.10);
          box-shadow: 0 28px 80px rgba(0,0,0,.40);
        }
        .rp-card::before{
          content:"";
          position:absolute;
          inset:-1px;
          border-radius: 1rem;
          background: linear-gradient(135deg,
            rgba(220,38,38,.22),
            rgba(37,99,235,.14),
            rgba(234,179,8,.12),
            rgba(34,197,94,.12)
          );
          filter: blur(16px);
          opacity: .55;
          z-index:-1;
        }

        /* entrance */
        .rp-enter{ animation: rpFadeUp .5s ease both; }
        .rp-enterDelay{ animation: rpFadeUp .6s ease both; animation-delay: .08s; }
        @keyframes rpFadeUp{
          from{ opacity:0; transform: translateY(10px); }
          to{ opacity:1; transform: translateY(0); }
        }

        /* =========================
           Comic pointers (same style)
        ========================== */
        .rp-comicPointer{
          position:absolute;
          display:flex;
          align-items:center;
          gap:10px;
          pointer-events:none;
          animation: rpNudge 1.6s ease-in-out infinite;
          z-index: 2;
        }
        @keyframes rpNudge{
          0%,100%{ transform: translateX(0); }
          50%{ transform: translateX(4px); }
        }
        .rp-comicBubble{
          display:inline-flex;
          align-items:center;
          justify-content:center;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: .2px;
          color: rgba(255,255,255,.95);
          padding: 7px 10px;
          border-radius: 999px;
          background: rgba(127,29,29,.92);
          border: 1px solid rgba(255,255,255,.16);
          box-shadow: 0 14px 38px rgba(0,0,0,.35);
          white-space: nowrap;
        }
        .rp-comicArrow{
          width: 18px;
          height: 18px;
          background: rgba(127,29,29,.92);
          border-left: 1px solid rgba(255,255,255,.16);
          border-bottom: 1px solid rgba(255,255,255,.16);
          transform: rotate(45deg);
          border-radius: 4px;
          margin-left: -12px;
          box-shadow: 0 14px 38px rgba(0,0,0,.25);
        }

        /* pointer positions */
        .rp-comicPointerQR{
          right: -14px;
          top: 26px;
        }
        .rp-comicPointerBtn{
          right: -14px;
          top: 50%;
          transform: translateY(-50%);
          animation-name: rpNudgeBtn;
        }
        @keyframes rpNudgeBtn{
          0%,100%{ transform: translateY(-50%) translateX(0); }
          50%{ transform: translateY(-50%) translateX(4px); }
        }

        /* small screens: keep pointers inside */
        @media (max-width: 420px){
          .rp-comicPointerQR{ right: 10px; top: -6px; }
          .rp-comicPointerBtn{ right: 10px; }
          .rp-comicArrow{ display:none; }
        }
      `}</style>
    </div>
  );
}
