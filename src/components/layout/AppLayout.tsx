
import { Outlet } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";
import { AppHeader } from "./AppHeader";
import WhatsAppFab from "@/components/WhatsAppFab";

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

      {/* ✅ WhatsApp floating action button */}
      <WhatsAppFab
        phoneE164="23057276248" // change to your number
        message="Hello Ram Pottery Hub 👋 I want to send a document."
      />
    </div>
  );
}


