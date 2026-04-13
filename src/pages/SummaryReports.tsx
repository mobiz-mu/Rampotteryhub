import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Download,
  Eye,
  FileText,
  Filter,
  Printer,
  Search,
  Users,
  UserSquare2,
  X,
  Check,
  CalendarDays,
} from "lucide-react";

function apiBase() {
  return (import.meta as any)?.env?.VITE_API_URL?.trim?.() || "";
}

function currentMonth() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function money(v: any) {
  return Number(v || 0).toLocaleString("en-MU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtDate(v: any) {
  if (!v) return "";
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString("en-GB");
}

function cls(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

type CustomerGroup = {
  customer?: {
    id?: number;
    name?: string;
    address?: string;
    phone?: string;
    whatsapp?: string;
    customer_code?: string;
  };
  items?: Array<{
    no: number;
    tx_date: string;
    particular: string;
    source_type: string;
    debit: number;
    credit: number;
    balance: number;
  }>;
  totals?: {
    debit: number;
    credit: number;
    balance: number;
  };
};

type SalesRepGroup = {
  sales_rep: string;
  days: Array<{
    date: string;
    day_name: string;
    items: Array<{
      no: number;
      customer_name: string;
      customer_address: string;
      mobile_no: string;
      doc_no: string;
      source_type: string;
      amount: number;
      status: string;
    }>;
  }>;
  total_amount: number;
};

type CustomerOption = {
  id: number;
  name: string;
  customer_code?: string | null;
};

export default function SummaryReportsPage() {
  const [tab, setTab] = useState<"customer" | "sales_rep">("customer");

  const [month, setMonth] = useState(currentMonth());
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [allCustomers, setAllCustomers] = useState(true);
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);

  const [allSalesReps, setAllSalesReps] = useState(true);
  const [salesRep, setSalesRep] = useState("");

  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [salesReps, setSalesReps] = useState<string[]>([]);

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    (async () => {
      const { data: cRows } = await supabase
        .from("customers")
        .select("id,name,customer_code")
        .eq("is_active", true)
        .order("name", { ascending: true });

      setCustomers((cRows || []) as CustomerOption[]);

      const { data: repRows } = await supabase
        .from("invoices")
        .select("sales_rep")
        .not("sales_rep", "is", null);

      const unique = Array.from(
        new Set((repRows || []).map((r: any) => String(r.sales_rep || "").trim()).filter(Boolean))
      ).sort((a, b) => a.localeCompare(b));

      setSalesReps(unique);
    })();
  }, []);

  const visibleCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return customers;

    return customers.filter((c) => {
      const name = String(c.name || "").toLowerCase();
      const code = String(c.customer_code || "").toLowerCase();
      return name.includes(q) || code.includes(q);
    });
  }, [customers, customerSearch]);

  const selectedCustomerSet = useMemo(
    () => new Set(selectedCustomerIds.map(String)),
    [selectedCustomerIds]
  );

  const selectedCustomersPreview = useMemo(() => {
    return customers.filter((c) => selectedCustomerSet.has(String(c.id)));
  }, [customers, selectedCustomerSet]);

  function toggleCustomer(id: string) {
    setSelectedCustomerIds((prev) => {
      const set = new Set(prev.map(String));
      if (set.has(id)) set.delete(id);
      else set.add(id);
      return Array.from(set);
    });
  }

  function selectAllVisibleCustomers() {
    setSelectedCustomerIds((prev) => {
      const set = new Set(prev.map(String));
      visibleCustomers.forEach((c) => set.add(String(c.id)));
      return Array.from(set);
    });
  }

  function clearSelectedCustomers() {
    setSelectedCustomerIds([]);
  }

  const queryString = useMemo(() => {
    const qs = new URLSearchParams();

    if (month) qs.set("month", month);
    if (dateFrom) qs.set("date_from", dateFrom);
    if (dateTo) qs.set("date_to", dateTo);

    if (tab === "customer") {
      const ids = selectedCustomerIds.filter(Boolean);

      if (allCustomers) {
        qs.set("all", "true");
      } else if (ids.length === 1) {
        qs.set("customer_id", ids[0]);
      } else if (ids.length > 1) {
        qs.set("all", "true");
        qs.set("customer_ids", ids.join(","));
      }
    }

    if (tab === "sales_rep") {
      if (allSalesReps) qs.set("all", "true");
      else if (salesRep) qs.set("sales_rep", salesRep);
    }

    return qs.toString();
  }, [tab, month, dateFrom, dateTo, allCustomers, selectedCustomerIds, allSalesReps, salesRep]);

  const jsonUrl =
    tab === "customer"
      ? `${apiBase()}/api/reports/summary/customers?${queryString}`
      : `${apiBase()}/api/reports/summary/sales-reps?${queryString}`;

  const printUrl =
    tab === "customer"
      ? `${apiBase()}/api/reports/summary/customers/print?${queryString}`
      : `${apiBase()}/api/reports/summary/sales-reps/print?${queryString}`;

  const downloadPdfUrl =
    tab === "customer"
      ? `${apiBase()}/api/reports/summary/customers/pdf?${queryString}`
      : `${apiBase()}/api/reports/summary/sales-reps/pdf?${queryString}`;

  async function generate() {
    if (tab === "customer" && !allCustomers && selectedCustomerIds.length === 0) {
      setData({ ok: false, error: "Please select at least one customer." });
      return;
    }

    if (tab === "sales_rep" && !allSalesReps && !salesRep) {
      setData({ ok: false, error: "Please select a sales rep." });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(jsonUrl);
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error("Summary report load failed", err);
      setData({
        ok: false,
        error: "Failed to load summary report",
      });
    } finally {
      setLoading(false);
    }
  }

  function openPdfView() {
    window.open(printUrl, "_blank", "noopener,noreferrer");
  }

  function printPdfOnly() {
    const w = window.open(printUrl, "_blank", "noopener,noreferrer");
    if (!w) return;

    const triggerPrint = () => {
      try {
        w.focus();
        w.print();
      } catch {}
    };

    w.onload = () => {
      setTimeout(triggerPrint, 500);
    };
  }

  function downloadTruePdf() {
    window.open(downloadPdfUrl, "_blank", "noopener,noreferrer");
  }

  const rawCustomerRows: CustomerGroup[] = tab === "customer" ? data?.rows || [] : [];
  const customerRows: CustomerGroup[] = useMemo(() => {
    if (tab !== "customer") return [];
    if (allCustomers) return rawCustomerRows;
    if (!selectedCustomerIds.length) return [];

    return rawCustomerRows.filter((group) =>
      selectedCustomerSet.has(String(group?.customer?.id ?? ""))
    );
  }, [tab, rawCustomerRows, allCustomers, selectedCustomerIds, selectedCustomerSet]);

  const salesRepRows: SalesRepGroup[] = tab === "sales_rep" ? data?.rows || [] : [];

  const customerKpis = useMemo(() => {
    const groups = customerRows || [];
    const customersCount = groups.length;
    const debit = groups.reduce((s, g) => s + Number(g?.totals?.debit || 0), 0);
    const credit = groups.reduce((s, g) => s + Number(g?.totals?.credit || 0), 0);
    const balance = groups.reduce((s, g) => s + Number(g?.totals?.balance || 0), 0);

    return {
      customersCount,
      debit,
      credit,
      balance,
    };
  }, [customerRows]);

  const salesRepKpis = useMemo(() => {
    const reps = salesRepRows || [];
    const repsCount = reps.length;
    const docsCount = reps.reduce(
      (s, rep) => s + (rep.days || []).reduce((x, d) => x + (d.items || []).length, 0),
      0
    );
    const amount = reps.reduce((s, rep) => s + Number(rep.total_amount || 0), 0);

    return {
      repsCount,
      docsCount,
      amount,
    };
  }, [salesRepRows]);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#fff1f2_0%,#ffffff_35%,#fff7f7_100%)]">
      <div className="mx-auto max-w-[1680px] space-y-6 p-4 sm:p-6 lg:p-8">
        <div className="overflow-hidden rounded-[34px] border border-red-100 bg-white shadow-[0_24px_80px_-36px_rgba(127,29,29,0.35)]">
          <div className="bg-[linear-gradient(135deg,#7f1d1d_0%,#991b1b_55%,#b91c1c_100%)] px-6 py-7 text-white sm:px-8">
            <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
              <div className="max-w-4xl">
                <div className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-red-100">
                  Executive Reporting Suite
                </div>

                <h1 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">
                  Summary Reports
                </h1>

                <p className="mt-3 max-w-3xl text-sm leading-6 text-red-50/90">
                  Accurate customer and sales rep summaries with premium red-white presentation,
                  cleaner controls, sharper financial visibility, and faster filter selection.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
                <ActionButton onClick={generate} loading={loading} icon={<FileText className="h-4 w-4" />} primary>
                  {loading ? "Generating..." : "Generate"}
                </ActionButton>

                <ActionButton onClick={openPdfView} icon={<Eye className="h-4 w-4" />}>
                  PDF View
                </ActionButton>

                <ActionButton onClick={printPdfOnly} icon={<Printer className="h-4 w-4" />}>
                  Print PDF
                </ActionButton>

                <ActionButton onClick={downloadTruePdf} icon={<Download className="h-4 w-4" />}>
                  Download PDF
                </ActionButton>
              </div>
            </div>
          </div>

          <div className="grid gap-6 p-4 sm:p-6 xl:grid-cols-[380px_minmax(0,1fr)]">
            <div className="space-y-6">
              <div className="rounded-[30px] border border-red-100 bg-[linear-gradient(180deg,#ffffff_0%,#fff8f8_100%)] p-4 shadow-[0_18px_50px_-34px_rgba(153,27,27,0.35)]">
                <div className="grid grid-cols-2 gap-2 rounded-[22px] bg-red-50 p-1.5">
                  <button
                    onClick={() => setTab("customer")}
                    className={cls(
                      "rounded-[18px] px-4 py-3 text-sm font-semibold transition",
                      tab === "customer"
                        ? "bg-[#8f1d1d] text-white shadow-[0_14px_28px_-18px_rgba(127,29,29,0.9)]"
                        : "text-red-900 hover:bg-white"
                    )}
                  >
                    Customer Summary
                  </button>

                  <button
                    onClick={() => setTab("sales_rep")}
                    className={cls(
                      "rounded-[18px] px-4 py-3 text-sm font-semibold transition",
                      tab === "sales_rep"
                        ? "bg-[#8f1d1d] text-white shadow-[0_14px_28px_-18px_rgba(127,29,29,0.9)]"
                        : "text-red-900 hover:bg-white"
                    )}
                  >
                    Sales Rep Summary
                  </button>
                </div>

                <div className="mt-5 space-y-4">
                  <FieldLabel icon={<CalendarDays className="h-3.5 w-3.5" />}>Month</FieldLabel>
                  <input
                    type="month"
                    value={month}
                    onChange={(e) => setMonth(e.target.value)}
                    className="w-full rounded-[20px] border border-red-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-red-400 focus:ring-4 focus:ring-red-100"
                  />

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <FieldLabel>Date From</FieldLabel>
                      <input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        className="w-full rounded-[20px] border border-red-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-red-400 focus:ring-4 focus:ring-red-100"
                      />
                    </div>

                    <div>
                      <FieldLabel>Date To</FieldLabel>
                      <input
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        className="w-full rounded-[20px] border border-red-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-red-400 focus:ring-4 focus:ring-red-100"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {tab === "customer" ? (
                <div className="rounded-[30px] border border-red-100 bg-white p-4 shadow-[0_18px_50px_-34px_rgba(153,27,27,0.30)]">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-50 text-red-700">
                      <Users className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-slate-950">Customer Filters</div>
                      <div className="text-xs text-slate-500">Search, pick one, or select multiple customers.</div>
                    </div>
                  </div>

                  <label className="mt-4 flex items-center gap-3 rounded-[20px] border border-red-100 bg-red-50/50 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={allCustomers}
                      onChange={(e) => setAllCustomers(e.target.checked)}
                      className="h-4 w-4 rounded border-red-300 text-red-700 focus:ring-red-500"
                    />
                    <span className="text-sm font-semibold text-slate-700">All Customers</span>
                  </label>

                  <div className="mt-4">
                    <FieldLabel icon={<Filter className="h-3.5 w-3.5" />}>Selected Customers</FieldLabel>

                    <div className="rounded-[22px] border border-red-100 bg-white p-3">
                      <div className="flex flex-col gap-3 sm:flex-row">
                        <div className="min-h-[50px] flex-1 rounded-[18px] border border-red-100 bg-red-50/40 px-4 py-3">
                          {allCustomers ? (
                            <div className="text-sm font-semibold text-red-800">All active customers selected</div>
                          ) : selectedCustomersPreview.length ? (
                            <div className="flex flex-wrap gap-2">
                              {selectedCustomersPreview.slice(0, 8).map((c) => (
                                <span
                                  key={c.id}
                                  className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-white px-3 py-1 text-xs font-semibold text-red-900"
                                >
                                  {c.name}
                                  {c.customer_code ? (
                                    <span className="text-red-600">({c.customer_code})</span>
                                  ) : null}
                                </span>
                              ))}
                              {selectedCustomersPreview.length > 8 ? (
                                <span className="inline-flex items-center rounded-full border border-red-200 bg-white px-3 py-1 text-xs font-semibold text-red-900">
                                  +{selectedCustomersPreview.length - 8} more
                                </span>
                              ) : null}
                            </div>
                          ) : (
                            <div className="text-sm text-slate-500">No customer selected</div>
                          )}
                        </div>

                        <button
                          type="button"
                          disabled={allCustomers}
                          onClick={() => setCustomerPickerOpen((v) => !v)}
                          className={cls(
                            "inline-flex min-h-[50px] items-center justify-center gap-2 rounded-[18px] px-4 py-3 text-sm font-semibold transition",
                            allCustomers
                              ? "cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400"
                              : "border border-red-200 bg-[#8f1d1d] text-white shadow-[0_16px_30px_-20px_rgba(127,29,29,0.9)] hover:bg-[#7a1717]"
                          )}
                        >
                          <Search className="h-4 w-4" />
                          {customerPickerOpen ? "Close Search" : "Search Customers"}
                        </button>
                      </div>

                      {!allCustomers && customerPickerOpen ? (
                        <div className="mt-4 rounded-[24px] border border-red-100 bg-[linear-gradient(180deg,#fffafa_0%,#ffffff_100%)] p-4">
                          <div className="flex flex-col gap-3 sm:flex-row">
                            <div className="relative flex-1">
                              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-red-500" />
                              <input
                                value={customerSearch}
                                onChange={(e) => setCustomerSearch(e.target.value)}
                                placeholder="Search by customer name or code..."
                                className="w-full rounded-[18px] border border-red-200 bg-white py-3 pl-10 pr-10 text-sm outline-none transition focus:border-red-400 focus:ring-4 focus:ring-red-100"
                              />
                              {customerSearch ? (
                                <button
                                  type="button"
                                  onClick={() => setCustomerSearch("")}
                                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-700"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              ) : null}
                            </div>

                            <button
                              type="button"
                              onClick={selectAllVisibleCustomers}
                              className="rounded-[18px] border border-red-200 bg-white px-4 py-3 text-sm font-semibold text-red-800 transition hover:bg-red-50"
                            >
                              Select Visible
                            </button>

                            <button
                              type="button"
                              onClick={clearSelectedCustomers}
                              className="rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                            >
                              Clear
                            </button>
                          </div>

                          <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
                            <span>{visibleCustomers.length} customer(s) found</span>
                            <span>{selectedCustomerIds.length} selected</span>
                          </div>

                          <div className="mt-3 max-h-[340px] overflow-auto rounded-[20px] border border-red-100 bg-white">
                            {visibleCustomers.length === 0 ? (
                              <div className="p-5 text-sm text-slate-500">No customers found.</div>
                            ) : (
                              visibleCustomers.map((c) => {
                                const checked = selectedCustomerSet.has(String(c.id));
                                return (
                                  <label
                                    key={c.id}
                                    className="flex cursor-pointer items-center gap-3 border-b border-red-50 px-4 py-3 transition hover:bg-red-50/50"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => toggleCustomer(String(c.id))}
                                      className="h-4 w-4 rounded border-red-300 text-red-700 focus:ring-red-500"
                                    />

                                    <div className="min-w-0 flex-1">
                                      <div className="truncate text-sm font-semibold text-slate-900">
                                        {c.name}
                                      </div>
                                      <div className="text-xs text-slate-500">
                                        {c.customer_code || "No customer code"}
                                      </div>
                                    </div>

                                    {checked ? (
                                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-red-600 text-white">
                                        <Check className="h-4 w-4" />
                                      </div>
                                    ) : null}
                                  </label>
                                );
                              })
                            )}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-[30px] border border-red-100 bg-white p-4 shadow-[0_18px_50px_-34px_rgba(153,27,27,0.30)]">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-50 text-red-700">
                      <UserSquare2 className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-slate-950">Sales Rep Filters</div>
                      <div className="text-xs text-slate-500">Choose one rep or view the complete summary.</div>
                    </div>
                  </div>

                  <label className="mt-4 flex items-center gap-3 rounded-[20px] border border-red-100 bg-red-50/50 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={allSalesReps}
                      onChange={(e) => setAllSalesReps(e.target.checked)}
                      className="h-4 w-4 rounded border-red-300 text-red-700 focus:ring-red-500"
                    />
                    <span className="text-sm font-semibold text-slate-700">All Sales Reps</span>
                  </label>

                  <div className="mt-4">
                    <FieldLabel>Sales Rep</FieldLabel>
                    <select
                      value={salesRep}
                      onChange={(e) => setSalesRep(e.target.value)}
                      disabled={allSalesReps}
                      className="w-full rounded-[20px] border border-red-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-red-400 focus:ring-4 focus:ring-red-100 disabled:bg-slate-100"
                    >
                      <option value="">Select sales rep</option>
                      {salesReps.map((rep) => (
                        <option key={rep} value={rep}>
                          {rep}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-6">
              {tab === "customer" ? (
                <>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <KpiCard label="Customers" value={String(customerKpis.customersCount)} accent="red" />
                    <KpiCard label="Total Debit" value={`Rs ${money(customerKpis.debit)}`} accent="rose" />
                    <KpiCard label="Total Credit" value={`Rs ${money(customerKpis.credit)}`} accent="pink" />
                    <KpiCard label="Closing Balance" value={`Rs ${money(customerKpis.balance)}`} accent="dark" />
                  </div>

                  {!data ? (
                    <EmptyState text="Generate a customer summary report to preview the ledger tables." />
                  ) : data?.ok === false ? (
                    <ErrorState text={data?.error || "Failed to load customer summary"} />
                  ) : customerRows.length === 0 ? (
                    <EmptyState text="No customer transactions found for the selected filter." />
                  ) : (
                    <div className="space-y-6">
                      {customerRows.map((group, idx) => {
                        const c = group.customer || {};
                        return (
                          <div
                            key={`${c.id || idx}`}
                            className="overflow-hidden rounded-[30px] border border-red-100 bg-white shadow-[0_20px_56px_-36px_rgba(127,29,29,0.35)]"
                          >
                            <div className="border-b border-red-100 bg-[linear-gradient(135deg,#7f1d1d_0%,#991b1b_55%,#b91c1c_100%)] px-6 py-5 text-white">
                              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                                <div>
                                  <div className="text-xl font-bold">{c.name || "Customer"}</div>
                                  <div className="mt-1 text-sm text-red-100/90">
                                    {c.customer_code ? `${c.customer_code} • ` : ""}
                                    {c.phone || c.whatsapp || "No contact"}
                                  </div>
                                  {c.address ? (
                                    <div className="mt-1 text-xs text-red-100/80">{c.address}</div>
                                  ) : null}
                                </div>

                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                  <MiniStat label="Debit" value={`Rs ${money(group?.totals?.debit)}`} />
                                  <MiniStat label="Credit" value={`Rs ${money(group?.totals?.credit)}`} />
                                  <MiniStat label="Balance" value={`Rs ${money(group?.totals?.balance)}`} />
                                </div>
                              </div>
                            </div>

                            <div className="overflow-x-auto">
                              <table className="min-w-full">
                                <thead>
                                  <tr className="bg-red-50 text-left text-[11px] font-bold uppercase tracking-[0.16em] text-red-900">
                                    <th className="px-4 py-3">No</th>
                                    <th className="px-4 py-3">Date</th>
                                    <th className="px-4 py-3">Particular</th>
                                    <th className="px-4 py-3">Type</th>
                                    <th className="px-4 py-3 text-right">Debit</th>
                                    <th className="px-4 py-3 text-right">Credit</th>
                                    <th className="px-4 py-3 text-right">Balance</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(group.items || []).map((row, rowIdx) => (
                                    <tr
                                      key={`${c.id || idx}-${row.no}-${rowIdx}`}
                                      className="border-t border-red-50 text-sm text-slate-700"
                                    >
                                      <td className="px-4 py-3">{row.no}</td>
                                      <td className="px-4 py-3">{fmtDate(row.tx_date)}</td>
                                      <td className="px-4 py-3 font-semibold text-slate-950">{row.particular}</td>
                                      <td className="px-4 py-3">
                                        <span className="rounded-full border border-red-100 bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-800">
                                          {row.source_type}
                                        </span>
                                      </td>
                                      <td className="px-4 py-3 text-right">Rs {money(row.debit)}</td>
                                      <td className="px-4 py-3 text-right">Rs {money(row.credit)}</td>
                                      <td className="px-4 py-3 text-right font-bold text-slate-950">
                                        Rs {money(row.balance)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                                <tfoot>
                                  <tr className="border-t-2 border-red-200 bg-red-50/60 text-sm font-bold text-slate-950">
                                    <td className="px-4 py-3" colSpan={4}>
                                      Totals
                                    </td>
                                    <td className="px-4 py-3 text-right">Rs {money(group?.totals?.debit)}</td>
                                    <td className="px-4 py-3 text-right">Rs {money(group?.totals?.credit)}</td>
                                    <td className="px-4 py-3 text-right">Rs {money(group?.totals?.balance)}</td>
                                  </tr>
                                </tfoot>
                              </table>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="grid gap-4 md:grid-cols-3">
                    <KpiCard label="Sales Reps" value={String(salesRepKpis.repsCount)} accent="red" />
                    <KpiCard label="Documents" value={String(salesRepKpis.docsCount)} accent="rose" />
                    <KpiCard label="Net Amount" value={`Rs ${money(salesRepKpis.amount)}`} accent="dark" />
                  </div>

                  {!data ? (
                    <EmptyState text="Generate a sales rep summary report to preview the executive tables." />
                  ) : data?.ok === false ? (
                    <ErrorState text={data?.error || "Failed to load sales rep summary"} />
                  ) : salesRepRows.length === 0 ? (
                    <EmptyState text="No sales rep transactions found for the selected filter." />
                  ) : (
                    <div className="space-y-6">
                      {salesRepRows.map((rep, idx) => (
                        <div
                          key={`${rep.sales_rep}-${idx}`}
                          className="overflow-hidden rounded-[30px] border border-red-100 bg-white shadow-[0_20px_56px_-36px_rgba(127,29,29,0.35)]"
                        >
                          <div className="border-b border-red-100 bg-[linear-gradient(135deg,#7f1d1d_0%,#991b1b_55%,#b91c1c_100%)] px-6 py-5 text-white">
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                              <div>
                                <div className="text-xl font-bold">{rep.sales_rep || "Sales Rep"}</div>
                                <div className="mt-1 text-sm text-red-100/90">
                                  {(rep.days || []).length} reporting day(s)
                                </div>
                              </div>

                              <div className="rounded-[20px] border border-white/15 bg-white/10 px-4 py-3">
                                <div className="text-[11px] uppercase tracking-[0.16em] text-red-100">Net Total</div>
                                <div className="mt-1 text-lg font-bold">Rs {money(rep.total_amount)}</div>
                              </div>
                            </div>
                          </div>

                          <div className="space-y-5 p-5">
                            {(rep.days || []).map((day, dayIdx) => (
                              <div key={`${day.date}-${dayIdx}`} className="overflow-hidden rounded-[24px] border border-red-100">
                                <div className="flex items-center justify-between bg-red-50 px-4 py-3">
                                  <div className="text-sm font-bold text-red-950">
                                    {fmtDate(day.date)} • {day.day_name}
                                  </div>
                                  <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-red-700">
                                    {(day.items || []).length} transaction(s)
                                  </div>
                                </div>

                                <div className="overflow-x-auto">
                                  <table className="min-w-full">
                                    <thead>
                                      <tr className="border-t border-red-100 bg-white text-left text-[11px] font-bold uppercase tracking-[0.16em] text-red-900">
                                        <th className="px-4 py-3">No</th>
                                        <th className="px-4 py-3">Customer</th>
                                        <th className="px-4 py-3">Address</th>
                                        <th className="px-4 py-3">Mobile</th>
                                        <th className="px-4 py-3">Doc No</th>
                                        <th className="px-4 py-3">Type</th>
                                        <th className="px-4 py-3 text-right">Amount</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {(day.items || []).map((item, itemIdx) => (
                                        <tr
                                          key={`${item.doc_no}-${item.no}-${itemIdx}`}
                                          className="border-t border-red-50 text-sm text-slate-700"
                                        >
                                          <td className="px-4 py-3">{item.no}</td>
                                          <td className="px-4 py-3 font-semibold text-slate-950">{item.customer_name}</td>
                                          <td className="px-4 py-3">{item.customer_address}</td>
                                          <td className="px-4 py-3">{item.mobile_no}</td>
                                          <td className="px-4 py-3">{item.doc_no}</td>
                                          <td className="px-4 py-3">
                                            <span className="rounded-full border border-red-100 bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-800">
                                              {item.source_type}
                                            </span>
                                          </td>
                                          <td className="px-4 py-3 text-right font-bold text-slate-950">
                                            Rs {money(item.amount)}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                    <tfoot>
                                      <tr className="border-t-2 border-red-200 bg-red-50/60 text-sm font-bold text-slate-950">
                                        <td className="px-4 py-3" colSpan={6}>
                                          Day Total
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                          Rs {money((day.items || []).reduce((s, r) => s + Number(r.amount || 0), 0))}
                                        </td>
                                      </tr>
                                    </tfoot>
                                  </table>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  icon,
  primary = false,
  loading = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  icon: React.ReactNode;
  primary?: boolean;
  loading?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={cls(
        "inline-flex items-center justify-center gap-2 rounded-[18px] px-4 py-3 text-sm font-semibold transition",
        primary
          ? "bg-white text-red-900 shadow-[0_16px_30px_-20px_rgba(0,0,0,0.45)] hover:bg-red-50"
          : "border border-white/20 bg-white/10 text-white hover:bg-white/15",
        loading && "opacity-60"
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function FieldLabel({
  children,
  icon,
}: {
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <label className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
      {icon}
      {children}
    </label>
  );
}

function KpiCard({
  label,
  value,
  accent = "red",
}: {
  label: string;
  value: string;
  accent?: "red" | "rose" | "pink" | "dark";
}) {
  const tone =
    accent === "dark"
      ? "from-[#7f1d1d] to-[#991b1b] text-white border-red-200"
      : accent === "pink"
      ? "from-[#fff1f2] to-[#ffe4e6] text-slate-950 border-red-100"
      : accent === "rose"
      ? "from-[#fff5f5] to-[#ffecec] text-slate-950 border-red-100"
      : "from-white to-[#fff5f5] text-slate-950 border-red-100";

  const labelTone = accent === "dark" ? "text-red-100" : "text-red-700";

  return (
    <div
      className={cls(
        "rounded-[26px] border bg-gradient-to-br p-5 shadow-[0_18px_50px_-36px_rgba(127,29,29,0.30)]",
        tone
      )}
    >
      <div className={cls("text-[11px] font-bold uppercase tracking-[0.18em]", labelTone)}>{label}</div>
      <div className="mt-3 text-2xl font-extrabold tracking-tight">{value}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] border border-white/15 bg-white/10 px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.16em] text-red-100">{label}</div>
      <div className="mt-1 font-bold text-white">{value}</div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-[30px] border border-dashed border-red-200 bg-white p-10 text-center shadow-[0_18px_50px_-36px_rgba(127,29,29,0.20)]">
      <div className="text-lg font-bold text-slate-950">No Preview Yet</div>
      <div className="mt-2 text-sm text-slate-500">{text}</div>
    </div>
  );
}

function ErrorState({ text }: { text: string }) {
  return (
    <div className="rounded-[30px] border border-red-200 bg-red-50 p-6 shadow-[0_18px_50px_-36px_rgba(127,29,29,0.20)]">
      <div className="text-sm font-bold text-red-700">Report Error</div>
      <div className="mt-2 text-sm text-red-600">{text}</div>
    </div>
  );
}