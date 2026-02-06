// supabase/functions/invoice-pdf/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

serve(async (req) => {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id")?.trim() || "";
    const t = url.searchParams.get("t")?.trim() || "";

    if (!id) return new Response("Missing id", { status: 400 });
    if (!t) return new Response("Missing token", { status: 401 });

    // Your Vercel endpoint:
    const VERCEL_PDF_ORIGIN = Deno.env.get("VERCEL_PDF_ORIGIN") || "https://rampotteryhub.com";
    const pdfUrl = `${VERCEL_PDF_ORIGIN}/api/invoices/${encodeURIComponent(id)}/pdf?t=${encodeURIComponent(t)}`;

    const r = await fetch(pdfUrl, { headers: { accept: "application/pdf" } });
    if (!r.ok) {
      const msg = await r.text();
      return new Response(msg || "Failed to fetch PDF", { status: r.status });
    }

    const pdf = await r.arrayBuffer();

    return new Response(pdf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="Invoice-${id}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    return new Response(e?.message || "Edge PDF error", { status: 500 });
  }
});
