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
import React, { useEffect, useMemo, useState } from "react";

interface NavItem {
  title: string;
  href?: string;
  icon: React.ComponentType<{ className?: string }>;
  children?: { title: string; href: string }[];
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
      { title: "Create Quotation", href: "/quotations/new" }, // ✅ matches your router
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
  { title: "Users & Permissions", href: "/users", icon: Shield },
];

function normalizePath(pathname: string) {
  // remove trailing slash except root
  if (pathname.length > 1 && pathname.endsWith("/")) return pathname.slice(0, -1);
  return pathname;
}

// "inside" means same section: "/invoices" should match "/invoices/123", "/invoices/create", etc.
function isInside(pathname: string, baseHref: string) {
  const p = normalizePath(pathname);
  const b = normalizePath(baseHref);
  return p === b || p.startsWith(b + "/");
}

function getActiveGroupTitles(pathname: string) {
  const active: string[] = [];
  for (const item of navigation) {
    if (!item.children) continue;
    if (item.children.some((c) => isInside(pathname, c.href))) active.push(item.title);
  }
  return active;
}

export function AppSidebar() {
  const location = useLocation();
  const { profile, signOut } = useAuth() as any;

  // Route-derived open groups (auto-open)
  const routeOpen = useMemo(() => getActiveGroupTitles(location.pathname), [location.pathname]);

  // Manual toggles (user-controlled) — combined with routeOpen
  const [manualOpen, setManualOpen] = useState<string[]>([]);

  // When route changes, ensure the active group is open (premium feel)
  useEffect(() => {
    setManualOpen((prev) => Array.from(new Set([...prev, ...routeOpen])));
  }, [routeOpen]);

  const isGroupOpen = (title: string) => manualOpen.includes(title) || routeOpen.includes(title);

  const toggleGroup = (title: string) => {
    setManualOpen((prev) => (prev.includes(title) ? prev.filter((x) => x !== title) : [...prev, title]));
  };

  const sidebarBase =
    "fixed left-0 top-0 z-30 flex h-screen w-64 shrink-0 flex-col border-r";
  const sidebarVisual =
    "bg-slate-950 text-white border-white/10";
  const sidebarToken =
    "bg-sidebar text-sidebar-foreground border-sidebar-border";

  return (
    <aside className={cn(sidebarBase, sidebarVisual, sidebarToken)}>
      {/* Premium top glow */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/10 to-transparent" />

      {/* Logo */}
      <div className="relative flex h-16 items-center gap-3 px-6 border-b border-white/10 border-sidebar-border">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 bg-sidebar-primary shadow-[0_10px_30px_rgba(0,0,0,.35)]">
          <Package className="h-5 w-5 text-white text-sidebar-primary-foreground" />
        </div>

        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold tracking-wide">Ram Pottery Hub</span>
          <span className="text-xs opacity-70">Accounting</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-1">
          {navigation.map((item) => {
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

                    {/* tiny accent bar on active */}
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

                  {/* Premium animated submenu */}
                  <CollapsibleContent
                    className={cn(
                      "overflow-hidden",
                      // shadcn CollapsibleContent sets CSS var --radix-collapsible-content-height
                      // we animate with those vars for smooth open/close
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
            {(profile?.full_name || profile?.email || "U")?.charAt(0)?.toUpperCase?.() || "U"}
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{profile?.full_name || profile?.email || "User"}</p>
            <p className="text-xs opacity-70 truncate">{profile?.email || ""}</p>
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={signOut}
            className="h-8 w-8 rounded-xl text-white/70 hover:text-white hover:bg-white/10 hover:bg-sidebar-border"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Local keyframes (no need to edit tailwind config) */}
      <style>{`
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
      `}</style>
    </aside>
  );
}

