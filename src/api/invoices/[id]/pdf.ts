// api/invoices/[id]/pdf.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { chromium } from "playwright";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const id = String(req.query.id || "").trim();
    const t = String(req.query.t || "").trim();
    if (!id) return res.status(400).send("Missing invoice id");
    if (!t) return res.status(401).send("Missing token");

    // Your public print page URL (same domain)
    const origin =
      (req.headers["x-forwarded-proto"] ? `${req.headers["x-forwarded-proto"]}://` : "https://") +
      (req.headers.host || "rampotteryhub.com");

    const url = `${origin}/invoices/${encodeURIComponent(id)}/print?t=${encodeURIComponent(t)}`;

    const browser = await chromium.launch({ args: ["--no-sandbox"] });
    const page = await browser.newPage();

    // Load fully
    await page.goto(url, { waitUntil: "networkidle" });

    // Generate PDF
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "18mm", right: "8mm", bottom: "14mm", left: "8mm" },

      // ✅ Perfect page numbering (always works)
      displayHeaderFooter: true,
      headerTemplate: `
        <div style="font-size:10px;width:100%;text-align:right;padding-right:10mm;color:#666;">
        </div>
      `,
      footerTemplate: `
        <div style="font-size:10px;width:100%;text-align:center;color:#444;">
          Page <span class="pageNumber"></span> of <span class="totalPages"></span>
        </div>
      `,
    });

    await browser.close();

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="Invoice-${id}.pdf"`);
    return res.status(200).send(pdf);
  } catch (e: any) {
    console.error(e);
    return res.status(500).send(e?.message || "PDF generation failed");
  }
}
