// src/pages/Auth.tsx
import React, { useMemo, useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

function usernameToEmail(u: string) {
  const s = u.trim();
  if (!s) return "";
  if (s.includes("@")) return s; // allow real email too
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
    <div className="min-h-screen flex items-center justify-center p-6 bg-background text-foreground">
      <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-premium">
        <div className="mb-6 text-left">
          <div className="text-2xl font-semibold tracking-tight">RamPottery Hub</div>
          <div className="text-sm text-muted-foreground">Sign in to continue</div>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="text-left">
            <label className="text-sm font-medium">Username</label>
            <input
              className="mt-1 w-full rounded-xl border bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-ring"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
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
            Username login maps internally to Supabase email auth.
          </div>
        </form>
      </div>
    </div>
  );
}

