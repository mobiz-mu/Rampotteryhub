// src/pages/AgingReport.tsx
import React, { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

function n(v: any) {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}
function money(v: any) {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n(v));
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

export default function AgingReport() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const customerId = Number(params.get("customerId") || 0);

  const custQ = useQuery({
    queryKey: ["customer", customerId],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("*").eq("id", customerId).maybeSingle();
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
        .select("id,invoice_number,invoice_date,total_amount,amount_paid,balance_remaining,status")
        .eq("customer_id", customerId)
        // keep only meaningful invoices for aging
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

  const openRows: AgingRow[] = useMemo(() => {
    return invoices
      .map((r) => {
        const invDate = new Date(String(r.invoice_date));
        const ageDays = Number.isNaN(invDate.getTime()) ? 0 : Math.max(0, daysBetween(invDate, today));
        return {
          id: Number(r.id),
          invoice_number: String(r.invoice_number),
          invoice_date: String(r.invoice_date),
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
      if (r.ageDays <= 30) b.d0_30 += r.balance_remaining;
      else if (r.ageDays <= 60) b.d31_60 += r.balance_remaining;
      else if (r.ageDays <= 90) b.d61_90 += r.balance_remaining;
      else b.d90p += r.balance_remaining;
    }
    return b;
  }, [openRows]);

  if (customerId <= 0) {
    return (
      <div className="inv-page">
        <div className="inv-actions inv-screen inv-actions--tight">
          <Button variant="outline" onClick={() => nav(-1)}>
            ← Back
          </Button>
        </div>
        <div className="inv-screen inv-form-shell inv-form-shell--tight">
          <div className="inv-form-card">
            <div className="p-6 text-sm text-muted-foreground">Invalid customer.</div>
          </div>
        </div>
      </div>
    );
  }

  const loading = custQ.isLoading || invQ.isLoading;

  return (
    <div className="inv-page">
      <div className="inv-actions inv-screen inv-actions--tight">
        <Button variant="outline" onClick={() => nav(-1)}>
          ← Back
        </Button>
        <div className="inv-actions-right">
          <Button variant="outline" onClick={() => invQ.refetch()} disabled={invQ.isFetching}>
            {invQ.isFetching ? "Refreshing…" : "Refresh"}
          </Button>
          <Button onClick={() => nav(`/statement/print?customerId=${customerId}`)}>Statement PDF</Button>
        </div>
      </div>

      <div className="inv-screen inv-form-shell inv-form-shell--tight">
        <div className="inv-form-card inv-form-card--premium">
          <div className="inv-form-head inv-form-head--tight">
            <div>
              <div className="inv-form-title">Aging Report</div>
              <div className="inv-form-sub">
                Customer: <b>{customer?.name || "—"}</b>
              </div>
            </div>
            <div className="text-sm text-muted-foreground">{new Date().toLocaleDateString()}</div>
          </div>

          {loading ? (
            <div className="p-6 text-sm text-muted-foreground">Loading…</div>
          ) : (
            <>
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
                          No outstanding invoices.
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
                Aging uses <b>invoice_date</b> and <b>balance_remaining</b>. Draft/Void excluded.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
