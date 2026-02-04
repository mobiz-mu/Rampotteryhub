// src/contexts/AuthContext.tsx
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";

export type AppRole = "admin" | "manager" | "accountant" | "sales" | "viewer";
export type PermissionsMap = Record<string, boolean>;

type AuthCtx = {
  session: Session | null;
  user: User | null;

  /** ✅ single loading flag that prevents flicker */
  loading: boolean;

  profile: any | null;

  role: AppRole;
  permissions: PermissionsMap;
  isAdmin: boolean;

  can: (key: string) => boolean;

  signIn: (email: string, password: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used within AuthProvider");
  return v;
}

function normRole(v: any): AppRole {
  const r = String(v || "").toLowerCase();
  if (r === "admin" || r === "manager" || r === "accountant" || r === "sales" || r === "viewer") return r;
  return "viewer";
}

function normPerms(v: any): PermissionsMap {
  if (!v || typeof v !== "object") return {};
  return v as PermissionsMap;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);

  const [sessionLoading, setSessionLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);

  const [profile, setProfile] = useState<any>(null);

  const user = session?.user ?? null;

  // 1) Session bootstrap + auth changes
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (!alive) return;
        if (error) console.error("getSession error:", error);
        setSession(data.session ?? null);
      } catch (e) {
        console.error("getSession crash:", e);
      } finally {
        if (alive) setSessionLoading(false);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
     if (!alive) return;
     setSession(newSession ?? null);
     setSessionLoading(false);
  });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // 2) Load rp_users (authority for access control)
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        if (!user) {
          if (alive) {
            setProfile(null);
            setProfileLoading(false);
          }
          return;
        }

        if (alive) setProfileLoading(true);

        const { data, error } = await supabase
          .from("rp_users")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle();

        if (!alive) return;

        if (error) {
          console.warn("rp_users load error:", error.message);
          setProfile(null);
          return;
        }

        if (!data) {
          // user exists but rp_users row not created
          setProfile(null);
          return;
        }

        if (data.is_active === false) {
          await supabase.auth.signOut();
          setProfile(null);
          return;
        }

        setProfile(data);
      } catch (e) {
        console.error("rp_users load crash:", e);
        if (alive) setProfile(null);
      } finally {
        if (alive) setProfileLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [user?.id]);

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  const role: AppRole = useMemo(() => normRole(profile?.role), [profile?.role]);
  const permissions: PermissionsMap = useMemo(() => normPerms(profile?.permissions), [profile?.permissions]);
  const isAdmin = role === "admin";

  const can = useMemo(() => {
    return (key: string) => {
      if (isAdmin) return true;
      const k = String(key || "").trim();
      if (!k) return false;
      return !!permissions[k];
    };
  }, [isAdmin, permissions]);

  // ✅ This is the key fix: prevent ProtectedRoute flicker
  const loading = sessionLoading || (!!user && profileLoading);

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
