import React from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock } from "lucide-react";

export default function RequirePermission({
  perm,
  children,
}: {
  perm: string;
  children: React.ReactNode;
}) {
  const auth = useAuth();

  if (auth.loading) return null;

  if (!auth.user) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>Not signed in</CardTitle>
          </CardHeader>
          <CardContent>Please sign in to continue.</CardContent>
        </Card>
      </div>
    );
  }

  if (!auth.can(perm)) {
    return (
      <div className="p-6">
        <Card className="border-destructive/20 bg-destructive/5">
          <CardHeader className="flex flex-row items-center gap-2">
            <Lock className="h-5 w-5 text-destructive" />
            <CardTitle className="text-destructive">Access denied</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            You don’t have permission: <b>{perm}</b>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
