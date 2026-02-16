import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

import {
  Landmark,
  Receipt,
  FileText,
  RefreshCw,
  Users,
  AlertTriangle,
  ChevronRight,
} from "lucide-react";

type ApKpis = {
  total_payables: number;
  total_outstanding: number;
  open_bills: number;
  partial_bills: number;
  paid_bills: number;
  overdue_amount: number;
  active_suppliers: number;
};

type AgingSummary = {
  total: number;
  b0_30: number;
  b31_60: number;
  b61_90: number;
  b90p: number;
};

type ExposureRow = {
  supplier_id: number;
  supplier_name: string;
  balance: number;
  total_outstanding: number;
  bucket_90_plus: number;
};

function n0(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function money(v: any) {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return "0.00";
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function StatCard({
  icon,
  label,
  value,
  sub,
  tone = "muted",
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "muted" | "ok" | "bad" | "warn";
}) {
  const ring =
    tone === "ok"
      ? "ring-emerald-500/20 bg-emerald-500/5"
      : tone === "bad"
      ? "ring-red-500/20 bg-red-500/5"
      : tone === "warn"
      ? "ring-amber-500/20 bg-amber-500/5"
      : "ring-border bg-muted/10";

  return (
    <Card className={`p-3 shadow-premium ring-1 ${ring}`}>
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-xl bg-background ring-1 ring-border flex items-center justify-center">
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-[11px] text-muted-foreground">{label}</div>
          <div className="text-sm font-semibold truncate">{value}</div>
          {sub ? <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{sub}</div> : null}
        </div>
      </div>
    </Card>
  );
}

function MiniBar({ value, max }: { value: number; max: number }) {
  const pct = max <= 0 ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="h-2 rounded-full bg-muted/30 overflow-hidden">
      <div className="h-2 rounded-full bg-primary" style={{ width: `${pct}%` }} />
    </div>
  );
}

async function getApKpis(): Promise<ApKpis> {
  const { data, error } = await supabase.from("v_ap_kpis").select("*").maybeSingle();
  if (error) throw error;
  const d: any = data || {};
  return {
    total_payables: n0(d.total_payables),
    total_outstanding: n0(d.total_outstanding),
    open_bills: n0(d.open_bills),
    partial_bills: n0(d.partial_bills),
    paid_bills: n0(d.paid_bills),
    overdue_amount: n0(d.overdue_amount),
    active_suppliers: n0(d.active_suppliers),
  };
}

async function getAgingSummary(): Promise<AgingSummary> {
  const { data, error } = await supabase
    .from("v_supplier_aging")
    .select("total_outstanding,bucket_0_30,bucket_31_60,bucket_61_90,bucket_90_plus")
    .limit(5000);
  if (error) throw error;

  const sum: AgingSummary = { total: 0, b0_30: 0, b31_60: 0, b61_90: 0, b90p: 0 };
  for (const r of data || []) {
    const x: any = r;
    sum.total += n0(x.total_outstanding);
    sum.b0_30 += n0(x.bucket_0_30);
    sum.b31_60 += n0(x.bucket_31_60);
    sum.b61_90 += n0(x.bucket_61_90);
    sum.b90p += n0(x.bucket_90_plus);
  }
  return sum;
}

async function listTopExposure(limit = 10): Promise<ExposureRow[]> {
  const { data, error } = await supabase
    .from("v_ap_top_exposure_suppliers")
    .select("supplier_id,supplier_name,balance,total_outstanding,bucket_90_plus")
    .order("balance", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).map((r: any) => ({
    supplier_id: Number(r.supplier_id),
    supplier_name: String(r.supplier_name || ""),
    balance: n0(r.balance),
    total_outstanding: n0(r.total_outstanding),
    bucket_90_plus: n0(r.bucket_90_plus),
  }));
}

export default function APDashboard() {
  const nav = useNavigate();
  const qc = useQueryClient();

  const kpisQ = useQuery({ queryKey: ["apKpis"], queryFn: getApKpis, staleTime: 12_000 });
  const agingQ = useQuery({ queryKey: ["apAgingSummary"], queryFn: getAgingSummary, staleTime: 30_000 });
  const exposureQ = useQuery({ queryKey: ["apTopExposure"], queryFn: () => listTopExposure(10), staleTime: 12_000 });

  const maxAging = useMemo(() => {
    const a = agingQ.data;
    if (!a) return 1;
    return Math.max(a.b0_30, a.b31_60, a.b61_90, a.b90p, 1);
  }, [agingQ.data]);

  const maxExposure = useMemo(() => {
    const list = exposureQ.data || [];
    return Math.max(...list.map((x) => x.balance), 1);
  }, [exposureQ.data]);

  return (
    <div className="space-y-5 pb-10">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="space-y-1">
          <div className="text-2xl font-semibold tracking-tight">AP Dashboard (CFO)</div>
          <div className="text-sm text-muted-foreground">Payables • Exposure • Aging • Quick actions</div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => nav("/suppliers")}>
            <Users className="h-4 w-4 mr-2" />
            Suppliers
          </Button>
          <Button variant="outline" onClick={() => nav("/ap/bills")}>
            <FileText className="h-4 w-4 mr-2" />
            Bills
          </Button>
          <Button variant="outline" onClick={() => nav("/ap/payments")}>
            <Receipt className="h-4 w-4 mr-2" />
            Payments
          </Button>
          <Button className="gradient-primary shadow-glow text-primary-foreground" onClick={() => nav("/suppliers?open=new")}>
            + New Supplier
          </Button>
          <Button
            variant="outline"
            onClick={async () => {
              await qc.invalidateQueries({ queryKey: ["apKpis"], exact: false });
              await qc.invalidateQueries({ queryKey: ["apAgingSummary"], exact: false });
              await qc.invalidateQueries({ queryKey: ["apTopExposure"], exact: false });
              toast.success("Refreshed");
            }}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        <StatCard icon={<Landmark className="h-4 w-4 text-muted-foreground" />} label="Total Payables" value={`Rs ${money(kpisQ.data?.total_payables ?? 0)}`} sub="Balance across suppliers" />
        <StatCard icon={<Receipt className="h-4 w-4 text-muted-foreground" />} label="Outstanding" value={`Rs ${money(kpisQ.data?.total_outstanding ?? 0)}`} sub="Open + partial bills" />
        <StatCard icon={<AlertTriangle className="h-4 w-4 text-amber-700" />} label="Overdue" value={`Rs ${money(kpisQ.data?.overdue_amount ?? 0)}`} sub="Past due_date" tone="warn" />
        <StatCard icon={<Users className="h-4 w-4 text-muted-foreground" />} label="Active Suppliers" value={kpisQ.data?.active_suppliers ?? 0} sub="Supplier master" tone="ok" />
        <StatCard icon={<FileText className="h-4 w-4 text-muted-foreground" />} label="Bills Status" value={`${kpisQ.data?.open_bills ?? 0} open • ${kpisQ.data?.partial_bills ?? 0} partial`} sub={`${kpisQ.data?.paid_bills ?? 0} paid`} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="p-4 shadow-premium">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">Aging Buckets</div>
            <Button variant="outline" size="sm" onClick={() => nav("/suppliers")}>
              Open Aging <ChevronRight className="h-4 w-4 ml-2" />
            </Button>
          </div>

          <div className="mt-3 space-y-3">
            <div className="rounded-xl border bg-muted/10 p-3">
              <div className="text-[11px] text-muted-foreground">Total Outstanding</div>
              <div className="text-lg font-semibold">Rs {money(agingQ.data?.total ?? 0)}</div>
            </div>

            {[
              { label: "0–30", v: agingQ.data?.b0_30 ?? 0 },
              { label: "31–60", v: agingQ.data?.b31_60 ?? 0 },
              { label: "61–90", v: agingQ.data?.b61_90 ?? 0 },
              { label: "90+", v: agingQ.data?.b90p ?? 0 },
            ].map((b) => (
              <div key={b.label} className="rounded-xl border bg-muted/10 p-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">{b.label}</div>
                  <div className="text-sm font-semibold">Rs {money(b.v)}</div>
                </div>
                <div className="mt-2">
                  <MiniBar value={n0(b.v)} max={maxAging} />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-4 shadow-premium">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">Top Exposure Suppliers</div>
            <Button variant="outline" size="sm" onClick={() => nav("/suppliers")}>
              Open Register <ChevronRight className="h-4 w-4 ml-2" />
            </Button>
          </div>

          <div className="mt-3 space-y-2">
            {(exposureQ.data || []).length === 0 ? (
              <div className="text-sm text-muted-foreground py-6">No exposure data yet.</div>
            ) : (
              (exposureQ.data || []).map((x) => (
                <div key={x.supplier_id} className="rounded-xl border bg-muted/10 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{x.supplier_name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        Outstanding: <b>Rs {money(x.total_outstanding)}</b>
                        {x.bucket_90_plus > 0 ? (
                          <>
                            {" "}
                            • 90+: <b className="text-amber-700">Rs {money(x.bucket_90_plus)}</b>
                          </>
                        ) : null}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold">Rs {money(x.balance)}</div>
                    </div>
                  </div>
                  <div className="mt-3">
                    <MiniBar value={x.balance} max={maxExposure} />
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
