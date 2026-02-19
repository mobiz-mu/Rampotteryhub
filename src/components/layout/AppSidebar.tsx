// src/components/layout/AppSidebar.tsx
// (Same as your original, only one tiny safety tweak: mobile open button sits BELOW header if needed)
import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  FileText,
  FileMinus,
  FileQuestion,
  Package,
  ArrowLeftRight,
  Users,
  Truck,
  BarChart3,
  Shield,
  LogOut,
  ChevronDown,
  Menu,
  X,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useEffect, useMemo, useState } from "react";
import type { ComponentType } from "react";

interface NavItem {
  title: string;
  href?: string;
  icon: ComponentType<{ className?: string }>;
  children?: { title: string; href: string; show?: boolean }[];
  show?: boolean;
}

function normalizePath(pathname: string) {
  return pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

function isInside(pathname: string, baseHref: string) {
  const p = normalizePath(pathname);
  const b = normalizePath(baseHref);
  return p === b || p.startsWith(b + "/");
}

function getActiveGroupTitles(items: NavItem[], pathname: string) {
  const active: string[] = [];
  for (const item of items) {
    if (!item.children) continue;
    if (item.children.some((c) => c.show !== false && isInside(pathname, c.href))) active.push(item.title);
  }
  return active;
}

function titleCase(s: string) {
  const v = String(s || "").trim();
  if (!v) return v;
  return v.charAt(0).toUpperCase() + v.slice(1);
}

export function AppSidebar() {
  const location = useLocation();
  const auth: any = useAuth();

  const { profile, role, isAdmin, user, signOut } = auth;

  const can = (key: string) => (typeof auth?.can === "function" ? auth.can(key) : false) || !!isAdmin;

  const navigation: NavItem[] = useMemo(
    () => [
      { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard, show: true },

      {
        title: "Invoices",
        icon: FileText,
        show: can("ar.view"),
        children: [
          { title: "All Invoices", href: "/invoices", show: can("ar.view") },
          { title: "Create Invoice", href: "/invoices/create", show: can("ar.invoices") },
        ],
      },

      {
        title: "Credit Notes",
        icon: FileMinus,
        show: can("ar.view"),
        children: [
          { title: "All Credit Notes", href: "/credit-notes", show: can("ar.view") },
          { title: "Create Credit Note", href: "/credit-notes/create", show: can("ar.invoices") },
        ],
      },

      {
        title: "Quotations",
        icon: FileQuestion,
        show: can("ar.view"),
        children: [
          { title: "All Quotations", href: "/quotations", show: can("ar.view") },
          { title: "Create Quotation", href: "/quotations/create", show: can("ar.invoices") },
        ],
      },

      {
        title: "Stock & Categories",
        icon: Package,
        show: can("stock.view"),
        children: [
          { title: "Stock Items", href: "/stock", show: can("stock.view") },
          { title: "Categories", href: "/categories", show: can("stock.view") },
        ],
      },

      { title: "Stock Movements", href: "/stock-movements", icon: ArrowLeftRight, show: can("stock.view") },
      { title: "Customers", href: "/customers", icon: Users, show: can("customers.view") },
      { title: "Suppliers", href: "/suppliers", icon: Truck, show: can("ap.view") },
      { title: "Reports", href: "/reports", icon: BarChart3, show: can("reports.view") },
      { title: "Users & Permissions", href: "/users", icon: Shield, show: isAdmin || can("users.manage") },
    ],
    [isAdmin, user?.id, profile?.role, profile?.permissions]
  );

  const nav = useMemo(() => {
    const out: NavItem[] = [];
    for (const item of navigation) {
      if (item.show === false) continue;
      if (item.children?.length) {
        const kids = item.children.filter((c) => c.show !== false);
        if (kids.length === 0) continue;
        out.push({ ...item, children: kids });
      } else out.push(item);
    }
    return out;
  }, [navigation]);

  const routeOpen = useMemo(() => getActiveGroupTitles(nav, location.pathname), [nav, location.pathname]);
  const [manualOpen, setManualOpen] = useState<string[]>([]);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setManualOpen((prev) => Array.from(new Set([...prev, ...routeOpen])));
  }, [routeOpen]);

  useEffect(() => setMobileOpen(false), [location.pathname]);

  useEffect(() => {
    const onToggle = () => setMobileOpen((v) => !v);
    window.addEventListener("rp:toggle-sidebar" as any, onToggle);
    return () => window.removeEventListener("rp:toggle-sidebar" as any, onToggle);
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    if (mobileOpen) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  const isGroupOpen = (title: string) => manualOpen.includes(title) || routeOpen.includes(title);
  const toggleGroup = (title: string) => {
    setManualOpen((prev) => (prev.includes(title) ? prev.filter((x) => x !== title) : [...prev, title]));
  };

  const displayName = profile?.full_name || user?.email || "User";
  const roleLabel = isAdmin ? "Admin" : titleCase(role || "user");

  const sidebarBase =
    "fixed left-0 top-0 z-40 flex h-[100dvh] w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground";

  const mobileState = mobileOpen ? "translate-x-0 shadow-[0_18px_60px_rgba(0,0,0,.35)]" : "-translate-x-full";
  const desktopState = "md:translate-x-0 md:shadow-none";

  return (
    <>
      {/* Optional: keep this, but it won’t clash anymore */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className={cn(
          "md:hidden fixed left-4 top-[72px] z-50 inline-flex h-10 w-10 items-center justify-center rounded-xl",
          "bg-background/90 text-foreground shadow-sm ring-1 ring-border backdrop-blur",
          "active:scale-[0.98] transition"
        )}
        aria-label="Open sidebar"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div
        className={cn(
          "fixed inset-0 z-30 bg-black/40 backdrop-blur-[2px] md:hidden transition-opacity",
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={() => setMobileOpen(false)}
        aria-hidden="true"
      />

      <aside
        style={{ transitionTimingFunction: "cubic-bezier(.2,.8,.2,1)" }}
        className={cn(sidebarBase, "transition-transform duration-300", mobileState, desktopState)}
        aria-label="Sidebar"
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-foreground/10 to-transparent" />

        <div className="relative flex h-16 items-center gap-3 px-5 border-b border-sidebar-border">
          <div className="relative h-10 w-10 rounded-xl bg-background shadow-sm ring-1 ring-border overflow-hidden">
            <span className="pointer-events-none absolute inset-0 rp-logoShine" />
            <img src="/logo.png" alt="Ram Pottery Ltd" className="h-full w-full object-contain p-1.5" draggable={false} />
          </div>

          <div className="flex flex-col leading-tight min-w-0">
            <span className="text-sm font-semibold tracking-wide truncate">Ram Pottery Ltd</span>
            <span className="text-xs text-muted-foreground truncate">Accounting</span>
          </div>

          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className={cn(
              "md:hidden ml-auto inline-flex h-9 w-9 items-center justify-center rounded-xl",
              "text-muted-foreground hover:text-foreground hover:bg-muted/60 active:scale-[0.98] transition"
            )}
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 rp-navScroll">
          <ul className="space-y-1">
            {nav.map((item) => {
              const Icon = item.icon;

              if (!item.children) {
                return (
                  <li key={item.title}>
                    <NavLink
                      to={item.href!}
                      className={({ isActive }) =>
                        cn(
                          "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium",
                          "transition-all duration-200",
                          "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                          "active:scale-[0.99]",
                          isActive ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm" : "text-sidebar-foreground/80"
                        )
                      }
                    >
                      <Icon className="h-5 w-5 opacity-90 group-hover:opacity-100 transition-opacity" />
                      <span className="flex-1">{item.title}</span>
                    </NavLink>
                  </li>
                );
              }

              const open = isGroupOpen(item.title);
              const childActive = item.children.some((c) => isInside(location.pathname, c.href));

              return (
                <li key={item.title}>
                  <Collapsible open={open} onOpenChange={() => toggleGroup(item.title)}>
                    <CollapsibleTrigger asChild>
                      <button
                        type="button"
                        className={cn(
                          "group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium",
                          "transition-all duration-200 active:scale-[0.99]",
                          childActive
                            ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                            : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                        )}
                      >
                        <Icon className="h-5 w-5 opacity-90 group-hover:opacity-100 transition-opacity" />
                        <span className="flex-1 text-left">{item.title}</span>
                        <ChevronDown
                          className={cn(
                            "h-4 w-4 opacity-80 transition-transform duration-300",
                            open ? "rotate-180 opacity-100" : "rotate-0",
                            "group-hover:opacity-100"
                          )}
                        />
                      </button>
                    </CollapsibleTrigger>

                    <CollapsibleContent
                      className={cn(
                        "overflow-hidden",
                        "data-[state=open]:animate-rpCollapsibleDown data-[state=closed]:animate-rpCollapsibleUp"
                      )}
                    >
                      <div className="mt-1 ml-4 space-y-1 border-l border-sidebar-border/60 pl-3">
                        {item.children.map((child) => (
                          <NavLink
                            key={child.href}
                            to={child.href}
                            className={({ isActive }) =>
                              cn(
                                "group flex items-center gap-3 rounded-xl px-3 py-2 text-sm",
                                "transition-all duration-200 active:scale-[0.99]",
                                isActive
                                  ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                              )
                            }
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60 group-hover:opacity-100 transition-opacity" />
                            {child.title}
                          </NavLink>
                        ))}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="border-t border-sidebar-border p-4">
          <div className="flex items-center gap-3 rounded-xl bg-sidebar-accent p-3 shadow-sm ring-1 ring-sidebar-border/40">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sidebar-primary text-sm font-semibold text-sidebar-primary-foreground">
              {String(displayName || "U").charAt(0).toUpperCase()}
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{displayName}</p>
              <p className="text-xs text-muted-foreground truncate">{roleLabel}</p>
            </div>

            <Button
              variant="ghost"
              size="icon"
              onClick={signOut}
              className="h-9 w-9 rounded-xl text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/70 active:scale-[0.98] transition"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <style>{`
          @keyframes rpCollapsibleDown {
            from { height: 0; opacity: 0; transform: translateY(-4px); }
            to   { height: var(--radix-collapsible-content-height); opacity: 1; transform: translateY(0); }
          }
          @keyframes rpCollapsibleUp {
            from { height: var(--radix-collapsible-content-height); opacity: 1; transform: translateY(0); }
            to   { height: 0; opacity: 0; transform: translateY(-4px); }
          }
          .animate-rpCollapsibleDown { animation: rpCollapsibleDown 240ms cubic-bezier(.2,.8,.2,1); }
          .animate-rpCollapsibleUp { animation: rpCollapsibleUp 200ms cubic-bezier(.2,.8,.2,1); }

          @keyframes rpShine {
            0%   { transform: translateX(-130%) rotate(10deg); opacity: 0; }
            10%  { opacity: .18; }
            35%  { opacity: .18; }
            55%  { opacity: 0; }
            100% { transform: translateX(130%) rotate(10deg); opacity: 0; }
          }
          .rp-logoShine{
            background: linear-gradient(120deg, transparent, rgba(255,255,255,.55), transparent);
            transform: translateX(-130%) rotate(10deg);
            animation: rpShine 4.2s ease-in-out infinite;
            mix-blend-mode: soft-light;
          }

          .rp-navScroll::-webkit-scrollbar { width: 10px; }
          .rp-navScroll::-webkit-scrollbar-track {
            background: rgba(255,255,255,.06);
            border-left: 1px solid rgba(255,255,255,.06);
            border-radius: 999px;
          }
          .rp-navScroll::-webkit-scrollbar-thumb {
            background: rgba(255,255,255,.16);
            border: 2px solid rgba(0,0,0,.10);
            border-radius: 999px;
          }
          .rp-navScroll::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,.22); }
          .rp-navScroll{ scrollbar-width: thin; scrollbar-color: rgba(255,255,255,.18) rgba(255,255,255,.06); }
        `}</style>
      </aside>
    </>
  );
}

