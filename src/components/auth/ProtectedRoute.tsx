// src/components/auth/ProtectedRoute.tsx
import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth, type AppRole } from "@/contexts/AuthContext";

type ProtectedRouteProps = {
  children: React.ReactNode;

  /** If provided, user must have one of these roles */
  allowRoles?: AppRole[];

  /** If provided, user must have this permission key (rp_users.permissions[key] === true) */
  requirePerm?: string;
};

export function ProtectedRoute({ children, allowRoles, requirePerm }: ProtectedRouteProps) {
  const { session, loading, profile, role, can } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
        <div className="text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }

  if (!session) {
    const from = location.pathname + location.search;
    return <Navigate to="/auth" replace state={{ from }} />;
  }

  // Logged in but no rp_users record
  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
        <div className="max-w-md w-full px-6">
          <div className="rounded-2xl border bg-background shadow-premium p-5">
            <div className="text-base font-semibold">Access not configured</div>
            <div className="mt-1 text-sm text-muted-foreground">
              Your login is valid, but your ERP access (rp_users) is not set up yet.
              Please contact the administrator to enable your account.
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

  // Inactive user
  if (profile.is_active === false) {
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

  // Role gate
  if (allowRoles?.length) {
    if (!allowRoles.includes(role)) return <Navigate to="/dashboard" replace />;
  }

  // Permission gate
  if (requirePerm) {
    if (!can(requirePerm)) return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
