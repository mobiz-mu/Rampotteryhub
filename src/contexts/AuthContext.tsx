// src/contexts/AuthContext.tsx
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";

/* =====================================================
   Types
===================================================== */

export type AppRole =
  | "admin"
  | "manager"
  | "accountant"
  | "sales"
  | "viewer";

export type PermissionsMap = Record<string, boolean>;

type AuthCtx = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  profile: any | null;
  role: AppRole;
  permissions: PermissionsMap;
  isAdmin: boolean;
  can: (key: string) => boolean;
  signIn: (
    email: string,
    password: string
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used within AuthProvider");
  return v;
}

/* =====================================================
   Helpers
===================================================== */

function normRole(v: any): AppRole {
  const r = String(v || "").toLowerCase();
  if (
    r === "admin" ||
    r === "manager" ||
    r === "accountant" ||
    r === "sales" ||
    r === "viewer"
  ) {
    return r;
  }
  return "viewer";
}

function normPerms(v: any): PermissionsMap {
  if (!v || typeof v !== "object") return {};
  return v as PermissionsMap;
}

function isRefreshTokenError(message: any) {
  const msg = String(message || "").toLowerCase();
  return (
    msg.includes("refresh token") ||
    msg.includes("invalid refresh token") ||
    msg.includes("refresh token not found")
  );
}

async function fetchRpMe(userId: string) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch("/api/auth/me", {
      method: "GET",
      credentials: "include",
      headers: { "x-rp-user": userId },
      signal: controller.signal,
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok || !json?.ok) {
      throw new Error(json?.error || `Auth me failed (${res.status})`);
    }

    return json.user;
  } finally {
    window.clearTimeout(timeout);
  }
}

/* =====================================================
   Provider
===================================================== */

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<any | null>(null);

  const [sessionLoading, setSessionLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);

  const user = session?.user ?? null;

  /* =====================================================
     1) Persist UUID for Express API auth
  ===================================================== */
  useEffect(() => {
    if (user?.id) {
      localStorage.setItem("x-rp-user", user.id);
    } else {
      localStorage.removeItem("x-rp-user");
    }
  }, [user?.id]);

  /* =====================================================
     2) Session bootstrap + auth state changes
  ===================================================== */
  useEffect(() => {
    let alive = true;
    let bootstrapped = false;

    (async () => {
      try {
        const { data, error } = await supabase.auth.getSession();

        if (!alive) return;

        if (error) {
          console.error("getSession error:", error.message);

          if (isRefreshTokenError(error.message)) {
            try {
              localStorage.removeItem("x-rp-user");
              await supabase.auth.signOut();
            } catch {}
            setSession(null);
          } else {
            setSession(data?.session ?? null);
          }
        } else {
          setSession(data?.session ?? null);
        }
      } catch (e: any) {
        console.error("getSession crash:", e);

        if (isRefreshTokenError(e?.message)) {
          try {
            localStorage.removeItem("x-rp-user");
            await supabase.auth.signOut();
          } catch {}
          if (alive) setSession(null);
        }
      } finally {
        if (!alive) return;
        bootstrapped = true;
        setSessionLoading(false);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        if (!alive) return;

        setSession(newSession ?? null);

        if (!newSession) {
          setProfile(null);
          setProfileLoading(false);
        }

        if (bootstrapped) {
          setSessionLoading(false);
        }
      }
    );

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  /* =====================================================
     3) Load authority profile via backend
  ===================================================== */
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        if (!user?.id) {
          if (alive) {
            setProfile(null);
            setProfileLoading(false);
          }
          return;
        }

        if (alive) setProfileLoading(true);

        const me = await fetchRpMe(user.id);

        if (!alive) return;

        if (me?.is_active === false) {
          await supabase.auth.signOut();
          if (!alive) return;
          setProfile(null);
          return;
        }

        setProfile(me);
      } catch (e: any) {
        console.warn("auth/me load error:", e?.message || e);

        if (!alive) return;

        setProfile(null);
      } finally {
        if (alive) setProfileLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [user?.id]);

  /* =====================================================
     Auth actions
  ===================================================== */
  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  }

  async function signOut() {
    localStorage.removeItem("x-rp-user");
    setProfile(null);
    await supabase.auth.signOut();
  }

  /* =====================================================
     Derived values
  ===================================================== */
  const role: AppRole = useMemo(() => normRole(profile?.role), [profile?.role]);

  const permissions: PermissionsMap = useMemo(
    () => normPerms(profile?.permissions),
    [profile?.permissions]
  );

  const isAdmin = role === "admin";

  const can = useMemo(() => {
    return (key: string) => {
      if (isAdmin) return true;
      const k = String(key || "").trim();
      if (!k) return false;
      return !!permissions[k];
    };
  }, [isAdmin, permissions]);

  /* =====================================================
     Final loading state
  ===================================================== */
  const loading = sessionLoading || (session ? profileLoading : false);

  const value = useMemo<AuthCtx>(
    () => ({
      session,
      user,
      loading,
      profile,
      role,
      permissions,
      isAdmin,
      can,
      signIn,
      signOut,
    }),
    [session, user, loading, profile, role, permissions, isAdmin, can]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}