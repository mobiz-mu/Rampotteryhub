// src/pages/Customers.tsx
import React, { useMemo, useState, useEffect } from "react";
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
} from "lucide-react";

/* ===================================================
   Helpers
=================================================== */
function normalizePhone(v: any) {
  return String(v ?? "").replace(/[^\d]/g, "");
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

  return (
    <div className="space-y-6 pb-10">
      {/* Top header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-primary/10 border flex items-center justify-center">
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
      <Card className="p-4 shadow-sm">
        <div className="relative">
          <Search className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            className="pl-9"
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
      <Card className="overflow-hidden shadow-sm">
        <div className="overflow-auto max-h-[68vh]">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Code</th>
                <th className="px-4 py-3 text-left font-semibold">Customer</th>
                <th className="px-4 py-3 text-left font-semibold">Phone</th>
                <th className="px-4 py-3 text-left font-semibold">WhatsApp</th>
                <th className="px-4 py-3 text-left font-semibold">Discount</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y">
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
                paginated.map((c) => (
                  <tr key={c.id} className="hover:bg-muted/40 transition">
                    <td className="px-4 py-4 font-semibold">{c.customer_code || "-"}</td>
                    <td className="px-4 py-4">
                      <div className="font-medium">{c.name}</div>
                      {(c as any).client_name ? (
                        <div className="text-[11px] text-muted-foreground">Client: {String((c as any).client_name)}</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-4">{c.phone || "-"}</td>
                    <td className="px-4 py-4">{c.whatsapp || "-"}</td>
                    <td className="px-4 py-4">{Number((c as any).discount_percent ?? 0).toFixed(0)}%</td>
                    <td className="px-4 py-4">
                      <div className="flex justify-end gap-2">
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
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t text-xs text-muted-foreground">
          <div>{showing}</div>

          <div className="flex items-center gap-2">
            <Button size="icon" variant="outline" disabled={safePage === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
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

