// src/pages/CustomersNew.tsx
import React, { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

import { ArrowLeft, Save, UserPlus } from "lucide-react";

function n(v: any) {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}
function digitsOnly(v: any) {
  return String(v ?? "").replace(/[^\d]/g, "");
}
function normalizeMuPhone(raw: any) {
  const d = digitsOnly(raw);
  if (d.length === 8) return d; // keep local; you store local numbers in DB
  if (d.startsWith("230") && d.length === 11) return d.slice(3);
  return d;
}

export default function CustomersNew() {
  const nav = useNavigate();
  const qc = useQueryClient();

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

  const createM = useMutation({
    mutationFn: async () => {
      const payload: any = {
        customer_code: customer_code.trim() || null,
        name: name.trim(),
        client_name: client_name.trim() || null,

        phone: phone.trim() ? normalizeMuPhone(phone) : null,
        whatsapp: whatsapp.trim() ? normalizeMuPhone(whatsapp) : null,
        email: email.trim() || null,
        address: address.trim() || null,

        brn: brn.trim() || null,
        vat_no: vat_no.trim() || null,

        discount_percent: n(discount_percent),
        opening_balance: n(opening_balance),

        is_active: true,
      };

      const { data, error } = await supabase.from("customers").insert(payload).select("id").single();
      if (error) throw error;
      return data;
    },
    onSuccess: async (row: any) => {
      toast.success("Customer created");
      await qc.invalidateQueries({ queryKey: ["customers"], exact: false });
      // go back to list (or to a customer view page later if you add it)
      nav("/customers");
      // optional: if you want to open a future detail page: nav(`/customers/${row.id}`);
    },
    onError: (e: any) => toast.error(e?.message || "Failed to create customer"),
  });

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
            <UserPlus className="h-5 w-5 text-primary" />
          </div>
          <div>
            <div className="text-2xl font-semibold tracking-tight">New Customer</div>
            <div className="text-xs text-muted-foreground">Create customer profile (VAT/BRN/WhatsApp/Discount)</div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => nav(-1)} disabled={createM.isPending}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>

          <Button
            className="gradient-primary shadow-glow text-primary-foreground"
            onClick={() => createM.mutate()}
            disabled={!canSave || createM.isPending}
          >
            <Save className="h-4 w-4 mr-2" />
            {createM.isPending ? "Saving..." : "Save Customer"}
          </Button>
        </div>
      </div>

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
                />
                <div className="mt-1 text-[11px] text-muted-foreground">Optional</div>
              </div>

              <div>
                <div className="text-xs font-semibold mb-1">Client Name</div>
                <Input
                  placeholder="e.g. Shop name / client name"
                  value={client_name}
                  onChange={(e) => setClientName(e.target.value)}
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
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canSave && !createM.isPending) createM.mutate();
                }}
              />
            </div>

            <div>
              <div className="text-xs font-semibold mb-1">Address</div>
              <Input
                placeholder="Street, City, Mauritius"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
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
                />
              </div>
              <div>
                <div className="text-xs font-semibold mb-1">WhatsApp</div>
                <Input
                  placeholder="e.g. 57850062"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                />
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold mb-1">Email</div>
              <Input
                placeholder="email@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <div className="text-xs font-semibold mb-1">BRN</div>
                <Input placeholder="BRN" value={brn} onChange={(e) => setBrn(e.target.value)} />
              </div>
              <div>
                <div className="text-xs font-semibold mb-1">VAT No</div>
                <Input placeholder="VAT number" value={vat_no} onChange={(e) => setVatNo(e.target.value)} />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <div className="text-xs font-semibold mb-1">Discount %</div>
                <Input
                  inputMode="decimal"
                  placeholder="0"
                  value={discount_percent}
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
                  onChange={(e) => {
                    const v = e.target.value;
                    if (/^\d*([.]\d{0,2})?$/.test(v)) setOpeningBalance(v);
                  }}
                  onBlur={() => setOpeningBalance(n(opening_balance).toFixed(2))}
                />
              </div>
            </div>

            <div className="text-[11px] text-muted-foreground">
              Save will insert into <b>public.customers</b> with <b>is_active = true</b>.
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
