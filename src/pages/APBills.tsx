import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

import {
  Plus,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Receipt,
  X,
  FileText,
} from "lucide-react";

/* =========================
   Helpers
========================= */

function n0(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function money(v: any) {
  const n = Number(v ?? 0);
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/* =========================
   DB
========================= */

async function listBillsPaged({ page, pageSize, q }: any) {
  const from = page * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("supplier_bills")
    .select("*", { count: "exact" })
    .order("bill_date", { ascending: false })
    .range(from, to);

  if (q?.trim()) {
    query = query.ilike("bill_no", `%${q.trim()}%`);
  }

  const { data, error, count } = await query;
  if (error) throw error;

  return {
    rows: data || [],
    total: count || 0,
  };
}

async function listAllocations(billId: number) {
  const { data, error } = await supabase
    .from("supplier_payment_allocations")
    .select("id,payment_id,amount_applied")
    .eq("bill_id", billId);

  if (error) throw error;
  return data || [];
}

async function recomputeBillStatus(billId: number) {
  const { data: bill } = await supabase
    .from("supplier_bills")
    .select("total_amount,status")
    .eq("id", billId)
    .single();

  if (!bill || bill.status === "VOID") return;

  const { data: allocs } = await supabase
    .from("supplier_payment_allocations")
    .select("amount_applied")
    .eq("bill_id", billId);

  let applied = 0;
  for (const a of allocs || []) {
    applied += n0(a.amount_applied);
  }

  let next = "OPEN";
  if (applied > 0 && applied < n0(bill.total_amount)) next = "PARTIALLY_PAID";
  if (applied >= n0(bill.total_amount)) next = "PAID";

  if (next !== bill.status) {
    await supabase
      .from("supplier_bills")
      .update({ status: next, updated_at: new Date().toISOString() })
      .eq("id", billId);
  }
}

/* =========================
   Page
========================= */

export default function APBills() {
  const nav = useNavigate();
  const qc = useQueryClient();

  const pageSize = 50;

  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);

  const [allocOpen, setAllocOpen] = useState(false);
  const [activeBill, setActiveBill] = useState<any>(null);

  const billsQ = useQuery({
    queryKey: ["apBillsPaged", q, page],
    queryFn: () => listBillsPaged({ q, page, pageSize }),
    keepPreviousData: true,
  });

  const rows = billsQ.data?.rows || [];
  const total = billsQ.data?.total || 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  const allocQ = useQuery({
    queryKey: ["billAlloc", activeBill?.id],
    enabled: !!activeBill?.id,
    queryFn: () => listAllocations(activeBill.id),
  });

  /* =========================
     UI
  ========================== */

  return (
    <div className="space-y-5 pb-10">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-3">
        <div>
          <div className="text-2xl font-semibold tracking-tight">AP Bills</div>
          <div className="text-sm text-muted-foreground">
            Server paging • Auto-status • Allocations viewer
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => nav("/ap")}>
            <Receipt className="h-4 w-4 mr-2" />
            Dashboard
          </Button>

          <Button
            variant="outline"
            onClick={() => billsQ.refetch()}
            disabled={billsQ.isFetching}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>

          <Button
            className="gradient-primary shadow-glow text-primary-foreground"
            onClick={() => nav("/suppliers")}
          >
            <Plus className="h-4 w-4 mr-2" />
            New Bill
          </Button>
        </div>
      </div>

      {/* Search */}
      <Card className="p-4 shadow-premium">
        <Input
          placeholder="Search bill number..."
          value={q}
          onChange={(e) => {
            setPage(0);
            setQ(e.target.value);
          }}
        />
      </Card>

      {/* Table */}
      <Card className="overflow-hidden shadow-premium">
        <div className="overflow-auto max-h-[70vh]">
          <table className="w-full min-w-[1000px] text-sm">
            <thead className="sticky top-0 bg-background border-b">
              <tr>
                <th className="px-4 py-3 text-left">Bill</th>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-left">Status</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((b: any, idx: number) => (
                <tr
                  key={b.id}
                  className={
                    idx % 2 === 0
                      ? "bg-background hover:bg-muted/40 cursor-pointer"
                      : "bg-muted/10 hover:bg-muted/40 cursor-pointer"
                  }
                  onClick={() => {
                    setActiveBill(b);
                    setAllocOpen(true);
                  }}
                >
                  <td className="px-4 py-4 font-semibold">
                    {b.bill_no || `BILL-${b.id}`}
                  </td>
                  <td className="px-4 py-4">{b.bill_date}</td>
                  <td className="px-4 py-4 text-right font-semibold">
                    Rs {money(b.total_amount)}
                  </td>
                  <td className="px-4 py-4">{b.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t text-xs">
          <div>
            Page {page + 1} of {pageCount} • {total} total
          </div>

          <div className="flex gap-2">
            <Button
              size="icon"
              variant="outline"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            <Button
              size="icon"
              variant="outline"
              disabled={page >= pageCount - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>

      {/* Allocations Drawer */}
      <Dialog open={allocOpen} onOpenChange={setAllocOpen}>
        <DialogContent className="max-w-3xl p-0 overflow-hidden">
          <div className="p-5 border-b bg-gradient-to-r from-background to-muted/20 flex justify-between items-center">
            <DialogHeader>
              <DialogTitle>
                Allocations — {activeBill?.bill_no}
              </DialogTitle>
            </DialogHeader>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setAllocOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="p-5 max-h-[60vh] overflow-auto space-y-3">
            {allocQ.isLoading ? (
              <div>Loading allocations...</div>
            ) : allocQ.data?.length ? (
              allocQ.data.map((a: any) => (
                <Card key={a.id} className="p-3">
                  <div className="flex justify-between">
                    <div>Payment #{a.payment_id}</div>
                    <div className="font-semibold">
                      Rs {money(a.amount_applied)}
                    </div>
                  </div>
                </Card>
              ))
            ) : (
              <div className="text-muted-foreground">
                No allocations yet.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
