// src/components/layout/AppHeader.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Command,
  CornerDownLeft,
  FileText,
  Menu,
  Moon,
  Package,
  Search,
  Sun,
  Users,
  X,
} from "lucide-react";

const THEME_KEY = "rp_theme";

function cn(...x: Array<string | false | null | undefined>) {
  return x.filter(Boolean).join(" ");
}

function getInitialDark() {
  const saved = typeof window !== "undefined" ? window.localStorage.getItem(THEME_KEY) : null;
  if (saved === "dark") return true;
  if (saved === "light") return false;
  return typeof window !== "undefined"
    ? window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false
    : false;
}

function n(v: any) {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}

type LowStockItem = {
  id: any;
  sku?: string | null;
  item_code?: string | null;
  name?: string | null;
  current_stock?: any;
  reorder_level?: any;
  is_active?: boolean | null;
};

type InvoiceHit = {
  kind: "invoice";
  id: any;
  invoice_number?: string | null;
  invoice_date?: string | null;
  status?: string | null;
  total_amount?: any;
  balance_remaining?: any;
  customer_label?: string;
};

type CustomerHit = {
  kind: "customer";
  id: any;
  label: string;
  code?: string;
};

type ProductHit = {
  kind: "product";
  id: any;
  label: string;
  code?: string;
};

type SearchHit = InvoiceHit | CustomerHit | ProductHit;

function useDebouncedValue<T>(value: T, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-lg border border-border/70 bg-muted/40 px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
      {children}
    </span>
  );
}

function Pill({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "danger" | "success";
  children: React.ReactNode;
}) {
  const cls =
    tone === "danger"
      ? "bg-destructive/10 text-destructive border-destructive/20"
      : tone === "success"
      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20"
      : "bg-muted/40 text-muted-foreground border-border/60";
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold", cls)}>
      {children}
    </span>
  );
}

export function AppHeader() {
  const navigate = useNavigate();

  const [isDark, setIsDark] = useState<boolean>(() => getInitialDark());

  const [notifyOpen, setNotifyOpen] = useState(false);

  const [q, setQ] = useState("");
  const qDebounced = useDebouncedValue(q, 260);
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const notifyRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // theme
  useEffect(() => {
    const root = document.documentElement;
    if (isDark) root.classList.add("dark");
    else root.classList.remove("dark");
    try {
      window.localStorage.setItem(THEME_KEY, isDark ? "dark" : "light");
    } catch {}
  }, [isDark]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== THEME_KEY) return;
      if (e.newValue === "dark") setIsDark(true);
      if (e.newValue === "light") setIsDark(false);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // ESC close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setNotifyOpen(false);
        setSearchOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Cmd/Ctrl + K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toLowerCase().includes("mac");
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // outside click close
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;

      if (notifyOpen) {
        const el = notifyRef.current;
        if (el && !el.contains(t)) setNotifyOpen(false);
      }
      if (searchOpen) {
        const el = searchRef.current;
        if (el && !el.contains(t)) setSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [notifyOpen, searchOpen]);

  const toggleTheme = () => setIsDark((v) => !v);
  const toggleSidebar = () => window.dispatchEvent(new Event("rp:toggle-sidebar"));
  const themeIcon = useMemo(() => (isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />), [isDark]);

  // ----------------------------
  // Notifications: Low stock
  // ----------------------------
  const lowStockQ = useQuery({
    queryKey: ["header_low_stock"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id,sku,item_code,name,current_stock,reorder_level,is_active")
        .eq("is_active", true)
        .gt("reorder_level", 0)
        .order("name", { ascending: true })
        .limit(600);

      if (error) throw error;

      const list = (data ?? []) as LowStockItem[];
      const low = list
        .filter((p) => n(p.reorder_level) > 0)
        .filter((p) => n(p.current_stock) <= n(p.reorder_level))
        .map((p) => ({ ...p, current_stock: n(p.current_stock), reorder_level: n(p.reorder_level) }))
        .sort((a, b) => a.current_stock - b.current_stock)
        .slice(0, 12);

      return low;
    },
    staleTime: 20_000,
    refetchInterval: 45_000,
    refetchOnWindowFocus: false,
  });

  const lowCount = (lowStockQ.data ?? []).length;
  const showDot = lowCount > 0;

  // ----------------------------
  // Search
  // ----------------------------
  const searchQ = useQuery({
    queryKey: ["header_search", qDebounced],
    enabled: qDebounced.trim().length >= 2,
    queryFn: async () => {
      const term = qDebounced.trim();
      const like = `%${term}%`;

      const [invRes, cusRes, prodRes] = await Promise.allSettled([
        supabase
          .from("invoices")
          .select(
            `
            id,invoice_number,invoice_date,status,total_amount,balance_remaining,
            customer:customers ( id,name,client_name,customer_code )
          `
          )
          .or(`invoice_number.ilike.${like}`)
          .order("invoice_date", { ascending: false })
          .limit(6),

        supabase
          .from("customers")
          .select("id,name,client_name,customer_code")
          .or(`name.ilike.${like},client_name.ilike.${like},customer_code.ilike.${like}`)
          .order("name", { ascending: true })
          .limit(6),

        supabase
          .from("products")
          .select("id,sku,item_code,name,is_active")
          .or(`name.ilike.${like},sku.ilike.${like},item_code.ilike.${like}`)
          .order("name", { ascending: true })
          .limit(6),
      ]);

      const invoices: InvoiceHit[] = [];
      if (invRes.status === "fulfilled") {
        const { data, error } = invRes.value;
        if (!error && data) {
          for (const r of data as any[]) {
            const c = r.customer || null;
            const cname = String(c?.client_name || "").trim() || String(c?.name || "").trim();
            const code = String(c?.customer_code || "").trim();
            const label = cname ? (code ? `${cname} • ${code}` : cname) : "—";
            invoices.push({
              kind: "invoice",
              id: r.id,
              invoice_number: r.invoice_number,
              invoice_date: r.invoice_date,
              status: r.status,
              total_amount: r.total_amount,
              balance_remaining: r.balance_remaining,
              customer_label: label,
            });
          }
        }
      }

      const customers: CustomerHit[] = [];
      if (cusRes.status === "fulfilled") {
        const { data, error } = cusRes.value;
        if (!error && data) {
          for (const r of data as any[]) {
            const cname = String(r.client_name || "").trim() || String(r.name || "").trim();
            const code = String(r.customer_code || "").trim();
            const label = cname ? cname : `Customer #${r.id}`;
            customers.push({ kind: "customer", id: r.id, label, code });
          }
        }
      }

      const products: ProductHit[] = [];
      if (prodRes.status === "fulfilled") {
        const { data, error } = prodRes.value;
        if (!error && data) {
          for (const r of data as any[]) {
            const label = String(r.name || "").trim() || `Item #${r.id}`;
            const code = String(r.sku || r.item_code || "").trim();
            products.push({ kind: "product", id: r.id, label, code });
          }
        }
      }

      return { invoices, customers, products };
    },
    staleTime: 10_000,
    refetchOnWindowFocus: false,
  });

  const hits: SearchHit[] = useMemo(() => {
    const d = searchQ.data;
    if (!d) return [];
    return [...d.invoices, ...d.customers, ...d.products];
  }, [searchQ.data]);

  useEffect(() => {
    if (qDebounced.trim().length >= 2) {
      setSearchOpen(true);
      setActiveIndex(0);
    } else {
      setSearchOpen(false);
      setActiveIndex(0);
    }
  }, [qDebounced]);

  const onPick = (hit: SearchHit) => {
    setSearchOpen(false);
    setNotifyOpen(false);

    if (hit.kind === "invoice") return navigate(`/invoices/${hit.id}`);
    if (hit.kind === "customer") {
      const term = q.trim();
      return navigate(`/customers?focus=${encodeURIComponent(String(hit.id))}&q=${encodeURIComponent(term)}`);
    }
    const term = q.trim();
    return navigate(`/stock?q=${encodeURIComponent(term)}`);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!searchOpen) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(Math.max(hits.length - 1, 0), i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = hits[activeIndex];
      if (hit) onPick(hit);
    }
  };

  return (
    <header className="rp-header sticky top-0 z-50 overflow-visible">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

      <div className="h-16 flex items-center justify-between px-3 sm:px-4 md:px-6">
        {/* Left */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <button
            type="button"
            onClick={toggleSidebar}
            className="md:hidden inline-flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/60 active:scale-[0.98] transition"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Search (wider) */}
          <div className="relative w-full max-w-[720px] lg:max-w-[820px] overflow-visible" ref={searchRef}>
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onFocus={() => {
                if (q.trim().length >= 2) setSearchOpen(true);
              }}
              onKeyDown={onKeyDown}
              placeholder="Search invoices, customers, stock…"
              className={cn(
                "pl-10 pr-24 rounded-2xl",
                "bg-background/60 dark:bg-background/30",
                "border border-border/60",
                "focus-visible:ring-0 focus-visible:outline-none",
                "shadow-[0_1px_0_rgba(255,255,255,0.55)_inset,0_10px_30px_rgba(2,6,23,0.06)]",
                "transition-all duration-200",
                "rp-search"
              )}
            />

            {/* Cmd/K hint */}
            <div className="absolute right-2 top-1/2 -translate-y-1/2 hidden sm:flex items-center gap-1">
              <Kbd>
                <Command className="h-3.5 w-3.5" />K
              </Kbd>
            </div>

            {/* Search dropdown (correct position + separate from notifications) */}
            <div
              className={cn(
                "absolute left-0 right-0 mt-2 origin-top rounded-2xl overflow-hidden",
                "border border-border/60",
                "bg-background/92 backdrop-blur-xl",
                "shadow-[0_28px_90px_rgba(2,6,23,0.20)]",
                "transition-all duration-200",
                "z-[60]",
                searchOpen ? "opacity-100 translate-y-0" : "pointer-events-none opacity-0 -translate-y-1"
              )}
              role="listbox"
              aria-label="Search results"
            >
              <div className="px-4 py-3 border-b border-border/60 flex items-center justify-between gap-3">
                <div className="text-xs text-muted-foreground">
                  {qDebounced.trim().length < 2
                    ? "Type at least 2 characters…"
                    : searchQ.isFetching
                    ? "Searching…"
                    : "Quick results"}
                </div>

                <div className="flex items-center gap-2">
                  <Kbd>
                    <CornerDownLeft className="h-3.5 w-3.5" />
                    Enter
                  </Kbd>

                  {q.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => {
                        setQ("");
                        setSearchOpen(false);
                        setActiveIndex(0);
                        inputRef.current?.focus();
                      }}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground transition"
                      aria-label="Clear search"
                    >
                      <X className="h-4 w-4" />
                      Clear
                    </button>
                  ) : null}
                </div>
              </div>

              {qDebounced.trim().length >= 2 && !searchQ.isFetching && hits.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground">No results found.</div>
              ) : null}

              <div className="max-h-[420px] overflow-auto p-2 rp-scroll">
                {/* Invoices */}
                {(searchQ.data?.invoices?.length ?? 0) > 0 ? (
                  <div className="mb-2">
                    <div className="px-2 py-2 text-[11px] font-extrabold tracking-wider text-muted-foreground uppercase flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Invoices
                    </div>

                    <div className="space-y-1">
                      {searchQ.data!.invoices.map((it) => {
                        const idx = hits.findIndex((h) => h.kind === "invoice" && h.id === it.id);
                        const active = idx === activeIndex;
                        const invNo = it.invoice_number || `INV-${String(it.id).slice(0, 8)}`;
                        const status = String(it.status || "").toUpperCase();
                        const total = n(it.total_amount).toFixed(2);

                        return (
                          <button
                            key={`inv-${it.id}`}
                            type="button"
                            onClick={() => onPick(it)}
                            className={cn(
                              "w-full text-left rounded-2xl px-3 py-2.5 transition",
                              "border border-border/50",
                              "hover:bg-muted/40",
                              active ? "bg-muted/50 border-primary/25" : "bg-background/40"
                            )}
                            role="option"
                            aria-selected={active}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-sm font-semibold truncate">{invNo}</div>
                                <div className="text-xs text-muted-foreground truncate">{it.customer_label || "—"}</div>
                              </div>
                              <div className="text-right shrink-0">
                                <div className="text-sm font-extrabold tabular-nums whitespace-nowrap">Rs {total}</div>
                                <div className="text-[11px] font-semibold text-muted-foreground whitespace-nowrap">{status}</div>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {/* Customers */}
                {(searchQ.data?.customers?.length ?? 0) > 0 ? (
                  <div className="mb-2">
                    <div className="px-2 py-2 text-[11px] font-extrabold tracking-wider text-muted-foreground uppercase flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Customers
                    </div>

                    <div className="space-y-1">
                      {searchQ.data!.customers.map((it) => {
                        const idx = hits.findIndex((h) => h.kind === "customer" && h.id === it.id);
                        const active = idx === activeIndex;
                        return (
                          <button
                            key={`cus-${it.id}`}
                            type="button"
                            onClick={() => onPick(it)}
                            className={cn(
                              "w-full text-left rounded-2xl px-3 py-2.5 transition",
                              "border border-border/50",
                              "hover:bg-muted/40",
                              active ? "bg-muted/50 border-primary/25" : "bg-background/40"
                            )}
                            role="option"
                            aria-selected={active}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-sm font-semibold truncate">{it.label}</div>
                                <div className="text-xs text-muted-foreground truncate">{it.code ? `Code: ${it.code}` : "Customer"}</div>
                              </div>
                              <span className="text-[11px] font-semibold text-muted-foreground">Open</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {/* Stock */}
                {(searchQ.data?.products?.length ?? 0) > 0 ? (
                  <div>
                    <div className="px-2 py-2 text-[11px] font-extrabold tracking-wider text-muted-foreground uppercase flex items-center gap-2">
                      <Package className="h-4 w-4" />
                      Stock
                    </div>

                    <div className="space-y-1">
                      {searchQ.data!.products.map((it) => {
                        const idx = hits.findIndex((h) => h.kind === "product" && h.id === it.id);
                        const active = idx === activeIndex;
                        return (
                          <button
                            key={`prod-${it.id}`}
                            type="button"
                            onClick={() => onPick(it)}
                            className={cn(
                              "w-full text-left rounded-2xl px-3 py-2.5 transition",
                              "border border-border/50",
                              "hover:bg-muted/40",
                              active ? "bg-muted/50 border-primary/25" : "bg-background/40"
                            )}
                            role="option"
                            aria-selected={active}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-sm font-semibold truncate">{it.label}</div>
                                <div className="text-xs text-muted-foreground truncate">{it.code ? `SKU/Code: ${it.code}` : "Stock item"}</div>
                              </div>
                              <span className="text-[11px] font-semibold text-muted-foreground">View</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    <div className="mt-2 flex justify-end px-1 pb-1">
                      <Button
                        variant="outline"
                        className="rounded-xl"
                        onClick={() => {
                          setSearchOpen(false);
                          navigate(`/stock?q=${encodeURIComponent(q.trim())}`);
                        }}
                      >
                        View all stock results
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        {/* Right */}
        <div className="flex items-center gap-2 md:gap-3 relative">
          <div className="hidden sm:flex items-center gap-2 mr-1 select-none">
            <span className="relative live-dot h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_12px_rgba(34,197,94,0.45)]" />
            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 tracking-wide">Live</span>
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="rounded-xl text-muted-foreground hover:text-foreground active:scale-[0.98] transition"
            title={isDark ? "Light mode" : "Dark mode"}
          >
            {themeIcon}
          </Button>

          {/* Notifications (SOLID WHITE background) */}
          <div className="relative" ref={notifyRef}>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setNotifyOpen((v) => !v)}
              className="relative rounded-xl text-muted-foreground hover:text-foreground active:scale-[0.98] transition"
              title="Notifications"
              aria-haspopup="dialog"
              aria-expanded={notifyOpen}
            >
              <Bell className="h-5 w-5" />
              {showDot ? (
                <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-destructive shadow-[0_0_12px_rgba(220,38,38,0.35)]" />
              ) : null}
            </Button>

            <div
              className={cn(
                "absolute right-0 mt-2 w-[min(92vw,420px)] origin-top-right rounded-2xl overflow-hidden",
                "border border-border/70",
                "bg-white dark:bg-slate-950", // ✅ solid background
                "backdrop-blur-0", // ✅ no glass blur
                "shadow-[0_30px_95px_rgba(2,6,23,0.22)]",
                "transition-all duration-200",
                "z-[70]",
                notifyOpen ? "opacity-100 scale-100 translate-y-0" : "pointer-events-none opacity-0 scale-[0.985] -translate-y-1"
              )}
              role="dialog"
              aria-label="Notifications panel"
            >
              {/* Red accent line */}
              <div className="h-[3px] w-full bg-[var(--rp-accent)]" />

              <div className="p-4 border-b border-border/60 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-semibold">Notifications</div>
                    {lowCount > 0 ? <Pill tone="danger">{lowCount} Low stock</Pill> : <Pill tone="success">All good</Pill>}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {lowCount > 0 ? "Items at or below reorder level." : "No alerts right now."}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl"
                    onClick={() => lowStockQ.refetch()}
                    disabled={lowStockQ.isFetching}
                    title="Refresh"
                  >
                    {lowStockQ.isFetching ? "…" : "Refresh"}
                  </Button>

                  <button
                    type="button"
                    onClick={() => setNotifyOpen(false)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/60 active:scale-[0.98] transition"
                    aria-label="Close notifications"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              <div className="p-3 max-h-[380px] overflow-auto rp-scroll">
                {lowStockQ.isLoading ? (
                  <div className="p-3 rounded-2xl border border-border/70 bg-slate-50 dark:bg-slate-900 text-sm text-muted-foreground flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-muted-foreground/50 animate-pulse" />
                    Loading alerts…
                  </div>
                ) : lowCount === 0 ? (
                  <div className="p-4 rounded-2xl border border-border/70 bg-slate-50 dark:bg-slate-900 flex items-start gap-3">
                    <div className="h-10 w-10 rounded-2xl bg-emerald-500/10 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-300" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold">Everything looks fine</div>
                      <div className="text-xs text-muted-foreground mt-0.5">Stock levels are above reorder points.</div>
                      <div className="mt-3">
                        <Button asChild variant="outline" size="sm" className="rounded-xl">
                          <Link to="/stock">Open Stock</Link>
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="mb-3 p-3 rounded-2xl border border-destructive/25 bg-destructive/5 flex items-start gap-3">
                      <div className="h-10 w-10 rounded-2xl bg-destructive/10 flex items-center justify-center shrink-0">
                        <AlertTriangle className="h-5 w-5 text-destructive" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold">Action required</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          These items need restocking. Open Stock to create your purchase plan.
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {(lowStockQ.data ?? []).map((p) => {
                        const code = String(p.sku || p.item_code || `#${p.id}`);
                        const name = String(p.name || "Item");
                        const onHand = n(p.current_stock);
                        const reorder = n(p.reorder_level);

                        return (
                          <div
                            key={String(p.id)}
                            className="rounded-2xl border border-border/70 bg-white dark:bg-slate-950 p-3 hover:bg-slate-50 dark:hover:bg-slate-900 transition"
                          >
                            <div className="flex items-start gap-3">
                              <div className="h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                                <Package className="h-5 w-5 text-primary" />
                              </div>

                              <div className="min-w-0 flex-1">
                                <div className="text-sm font-semibold truncate">
                                  <span className="font-extrabold">{code}</span>{" "}
                                  <span className="text-muted-foreground font-semibold">•</span>{" "}
                                  <span className="font-semibold">{name}</span>
                                </div>

                                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                  <span>
                                    On hand: <span className="font-semibold tabular-nums text-foreground">{onHand}</span>
                                  </span>
                                  <span className="opacity-60">•</span>
                                  <span>
                                    Reorder: <span className="font-semibold tabular-nums text-foreground">{reorder}</span>
                                  </span>
                                </div>

                                <div className="mt-2 h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                                  <div
                                    className="h-full rounded-full bg-destructive/70"
                                    style={{
                                      width: `${Math.max(6, Math.min(100, (onHand / Math.max(1, reorder)) * 100))}%`,
                                    }}
                                  />
                                </div>
                              </div>

                              <Pill tone="danger">Low</Pill>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="mt-3 flex justify-end gap-2">
                      <Button
                        variant="outline"
                        className="rounded-xl"
                        onClick={() => {
                          setNotifyOpen(false);
                          navigate("/stock");
                        }}
                      >
                        Open Stock
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          <style>{`
            .rp-header{
              position: sticky;
              top: 0;
              z-index: 50;
              border-bottom: 1px solid rgba(15,23,42,.08);
              background: rgba(255,255,255,.72);
              backdrop-filter: blur(14px);
              -webkit-backdrop-filter: blur(14px);
              box-shadow: 0 18px 60px rgba(2,6,23,.06);
            }
            :root.dark .rp-header{
              border-bottom: 1px solid rgba(255,255,255,.10);
              background: rgba(2,6,23,.55);
              box-shadow: 0 26px 80px rgba(0,0,0,.40);
            }

            /* Accent (dark red) */
            .rp-header{ --rp-accent: rgba(120, 8, 8, .85); }
            :root.dark .rp-header{ --rp-accent: rgba(255, 90, 90, .70); }

            @keyframes livePulse {
              0% { transform: scale(1); opacity: .9; }
              50% { transform: scale(1.35); opacity: .35; }
              100% { transform: scale(1); opacity: .9; }
            }
            .live-dot::after{
              content:"";
              position:absolute;
              inset:-6px;
              border-radius:9999px;
              background: rgba(34, 197, 94, 0.25);
              animation: livePulse 2s ease-in-out infinite;
            }

            /* Search red border always visible + focus stronger */
            .rp-search{
              transition: box-shadow .2s ease, border-color .2s ease, background .2s ease;
              border-color: rgba(120, 8, 8, .22);
            }
            .rp-search:focus{
              border-color: var(--rp-accent);
              box-shadow:
                0 0 0 1px rgba(120, 8, 8, .12),
                0 18px 52px rgba(2,6,23,.10);
              background: rgba(255,255,255,.74);
            }
            :root.dark .rp-search{
              border-color: rgba(255, 90, 90, .18);
            }
            :root.dark .rp-search:focus{
              border-color: var(--rp-accent);
              background: rgba(2,6,23,.35);
              box-shadow:
                0 0 0 1px rgba(255, 90, 90, .10),
                0 22px 60px rgba(0,0,0,.42);
            }
          `}</style>
        </div>
      </div>
    </header>
  );
}