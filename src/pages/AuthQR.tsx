// src/pages/AuthQR.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { QRCodeCanvas } from "qrcode.react";
import { Copy, RefreshCw, ShieldCheck, Smartphone, AlertTriangle, Clock } from "lucide-react";

type CreateResp = {
  ok: boolean;
  token?: string;
  approveUrl?: string;
  expiresAt?: string; // ISO string
  error?: string;
};

type StatusResp = {
  ok: boolean;
  status?: "PENDING" | "APPROVED" | "EXPIRED";
  payload?: any;
  error?: string;
};

function s(v: any) {
  return String(v ?? "").trim();
}

/** Hardened JSON reader to avoid “unexpected JSON input” */
async function safeJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text || !text.trim()) throw new Error(`Empty response (HTTP ${res.status}).`);
  try {
    return JSON.parse(text) as T;
  } catch {
    const snippet = text.slice(0, 220).replace(/\s+/g, " ").trim();
    throw new Error(`Server did not return JSON (HTTP ${res.status}): "${snippet}${text.length > 220 ? "…" : ""}"`);
  }
}

/** ms until expires, clamp to 0 */
function msUntil(iso?: string | null) {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, t - Date.now());
}

function fmtSecs(ms: number) {
  const sec = Math.ceil(ms / 1000);
  if (sec <= 0) return "0s";
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const r = sec % 60;
  return `${m}m ${r}s`;
}

export default function AuthQR() {
  const nav = useNavigate();

  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [token, setToken] = useState<string | null>(null);
  const [approveUrl, setApproveUrl] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);

  const [status, setStatus] = useState<"PENDING" | "APPROVED" | "EXPIRED" | null>(null);

  // Poll/backoff refs
  const stoppedRef = useRef(false);
  const pollTimerRef = useRef<number | null>(null);
  const backoffRef = useRef(1200); // start 1.2s, grow to max
  const attemptRef = useRef(0);

  // expiry tick timer
  const expiryTickRef = useRef<number | null>(null);
  const [timeLeftMs, setTimeLeftMs] = useState(0);

  function stopAllTimers() {
    if (pollTimerRef.current) window.clearTimeout(pollTimerRef.current);
    if (expiryTickRef.current) window.clearInterval(expiryTickRef.current);
    pollTimerRef.current = null;
    expiryTickRef.current = null;
  }

  function resetStateForNew() {
    setErr(null);
    setStatus(null);
    setToken(null);
    setApproveUrl(null);
    setExpiresAt(null);
    setTimeLeftMs(0);
    backoffRef.current = 1200;
    attemptRef.current = 0;
  }

  async function createToken() {
    stopAllTimers();
    stoppedRef.current = false;
    resetStateForNew();
    setBusy(true);

    try {
      const r = await fetch("/api/qr/create", { method: "GET" });
      const j = await safeJson<CreateResp>(r);

      if (!j.ok || !j.token || !j.approveUrl) {
        throw new Error(j.error || "Failed to create QR token");
      }

      setToken(j.token);
      setApproveUrl(j.approveUrl);
      setExpiresAt(j.expiresAt || null);
      setStatus("PENDING");

      // Start expiry ticker
      const initialMs = msUntil(j.expiresAt || null);
      setTimeLeftMs(initialMs);
      expiryTickRef.current = window.setInterval(() => {
        setTimeLeftMs((prev) => {
          const next = msUntil(j.expiresAt || null);
          return next;
        });
      }, 500);

      // Start polling loop
      schedulePoll(j.token);
    } catch (e: any) {
      setErr(e?.message || "Failed to create QR");
      setStatus(null);
      stoppedRef.current = true;
    } finally {
      setBusy(false);
    }
  }

  function schedulePoll(t: string) {
    if (stoppedRef.current) return;

    const delay = Math.min(backoffRef.current, 5000);
    pollTimerRef.current = window.setTimeout(() => pollOnce(t), delay);
  }

  async function pollOnce(t: string) {
    if (stoppedRef.current) return;

    attemptRef.current += 1;

    // If expired by time, stop early (client-side guard)
    if (expiresAt && msUntil(expiresAt) <= 0) {
      setStatus("EXPIRED");
      stoppedRef.current = true;
      stopAllTimers();
      return;
    }

    try {
      const r = await fetch(`/api/qr/status?token=${encodeURIComponent(t)}`, { method: "GET" });
      const j = await safeJson<StatusResp>(r);

      if (!j.ok) {
        // backoff grows on server problems
        backoffRef.current = Math.min(backoffRef.current + 600, 5000);
        schedulePoll(t);
        return;
      }

      const st = j.status || "PENDING";
      setStatus(st);

      if (st === "APPROVED") {
        // safer than localStorage for session token usage
        const r = await fetch("/api/qr/exchange", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
     });

        const j = await r.json();
        if (!j.ok) throw new Error(j.error || "Exchange failed");

        // 🔐 REAL LOGIN
       await supabase.auth.setSession({
       access_token: j.session.access_token,
       refresh_token: j.session.refresh_token,
    });

      nav("/dashboard", { replace: true });

        return;
      }

      if (st === "EXPIRED") {
        stoppedRef.current = true;
        stopAllTimers();
        return;
      }

      // Pending: light backoff increase to reduce spam
      backoffRef.current = Math.min(backoffRef.current + 250, 3500);
      schedulePoll(t);
    } catch {
      // transient network error => increase backoff
      backoffRef.current = Math.min(backoffRef.current + 800, 5000);
      schedulePoll(t);
    }
  }

  useEffect(() => {
    createToken();
    return () => {
      stoppedRef.current = true;
      stopAllTimers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hint = useMemo(() => {
    if (busy) return "Generating secure QR…";
    if (err) return "Could not generate QR. Please try again.";
    if (status === "PENDING") return "Scan with your phone to approve sign-in.";
    if (status === "APPROVED") return "Approved. Signing you in…";
    if (status === "EXPIRED") return "QR expired. Generate a new one.";
    return "";
  }, [busy, err, status]);

  const expiryLabel = useMemo(() => {
    if (!expiresAt) return null;
    if (status === "APPROVED") return null;
    return timeLeftMs > 0 ? `Expires in ${fmtSecs(timeLeftMs)}` : "Expired";
  }, [expiresAt, timeLeftMs, status]);

  const canOpen = !!approveUrl && status === "PENDING";
  const canCopy = !!approveUrl;

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

      <div className="relative w-full max-w-[520px]">
        {/* Card */}
        <div className="rp-card rounded-2xl border bg-card/85 backdrop-blur-xl p-6 shadow-premium">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-2xl border bg-muted/20 flex items-center justify-center">
                <ShieldCheck className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <div className="text-2xl font-semibold tracking-tight">Ram Pottery Hub</div>
                <div className="text-sm text-muted-foreground mt-1">{hint}</div>
              </div>
            </div>

            {expiryLabel ? (
              <div className="inline-flex items-center gap-2 rounded-xl border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>{expiryLabel}</span>
              </div>
            ) : null}
          </div>

          {/* QR */}
          <div className="mt-6 flex items-center justify-center">
            {approveUrl ? (
              <div className="rounded-2xl border bg-white p-4 shadow-[0_18px_50px_rgba(0,0,0,.12)]">
                <QRCodeCanvas value={approveUrl} size={230} includeMargin />
              </div>
            ) : (
              <div className="h-[270px] w-[270px] rounded-2xl border bg-muted/40 flex items-center justify-center text-sm text-muted-foreground">
                {busy ? "Loading…" : "No QR"}
              </div>
            )}
          </div>

          {/* Status chips */}
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <span
              className={
                "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold " +
                (status === "PENDING"
                  ? "bg-sky-500/10 text-sky-700 border-sky-200"
                  : status === "APPROVED"
                  ? "bg-emerald-500/10 text-emerald-700 border-emerald-200"
                  : status === "EXPIRED"
                  ? "bg-amber-500/10 text-amber-800 border-amber-200"
                  : "bg-muted/20 text-muted-foreground border-muted")
              }
            >
              {status || "—"}
            </span>

            {token ? (
              <span className="inline-flex items-center rounded-full border bg-muted/20 px-3 py-1 text-xs text-muted-foreground">
                Token: <span className="ml-1 font-mono">{token.slice(0, 8)}…</span>
              </span>
            ) : null}
          </div>

          {/* error */}
          {err && (
            <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5" />
                <div className="min-w-0">{err}</div>
              </div>
            </div>
          )}

          {/* actions */}
          <div className="mt-5 grid gap-2 sm:grid-cols-3">
            <button
              className="rounded-xl border px-4 py-2 text-sm hover:bg-muted/30 transition disabled:opacity-60"
              onClick={createToken}
              disabled={busy}
            >
              <RefreshCw className="inline-block h-4 w-4 mr-2" />
              {busy ? "Please wait…" : "New QR"}
            </button>

            <button
              className="rounded-xl border px-4 py-2 text-sm hover:bg-muted/30 transition disabled:opacity-60"
              disabled={!canCopy}
              onClick={async () => {
                try {
                  if (!approveUrl) return;
                  await navigator.clipboard.writeText(approveUrl);
                } catch {
                  // ignore
                }
              }}
              title={approveUrl ? "Copy the approval link" : "No link yet"}
            >
              <Copy className="inline-block h-4 w-4 mr-2" />
              Copy link
            </button>

            <a
              className={
                "rounded-xl px-4 py-2 text-sm text-center text-primary-foreground gradient-primary shadow-glow hover:opacity-95 transition " +
                (!canOpen ? "pointer-events-none opacity-50" : "")
              }
              href={approveUrl || "#"}
              target="_blank"
              rel="noreferrer"
              title={approveUrl ? "Open approval on phone" : "No link yet"}
            >
              <Smartphone className="inline-block h-4 w-4 mr-2" />
              Open on phone
            </a>
          </div>

          <div className="mt-4 text-xs text-muted-foreground text-center">
            Scan → approve → desktop signs in. Tokens expire automatically.
          </div>
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

        /* 4 orbs */
        .rp-orbs{ position:absolute; inset:0; overflow:hidden; }
        .rp-orb{
          position:absolute;
          width: 220px;
          height: 220px;
          border-radius: 9999px;
          opacity: .34;
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

        /* Card premium */
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
      `}</style>
    </div>
  );
}
