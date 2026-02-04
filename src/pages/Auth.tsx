// src/pages/Auth.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

function usernameToEmail(u: string) {
  const s = u.trim();
  if (!s) return "";
  if (s.includes("@")) return s;
  return `${s}@rampottery.local`;
}

type LocationState = { from?: string };

export default function Auth() {
  const nav = useNavigate();
  const loc = useLocation();
  const { user, loading, signIn } = useAuth();

  const from = useMemo(() => {
    const p = (loc.state as LocationState | null)?.from;
    return typeof p === "string" && p.startsWith("/") ? p : "/dashboard";
  }, [loc.state]);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (user) nav(from, { replace: true });
  }, [user, from, nav]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);

    try {
      const email = usernameToEmail(username);
      if (!email) {
        setErr("Username is required");
        return;
      }

      const res = await signIn(email, password);
      if (!res.ok) {
        setErr(res.error || "Login failed");
        return;
      }

      nav(from, { replace: true });
    } catch (e: any) {
      setErr(e?.message || "Login failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background text-foreground">
        <div className="text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }

  return (
    <div className="rp-authRoot min-h-screen relative flex items-center justify-center p-6 bg-background text-foreground overflow-hidden">
      {/* ===== Premium animated orbs (MAX 4 COLORS) ===== */}
      <div className="rp-orbs pointer-events-none absolute inset-0 -z-10">
        <span className="rp-orb rp-orbRed" />
        <span className="rp-orb rp-orbBlue" />
        <span className="rp-orb rp-orbYellow" />
        <span className="rp-orb rp-orbGreen" />
      </div>

      {/* soft vignette + top glow */}
      <div className="pointer-events-none absolute inset-0 -z-10 rp-vignette" />

      {/* Card */}
      <div className="rp-cardWrap w-full max-w-md">
        <div className="rp-card rounded-2xl border bg-card p-6 shadow-premium">
          {/* header */}
          <div className="mb-6 text-left rp-enter">
            <div className="text-2xl font-semibold tracking-tight">RamPottery Hub</div>
            <div className="text-sm text-muted-foreground">Sign in to continue</div>
          </div>

          <form onSubmit={onSubmit} className="space-y-4 rp-enterDelay">
            <div className="text-left">
              <label className="text-sm font-medium">Username</label>
              <input
                className="mt-1 w-full rounded-xl border bg-background/70 px-3 py-2 outline-none focus:ring-2 focus:ring-ring"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
              />
            </div>

            <div className="text-left">
              <label className="text-sm font-medium">Password</label>
              <input
                className="mt-1 w-full rounded-xl border bg-background/70 px-3 py-2 outline-none focus:ring-2 focus:ring-ring"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                autoComplete="current-password"
                required
              />
            </div>

            {err && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {err}
              </div>
            )}

            {/* Sign in button + comic pointer */}
            <div className="relative">
              <button
                disabled={busy}
                className="rp-signInBtn w-full rounded-xl px-4 py-2 font-medium text-primary-foreground gradient-primary shadow-glow disabled:opacity-60"
                type="submit"
              >
                {busy ? "Signing in..." : "Sign In"}
              </button>

              {/* comic pointer next to sign in bar */}
              <div className="rp-comicPointer" aria-hidden="true" title="Sign in here">
                <span className="rp-comicBubble">Let’s go!</span>
                <span className="rp-comicArrow" />
              </div>
            </div>

            {/* removed extra supabase details */}
            <div className="text-xs text-muted-foreground text-center">
              Secure sign-in • Premium ERP experience
            </div>
          </form>
        </div>
      </div>

      <style>{`
        /* =========================
           Premium Auth Scene
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
           Animated Orbs (MAX 4)
           - float + rotate around card area
        ========================== */
        .rp-orbs{ position:absolute; inset:0; overflow:hidden; }
        .rp-orb{
          position:absolute;
          width: 220px;
          height: 220px;
          border-radius: 9999px;
          opacity: .38;
          filter: blur(0px);
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

        /* place them around the card zone */
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
           Card Premium Look
        ========================== */
        .rp-cardWrap{ position:relative; }
        .rp-card{
          position: relative;
          backdrop-filter: blur(10px);
          border-color: rgba(255,255,255,.10);
          box-shadow: 0 28px 80px rgba(0,0,0,.40);
        }
        .rp-card::before{
          content:"";
          position:absolute;
          inset:-1px;
          border-radius: 1rem;
          background: linear-gradient(135deg,
            rgba(220,38,38,.28),
            rgba(37,99,235,.16),
            rgba(234,179,8,.14),
            rgba(34,197,94,.14)
          );
          filter: blur(16px);
          opacity: .55;
          z-index:-1;
        }

        /* entrance animation */
        .rp-enter{
          animation: rpFadeUp .5s ease both;
        }
        .rp-enterDelay{
          animation: rpFadeUp .6s ease both;
          animation-delay: .08s;
        }
        @keyframes rpFadeUp{
          from{ opacity:0; transform: translateY(10px); }
          to{ opacity:1; transform: translateY(0); }
        }

        /* =========================
           Comic Pointer next to button
        ========================== */
        .rp-signInBtn{
          position: relative;
        }

        .rp-comicPointer{
          position:absolute;
          right: -14px;
          top: 50%;
          transform: translateY(-50%);
          display:flex;
          align-items:center;
          gap:10px;
          pointer-events:none;
          animation: rpNudge 1.6s ease-in-out infinite;
        }

        @keyframes rpNudge{
          0%,100%{ transform: translateY(-50%) translateX(0); }
          50%{ transform: translateY(-50%) translateX(4px); }
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
          margin-left: -12px; /* overlap bubble */
          box-shadow: 0 14px 38px rgba(0,0,0,.25);
        }

        /* on very small screens, keep it inside */
        @media (max-width: 420px){
          .rp-comicPointer{ right: 10px; top: calc(100% + 10px); transform: translateY(0); }
          @keyframes rpNudge{
            0%,100%{ transform: translateY(0) translateX(0); }
            50%{ transform: translateY(0) translateX(4px); }
          }
          .rp-comicArrow{ display:none; }
        }
      `}</style>
    </div>
  );
}
