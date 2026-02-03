import React, { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export default function SendDocToWhatsApp({
  phoneE164,
}: {
  phoneE164: string;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setBusy(true);
    setErr(null);

    try {
      // 1) upload to Supabase Storage
      const ext = file.name.split(".").pop() || "bin";
      const path = `uploads/${Date.now()}-${Math.random()
        .toString(16)
        .slice(2)}.${ext}`;

      const up = await supabase.storage.from("docs").upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });

      if (up.error) throw up.error;

      // 2) get public URL (works only if bucket is public)
      const { data } = supabase.storage.from("docs").getPublicUrl(path);
      const url = data.publicUrl;

      // 3) open WhatsApp with prefilled link
      const msg =
        `Hello 👋\n\nHere is the document:\n${url}\n\nSent from Ram Pottery Hub.`;
      const wa = `https://wa.me/${phoneE164}?text=${encodeURIComponent(msg)}`;
      window.open(wa, "_blank", "noreferrer");
    } catch (e: any) {
      setErr(e?.message || "Upload failed");
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="font-semibold">Send document via WhatsApp</div>
      <div className="text-sm text-muted-foreground mt-1">
        Upload a PDF/image → we generate a link → WhatsApp opens with the link ready to send.
      </div>

      <div className="mt-3 flex items-center gap-3">
        <label className="inline-flex cursor-pointer items-center rounded-xl bg-emerald-500 px-4 py-2 text-white font-medium">
          {busy ? "Uploading..." : "Choose file"}
          <input
            type="file"
            accept="application/pdf,image/*"
            className="hidden"
            onChange={onPickFile}
            disabled={busy}
          />
        </label>
      </div>

      {err && (
        <div className="mt-3 text-sm text-destructive">
          {err}
        </div>
      )}
    </div>
  );
}
