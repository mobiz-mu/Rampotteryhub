// src/components/layout/AppLayout.tsx
import { Outlet } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";
import { AppHeader } from "./AppHeader";

export function AppLayout() {
  return (
    <div className="min-h-[100dvh] bg-background text-foreground overflow-hidden">
      <AppSidebar />

      <div className="flex min-h-[100dvh] flex-col md:pl-64">
        <div className="shrink-0 sticky top-0 z-20">
         <AppHeader />
        </div>

        <main className="flex-1 overflow-y-auto px-4 pb-6 pt-0 md:px-6 [scrollbar-gutter:stable]">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

