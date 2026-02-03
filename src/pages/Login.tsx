import React, { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

export default function Login() {
  const nav = useNavigate();
  const loc = useLocation() as any;
  const { user } = useAuth();

  const from = useMemo(() => loc?.state?.from || "/", [loc?.state?.from]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (user) {
    nav(from, { replace: true });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      nav(from, { replace: true });
    } catch (ex: any) {
      setErr(ex?.message || "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background text-foreground">
      <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-premium">
        <div className="mb-6 text-left">
          <div className="text-2xl font-semibold tracking-tight">RamPottery Hub</div>
          <div className="text-sm text-muted-foreground">Sign in to continue</div>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="text-left">
            <label className="text-sm font-medium">Email</label>
            <input
              className="mt-1 w-full rounded-xl border bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-ring"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>

          <div className="text-left">
            <label className="text-sm font-medium">Password</label>
            <input
              className="mt-1 w-full rounded-xl border bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-ring"
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

          <button
            disabled={busy}
            className="w-full rounded-xl px-4 py-2 font-medium text-primary-foreground gradient-primary shadow-glow disabled:opacity-60"
            type="submit"
          >
            {busy ? "Signing in..." : "Sign In"}
          </button>

          <div className="text-xs text-muted-foreground text-center">
            Use your existing Supabase users (same as Next.js).
          </div>
        </form>
      </div>
    </div>
  );
}
