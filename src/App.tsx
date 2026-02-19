// src/App.tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import RequirePermission from "@/components/auth/RequirePermission";

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
import CustomersNew from "@/pages/CustomersNew";


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

                {/* Dashboard (leave open to any logged-in user) */}
                <Route path="dashboard" element={<Dashboard />} />

                {/* =========================
                    AR (Customers / Invoices)
                    - view: ar.view
                    - create/edit: ar.invoices
                ========================== */}
                <Route
                  path="invoices"
                  element={
                    <RequirePermission perm="ar.view">
                      <Invoices />
                    </RequirePermission>
                  }
                />
                <Route
                  path="invoices/create"
                  element={
                    <RequirePermission perm="ar.invoices">
                      <InvoiceCreate />
                    </RequirePermission>
                  }
                />
                <Route
                  path="invoices/:id"
                  element={
                    <RequirePermission perm="ar.view">
                      <InvoiceView />
                    </RequirePermission>
                  }
                />

                <Route
                  path="credit-notes"
                  element={
                    <RequirePermission perm="ar.view">
                      <CreditNotes />
                    </RequirePermission>
                  }
                />
                <Route
                  path="credit-notes/create"
                  element={
                    <RequirePermission perm="ar.invoices">
                      <CreditNoteCreate />
                    </RequirePermission>
                  }
                />
                <Route
                  path="credit-notes/:id"
                  element={
                    <RequirePermission perm="ar.view">
                      <CreditNoteView />
                    </RequirePermission>
                  }
                />

                <Route
                  path="quotations"
                  element={
                    <RequirePermission perm="ar.view">
                      <Quotation />
                    </RequirePermission>
                  }
                />
                <Route
                  path="quotations/new"
                  element={
                    <RequirePermission perm="ar.invoices">
                      <QuotationCreate />
                    </RequirePermission>
                  }
                />
                <Route
                  path="quotations/create"
                  element={
                    <RequirePermission perm="ar.invoices">
                      <QuotationCreate />
                    </RequirePermission>
                  }
                />
                <Route
                  path="quotations/:id"
                  element={
                    <RequirePermission perm="ar.view">
                      <QuotationView />
                    </RequirePermission>
                  }
                />

                {/* =========================
                    Stock
                    - view: stock.view
                    - edit: stock.edit (if you later want to restrict create/edit screens)
                ========================== */}
                <Route
                  path="stock"
                  element={
                    <RequirePermission perm="stock.view">
                      <Stock />
                    </RequirePermission>
                  }
                />
                <Route
                  path="categories"
                  element={
                    <RequirePermission perm="stock.view">
                      <Categories />
                    </RequirePermission>
                  }
                />
                <Route
                  path="stock-movements"
                  element={
                    <RequirePermission perm="stock.view">
                      <StockMovements />
                    </RequirePermission>
                  }
                />

                {/* =========================
                    Parties
                    - customers: customers.view
                    - suppliers/AP: ap.view / ap.bills / ap.payments
                ========================== */}
                <Route
                  path="customers"
                  element={
                    <RequirePermission perm="customers.view">
                      <Customers />
                    </RequirePermission>
                  }
                />

                <Route
                  path="customers/new"
                  element={
                    <RequirePermission perm="customers.view">
                       <CustomersNew />
                     </RequirePermission>
                   }
                 />

                <Route
                  path="suppliers"
                  element={
                    <RequirePermission perm="ap.view">
                      <Suppliers />
                    </RequirePermission>
                  }
                />
                <Route
                  path="ap/bills"
                  element={
                    <RequirePermission perm="ap.bills">
                      <SupplierBills />
                    </RequirePermission>
                  }
                />
                <Route
                  path="ap/payments"
                  element={
                    <RequirePermission perm="ap.payments">
                      <SupplierPayments />
                    </RequirePermission>
                  }
                />

                {/* (Optional duplicates — keep if you rely on them) */}
                <Route
                  path="/suppliers"
                  element={
                    <RequirePermission perm="ap.view">
                      <Suppliers />
                    </RequirePermission>
                  }
                />
                <Route
                  path="/suppliers/new"
                  element={
                    <RequirePermission perm="ap.view">
                      <Suppliers />
                    </RequirePermission>
                  }
                />

                {/* =========================
                    Reports / Statements
                ========================== */}
                <Route
                  path="reports"
                  element={
                    <RequirePermission perm="reports.view">
                      <Reports />
                    </RequirePermission>
                  }
                />

                <Route
                  path="aging"
                  element={
                    <RequirePermission perm="reports.view">
                      <AgingReport />
                    </RequirePermission>
                  }
                />
                <Route
                  path="statement/print"
                  element={
                    <RequirePermission perm="reports.view">
                      <StatementPrint />
                    </RequirePermission>
                  }
                />

                {/* =========================
                    Users & Permissions
                    - keep admin-only OR switch to perm key users.manage
                ========================== */}
                <Route
                  path="users"
                  element={
                    <ProtectedRoute allowRoles={["admin"]}>
                      <Users />
                    </ProtectedRoute>
                  }
                />
                {/* If you prefer permission-based instead, use this and remove admin-only route above:
                <Route
                  path="users"
                  element={
                    <RequirePermission perm="users.manage">
                      <Users />
                    </RequirePermission>
                  }
                />
                */}
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
