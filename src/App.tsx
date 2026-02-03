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
import CreditNoteCreate from "./pages/CreditNoteCreate"; // ✅ create page
import CreditNoteView from "./pages/CreditNoteView";     // ✅ optional (add when ready)
import CreditNotePrint from "./pages/CreditNotePrint";   // ✅ optional (add when ready)

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

/** ✅ create once */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />

        <BrowserRouter>
          <AuthProvider>
            {/* ✅ inside router context */}
            <WhatsAppFab />

            <Routes>
              {/* Auth */}
              <Route path="/login" element={<Navigate to="/auth" replace />} />
              <Route path="/auth" element={<Auth />} />

              {/* App shell */}
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

                {/* Invoices */}
                <Route path="invoices" element={<Invoices />} />
                <Route path="invoices/create" element={<InvoiceCreate />} />
                <Route path="invoices/:id" element={<InvoiceView />} />
                <Route path="invoices/:id/print" element={<InvoicePrint />} />

                {/* Credit Notes */}
                <Route path="credit-notes" element={<CreditNotes />} />
                <Route path="credit-notes/create" element={<CreditNoteCreate />} />
                {/* Optional – enable when you have these pages */}
                <Route path="credit-notes/:id" element={<CreditNoteView />} />
                <Route path="credit-notes/:id/print" element={<CreditNotePrint />} />

                {/* Quotations */}
                <Route path="quotations" element={<Quotation />} />

                {/* ✅ allow both links */}
                <Route path="quotations/new" element={<QuotationCreate />} />
                <Route path="quotations/create" element={<QuotationCreate />} />

                <Route path="quotations/:id" element={<QuotationView />} />
                <Route path="quotations/:id/print" element={<QuotationPrint />} />


                {/* Stock */}
                <Route path="stock" element={<Stock />} />
                <Route path="categories" element={<Categories />} />
                <Route path="stock-movements" element={<StockMovements />} />

                {/* Parties */}
                <Route path="customers" element={<Customers />} />
                <Route path="suppliers" element={<Suppliers />} />
                <Route path="ap/bills" element={<SupplierBills />} />
                <Route path="ap/payments" element={<SupplierPayments />} />


                {/* Admin / Reports */}
                <Route path="reports" element={<Reports />} />
                <Route path="users" element={<Users />} />
              </Route>

              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

