// src/pages/StatementPrint.tsx
import React, { useEffect, useMemo } from "react";
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
function fmtDateISO(v: any) {
  const s = String(v || "").trim();
  if (!s) return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toISOString().slice(0, 10);
}
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// ✅ due = balance if available, otherwise total - paid - credits
function computeDue(inv: any) {
  const due =
    inv?.balance_due != null
      ? n(inv.balance_due)
      : inv?.balance_remaining != null
      ? n(inv.balance_remaining)
      : n(inv?.total_amount) - n(inv?.amount_paid) - n(inv?.credits_applied);

  return Math.max(0, due);
}

export default function StatementPrint() {
  const nav = useNavigate();
  const [params] = useSearchParams();

  const customerId = Number(params.get("customerId") || 0);

  const from = (params.get("from") || "").trim();
  const to = (params.get("to") || "").trim();

  const rangeFrom = from || "1900-01-01";
  const rangeTo = to || todayISO();

  const custQ = useQuery({
    queryKey: ["statement_customer", customerId],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("*").eq("id", customerId).maybeSingle();
      if (error) throw error;
      return data as any;
    },
    enabled: customerId > 0,
    staleTime: 20_000,
  });

  // ✅ include total + paid + due fields
  const invQ = useQuery({
    queryKey: ["statement_invoices", customerId, rangeFrom, rangeTo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select(
          "id,invoice_number,invoice_date,total_amount,amount_paid,credits_applied,balance_remaining,balance_due,status"
        )
        .eq("customer_id", customerId)
        .not("status", "in", '("VOID")') // keep DRAFT visible if you want, but it will affect totals
        .gte("invoice_date", rangeFrom)
        .lte("invoice_date", rangeTo)
        .order("invoice_date", { ascending: true })
        .order("id", { ascending: true });

      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: customerId > 0,
    staleTime: 20_000,
  });

  const customer: any = custQ.data;
  const invoices: any[] = invQ.data || [];

  const customerName = useMemo(() => {
    if (!customer) return "Customer";
    const a = String(customer?.client_name || "").trim();
    const b = String(customer?.name || "").trim();
    return a || b || "Customer";
  }, [customer]);

  const rows = useMemo(() => {
    return invoices.map((r, idx) => {
      const total = n(r.total_amount);
      const paid = n(r.amount_paid);
      const due = computeDue(r); // or Math.max(0, total - paid)
      return {
        sn: idx + 1,
        id: Number(r.id),
        invoice_number: String(r.invoice_number ?? ""),
        invoice_date: fmtDateISO(r.invoice_date),
        status: String(r.status || ""),
        total,
        paid,
        due,
      };
    });
  }, [invoices]);

  // ✅ TOTALS
  // totalBalance = totalAmount - totalPaid  (same as sum(due) if due computed as balance)
  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        acc.totalAmount += n(r.total);
        acc.totalPaid += n(r.paid);
        acc.totalDue += n(r.due);
        return acc;
      },
      { totalAmount: 0, totalPaid: 0, totalDue: 0 }
    );
  }, [rows]);

  const autoPrint = params.get("autoprint") === "1";
  useEffect(() => {
    if (!autoPrint) return;
    if (custQ.isLoading || invQ.isLoading) return;
    if (!customer) return;
    const t = window.setTimeout(() => window.print(), 250);
    return () => window.clearTimeout(t);
  }, [autoPrint, custQ.isLoading, invQ.isLoading, customer?.id]);

  const shareUrl = useMemo(() => {
    const base = window.location.origin + window.location.pathname;
    const sp = new URLSearchParams();
    sp.set("customerId", String(customerId));
    if (from) sp.set("from", from);
    if (to) sp.set("to", to);
    return `${base}?${sp.toString()}`;
  }, [customerId, from, to]);

  function openWhatsApp() {
    const msg =
      `Ram Pottery Ltd — Statement of Account\n` +
      `Customer: ${customerName}\n` +
      `Period: ${rangeFrom} → ${rangeTo}\n\n` +
      `Total Amount: Rs ${money(totals.totalAmount)}\n` +
      `Amount Paid: Rs ${money(totals.totalPaid)}\n` +
      `Balance Due: Rs ${money(totals.totalAmount - totals.totalPaid)}\n\n` +
      `Please find the statement attached (PDF). You can also view it here:\n${shareUrl}`;

    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank", "noopener,noreferrer");
  }

  function openEmail() {
    const subject = `Statement of Account — ${customerName} (${rangeFrom} to ${rangeTo})`;
    const body =
      `Dear ${customerName},\n\n` +
      `Please find attached the Statement of Account for the period ${rangeFrom} to ${rangeTo}.\n\n` +
      `Total Amount: Rs ${money(totals.totalAmount)}\n` +
      `Amount Paid: Rs ${money(totals.totalPaid)}\n` +
      `Balance Due: Rs ${money(totals.totalAmount - totals.totalPaid)}\n\n` +
      `You can also view it here:\n${shareUrl}\n\n` +
      `Regards,\nRam Pottery Ltd`;
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  function copyLink() {
    navigator.clipboard?.writeText(shareUrl);
  }

  if (customerId <= 0) return <div className="p-6 text-sm text-muted-foreground">Invalid customer.</div>;
  if (custQ.isLoading || invQ.isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading statement…</div>;
  if (!customer) return <div className="p-6 text-sm text-destructive">Customer not found.</div>;

  const balanceTotal = totals.totalAmount - totals.totalPaid; // ✅ what you asked for

  return (
    <div className="p-4 print-shell">
      {/* Toolbar (no print) */}
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-muted-foreground">
          Statement • <span className="font-semibold text-foreground">{customerName}</span> • {rangeFrom} → {rangeTo}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => nav(-1)}>
            Back
          </Button>
          <Button variant="outline" onClick={copyLink}>
            Copy Link
          </Button>
          <Button variant="outline" onClick={openEmail}>
            Email
          </Button>
          <Button variant="outline" onClick={openWhatsApp}>
            WhatsApp
          </Button>
          <Button onClick={() => window.print()}>Save PDF / Print</Button>
        </div>
      </div>

      {/* Print Area */}
      <div className="print-area">
        <div
          style={{
            border: "1px solid rgba(0,0,0,.12)",
            borderRadius: 14,
            padding: 18,
            background: "#fff",
          }}
        >
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: ".02em" }}>STATEMENT OF ACCOUNT</div>
              <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>
                Generated: {todayISO()} • Period: {rangeFrom} → {rangeTo}
              </div>
            </div>
            <div style={{ textAlign: "right", fontSize: 12 }}>
              <div style={{ fontWeight: 900 }}>Ram Pottery Ltd</div>
              <div style={{ opacity: 0.85 }}>Mauritius</div>
            </div>
          </div>

          {/* Customer + Summary */}
          <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ border: "1px solid rgba(0,0,0,.10)", borderRadius: 12, padding: 12 }}>
              <div style={{ fontSize: 11, letterSpacing: ".10em", textTransform: "uppercase", opacity: 0.7 }}>Customer</div>
              <div style={{ marginTop: 8, fontSize: 13, fontWeight: 800 }}>{customerName}</div>
              <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>{customer.address || "—"}</div>
              <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>
                {customer.whatsapp || customer.phone ? `Phone: ${customer.whatsapp || customer.phone}` : "—"}
              </div>
            </div>

            <div style={{ border: "1px solid rgba(0,0,0,.10)", borderRadius: 12, padding: 12 }}>
              <div style={{ fontSize: 11, letterSpacing: ".10em", textTransform: "uppercase", opacity: 0.7 }}>Summary</div>

              <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span>Total Amount</span>
                <b>Rs {money(totals.totalAmount)}</b>
              </div>

              <div style={{ marginTop: 6, display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span>Amount Paid</span>
                <b>Rs {money(totals.totalPaid)}</b>
              </div>

              <div style={{ marginTop: 8, height: 1, background: "rgba(0,0,0,.10)" }} />

              <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span style={{ fontWeight: 800 }}>Balance Due (Total − Paid)</span>
                <b style={{ fontSize: 13 }}>Rs {money(balanceTotal)}</b>
              </div>

              <div style={{ marginTop: 6, fontSize: 11, opacity: 0.75 }}>This report shows invoices (excluding VOID).</div>
            </div>
          </div>

          {/* Table */}
          <div style={{ marginTop: 14 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "rgba(0,0,0,.04)" }}>
                  <th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid rgba(0,0,0,.10)" }}>SN</th>
                  <th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid rgba(0,0,0,.10)" }}>DATE</th>
                  <th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid rgba(0,0,0,.10)" }}>CUSTOMER</th>
                  <th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid rgba(0,0,0,.10)" }}>INVOICE NO</th>
                  <th style={{ textAlign: "right", padding: "10px 8px", borderBottom: "1px solid rgba(0,0,0,.10)" }}>TOTAL</th>
                  <th style={{ textAlign: "right", padding: "10px 8px", borderBottom: "1px solid rgba(0,0,0,.10)" }}>PAID</th>
                  <th style={{ textAlign: "right", padding: "10px 8px", borderBottom: "1px solid rgba(0,0,0,.10)" }}>DUE</th>
                </tr>
              </thead>

              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: "12px 8px", opacity: 0.75 }}>
                      No invoices found for this customer in the selected period.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.id}>
                      <td style={{ padding: "10px 8px", borderBottom: "1px solid rgba(0,0,0,.06)", fontWeight: 800 }}>{r.sn}</td>
                      <td style={{ padding: "10px 8px", borderBottom: "1px solid rgba(0,0,0,.06)" }}>{r.invoice_date}</td>
                      <td style={{ padding: "10px 8px", borderBottom: "1px solid rgba(0,0,0,.06)" }}>{customerName}</td>
                      <td style={{ padding: "10px 8px", borderBottom: "1px solid rgba(0,0,0,.06)", fontWeight: 700 }}>
                        {r.invoice_number}
                        {r.status ? <div style={{ fontSize: 11, opacity: 0.65 }}>{r.status}</div> : null}
                      </td>
                      <td style={{ padding: "10px 8px", borderBottom: "1px solid rgba(0,0,0,.06)", textAlign: "right", fontWeight: 900 }}>
                        Rs {money(r.total)}
                      </td>
                      <td style={{ padding: "10px 8px", borderBottom: "1px solid rgba(0,0,0,.06)", textAlign: "right", fontWeight: 900 }}>
                        Rs {money(r.paid)}
                      </td>
                      <td style={{ padding: "10px 8px", borderBottom: "1px solid rgba(0,0,0,.06)", textAlign: "right", fontWeight: 900 }}>
                        Rs {money(r.due)}
                      </td>
                    </tr>
                  ))
                )}

                {/* Total row */}
                {rows.length > 0 ? (
                  <tr>
                    <td colSpan={4} style={{ padding: "10px 8px", textAlign: "right", fontWeight: 900 }}>
                      TOTAL
                    </td>
                    <td style={{ padding: "10px 8px", textAlign: "right", fontWeight: 900 }}>
                      Rs {money(totals.totalAmount)}
                    </td>
                    <td style={{ padding: "10px 8px", textAlign: "right", fontWeight: 900 }}>
                      Rs {money(totals.totalPaid)}
                    </td>
                    <td style={{ padding: "10px 8px", textAlign: "right", fontWeight: 900 }}>
                      Rs {money(balanceTotal)}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>

            <div style={{ marginTop: 10, fontSize: 11, opacity: 0.75 }}>
              This statement is generated from system records. Please contact Ram Pottery Ltd for clarifications.
            </div>
          </div>
        </div>
      </div>

      {/* Print CSS */}
      <style>
        {`
          @media print {
            .no-print { display:none !important; }
            .print-shell { padding:0 !important; }
            .print-area { margin:0 !important; }
            @page { margin: 12mm; }
          }
        `}
      </style>
    </div>
  );
}

