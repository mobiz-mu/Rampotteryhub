import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth, type AppRole } from "@/contexts/AuthContext";

type ProtectedRouteProps = {
  children: React.ReactNode;
  allowRoles?: AppRole[];
  requirePerm?: string;
};

const PUBLIC_BYPASS: RegExp[] = [
  /^\/invoices\/\d+\/print$/i,
  /^\/credit-notes\/\d+\/print$/i,
  /^\/quotations\/\d+\/print$/i,
];

function FullPageMessage({
  title,
  message,
  extra,
}: {
  title: string;
  message: string;
  extra?: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
      <div className="max-w-md w-full px-6">
        <div className="rounded-2xl border bg-background shadow-premium p-5">
          <div className="text-base font-semibold">{title}</div>
          <div className="mt-1 text-sm text-muted-foreground">{message}</div>
          {extra ? <div className="mt-4">{extra}</div> : null}
        </div>
      </div>
    </div>
  );
}

function FullPageLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
      <div className="rounded-2xl border bg-background shadow-premium px-5 py-4">
        <div className="text-sm font-medium">Loading…</div>
        <div className="mt-1 text-xs text-muted-foreground">Checking your access</div>
      </div>
    </div>
  );
}

export function ProtectedRoute({
  children,
  allowRoles,
  requirePerm,
}: ProtectedRouteProps) {
  const { session, loading, profile, profileError, role, can } = useAuth();
  const location = useLocation();

  const pathOnly = location.pathname || "";
  if (PUBLIC_BYPASS.some((rx) => rx.test(pathOnly))) {
    return <>{children}</>;
  }

  if (loading) {
    return <FullPageLoading />;
  }

  if (!session) {
    const from = location.pathname + location.search;
    return <Navigate to="/auth" replace state={{ from }} />;
  }

  if (!profile) {
    return (
      <FullPageMessage
        title={profileError ? "Unable to load account access" : "Access not configured"}
        message={
          profileError
            ? "Your login worked, but the ERP profile could not be loaded right now. Please refresh and try again."
            : "Your login is valid, but your ERP access (rp_users) is not set up yet. Please contact the administrator to enable your account."
        }
        extra={
          <>
            <div className="text-xs text-muted-foreground break-all">
              User ID: {session.user.id}
            </div>

            {profileError ? (
              <div className="mt-2 text-xs text-rose-600 break-all">
                Error: {profileError}
              </div>
            ) : null}

            <div className="mt-4">
              <button
                type="button"
                className="h-10 px-4 rounded-md border bg-background hover:bg-muted/40 text-sm"
                onClick={() => window.location.reload()}
              >
                Refresh
              </button>
            </div>
          </>
        }
      />
    );
  }

  if (profile.is_active === false) {
    return (
      <FullPageMessage
        title="Account disabled"
        message="Your account is inactive. Please contact the administrator."
      />
    );
  }

  if (allowRoles?.length && !allowRoles.includes(role)) {
    return <Navigate to="/dashboard" replace />;
  }

  if (requirePerm && !can(requirePerm)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}