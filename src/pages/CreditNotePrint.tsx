// src/pages/CreditNotePrint.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

/* =========================
   Helpers
========================= */
const n = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);

function money(v: any) {
  return n(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function cnStatus(s: any) {
  const v = String(s || "").toUpperCase();
  if (v === "VOID") return "VOID";
  if (v === "REFUNDED") return "REFUNDED";
  if (v === "PENDING") return "PENDING";
  return "ISSUED";
}

function fmtDate(v: any) {
  const s = String(v || "").trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  try {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d.toLocaleDateString();
  } catch {}
  return s || "—";
}

const LOGO_SRC = "/logo.png";

export default function CreditNotePrint() {
  const { id } = useParams();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [cn, setCn] = useState<any | null>(null);
  const [items, setItems] = useState<any[]>([]);

  // ✅ do NOT block printing forever on logo; use a fallback timer
  const [logoReady, setLogoReady] = useState(false);
  const [showManualPrint, setShowManualPrint] = useState(false);

  // ✅ useRef avoids React StrictMode double-mount weirdness in dev
  const printedRef = useRef(false);

  const st = useMemo(() => cnStatus(cn?.status), [cn?.status]);

  async function load() {
    setLoading(true);
    setErr(null);

    try {
      const raw = String(id || "").trim();
      if (!raw) throw new Error("Missing credit note id");

      const cnId = Number(raw);
      if (!Number.isFinite(cnId) || cnId <= 0) throw new Error("Invalid credit note id");

      const cnQ = await supabase
        .from("credit_notes")
        .select(
          `
          id,
          credit_note_number,
          credit_note_date,
          invoice_id,
          reason,
          subtotal,
          vat_amount,
          total_amount,
          status,
          created_at,
          customers:customer_id (
            name,
            customer_code,
            address,
            phone
          )
        `
        )
        .eq("id", cnId)
        .single();

      if (cnQ.error) throw new Error(cnQ.error.message);

      const itQ = await supabase
        .from("credit_note_items")
        .select(
          `
          id,
          total_qty,
          unit_price_excl_vat,
          unit_vat,
          unit_price_incl_vat,
          line_total,
          products:product_id (
            name,
            item_code,
            sku
          )
        `
        )
        .eq("credit_note_id", cnQ.data.id)
        .order("id", { ascending: true });

      if (itQ.error) throw new Error(itQ.error.message);

      setCn(cnQ.data);
      setItems(itQ.data || []);
    } catch (e: any) {
      setErr(e?.message || "Failed to load credit note");
      setCn(null);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // ✅ fallback: if logo never fires onLoad for any reason, continue after 700ms
  useEffect(() => {
    if (logoReady) return;
    const t = window.setTimeout(() => setLogoReady(true), 700);
    return () => window.clearTimeout(t);
  }, [logoReady]);

  // ✅ Auto-print once ready (data loaded + paint)
  useEffect(() => {
    if (printedRef.current) return;
    if (loading || err || !cn) return;

    // wait for logo or fallback
    if (!logoReady) return;

    const raf1 = requestAnimationFrame(() => {
      const raf2 = requestAnimationFrame(() => {
        try {
          window.focus();
          window.print();
          printedRef.current = true;

          // if print dialog was blocked, user will still see the page.
          // show manual print button after a short delay.
          window.setTimeout(() => setShowManualPrint(true), 600);
        } catch {
          setShowManualPrint(true);
        }
      });
      return () => cancelAnimationFrame(raf2);
    });

    return () => cancelAnimationFrame(raf1);
  }, [loading, err, cn, logoReady]);

  if (loading) return <div style={{ padding: 24, fontFamily: "Arial" }}>Loading credit note…</div>;
  if (err || !cn)
    return (
      <div style={{ padding: 24, fontFamily: "Arial", color: "#b91c1c" }}>
        {err || "Not found"}
        <div style={{ marginTop: 10, color: "#475569", fontSize: 12 }}>
          Tip: check the ID in the URL + your Supabase RLS permissions.
        </div>
      </div>
    );

  const customer = cn.customers || null;

  return (
    <div className="cn-print">
      <style>{`
        /* ✅ LANDSCAPE PDF */
        @page { size: A4 landscape; margin: 10mm; }

        * { box-sizing: border-box; }
        html, body { height: auto; }
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; margin: 0; }
        .cn-print { font-family: Arial, sans-serif; color: #0b1220; background:#fff; }

        .sheet{
          border: 3px solid #000;
          padding: 14px;
          background: #fff;
        }

        .hdr{
          display:grid;
          grid-template-columns: 160px 1fr 240px;
          gap: 14px;
          align-items: start;
        }

        .logoWrap{
          display:flex;
          align-items:center;
          justify-content:center;
          height: 112px;
          border: 2px solid #000;
          padding: 8px;
        }
        .logo{
          width: 140px;
          height: auto;
          object-fit: contain;
          display:block;
        }

        .center{ text-align:center; }
        .company-name{
          font-size: 26px;
          font-weight: 900;
          letter-spacing: .2px;
          color: #b30000;
          line-height: 1.1;
        }
        .company-details{
          margin-top: 6px;
          font-size: 12px;
          line-height: 1.35;
        }
        .docTitle{
          margin-top: 8px;
          display:inline-block;
          padding: 6px 14px;
          border: 2px solid #000;
          background: #b30000;
          color: #fff;
          font-weight: 900;
          letter-spacing: .6px;
          font-size: 14px;
        }

        .docBox{ border: 2px solid #000; }
        .docBoxHead{
          background: #b30000;
          color: #fff;
          font-weight: 900;
          text-align:center;
          padding: 8px;
          font-size: 13px;
        }
        .docBoxBody{
          padding: 10px;
          font-size: 12px;
          line-height: 1.35;
        }
        .docRow{ display:flex; gap:10px; justify-content:space-between; margin: 3px 0; }
        .docRow b{ min-width: 120px; display:inline-block; }

        .pill{
          display:inline-flex;
          align-items:center;
          justify-content:center;
          border: 2px solid #000;
          padding: 5px 10px;
          font-weight: 900;
          font-size: 11px;
          background:#fff;
        }

        .row2{
          display:grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-top: 12px;
        }
        .box{ border: 2px solid #000; }
        .boxTitle{
          background:#b30000;
          color:#fff;
          text-align:center;
          font-weight: 900;
          padding: 8px;
          font-size: 13px;
        }
        .boxBody{
          padding: 10px;
          font-size: 12px;
          line-height: 1.45;
        }
        .kv{ display:flex; gap:10px; margin: 4px 0; }
        .k{ width: 150px; font-weight: 800; }

        table{
          width:100%;
          border-collapse: collapse;
          margin-top: 12px;
          font-size: 12px;
        }
        thead th{
          background:#b30000;
          color:#fff;
          border: 2px solid #000;
          padding: 8px;
          text-align:center;
          font-weight: 900;
          font-size: 11px;
        }
        tbody td{
          border: 2px solid #000;
          padding: 7px;
          vertical-align: top;
        }
        .l{ text-align:left; }
        .c{ text-align:center; }
        .r{ text-align:right; font-variant-numeric: tabular-nums; }

        .bottom{
          display:grid;
          grid-template-columns: 1.6fr .8fr;
          gap: 12px;
          margin-top: 12px;
        }
        .notes{
          border: 2px solid #000;
          padding: 10px;
          min-height: 120px;
          font-size: 11px;
          line-height: 1.45;
        }
        .notes b{ display:block; margin-bottom: 6px; }
        .totals{ border: 2px solid #000; font-size: 12px; }
        .totals table{ margin:0; width:100%; border-collapse: collapse; }
        .totals td{ border-bottom: 2px solid #000; padding: 8px; }
        .totals td:first-child{ font-weight: 900; width: 65%; }
        .totals td:last-child{ text-align:right; font-weight: 900; }

        .sign{
          display:grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 14px;
          margin-top: 14px;
          font-size: 11px;
        }
        .sigBox{ text-align:center; }
        .sigLine{ border-top: 2px solid #000; margin-top: 26px; padding-top: 6px; font-weight: 800; }

        .noPrint{ margin-top: 10px; font-size: 12px; color: #64748b; }
        .printBar{
          margin: 10px 0 0;
          padding: 10px;
          border: 2px solid #000;
          background: #fff7ed;
          display:flex;
          justify-content:space-between;
          align-items:center;
          gap:10px;
        }
        .btn{
          border:2px solid #000;
          padding:8px 12px;
          background:#b30000;
          color:#fff;
          font-weight:900;
          cursor:pointer;
        }

        @media print{
          .noPrint, .printBar{ display:none !important; }
        }
      `}</style>

      {/* Manual print bar if browser blocks auto-print */}
      {showManualPrint ? (
        <div className="printBar noPrint">
          <div>
            <b>To save PDF:</b> click <b>Print</b> then choose <b>Save as PDF</b>.
          </div>
          <button className="btn" onClick={() => window.print()}>
            Print / Save PDF
          </button>
        </div>
      ) : null}

      <div className="sheet">
        {/* HEADER */}
        <div className="hdr">
          <div className="logoWrap">
            <img
              src={LOGO_SRC}
              alt="Ram Pottery Logo"
              className="logo"
              onLoad={() => setLogoReady(true)}
              onError={() => setLogoReady(true)}
            />
          </div>

          <div className="center">
            <div className="company-name">RAM POTTERY LTD</div>
            <div className="company-details">
              <b>MANUFACTURER &amp; IMPORTER OF QUALITY CLAY</b>
              <br />
              PRODUCTS AND OTHER RELIGIOUS ITEMS
              <br />
              <br />
              Robert Kennedy Street, Reunion Maurel,
              <br />
              Petit Raffray - Mauritius
              <br />
              <br />
              Tel: +230 57788884 &nbsp; +230 58060268 &nbsp; +230 52522844
              <br />
              Email: info@rampottery.com &nbsp;&nbsp;&nbsp; Web: www.rampottery.com
            </div>

            <div className="docTitle">CREDIT NOTE</div>
          </div>

          <div className="docBox">
            <div className="docBoxHead">DOCUMENT DETAILS</div>
            <div className="docBoxBody">
              <div className="docRow">
                <b>Credit Note No:</b>
                <span>{cn.credit_note_number || `#${cn.id}`}</span>
              </div>
              <div className="docRow">
                <b>Date:</b>
                <span>{fmtDate(cn.credit_note_date)}</span>
              </div>
              <div className="docRow">
                <b>Invoice ID:</b>
                <span>{cn.invoice_id ?? "—"}</span>
              </div>
              <div className="docRow">
                <b>Status:</b>
                <span className="pill">{st}</span>
              </div>
            </div>
          </div>
        </div>

        {/* CUSTOMER + REASON */}
        <div className="row2">
          <div className="box">
            <div className="boxTitle">CUSTOMER DETAILS</div>
            <div className="boxBody">
              <div className="kv">
                <div className="k">Name:</div>
                <div>{customer?.name || "—"}</div>
              </div>
              <div className="kv">
                <div className="k">Address:</div>
                <div>{customer?.address || "—"}</div>
              </div>
              <div className="kv">
                <div className="k">Tel:</div>
                <div>{customer?.phone || "—"}</div>
              </div>
              <div className="kv">
                <div className="k">Customer Code:</div>
                <div>{customer?.customer_code || "—"}</div>
              </div>
            </div>
          </div>

          <div className="box">
            <div className="boxTitle">REASON / NOTES</div>
            <div className="boxBody">
              <div className="kv">
                <div className="k">Reason:</div>
                <div>{cn.reason || "—"}</div>
              </div>
              <div className="kv">
                <div className="k">Created:</div>
                <div>{cn.created_at ? new Date(cn.created_at).toLocaleString() : "—"}</div>
              </div>
            </div>
          </div>
        </div>

        {/* ITEMS */}
        <table>
          <thead>
            <tr>
              <th style={{ width: "4%" }}>SN</th>
              <th style={{ width: "40%" }}>DESCRIPTION</th>
              <th style={{ width: "10%" }}>CODE</th>
              <th style={{ width: "8%" }}>QTY</th>
              <th style={{ width: "10%" }}>UNIT EXCL</th>
              <th style={{ width: "8%" }}>VAT</th>
              <th style={{ width: "10%" }}>UNIT INCL</th>
              <th style={{ width: "10%" }}>LINE TOTAL</th>
            </tr>
          </thead>

          <tbody>
            {items.map((it, idx) => {
              const p = it.products || null;
              const code = p?.item_code || p?.sku || "—";
              const desc = p
                ? `${p.name}${p.item_code ? ` • ${p.item_code}` : ""}${p.sku ? ` • ${p.sku}` : ""}`
                : `#${it.id}`;

              return (
                <tr key={it.id}>
                  <td className="c">{idx + 1}</td>
                  <td className="l">{desc}</td>
                  <td className="c">{code}</td>
                  <td className="r">{n(it.total_qty).toFixed(2)}</td>
                  <td className="r">{money(it.unit_price_excl_vat)}</td>
                  <td className="r">{money(it.unit_vat)}</td>
                  <td className="r">{money(it.unit_price_incl_vat)}</td>
                  <td className="r">
                    <b>{money(it.line_total)}</b>
                  </td>
                </tr>
              );
            })}

            {items.length === 0 ? (
              <tr>
                <td colSpan={8} className="c" style={{ padding: 16, color: "#475569" }}>
                  No items.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>

        {/* NOTES + TOTALS */}
        <div className="bottom">
          <div className="notes">
            <b>Note:</b>
            This credit note is issued by RAM POTTERY LTD. Please keep this document for your records.
            {cn.reason ? (
              <>
                <br />
                <br />
                <b>Reason:</b> {cn.reason}
              </>
            ) : null}
          </div>

          <div className="totals">
            <table>
              <tbody>
                <tr>
                  <td>SUB TOTAL</td>
                  <td>Rs {money(cn.subtotal)}</td>
                </tr>
                <tr>
                  <td>VAT</td>
                  <td>Rs {money(cn.vat_amount)}</td>
                </tr>
                <tr>
                  <td>TOTAL AMOUNT</td>
                  <td>Rs {money(cn.total_amount)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* SIGNATURES */}
        <div className="sign">
          <div className="sigBox">
            <div className="sigLine">Signature</div>
            <div>Prepared by: __________</div>
          </div>
          <div className="sigBox">
            <div className="sigLine">Signature</div>
            <div>Delivered by: __________</div>
          </div>
          <div className="sigBox">
            <div className="sigLine">Customer Signature</div>
            <div>Customer Name: __________</div>
            <div>Please verify before sign</div>
          </div>
        </div>

        <div className="noPrint">
          If the dialog doesn’t open: press <b>Ctrl+P</b> → choose <b>Save as PDF</b>.
        </div>
      </div>
    </div>
  );
}


