// src/pages/CustomersNew.tsx
import React, { useMemo, useRef, useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

import {
  ArrowLeft,
  Save,
  UserPlus,
  Pencil,
  ShieldCheck,
  Building2,
  MapPin,
  AlertTriangle,
  CheckCircle2,
  Hash,
} from "lucide-react";

function n(v: any) {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}
function digitsOnly(v: any) {
  return String(v ?? "").replace(/[^\d]/g, "");
}
function normalizeMuPhone(raw: any) {
  const d = digitsOnly(raw);
  if (d.length === 8) return d;
  if (d.startsWith("230") && d.length === 11) return d.slice(3);
  return d;
}
function normText(v: any) {
  return String(v ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}
function cleanText(v: any) {
  return String(v ?? "").trim();
}
function identityModeOf(brn: any, name: any, address: any) {
  if (cleanText(brn)) return "BRN";
  if (cleanText(name) && cleanText(address)) return "NAME_ADDRESS";
  return "INCOMPLETE";
}
function identityKeyOf(brn: any, name: any, address: any) {
  const brnKey = normText(brn);
  if (brnKey) return `BRN:${brnKey}`;

  const nameKey = normText(name);
  const addrKey = normText(address);
  if (nameKey && addrKey) return `NAMEADDR:${nameKey}__${addrKey}`;

  return "";
}
function identityLabelOf(brn: any, name: any, address: any) {
  const brnText = cleanText(brn);
  if (brnText) return `BRN • ${brnText}`;

  const nameText = cleanText(name);
  const addrText = cleanText(address);
  if (nameText || addrText) return `${nameText || "No Name"} • ${addrText || "No Address"}`;

  return "Incomplete identity";
}

export default function CustomersNew() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { id } = useParams();

  const customerId = Number(id);
  const isEdit = Number.isFinite(customerId) && customerId > 0;

  // form state
  const [customer_code, setCustomerCode] = useState("");
  const [name, setName] = useState("");
  const [client_name, setClientName] = useState("");

  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");

  const [brn, setBrn] = useState("");
  const [vat_no, setVatNo] = useState("");

  const [discount_percent, setDiscountPercent] = useState<string>("0");
  const [opening_balance, setOpeningBalance] = useState<string>("0");

  const nameRef = useRef<HTMLInputElement | null>(null);

  const canSave = useMemo(() => name.trim().length > 0, [name]);

  const identityMode = useMemo(
    () => identityModeOf(brn, name, address),
    [brn, name, address]
  );

  const identityKey = useMemo(
    () => identityKeyOf(brn, name, address),
    [brn, name, address]
  );

  const identityLabel = useMemo(
    () => identityLabelOf(brn, name, address),
    [brn, name, address]
  );

  // Load customer when editing
  const customerQ = useQuery({
    queryKey: ["customer", customerId],
    enabled: isEdit,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .eq("id", customerId)
        .single();
      if (error) throw error;
      return data as any;
    },
    staleTime: 30_000,
  });

  // Load all customers for duplicate identity check
  const existingCustomersQ = useQuery({
    queryKey: ["customers", "identity-check-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, customer_code, name, client_name, address, brn, vat_no, phone, whatsapp, is_active")
        .order("name", { ascending: true });

      if (error) throw error;
      return (data || []) as any[];
    },
    staleTime: 30_000,
  });

  // Prefill when data arrives
  useEffect(() => {
    if (!isEdit) return;

    if (customerQ.isSuccess && customerQ.data) {
      const c: any = customerQ.data;

      setCustomerCode(c.customer_code ?? "");
      setName(c.name ?? "");
      setClientName(c.client_name ?? "");

      setPhone(c.phone ?? "");
      setWhatsapp(c.whatsapp ?? "");
      setEmail(c.email ?? "");
      setAddress(c.address ?? "");

      setBrn(c.brn ?? "");
      setVatNo(c.vat_no ?? "");

      setDiscountPercent(String(n(c.discount_percent ?? 0)));
      setOpeningBalance(String(n(c.opening_balance ?? 0)));

      setTimeout(() => nameRef.current?.focus(), 0);
    }
  }, [isEdit, customerQ.isSuccess, customerQ.data]);

  const duplicateMatches = useMemo(() => {
    const rows = existingCustomersQ.data || [];
    const currentKey = identityKey;

    if (!currentKey) return [];

    return rows.filter((r: any) => {
      if (isEdit && Number(r.id) === customerId) return false;

      const rowKey = identityKeyOf(r.brn, r.name, r.address);
      return rowKey === currentKey;
    });
  }, [existingCustomersQ.data, identityKey, isEdit, customerId]);

  const sameNameOtherAccounts = useMemo(() => {
    const rows = existingCustomersQ.data || [];
    const currentName = normText(name);
    if (!currentName) return [];

    return rows.filter((r: any) => {
      if (isEdit && Number(r.id) === customerId) return false;
      return normText(r.name) === currentName;
    });
  }, [existingCustomersQ.data, name, isEdit, customerId]);

  const duplicateBlocked = duplicateMatches.length > 0;
  const identityIncomplete = identityMode === "INCOMPLETE";

  const saveM = useMutation({
    mutationFn: async () => {
      const trimmedName = cleanText(name);
      const trimmedAddress = cleanText(address);
      const trimmedBrn = cleanText(brn);

      if (!trimmedName) throw new Error("Customer Name is required");

      // identity validation
      if (!trimmedBrn && !trimmedAddress) {
        throw new Error("For customers without BRN, Address is required to keep accounts separate.");
      }

      // live duplicate check against latest loaded set
      const latestRows = existingCustomersQ.data || [];
      const candidateKey = identityKeyOf(trimmedBrn, trimmedName, trimmedAddress);

      const conflict = latestRows.find((r: any) => {
        if (isEdit && Number(r.id) === customerId) return false;
        return identityKeyOf(r.brn, r.name, r.address) === candidateKey;
      });

      if (conflict) {
        const conflictLabel = identityLabelOf(conflict.brn, conflict.name, conflict.address);
        throw new Error(`Duplicate customer account detected: ${conflictLabel}`);
      }

      const payload: any = {
        customer_code: cleanText(customer_code) || null,
        name: trimmedName,
        client_name: cleanText(client_name) || null,

        phone: cleanText(phone) ? normalizeMuPhone(phone) : null,
        whatsapp: cleanText(whatsapp) ? normalizeMuPhone(whatsapp) : null,
        email: cleanText(email) || null,
        address: trimmedAddress || null,

        brn: trimmedBrn || null,
        vat_no: cleanText(vat_no) || null,

        discount_percent: n(discount_percent),
        opening_balance: n(opening_balance),
      };

      if (isEdit) {
        const { data, error } = await supabase
          .from("customers")
          .update(payload)
          .eq("id", customerId)
          .select("id")
          .single();

        if (error) throw error;
        return { mode: "edit", row: data };
      } else {
        const { data, error } = await supabase
          .from("customers")
          .insert({ ...payload, is_active: true })
          .select("id")
          .single();

        if (error) throw error;
        return { mode: "create", row: data };
      }
    },
    onSuccess: async (res: any) => {
      toast.success(res?.mode === "edit" ? "Customer updated" : "Customer created");
      await qc.invalidateQueries({ queryKey: ["customers"], exact: false });
      await qc.invalidateQueries({ queryKey: ["customers", "identity-check-all"], exact: false });
      if (isEdit) qc.invalidateQueries({ queryKey: ["customer", customerId], exact: true });
      nav("/customers");
    },
    onError: (e: any) =>
      toast.error(e?.message || (isEdit ? "Failed to update customer" : "Failed to create customer")),
  });

  const busy = saveM.isPending || (isEdit && customerQ.isLoading);

  return (
    <div className="space-y-6 pb-10">
      {/* premium subtle backdrop */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-b from-slate-50 via-white to-slate-50 dark:from-slate-950 dark:via-slate-950 dark:to-slate-950" />
        <div className="absolute -top-48 -left-48 h-[520px] w-[520px] rounded-full bg-rose-500/10 blur-3xl" />
        <div className="absolute -top-48 -right-48 h-[520px] w-[520px] rounded-full bg-sky-500/10 blur-3xl" />
      </div>

      {/* header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-primary/10 border border-white/30 dark:border-white/10 flex items-center justify-center">
            {isEdit ? <Pencil className="h-5 w-5 text-primary" /> : <UserPlus className="h-5 w-5 text-primary" />}
          </div>
          <div>
            <div className="text-2xl font-semibold tracking-tight">
              {isEdit ? "Edit Customer" : "New Customer"}
            </div>
            <div className="text-xs text-muted-foreground">
              {isEdit
                ? "Update customer profile with BRN-first separate-account logic"
                : "Create customer profile with BRN-first separate-account logic"}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => nav(-1)} disabled={busy}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>

          <Button
            className="gradient-primary shadow-glow text-primary-foreground"
            onClick={() => saveM.mutate()}
            disabled={!canSave || busy || (isEdit && !!customerQ.error) || duplicateBlocked || identityIncomplete}
          >
            <Save className="h-4 w-4 mr-2" />
            {busy ? "Saving..." : isEdit ? "Save Changes" : "Save Customer"}
          </Button>
        </div>
      </div>

      {isEdit && customerQ.isError ? (
        <Card className="p-4 border-white/30 bg-white/85 dark:bg-slate-950/40 dark:border-white/10">
          <div className="text-sm text-rose-600 font-semibold">Could not load this customer.</div>
          <div className="text-xs text-muted-foreground mt-1">
            {(customerQ.error as any)?.message || "Unknown error"}
          </div>
        </Card>
      ) : null}

      {/* identity preview */}
      <Card className="p-5 sm:p-6 border-white/30 bg-white/85 backdrop-blur shadow-[0_18px_40px_-22px_rgba(0,0,0,.35)] dark:bg-slate-950/40 dark:border-white/10">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3 min-w-0">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <div className="text-sm font-semibold">Account Identity Preview</div>
            </div>

            <div className="inline-flex max-w-full items-center gap-2 rounded-2xl border bg-slate-50 px-4 py-3 text-sm text-slate-700">
              {cleanText(brn) ? <Building2 className="h-4 w-4 shrink-0 text-sky-700" /> : <MapPin className="h-4 w-4 shrink-0 text-amber-700" />}
              <span className="truncate font-semibold">{identityLabel}</span>
            </div>

            <div className="text-xs text-muted-foreground">
              {identityMode === "BRN" ? (
                <>This account will be identified by <b>BRN</b>.</>
              ) : identityMode === "NAME_ADDRESS" ? (
                <>This account will be identified by <b>Name + Address</b> because BRN is empty.</>
              ) : (
                <>Identity is incomplete. Add <b>BRN</b> or at least <b>Address</b> with customer name.</>
              )}
            </div>

            <div className="text-[11px] text-slate-400 break-all">
              Key: {identityKey || "—"}
            </div>
          </div>

          <div className="w-full max-w-[520px] space-y-3">
            {identityIncomplete ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <div className="font-semibold">Incomplete account identity</div>
                    <div className="mt-1 text-xs">
                      If BRN is empty, Address is required so same-name customers remain separate accounts.
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {duplicateBlocked ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <div className="font-semibold">Duplicate account detected</div>
                    <div className="mt-1 text-xs">
                      Another customer already uses this same account identity.
                    </div>

                    <div className="mt-3 space-y-2">
                      {duplicateMatches.map((m: any) => (
                        <div key={m.id} className="rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs">
                          <div className="font-semibold text-slate-900">{m.name || "—"}</div>
                          <div className="text-slate-600">{identityLabelOf(m.brn, m.name, m.address)}</div>
                          <div className="text-slate-500">
                            Code: {m.customer_code || "—"} • VAT: {m.vat_no || "—"}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : !identityIncomplete ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <div className="font-semibold">Identity is valid</div>
                    <div className="mt-1 text-xs">
                      This customer can be saved as a separate account.
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {sameNameOtherAccounts.length > 0 ? (
              <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
                <div className="flex items-start gap-2">
                  <Hash className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <div className="font-semibold">Same-name accounts found</div>
                    <div className="mt-1 text-xs">
                      This is okay as long as BRN is different, or if no BRN then address is different.
                    </div>

                    <div className="mt-3 space-y-2 max-h-40 overflow-auto">
                      {sameNameOtherAccounts.slice(0, 8).map((m: any) => (
                        <div key={m.id} className="rounded-xl border border-sky-200 bg-white px-3 py-2 text-xs">
                          <div className="font-semibold text-slate-900">{m.name || "—"}</div>
                          <div className="text-slate-600">{identityLabelOf(m.brn, m.name, m.address)}</div>
                          <div className="text-slate-500">
                            Code: {m.customer_code || "—"} • VAT: {m.vat_no || "—"}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </Card>

      <Card className="p-5 sm:p-6 border-white/30 bg-white/85 backdrop-blur shadow-[0_18px_40px_-22px_rgba(0,0,0,.35)] dark:bg-slate-950/40 dark:border-white/10">
        <div className="grid gap-5 lg:grid-cols-2">
          {/* Left: identity */}
          <div className="space-y-4">
            <div className="text-[11px] font-extrabold tracking-[0.14em] uppercase text-muted-foreground">
              Identity
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <div className="text-xs font-semibold mb-1">Customer Code</div>
                <Input
                  placeholder="e.g. CUST400"
                  value={customer_code}
                  onChange={(e) => setCustomerCode(e.target.value)}
                  disabled={busy}
                />
                <div className="mt-1 text-[11px] text-muted-foreground">Optional</div>
              </div>

              <div>
                <div className="text-xs font-semibold mb-1">Client Name</div>
                <Input
                  placeholder="e.g. Shop name / client name"
                  value={client_name}
                  onChange={(e) => setClientName(e.target.value)}
                  disabled={busy}
                />
                <div className="mt-1 text-[11px] text-muted-foreground">Optional</div>
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold mb-1">
                Customer Name <span className="text-rose-600">*</span>
              </div>
              <Input
                ref={nameRef}
                placeholder="Customer full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={busy}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canSave && !busy && !duplicateBlocked && !identityIncomplete) {
                    saveM.mutate();
                  }
                }}
              />
            </div>

            <div>
              <div className="text-xs font-semibold mb-1">
                Address {!cleanText(brn) ? <span className="text-rose-600">*</span> : null}
              </div>
              <Input
                placeholder="Street, City, Mauritius"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                disabled={busy}
              />
              <div className="mt-1 text-[11px] text-muted-foreground">
                Required when BRN is empty.
              </div>
            </div>
          </div>

          {/* Right: contacts + compliance */}
          <div className="space-y-4">
            <div className="text-[11px] font-extrabold tracking-[0.14em] uppercase text-muted-foreground">
              Contacts & Compliance
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <div className="text-xs font-semibold mb-1">Phone</div>
                <Input
                  placeholder="e.g. 57850062"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={busy}
                />
              </div>
              <div>
                <div className="text-xs font-semibold mb-1">WhatsApp</div>
                <Input
                  placeholder="e.g. 57850062"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  disabled={busy}
                />
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold mb-1">Email</div>
              <Input
                placeholder="email@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={busy}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <div className="text-xs font-semibold mb-1">BRN</div>
                <Input
                  placeholder="BRN"
                  value={brn}
                  onChange={(e) => setBrn(e.target.value)}
                  disabled={busy}
                />
                <div className="mt-1 text-[11px] text-muted-foreground">
                  If BRN exists, it becomes the account identity key.
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold mb-1">VAT No</div>
                <Input
                  placeholder="VAT number"
                  value={vat_no}
                  onChange={(e) => setVatNo(e.target.value)}
                  disabled={busy}
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <div className="text-xs font-semibold mb-1">Discount %</div>
                <Input
                  inputMode="decimal"
                  placeholder="0"
                  value={discount_percent}
                  disabled={busy}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (/^\d*([.]\d{0,2})?$/.test(v)) setDiscountPercent(v);
                  }}
                  onBlur={() => setDiscountPercent(String(n(discount_percent)))}
                />
              </div>

              <div>
                <div className="text-xs font-semibold mb-1">Opening Balance</div>
                <Input
                  inputMode="decimal"
                  placeholder="0"
                  value={opening_balance}
                  disabled={busy}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (/^\d*([.]\d{0,2})?$/.test(v)) setOpeningBalance(v);
                  }}
                  onBlur={() => setOpeningBalance(n(opening_balance).toFixed(2))}
                />
              </div>
            </div>

            <div className="text-[11px] text-muted-foreground">
              Save will {isEdit ? "update" : "insert into"} <b>public.customers</b>
              {isEdit ? "." : " with "}
              {!isEdit ? (
                <>
                  <b>is_active = true</b>.
                </>
              ) : null}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}