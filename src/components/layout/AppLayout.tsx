// src/components/layout/AppLayout.tsx
import { Outlet } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";
import { AppHeader } from "./AppHeader";

export function AppLayout() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppSidebar />

      <div className="pl-64">
        <AppHeader />

        <main className="h-[calc(100vh-4rem)] overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}


