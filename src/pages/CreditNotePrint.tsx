// src/pages/CreditNotePrint.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

/* =========================
   Helpers
========================= */
const n = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);

function money(v: any) {
  return n(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

function cnStatus(s: any) {
  const v = String(s || "").toUpperCase();
  if (v === "VOID") return "VOID";
  if (v === "REFUNDED") return "REFUNDED";
  if (v === "PENDING") return "PENDING";
  return "ISSUED";
}

function statusTone(st: string) {
  if (st === "REFUNDED") return { bg: "#ECFDF5", ink: "#065F46", br: "#A7F3D0", dot: "#10B981" };
  if (st === "PENDING") return { bg: "#FFFBEB", ink: "#92400E", br: "#FDE68A", dot: "#F59E0B" };
  if (st === "VOID") return { bg: "#F8FAFC", ink: "#334155", br: "#E2E8F0", dot: "#94A3B8" };
  return { bg: "#FFF1F2", ink: "#9F1239", br: "#FECDD3", dot: "#FB7185" }; // ISSUED
}

async function safeJson(res: Response) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// Use your existing logo path (can be absolute/public)
const LOGO_SRC = "/logo.png";

/* =========================
   Page
========================= */
export default function CreditNotePrint() {
  const nav = useNavigate();
  const { id } = useParams();
  const [sp] = useSearchParams();
  const publicToken = (sp.get("t") || "").trim();

  // ✅ If token missing, show a helpful panel (and allow logged-in printing if you want)
  const [authChecked, setAuthChecked] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    let alive = true;

    (async () => {
      if (publicToken) {
        if (alive) {
          setIsLoggedIn(false);
          setAuthChecked(true);
        }
        return;
      }
      const { data } = await supabase.auth.getSession();
      if (!alive) return;
      setIsLoggedIn(!!data?.session);
      setAuthChecked(true);
    })();

    return () => {
      alive = false;
    };
  }, [publicToken]);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [cn, setCn] = useState<any | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [customer, setCustomer] = useState<any | null>(null);

  // Logo + auto print
  const [logoReady, setLogoReady] = useState(false);
  const printedRef = useRef(false);
  const [showManualPrint, setShowManualPrint] = useState(false);

  const st = useMemo(() => cnStatus(cn?.status), [cn?.status]);
  const tone = useMemo(() => statusTone(st), [st]);

  // =====================
  // Token guard (FIXED UX)
  // =====================
  if (!publicToken) {
    if (!authChecked) return <div style={{ padding: 24, fontFamily: "Inter, Arial, sans-serif" }}>Loading…</div>;

    // If not logged in, send to auth (same as your other pages)
    if (!isLoggedIn) return <Navigate to="/auth" replace />;

    // Logged in but no token: give the correct shared link pattern
    const example = `/credit-notes/${id || "9"}/print?t=...`;
    return (
      <div style={{ padding: 24, fontFamily: "Inter, Arial, sans-serif" }}>
        <div
          style={{
            maxWidth: 760,
            border: "1px solid #e2e8f0",
            borderRadius: 16,
            padding: 18,
            background: "#fff",
            color: "#0f172a",
          }}
        >
          <div style={{ fontWeight: 800, fontSize: 16 }}>This print link requires a public token.</div>
          <div style={{ marginTop: 8, fontSize: 13, color: "#475569", lineHeight: 1.5 }}>
            Use a shared link like: <b>{example}</b>
          </div>

          <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              onClick={() => nav("/credit-notes")}
              style={{
                border: "1px solid #e2e8f0",
                background: "#fff",
                borderRadius: 12,
                padding: "10px 12px",
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              Back to Credit Notes
            </button>
            <button
              onClick={() => nav("/dashboard")}
              style={{
                border: "1px solid #e2e8f0",
                background: "#fff",
                borderRadius: 12,
                padding: "10px 12px",
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              Dashboard
            </button>
          </div>

          <div style={{ marginTop: 14, fontSize: 12, color: "#64748b" }}>
            Tip: your “Share” button should generate the <b>t</b> parameter and open this route.
          </div>
        </div>
      </div>
    );
  }

  // =====================
  // Load (public endpoint)
  // =====================
  async function load() {
    setLoading(true);
    setErr(null);

    try {
      const raw = String(id || "").trim();
      if (!raw) throw new Error("Missing credit note id");

      const cnId = Number(raw);
      if (!Number.isFinite(cnId) || cnId <= 0) throw new Error("Invalid credit note id");

      // ✅ public endpoint (server checks token)
      const res = await fetch(`/api/public/credit-note-print?id=${cnId}&t=${encodeURIComponent(publicToken)}`);
      const json = await safeJson(res);

      if (!json?.ok) throw new Error(json?.error || "Failed to load");

      setCn(json.credit_note);
      setItems(json.items || []);
      setCustomer(json.customer || json.credit_note?.customers || null);
    } catch (e: any) {
      setErr(e?.message || "Failed to load credit note");
      setCn(null);
      setItems([]);
      setCustomer(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, publicToken]);

  // ✅ do NOT block printing forever on logo; fallback timer
  useEffect(() => {
    if (logoReady) return;
    const t = window.setTimeout(() => setLogoReady(true), 650);
    return () => window.clearTimeout(t);
  }, [logoReady]);

  // ✅ Auto-print once ready (portrait)
  useEffect(() => {
    if (printedRef.current) return;
    if (loading || err || !cn) return;
    if (!logoReady) return;

    const raf1 = requestAnimationFrame(() => {
      const raf2 = requestAnimationFrame(() => {
        try {
          window.focus();
          window.print();
          printedRef.current = true;
          window.setTimeout(() => setShowManualPrint(true), 650);
        } catch {
          setShowManualPrint(true);
        }
      });
      return () => cancelAnimationFrame(raf2);
    });

    return () => cancelAnimationFrame(raf1);
  }, [loading, err, cn, logoReady]);

  if (loading) return <div style={{ padding: 24, fontFamily: "Inter, Arial, sans-serif" }}>Loading credit note…</div>;
  if (err || !cn)
    return (
      <div style={{ padding: 24, fontFamily: "Inter, Arial, sans-serif", color: "#b91c1c" }}>
        {err || "Not found"}
        <div style={{ marginTop: 10, color: "#475569", fontSize: 12 }}>Tip: check the ID in the URL + your token.</div>
      </div>
    );

  const cnNo = cn.credit_note_number || `#${cn.id}`;

  return (
    <div className="cnp-root">
      <style>{`
        /* ===============================
           PREMIUM PRINT — PORTRAIT A4
           - luxury look (ink + gold)
           - portrait
           - stable print margins
        =============================== */
        @page { size: A4 portrait; margin: 12mm; }
        * { box-sizing: border-box; }
        html, body { height: auto; }
        body {
          margin: 0;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
          background: #ffffff;
        }

        :root{
          --ink:#0b1220;
          --muted:#475569;
          --paper:#ffffff;

          --gold:#C9A14A;
          --gold2:#E7D3A0;
          --line: rgba(15,23,42,.14);

          --soft:#f8fafc;
          --shadow: 0 12px 40px rgba(2,6,23,.08);
          --radius: 16px;
        }

        .cnp-root{
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, "Noto Sans", "Apple Color Emoji", "Segoe UI Emoji";
          color: var(--ink);
          background: var(--paper);
        }

        /* Top helper bar (screen only) */
        .cnp-printBar{
          margin: 10px 0 12px;
          padding: 10px 12px;
          border: 1px solid var(--line);
          border-radius: 14px;
          background: linear-gradient(180deg, #fff, #f8fafc);
          display:flex;
          justify-content:space-between;
          align-items:center;
          gap:10px;
          box-shadow: var(--shadow);
        }
        .cnp-btn{
          border: 1px solid rgba(15,23,42,.18);
          padding: 9px 12px;
          border-radius: 12px;
          background: linear-gradient(180deg, #111827, #0b1220);
          color: #fff;
          font-weight: 800;
          cursor: pointer;
          letter-spacing:.2px;
        }
        .cnp-btn:active{ transform: translateY(1px); }

        /* Paper frame */
        .sheet{
          position: relative;
          border-radius: 18px;
          border: 1px solid rgba(15,23,42,.14);
          overflow: hidden;
          background: #fff;
        }

        /* Luxury border (gold hairlines) */
        .sheet::before{
          content:"";
          position:absolute;
          inset: 10px;
          border-radius: 14px;
          border: 1px solid rgba(201,161,74,.55);
          pointer-events:none;
        }
        .sheet::after{
          content:"";
          position:absolute;
          inset: 16px;
          border-radius: 12px;
          border: 1px solid rgba(201,161,74,.22);
          pointer-events:none;
        }

        .pad{ padding: 18px 18px 14px; }

        /* Header */
        .hdr{
          display:grid;
          grid-template-columns: 140px 1fr;
          gap: 14px;
          align-items: start;
        }

        .brand{
          display:flex;
          align-items:center;
          justify-content:center;
          border-radius: 14px;
          border: 1px solid rgba(15,23,42,.14);
          background: linear-gradient(180deg, #fff, #f8fafc);
          padding: 10px;
          min-height: 96px;
        }
        .logo{
          width: 120px;
          height: auto;
          object-fit: contain;
          display:block;
          filter: saturate(1.02);
        }

        .hdrRight{
          display:flex;
          flex-direction:column;
          gap: 8px;
        }

        .topLine{
          display:flex;
          align-items:flex-start;
          justify-content:space-between;
          gap: 10px;
        }

        .company{
          line-height:1.15;
        }
        .company .name{
          font-size: 18px;
          font-weight: 900;
          letter-spacing: .3px;
        }
        .company .sub{
          margin-top: 3px;
          font-size: 11px;
          color: var(--muted);
          line-height: 1.35;
        }

        .docBadge{
          text-align:right;
        }
        .docBadge .title{
          display:inline-flex;
          align-items:center;
          justify-content:center;
          gap: 8px;
          padding: 8px 12px;
          border-radius: 999px;
          border: 1px solid rgba(201,161,74,.55);
          background: linear-gradient(180deg, rgba(201,161,74,.16), rgba(201,161,74,.06));
          font-weight: 950;
          letter-spacing: .9px;
          font-size: 12px;
          text-transform: uppercase;
        }
        .docBadge .meta{
          margin-top: 6px;
          font-size: 11px;
          color: var(--muted);
          line-height: 1.3;
        }

        /* Status pill */
        .status{
          margin-top: 2px;
          display:inline-flex;
          align-items:center;
          gap: 8px;
          padding: 6px 10px;
          border-radius: 999px;
          border: 1px solid;
          font-weight: 900;
          font-size: 11px;
          letter-spacing:.2px;
          background: #fff;
          white-space: nowrap;
        }
        .dot{
          width:8px;
          height:8px;
          border-radius: 999px;
          background: currentColor;
        }

        .divider{
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(201,161,74,.55), transparent);
          margin: 10px 0 0;
        }

        /* Blocks row */
        .row2{
          display:grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-top: 14px;
        }

        .box{
          border-radius: var(--radius);
          border: 1px solid rgba(15,23,42,.14);
          overflow:hidden;
          background: #fff;
        }

        .boxHead{
          padding: 10px 12px;
          background: linear-gradient(180deg, #0b1220, #111827);
          color: #fff;
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap: 10px;
        }
        .boxHead .h{
          font-weight: 900;
          letter-spacing:.55px;
          font-size: 12px;
          text-transform: uppercase;
        }
        .boxHead .chip{
          font-size: 10px;
          padding: 4px 8px;
          border-radius: 999px;
          border: 1px solid rgba(231,211,160,.55);
          color: #fff;
          opacity: .95;
        }

        .boxBody{
          padding: 12px;
          font-size: 11px;
          color: var(--ink);
          line-height: 1.45;
          background: linear-gradient(180deg, #fff, #fbfcfe);
        }

        .kv{
          display:grid;
          grid-template-columns: 108px 1fr;
          gap: 10px;
          padding: 4px 0;
          border-bottom: 1px dashed rgba(15,23,42,.12);
        }
        .kv:last-child{ border-bottom: 0; }
        .k{ color: var(--muted); font-weight: 800; }
        .v{ font-weight: 700; }

        /* Items table */
        .tblWrap{
          margin-top: 14px;
          border-radius: var(--radius);
          border: 1px solid rgba(15,23,42,.14);
          overflow:hidden;
          background: #fff;
        }
        table{
          width: 100%;
          border-collapse: collapse;
          font-size: 11px;
        }
        thead th{
          background: linear-gradient(180deg, rgba(201,161,74,.26), rgba(201,161,74,.08));
          color: var(--ink);
          border-bottom: 1px solid rgba(15,23,42,.14);
          padding: 9px 10px;
          text-align:left;
          font-weight: 950;
          letter-spacing: .35px;
          text-transform: uppercase;
          font-size: 10px;
          white-space: nowrap;
        }
        tbody td{
          padding: 9px 10px;
          border-bottom: 1px solid rgba(15,23,42,.10);
          vertical-align: top;
        }
        tbody tr:last-child td{ border-bottom: 0; }
        .r{ text-align:right; font-variant-numeric: tabular-nums; }
        .c{ text-align:center; font-variant-numeric: tabular-nums; }
        .desc{ font-weight: 850; }
        .mut{ color: var(--muted); font-weight: 650; font-size: 10px; margin-top: 2px; }

        /* Bottom zone */
        .bottom{
          display:grid;
          grid-template-columns: 1.3fr .7fr;
          gap: 12px;
          margin-top: 14px;
        }

        .note{
          border-radius: var(--radius);
          border: 1px solid rgba(15,23,42,.14);
          background: linear-gradient(180deg, #fff, #f8fafc);
          padding: 12px;
          font-size: 11px;
          line-height: 1.45;
          color: var(--ink);
        }
        .note b{ display:block; margin-bottom: 6px; }

        .tot{
          border-radius: var(--radius);
          border: 1px solid rgba(15,23,42,.14);
          overflow:hidden;
          background: #fff;
        }
        .totHead{
          padding: 10px 12px;
          background: linear-gradient(180deg, rgba(15,23,42,.96), rgba(15,23,42,.88));
          color:#fff;
          font-weight: 950;
          letter-spacing:.55px;
          text-transform: uppercase;
          font-size: 12px;
        }
        .totBody{
          padding: 10px 12px;
          background: linear-gradient(180deg, #fff, #fbfcfe);
        }
        .totRow{
          display:flex;
          justify-content:space-between;
          gap:12px;
          padding: 6px 0;
          border-bottom: 1px dashed rgba(15,23,42,.14);
          font-size: 11px;
        }
        .totRow:last-child{ border-bottom: 0; }
        .totRow .lab{ color: var(--muted); font-weight: 850; }
        .totRow .val{ font-weight: 950; font-variant-numeric: tabular-nums; }
        .grand{
          margin-top: 8px;
          padding-top: 10px;
          border-top: 1px solid rgba(201,161,74,.40);
          display:flex;
          justify-content:space-between;
          gap:12px;
          align-items:baseline;
        }
        .grand .lab{ font-weight: 950; letter-spacing:.3px; }
        .grand .val{ font-size: 16px; font-weight: 1000; }

        /* Signatures */
        .sign{
          display:grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 12px;
          margin-top: 14px;
          padding: 0 18px 16px;
        }
        .sigBox{
          border-radius: 14px;
          border: 1px solid rgba(15,23,42,.14);
          background: #fff;
          padding: 10px 10px 12px;
          text-align:center;
          font-size: 10px;
          color: var(--muted);
        }
        .sigLine{
          margin-top: 26px;
          border-top: 1px solid rgba(15,23,42,.35);
          padding-top: 6px;
          color: var(--ink);
          font-weight: 850;
        }

        .foot{
          padding: 0 18px 18px;
          font-size: 10px;
          color: #64748b;
          display:flex;
          justify-content:space-between;
          gap:10px;
          align-items:flex-end;
        }
        .foot .gold{
          color: #9a7b2e;
          font-weight: 850;
        }

        @media print{
          .cnp-printBar{ display:none !important; }
          /* Ensure no heavy shadows on printer */
          .sheet{ box-shadow: none !important; }
        }
      `}</style>

      {showManualPrint ? (
        <div className="cnp-printBar">
          <div style={{ fontSize: 12, color: "#475569" }}>
            <b>Save PDF:</b> Click <b>Print</b> → choose <b>Save as PDF</b>.
          </div>
          <button className="cnp-btn" onClick={() => window.print()}>
            Print / Save PDF
          </button>
        </div>
      ) : null}

      <div className="sheet">
        <div className="pad">
          <div className="hdr">
            <div className="brand">
              <img
                src={LOGO_SRC}
                alt="Company Logo"
                className="logo"
                onLoad={() => setLogoReady(true)}
                onError={() => setLogoReady(true)}
              />
            </div>

            <div className="hdrRight">
              <div className="topLine">
                <div className="company">
                  <div className="name">RAM POTTERY LTD</div>
                  <div className="sub">
                    MANUFACTURER &amp; IMPORTER OF QUALITY CLAY PRODUCTS
                    <br />
                    Robert Kennedy Street, Reunion Maurel, Petit Raffray — Mauritius
                    <br />
                    Tel: +230 57788884 • +230 58060268 • +230 52522844
                    <br />
                    Email: info@rampottery.com • Web: www.rampottery.com
                  </div>
                </div>

                <div className="docBadge">
                  <div className="title">CREDIT NOTE</div>
                  <div className="meta">
                    <div>
                      No: <b>{cnNo}</b>
                    </div>
                    <div>
                      Date: <b>{fmtDate(cn.credit_note_date)}</b>
                    </div>
                    <div style={{ marginTop: 6 }}>
                      <span
                        className="status"
                        style={{
                          background: tone.bg,
                          color: tone.ink,
                          borderColor: tone.br,
                        }}
                      >
                        <span className="dot" style={{ background: tone.dot }} />
                        {st}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="divider" />
            </div>
          </div>

          <div className="row2">
            <div className="box">
              <div className="boxHead">
                <div className="h">Customer</div>
                <div className="chip">{customer?.customer_code || "—"}</div>
              </div>
              <div className="boxBody">
                <div className="kv">
                  <div className="k">Name</div>
                  <div className="v">{customer?.name || "—"}</div>
                </div>
                <div className="kv">
                  <div className="k">Phone</div>
                  <div className="v">{customer?.phone || "—"}</div>
                </div>
                <div className="kv">
                  <div className="k">Address</div>
                  <div className="v">{customer?.address || "—"}</div>
                </div>
              </div>
            </div>

            <div className="box">
              <div className="boxHead">
                <div className="h">Document details</div>
                <div className="chip">ID: {cn.id}</div>
              </div>
              <div className="boxBody">
                <div className="kv">
                  <div className="k">Invoice ID</div>
                  <div className="v">{cn.invoice_id ?? "—"}</div>
                </div>
                <div className="kv">
                  <div className="k">Reason</div>
                  <div className="v">{cn.reason || "—"}</div>
                </div>
                <div className="kv">
                  <div className="k">Created</div>
                  <div className="v">{cn.created_at ? new Date(cn.created_at).toLocaleString() : "—"}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="tblWrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: "4%" }}>#</th>
                  <th style={{ width: "44%" }}>Description</th>
                  <th style={{ width: "10%" }}>Code</th>
                  <th style={{ width: "8%" }} className="r">
                    Qty
                  </th>
                  <th style={{ width: "10%" }} className="r">
                    Unit Excl
                  </th>
                  <th style={{ width: "8%" }} className="r">
                    VAT
                  </th>
                  <th style={{ width: "8%" }} className="r">
                    Unit Incl
                  </th>
                  <th style={{ width: "8%" }} className="r">
                    Line Total
                  </th>
                </tr>
              </thead>

              <tbody>
                {items.map((it, idx) => {
                  const p = it.product || it.products || null;
                  const code = p?.item_code || p?.sku || "—";
                  const desc = it.description || p?.name || `#${it.id}`;

                  return (
                    <tr key={it.id || idx}>
                      <td className="c">{idx + 1}</td>
                      <td>
                        <div className="desc">{desc}</div>
                        {p?.item_code || p?.sku ? <div className="mut">{p?.item_code ? `Item: ${p.item_code}` : `SKU: ${p.sku}`}</div> : null}
                      </td>
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
                    <td colSpan={8} className="c" style={{ padding: 14, color: "#475569" }}>
                      No items.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="bottom">
            <div className="note">
              <b>Note</b>
              This credit note is issued by <b>RAM POTTERY LTD</b>. Please keep this document for your records.
              {cn.reason ? (
                <>
                  <br />
                  <br />
                  <b>Reason</b>
                  {cn.reason}
                </>
              ) : null}
            </div>

            <div className="tot">
              <div className="totHead">Totals</div>
              <div className="totBody">
                <div className="totRow">
                  <div className="lab">Subtotal</div>
                  <div className="val">Rs {money(cn.subtotal)}</div>
                </div>
                <div className="totRow">
                  <div className="lab">VAT</div>
                  <div className="val">Rs {money(cn.vat_amount)}</div>
                </div>
                <div className="grand">
                  <div className="lab">TOTAL</div>
                  <div className="val">Rs {money(cn.total_amount)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="sign">
          <div className="sigBox">
            <div className="sigLine">Prepared by</div>
          </div>
          <div className="sigBox">
            <div className="sigLine">Delivered by</div>
          </div>
          <div className="sigBox">
            <div className="sigLine">Customer signature</div>
            <div style={{ marginTop: 6 }}>Please verify before signing</div>
          </div>
        </div>

        <div className="foot">
          <div>
            Generated: <span className="gold">{new Date().toLocaleString()}</span>
          </div>
          <div>Thank you for your business.</div>
        </div>
      </div>
    </div>
  );
}


