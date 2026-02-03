// src/pages/Quotation.tsx
import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";

import { listQuotations } from "@/lib/quotations";

type QuotationStatus = "DRAFT" | "SENT" | "ACCEPTED" | "REJECTED" | "CANCELLED" | string;

function fmtDate(v: any) {
  const s = String(v || "").trim();
  if (!s) return "";
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return s;
}

function money(v: any) {
  const x = Number(v ?? 0);
  const n = Number.isFinite(x) ? x : 0;
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function statusMeta(st: string) {
  const s = String(st || "DRAFT").toUpperCase();
  // Keep compatible with your existing CSS palette (inv-* classes)
  // We add small semantic classes you can style later, but it still looks good with default.
  if (s === "ACCEPTED") return { label: "Accepted", tone: "good" as const };
  if (s === "REJECTED" || s === "CANCELLED") return { label: s === "CANCELLED" ? "Cancelled" : "Rejected", tone: "bad" as const };
  if (s === "SENT") return { label: "Sent", tone: "warn" as const };
  return { label: "Draft", tone: "muted" as const };
}

export default function Quotation() {
  const nav = useNavigate();

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<QuotationStatus | "ALL">("ALL");

  const qTrim = q.trim();

  const listQ = useQuery({
    queryKey: ["quotations", { q: qTrim, status }],
    queryFn: () => listQuotations({ q: qTrim, status, limit: 500 }),
    staleTime: 15_000,
  });

  const rows = (listQ.data || []) as any[];

  const stats = useMemo(() => {
    const total = rows.length;
    const draft = rows.filter((r) => String(r.status || "DRAFT").toUpperCase() === "DRAFT").length;
    const sent = rows.filter((r) => String(r.status || "").toUpperCase() === "SENT").length;
    const accepted = rows.filter((r) => String(r.status || "").toUpperCase() === "ACCEPTED").length;
    const rejected = rows.filter((r) => {
      const s = String(r.status || "").toUpperCase();
      return s === "REJECTED" || s === "CANCELLED";
    }).length;

    const amount = rows.reduce((sum, r) => sum + Number(r.total_amount || 0), 0);

    return { total, draft, sent, accepted, rejected, amount };
  }, [rows]);

  const filtered = useMemo(() => rows, [rows]);

  return (
    <div className="inv-page">
      {/* PREMIUM HEADER STRIP */}
      <div className="inv-screen inv-actions inv-actions--tight">
        <div className="flex items-start gap-3">
          <div>
            <div className="inv-form-title" style={{ lineHeight: 1.05 }}>
              Quotations
            </div>
            <div className="text-sm text-muted-foreground">
              Create, track, and print quotations — same engine & columns as invoices.
            </div>
          </div>

          {/* quick stats chips */}
          <div className="hidden md:flex flex-wrap gap-2 ml-4">
            <span className="inv-chip inv-chip--soft" title="Total quotations">
              Total: <b>{stats.total}</b>
            </span>
            <span className="inv-chip inv-chip--soft" title="Draft">
              Draft: <b>{stats.draft}</b>
            </span>
            <span className="inv-chip inv-chip--soft" title="Sent">
              Sent: <b>{stats.sent}</b>
            </span>
            <span className="inv-chip inv-chip--soft" title="Accepted">
              Accepted: <b>{stats.accepted}</b>
            </span>
            <span className="inv-chip inv-chip--soft" title="Rejected/Cancelled">
              Closed: <b>{stats.rejected}</b>
            </span>
            <span className="inv-chip inv-chip--soft" title="Sum of totals in current list">
              Amount: <b>Rs {money(stats.amount)}</b>
            </span>
          </div>
        </div>

        <div className="inv-actions-right">
          <Button variant="outline" onClick={() => listQ.refetch()}>
            Refresh
          </Button>
          <Button onClick={() => nav("/quotations/new")}>+ New Quotation</Button>
        </div>
      </div>

      {/* CONTENT SHELL */}
      <div className="inv-screen inv-form-shell inv-form-shell--tight">
        <div className="inv-form-card">
          {/* FILTER BAR */}
          <div className="inv-form-head inv-form-head--tight">
            <div>
              <div className="inv-form-title">Quotation Register</div>
              <div className="inv-form-sub">
                Search by quotation no, customer name or code • Print-ready A4 layout.
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="inv-field" style={{ minWidth: 320 }}>
                <input
                  className="inv-input"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search: quotation no, customer, code…"
                />
              </div>

              <select className="inv-input" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="ALL">All Status</option>
                <option value="DRAFT">Draft</option>
                <option value="SENT">Sent</option>
                <option value="ACCEPTED">Accepted</option>
                <option value="REJECTED">Rejected</option>
                <option value="CANCELLED">Cancelled</option>
              </select>

              <Button variant="outline" onClick={() => setQ("")}>
                Clear
              </Button>
            </div>
          </div>

          {/* TABLE */}
          <div className="inv-table-wrap">
            <table className="inv-table inv-table--premiumList">
              <colgroup>
                <col style={{ width: "12%" }} />
                <col style={{ width: "14%" }} />
                <col style={{ width: "42%" }} />
                <col style={{ width: "12%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "10%" }} />
              </colgroup>

              <thead>
                <tr>
                  <th className="inv-th">QUOTE #</th>
                  <th className="inv-th">DATE</th>
                  <th className="inv-th">CUSTOMER</th>
                  <th className="inv-th inv-th-right">TOTAL</th>
                  <th className="inv-th inv-th-center">STATUS</th>
                  <th className="inv-th inv-th-right">ACTIONS</th>
                </tr>
              </thead>

              <tbody>
                {listQ.isLoading ? (
                  <tr>
                    <td className="inv-td" colSpan={6}>
                      Loading…
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td className="inv-td" colSpan={6}>
                      No quotations found.
                    </td>
                  </tr>
                ) : (
                  filtered.map((r) => {
                    const id = r.id;
                    const no = String(r.quotation_number || r.quotation_no || r.number || id);
                    const cust = String(r.customer_name || "");
                    const code = String(r.customer_code || "");
                    const stRaw = String(r.status || "DRAFT");
                    const st = statusMeta(stRaw);

                    return (
                      <tr
                        key={id}
                        className="inv-rowHover"
                        onDoubleClick={() => nav(`/quotations/${id}`)}
                        title="Double-click to open"
                      >
                        <td className="inv-td">
                          <div className="flex items-center gap-2">
                            <span className="inv-kbd">Q</span>
                            <b>{no}</b>
                          </div>
                        </td>

                        <td className="inv-td">{fmtDate(r.quotation_date)}</td>

                        <td className="inv-td">
                          <div className="flex flex-col">
                            <span className="font-medium">
                              {cust || <span className="text-muted-foreground">(No customer)</span>}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {code ? `Code: ${code}` : "—"}
                              {r.valid_until ? ` · Valid until: ${fmtDate(r.valid_until)}` : ""}
                            </span>
                          </div>
                        </td>

                        <td className="inv-td inv-right">
                          <div className="flex flex-col items-end">
                            <span className="font-semibold">Rs {money(r.total_amount)}</span>
                            <span className="text-xs text-muted-foreground">
                              VAT: Rs {money(r.vat_amount)} {Number(r.discount_amount || 0) > 0 ? `· Disc: Rs ${money(r.discount_amount)}` : ""}
                            </span>
                          </div>
                        </td>

                        <td className="inv-td inv-center">
                          <span className={`inv-badge inv-badge--${st.tone}`}>{st.label}</span>
                        </td>

                        <td className="inv-td inv-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="outline" onClick={() => nav(`/quotations/${id}`)}>
                              View
                            </Button>
                            <Button variant="outline" onClick={() => nav(`/quotations/${id}/print`)}>
                              Print
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

          {/* FOOTER NOTE */}
          <div className="p-3 text-xs text-muted-foreground">
            Tip: Double-click a row to open. Use <b>New Quotation</b> for invoice-style creation (BOX / UPB / TOTAL QTY + VAT columns).
          </div>
        </div>
      </div>

      {/* Small CSS add-on (premium chips/badges) */}
      <style>{`
        /* If your project already has these classnames, this block is harmless. */
        .inv-chip{
          display:inline-flex; align-items:center; gap:6px;
          padding:6px 10px; border-radius:999px;
          border:1px solid rgba(15,23,42,.14);
          background: rgba(248,250,252,.9);
          box-shadow: 0 8px 22px rgba(2,6,23,.06);
          font-size:12px;
          white-space:nowrap;
        }
        .inv-chip--soft b{ font-weight:700; }

        .inv-kbd{
          display:inline-flex; align-items:center; justify-content:center;
          width:18px; height:18px; border-radius:6px;
          border:1px solid rgba(15,23,42,.18);
          background: rgba(2,6,23,.04);
          font-size:11px; font-weight:700;
        }

        .inv-badge{
          display:inline-flex; align-items:center; justify-content:center;
          padding:6px 10px; border-radius:999px;
          font-size:12px; font-weight:700;
          border:1px solid rgba(15,23,42,.14);
          background: rgba(2,6,23,.04);
        }
        .inv-badge--good{ background: rgba(34,197,94,.10); border-color: rgba(34,197,94,.25); }
        .inv-badge--warn{ background: rgba(245,158,11,.12); border-color: rgba(245,158,11,.28); }
        .inv-badge--bad{  background: rgba(239,68,68,.10); border-color: rgba(239,68,68,.26); }
        .inv-badge--muted{ background: rgba(2,6,23,.04); }

        .inv-rowHover{ cursor:pointer; }
        .inv-rowHover:hover td{
          background: rgba(2,6,23,.03);
        }
      `}</style>
    </div>
  );
}
