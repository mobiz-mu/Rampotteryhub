// src/App.tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";

import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { AppLayout } from "@/components/layout/AppLayout";

import WhatsAppFab from "@/components/WhatsAppFab";

import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";

import Invoices from "./pages/Invoices";
import InvoiceCreate from "./pages/InvoiceCreate";
import InvoiceView from "./pages/InvoiceView";
import InvoicePrint from "./pages/InvoicePrint";

import CreditNotes from "./pages/CreditNotes";
import CreditNoteCreate from "./pages/CreditNoteCreate";
import CreditNoteView from "./pages/CreditNoteView";
import CreditNotePrint from "./pages/CreditNotePrint";

import Quotation from "./pages/Quotation";
import QuotationCreate from "./pages/QuotationCreate";
import QuotationView from "./pages/QuotationView";
import QuotationPrint from "./pages/QuotationPrint";

import Stock from "./pages/Stock";
import Categories from "./pages/Categories";
import StockMovements from "./pages/StockMovements";

import Customers from "./pages/Customers";
import Suppliers from "./pages/Suppliers";
import SupplierBills from "@/pages/ap/SupplierBills";
import SupplierPayments from "@/pages/ap/SupplierPayments";

import Reports from "./pages/Reports";
import Users from "./pages/Users";
import NotFound from "./pages/NotFound";

// ✅ ADD THESE (adjust paths if your files differ)
import AgingReport from "./pages/AgingReport";
import StatementPrint from "./pages/StatementPrint";

/** Create once */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
    mutations: { retry: 0 },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />

        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AuthProvider>
            {/* Inside router context */}
            <WhatsAppFab />

            <Routes>
              {/* =========================
                  AUTH (PUBLIC)
              ========================== */}
              <Route path="/login" element={<Navigate to="/auth" replace />} />
              <Route path="/auth" element={<Auth />} />

              {/* =========================
                  PUBLIC PRINT ROUTES (NO LOGIN)
              ========================== */}
              <Route path="/invoices/:id/print" element={<InvoicePrint />} />
              <Route path="/credit-notes/:id/print" element={<CreditNotePrint />} />
              <Route path="/quotations/:id/print" element={<QuotationPrint />} />

              {/* If you want statement print public too, move it here instead of inside Protected */}
              {/* <Route path="/statement/print" element={<StatementPrint />} /> */}

              {/* =========================
                  PRIVATE APP (LOGIN REQUIRED)
              ========================== */}
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <AppLayout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route path="dashboard" element={<Dashboard />} />

                {/* Invoices (protected) */}
                <Route path="invoices" element={<Invoices />} />
                <Route path="invoices/create" element={<InvoiceCreate />} />
                <Route path="invoices/:id" element={<InvoiceView />} />

                {/* Credit Notes (protected) */}
                <Route path="credit-notes" element={<CreditNotes />} />
                <Route path="credit-notes/create" element={<CreditNoteCreate />} />
                <Route path="credit-notes/:id" element={<CreditNoteView />} />

                {/* Quotations (protected) */}
                <Route path="quotations" element={<Quotation />} />
                <Route path="quotations/new" element={<QuotationCreate />} />
                <Route path="quotations/create" element={<QuotationCreate />} />
                <Route path="quotations/:id" element={<QuotationView />} />

                {/* Stock (protected) */}
                <Route path="stock" element={<Stock />} />
                <Route path="categories" element={<Categories />} />
                <Route path="stock-movements" element={<StockMovements />} />

                {/* Parties (protected) */}
                <Route path="customers" element={<Customers />} />
                <Route path="suppliers" element={<Suppliers />} />
                <Route path="ap/bills" element={<SupplierBills />} />
                <Route path="ap/payments" element={<SupplierPayments />} />
                <Route path="/suppliers" element={<Suppliers />} />
                <Route path="/suppliers/new" element={<Suppliers />} />

                {/* ✅ FIX: make these relative since they’re inside "/" shell */}
                <Route path="aging" element={<AgingReport />} />
                <Route path="statement/print" element={<StatementPrint />} />

                {/* Reports (role restricted) */}
                <Route
                  path="reports"
                  element={
                    <ProtectedRoute allowRoles={["admin", "manager", "accountant"]}>
                      <Reports />
                    </ProtectedRoute>
                  }
                />

                {/* Users (admin only) */}
                <Route
                  path="users"
                  element={
                    <ProtectedRoute allowRoles={["admin"]}>
                      <Users />
                    </ProtectedRoute>
                  }
                />
              </Route>

              {/* Fallback */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

