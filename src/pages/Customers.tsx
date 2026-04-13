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
  MapPin,
  Phone,
  BadgePercent,
  FileSpreadsheet,
  Building2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

/* ===================================================
   Helpers
=================================================== */
function normalizePhone(v: any) {
  return String(v ?? "").replace(/[^\d]/g, "");
}

function normalizeText(v: any) {
  return String(v ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function compactText(v: any) {
  return String(v ?? "").toLowerCase().replace(/\s+/g, "").trim();
}

function toNumber(v: any, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function initials(name: any) {
  const parts = String(name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "CU";
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("");
}

function customerIdentityKey(c: Customer) {
  const brn = normalizeText((c as any).brn);
  const name = normalizeText((c as any).name);
  const address = normalizeText((c as any).address);

  if (brn) return `BRN:${brn}`;
  return `NAMEADDR:${name}__${address}`;
}

function customerIdentityLabel(c: Customer) {
  const brn = String((c as any).brn ?? "").trim();
  if (brn) return `BRN • ${brn}`;

  const name = String((c as any).name ?? "").trim() || "No Name";
  const address = String((c as any).address ?? "").trim() || "No Address";
  return `${name} • ${address}`;
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
        (c as any).brn ?? "",
        (c as any).vat_no ?? "",
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

function searchScoreCustomer(c: Customer, term: string) {
  const q = compactText(term);
  if (!q) return 0;

  const name = compactText((c as any).name);
  const client = compactText((c as any).client_name);
  const code = compactText((c as any).customer_code);
  const brn = compactText((c as any).brn);
  const vat = compactText((c as any).vat_no);
  const addr = compactText((c as any).address);
  const phone = compactText((c as any).phone);
  const whatsapp = compactText((c as any).whatsapp);

  const nameWords = String((c as any).name ?? "")
    .toLowerCase()
    .split(/\s+/)
    .map((x) => x.trim())
    .filter(Boolean);

  if (name === q) return 1400;
  if (name.startsWith(q)) return 1300;
  if (nameWords.some((w) => w.startsWith(q))) return 1200;
  if (client.startsWith(q)) return 1100;
  if (code === q) return 1080;
  if (code.startsWith(q)) return 1040;
  if (brn === q) return 1020;
  if (brn.startsWith(q)) return 990;
  if (vat === q) return 970;
  if (phone.startsWith(q) || whatsapp.startsWith(q)) return 940;
  if (name.includes(q)) return 860;
  if (client.includes(q)) return 820;
  if (code.includes(q)) return 780;
  if (brn.includes(q)) return 760;
  if (vat.includes(q)) return 740;
  if (addr.includes(q)) return 700;
  if (phone.includes(q) || whatsapp.includes(q)) return 660;

  return 0;
}

function StatCard({
  icon,
  label,
  value,
  tone = "default",
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  tone?: "default" | "blue" | "green" | "amber";
}) {
  const toneCls =
    tone === "blue"
      ? "border-sky-200/70 bg-sky-50/70"
      : tone === "green"
      ? "border-emerald-200/70 bg-emerald-50/70"
      : tone === "amber"
      ? "border-amber-200/70 bg-amber-50/70"
      : "border-slate-200/70 bg-white/90";

  return (
    <Card className={`rounded-[24px] border p-4 shadow-[0_18px_44px_-30px_rgba(15,23,42,.22)] ${toneCls}`}>
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{label}</div>
          <div className="text-2xl font-extrabold tracking-tight text-slate-950">{value}</div>
        </div>
      </div>
    </Card>
  );
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

  const importInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const customersQ = useQuery({
  queryKey: ["customers", { activeOnly: false }],
  queryFn: () =>
    listCustomers({
      activeOnly: false,
      limit: 10000,
    }),
  staleTime: 60_000,
});

  const allRows = (customersQ.data || []) as Customer[];

  const rows = useMemo(() => {
    const term = debouncedQ.trim();

    const mapped = allRows.map((c) => ({
      row: c,
      score: term ? searchScoreCustomer(c, term) : 0,
      name: String((c as any).name ?? "").trim(),
      code: String((c as any).customer_code ?? "").trim(),
    }));

    const filtered = term ? mapped.filter((x) => x.score > 0) : mapped;

    filtered.sort((a, b) => {
      if (term && b.score !== a.score) return b.score - a.score;

      const byName = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      if (byName !== 0) return byName;

      return a.code.localeCompare(b.code, undefined, { sensitivity: "base" });
    });

    return filtered.map((x) => x.row);
  }, [allRows, debouncedQ]);

  useEffect(() => {
    setPage(0);
  }, [debouncedQ]);

  const pageCount = useMemo(() => Math.max(1, Math.ceil(rows.length / pageSize)), [rows.length]);
  const safePage = Math.min(page, pageCount - 1);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

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

  const totalCustomers = allRows.length;
  const totalWithAddress = useMemo(() => allRows.filter((c) => String(c.address ?? "").trim()).length, [allRows]);
  const totalWithWhatsapp = useMemo(() => allRows.filter((c) => String(c.whatsapp ?? "").trim()).length, [allRows]);
  const totalWithBrn = useMemo(() => allRows.filter((c) => String((c as any).brn ?? "").trim()).length, [allRows]);

  const avgDiscount = useMemo(() => {
    if (!allRows.length) return 0;
    const total = allRows.reduce((sum, c) => sum + toNumber((c as any).discount_percent ?? 0, 0), 0);
    return Math.round(total / allRows.length);
  }, [allRows]);

  const duplicateNameCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of allRows) {
      const key = normalizeText((c as any).name);
      if (!key) continue;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return Array.from(counts.values()).filter((x) => x > 1).length;
  }, [allRows]);

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

  const openImport = () => {
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

    try {
      sessionStorage.setItem("rp_customers_import_filename", file.name);
      sessionStorage.setItem("rp_customers_import_type", isExcel ? "excel" : "csv");
    } catch {
      //
    }

    toast.message("Import ready", {
      description: "We’ll open the import screen. Use the template to match columns.",
    });

    nav("/customers/import");
  };

  return (
    <div className="space-y-5 pb-8">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-b from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-950 dark:to-slate-950" />
        <div className="absolute -top-40 -left-32 h-[420px] w-[420px] rounded-full bg-sky-500/8 blur-3xl" />
        <div className="absolute top-0 right-0 h-[360px] w-[360px] rounded-full bg-indigo-500/8 blur-3xl" />
      </div>

      <input
        ref={importInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          onImportFileSelected(f);
          e.currentTarget.value = "";
        }}
      />

      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 space-y-4">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[22px] border border-white/50 bg-white/85 shadow-sm backdrop-blur">
              <Users className="h-7 w-7 text-primary" />
            </div>

            <div className="min-w-0">
              <div className="text-4xl font-extrabold tracking-tight text-slate-950">Customers</div>
              <div className="mt-1 max-w-3xl text-sm text-muted-foreground">
                Executive customer register • stronger readability • premium spacing • better identity control
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard icon={<Users className="h-4 w-4 text-slate-700" />} label="Total Customers" value={totalCustomers} />
            <StatCard icon={<Building2 className="h-4 w-4 text-sky-700" />} label="With BRN" value={totalWithBrn} tone="blue" />
            <StatCard icon={<MapPin className="h-4 w-4 text-sky-700" />} label="With Address" value={totalWithAddress} tone="blue" />
            <StatCard icon={<MessageCircle className="h-4 w-4 text-emerald-700" />} label="With WhatsApp" value={totalWithWhatsapp} tone="green" />
            <StatCard icon={<BadgePercent className="h-4 w-4 text-amber-700" />} label="Avg Discount" value={`${avgDiscount}%`} tone="amber" />
          </div>
        </div>

        <div className="flex flex-wrap gap-2 xl:max-w-[640px] xl:justify-end">
          <Button variant="outline" onClick={() => customersQ.refetch()} disabled={customersQ.isFetching} className="h-11 rounded-xl">
            <RefreshCw className={`mr-2 h-4 w-4 ${customersQ.isFetching ? "animate-spin" : ""}`} />
            {customersQ.isFetching ? "Refreshing…" : "Refresh"}
          </Button>

          <Button variant="outline" onClick={() => setReportOpen(true)} disabled={!rows.length} className="h-11 rounded-xl">
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            Customer Report
          </Button>

          <Button variant="outline" onClick={openImport} className="h-11 rounded-xl">
            <Upload className="mr-2 h-4 w-4" />
            Import Excel
          </Button>

          <Button variant="outline" onClick={sampleImportTemplateCsv} className="h-11 rounded-xl">
            <FileDown className="mr-2 h-4 w-4" />
            Import Template
          </Button>

          <Button variant="outline" onClick={() => downloadCsv(rows)} disabled={!rows.length} className="h-11 rounded-xl">
            <FileDown className="mr-2 h-4 w-4" />
            Export CSV
          </Button>

          <Button className="h-11 rounded-xl gradient-primary px-5 shadow-glow text-primary-foreground" onClick={() => nav("/customers/new")}>
            <Plus className="mr-2 h-4 w-4" />
            New Customer
          </Button>
        </div>
      </div>

      <Card className="rounded-[28px] border-white/40 bg-white/88 p-5 shadow-[0_18px_48px_-28px_rgba(15,23,42,.18)] backdrop-blur">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <Input
              className="h-12 rounded-2xl border-slate-200 bg-white pl-11 pr-24 text-sm shadow-[0_10px_24px_-18px_rgba(15,23,42,.18)] focus-visible:ring-2 focus-visible:ring-primary/20"
              placeholder="Search customer, code, BRN, VAT, phone, WhatsApp, address…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            {q ? (
              <button
                type="button"
                onClick={() => setQ("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 shadow-sm hover:bg-slate-50"
              >
                Clear
              </button>
            ) : null}
          </div>

          <div className="text-sm text-slate-500">
            {customersQ.isLoading ? "Loading…" : `${rows.length} customer(s) found • ${duplicateNameCount} repeated-name group(s)`}
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-600">
          <div className="flex flex-wrap items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <span className="font-semibold text-slate-800">Account identity rule:</span>
            <span>Use <b>BRN</b> when available.</span>
            <span className="text-slate-400">•</span>
            <span>If no BRN, fallback to <b>Name + Address</b>.</span>
            <span className="text-slate-400">•</span>
            <span>Same names must remain separate accounts.</span>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden rounded-[30px] border-white/40 bg-white/90 shadow-[0_22px_60px_-30px_rgba(15,23,42,.20)] backdrop-blur">
        <div className="border-b border-slate-200/70 bg-white/94 px-5 py-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-[28px] font-extrabold tracking-tight text-slate-950">Customer Register</div>
              <div className="mt-1 text-sm text-muted-foreground">{showing}</div>
            </div>

            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Search prioritizes names starting with your typed letters
            </div>
          </div>

          <div className="mt-4 hidden grid-cols-[1.8fr_1.05fr_.75fr_.78fr_.95fr_.55fr_190px] gap-4 border-t border-slate-100 pt-4 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400 xl:grid">
            <div>Customer</div>
            <div>Address</div>
            <div>Phone</div>
            <div>WhatsApp</div>
            <div>BRN / VAT</div>
            <div>Discount</div>
            <div className="text-right">Actions</div>
          </div>
        </div>

        <div className="max-h-[72vh] overflow-auto bg-gradient-to-b from-slate-50/45 to-white px-4 py-3 sm:px-5">
          {customersQ.isLoading ? (
            <div className="rounded-[24px] border bg-white p-8 text-sm text-muted-foreground">Loading customers…</div>
          ) : paginated.length === 0 ? (
            <div className="rounded-[24px] border bg-white p-10 text-center">
              <div className="text-base font-bold text-slate-800">No customers found</div>
              <div className="mt-1 text-sm text-slate-500">Try another keyword or clear the search.</div>
            </div>
          ) : (
            <div className="space-y-2.5">
              {paginated.map((c) => {
                const discount = toNumber((c as any).discount_percent ?? 0, 0);
                const brn = String((c as any).brn ?? "").trim();
                const vatNo = String((c as any).vat_no ?? "").trim();
                const accountIdentity = customerIdentityLabel(c);
                const identityKey = customerIdentityKey(c);
                const customerCode = String(c.customer_code ?? "").trim();

                return (
                  <div
                    key={c.id}
                    className="group rounded-[22px] border border-slate-200/90 bg-white px-4 py-3.5 shadow-[0_14px_34px_-28px_rgba(15,23,42,.18)] transition-all duration-200 hover:-translate-y-[1px] hover:shadow-[0_18px_44px_-26px_rgba(15,23,42,.22)]"
                  >
                    <div className="grid gap-4 xl:grid-cols-[1.8fr_1.05fr_.75fr_.78fr_.95fr_.55fr_190px] xl:items-center">
                      <div className="min-w-0">
                        <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400 xl:hidden">Customer</div>
                        <div className="flex items-start gap-3">
                          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] bg-slate-100 text-base font-extrabold text-slate-700 ring-1 ring-slate-200">
                            {initials(c.name)}
                          </div>

                          <div className="min-w-0">
                            <div className="truncate text-[20px] font-extrabold tracking-tight text-slate-950">
                              {c.name || "-"}
                            </div>

                            {(c as any).client_name ? (
                              <div className="mt-1 text-[15px] text-slate-500">
                                Client: <span className="font-medium text-slate-700">{String((c as any).client_name)}</span>
                              </div>
                            ) : (
                              <div className="mt-1 text-[15px] text-slate-400">No client alias</div>
                            )}

                            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                              {customerCode ? (
  <span className="inline-flex max-w-full items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-bold text-slate-700">
                              #{customerCode}
                               </span>
                              ) : null}

                              <span className="inline-flex max-w-full items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-700">
                                <span className="truncate" title={accountIdentity}>
                                  {accountIdentity}
                                </span>
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="min-w-0">
                        <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400 xl:hidden">Address</div>
                        <div className="flex items-start gap-2">
                          <MapPin className="mt-[2px] h-4 w-4 shrink-0 text-slate-400" />
                          <div className="break-words text-[15px] leading-6 text-slate-700">{c.address || "-"}</div>
                        </div>
                        <div className="mt-2 text-[12px] text-slate-400 break-all" title={identityKey}>
                          Key: {identityKey}
                        </div>
                      </div>

                      <div className="min-w-0">
                        <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400 xl:hidden">Phone</div>
                        <div className="flex items-center gap-2 text-sm text-slate-700">
                          <Phone className="h-4 w-4 text-slate-400" />
                          <span className="font-medium break-all">{c.phone || "-"}</span>
                        </div>
                      </div>

                      <div className="min-w-0">
                        <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400 xl:hidden">WhatsApp</div>
                        <div className="flex items-center gap-2 text-sm text-slate-700">
                          <MessageCircle className="h-4 w-4 text-emerald-500" />
                          <span className="font-medium break-all">{c.whatsapp || "-"}</span>
                        </div>
                      </div>

                      <div className="min-w-0">
                        <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400 xl:hidden">BRN / VAT</div>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-sm text-slate-700">
                            <Building2 className="h-4 w-4 text-slate-400" />
                            <span className="font-medium break-all">{brn || "-"}</span>
                          </div>
                          <div className="text-xs text-slate-500 break-all">
                            VAT: <span className="font-medium text-slate-700">{vatNo || "-"}</span>
                          </div>
                        </div>
                      </div>

                      <div className="min-w-0 xl:text-center">
                        <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400 xl:hidden">Discount</div>
                        <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">
                          {discount.toFixed(0)}%
                        </span>
                      </div>

                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-9 w-9 rounded-xl"
                          onClick={() => nav(`/customers/${c.id}/edit`)}
                          title="Edit Customer"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>

                        <Button
                          size="icon"
                          variant="outline"
                          className="h-10 w-10 rounded-2xl"
                          onClick={() => nav(`/statement/print?customerId=${c.id}`)}
                          title="Statement"
                        >
                          <ReceiptText className="h-4 w-4" />
                        </Button>

                        <Button
                          size="icon"
                          variant="outline"
                          className="h-10 w-10 rounded-2xl"
                          onClick={() => whatsappCustomer(c)}
                          title="WhatsApp"
                        >
                          <MessageCircle className="h-4 w-4" />
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-xl px-4 h-9"
                          disabled={activeM.isPending}
                          onClick={() => activeM.mutate({ id: c.id, active: !c.is_active })}
                          title={c.is_active ? "Deactivate" : "Activate"}
                        >
                          {c.is_active ? "Deactivate" : "Activate"}
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-slate-200/70 bg-white px-5 py-4 text-sm text-slate-500">
          <div>{showing}</div>

          <div className="flex items-center gap-2">
            <Button
              size="icon"
              variant="outline"
              className="rounded-xl"
              disabled={safePage === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            <div className="px-2 text-sm">
              Page <b className="text-slate-900">{safePage + 1}</b> / <b className="text-slate-900">{pageCount}</b>
            </div>

            <Button
              size="icon"
              variant="outline"
              className="rounded-xl"
              disabled={safePage >= pageCount - 1}
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>

      <CustomersReport open={reportOpen} onOpenChange={setReportOpen} customers={rows} />
    </div>
  );
}