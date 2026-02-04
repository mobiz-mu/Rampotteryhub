// src/pages/Login.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

export default function Login() {
  const nav = useNavigate();
  const loc = useLocation() as any;
  const { user, signIn } = useAuth();

  const from = useMemo(() => loc?.state?.from || "/", [loc?.state?.from]);

  const [email, setEmail] = useState("");
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
      const res = await signIn(email, password);
      if (!res?.ok) throw new Error(res?.error || "Login failed");
      nav(from, { replace: true });
    } catch (ex: any) {
      setErr(ex?.message || "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen relative flex items-center justify-center p-6 bg-background text-foreground overflow-hidden">
      {/* Animated orbit rings behind the card (4 balls max) */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="rp-orbitWrap relative h-[560px] w-[560px] opacity-90">
          {/* soft backdrop glow */}
          <div className="absolute inset-0 rounded-full blur-3xl bg-gradient-to-b from-red-500/10 via-blue-500/10 to-amber-500/10" />

          {/* ring 1 */}
          <div className="absolute inset-[44px] rounded-full border border-white/10 rp-orbit rp-orbit1">
            <span className="rp-dot rp-dot-red" />
            <span className="rp-dot rp-dot-blue" />
          </div>

          {/* ring 2 */}
          <div className="absolute inset-[92px] rounded-full border border-white/10 rp-orbit rp-orbit2">
            <span className="rp-dot rp-dot-yellow" />
            <span className="rp-dot rp-dot-green" />
          </div>

          {/* subtle diagonal shine */}
          <div className="absolute inset-[120px] rounded-full rp-shineMask" />
        </div>
      </div>

      {/* Login Card */}
      <div className="relative w-full max-w-md">
        <div className="rp-card rounded-2xl border bg-card/85 backdrop-blur-xl p-6 shadow-premium">
          <div className="mb-6 text-left">
            <div className="text-2xl font-semibold tracking-tight">Ram Pottery Hub</div>
            <div className="text-sm text-muted-foreground">Sign in to continue</div>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="text-left">
              <label className="text-sm font-medium">Email</label>
              <input
                className="mt-1 w-full rounded-xl border bg-background/70 px-3 py-2 outline-none focus:ring-0 rp-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>

            <div className="text-left">
              <label className="text-sm font-medium">Password</label>
              <input
                className="mt-1 w-full rounded-xl border bg-background/70 px-3 py-2 outline-none focus:ring-0 rp-input"
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

            <div className="relative">
              <button
                disabled={busy}
                className="w-full rounded-xl px-4 py-2 font-medium text-primary-foreground gradient-primary shadow-glow disabled:opacity-60"
                type="submit"
              >
                {busy ? "Signing in..." : "Sign In"}
              </button>

              {/* Small comic pointer (premium) */}
              {!busy && (
                <div className="rp-comicPointer" aria-hidden="true">
                  <span className="rp-comicBubble">Sign in here</span>
                  <span className="rp-comicArrow" />
                </div>
              )}
            </div>
          </form>
        </div>
      </div>

      <style>{`
        /* ---------- responsive orbit sizing ---------- */
        .rp-orbitWrap{ transform: translateZ(0); }
        @media (max-width: 420px){
          .rp-orbitWrap{ transform: scale(.78); }
        }

        /* ---------- Card premium edge ---------- */
        .rp-card{
          position: relative;
          border-color: rgba(255,255,255,.10);
          box-shadow:
            0 18px 60px rgba(0,0,0,.18),
            0 2px 0 rgba(255,255,255,.06) inset;
        }
        :root.dark .rp-card{
          box-shadow:
            0 26px 80px rgba(0,0,0,.50),
            0 1px 0 rgba(255,255,255,.06) inset;
        }
        .rp-card::before{
          content:"";
          position:absolute;
          inset:-1px;
          border-radius: 1rem;
          background: linear-gradient(135deg,
            rgba(220,38,38,.18),
            rgba(37,99,235,.12),
            rgba(234,179,8,.10),
            rgba(34,197,94,.10)
          );
          filter: blur(14px);
          opacity: .55;
          z-index:-1;
        }

        /* ---------- Inputs premium focus ---------- */
        .rp-input{
          border-color: rgba(255,255,255,.10);
          transition: border-color .2s ease, box-shadow .2s ease, background .2s ease;
        }
        .rp-input:focus{
          border-color: rgba(140,18,18,.55);
          box-shadow: 0 0 0 1px rgba(140,18,18,.25), 0 12px 28px rgba(0,0,0,.10);
          background: rgba(255,255,255,.04);
        }
        :root.dark .rp-input{
          background: rgba(255,255,255,.04);
          border-color: rgba(255,255,255,.10);
        }
        :root.dark .rp-input:focus{
          border-color: rgba(255,90,90,.35);
          box-shadow: 0 0 0 1px rgba(255,90,90,.16), 0 18px 40px rgba(0,0,0,.35);
        }

        /* ---------- Orbit animations ---------- */
        @keyframes rpOrbitCW { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes rpOrbitCCW { from { transform: rotate(360deg); } to { transform: rotate(0deg); } }
        .rp-orbit{ position: relative; filter: drop-shadow(0 18px 50px rgba(0,0,0,.15)); }
        .rp-orbit1{ animation: rpOrbitCW 14s linear infinite; }
        .rp-orbit2{ animation: rpOrbitCCW 18s linear infinite; }

        .rp-dot{
          position: absolute;
          top: 50%;
          left: 50%;
          height: 18px;
          width: 18px;
          border-radius: 999px;
          transform: translate(-50%, -50%);
          box-shadow: 0 0 18px rgba(255,255,255,.18);
        }
        .rp-orbit1 .rp-dot-red{ transform: translate(-50%, -50%) translateX(200px); }
        .rp-orbit1 .rp-dot-blue{ transform: translate(-50%, -50%) translateX(-200px); }
        .rp-orbit2 .rp-dot-yellow{ transform: translate(-50%, -50%) translateY(170px); }
        .rp-orbit2 .rp-dot-green{ transform: translate(-50%, -50%) translateY(-170px); }

        .rp-dot-red{
          background: radial-gradient(circle at 30% 30%, rgba(255,255,255,.85), rgba(255,80,80,.95));
          box-shadow: 0 0 22px rgba(160,10,10,.45);
        }
        .rp-dot-blue{
          background: radial-gradient(circle at 30% 30%, rgba(255,255,255,.85), rgba(70,130,255,.95));
          box-shadow: 0 0 22px rgba(40,80,180,.35);
        }
        .rp-dot-yellow{
          background: radial-gradient(circle at 30% 30%, rgba(255,255,255,.85), rgba(255,200,80,.95));
          box-shadow: 0 0 22px rgba(180,120,20,.35);
        }
        .rp-dot-green{
          background: radial-gradient(circle at 30% 30%, rgba(255,255,255,.85), rgba(90,220,140,.95));
          box-shadow: 0 0 22px rgba(20,140,80,.30);
        }

        /* ---------- Subtle moving shine inside center ---------- */
        @keyframes rpShineSweep {
          0% { transform: translateX(-30%) rotate(12deg); opacity: 0; }
          15% { opacity: .20; }
          45% { opacity: .20; }
          60% { opacity: 0; }
          100% { transform: translateX(30%) rotate(12deg); opacity: 0; }
        }
        .rp-shineMask{
          background: linear-gradient(120deg, transparent, rgba(255,255,255,.22), transparent);
          filter: blur(1px);
          animation: rpShineSweep 4.2s ease-in-out infinite;
          mix-blend-mode: soft-light;
        }

        /* ---------- Comic pointer ---------- */
        .rp-comicPointer{
          position:absolute;
          right: -14px;
          top: 50%;
          transform: translateY(-50%);
          display:flex;
          align-items:center;
          gap:10px;
          pointer-events:none;
          animation: rpNudgeBtn 1.6s ease-in-out infinite;
        }
        @keyframes rpNudgeBtn{
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
          margin-left: -12px;
          box-shadow: 0 14px 38px rgba(0,0,0,.25);
        }
        @media (max-width: 420px){
          .rp-comicPointer{ right: 10px; top: -8px; transform: none; }
          .rp-comicArrow{ display:none; }
        }

        /* ---------- Accessibility: reduce motion ---------- */
        @media (prefers-reduced-motion: reduce){
          .rp-orbit1, .rp-orbit2, .rp-shineMask, .rp-comicPointer{ animation: none !important; }
        }
      `}</style>
    </div>
  );
}
