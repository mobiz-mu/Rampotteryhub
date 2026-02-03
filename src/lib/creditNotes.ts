// src/lib/creditNotes.ts
import { rpFetch } from "@/lib/rpFetch";

export type CreditNoteStatus = "ISSUED" | "PENDING" | "REFUNDED" | "VOID";

export type CreditNoteRow = {
  id: number;
  credit_note_number: string | null;
  credit_note_date: string | null;
  total_amount: number | string | null;
  status: string | null;
  customers?:
    | { name?: string | null; customer_code?: string | null }
    | { name?: string | null; customer_code?: string | null }[]
    | null;
};

export type AuditLogRow = {
  id: number;
  created_at: string;
  actor: any | null;
  action: string;
  entity_table: string;
  entity_id: number;
  meta: any | null;
};

export function normalizeCustomer(c: CreditNoteRow["customers"]) {
  if (!c) return null;
  if (Array.isArray(c)) return (c[0] as any) || null;
  return c as any;
}

export function normalizeCreditStatus(s?: any): CreditNoteStatus {
  const v = String(s || "").toUpperCase();
  if (v === "VOID") return "VOID";
  if (v === "REFUNDED") return "REFUNDED";
  if (v === "PENDING") return "PENDING";
  return "ISSUED";
}

export async function listCreditNotes(args: { q?: string; status?: "ALL" | CreditNoteStatus; limit?: number }) {
  const res = await rpFetch("/api/credit-notes", { method: "GET" });
  const json = await res.json().catch(() => ({}));

  if (!res.ok || json?.ok === false) throw new Error(json?.error || "Failed to load credit notes");

  let rows: CreditNoteRow[] = Array.isArray(json?.creditNotes) ? json.creditNotes : [];

  const q = String(args.q || "").trim().toLowerCase();
  const st = args.status || "ALL";

  rows = rows.filter((r) => {
    const s = normalizeCreditStatus(r.status);
    if (st !== "ALL" && s !== st) return false;

    if (!q) return true;
    const c = normalizeCustomer(r.customers);
    const hay = [
      r.credit_note_number || "",
      r.credit_note_date || "",
      r.status || "",
      c?.name || "",
      c?.customer_code || "",
    ]
      .join(" ")
      .toLowerCase();

    return hay.includes(q);
  });

  if (args.limit && args.limit > 0) rows = rows.slice(0, args.limit);
  rows.sort((a, b) => Number(b.id || 0) - Number(a.id || 0));
  return rows;
}

export async function voidCreditNote(creditNoteId: number) {
  const res = await rpFetch(`/api/credit-notes/${creditNoteId}/void`, { method: "POST" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.ok === false) throw new Error(json?.error || "Failed to void credit note");
  return json;
}

export async function refundCreditNote(creditNoteId: number, note?: string) {
  const res = await rpFetch(`/api/credit-notes/${creditNoteId}/refund`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ note: note || null }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.ok === false) throw new Error(json?.error || "Failed to refund credit note");
  return json;
}

export async function restoreCreditNote(creditNoteId: number) {
  const res = await rpFetch(`/api/credit-notes/${creditNoteId}/restore`, { method: "POST" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.ok === false) throw new Error(json?.error || "Failed to restore credit note");
  return json;
}

/** ✅ New: fetch audit logs */
export async function getAuditLogs(args: { entity: string; id: number }) {
  const qs = new URLSearchParams({ entity: args.entity, id: String(args.id) }).toString();
  const res = await rpFetch(`/api/audit?${qs}`, { method: "GET" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.ok === false) throw new Error(json?.error || "Failed to load audit logs");
  return (Array.isArray(json?.logs) ? json.logs : []) as AuditLogRow[];
}

