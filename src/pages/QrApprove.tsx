import React, { useMemo, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

function normalizePhone(input: string) {
  // keep + and digits only
  const v = String(input || "").trim().replace(/[^\d+]/g, "");
  return v;
}

function isPhoneLikelyValid(phone: string) {
  // very light validation: must start with + and have at least 8 digits
  const p = normalizePhone(phone);
  if (!p.startsWith("+")) return false;
  const digits = p.replace(/\D/g, "");
  return digits.length >= 8;
}

async function safeReadJson(res: Response) {
  const text = await res.text();
  try {
    return { ok: true, json: JSON.parse(text), raw: text };
  } catch {
    return { ok: false, json: null as any, raw: text };
  }
}

export default function QrApprove() {
  const [sp] = useSearchParams();
  const nav = useNavigate();

  const token = useMemo(() => sp.get("token") || "", [sp]);

  const [phone, setPhone] = useState("+230");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function approve(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);

    if (!token) {
      setErr("Missing token. Please re-scan the QR code from your desktop.");
      return;
    }

    const p = normalizePhone(phone);
    if (!isPhoneLikelyValid(p)) {
      setErr("Please enter a valid phone number (example: +2307788884).");
      return;
    }

    setBusy(true);
    try {
      const r = await fetch("/api/qr/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          phone: p,
          // keep if your API needs it; otherwise remove it
          username: "admin",
        }),
      });

      const parsed = await safeReadJson(r);

      // If API returned HTML / non-JSON, show helpful error
      if (!parsed.ok) {
        throw new Error(
          `Approve failed (HTTP ${r.status}). Server returned non-JSON response. ` +
            `This usually means your /api route is not configured in Vite proxy.`
        );
      }

      const j = parsed.json;

      if (!r.ok || !j?.ok) {
        throw new Error(j?.error || `Approve failed (HTTP ${r.status})`);
      }

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
          <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-3 text-sm text-destructive">
            Missing token. Please re-scan the QR code from your desktop.
          </div>
        ) : done ? (
          <div className="mt-5 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-3 text-sm text-emerald-700 dark:text-emerald-300">
            Approved ✅ You can return to your desktop.
            <div className="mt-3 flex gap-2">
              <Button variant="outline" onClick={() => nav("/dashboard")}>
                Go to Dashboard
              </Button>
              <Button onClick={() => window.close()} className="gradient-primary shadow-glow">
                Close
              </Button>
            </div>
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
                inputMode="tel"
                autoComplete="tel"
              />
              <div className="text-xs text-muted-foreground mt-1">Example: +2307788884</div>
            </div>

            {err && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive whitespace-pre-wrap">
                {err}
              </div>
            )}

            <Button
              disabled={busy}
              className="w-full gradient-primary shadow-glow"
              type="submit"
            >
              {busy ? "Approving..." : "Approve"}
            </Button>

            <div className="text-xs text-muted-foreground">
              If this fails with “non-JSON response”, your Vite dev server is not proxying <b>/api</b>.
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
