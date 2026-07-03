import React, { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { listCustomers } from "@/lib/customers";
import {
  Search,
  X,
  FileText,
  Eye,
  RefreshCw,
  Users,
  CircleDollarSign,
  AlertTriangle,
} from "lucide-react";

/* =========================
   helpers
========================= */
function n(v: any) {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}

function money(v: any) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n(v));
}

function daysBetween(from: Date, to: Date) {
  const ms = to.getTime() - from.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function fmtDate(v: any) {
  const s = String(v || "").trim();
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString();
}

function txt(v: any) {
  return String(v ?? "").trim();
}

function compact(v: any) {
  return String(v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function customerPhones(c: any) {
  const phone = txt(c?.phone);
  const whatsapp = txt(c?.whatsapp);

  if (phone && whatsapp && phone !== whatsapp) return `${phone} / ${whatsapp}`;
  return phone || whatsapp || "—";
}

function customerAccountKey(c: any) {
  const brn = txt(c?.brn);
  const name = txt(c?.name);
  const address = txt(c?.address);

  if (brn) return `BRN: ${brn}`;
  if (name && address) return `${name} • ${address}`;
  return name || "Customer";
}

function ageBucket(ageDays: number): "d0_30" | "d31_60" | "d61_90" | "d90p" {
  if (ageDays <= 30) return "d0_30";
  if (ageDays <= 60) return "d31_60";
  if (ageDays <= 90) return "d61_90";
  return "d90p";
}

/* =========================
   types
========================= */
type AgingRow = {
  id: number;
  invoice_number: string;
  invoice_date: string;
  ageDays: number;
  total_amount: number;
  amount_paid: number;
  balance_remaining: number;
  status: string;
};

type CustomerAging = {
  customer_id: number;
  customer: any | null;
  name: string;
  phone: string;
  brn: string;
  openCount: number;
  invoiceNumbers: string[];
  d0_30: number;
  d31_60: number;
  d61_90: number;
  d90p: number;
  total: number;
};

/* =========================
   Summary card
========================= */
function SummaryCard({
  label,
  value,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string;
  icon?: React.ComponentType<{ className?: string }>;
  tone?: "default" | "good" | "warn" | "bad" | "info";
}) {
  const ring =
    tone === "good"
      ? "bg-emerald-500/12 text-emerald-700"
      : tone === "warn"
      ? "bg-amber-500/12 text-amber-800"
      : tone === "bad"
      ? "bg-rose-500/12 text-rose-700"
      : tone === "info"
      ? "bg-sky-500/12 text-sky-700"
      : "bg-slate-500/12 text-slate-700";

  return (
    <div className="flex h-full items-start justify-between gap-2.5 rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground truncate">
          {label}
        </div>
        <div
          className="mt-1.5 whitespace-nowrap font-extrabold leading-[1.05] tabular-nums text-foreground text-[clamp(14px,1.15vw,20px)]"
          title={value}
        >
          {value}
        </div>
      </div>
      {Icon ? (
        <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${ring}`}>
          <Icon className="h-[18px] w-[18px]" />
        </div>
      ) : null}
    </div>
  );
}

/* =====================================================================
   GENERAL AGING REPORT (all customers with outstanding balances)
   ===================================================================== */
function GeneralAgingReport() {
  const nav = useNavigate();
  const [q, setQ] = useState("");

  const dataQ = useQuery({
    queryKey: ["aging_all_customers"],
    queryFn: async () => {
      const [invRes, customers] = await Promise.all([
        supabase
          .from("invoices")
          .select(
            "id,invoice_number,invoice_date,total_amount,amount_paid,balance_remaining,status,customer_id"
          )
          .not("status", "in", '("DRAFT","VOID")')
          .order("invoice_date", { ascending: true })
          .limit(20000),
        listCustomers({ activeOnly: false, limit: 20000 }),
      ]);

      if (invRes.error) throw invRes.error;

      const custById = new Map<number, any>();
      (customers || []).forEach((c: any) => custById.set(Number(c.id), c));

      return { invoices: (invRes.data || []) as any[], custById };
    },
    staleTime: 20_000,
  });

  const today = new Date();

  const rows: CustomerAging[] = useMemo(() => {
    const invoices = dataQ.data?.invoices || [];
    const custById = dataQ.data?.custById || new Map<number, any>();

    const map = new Map<number, CustomerAging>();

    for (const r of invoices) {
      const balance = n(r.balance_remaining);
      if (balance <= 0.00001) continue; // only open invoices

      const cid = Number(r.customer_id) || 0;
      const cust = custById.get(cid) || null;

      const invDate = new Date(String(r.invoice_date));
      const ageDays = Number.isNaN(invDate.getTime())
        ? 0
        : Math.max(0, daysBetween(invDate, today));

      let cur = map.get(cid);
      if (!cur) {
        cur = {
          customer_id: cid,
          customer: cust,
          name: txt(cust?.client_name) || txt(cust?.name) || (cid ? `Customer #${cid}` : "Unknown customer"),
          phone: customerPhones(cust),
          brn: txt(cust?.brn) || "—",
          openCount: 0,
          invoiceNumbers: [],
          d0_30: 0,
          d31_60: 0,
          d61_90: 0,
          d90p: 0,
          total: 0,
        };
        map.set(cid, cur);
      }

      cur.openCount += 1;
      cur.invoiceNumbers.push(String(r.invoice_number || `#${r.id}`));
      cur[ageBucket(ageDays)] += balance;
      cur.total += balance;
    }

    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [dataQ.data]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    const c = compact(term);

    return rows.filter((r) => {
      const cust = r.customer || {};
      const hayText = [
        r.name,
        txt(cust.name),
        txt(cust.client_name),
        txt(cust.phone),
        txt(cust.whatsapp),
        txt(cust.brn),
        txt(cust.customer_code),
      ]
        .join(" ")
        .toLowerCase();

      if (hayText.includes(term)) return true;

      // invoice number match (compact)
      if (r.invoiceNumbers.some((num) => compact(num).includes(c))) return true;

      return false;
    });
  }, [rows, q]);

  const totals = useMemo(() => {
    const t = { d0_30: 0, d31_60: 0, d61_90: 0, d90p: 0, total: 0, customers: 0 };
    for (const r of filtered) {
      t.d0_30 += r.d0_30;
      t.d31_60 += r.d31_60;
      t.d61_90 += r.d61_90;
      t.d90p += r.d90p;
      t.total += r.total;
      t.customers += 1;
    }
    return t;
  }, [filtered]);

  const loading = dataQ.isLoading;

  return (
    <div className="mx-auto w-full max-w-[1480px] px-4 py-5 md:px-6">
      {/* Header */}
      <div className="mb-4 flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-sm md:flex-row md:items-center md:justify-between md:p-5">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Aging Report</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Outstanding balances across all customers • grouped by customer account
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => dataQ.refetch()} disabled={dataQ.isFetching}>
            <RefreshCw className={`mr-2 h-4 w-4 ${dataQ.isFetching ? "animate-spin" : ""}`} />
            {dataQ.isFetching ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="mb-4 grid grid-cols-2 items-stretch gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <SummaryCard label="Total Outstanding" value={`Rs ${money(totals.total)}`} icon={CircleDollarSign} tone="bad" />
        <SummaryCard label="0–30 Days" value={`Rs ${money(totals.d0_30)}`} tone="good" />
        <SummaryCard label="31–60 Days" value={`Rs ${money(totals.d31_60)}`} tone="info" />
        <SummaryCard label="61–90 Days" value={`Rs ${money(totals.d61_90)}`} tone="warn" />
        <SummaryCard label="90+ Days" value={`Rs ${money(totals.d90p)}`} icon={AlertTriangle} tone="bad" />
        <SummaryCard label="Customers With Balance" value={String(totals.customers)} icon={Users} tone="default" />
      </div>

      {/* Search */}
      <div className="mb-4 rounded-2xl border bg-card p-3 shadow-sm">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by customer name, phone, BRN, or invoice number"
            className="h-11 w-full rounded-xl border bg-background pl-10 pr-10 text-sm outline-none focus:ring-2 focus:ring-primary/25"
          />
          {q ? (
            <button
              type="button"
              onClick={() => setQ("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full bg-muted text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left">
                <th className="p-3 font-semibold">Customer</th>
                <th className="p-3 font-semibold">Phone / WhatsApp</th>
                <th className="p-3 font-semibold">BRN</th>
                <th className="p-3 text-center font-semibold">Open</th>
                <th className="p-3 text-right font-semibold">0–30</th>
                <th className="p-3 text-right font-semibold">31–60</th>
                <th className="p-3 text-right font-semibold">61–90</th>
                <th className="p-3 text-right font-semibold">90+</th>
                <th className="p-3 text-right font-semibold">Outstanding</th>
                <th className="p-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-2">
                      <RefreshCw className="h-4 w-4 animate-spin" /> Loading aging report…
                    </span>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-10 text-center">
                    <div className="mx-auto flex max-w-sm flex-col items-center gap-2 text-muted-foreground">
                      <CircleDollarSign className="h-8 w-8 opacity-50" />
                      <div className="text-sm font-medium text-foreground">
                        {q ? "No customers match your search." : "No customers with outstanding balances."}
                      </div>
                      <div className="text-xs">
                        {q ? "Try a different name, phone, BRN, or invoice number." : "All invoices are settled."}
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.customer_id} className="hover:bg-muted/30">
                    <td className="p-3">
                      <div className="font-semibold text-foreground">{r.name}</div>
                      {r.customer_id ? (
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          Account key: {customerAccountKey(r.customer)}
                        </div>
                      ) : null}
                    </td>
                    <td className="p-3 text-muted-foreground">{r.phone}</td>
                    <td className="p-3 text-muted-foreground">{r.brn}</td>
                    <td className="p-3 text-center tabular-nums">{r.openCount}</td>
                    <td className="p-3 text-right tabular-nums">Rs {money(r.d0_30)}</td>
                    <td className="p-3 text-right tabular-nums">Rs {money(r.d31_60)}</td>
                    <td className="p-3 text-right tabular-nums">Rs {money(r.d61_90)}</td>
                    <td className="p-3 text-right tabular-nums">
                      <span className={r.d90p > 0 ? "font-semibold text-rose-700" : ""}>Rs {money(r.d90p)}</span>
                    </td>
                    <td className="p-3 text-right font-bold tabular-nums">Rs {money(r.total)}</td>
                    <td className="p-3">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => nav(`/aging?customerId=${r.customer_id}`)}
                          disabled={!r.customer_id}
                          title="View aging detail"
                        >
                          <Eye className="mr-1.5 h-4 w-4" />
                          Detail
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => nav(`/statement/print?customerId=${r.customer_id}`)}
                          disabled={!r.customer_id}
                          title="Statement PDF"
                        >
                          <FileText className="mr-1.5 h-4 w-4" />
                          Statement
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="p-3 text-xs text-muted-foreground">
        Aging uses <b>invoice_date</b> and <b>balance_remaining</b>. Draft/Void excluded. Grouped
        strictly by <b>customer_id</b>, so accounts with the same name stay separate.
      </div>
    </div>
  );
}

/* =====================================================================
   CUSTOMER-SPECIFIC AGING DETAIL
   ===================================================================== */
function CustomerAgingDetail({ customerId }: { customerId: number }) {
  const nav = useNavigate();

  const custQ = useQuery({
    queryKey: ["customer", customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .eq("id", customerId)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: customerId > 0,
    staleTime: 20_000,
  });

  const invQ = useQuery({
    queryKey: ["aging_invoices", customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select(
          "id,invoice_number,invoice_date,total_amount,amount_paid,balance_remaining,status"
        )
        .eq("customer_id", customerId)
        .not("status", "in", '("DRAFT","VOID")')
        .order("invoice_date", { ascending: true });

      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: customerId > 0,
    staleTime: 20_000,
  });

  const customer: any = custQ.data;
  const invoices: any[] = invQ.data || [];
  const today = new Date();

  const customerName = useMemo(() => {
    const client = txt(customer?.client_name);
    const name = txt(customer?.name);
    return client || name || "Customer";
  }, [customer]);

  const accountKey = useMemo(() => customerAccountKey(customer), [customer]);

  const openRows: AgingRow[] = useMemo(() => {
    return invoices
      .map((r) => {
        const invDate = new Date(String(r.invoice_date));
        const ageDays = Number.isNaN(invDate.getTime())
          ? 0
          : Math.max(0, daysBetween(invDate, today));

        return {
          id: Number(r.id),
          invoice_number: String(r.invoice_number || ""),
          invoice_date: String(r.invoice_date || ""),
          ageDays,
          total_amount: n(r.total_amount),
          amount_paid: n(r.amount_paid),
          balance_remaining: n(r.balance_remaining),
          status: String(r.status || ""),
        };
      })
      .filter((x) => x.balance_remaining > 0.00001)
      .sort((a, b) => b.ageDays - a.ageDays);
  }, [invoices]);

  const buckets = useMemo(() => {
    const b = { d0_30: 0, d31_60: 0, d61_90: 0, d90p: 0, total: 0 };

    for (const r of openRows) {
      b.total += r.balance_remaining;
      b[ageBucket(r.ageDays)] += r.balance_remaining;
    }

    return b;
  }, [openRows]);

  const loading = custQ.isLoading || invQ.isLoading;

  /* Customer not found (valid id but no record) */
  if (!loading && customerId > 0 && !customer) {
    return (
      <div className="mx-auto w-full max-w-[720px] px-4 py-10">
        <div className="rounded-2xl border bg-card p-8 text-center shadow-sm">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-rose-500/12 text-rose-700">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <div className="mt-4 text-lg font-bold text-foreground">Customer not found</div>
          <div className="mt-1 text-sm text-muted-foreground">
            The customer for this aging report could not be found (id #{customerId}).
          </div>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Button variant="outline" onClick={() => nav(-1)}>
              ← Back
            </Button>
            <Button onClick={() => nav("/aging")}>Go to All Aging Report</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="inv-page">
      <div className="inv-actions inv-screen inv-actions--tight">
        <Button variant="outline" onClick={() => nav(-1)}>
          ← Back
        </Button>

        <div className="inv-actions-right">
          <Button variant="outline" onClick={() => nav("/aging")}>
            All Aging Report
          </Button>

          <Button variant="outline" onClick={() => invQ.refetch()} disabled={invQ.isFetching}>
            {invQ.isFetching ? "Refreshing…" : "Refresh"}
          </Button>

          <Button onClick={() => nav(`/statement/print?customerId=${customerId}`)}>
            Statement PDF
          </Button>
        </div>
      </div>

      <div className="inv-screen inv-form-shell inv-form-shell--tight">
        <div className="inv-form-card inv-form-card--premium">
          <div className="inv-form-head inv-form-head--tight">
            <div>
              <div className="inv-form-title">Aging Report</div>
              <div className="inv-form-sub">
                Customer: <b>{customerName}</b>
              </div>
            </div>

            <div className="text-sm text-muted-foreground">{new Date().toLocaleDateString()}</div>
          </div>

          {loading ? (
            <div className="p-6 text-sm text-muted-foreground">Loading…</div>
          ) : (
            <>
              {/* Customer identity block */}
              <div
                style={{
                  margin: "0 16px 14px",
                  display: "grid",
                  gridTemplateColumns: "1.1fr .9fr",
                  gap: 12,
                }}
              >
                <div
                  style={{
                    border: "1px solid rgba(0,0,0,.08)",
                    borderRadius: 16,
                    padding: 14,
                    background: "rgba(255,255,255,.72)",
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      letterSpacing: ".10em",
                      textTransform: "uppercase",
                      opacity: 0.7,
                    }}
                  >
                    Customer Account
                  </div>

                  <div style={{ marginTop: 8, fontSize: 14, fontWeight: 800 }}>{customerName}</div>

                  <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>
                    {txt(customer?.address) || "—"}
                  </div>

                  <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>
                    Tel: {customerPhones(customer)}
                  </div>

                  <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>
                    {txt(customer?.brn) ? `BRN: ${txt(customer?.brn)}` : "BRN: —"}
                    {txt(customer?.vat_no) ? ` • VAT: ${txt(customer?.vat_no)}` : ""}
                  </div>

                  <div style={{ marginTop: 6, fontSize: 12, opacity: 0.72 }}>
                    Account key: {accountKey}
                  </div>
                </div>

                <div
                  style={{
                    border: "1px solid rgba(0,0,0,.08)",
                    borderRadius: 16,
                    padding: 14,
                    background: "rgba(255,255,255,.72)",
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      letterSpacing: ".10em",
                      textTransform: "uppercase",
                      opacity: 0.7,
                    }}
                  >
                    Outstanding Summary
                  </div>

                  <div
                    style={{
                      marginTop: 10,
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 12,
                    }}
                  >
                    <span>Total Open Invoices</span>
                    <b>{openRows.length}</b>
                  </div>

                  <div
                    style={{
                      marginTop: 8,
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 12,
                    }}
                  >
                    <span>Total Outstanding</span>
                    <b>Rs {money(buckets.total)}</b>
                  </div>

                  <div
                    style={{
                      marginTop: 8,
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 12,
                    }}
                  >
                    <span>Oldest Bucket</span>
                    <b>{buckets.d90p > 0 ? "90+ Days" : "Below 90 Days"}</b>
                  </div>

                  <div style={{ marginTop: 8, fontSize: 11, opacity: 0.72 }}>
                    This report is for this exact customer account only.
                  </div>
                </div>
              </div>

              <div className="inv-totalsbar inv-totalsbar--premium inv-totalsbar--shadow">
                <div className="inv-totalsbar__cell">
                  <span className="k">0–30</span>
                  <span className="v">Rs {money(buckets.d0_30)}</span>
                </div>

                <div className="inv-totalsbar__cell">
                  <span className="k">31–60</span>
                  <span className="v">Rs {money(buckets.d31_60)}</span>
                </div>

                <div className="inv-totalsbar__cell">
                  <span className="k">61–90</span>
                  <span className="v">Rs {money(buckets.d61_90)}</span>
                </div>

                <div className="inv-totalsbar__cell inv-totalsbar__cell--balance">
                  <span className="k">90+</span>
                  <span className="v">Rs {money(buckets.d90p)}</span>
                </div>
              </div>

              <div className="inv-table-wrap inv-table-wrap--premium">
                <table className="inv-table inv-table--premiumList">
                  <colgroup>
                    <col style={{ width: "18%" }} />
                    <col style={{ width: "16%" }} />
                    <col style={{ width: "12%" }} />
                    <col style={{ width: "18%" }} />
                    <col style={{ width: "18%" }} />
                    <col style={{ width: "18%" }} />
                  </colgroup>

                  <thead>
                    <tr>
                      <th className="inv-th">INVOICE #</th>
                      <th className="inv-th">DATE</th>
                      <th className="inv-th inv-th-center">AGE</th>
                      <th className="inv-th inv-th-right">TOTAL</th>
                      <th className="inv-th inv-th-right">PAID</th>
                      <th className="inv-th inv-th-right">BALANCE</th>
                    </tr>
                  </thead>

                  <tbody>
                    {openRows.length === 0 ? (
                      <tr>
                        <td className="inv-td" colSpan={6}>
                          <div className="flex flex-col items-center gap-1 py-6 text-center text-muted-foreground">
                            <CircleDollarSign className="h-7 w-7 opacity-50" />
                            <div className="text-sm font-medium text-foreground">
                              No outstanding invoices for this customer.
                            </div>
                            <div className="text-xs">All invoices for this account are settled.</div>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      openRows.map((r) => (
                        <tr
                          key={r.id}
                          className="inv-rowHover"
                          onDoubleClick={() => nav(`/invoices/${r.id}`)}
                          title="Double click to open invoice"
                        >
                          <td className="inv-td">
                            <b>{r.invoice_number}</b>
                            <div className="mt-1 text-xs text-muted-foreground">{r.status}</div>
                          </td>

                          <td className="inv-td">{fmtDate(r.invoice_date)}</td>

                          <td className="inv-td inv-center">{r.ageDays} d</td>

                          <td className="inv-td inv-right">Rs {money(r.total_amount)}</td>

                          <td className="inv-td inv-right">Rs {money(r.amount_paid)}</td>

                          <td className="inv-td inv-right">
                            <b>Rs {money(r.balance_remaining)}</b>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="p-3 text-xs text-muted-foreground">
                Aging uses <b>invoice_date</b> and <b>balance_remaining</b>. Draft/Void excluded. This
                page already stays separate per <b>customer_id</b>, so accounts with the same name
                remain separate.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* =====================================================================
   ENTRY — picks mode based on customerId
   ===================================================================== */
export default function AgingReport() {
  const [params] = useSearchParams();
  const customerId = Number(params.get("customerId") || 0);

  if (customerId > 0) return <CustomerAgingDetail customerId={customerId} />;
  return <GeneralAgingReport />;
}
