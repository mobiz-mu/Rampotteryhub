// src/pages/CreditNotePrint.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

/* =========================
   Helpers
========================= */
const n = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);

function money(v: any) {
  return n(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(v: any) {
  const s = String(v || "").trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
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

function isValidId(v: any) {
  const x = Number(v);
  return Number.isFinite(x) && x > 0;
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

/** Wait until images inside an element finish loading */
async function waitForImages(root: HTMLElement) {
  const imgs = Array.from(root.querySelectorAll("img"));
  await Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((resolve) => {
          const el = img as HTMLImageElement;
          if (el.complete) return resolve();
          el.addEventListener("load", () => resolve(), { once: true });
          el.addEventListener("error", () => resolve(), { once: true });
        })
    )
  );
}

// Use your existing logo path (can be absolute/public)
const LOGO_SRC = "/logo.png";

/* =========================
   Page
========================= */
export default function CreditNotePrint() {
  const nav = useNavigate();
  const { id } = useParams();
  const creditNoteId = Number(id);

  const [sp] = useSearchParams();
  const publicToken = (sp.get("t") || "").trim();
  const isPublicMode = !!publicToken;

  // Auth check (only needed for internal mode)
  const [authChecked, setAuthChecked] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    let alive = true;

    (async () => {
      if (isPublicMode) {
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
  }, [isPublicMode]);

  // Print root + one-time print
  const printRootRef = useRef<HTMLDivElement | null>(null);
  const printOnceRef = useRef(false);
  const [printPreparing, setPrintPreparing] = useState(false);

  async function safePrintOnce() {
    if (printOnceRef.current) return;
    if (!printRootRef.current) return;

    printOnceRef.current = true;
    setPrintPreparing(true);

    try {
      // @ts-ignore
      if (document?.fonts?.ready) {
        // @ts-ignore
        await document.fonts.ready;
      }
    } catch {}

    await waitForImages(printRootRef.current);

    window.setTimeout(() => {
      window.print();
      setPrintPreparing(false);
    }, 150);
  }

  /* =========================
     Load credit note
     - PUBLIC: /api/public/credit-note-print?id=..&t=..
     - INTERNAL: Supabase authenticated selects
  ========================= */
  const cnQ = useQuery({
    queryKey: ["credit_note_print", creditNoteId, publicToken],
    enabled: isValidId(creditNoteId) && (isPublicMode ? true : authChecked),
    queryFn: async () => {
      // PUBLIC
      if (isPublicMode) {
        const res = await fetch(
          `/api/public/credit-note-print?id=${creditNoteId}&t=${encodeURIComponent(publicToken)}`
        );
        const json = await safeJson(res);
        if (!json?.ok) throw new Error(json?.error || "Failed to load");
        return {
          ok: true,
          credit_note: json.credit_note,
          customer: json.customer || null,
          items: json.items || [],
        };
      }

      // INTERNAL
      if (!isLoggedIn) throw new Error("Unauthorized");

      // 1) Credit note
      const { data: cn, error: cnErr } = await supabase
        .from("credit_notes")
        .select(
          `
          id,
          credit_note_number,
          credit_note_date,
          invoice_id,
          customer_id,
          reason,
          subtotal,
          vat_amount,
          total_amount,
          status,
          created_at
        `
        )
        .eq("id", creditNoteId)
        .maybeSingle();

      if (cnErr) throw cnErr;
      if (!cn) throw new Error("Credit note not found");

      // 2) Items (+ product)
      const { data: itemsRaw, error: itErr } = await supabase
        .from("credit_note_items")
        .select(
          `
          id,
          credit_note_id,
          product_id,
          description,
          total_qty,
          unit_price_excl_vat,
          unit_vat,
          unit_price_incl_vat,
          line_total,
          products:product_id ( id, name, item_code, sku )
        `
        )
        .eq("credit_note_id", creditNoteId)
        .order("id", { ascending: true });

      if (itErr) throw itErr;

      const items = (itemsRaw || []).map((it: any) => ({
        ...it,
        product: it.products || null,
      }));

      // 3) Customer
      let customer: any = null;
      if ((cn as any).customer_id) {
        const { data: c, error: cErr } = await supabase
          .from("customers")
          .select("id, name, address, phone, whatsapp, brn, vat_no, customer_code")
          .eq("id", (cn as any).customer_id)
          .maybeSingle();
        if (cErr) throw cErr;
        customer = c || null;
      }

      return { ok: true, credit_note: cn, customer, items };
    },
    staleTime: 15_000,
  });

  // Internal: require auth
  if (!isPublicMode) {
    if (!authChecked) return <div style={{ padding: 24, fontFamily: "Inter, Arial, sans-serif" }}>Loading…</div>;
    if (!isLoggedIn) return <Navigate to="/auth" replace />;
  }

  const loading = cnQ.isLoading;
  const payload = cnQ.data as any;
  const cn = payload?.credit_note;
  const items = payload?.items || [];
  const customer = payload?.customer || null;

  const st = useMemo(() => cnStatus(cn?.status), [cn?.status]);
  const tone = useMemo(() => statusTone(st), [st]);

  // Auto-print ONLY for public mode (shared link)
  useEffect(() => {
    if (loading) return;
    if (!cn) return;
    if (!isPublicMode) return;
    safePrintOnce();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, cn?.id, isPublicMode]);

  if (loading) return <div style={{ padding: 24, fontFamily: "Inter, Arial, sans-serif" }}>Loading credit note…</div>;

  if (cnQ.isError || !cn) {
    return (
      <div style={{ padding: 24, fontFamily: "Inter, Arial, sans-serif", color: "#b91c1c" }}>
        Credit note not found / invalid link.
        {isPublicMode ? (
          <div style={{ marginTop: 10, color: "#475569", fontSize: 12 }}>
            Public links must include a valid token (<b>?t=...</b>)
          </div>
        ) : (
          <div style={{ marginTop: 10, color: "#475569", fontSize: 12 }}>
            Please check the ID and your access.
          </div>
        )}
      </div>
    );
  }

  const cnNo = cn.credit_note_number || `#${cn.id}`;

  return (
    <div className="cnp-root">
      <style>{`
        /* ===============================
           PREMIUM PRINT — PORTRAIT A4
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
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, "Noto Sans";
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

        .sheet{
          position: relative;
          border-radius: 18px;
          border: 1px solid rgba(15,23,42,.14);
          overflow: hidden;
          background: #fff;
        }
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

        .company{ line-height:1.15; }
        .company .name{ font-size: 18px; font-weight: 900; letter-spacing: .3px; }
        .company .sub{
          margin-top: 3px;
          font-size: 11px;
          color: var(--muted);
          line-height: 1.35;
        }

        .docBadge{ text-align:right; }
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

        .tblWrap{
          margin-top: 14px;
          border-radius: var(--radius);
          border: 1px solid rgba(15,23,42,.14);
          overflow:hidden;
          background: #fff;
        }
        table{ width: 100%; border-collapse: collapse; font-size: 11px; }
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
        .foot .gold{ color: #9a7b2e; font-weight: 850; }

        @media print{
          .cnp-printBar{ display:none !important; }
          .sheet{ box-shadow: none !important; }
        }
      `}</style>

      {/* Toolbar (screen only) */}
      <div className="cnp-printBar">
        <div style={{ fontSize: 12, color: "#475569" }}>
          {isPublicMode ? (
            <>
              <b>Shared link:</b> you can <b>Print</b> → <b>Save as PDF</b>.
            </>
          ) : (
            <>
              <b>Internal print:</b> click <b>Print</b> → <b>Save as PDF</b>.
            </>
          )}
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Button
            variant="outline"
            onClick={() => {
              if (isPublicMode) nav("/auth");
              else nav(-1);
            }}
          >
            {isPublicMode ? "Close" : "Back"}
          </Button>

          <Button onClick={() => safePrintOnce()} disabled={printPreparing}>
            {printPreparing ? "Preparing…" : "Print / Save PDF"}
          </Button>
        </div>
      </div>

      <div className="sheet" ref={printRootRef}>
        <div className="pad">
          <div className="hdr">
            <div className="brand">
              <img src={LOGO_SRC} alt="Company Logo" className="logo" />
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
                {items.map((it: any, idx: number) => {
                  const p = it.product || it.products || null;
                  const code = p?.item_code || p?.sku || "—";
                  const desc = it.description || p?.name || `#${it.id}`;

                  return (
                    <tr key={it.id || idx}>
                      <td className="c">{idx + 1}</td>
                      <td>
                        <div className="desc">{desc}</div>
                        {p?.item_code || p?.sku ? (
                          <div className="mut">{p?.item_code ? `Item: ${p.item_code}` : `SKU: ${p.sku}`}</div>
                        ) : null}
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



