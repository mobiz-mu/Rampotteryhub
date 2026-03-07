// src/App.tsx
import React, { Suspense, lazy } from "react";
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

/* =========================
   Lazy pages
========================= */
const Auth = lazy(() => import("./pages/Auth"));
const Dashboard = lazy(() => import("./pages/Dashboard"));

const Invoices = lazy(() => import("./pages/Invoices"));
const InvoiceCreate = lazy(() => import("./pages/InvoiceCreate"));
const InvoiceView = lazy(() => import("./pages/InvoiceView"));
const InvoicePrint = lazy(() => import("./pages/InvoicePrint"));

const CreditNotes = lazy(() => import("./pages/CreditNotes"));
const CreditNoteCreate = lazy(() => import("./pages/CreditNoteCreate"));
const CreditNoteView = lazy(() => import("./pages/CreditNoteView"));
const CreditNotePrint = lazy(() => import("./pages/CreditNotePrint"));

const Quotation = lazy(() => import("./pages/Quotation"));
const QuotationCreate = lazy(() => import("./pages/QuotationCreate"));
const QuotationView = lazy(() => import("./pages/QuotationView"));
const QuotationPrint = lazy(() => import("./pages/QuotationPrint"));

const Stock = lazy(() => import("./pages/Stock"));
const Categories = lazy(() => import("./pages/Categories"));
const StockMovements = lazy(() => import("./pages/StockMovements"));

const Customers = lazy(() => import("./pages/Customers"));
const CustomersNew = lazy(() => import("./pages/CustomersNew"));
const Suppliers = lazy(() => import("./pages/Suppliers"));
const SupplierBills = lazy(() => import("@/pages/ap/SupplierBills"));
const SupplierPayments = lazy(() => import("@/pages/ap/SupplierPayments"));

const Reports = lazy(() => import("./pages/Reports"));
const Users = lazy(() => import("./pages/Users"));
const NotFound = lazy(() => import("./pages/NotFound"));
const AgingReport = lazy(() => import("./pages/AgingReport"));
const StatementPrint = lazy(() => import("./pages/StatementPrint"));

/* =========================
   Query client
========================= */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: { retry: 0 },
  },
});

/* =========================
   Fallback
========================= */
function AppLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="rounded-2xl border bg-card px-5 py-4 shadow-sm">
        <div className="text-sm font-semibold text-foreground">Loading…</div>
        <div className="mt-1 text-xs text-muted-foreground">Please wait</div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />

        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AuthProvider>
            <WhatsAppFab />

            <Suspense fallback={<AppLoader />}>
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

                  {/* Dashboard */}
                  <Route path="dashboard" element={<Dashboard />} />

                  {/* =========================
                      AR
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
                      STOCK
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
                      PARTIES
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
                    path="customers/:id/edit"
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

                  {/* Optional duplicates */}
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
                      REPORTS
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
                      USERS
                  ========================== */}
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
            </Suspense>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}