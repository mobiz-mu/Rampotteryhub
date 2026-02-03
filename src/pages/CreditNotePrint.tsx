// src/pages/CreditNotePrint.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { createClient } from "@supabase/supabase-js";

/* =========================
   Supabase (Direct - Vite)
========================= */
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

function mustEnv(v: string | undefined, name: string) {
  if (!v) throw new Error(`${name} missing in .env (restart Vite after adding it).`);
  return v;
}

const supabase = createClient(mustEnv(SUPABASE_URL, "VITE_SUPABASE_URL"), mustEnv(SUPABASE_ANON_KEY, "VITE_SUPABASE_ANON_KEY"));

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

export default function CreditNotePrint() {
  const { id } = useParams();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [cn, setCn] = useState<any | null>(null);
  const [items, setItems] = useState<any[]>([]);

  const st = useMemo(() => cnStatus(cn?.status), [cn?.status]);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const raw = String(id || "").trim();
      if (!raw) throw new Error("Missing credit note id");

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
          customers:customer_id (
            name,
            customer_code,
            address,
            phone
          )
        `
        )
        .eq("id", Number(raw))
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
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [id]);

  useEffect(() => {
    if (!loading && !err) {
      // give layout a tick before print
      setTimeout(() => window.print(), 250);
    }
  }, [loading, err]);

  if (loading) return <div style={{ padding: 24, fontFamily: "Arial" }}>Loading...</div>;
  if (err || !cn) return <div style={{ padding: 24, fontFamily: "Arial", color: "#b91c1c" }}>{err || "Not found"}</div>;

  const customer = cn.customers || null;

  return (
    <div className="cn-print">
      <style>{`
        @page { size: A4; margin: 12mm; }
        * { box-sizing: border-box; }
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .cn-print { font-family: Arial, sans-serif; color: #0b1220; }
        .hdr { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px; }
        .brand { font-weight: 800; font-size: 18px; letter-spacing: .2px; }
        .muted { color:#475569; font-size: 12px; }
        .doc { text-align:right; }
        .doc .title { font-size: 18px; font-weight: 800; }
        .doc .no { margin-top: 2px; font-size: 12px; color:#334155; }
        .pill { display:inline-block; margin-top:6px; font-size:11px; font-weight:800; border:1px solid #cbd5e1; padding:4px 10px; border-radius:999px; }
        .grid { display:grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px; }
        .box { border:1px solid #e5e7eb; border-radius:10px; padding:10px; }
        .box .h { font-size: 11px; font-weight: 800; color:#64748b; text-transform: uppercase; letter-spacing:.5px; }
        .box .v { margin-top: 6px; font-size: 13px; font-weight: 700; color:#0f172a; }
        .box .t { margin-top: 2px; font-size: 12px; color:#334155; white-space: pre-line; }
        table { width:100%; border-collapse: collapse; margin-top: 14px; font-size: 12px; }
        thead th { text-align:left; font-size: 11px; color:#475569; text-transform: uppercase; letter-spacing:.5px; border-bottom:1px solid #e5e7eb; padding:8px; background:#f8fafc; }
        tbody td { padding:8px; border-bottom:1px solid #eef2f7; vertical-align: top; }
        .num { text-align:right; font-variant-numeric: tabular-nums; }
        .totals { margin-top: 12px; display:flex; justify-content:flex-end; }
        .totCard { width: 320px; border:1px solid #e5e7eb; border-radius: 12px; padding: 10px; }
        .row { display:flex; justify-content:space-between; padding:6px 0; font-size: 12px; }
        .row b { font-size: 12px; }
        .row.total { border-top: 1px solid #e5e7eb; margin-top: 6px; padding-top: 10px; font-size: 14px; }
        .row.total b { font-size: 16px; }
        .note { margin-top: 10px; color:#334155; font-size: 12px; }
        @media print {
          .noPrint { display:none !important; }
        }
      `}</style>

      <div className="hdr">
        <div>
          {/* ✅ no logo, just text (as requested) */}
          <div className="brand">Ram Pottery Ltd</div>
          <div className="muted">Credit Note Document</div>
        </div>

        <div className="doc">
          <div className="title">CREDIT NOTE</div>
          <div className="no">
            <b>{cn.credit_note_number || `#${cn.id}`}</b> • {cn.credit_note_date || "—"}
          </div>
          <div className="pill">{st}</div>
        </div>
      </div>

      <div className="grid">
        <div className="box">
          <div className="h">Customer</div>
          <div className="v">{customer?.name || "—"}</div>
          <div className="t">
            {customer?.customer_code ? `Code: ${customer.customer_code}\n` : ""}
            {customer?.phone ? `Phone: ${customer.phone}\n` : ""}
            {customer?.address ? `${customer.address}` : ""}
          </div>
        </div>

        <div className="box">
          <div className="h">Details</div>
          <div className="t">
            Date: <b>{cn.credit_note_date || "—"}</b>
            {cn.invoice_id ? (
              <>
                {"\n"}Invoice ID: <b>{cn.invoice_id}</b>
              </>
            ) : (
              ""
            )}
            {cn.reason ? (
              <>
                {"\n"}Reason: <b>{cn.reason}</b>
              </>
            ) : (
              ""
            )}
          </div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th style={{ width: "48%" }}>Product</th>
            <th className="num" style={{ width: "10%" }}>
              Qty
            </th>
            <th className="num" style={{ width: "14%" }}>
              Unit Excl
            </th>
            <th className="num" style={{ width: "10%" }}>
              VAT
            </th>
            <th className="num" style={{ width: "14%" }}>
              Unit Incl
            </th>
            <th className="num" style={{ width: "14%" }}>
              Line Total
            </th>
          </tr>
        </thead>

        <tbody>
          {items.map((it) => {
            const p = it.products || null;
            const label = p
              ? `${p.name}${p.item_code ? ` • ${p.item_code}` : ""}${p.sku ? ` • ${p.sku}` : ""}`
              : `#${it.id}`;

            return (
              <tr key={it.id}>
                <td>{label}</td>
                <td className="num">{n(it.total_qty).toFixed(2)}</td>
                <td className="num">{money(it.unit_price_excl_vat)}</td>
                <td className="num">{money(it.unit_vat)}</td>
                <td className="num">{money(it.unit_price_incl_vat)}</td>
                <td className="num">
                  <b>{money(it.line_total)}</b>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="totals">
        <div className="totCard">
          <div className="row">
            <span>Subtotal</span>
            <b>Rs {money(cn.subtotal)}</b>
          </div>
          <div className="row">
            <span>VAT</span>
            <b>Rs {money(cn.vat_amount)}</b>
          </div>
          <div className="row total">
            <span>Total</span>
            <b>Rs {money(cn.total_amount)}</b>
          </div>
        </div>
      </div>

      {cn.reason ? <div className="note">Note: {cn.reason}</div> : null}

      <div className="noPrint" style={{ marginTop: 14, color: "#64748b", fontSize: 12 }}>
        Tip: Use your browser print dialog → Save as PDF.
      </div>
    </div>
  );
}
