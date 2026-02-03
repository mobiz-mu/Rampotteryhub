import React, { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

export default function QrApprove() {
  const [sp] = useSearchParams();
  const token = useMemo(() => sp.get("token") || "", [sp]);

  const [phone, setPhone] = useState("+230");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function approve(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);

    try {
      const r = await fetch("/api/qr/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, phone: phone.trim(), username: "admin" }),
      });

      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "Failed to approve");
      setDone(true);
    } catch (e: any) {
      setErr(e?.message || "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-5 bg-background text-foreground">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-6 shadow-premium">
        <div className="text-xl font-semibold">Approve Login</div>
        <div className="text-sm text-muted-foreground mt-1">
          This will sign in your desktop session.
        </div>

        {!token ? (
          <div className="mt-4 text-sm text-destructive">Missing token.</div>
        ) : done ? (
          <div className="mt-5 rounded-xl border border-success/30 bg-success/10 px-3 py-3 text-sm text-success">
            Approved ✅ You can return to your desktop.
          </div>
        ) : (
          <form onSubmit={approve} className="mt-5 space-y-4">
            <div>
              <label className="text-sm font-medium">Phone</label>
              <input
                className="mt-1 w-full rounded-xl border bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-ring"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+2307788884"
                required
              />
              <div className="text-xs text-muted-foreground mt-1">Example: +2307788884</div>
            </div>

            {err && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {err}
              </div>
            )}

            <button
              disabled={busy}
              className="w-full rounded-xl px-4 py-2 font-medium text-primary-foreground gradient-primary shadow-glow disabled:opacity-60"
              type="submit"
            >
              {busy ? "Approving..." : "Approve"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
