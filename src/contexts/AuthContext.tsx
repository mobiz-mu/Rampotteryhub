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

  /** Single loading flag (prevents ProtectedRoute flicker) */
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
  )
    return r;
  return "viewer";
}

async function fetchRpMe(userId: string) {
  const res = await fetch("/api/auth/me", {
    method: "GET",
    credentials: "include",
    headers: { "x-rp-user": userId },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.ok) throw new Error(json?.error || `Auth me failed (${res.status})`);
  return json.user;
}

function normPerms(v: any): PermissionsMap {
  if (!v || typeof v !== "object") return {};
  return v as PermissionsMap;
}

/* =====================================================
   Provider
===================================================== */

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<any>(null);

  const [sessionLoading, setSessionLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);

  const user = session?.user ?? null;

  /* =====================================================
     1️⃣ Persist UUID for Express API auth
     (x-rp-user header)
  ===================================================== */

  useEffect(() => {
    if (user?.id) {
      localStorage.setItem("x-rp-user", user.id);
    } else {
      localStorage.removeItem("x-rp-user");
    }
  }, [user?.id]);

  /* =====================================================
     2️⃣ Session bootstrap + auth state changes
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
        }

        setSession(data.session ?? null);
      } catch (e) {
        console.error("getSession crash:", e);
      } finally {
        if (!alive) return;
        bootstrapped = true;
        setSessionLoading(false);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        if (!alive) return;

        setSession(newSession ?? null);

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
   3️⃣ Load authority profile via backend (avoids RLS issues)
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
        setProfile(null);
        return;
      }

      setProfile(me);
    } catch (e: any) {
      console.warn("auth/me load error:", e?.message || e);
      if (alive) setProfile(null);
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
    await supabase.auth.signOut();
  }

  /* =====================================================
     Derived values
  ===================================================== */

  const role: AppRole = useMemo(
    () => normRole(profile?.role),
    [profile?.role]
  );

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
     FINAL LOADING STATE (no flicker)
  ===================================================== */

  const loading =
    sessionLoading || (session ? profileLoading : false);

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
    [
      session,
      user,
      loading,
      profile,
      role,
      permissions,
      isAdmin,
      can,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
