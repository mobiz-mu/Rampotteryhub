// src/components/layout/AppSidebar.tsx
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useEffect, useMemo, useState } from "react";
import type { ComponentType } from "react";

interface NavItem {
  title: string;
  href?: string;
  icon: ComponentType<{ className?: string }>;
  children?: { title: string; href: string }[];
  /** if true, only show for admins */
  adminOnly?: boolean;
}

const navigation: NavItem[] = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  {
    title: "Invoices",
    icon: FileText,
    children: [
      { title: "All Invoices", href: "/invoices" },
      { title: "Create Invoice", href: "/invoices/create" },
    ],
  },
  {
    title: "Credit Notes",
    icon: FileMinus,
    children: [
      { title: "All Credit Notes", href: "/credit-notes" },
      { title: "Create Credit Note", href: "/credit-notes/create" },
    ],
  },
  {
    title: "Quotations",
    icon: FileQuestion,
    children: [
      { title: "All Quotations", href: "/quotations" },
      { title: "Create Quotation", href: "/quotations/create" },
    ],
  },
  {
    title: "Stock & Categories",
    icon: Package,
    children: [
      { title: "Stock Items", href: "/stock" },
      { title: "Categories", href: "/categories" },
    ],
  },
  { title: "Stock Movements", href: "/stock-movements", icon: ArrowLeftRight },
  { title: "Customers", href: "/customers", icon: Users },
  { title: "Suppliers", href: "/suppliers", icon: Truck },
  { title: "Reports", href: "/reports", icon: BarChart3 },
  { title: "Users & Permissions", href: "/users", icon: Shield, adminOnly: true },
];

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
    if (item.children.some((c) => isInside(pathname, c.href))) active.push(item.title);
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
  const { profile, role, isAdmin, user, signOut } = useAuth() as any;

  const nav = useMemo(() => navigation.filter((i) => (!i.adminOnly ? true : !!isAdmin)), [isAdmin]);

  const routeOpen = useMemo(() => getActiveGroupTitles(nav, location.pathname), [nav, location.pathname]);
  const [manualOpen, setManualOpen] = useState<string[]>([]);

  useEffect(() => {
    setManualOpen((prev) => Array.from(new Set([...prev, ...routeOpen])));
  }, [routeOpen]);

  const isGroupOpen = (title: string) => manualOpen.includes(title) || routeOpen.includes(title);

  const toggleGroup = (title: string) => {
    setManualOpen((prev) => (prev.includes(title) ? prev.filter((x) => x !== title) : [...prev, title]));
  };

  const displayName = profile?.full_name || user?.email || "Admin";
  const roleLabel = isAdmin ? "Admin" : titleCase(role || "user");

  const sidebarBase = "fixed left-0 top-0 z-30 flex h-screen w-64 shrink-0 flex-col border-r";
  const sidebarVisual = "bg-slate-950 text-white border-white/10";
  const sidebarToken = "bg-sidebar text-sidebar-foreground border-sidebar-border";

  return (
    <aside className={cn(sidebarBase, sidebarVisual, sidebarToken, "rp-sidebar")}>
      {/* Premium top glow */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/10 to-transparent" />

      {/* Logo / Brand */}
      <div className="relative flex h-16 items-center gap-3 px-6 border-b border-white/10 border-sidebar-border">
        <div className="relative h-10 w-10 rounded-xl bg-white shadow-[0_14px_40px_rgba(0,0,0,.45)] ring-1 ring-white/30 overflow-hidden rp-logoCapsule">
          <span className="pointer-events-none absolute inset-0 rp-logoShine" />
          <img
            src="/logo.png"
            alt="Ram Pottery Ltd"
            className="h-full w-full object-contain p-1.5"
            draggable={false}
          />
        </div>

        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold tracking-wide">Ram Pottery Ltd</span>
          <span className="text-xs opacity-70">Accounting Software</span>
        </div>
      </div>

      {/* Navigation */}
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
                        "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
                        "hover:bg-white/10 hover:bg-sidebar-accent",
                        isActive
                          ? "bg-white/12 bg-sidebar-primary text-white text-sidebar-primary-foreground shadow-[0_12px_30px_rgba(0,0,0,.25)]"
                          : "text-white/80 text-sidebar-foreground/70"
                      )
                    }
                  >
                    <Icon className="h-5 w-5 opacity-90 group-hover:opacity-100 transition-opacity" />
                    <span className="flex-1">{item.title}</span>
                    <span className="absolute left-0 top-1/2 h-5 -translate-y-1/2 rounded-r bg-white/30 opacity-0 group-[.active]:opacity-100" />
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
                        "group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
                        childActive
                          ? "bg-white/12 bg-sidebar-accent text-white text-sidebar-accent-foreground shadow-[0_12px_30px_rgba(0,0,0,.18)]"
                          : "text-white/80 text-sidebar-foreground/70 hover:bg-white/10 hover:bg-sidebar-accent hover:text-white hover:text-sidebar-accent-foreground"
                      )}
                    >
                      <Icon className="h-5 w-5 opacity-90 group-hover:opacity-100 transition-opacity" />
                      <span className="flex-1 text-left">{item.title}</span>

                      <ChevronDown
                        className={cn(
                          "h-4 w-4 opacity-80 transition-all duration-300",
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
                    <div className="mt-1 ml-4 space-y-1 border-l border-white/10 pl-3">
                      {item.children.map((child) => (
                        <NavLink
                          key={child.href}
                          to={child.href}
                          className={({ isActive }) =>
                            cn(
                              "group flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-all",
                              isActive
                                ? "bg-white/12 bg-sidebar-primary text-white text-sidebar-primary-foreground shadow-[0_10px_24px_rgba(0,0,0,.18)]"
                                : "text-white/70 text-sidebar-foreground/60 hover:bg-white/10 hover:bg-sidebar-accent hover:text-white hover:text-sidebar-accent-foreground"
                            )
                          }
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70 group-hover:opacity-100 transition-opacity" />
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

      {/* User section */}
      <div className="border-t border-white/10 border-sidebar-border p-4">
        <div className="flex items-center gap-3 rounded-xl bg-white/10 bg-sidebar-accent p-3 shadow-[0_16px_40px_rgba(0,0,0,.25)]">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20 bg-sidebar-primary text-sm font-semibold text-white text-sidebar-primary-foreground">
            {String(displayName || "A").charAt(0).toUpperCase()}
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{displayName}</p>
            <div className="mt-0.5 flex items-center gap-2 min-w-0">
              <p className="text-xs opacity-70 truncate">{roleLabel}</p>

              {isAdmin && (
                <span className="ml-auto inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-emerald-200 ring-1 ring-emerald-400/20">
                  ADMIN
                </span>
              )}
            </div>
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={signOut}
            className="h-8 w-8 rounded-xl text-white/70 hover:text-white hover:bg-white/10 hover:bg-sidebar-border"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Local keyframes + premium scrollbar + logo animation (no tailwind config needed) */}
      <style>{`
        /* ---------- Collapsible animation ---------- */
        @keyframes rpCollapsibleDown {
          from { height: 0; opacity: 0; transform: translateY(-4px); }
          to   { height: var(--radix-collapsible-content-height); opacity: 1; transform: translateY(0); }
        }
        @keyframes rpCollapsibleUp {
          from { height: var(--radix-collapsible-content-height); opacity: 1; transform: translateY(0); }
          to   { height: 0; opacity: 0; transform: translateY(-4px); }
        }
        .animate-rpCollapsibleDown { animation: rpCollapsibleDown 260ms cubic-bezier(.2,.8,.2,1); }
        .animate-rpCollapsibleUp { animation: rpCollapsibleUp 220ms cubic-bezier(.2,.8,.2,1); }

        /* ---------- Premium logo animation ---------- */
        @keyframes rpFloat {
          0% { transform: translateY(0); }
          50% { transform: translateY(-1.5px); }
          100% { transform: translateY(0); }
        }
        .rp-logoCapsule { animation: rpFloat 3.2s ease-in-out infinite; }

        @keyframes rpShine {
          0%   { transform: translateX(-130%) rotate(10deg); opacity: 0; }
          10%  { opacity: .22; }
          35%  { opacity: .22; }
          55%  { opacity: 0; }
          100% { transform: translateX(130%) rotate(10deg); opacity: 0; }
        }
        .rp-logoShine{
          background: linear-gradient(120deg, transparent, rgba(255,255,255,.65), transparent);
          transform: translateX(-130%) rotate(10deg);
          animation: rpShine 3.8s ease-in-out infinite;
          mix-blend-mode: soft-light;
        }

        /* ---------- Luxury red scrollbar (nav only) ---------- */
        .rp-navScroll::-webkit-scrollbar { width: 10px; }
        .rp-navScroll::-webkit-scrollbar-track {
          background: rgba(120, 0, 0, 0.55);
          border-left: 1px solid rgba(255,255,255,.06);
          border-radius: 999px;
        }
        .rp-navScroll::-webkit-scrollbar-thumb {
          background: rgba(255, 110, 110, 0.75);
          border: 2px solid rgba(120,0,0,0.30);
          border-radius: 999px;
        }
        .rp-navScroll::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 140, 140, 0.88);
        }
        .rp-navScroll{
          scrollbar-width: thin;
          scrollbar-color: rgba(255,110,110,.75) rgba(120,0,0,.55);
        }
      `}</style>
    </aside>
  );
}

