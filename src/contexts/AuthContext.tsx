import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";

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
  profileError: string | null;
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

function isAbortLikeError(error: any) {
  const name = String(error?.name || "").toLowerCase();
  const msg = String(error?.message || "").toLowerCase();

  return (
    name === "aborterror" ||
    msg.includes("aborted") ||
    msg.includes("signal is aborted")
  );
}

async function fetchRpMe(userId: string, signal?: AbortSignal) {
  const res = await fetch("/api/auth/me", {
    method: "GET",
    credentials: "include",
    headers: { "x-rp-user": userId },
    signal,
  });

  const json = await res.json().catch(() => ({}));

  if (!res.ok || !json?.ok) {
    throw new Error(json?.error || `Auth me failed (${res.status})`);
  }

  return json.user;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [sessionLoading, setSessionLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);

  const user = session?.user ?? null;

  useEffect(() => {
    if (user?.id) {
      localStorage.setItem("x-rp-user", user.id);
    } else {
      localStorage.removeItem("x-rp-user");
    }
  }, [user?.id]);

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
          setProfileError(null);
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

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();

    (async () => {
      try {
        if (!user?.id) {
          if (alive) {
            setProfile(null);
            setProfileError(null);
            setProfileLoading(false);
          }
          return;
        }

        if (alive) {
          setProfileLoading(true);
          setProfileError(null);
        }

        const me = await fetchRpMe(user.id, controller.signal);

        if (!alive) return;

        if (me?.is_active === false) {
          await supabase.auth.signOut();
          if (!alive) return;
          setProfile(null);
          setProfileError("Account is inactive");
          return;
        }

        setProfile(me);
        setProfileError(null);
      } catch (e: any) {
        if (!alive) return;

        if (isAbortLikeError(e)) {
          return;
        }

        console.warn("auth/me load error:", e?.message || e);
        setProfile(null);
        setProfileError(e?.message || "Failed to load ERP profile");
      } finally {
        if (alive) setProfileLoading(false);
      }
    })();

    return () => {
      alive = false;
      controller.abort();
    };
  }, [user?.id]);

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
    setProfileError(null);
    await supabase.auth.signOut();
  }

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

  const loading = sessionLoading || (session ? profileLoading : false);

  const value = useMemo<AuthCtx>(
    () => ({
      session,
      user,
      loading,
      profile,
      profileError,
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
      profileError,
      role,
      permissions,
      isAdmin,
      can,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}