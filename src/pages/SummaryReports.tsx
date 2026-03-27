import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

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

export default function SummaryReportsPage() {
  const [tab, setTab] = useState<"customer" | "sales_rep">("customer");

  const [month, setMonth] = useState(currentMonth());
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [allCustomers, setAllCustomers] = useState(true);
  const [customerId, setCustomerId] = useState("");

  const [allSalesReps, setAllSalesReps] = useState(true);
  const [salesRep, setSalesRep] = useState("");

  const [customers, setCustomers] = useState<any[]>([]);
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

      setCustomers(cRows || []);

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

  const queryString = useMemo(() => {
    const qs = new URLSearchParams();

    if (month) qs.set("month", month);
    if (dateFrom) qs.set("date_from", dateFrom);
    if (dateTo) qs.set("date_to", dateTo);

    if (tab === "customer") {
      if (allCustomers) qs.set("all", "true");
      else if (customerId) qs.set("customer_id", customerId);
    }

    if (tab === "sales_rep") {
      if (allSalesReps) qs.set("all", "true");
      else if (salesRep) qs.set("sales_rep", salesRep);
    }

    return qs.toString();
  }, [tab, month, dateFrom, dateTo, allCustomers, customerId, allSalesReps, salesRep]);

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

  const customerRows: CustomerGroup[] = tab === "customer" ? data?.rows || [] : [];
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
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-[1600px] p-6 lg:p-8 space-y-6">
        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
                Executive Reporting
              </div>

              <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-950">
                Summary Reports
              </h1>

              <p className="mt-2 max-w-3xl text-sm text-slate-600">
                Monthly and custom-date professional summaries for customer ledgers and sales rep activity across all point of sale transactions.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={generate}
                disabled={loading}
                className="inline-flex items-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-60"
              >
                {loading ? "Generating..." : "Generate"}
              </button>

              <button
                onClick={openPdfView}
                className="inline-flex items-center rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-50"
              >
                PDF View
              </button>

              <button
                onClick={printPdfOnly}
                className="inline-flex items-center rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-50"
              >
                Print PDF
              </button>

              <button
                onClick={downloadTruePdf}
                className="inline-flex items-center rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-50"
              >
                Download PDF
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
          <div className="space-y-6">
            <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
              <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1">
                <button
                  onClick={() => setTab("customer")}
                  className={cls(
                    "rounded-2xl px-4 py-3 text-sm font-semibold transition",
                    tab === "customer" ? "bg-slate-950 text-white shadow-sm" : "text-slate-700 hover:bg-white"
                  )}
                >
                  Customer Summary
                </button>

                <button
                  onClick={() => setTab("sales_rep")}
                  className={cls(
                    "rounded-2xl px-4 py-3 text-sm font-semibold transition",
                    tab === "sales_rep" ? "bg-slate-950 text-white shadow-sm" : "text-slate-700 hover:bg-white"
                  )}
                >
                  Sales Rep Summary
                </button>
              </div>

              <div className="mt-4 space-y-4">
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Month
                  </label>
                  <input
                    type="month"
                    value={month}
                    onChange={(e) => setMonth(e.target.value)}
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-500"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Date From
                  </label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-500"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Date To
                  </label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-500"
                  />
                </div>
              </div>
            </div>

            {tab === "customer" ? (
              <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-4 text-sm font-semibold text-slate-900">Customer Filters</div>

                <label className="mb-4 flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={allCustomers}
                    onChange={(e) => setAllCustomers(e.target.checked)}
                    className="h-4 w-4"
                  />
                  <span className="text-sm font-medium text-slate-700">Select All Customers</span>
                </label>

                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Customer
                  </label>
                  <select
                    value={customerId}
                    onChange={(e) => setCustomerId(e.target.value)}
                    disabled={allCustomers}
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-500 disabled:bg-slate-100"
                  >
                    <option value="">Select customer</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.customer_code ? `(${c.customer_code})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : (
              <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-4 text-sm font-semibold text-slate-900">Sales Rep Filters</div>

                <label className="mb-4 flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={allSalesReps}
                    onChange={(e) => setAllSalesReps(e.target.checked)}
                    className="h-4 w-4"
                  />
                  <span className="text-sm font-medium text-slate-700">Select All Sales Reps</span>
                </label>

                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Sales Rep
                  </label>
                  <select
                    value={salesRep}
                    onChange={(e) => setSalesRep(e.target.value)}
                    disabled={allSalesReps}
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-500 disabled:bg-slate-100"
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
                <div className="grid gap-4 md:grid-cols-4">
                  <KpiCard label="Customers" value={String(customerKpis.customersCount)} />
                  <KpiCard label="Total Debit" value={`Rs ${money(customerKpis.debit)}`} />
                  <KpiCard label="Total Credit" value={`Rs ${money(customerKpis.credit)}`} />
                  <KpiCard label="Closing Balance" value={`Rs ${money(customerKpis.balance)}`} />
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
                          className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm"
                        >
                          <div className="border-b border-slate-200 bg-slate-950 px-6 py-5 text-white">
                            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                              <div>
                                <div className="text-xl font-semibold">{c.name || "Customer"}</div>
                                <div className="mt-1 text-sm text-slate-300">
                                  {c.customer_code ? `${c.customer_code} • ` : ""}
                                  {c.phone || c.whatsapp || "No contact"}
                                </div>
                              </div>

                              <div className="grid grid-cols-3 gap-3 text-sm">
                                <MiniStat label="Debit" value={`Rs ${money(group?.totals?.debit)}`} />
                                <MiniStat label="Credit" value={`Rs ${money(group?.totals?.credit)}`} />
                                <MiniStat label="Balance" value={`Rs ${money(group?.totals?.balance)}`} />
                              </div>
                            </div>
                          </div>

                          <div className="overflow-x-auto">
                            <table className="min-w-full">
                              <thead>
                                <tr className="bg-slate-100 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">
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
                                {(group.items || []).map((row) => (
                                  <tr key={row.no} className="border-t border-slate-200 text-sm text-slate-700">
                                    <td className="px-4 py-3">{row.no}</td>
                                    <td className="px-4 py-3">{fmtDate(row.tx_date)}</td>
                                    <td className="px-4 py-3 font-medium text-slate-900">{row.particular}</td>
                                    <td className="px-4 py-3">
                                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                                        {row.source_type}
                                      </span>
                                    </td>
                                    <td className="px-4 py-3 text-right">Rs {money(row.debit)}</td>
                                    <td className="px-4 py-3 text-right">Rs {money(row.credit)}</td>
                                    <td className="px-4 py-3 text-right font-semibold text-slate-950">
                                      Rs {money(row.balance)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot>
                                <tr className="border-t-2 border-slate-300 bg-slate-50 text-sm font-semibold text-slate-950">
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
                  <KpiCard label="Sales Reps" value={String(salesRepKpis.repsCount)} />
                  <KpiCard label="Documents" value={String(salesRepKpis.docsCount)} />
                  <KpiCard label="Net Amount" value={`Rs ${money(salesRepKpis.amount)}`} />
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
                        className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm"
                      >
                        <div className="border-b border-slate-200 bg-slate-950 px-6 py-5 text-white">
                          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                            <div>
                              <div className="text-xl font-semibold">{rep.sales_rep || "Sales Rep"}</div>
                              <div className="mt-1 text-sm text-slate-300">
                                {(rep.days || []).length} reporting day(s)
                              </div>
                            </div>

                            <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3">
                              <div className="text-xs uppercase tracking-[0.14em] text-slate-300">Net Total</div>
                              <div className="mt-1 text-lg font-semibold">Rs {money(rep.total_amount)}</div>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-5 p-5">
                          {(rep.days || []).map((day, dayIdx) => (
                            <div key={`${day.date}-${dayIdx}`} className="overflow-hidden rounded-2xl border border-slate-200">
                              <div className="flex items-center justify-between bg-slate-100 px-4 py-3">
                                <div className="text-sm font-semibold text-slate-900">
                                  {fmtDate(day.date)} • {day.day_name}
                                </div>
                                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                                  {(day.items || []).length} transaction(s)
                                </div>
                              </div>

                              <div className="overflow-x-auto">
                                <table className="min-w-full">
                                  <thead>
                                    <tr className="border-t border-slate-200 bg-white text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">
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
                                    {(day.items || []).map((item) => (
                                      <tr key={`${item.doc_no}-${item.no}`} className="border-t border-slate-200 text-sm text-slate-700">
                                        <td className="px-4 py-3">{item.no}</td>
                                        <td className="px-4 py-3 font-medium text-slate-900">{item.customer_name}</td>
                                        <td className="px-4 py-3">{item.customer_address}</td>
                                        <td className="px-4 py-3">{item.mobile_no}</td>
                                        <td className="px-4 py-3">{item.doc_no}</td>
                                        <td className="px-4 py-3">
                                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                                            {item.source_type}
                                          </span>
                                        </td>
                                        <td className="px-4 py-3 text-right font-semibold text-slate-950">
                                          Rs {money(item.amount)}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                  <tfoot>
                                    <tr className="border-t-2 border-slate-300 bg-slate-50 text-sm font-semibold text-slate-950">
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
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className="mt-3 text-2xl font-bold tracking-tight text-slate-950">{value}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/10 px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.14em] text-slate-300">{label}</div>
      <div className="mt-1 font-semibold text-white">{value}</div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-[28px] border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
      <div className="text-lg font-semibold text-slate-900">No Preview Yet</div>
      <div className="mt-2 text-sm text-slate-500">{text}</div>
    </div>
  );
}

function ErrorState({ text }: { text: string }) {
  return (
    <div className="rounded-[28px] border border-red-200 bg-red-50 p-6 shadow-sm">
      <div className="text-sm font-semibold text-red-700">Report Error</div>
      <div className="mt-2 text-sm text-red-600">{text}</div>
    </div>
  );
}