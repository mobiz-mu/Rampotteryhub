// src/pages/Auth.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Lock, ShieldCheck } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

type LocationState = { from?: string };

function s(v: any) {
  return String(v ?? "").trim();
}

function isEmail(v: string) {
  const x = v.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x);
}

/**
 * Username strategy:
 * - If they type an email => use it directly.
 * - Else treat as "username" and map to a private email domain for Supabase auth.
 */
function usernameToEmail(input: string) {
  const u = s(input);
  if (!u) return "";
  if (isEmail(u)) return u.toLowerCase();
  // Only allow safe username characters to avoid weird inputs.
  const safe = u.replace(/[^a-zA-Z0-9._-]/g, "");
  if (!safe) return "";
  return `${safe.toLowerCase()}@rampottery.local`;
}

export default function Auth() {
  const nav = useNavigate();
  const loc = useLocation();
  const { user, loading, signIn } = useAuth();

  const from = useMemo(() => {
    const p = (loc.state as LocationState | null)?.from;
    return typeof p === "string" && p.startsWith("/") ? p : "/dashboard";
  }, [loc.state]);

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // lightweight anti-spam cooldown (UI only)
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (user) nav(from, { replace: true });
  }, [user, from, nav]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((x) => Math.max(0, x - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (busy) return;
    if (cooldown > 0) return;

    setErr(null);

    const email = usernameToEmail(identifier);
    const pwd = s(password);

    if (!email) {
      setErr("Enter a valid email or username.");
      return;
    }
    if (!pwd) {
      setErr("Password is required.");
      return;
    }

    setBusy(true);
    try {
      const res = await signIn(email, pwd);
      if (!res.ok) {
        // Don’t leak security details; keep generic.
        setErr(res.error || "Invalid credentials or access is disabled.");
        // cooldown reduces brute-force UI spam (server should also rate limit)
        setCooldown(3);
        return;
      }
      nav(from, { replace: true });
    } catch (e: any) {
      setErr(e?.message || "Login failed.");
      setCooldown(3);
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

  const disabled = busy || cooldown > 0;

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

      {/* Card */}
      <div className="rp-cardWrap w-full max-w-[440px]">
        <div className="rp-card rounded-2xl border bg-card p-6 shadow-premium">
          {/* Header */}
          <div className="mb-6 rp-enter">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-2xl border bg-muted/20 flex items-center justify-center">
                <ShieldCheck className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <div className="text-2xl font-semibold tracking-tight leading-tight">RamPottery Hub</div>
                <div className="text-sm text-muted-foreground">Secure sign-in</div>
              </div>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={onSubmit} className="space-y-4 rp-enterDelay" aria-label="Sign in form">
            <div className="text-left">
              <label className="text-sm font-medium" htmlFor="rp-identifier">
                Email or Username
              </label>
              <input
                id="rp-identifier"
                className="mt-1 w-full rounded-xl border bg-background/70 px-3 py-2 outline-none focus:ring-2 focus:ring-ring"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                autoComplete="username"
                inputMode="email"
                placeholder="you@company.mu or username"
                disabled={busy}
                required
              />
              <div className="mt-1 text-[12px] text-muted-foreground">
                Use your company email or assigned username.
              </div>
            </div>

            <div className="text-left">
              <label className="text-sm font-medium" htmlFor="rp-password">
                Password
              </label>

              <div className="mt-1 relative">
                <input
                  id="rp-password"
                  className="w-full rounded-xl border bg-background/70 px-3 py-2 pr-10 outline-none focus:ring-2 focus:ring-ring"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type={showPwd ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  disabled={busy}
                  required
                />

                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-lg hover:bg-muted/40 flex items-center justify-center"
                  onClick={() => setShowPwd((v) => !v)}
                  aria-label={showPwd ? "Hide password" : "Show password"}
                  disabled={busy}
                >
                  {showPwd ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                </button>
              </div>
            </div>

            {err && (
              <div
                role="alert"
                className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {err}
              </div>
            )}

            <button
              disabled={disabled}
              className="rp-signInBtn w-full rounded-xl px-4 py-2 font-medium text-primary-foreground gradient-primary shadow-glow disabled:opacity-60 disabled:cursor-not-allowed"
              type="submit"
            >
              {busy ? "Signing in..." : cooldown > 0 ? `Try again in ${cooldown}s` : "Sign In"}
            </button>

            <div className="flex items-center justify-center gap-2 pt-1 text-xs text-muted-foreground">
              <Lock className="h-3.5 w-3.5" />
              <span>Protected by role-based access • activity tracked</span>
            </div>
          </form>
        </div>

        <div className="mt-4 text-center text-[11px] text-muted-foreground">
          © {new Date().getFullYear()} Ram Pottery Ltd • Internal system
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
        ========================== */
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
            rgba(220,38,38,.26),
            rgba(37,99,235,.16),
            rgba(234,179,8,.12),
            rgba(34,197,94,.12)
          );
          filter: blur(16px);
          opacity: .50;
          z-index:-1;
        }

        .rp-enter{ animation: rpFadeUp .5s ease both; }
        .rp-enterDelay{ animation: rpFadeUp .6s ease both; animation-delay: .08s; }
        @keyframes rpFadeUp{
          from{ opacity:0; transform: translateY(10px); }
          to{ opacity:1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

