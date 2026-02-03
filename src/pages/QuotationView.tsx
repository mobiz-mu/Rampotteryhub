// src/pages/QuotationView.tsx
import React, { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { toast } from "sonner";

import { getQuotation, getQuotationItems, setQuotationStatus } from "@/lib/quotations";
import { convertQuotationToInvoice } from "@/lib/quotationConvert";
import { waLink, quotationShareMessage } from "@/lib/whatsapp";

/* =========================
   Helpers
========================= */
function money(v: any) {
  const x = Number(v ?? 0);
  const n = Number.isFinite(x) ? x : 0;
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function fmtDate(v: any) {
  const s = String(v || "").trim();
  if (!s) return "";
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return s;
}

function isValidId(v: any) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0;
}

/* =========================
   Premium UI tiny bits
========================= */
function StatusPill({ status }: { status: string }) {
  const st = String(status || "DRAFT").toUpperCase();

  const cls =
    st === "ACCEPTED"
      ? "inv-pill inv-pill--ok"
      : st === "REJECTED"
      ? "inv-pill inv-pill--bad"
      : st === "SENT"
      ? "inv-pill inv-pill--info"
      : st === "CONVERTED"
      ? "inv-pill inv-pill--purple"
      : "inv-pill";

  return <span className={cls}>{st}</span>;
}

/* =========================
   Page
========================= */
export default function QuotationView() {
  const { id } = useParams();
  const quotationId = Number(id);
  const nav = useNavigate();

  // ✅ Guard: never show “Quotation not found” for invalid URLs (like /quotations/new)
  if (!isValidId(quotationId)) {
    return (
      <div className="inv-page">
        <div className="inv-actions inv-screen inv-actions--tight">
          <Button variant="outline" onClick={() => nav(-1)}>
            ← Back
          </Button>
        </div>

        <div className="inv-screen inv-form-shell inv-form-shell--tight">
          <div className="inv-form-card">
            <div className="p-6 text-sm text-muted-foreground">
              Invalid quotation link.
            </div>
          </div>
        </div>
      </div>
    );
  }

  const [busyStatus, setBusyStatus] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);

  const qQ = useQuery({
    queryKey: ["quotation", quotationId],
    queryFn: () => getQuotation(quotationId),
    enabled: true,
    staleTime: 10_000,
  });

  const itemsQ = useQuery({
    queryKey: ["quotation_items", quotationId],
    queryFn: () => getQuotationItems(quotationId),
    enabled: true,
    staleTime: 10_000,
  });

  const qRow: any = qQ.data;
  const items: any[] = itemsQ.data || [];

  const status = String(qRow?.status || "DRAFT");
  const no = String(qRow?.quotation_number || qRow?.quotation_no || qRow?.number || qRow?.id || quotationId);
  const customerName = String(qRow?.customer_name || "");
  const customerPhone = String(qRow?.customer_phone || qRow?.phone || ""); // optional if you add later

  const totals = useMemo(() => {
    const subtotal = Number(qRow?.subtotal || 0);
    const vat = Number(qRow?.vat_amount || 0);
    const total = Number(qRow?.total_amount || 0);
    const disc = Number(qRow?.discount_amount || 0);
    return { subtotal, vat, total, disc };
  }, [qRow]);

  async function updateStatus(st: string) {
    try {
      setBusyStatus(st);
      await setQuotationStatus(quotationId, st as any);
      toast.success(`Status updated: ${st}`);
      await Promise.all([qQ.refetch(), itemsQ.refetch()]);
    } catch (e: any) {
      toast.error(e?.message || "Failed to update status");
    } finally {
      setBusyStatus(null);
    }
  }

  async function onConvert() {
    try {
      setConverting(true);
      const { invoiceId, invoiceNumber } = await convertQuotationToInvoice(quotationId);
      toast.success(`Converted to Invoice ${invoiceNumber || ""}`.trim());
      nav(`/invoices/${invoiceId}`);
    } catch (e: any) {
      toast.error(e?.message || "Convert failed");
    } finally {
      setConverting(false);
    }
  }

  function onWhatsApp() {
    const msg = quotationShareMessage({
      quotationNo: qRow?.quotation_number || null,
      quotationId,
      customerName: qRow?.customer_name || null,
    });

    // ✅ Safe: waLink requires digits; if you don't have a customer phone, still open WA using your own fallback.
    const phone = customerPhone?.trim() ? customerPhone : "23000000000";
    const url = waLink(phone, msg);
    window.open(url, "_blank", "noreferrer");
  }

  const loading = qQ.isLoading || itemsQ.isLoading;

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }

  // ✅ Better error: show “Access denied / RLS” hint instead of only “not found”
  if (!qRow) {
    return (
      <div className="inv-page">
        <div className="inv-actions inv-screen inv-actions--tight">
          <Button variant="outline" onClick={() => nav(-1)}>
            ← Back
          </Button>
          <div className="inv-actions-right">
            <Button variant="outline" onClick={() => nav("/quotations")}>
              Go to Quotations
            </Button>
          </div>
        </div>

        <div className="inv-screen inv-form-shell inv-form-shell--tight">
          <div className="inv-form-card">
            <div className="p-6">
              <div className="text-sm text-destructive font-medium">Quotation not found.</div>
              <div className="mt-2 text-sm text-muted-foreground">
                If you just created it and you still see this, it’s usually a Supabase RLS
                policy blocking SELECT on <b>quotations</b>.
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="inv-page">
      {/* Premium header strip */}
      <div className="inv-screen inv-quoteHero">
        <div className="inv-quoteHero__left">
          <div className="inv-quoteHero__kicker">Quotation</div>
          <div className="inv-quoteHero__title">
            <span className="inv-quoteHero__no">{no}</span>
            <StatusPill status={status} />
          </div>
          <div className="inv-quoteHero__sub">
            Customer: <b>{customerName || "(No name)"}</b>
          </div>
        </div>

        <div className="inv-quoteHero__right">
          <Button variant="outline" onClick={() => nav(-1)}>
            ← Back
          </Button>

          <Button variant="outline" onClick={() => nav(`/quotations/new?duplicate=${quotationId}`)}>
            Duplicate
          </Button>

          <Button variant="outline" onClick={() => nav(`/quotations/${quotationId}/print`)}>
            Print
          </Button>

          <Button variant="outline" onClick={onWhatsApp}>
            WhatsApp PDF
          </Button>

          <Button onClick={onConvert} disabled={converting}>
            {converting ? "Converting…" : "Convert → Invoice"}
          </Button>
        </div>
      </div>

      {/* Main card */}
      <div className="inv-screen inv-form-shell inv-form-shell--tight">
        <div className="inv-form-card inv-form-card--premium">
          {/* Meta grid */}
          <div className="inv-metaGrid">
            <div className="inv-metaBox">
              <div className="k">Date</div>
              <div className="v">{fmtDate(qRow.quotation_date) || "—"}</div>
            </div>
            <div className="inv-metaBox">
              <div className="k">Valid Until</div>
              <div className="v">{fmtDate(qRow.valid_until) || "—"}</div>
            </div>
            <div className="inv-metaBox">
              <div className="k">Sales Rep</div>
              <div className="v">{qRow.sales_rep || "—"}</div>
            </div>
            <div className="inv-metaBox">
              <div className="k">Rep Phone</div>
              <div className="v">{qRow.sales_rep_phone || "—"}</div>
            </div>

            <div className="inv-metaBox inv-metaBox--wide">
              <div className="k">Notes</div>
              <div className="v">{qRow.notes ? String(qRow.notes) : "—"}</div>
            </div>
          </div>

          {/* Status actions */}
          <div className="inv-statusRow">
            <div className="inv-statusRow__label">Update status</div>
            <div className="inv-statusRow__buttons">
              <Button variant="outline" onClick={() => updateStatus("DRAFT")} disabled={busyStatus === "DRAFT"}>
                {busyStatus === "DRAFT" ? "…" : "Draft"}
              </Button>
              <Button variant="outline" onClick={() => updateStatus("SENT")} disabled={busyStatus === "SENT"}>
                {busyStatus === "SENT" ? "…" : "Sent"}
              </Button>
              <Button variant="outline" onClick={() => updateStatus("ACCEPTED")} disabled={busyStatus === "ACCEPTED"}>
                {busyStatus === "ACCEPTED" ? "…" : "Accepted"}
              </Button>
              <Button variant="outline" onClick={() => updateStatus("REJECTED")} disabled={busyStatus === "REJECTED"}>
                {busyStatus === "REJECTED" ? "…" : "Rejected"}
              </Button>
            </div>
          </div>

          {/* Items */}
          <div className="inv-table-wrap inv-table-wrap--premium">
            <table className="inv-table inv-table--invoiceCols">
              <colgroup>
                <col style={{ width: "4%" }} />
                <col style={{ width: "32%" }} />
                <col style={{ width: "14%" }} />
                <col style={{ width: "7%" }} />
                <col style={{ width: "8%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "7%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "12%" }} />
              </colgroup>

              <thead>
                <tr>
                  <th className="inv-th inv-th-center">#</th>
                  <th className="inv-th">PRODUCT / DESCRIPTION</th>
                  <th className="inv-th inv-th-center">BOX / PCS</th>
                  <th className="inv-th inv-th-center">UNIT</th>
                  <th className="inv-th inv-th-center">TOTAL QTY</th>
                  <th className="inv-th inv-th-right">UNIT EX</th>
                  <th className="inv-th inv-th-right">VAT</th>
                  <th className="inv-th inv-th-right">UNIT INC</th>
                  <th className="inv-th inv-th-right">TOTAL</th>
                </tr>
              </thead>

              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td className="inv-td" colSpan={9}>
                      No items
                    </td>
                  </tr>
                ) : (
                  items.map((it, idx) => {
                    const uom = String(it.uom || "BOX").toUpperCase();
                    const upb = uom === "PCS" ? "" : Number(it.units_per_box || 0) || "";
                    const tqty = Number(it.total_qty || 0) || "";
                    const code = String(it.item_code || it.product?.item_code || it.product?.sku || "").trim();
                    const desc = String(it.description || it.product?.name || "").trim();

                    return (
                      <tr key={it.id || idx}>
                        <td className="inv-td inv-center">{idx + 1}</td>

                        <td className="inv-td">
                          <div className="inv-descCell">
                            <div className="inv-descTop">
                              {code ? <span className="inv-code">{code}</span> : null}
                              <span className="inv-descText">{desc}</span>
                            </div>
                          </div>
                        </td>

                        <td className="inv-td inv-center">{uom}</td>
                        <td className="inv-td inv-center">{upb}</td>
                        <td className="inv-td inv-center">{tqty}</td>

                        <td className="inv-td inv-right">{money(it.unit_price_excl_vat)}</td>
                        <td className="inv-td inv-right">{money(it.unit_vat)}</td>
                        <td className="inv-td inv-right">{money(it.unit_price_incl_vat)}</td>
                        <td className="inv-td inv-right">{money(it.line_total)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="inv-totalsbar inv-totalsbar--premium inv-totalsbar--shadow">
            <div className="inv-totalsbar__cell">
              <span className="k">Subtotal</span>
              <span className="v">Rs {money(totals.subtotal)}</span>
            </div>
            <div className="inv-totalsbar__cell">
              <span className="k">VAT</span>
              <span className="v">Rs {money(totals.vat)}</span>
            </div>
            <div className="inv-totalsbar__cell">
              <span className="k">Discount</span>
              <span className="v">Rs {money(totals.disc)}</span>
            </div>
            <div className="inv-totalsbar__cell inv-totalsbar__cell--balance">
              <span className="k">Total</span>
              <span className="v">Rs {money(totals.total)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ✅ Drop-in premium CSS (safe: only adds classes used above)
          Put this in your main invoice css OR a small quotation css file. */}
      <style>{`
        .inv-quoteHero{
          display:flex;
          align-items:flex-end;
          justify-content:space-between;
          gap:14px;
          padding:14px 14px;
          border-radius:14px;
          background: linear-gradient(135deg, rgba(15,23,42,.04), rgba(15,23,42,.02));
          border:1px solid rgba(15,23,42,.10);
          box-shadow: 0 18px 55px rgba(2,6,23,.06);
          margin-bottom:12px;
        }
        .inv-quoteHero__kicker{
          font-size:12px;
          letter-spacing:.12em;
          text-transform:uppercase;
          color: rgba(11,18,32,.60);
          margin-bottom:6px;
        }
        .inv-quoteHero__title{
          display:flex;
          align-items:center;
          gap:10px;
          font-size:22px;
          font-weight:800;
          color: rgba(11,18,32,1);
          line-height:1.1;
        }
        .inv-quoteHero__no{
          padding:6px 10px;
          border-radius:12px;
          background: rgba(255,255,255,.75);
          border: 1px solid rgba(15,23,42,.10);
        }
        .inv-quoteHero__sub{
          margin-top:6px;
          font-size:13px;
          color: rgba(11,18,32,.70);
        }
        .inv-quoteHero__right{
          display:flex;
          flex-wrap:wrap;
          gap:8px;
          justify-content:flex-end;
        }

        .inv-form-card--premium{
          border: 1px solid rgba(15,23,42,.10);
          box-shadow: 0 18px 55px rgba(2,6,23,.06);
          border-radius:14px;
          overflow:hidden;
        }

        .inv-metaGrid{
          display:grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap:10px;
          padding:12px;
        }
        .inv-metaBox{
          border:1px solid rgba(15,23,42,.10);
          background: rgba(255,255,255,.75);
          border-radius:12px;
          padding:10px;
          min-height:62px;
        }
        .inv-metaBox .k{
          font-size:11px;
          text-transform:uppercase;
          letter-spacing:.10em;
          color: rgba(11,18,32,.55);
        }
        .inv-metaBox .v{
          margin-top:6px;
          font-size:13px;
          color: rgba(11,18,32,.90);
          font-weight:650;
          word-break:break-word;
        }
        .inv-metaBox--wide{
          grid-column: 1 / -1;
        }

        .inv-statusRow{
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:10px;
          padding: 0 12px 12px 12px;
        }
        .inv-statusRow__label{
          font-size:12px;
          color: rgba(11,18,32,.65);
        }
        .inv-statusRow__buttons{
          display:flex;
          flex-wrap:wrap;
          gap:8px;
        }

        .inv-pill{
          font-size:12px;
          font-weight:750;
          padding:6px 10px;
          border-radius:999px;
          border:1px solid rgba(15,23,42,.12);
          background: rgba(255,255,255,.7);
          color: rgba(11,18,32,.80);
        }
        .inv-pill--ok{
          background: rgba(34,197,94,.10);
          border-color: rgba(34,197,94,.25);
          color: rgba(21,128,61,1);
        }
        .inv-pill--bad{
          background: rgba(239,68,68,.10);
          border-color: rgba(239,68,68,.25);
          color: rgba(185,28,28,1);
        }
        .inv-pill--info{
          background: rgba(59,130,246,.10);
          border-color: rgba(59,130,246,.25);
          color: rgba(29,78,216,1);
        }
        .inv-pill--purple{
          background: rgba(168,85,247,.10);
          border-color: rgba(168,85,247,.25);
          color: rgba(126,34,206,1);
        }

        .inv-table-wrap--premium{
          border-top:1px solid rgba(15,23,42,.08);
          border-bottom:1px solid rgba(15,23,42,.08);
        }
        .inv-descCell .inv-descTop{
          display:flex;
          gap:8px;
          align-items:baseline;
        }
        .inv-code{
          font-weight:800;
          font-size:12px;
          padding:3px 8px;
          border-radius:999px;
          background: rgba(15,23,42,.06);
          border:1px solid rgba(15,23,42,.10);
          white-space:nowrap;
        }
        .inv-descText{
          font-size:13px;
          color: rgba(11,18,32,.92);
        }

        .inv-totalsbar--shadow{
          box-shadow: 0 16px 40px rgba(2,6,23,.06);
        }

        /* responsive */
        @media (max-width: 980px){
          .inv-quoteHero{ align-items:flex-start; }
          .inv-metaGrid{ grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @media (max-width: 560px){
          .inv-metaGrid{ grid-template-columns: 1fr; }
          .inv-quoteHero__title{ font-size:18px; }
        }
      `}</style>
    </div>
  );
}

