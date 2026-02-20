// src/pages/Customers.tsx
import React, { useMemo, useState, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import type { Customer } from "@/types/customer";
import { listCustomers, setCustomerActive } from "@/lib/customers";

import CustomersReport from "@/components/customers/CustomersReport";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

import {
  Plus,
  MessageCircle,
  ReceiptText,
  Users,
  RefreshCw,
  FileDown,
  ChevronLeft,
  ChevronRight,
  Search,
  Upload,
  Pencil,
} from "lucide-react";

/* ===================================================
   Helpers
=================================================== */
function normalizePhone(v: any) {
  return String(v ?? "").replace(/[^\d]/g, "");
}

function toNumber(v: any, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function downloadCsv(rows: Customer[]) {
  if (!rows.length) return toast.error("No customers to export");

  const header = [
    "customer_code",
    "customer_name",
    "client_name",
    "address",
    "phone",
    "whatsapp",
    "brn",
    "vat_no",
    "discount_percent",
  ];

  const csv = [
    header.join(","),
    ...rows.map((c) =>
      [
        c.customer_code ?? "",
        c.name ?? "",
        (c as any).client_name ?? "",
        c.address ?? "",
        c.phone ?? "",
        c.whatsapp ?? "",
        c.brn ?? "",
        c.vat_no ?? "",
        (c as any).discount_percent ?? 0,
      ]
        .map((x) => `"${String(x).replace(/"/g, '""')}"`)
        .join(",")
    ),
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "customers.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
  toast.success("Downloaded customers.csv");
}

function sampleImportTemplateCsv() {
  // “Same format as my table” => matches your export header + expected columns for import
  const header = [
    "customer_code",
    "customer_name",
    "client_name",
    "address",
    "phone",
    "whatsapp",
    "brn",
    "vat_no",
    "discount_percent",
  ];

  const csv = [
    header.join(","),
    `"CUST-001","Demo Customer","Ram Pottery Ltd","Port Louis","57550000","57550000","C12345678","VAT123456",0`,
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "customers_import_template.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
  toast.success("Downloaded import template");
}

/* ===================================================
   Page
=================================================== */
export default function Customers() {
  const nav = useNavigate();
  const qc = useQueryClient();

  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");

  const [page, setPage] = useState(0);
  const pageSize = 60;

  const [reportOpen, setReportOpen] = useState(false);

  // Import file input ref
  const importInputRef = useRef<HTMLInputElement | null>(null);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const customersQ = useQuery({
    queryKey: ["customers", { q: debouncedQ, activeOnly: true }],
    queryFn: () =>
      listCustomers({
        q: debouncedQ,
        activeOnly: true,
        limit: 10000,
      }),
    staleTime: 60_000,
  });

  const rows = (customersQ.data || []) as Customer[];

  // keep page valid when list changes
  useEffect(() => {
    setPage(0);
  }, [debouncedQ]);

  const pageCount = useMemo(() => Math.max(1, Math.ceil(rows.length / pageSize)), [rows.length]);
  const safePage = Math.min(page, pageCount - 1);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageCount]);

  const paginated = useMemo(() => {
    const start = safePage * pageSize;
    return rows.slice(start, start + pageSize);
  }, [rows, safePage]);

  const showing = useMemo(() => {
    if (!rows.length) return "Showing 0–0 of 0";
    const start = safePage * pageSize + 1;
    const end = Math.min(rows.length, (safePage + 1) * pageSize);
    return `Showing ${start}–${end} of ${rows.length}`;
  }, [rows.length, safePage]);

  const activeM = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) => setCustomerActive(id, active),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers"], exact: false });
      toast.success("Updated status");
    },
    onError: (e: any) => toast.error(e?.message || "Failed to update status"),
  });

  const whatsappCustomer = (c: Customer) => {
    const phone = normalizePhone((c as any).whatsapp || c.phone);
    if (!phone) return toast.error("No WhatsApp/Phone on customer");

    const withCountry = phone.length === 8 ? `230${phone}` : phone;
    const url = `https://wa.me/${withCountry}?text=${encodeURIComponent(`Hello ${c.name}, this is Ram Pottery Ltd.`)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  /* ===================================================
     Import (Excel/CSV) — UI only hook (routing to import page)
     - To keep the rest unchanged and avoid new backend assumptions,
       we route to /customers/import if it exists, otherwise we accept
       CSV file and show a helpful toast.
  =================================================== */
  const openImport = () => {
    // If you already have an import screen, this will work immediately
    // Otherwise, still allows selecting a file and you can wire it later.
    if (importInputRef.current) importInputRef.current.click();
  };

  const onImportFileSelected = (file: File | null) => {
    if (!file) return;

    const name = file.name.toLowerCase();
    const isExcel = name.endsWith(".xlsx") || name.endsWith(".xls");
    const isCsv = name.endsWith(".csv");

    if (!isExcel && !isCsv) {
      toast.error("Please upload an Excel (.xlsx/.xls) or CSV (.csv) file");
      return;
    }

    // Premium UX: route to a dedicated import screen if you have it
    // You can create /customers/import to actually process the file.
    // We pass a hint via sessionStorage (safe, no huge payload).
    try {
      sessionStorage.setItem("rp_customers_import_filename", file.name);
      sessionStorage.setItem("rp_customers_import_type", isExcel ? "excel" : "csv");
      // Note: we do NOT store the file itself (browser security + size).
      // The import page should request the user to select the file again.
    } catch {
      // ignore
    }

    toast.message("Import ready", {
      description: "We’ll open the import screen. Use the template to match columns.",
    });

    // Navigate to import page (create this route if not yet)
    nav("/customers/import");
  };

  return (
    <div className="space-y-6 pb-10">
      {/* premium subtle backdrop */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-b from-slate-50 via-white to-slate-50 dark:from-slate-950 dark:via-slate-950 dark:to-slate-950" />
        <div className="absolute -top-48 -left-48 h-[520px] w-[520px] rounded-full bg-rose-500/10 blur-3xl" />
        <div className="absolute -top-48 -right-48 h-[520px] w-[520px] rounded-full bg-sky-500/10 blur-3xl" />
      </div>

      {/* Hidden file input (Import) */}
      <input
        ref={importInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          onImportFileSelected(f);
          // reset so selecting same file again triggers change
          e.currentTarget.value = "";
        }}
      />

      {/* Top header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-primary/10 border border-white/30 dark:border-white/10 flex items-center justify-center">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div>
            <div className="text-2xl font-semibold tracking-tight">Customers</div>
            <div className="text-xs text-muted-foreground">Fast register • CSV export • Statements • Reporting</div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => customersQ.refetch()} disabled={customersQ.isFetching}>
            <RefreshCw className="h-4 w-4 mr-2" />
            {customersQ.isFetching ? "Refreshing…" : "Refresh"}
          </Button>

          <Button variant="outline" onClick={() => setReportOpen(true)} disabled={!rows.length}>
            <FileDown className="h-4 w-4 mr-2" />
            Customer Report
          </Button>

          {/* NEW: Import Excel/CSV */}
          <Button variant="outline" onClick={openImport}>
            <Upload className="h-4 w-4 mr-2" />
            Import Excel
          </Button>

          {/* Optional helper: template download (keeps import “same format”) */}
          <Button variant="outline" onClick={sampleImportTemplateCsv}>
            <FileDown className="h-4 w-4 mr-2" />
            Import Template
          </Button>

          <Button variant="outline" onClick={() => downloadCsv(rows)} disabled={!rows.length}>
            <FileDown className="h-4 w-4 mr-2" />
            Export CSV
          </Button>

          <Button className="gradient-primary shadow-glow text-primary-foreground" onClick={() => nav("/customers/new")}>
            <Plus className="h-4 w-4 mr-2" />
            New Customer
          </Button>
        </div>
      </div>

      {/* Search */}
      <Card className="p-4 border-white/30 bg-white/85 backdrop-blur shadow-[0_18px_40px_-22px_rgba(0,0,0,.35)] dark:bg-slate-950/40 dark:border-white/10">
        <div className="relative">
          <Search className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            className="pl-9 bg-white/90 dark:bg-slate-950/50"
            placeholder="Search customer, code, phone, WhatsApp, BRN, VAT…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="mt-2 text-[11px] text-muted-foreground">
          {customersQ.isLoading ? "Loading…" : `${rows.length} customer(s) found`}
        </div>
      </Card>

      {/* Table */}
      <Card className="overflow-hidden border-white/30 bg-white/85 backdrop-blur shadow-[0_18px_40px_-22px_rgba(0,0,0,.35)] dark:bg-slate-950/40 dark:border-white/10">
        <div className="overflow-auto max-h-[68vh]">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border/40">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Code</th>
                <th className="px-4 py-3 text-left font-semibold">Customer</th>
                <th className="px-4 py-3 text-left font-semibold">Phone</th>
                <th className="px-4 py-3 text-left font-semibold">WhatsApp</th>
                <th className="px-4 py-3 text-left font-semibold">Discount</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-border/30">
              {customersQ.isLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-muted-foreground">
                    Loading customers…
                  </td>
                </tr>
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-muted-foreground">
                    No customers found.
                  </td>
                </tr>
              ) : (
                paginated.map((c) => {
                  const discount = toNumber((c as any).discount_percent ?? 0, 0);
                  return (
                    <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-4 font-semibold">{c.customer_code || "-"}</td>

                      <td className="px-4 py-4">
                        <div className="font-medium">{c.name}</div>
                        {(c as any).client_name ? (
                          <div className="text-[11px] text-muted-foreground">
                            Client: {String((c as any).client_name)}
                          </div>
                        ) : null}
                      </td>

                      <td className="px-4 py-4">{c.phone || "-"}</td>
                      <td className="px-4 py-4">{c.whatsapp || "-"}</td>
                      <td className="px-4 py-4">{discount.toFixed(0)}%</td>

                      <td className="px-4 py-4">
                        <div className="flex justify-end gap-2">
                          {/* NEW: Edit customer */}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => nav(`/customers/${c.id}/edit`)}
                            title="Edit Customer"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>

                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => nav(`/statement/print?customerId=${c.id}`)}
                            title="Statement"
                          >
                            <ReceiptText className="h-4 w-4" />
                          </Button>

                          <Button size="sm" variant="outline" onClick={() => whatsappCustomer(c)} title="WhatsApp">
                            <MessageCircle className="h-4 w-4" />
                          </Button>

                          <Button
                            size="sm"
                            variant="outline"
                            disabled={activeM.isPending}
                            onClick={() => activeM.mutate({ id: c.id, active: !c.is_active })}
                            title={c.is_active ? "Deactivate" : "Activate"}
                          >
                            {c.is_active ? "Deactivate" : "Activate"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border/40 text-xs text-muted-foreground">
          <div>{showing}</div>

          <div className="flex items-center gap-2">
            <Button
              size="icon"
              variant="outline"
              disabled={safePage === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            <div className="px-2">
              Page <b>{safePage + 1}</b> / {pageCount}
            </div>

            <Button
              size="icon"
              variant="outline"
              disabled={safePage >= pageCount - 1}
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>

      {/* Report Modal */}
      <CustomersReport open={reportOpen} onOpenChange={setReportOpen} customers={rows} />
    </div>
  );
}
