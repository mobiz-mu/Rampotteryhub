import { Router } from "express";
import { chromium } from "playwright";
import { supaAdmin } from "../supabaseAdmin.js";

const router = Router();

function money(v: any) {
  return Number(v || 0).toLocaleString("en-MU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function esc(v: any) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function monthRange(month: string) {
  const start = new Date(`${month}-01T00:00:00`);
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);
  return {
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
  };
}

function resolveDateRange(query: any) {
  const month = String(query.month || "").trim();
  let from = String(query.date_from || "").trim();
  let to = String(query.date_to || "").trim();

  if (month && !from && !to) {
    const r = monthRange(month);
    from = r.from;
    to = r.to;
  }

  return { from, to, month };
}

function buildBaseUrl(req: any) {
  const envUrl =
    process.env.APP_URL ||
    process.env.PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.VITE_API_URL ||
    "";

  if (envUrl) return envUrl.replace(/\/$/, "");
  return `${req.protocol}://${req.get("host")}`;
}

async function renderPdfFromUrl(url: string) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle" });
    await page.emulateMedia({ media: "print" });

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: "10mm",
        right: "8mm",
        bottom: "10mm",
        left: "8mm",
      },
      preferCSSPageSize: true,
    });

    return pdf;
  } finally {
    await browser.close();
  }
}

/* =========================================================
   CUSTOMER SUMMARY JSON
========================================================= */
router.get("/customers", async (req, res) => {
  try {
    const supabase = supaAdmin();
    const { from, to, month } = resolveDateRange(req.query);

    const customerId = String(req.query.customer_id || "").trim();
    const all = String(req.query.all || "false") === "true";

    let customerQuery = supabase
      .from("customers")
      .select("id,name,address,phone,whatsapp,customer_code")
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (!all && customerId) {
      customerQuery = customerQuery.eq("id", Number(customerId));
    }

    const { data: customers, error: customersErr } = await customerQuery;
    if (customersErr) throw customersErr;

    const selectedCustomers = customers || [];
    const selectedCustomerIds = selectedCustomers.map((c: any) => Number(c.id));

    if (!selectedCustomerIds.length) {
      return res.json({
        ok: true,
        mode: "customer_summary",
        month,
        from,
        to,
        rows: [],
      });
    }

    let invoiceQuery = supabase
      .from("invoices")
      .select("id,customer_id,invoice_date,invoice_number,total_amount,status,sales_rep")
      .in("customer_id", selectedCustomerIds)
      .neq("status", "DRAFT")
      .order("invoice_date", { ascending: true })
      .order("id", { ascending: true });

    if (from) invoiceQuery = invoiceQuery.gte("invoice_date", from);
    if (to) invoiceQuery = invoiceQuery.lt("invoice_date", to);

    const { data: invoices, error: invoicesErr } = await invoiceQuery;
    if (invoicesErr) throw invoicesErr;

    let paymentQuery = supabase
      .from("payments")
      .select("id,customer_id,invoice_id,payment_date,amount,notes")
      .in("customer_id", selectedCustomerIds)
      .order("payment_date", { ascending: true })
      .order("id", { ascending: true });

    if (from) paymentQuery = paymentQuery.gte("payment_date", from);
    if (to) paymentQuery = paymentQuery.lt("payment_date", to);

    const { data: payments, error: paymentsErr } = await paymentQuery;
    if (paymentsErr) throw paymentsErr;

    let creditQuery = supabase
      .from("credit_notes")
      .select("id,customer_id,credit_note_date,credit_note_number,total_amount,status,sales_rep")
      .in("customer_id", selectedCustomerIds)
      .neq("status", "VOID")
      .order("credit_note_date", { ascending: true })
      .order("id", { ascending: true });

    if (from) creditQuery = creditQuery.gte("credit_note_date", from);
    if (to) creditQuery = creditQuery.lt("credit_note_date", to);

    const { data: creditNotes, error: creditErr } = await creditQuery;
    if (creditErr) throw creditErr;

    const rows = selectedCustomers.map((customer: any) => {
      const tx: any[] = [];

      for (const inv of invoices || []) {
        if (Number(inv.customer_id) !== Number(customer.id)) continue;
        tx.push({
          source_id: Number(inv.id),
          tx_date: inv.invoice_date,
          particular: inv.invoice_number,
          debit: 0,
          credit: Number(inv.total_amount || 0),
          source_type: "INVOICE",
        });
      }

      for (const p of payments || []) {
        if (Number(p.customer_id) !== Number(customer.id)) continue;
        tx.push({
          source_id: Number(p.id),
          tx_date: p.payment_date,
          particular: String(p.notes || "").trim() || "PAYMENT",
          debit: Number(p.amount || 0),
          credit: 0,
          source_type: "PAYMENT",
        });
      }

      for (const cn of creditNotes || []) {
        if (Number(cn.customer_id) !== Number(customer.id)) continue;
        tx.push({
          source_id: Number(cn.id),
          tx_date: cn.credit_note_date,
          particular: cn.credit_note_number || "CREDIT NOTE",
          debit: Number(cn.total_amount || 0),
          credit: 0,
          source_type: "CREDIT_NOTE",
        });
      }

      tx.sort((a, b) => {
        const d = String(a.tx_date).localeCompare(String(b.tx_date));
        if (d !== 0) return d;
        return Number(a.source_id) - Number(b.source_id);
      });

      let running = 0;
      const items = tx.map((r, index) => {
        const debit = Number(r.debit || 0);
        const credit = Number(r.credit || 0);
        running = Number((running + credit - debit).toFixed(2));

        return {
          no: index + 1,
          tx_date: r.tx_date,
          particular: r.particular,
          source_type: r.source_type,
          debit,
          credit,
          balance: running,
        };
      });

      const totalDebit = Number(items.reduce((s, x) => s + x.debit, 0).toFixed(2));
      const totalCredit = Number(items.reduce((s, x) => s + x.credit, 0).toFixed(2));
      const closingBalance = Number((totalCredit - totalDebit).toFixed(2));

      return {
        customer,
        items,
        totals: {
          debit: totalDebit,
          credit: totalCredit,
          balance: closingBalance,
        },
      };
    });

    return res.json({
      ok: true,
      mode: "customer_summary",
      month,
      from,
      to,
      rows,
    });
  } catch (err: any) {
    console.error("GET /summary/customers failed:", err);
    return res.status(500).json({
      ok: false,
      error: err?.message || "Failed to load customer summary",
    });
  }
});

/* =========================================================
   SALES REP SUMMARY JSON
========================================================= */
router.get("/sales-reps", async (req, res) => {
  try {
    const supabase = supaAdmin();
    const { from, to, month } = resolveDateRange(req.query);

    const salesRep = String(req.query.sales_rep || "").trim();
    const all = String(req.query.all || "false") === "true";

    let invoiceQuery = supabase
      .from("invoices")
      .select("id,invoice_date,invoice_number,total_amount,status,sales_rep,customer_id")
      .neq("status", "DRAFT")
      .order("invoice_date", { ascending: true })
      .order("invoice_number", { ascending: true });

    if (from) invoiceQuery = invoiceQuery.gte("invoice_date", from);
    if (to) invoiceQuery = invoiceQuery.lt("invoice_date", to);
    if (!all && salesRep) invoiceQuery = invoiceQuery.eq("sales_rep", salesRep);

    const { data: invoices, error: invoicesErr } = await invoiceQuery;
    if (invoicesErr) throw invoicesErr;

    let creditQuery = supabase
      .from("credit_notes")
      .select("id,credit_note_date,credit_note_number,total_amount,status,sales_rep,customer_id")
      .neq("status", "VOID")
      .order("credit_note_date", { ascending: true })
      .order("credit_note_number", { ascending: true });

    if (from) creditQuery = creditQuery.gte("credit_note_date", from);
    if (to) creditQuery = creditQuery.lt("credit_note_date", to);
    if (!all && salesRep) creditQuery = creditQuery.eq("sales_rep", salesRep);

    const { data: creditNotes, error: creditErr } = await creditQuery;
    if (creditErr) throw creditErr;

    const customerIds = Array.from(
      new Set(
        [...(invoices || []), ...(creditNotes || [])]
          .map((r: any) => Number(r.customer_id))
          .filter(Boolean)
      )
    );

    let customersById: Record<number, any> = {};
    if (customerIds.length) {
      const { data: customers, error: cErr } = await supabase
        .from("customers")
        .select("id,name,address,phone,whatsapp")
        .in("id", customerIds);

      if (cErr) throw cErr;
      customersById = Object.fromEntries((customers || []).map((c: any) => [Number(c.id), c]));
    }

    const tx: any[] = [];

    for (const inv of invoices || []) {
      const c = customersById[Number(inv.customer_id)] || {};
      tx.push({
        source_type: "INVOICE",
        source_id: Number(inv.id),
        tx_date: inv.invoice_date,
        day_name: new Date(String(inv.invoice_date)).toLocaleDateString("en-US", { weekday: "long" }),
        sales_rep: String(inv.sales_rep || "").trim(),
        doc_no: inv.invoice_number,
        customer_name: c.name || "",
        customer_address: c.address || "",
        mobile_no: c.phone || c.whatsapp || "",
        amount: Number(inv.total_amount || 0),
        status: inv.status || "",
      });
    }

    for (const cn of creditNotes || []) {
      const c = customersById[Number(cn.customer_id)] || {};
      tx.push({
        source_type: "CREDIT_NOTE",
        source_id: Number(cn.id),
        tx_date: cn.credit_note_date,
        day_name: new Date(String(cn.credit_note_date)).toLocaleDateString("en-US", { weekday: "long" }),
        sales_rep: String(cn.sales_rep || "").trim(),
        doc_no: cn.credit_note_number,
        customer_name: c.name || "",
        customer_address: c.address || "",
        mobile_no: c.phone || c.whatsapp || "",
        amount: Number((-1 * Number(cn.total_amount || 0)).toFixed(2)),
        status: cn.status || "",
      });
    }

    const reps = Array.from(
      new Set(tx.map((r) => String(r.sales_rep || "").trim()).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b));

    const rows = reps.map((rep) => {
      const repRows = tx
        .filter((r) => String(r.sales_rep || "").trim() === rep)
        .sort((a, b) => {
          const d = String(a.tx_date).localeCompare(String(b.tx_date));
          if (d !== 0) return d;
          return String(a.doc_no).localeCompare(String(b.doc_no));
        });

      const dayMap = new Map<string, any[]>();
      for (const row of repRows) {
        const k = String(row.tx_date);
        if (!dayMap.has(k)) dayMap.set(k, []);
        dayMap.get(k)!.push(row);
      }

      const days = Array.from(dayMap.entries()).map(([date, items]) => ({
        date,
        day_name: String(items[0]?.day_name || "").trim(),
        items: items.map((r: any, i: number) => ({
          no: i + 1,
          customer_name: r.customer_name,
          customer_address: r.customer_address,
          mobile_no: r.mobile_no,
          doc_no: r.doc_no,
          source_type: r.source_type,
          amount: Number(r.amount || 0),
          status: r.status,
        })),
      }));

      const totalAmount = Number(repRows.reduce((s: number, r: any) => s + Number(r.amount || 0), 0).toFixed(2));

      return {
        sales_rep: rep,
        days,
        total_amount: totalAmount,
      };
    });

    return res.json({
      ok: true,
      mode: "sales_rep_summary",
      month,
      from,
      to,
      rows,
    });
  } catch (err: any) {
    console.error("GET /summary/sales-reps failed:", err);
    return res.status(500).json({
      ok: false,
      error: err?.message || "Failed to load sales rep summary",
    });
  }
});

/* =========================================================
   CUSTOMER SUMMARY PRINT HTML
========================================================= */
router.get("/customers/print", async (req, res) => {
  try {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(req.query)) {
      if (v != null && String(v).trim() !== "") qs.set(k, String(v));
    }

    const base = buildBaseUrl(req);
    const apiRes = await fetch(`${base}/api/reports/summary/customers?${qs.toString()}`);
    const json: any = await apiRes.json();

    if (!json?.ok) {
      return res.status(400).send(json?.error || "Failed to load customer summary");
    }

    const blocks = ((json?.rows as any[]) || [])
      .map((group: any) => {
        const c = group.customer || {};
        const title = `${c.name || "Customer"} ${c.phone || c.whatsapp || ""} account transactions`;

        const rows = (group.items || [])
          .map(
            (r: any) => `
              <tr>
                <td>${r.no}</td>
                <td>${esc(r.tx_date)}</td>
                <td>${esc(r.particular)}</td>
                <td class="num">${money(r.debit)}</td>
                <td class="num">${money(r.credit)}</td>
                <td class="num">${money(r.balance)}</td>
              </tr>
            `
          )
          .join("");

        return `
          <section class="report-card">
            <div class="title">${esc(title)}</div>
            <table>
              <thead>
                <tr>
                  <th>No</th>
                  <th>Date</th>
                  <th>Particular</th>
                  <th>Debit</th>
                  <th>Credit</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                ${rows}
                <tr class="band">
                  <td colspan="3">Total</td>
                  <td class="num">${money(group.totals?.debit)}</td>
                  <td class="num">${money(group.totals?.credit)}</td>
                  <td></td>
                </tr>
                <tr class="band">
                  <td colspan="5">Balance</td>
                  <td class="num">${money(group.totals?.balance)}</td>
                </tr>
              </tbody>
            </table>
          </section>
        `;
      })
      .join("");

    res.setHeader("content-type", "text/html; charset=utf-8");
    res.send(`
      <!doctype html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Customer Summary Report</title>
        <style>
          @page { size: A4; margin: 10mm; }
          body { font-family: Arial, Helvetica, sans-serif; margin: 0; color: #111; }
          .report-card { margin-bottom: 32px; page-break-after: always; }
          .report-card:last-child { page-break-after: auto; }
          .title {
            background: #51459a;
            color: #fff;
            font-size: 24px;
            font-weight: 700;
            text-align: center;
            padding: 10px 12px;
            margin-bottom: 0;
          }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #222; padding: 8px 10px; font-size: 14px; }
          th { background: #51459a; color: #fff; }
          .num { text-align: right; }
          .band td { background: #51459a; color: #fff; font-weight: 700; }
        </style>
      </head>
      <body>${blocks}</body>
      </html>
    `);
  } catch (err: any) {
    console.error("GET /summary/customers/print failed:", err);
    res.status(500).send(err?.message || "Failed to print customer summary");
  }
});

/* =========================================================
   SALES REP SUMMARY PRINT HTML
========================================================= */
router.get("/sales-reps/print", async (req, res) => {
  try {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(req.query)) {
      if (v != null && String(v).trim() !== "") qs.set(k, String(v));
    }

    const base = buildBaseUrl(req);
    const apiRes = await fetch(`${base}/api/reports/summary/sales-reps?${qs.toString()}`);
    const json: any = await apiRes.json();

    if (!json?.ok) {
      return res.status(400).send(json?.error || "Failed to load sales rep summary");
    }

    const blocks = ((json?.rows as any[]) || [])
      .map((group: any) => {
        const daysHtml = (group.days || [])
          .map(
            (d: any, i: number) => `
              <tr class="day-row">
                <td colspan="7">${i + 1} ${esc(d.date)} ${esc(d.day_name)}</td>
              </tr>
              ${(d.items || [])
                .map(
                  (r: any) => `
                    <tr>
                      <td>${r.no}</td>
                      <td>${esc(r.customer_name)}</td>
                      <td>${esc(r.customer_address)}</td>
                      <td>${esc(r.mobile_no)}</td>
                      <td>${esc(r.doc_no)}</td>
                      <td class="num">${money(r.amount)}</td>
                      <td>${esc(r.source_type)}</td>
                    </tr>
                  `
                )
                .join("")}
            `
          )
          .join("");

        return `
          <section class="report-card">
            <div class="title">DAILY SALES RECORD - ${esc(group.sales_rep)}</div>
            <table>
              <thead>
                <tr>
                  <th>SN</th>
                  <th>Customer Name</th>
                  <th>Address</th>
                  <th>Mobile No</th>
                  <th>Doc No</th>
                  <th>Amount</th>
                  <th>Type</th>
                </tr>
              </thead>
              <tbody>
                ${daysHtml}
                <tr class="total-row">
                  <td colspan="5">TOTAL</td>
                  <td class="num">${money(group.total_amount)}</td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </section>
        `;
      })
      .join("");

    res.setHeader("content-type", "text/html; charset=utf-8");
    res.send(`
      <!doctype html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Sales Rep Summary Report</title>
        <style>
          @page { size: A4; margin: 10mm; }
          body { font-family: Arial, Helvetica, sans-serif; margin: 0; color: #111; }
          .report-card { margin-bottom: 32px; page-break-after: always; }
          .report-card:last-child { page-break-after: auto; }
          .title {
            font-size: 22px;
            font-weight: 700;
            text-align: center;
            margin-bottom: 10px;
          }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #222; padding: 7px 8px; font-size: 13px; }
          th { background: #f3f3f3; }
          .day-row td { background: #fafafa; font-weight: 700; }
          .num { text-align: right; }
          .total-row td { font-weight: 700; }
        </style>
      </head>
      <body>${blocks}</body>
      </html>
    `);
  } catch (err: any) {
    console.error("GET /summary/sales-reps/print failed:", err);
    res.status(500).send(err?.message || "Failed to print sales rep summary");
  }
});

/* =========================================================
   TRUE PDF DOWNLOAD ROUTES
========================================================= */
router.get("/customers/pdf", async (req, res) => {
  try {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(req.query)) {
      if (v != null && String(v).trim() !== "") qs.set(k, String(v));
    }

    const base = buildBaseUrl(req);
    const url = `${base}/api/reports/summary/customers/print?${qs.toString()}`;
    const pdf = await renderPdfFromUrl(url);

    const month = String(req.query.month || "report").trim() || "report";
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="customer-summary-${month}.pdf"`);
    res.send(pdf);
  } catch (err: any) {
    console.error("GET /summary/customers/pdf failed:", err);
    res.status(500).json({
      ok: false,
      error: err?.message || "Failed to generate customer PDF",
    });
  }
});

router.get("/sales-reps/pdf", async (req, res) => {
  try {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(req.query)) {
      if (v != null && String(v).trim() !== "") qs.set(k, String(v));
    }

    const base = buildBaseUrl(req);
    const url = `${base}/api/reports/summary/sales-reps/print?${qs.toString()}`;
    const pdf = await renderPdfFromUrl(url);

    const month = String(req.query.month || "report").trim() || "report";
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="sales-rep-summary-${month}.pdf"`);
    res.send(pdf);
  } catch (err: any) {
    console.error("GET /summary/sales-reps/pdf failed:", err);
    res.status(500).json({
      ok: false,
      error: err?.message || "Failed to generate sales rep PDF",
    });
  }
});

export default router;