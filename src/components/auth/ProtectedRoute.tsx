// src/components/auth/ProtectedRoute.tsx
import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Optional: if you want to protect pages by role/permission later.
 * Your rp_users table: role (text) + permissions (jsonb)
 */
type AppRole = "admin" | "manager" | "accountant" | "sales" | "viewer";

type ProtectedRouteProps = {
  children: React.ReactNode;

  /** If provided, user must have one of these roles */
  allowRoles?: AppRole[];

  /** If provided, user must have permissions[key] === true */
  requirePerm?: string;
};

function hasPerm(profile: any, key?: string) {
  if (!key) return true;
  const p = profile?.permissions || {};
  return !!p?.[key];
}

export function ProtectedRoute({ children, allowRoles, requirePerm }: ProtectedRouteProps) {
  const { session, loading, profile } = useAuth();
  const location = useLocation();

  // 1) Global loading (auth + rp_users fetch)
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
        <div className="text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }

  // 2) Not logged in
  if (!session) {
    const from = location.pathname + location.search;
    return <Navigate to="/auth" replace state={{ from }} />;
  }

  /**
   * 3) Logged in but app profile not loaded / missing in rp_users.
   *    This is the most common reason your UI shows "User" and admin buttons disappear.
   */
  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
        <div className="max-w-md w-full px-6">
          <div className="rounded-2xl border bg-background shadow-premium p-5">
            <div className="text-base font-semibold">Access not configured</div>
            <div className="mt-1 text-sm text-muted-foreground">
              Your login is valid, but you don’t have an ERP user record yet (rp_users).
              Ask admin to create your access or upgrade your role.
            </div>

            <div className="mt-4 text-xs text-muted-foreground break-all">
              User ID: {session.user.id}
            </div>

            <div className="mt-4">
              <button
                type="button"
                className="h-10 px-4 rounded-md border bg-background hover:bg-muted/40 text-sm"
                onClick={() => window.location.reload()}
              >
                Refresh
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 4) Inactive user (extra safety; your AuthContext already signs out, but keep it here too)
  if (profile?.is_active === false) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
        <div className="rounded-2xl border bg-background shadow-premium p-5 max-w-md w-full">
          <div className="text-base font-semibold">Account disabled</div>
          <div className="mt-1 text-sm text-muted-foreground">
            Your account is inactive. Please contact the administrator.
          </div>
        </div>
      </div>
    );
  }

  // 5) Role gate (optional)
  if (allowRoles && allowRoles.length > 0) {
    const role = String(profile?.role || "viewer") as AppRole;
    if (!allowRoles.includes(role)) {
      return <Navigate to="/dashboard" replace />;
    }
  }

  // 6) Permission gate (optional)
  if (requirePerm && !hasPerm(profile, requirePerm)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
