// src/pages/Users.tsx
import React, { useMemo, useState } from "react";
import { format } from "date-fns";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Copy,
  Crown,
  Lock,
  MoreHorizontal,
  RefreshCw,
  Search,
  Settings2,
  Shield,
  Trash2,
  UserPlus,
} from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/* =========================
   Roles + Permissions Model
========================= */
type AppRole = "admin" | "manager" | "accountant" | "sales" | "viewer";
type PermissionKey =
  | "ap.view"
  | "ap.bills"
  | "ap.payments"
  | "ar.view"
  | "ar.invoices"
  | "stock.view"
  | "stock.edit"
  | "customers.view"
  | "customers.edit"
  | "reports.view"
  | "settings.view"
  | "settings.edit"
  | "users.manage";

const roleConfig: Record<AppRole, { label: string; className: string; icon?: JSX.Element }> = {
  admin: {
    label: "Admin",
    className: "bg-amber-500/10 text-amber-700 border-amber-200",
    icon: <Crown className="h-4 w-4" />,
  },
  manager: { label: "Manager", className: "bg-primary/10 text-primary border-primary/20" },
  accountant: { label: "Accountant", className: "bg-sky-500/10 text-sky-700 border-sky-200" },
  sales: { label: "Sales", className: "bg-emerald-500/10 text-emerald-700 border-emerald-200" },
  viewer: { label: "Viewer", className: "bg-muted text-muted-foreground border-slate-200" },
};

const permissionGroups: Array<{
  title: string;
  desc: string;
  items: { key: PermissionKey; label: string; hint: string }[];
}> = [
  {
    title: "Accounts Payable (Suppliers)",
    desc: "Bills, payments, supplier ledger",
    items: [
      { key: "ap.view", label: "View AP", hint: "Can view suppliers, bills & payments" },
      { key: "ap.bills", label: "Create/Edit Bills", hint: "Can create supplier bills" },
      { key: "ap.payments", label: "Record Payments", hint: "Can record supplier payments" },
    ],
  },
  {
    title: "Accounts Receivable (Customers)",
    desc: "Invoices & customer operations",
    items: [
      { key: "ar.view", label: "View AR", hint: "Can view invoices & customers" },
      { key: "ar.invoices", label: "Create/Edit Invoices", hint: "Can create customer invoices" },
    ],
  },
  {
    title: "Stock",
    desc: "Products, movement, adjustments",
    items: [
      { key: "stock.view", label: "View Stock", hint: "Can view stock & products" },
      { key: "stock.edit", label: "Edit Stock", hint: "Can create/edit products and stock adjustments" },
    ],
  },
  {
    title: "Customers",
    desc: "Customer register",
    items: [
      { key: "customers.view", label: "View Customers", hint: "Can view customer register" },
      { key: "customers.edit", label: "Edit Customers", hint: "Can create/edit customers" },
    ],
  },
  {
    title: "Reports",
    desc: "Dashboards and statements",
    items: [{ key: "reports.view", label: "View Reports", hint: "Can view analytics & reports" }],
  },
  {
    title: "System",
    desc: "Settings and security",
    items: [
      { key: "settings.view", label: "View Settings", hint: "Can view system settings" },
      { key: "settings.edit", label: "Edit Settings", hint: "Can change settings" },
      { key: "users.manage", label: "Manage Users", hint: "Can create users, set roles & permissions" },
    ],
  },
];

type UserRow = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  role: AppRole;
  is_active: boolean;
  permissions: Record<string, boolean>;
  created_at: string;
};

function normalizeRole(v: any): AppRole {
  const x = String(v || "").toLowerCase();
  if (x === "admin" || x === "manager" || x === "accountant" || x === "sales" || x === "viewer") return x as AppRole;
  return "viewer";
}
function s(v: any) {
  return String(v ?? "").trim();
}
function isEmail(v: string) {
  const x = v.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x);
}

/* =========================
   SECURITY: permissions sanitize
========================= */
const ALL_PERMISSION_KEYS: PermissionKey[] = permissionGroups.flatMap((g) => g.items.map((i) => i.key));

function sanitizePerms(input: Record<string, boolean> | null | undefined): Record<string, boolean> {
  const src = input || {};
  const out: Record<string, boolean> = {};
  for (const k of ALL_PERMISSION_KEYS) out[k] = !!(src as any)[k];
  return out;
}

/* =========================
   Permission presets
========================= */
function presetForRole(role: AppRole): Record<string, boolean> {
  const all = Object.fromEntries(ALL_PERMISSION_KEYS.map((k) => [k, true])) as Record<string, boolean>;

  if (role === "admin") return all;
  if (role === "manager") return { ...all, "settings.edit": false, "users.manage": false };

  if (role === "accountant") {
    return {
      "ap.view": true,
      "ap.bills": true,
      "ap.payments": true,
      "ar.view": true,
      "ar.invoices": false,
      "stock.view": true,
      "stock.edit": false,
      "customers.view": true,
      "customers.edit": false,
      "reports.view": true,
      "settings.view": true,
      "settings.edit": false,
      "users.manage": false,
    };
  }

  if (role === "sales") {
    return {
      "ap.view": false,
      "ap.bills": false,
      "ap.payments": false,
      "ar.view": true,
      "ar.invoices": true,
      "stock.view": true,
      "stock.edit": false,
      "customers.view": true,
      "customers.edit": true,
      "reports.view": true,
      "settings.view": false,
      "settings.edit": false,
      "users.manage": false,
    };
  }

  // viewer: only *.view
  return Object.fromEntries(ALL_PERMISSION_KEYS.map((k) => [k, k.endsWith(".view")])) as Record<string, boolean>;
}

/* =========================
   Hardened fetch helper
========================= */
function getRpUserHeaderFromStorage() {
  return localStorage.getItem("x-rp-user") || localStorage.getItem("rp_user") || localStorage.getItem("rp-user") || "";
}

class ApiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

async function safeJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text || !text.trim()) throw new ApiError(`Empty server response (HTTP ${res.status}).`, res.status);

  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    const snippet = text.slice(0, 220).replace(/\s+/g, " ").trim();
    throw new ApiError(
      `Server did not return JSON (HTTP ${res.status}). Response: "${snippet}${text.length > 220 ? "…" : ""}"`,
      res.status
    );
  }

  if (!res.ok) throw new ApiError(data?.error || `Request failed (HTTP ${res.status})`, res.status);
  return data as T;
}

async function safeGetJson<T>(url: string, rpUserHeader?: string): Promise<T> {
  const rp = s(rpUserHeader) || s(getRpUserHeaderFromStorage());

  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: {
        ...(rp ? { "x-rp-user": rp } : {}),
      },
    });
  } catch {
    throw new ApiError("API not reachable. Start backend: `npm run dev:server` (and keep Vite running).", 0);
  }

  return safeJson<T>(res);
}

async function safePostJson<T>(url: string, payload: any, rpUserHeader?: string): Promise<T> {
  const rp = s(rpUserHeader) || s(getRpUserHeaderFromStorage());

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(rp ? { "x-rp-user": rp } : {}),
      },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new ApiError("API not reachable. Start backend: `npm run dev:server` (and keep Vite running).", 0);
  }

  return safeJson<T>(res);
}

/* =========================
   Admin API calls
========================= */
async function apiListUsers(rpUserHeader?: string): Promise<UserRow[]> {
  const json = await safeGetJson<{ ok: boolean; error?: string; users?: any[] }>("/api/admin/users/list", rpUserHeader);
  if (!json?.ok) throw new Error(json?.error || "Failed to load users");

  const users = (json.users || []).map((u: any) => {
    const role = normalizeRole(u.role);
    return {
      user_id: String(u.user_id || ""),
      full_name: u.full_name ?? null,
      email: u.email ?? null,
      role,
      is_active: typeof u.is_active === "boolean" ? u.is_active : true,
      permissions: sanitizePerms(u.permissions || presetForRole(role)),
      created_at: String(u.created_at || new Date().toISOString()),
    } as UserRow;
  });

  // stable ordering
  users.sort((a, b) => (a.full_name || a.email || "").localeCompare(b.full_name || b.email || ""));

  return users;
}

async function apiCreateUser(
  payload: {
    email: string;
    password?: string;
    full_name?: string;
    role: AppRole;
    is_active: boolean;
    permissions: Record<string, boolean>;
  },
  rpUserHeader?: string
) {
  const json = await safePostJson<{ ok: boolean; error?: string; user_id?: string; temp_password?: string | null }>(
    "/api/admin/users/create",
    payload,
    rpUserHeader
  );
  if (!json?.ok) throw new Error(json?.error || "Failed to create user");
  return json as { ok: true; user_id: string; temp_password: string | null };
}

async function apiUpdateUser(
  payload: {
    user_id: string;
    full_name?: string;
    role?: AppRole;
    is_active?: boolean;
    permissions?: Record<string, boolean>;
    reset_password?: string;
  },
  rpUserHeader?: string
) {
  const json = await safePostJson<{ ok: boolean; error?: string }>("/api/admin/users/update", payload, rpUserHeader);
  if (!json?.ok) throw new Error(json?.error || "Failed to update user");
  return json as { ok: true };
}

async function apiDeleteUser(user_id: string, rpUserHeader?: string) {
  const json = await safePostJson<{ ok: boolean; error?: string }>(
    "/api/admin/users/delete",
    { user_id },
    rpUserHeader
  );
  if (!json?.ok) throw new Error(json?.error || "Failed to delete user");
  return json as { ok: true };
}

/* =========================
   UI helpers
========================= */
function RoleBadge({ role }: { role: AppRole }) {
  const cfg = roleConfig[role];
  return (
    <Badge variant="secondary" className={"border " + cfg.className}>
      <span className="inline-flex items-center gap-2">
        {cfg.icon || <Shield className="h-4 w-4" />}
        {cfg.label}
      </span>
    </Badge>
  );
}

function PermissionMatrix({
  value,
  onChange,
  locked,
}: {
  value: Record<string, boolean>;
  onChange: (next: Record<string, boolean>) => void;
  locked?: boolean;
}) {
  const v = sanitizePerms(value);

  return (
    <div className="space-y-4">
      {permissionGroups.map((g) => (
        <Card key={g.title} className="shadow-premium">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{g.title}</CardTitle>
            <CardDescription>{g.desc}</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid gap-3 md:grid-cols-2">
              {g.items.map((it) => {
                const checked = !!v[it.key];
                return (
                  <div
                    key={it.key}
                    className="flex items-center justify-between rounded-xl border bg-background px-3 py-2 hover:bg-muted/20 transition"
                  >
                    <div className="min-w-0 pr-3">
                      <div className="text-sm font-medium">{it.label}</div>
                      <div className="text-xs text-muted-foreground">{it.hint}</div>
                    </div>
                    <Switch
                      checked={checked}
                      onCheckedChange={(x) => onChange({ ...v, [it.key]: !!x })}
                      disabled={!!locked}
                    />
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/* =========================
   Role change confirmation dialog
========================= */
function RoleResetConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description: string;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="rounded-xl border bg-muted/20 p-4 text-sm text-muted-foreground">
          Changing role will apply the new role’s default permission preset. You can fine-tune permissions after.
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="bg-red-600 text-white hover:bg-red-700"
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* =========================
   Page
========================= */
export default function Users() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const auth: any = useAuth();
  const isAdmin = !!auth?.isAdmin;
  const myUserId: string = auth?.user?.id || "";

  // ✅ must be UUID for Express validation
  const rpHeader = auth?.user?.id || "";

  // filters
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"ALL" | AppRole>("ALL");

  // dialogs
  const [openCreate, setOpenCreate] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);
  const [openDelete, setOpenDelete] = useState(false);

  // create form
  const [cEmail, setCEmail] = useState("");
  const [cName, setCName] = useState("");
  const [cPassword, setCPassword] = useState("");
  const [cRole, setCRole] = useState<AppRole>("viewer");
  const [cActive, setCActive] = useState(true);
  const [cPerm, setCPerm] = useState<Record<string, boolean>>(presetForRole("viewer"));

  // edit form
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [eName, setEName] = useState("");
  const [eRole, setERole] = useState<AppRole>("viewer");
  const [eActive, setEActive] = useState(true);
  const [ePerm, setEPerm] = useState<Record<string, boolean>>(presetForRole("viewer"));
  const [eResetPwd, setEResetPwd] = useState("");

  // delete
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);

  // temp password after create
  const [tempPwd, setTempPwd] = useState<string>("");

  // role reset confirm
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmCtx, setConfirmCtx] = useState<"create" | "edit">("create");
  const [pendingRole, setPendingRole] = useState<AppRole>("viewer");

  /* =========================
     DATA
  ========================= */
  const usersQ = useQuery({
    queryKey: ["admin_users_list"],
    queryFn: () => apiListUsers(rpHeader),
    enabled: isAdmin,
    staleTime: 10_000,
    refetchOnWindowFocus: false,
  });

  const rows = usersQ.data ?? [];
  const loading = usersQ.isLoading || usersQ.isFetching;

  const createM = useMutation({
    mutationFn: (payload: Parameters<typeof apiCreateUser>[0]) => apiCreateUser(payload, rpHeader),
    onSuccess: async (res) => {
      setTempPwd(res.temp_password || "");
      toast({
        title: "User created",
        description: res.temp_password
          ? "Temporary password generated — copy it from the dialog."
          : "User created successfully",
      });
      await qc.invalidateQueries({ queryKey: ["admin_users_list"] });
      if (!res.temp_password) setOpenCreate(false);
    },
    onError: (e: any) => {
      toast({ title: "Create failed", description: e?.message || "Failed to create user", variant: "destructive" });
    },
  });

  const updateM = useMutation({
    mutationFn: (payload: Parameters<typeof apiUpdateUser>[0]) => apiUpdateUser(payload, rpHeader),
    onSuccess: async () => {
      toast({ title: "Saved", description: "User updated successfully" });
      setOpenEdit(false);
      await qc.invalidateQueries({ queryKey: ["admin_users_list"] });
    },
    onError: (e: any) => {
      toast({ title: "Save failed", description: e?.message || "Failed to update user", variant: "destructive" });
    },
  });

  const deleteM = useMutation({
    mutationFn: (user_id: string) => apiDeleteUser(user_id, rpHeader),
    onSuccess: async () => {
      toast({ title: "Deleted", description: "User deleted successfully" });
      setOpenDelete(false);
      setDeleteTarget(null);
      await qc.invalidateQueries({ queryKey: ["admin_users_list"] });
    },
    onError: (e: any) => {
      toast({ title: "Delete failed", description: e?.message || "Failed to delete user", variant: "destructive" });
    },
  });

  const reload = async () => {
    await usersQ.refetch();
  };

  /* =========================
     KPIs + filtering
  ========================= */
  const kpis = useMemo(() => {
    const byRole = (r: AppRole) => rows.filter((u) => u.role === r).length;
    const active = rows.filter((u) => u.is_active).length;
    return {
      total: rows.length,
      active,
      admin: byRole("admin"),
      manager: byRole("manager"),
      accountant: byRole("accountant"),
      sales: byRole("sales"),
      viewer: byRole("viewer"),
    };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return rows
      .filter((u) => (roleFilter === "ALL" ? true : u.role === roleFilter))
      .filter((u) => {
        if (!q) return true;
        const name = (u.full_name || "").toLowerCase();
        const email = (u.email || "").toLowerCase();
        return name.includes(q) || email.includes(q) || u.user_id.toLowerCase().includes(q);
      });
  }, [rows, searchQuery, roleFilter]);

  /* =========================
     Dialog open helpers
  ========================= */
  const openCreateDialog = () => {
    if (!isAdmin) return;
    setTempPwd("");
    setCEmail("");
    setCName("");
    setCPassword("");
    setCRole("viewer");
    setCActive(true);
    setCPerm(presetForRole("viewer"));
    setOpenCreate(true);
  };

  const openEditDialog = (u: UserRow) => {
    if (!isAdmin) return;
    setEditing(u);
    setEName(u.full_name || "");
    setERole(u.role);
    setEActive(!!u.is_active);
    setEPerm(sanitizePerms(u.permissions || presetForRole(u.role)));
    setEResetPwd("");
    setOpenEdit(true);
  };

  const openDeleteDialog = (u: UserRow) => {
    if (!isAdmin) return;
    setDeleteTarget(u);
    setOpenDelete(true);
  };

  /* =========================
     Role change confirm
  ========================= */
  const requestRoleChange = (ctx: "create" | "edit", next: AppRole) => {
    const current = ctx === "create" ? cRole : eRole;
    if (next === current) return;
    setConfirmCtx(ctx);
    setPendingRole(next);
    setConfirmOpen(true);
  };

  const applyRoleChange = () => {
    const next = pendingRole;
    if (confirmCtx === "create") {
      setCRole(next);
      setCPerm(presetForRole(next));
    } else {
      setERole(next);
      setEPerm(presetForRole(next));
    }
  };

  /* =========================
     Actions
  ========================= */
  const handleCreate = async () => {
    if (!isAdmin) return toast({ title: "Forbidden", description: "Admin only", variant: "destructive" });

    const email = s(cEmail).toLowerCase();
    if (!email || !isEmail(email)) {
      return toast({ title: "Invalid email", description: "Enter a valid email address.", variant: "destructive" });
    }

    const pwd = s(cPassword);
    if (pwd && pwd.length < 8) {
      return toast({
        title: "Weak password",
        description: "Minimum 8 characters (or leave blank to auto-generate).",
        variant: "destructive",
      });
    }

    const enforcedPerm = cRole === "admin" ? presetForRole("admin") : sanitizePerms(cPerm);

    createM.mutate({
      email,
      password: pwd || undefined,
      full_name: s(cName) || undefined,
      role: cRole,
      is_active: !!cActive,
      permissions: enforcedPerm,
    });
  };

  const handleSaveEdit = async () => {
    if (!isAdmin || !editing) return;

    const newPwd = s(eResetPwd);
    if (newPwd && newPwd.length < 8) {
      return toast({ title: "Weak password", description: "Minimum 8 characters.", variant: "destructive" });
    }

    if (editing.user_id === myUserId && !eActive) {
      return toast({
        title: "Not allowed",
        description: "You cannot deactivate your own account.",
        variant: "destructive",
      });
    }

    const enforcedPerm = eRole === "admin" ? presetForRole("admin") : sanitizePerms(ePerm);

    updateM.mutate({
      user_id: editing.user_id,
      full_name: s(eName) || "",
      role: eRole,
      is_active: !!eActive,
      permissions: enforcedPerm,
      reset_password: newPwd || undefined,
    });
  };

  const handleDelete = async () => {
    if (!isAdmin || !deleteTarget) return;

    if (deleteTarget.user_id === myUserId) {
      return toast({
        title: "Not allowed",
        description: "You cannot delete your own account.",
        variant: "destructive",
      });
    }

    deleteM.mutate(deleteTarget.user_id);
  };

  /* =========================
     SECURE UI GUARD
  ========================= */
  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <Card className="shadow-premium overflow-hidden">
          <div className="border-b bg-gradient-to-r from-background to-muted/30 px-6 py-5">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-2xl border bg-muted/20 flex items-center justify-center">
                <Lock className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <div className="text-xl font-semibold tracking-tight">Access denied</div>
                <div className="text-sm text-muted-foreground">Only Admin can manage users and permissions.</div>
              </div>
            </div>
          </div>

          <CardContent className="p-6">
            <div className="rounded-xl border bg-muted/20 p-4 text-sm text-muted-foreground">
              Ask an administrator to grant you <b>users.manage</b> or switch your role to <b>Admin</b>.
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const busy = loading || createM.isPending || updateM.isPending || deleteM.isPending;

  return (
    <div className="space-y-6 animate-fade-in">
      <RoleResetConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Reset permissions?"
        description={`Switch role to "${roleConfig[pendingRole].label}"? This will reset the permission preset.`}
        onConfirm={applyRoleChange}
      />

      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <div className="text-3xl font-bold text-foreground tracking-tight">Users & Permissions</div>
          <div className="text-muted-foreground mt-1">Fast admin console • roles + permission matrix</div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={reload} disabled={loading}>
            <RefreshCw className={"h-4 w-4 mr-2 " + (loading ? "animate-spin" : "")} />
            {loading ? "Loading..." : "Refresh"}
          </Button>

          <Button className="bg-red-600 text-white hover:bg-red-700" onClick={openCreateDialog} disabled={busy}>
            <UserPlus className="h-4 w-4 mr-2" />
            Create User
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
        <Card className="shadow-premium">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Total</p>
            <p className="text-2xl font-bold mt-1">{kpis.total}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Active: <b>{kpis.active}</b>
            </p>
          </CardContent>
        </Card>

        {(["admin", "manager", "accountant", "sales", "viewer"] as AppRole[]).map((r) => (
          <Card key={r} className="shadow-premium">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">{roleConfig[r].label}s</p>
              <p className="text-2xl font-bold mt-1">{(kpis as any)[r]}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Register */}
      <Card className="shadow-premium overflow-hidden">
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>Register</CardTitle>
              <CardDescription>Create, disable, and control module access</CardDescription>
            </div>

            <div className="flex flex-wrap gap-2 items-center">
              <div className="relative w-72 max-w-full">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search name / email / ID..."
                  className="pl-10"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <select
                className="h-10 rounded-md border px-3 bg-background"
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as any)}
                title="Role filter"
              >
                <option value="ALL">All roles</option>
                <option value="admin">Admin</option>
                <option value="manager">Manager</option>
                <option value="accountant">Accountant</option>
                <option value="sales">Sales</option>
                <option value="viewer">Viewer</option>
              </select>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {usersQ.error ? (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4">
              <div className="text-sm font-semibold text-destructive">Failed to load users</div>
              <div className="mt-2 text-sm text-destructive/90 whitespace-pre-wrap">
                {(usersQ.error as any)?.message || "Unknown error"}
              </div>
              <div className="mt-3 text-xs text-muted-foreground">
                This page now loads from <b>/api/admin/users/list</b>. If it fails: check <b>npm run dev:server</b> and the
                <b> x-rp-user</b> header exists in localStorage.
              </div>
            </div>
          ) : loading ? (
            <div className="text-center py-10 text-muted-foreground">Loading users…</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <Shield className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
              <h3 className="font-semibold text-foreground mb-2">No users found</h3>
              <p className="text-muted-foreground">Create users with the button on top right</p>
            </div>
          ) : (
            <div className="rounded-xl border overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead className="w-[56px]" />
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {filtered.map((u) => {
                    const isMe = !!myUserId && u.user_id === myUserId;
                    return (
                      <TableRow key={u.user_id} className="hover:bg-muted/30">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                              {(u.full_name?.charAt(0) || u.email?.charAt(0) || "U").toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="font-medium truncate">
                                {u.full_name || "Unknown"}{" "}
                                {isMe ? (
                                  <span className="ml-2 text-[11px] px-2 py-0.5 rounded-full border bg-muted/20 text-muted-foreground">
                                    You
                                  </span>
                                ) : null}
                              </div>
                              <div className="text-xs text-muted-foreground truncate">ID: {u.user_id}</div>
                            </div>
                          </div>
                        </TableCell>

                        <TableCell className="text-muted-foreground">{u.email || "-"}</TableCell>

                        <TableCell>
                          <RoleBadge role={u.role} />
                        </TableCell>

                        <TableCell>
                          <span
                            className={
                              "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold " +
                              (u.is_active
                                ? "bg-emerald-500/10 text-emerald-700 border-emerald-200"
                                : "bg-slate-500/10 text-slate-600 border-slate-200")
                            }
                          >
                            {u.is_active ? "Active" : "Inactive"}
                          </span>
                        </TableCell>

                        <TableCell className="text-muted-foreground">
                          {u.created_at ? format(new Date(u.created_at), "MMM dd, yyyy") : "-"}
                        </TableCell>

                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8" disabled={busy}>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>

                            <DropdownMenuContent align="end" className="w-64">
                              <DropdownMenuItem onClick={() => openEditDialog(u)}>
                                <Settings2 className="h-4 w-4 mr-2" />
                                Edit / Update Access
                              </DropdownMenuItem>

                              <DropdownMenuItem
                                disabled={isMe}
                                onClick={async () => {
                                  try {
                                    await apiUpdateUser({ user_id: u.user_id, is_active: !u.is_active }, rpHeader);
                                    toast({
                                      title: "Updated",
                                      description: u.is_active ? "User deactivated" : "User activated",
                                    });
                                    await qc.invalidateQueries({ queryKey: ["admin_users_list"] });
                                  } catch (e: any) {
                                    toast({
                                      title: "Error",
                                      description: e?.message || "Failed",
                                      variant: "destructive",
                                    });
                                  }
                                }}
                              >
                                {u.is_active ? "Deactivate" : "Activate"}
                                {isMe ? <span className="ml-auto text-xs text-muted-foreground">(disabled)</span> : null}
                              </DropdownMenuItem>

                              <DropdownMenuSeparator />

                              <DropdownMenuItem
                                className="text-destructive"
                                disabled={isMe}
                                onClick={() => openDeleteDialog(u)}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete User
                                {isMe ? <span className="ml-auto text-xs text-muted-foreground">(disabled)</span> : null}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="mt-4 text-xs text-muted-foreground">
            Admin mutations go through <b>/api/admin/users/*</b>. If you see “API not reachable”, start{" "}
            <b>npm run dev:server</b>.
          </div>
        </CardContent>
      </Card>

      {/* ========================= CREATE USER ========================= */}
      <Dialog open={openCreate} onOpenChange={setOpenCreate}>
        <DialogContent className="sm:max-w-[680px] max-h-[85vh] overflow-hidden p-0 flex flex-col">
          <DialogHeader className="px-6 pt-6 pb-3 border-b">
            <DialogTitle>Create User</DialogTitle>
            <DialogDescription>Create login access and assign role + module permissions.</DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            {tempPwd ? (
              <div className="mb-5 rounded-xl border bg-amber-500/10 p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-700 mt-0.5" />
                  <div className="min-w-0">
                    <div className="font-semibold text-amber-900">Temporary password generated</div>
                    <div className="text-sm text-amber-900/80 mt-1">
                      Copy this now and send it securely to the user. You won’t see it again.
                    </div>

                    <div className="mt-3 flex items-center gap-2 flex-wrap">
                      <code className="px-3 py-2 rounded-lg border bg-background font-mono text-sm">{tempPwd}</code>

                      <Button
                        variant="outline"
                        className="h-9"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(tempPwd);
                            toast({ title: "Copied", description: "Temporary password copied to clipboard." });
                          } catch {
                            toast({
                              title: "Copy failed",
                              description: "Clipboard blocked by browser.",
                              variant: "destructive",
                            });
                          }
                        }}
                      >
                        <Copy className="h-4 w-4 mr-2" />
                        Copy
                      </Button>

                      <Button
                        className="h-9 bg-red-600 text-white hover:bg-red-700"
                        onClick={() => {
                          setTempPwd("");
                          setOpenCreate(false);
                        }}
                      >
                        Done
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="grid gap-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-3">
                  <div>
                    <Label>Email *</Label>
                    <Input
                      value={cEmail}
                      onChange={(e) => setCEmail(e.target.value)}
                      placeholder="user@company.mu"
                      autoComplete="off"
                    />
                    <div className="text-xs text-muted-foreground mt-1">Must be a valid email for Supabase Auth.</div>
                  </div>

                  <div>
                    <Label>Full Name</Label>
                    <Input value={cName} onChange={(e) => setCName(e.target.value)} placeholder="John Doe" />
                  </div>

                  <div>
                    <Label>Password (optional)</Label>
                    <Input
                      type="password"
                      value={cPassword}
                      onChange={(e) => setCPassword(e.target.value)}
                      placeholder="Leave empty to auto-generate"
                      autoComplete="new-password"
                    />
                    <div className="text-xs text-muted-foreground mt-1">Min 8 chars if you set one.</div>
                  </div>
                </div>

                <div className="grid gap-3">
                  <div>
                    <Label>Role</Label>
                    <select
                      className="h-10 rounded-md border px-3 bg-background w-full"
                      value={cRole}
                      onChange={(e) => requestRoleChange("create", e.target.value as AppRole)}
                    >
                      <option value="admin">Admin — Full access</option>
                      <option value="manager">Manager</option>
                      <option value="accountant">Accountant</option>
                      <option value="sales">Sales</option>
                      <option value="viewer">Viewer</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <Switch checked={cActive} onCheckedChange={setCActive} />
                    <span className="text-sm text-muted-foreground">Active</span>
                  </div>

                  <div className="rounded-xl border bg-muted/20 p-3 text-sm">
                    <div className="font-medium">Security notes</div>
                    <div className="text-muted-foreground text-xs mt-1">
                      Admin always receives full permissions. Permission keys are sanitized to prevent injection.
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <div className="text-sm font-semibold mb-2">Permissions</div>
                <PermissionMatrix value={cPerm} onChange={setCPerm} locked={cRole === "admin"} />
              </div>
            </div>
          </div>

          <DialogFooter className="px-6 py-4 border-t">
            <Button variant="outline" onClick={() => setOpenCreate(false)} disabled={createM.isPending}>
              Cancel
            </Button>
            <Button
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={handleCreate}
              disabled={createM.isPending}
            >
              {createM.isPending ? "Creating..." : "Create User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========================= EDIT USER ========================= */}
      <Dialog
        open={openEdit}
        onOpenChange={(v) => {
          setOpenEdit(v);
          if (!v) setEditing(null);
        }}
      >
        <DialogContent className="sm:max-w-[860px] max-h-[85vh] overflow-hidden p-0 flex flex-col">
          <DialogHeader className="px-6 pt-6 pb-3 border-b">
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>Update role, status, permissions and reset password (optional).</DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            {editing ? (
              <div className="grid gap-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="grid gap-3">
                    <div>
                      <Label>Full Name</Label>
                      <Input value={eName} onChange={(e) => setEName(e.target.value)} placeholder="Full name" />
                    </div>

                    <div>
                      <Label>Reset Password (optional)</Label>
                      <Input
                        type="password"
                        value={eResetPwd}
                        onChange={(e) => setEResetPwd(e.target.value)}
                        placeholder="Min 8 chars • leave empty to keep"
                        autoComplete="new-password"
                      />
                    </div>

                    <div className="text-xs text-muted-foreground break-all">
                      User ID: <span className="font-mono">{editing.user_id}</span>
                    </div>
                  </div>

                  <div className="grid gap-3">
                    <div>
                      <Label>Role</Label>
                      <select
                        className="h-10 rounded-md border px-3 bg-background w-full"
                        value={eRole}
                        onChange={(e) => requestRoleChange("edit", e.target.value as AppRole)}
                      >
                        <option value="admin">Admin — Full access</option>
                        <option value="manager">Manager</option>
                        <option value="accountant">Accountant</option>
                        <option value="sales">Sales</option>
                        <option value="viewer">Viewer</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-3 pt-2">
                      <Switch checked={eActive} onCheckedChange={setEActive} disabled={editing.user_id === myUserId} />
                      <span className="text-sm text-muted-foreground">
                        Active {editing.user_id === myUserId ? "(cannot change your own status)" : ""}
                      </span>
                    </div>

                    <div className="rounded-xl border bg-muted/20 p-3 text-xs text-muted-foreground">
                      Changing role resets the permission preset. You can fine-tune below (except Admin).
                    </div>
                  </div>
                </div>

                <div>
                  <div className="text-sm font-semibold mb-2">Permissions</div>
                  <PermissionMatrix value={ePerm} onChange={setEPerm} locked={eRole === "admin"} />
                </div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">No user selected.</div>
            )}
          </div>

          <DialogFooter className="px-6 py-4 border-t">
            <Button variant="outline" onClick={() => setOpenEdit(false)} disabled={updateM.isPending}>
              Cancel
            </Button>
            <Button
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={handleSaveEdit}
              disabled={updateM.isPending || !editing}
            >
              {updateM.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========================= DELETE USER ========================= */}
      <Dialog open={openDelete} onOpenChange={setOpenDelete}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Delete User</DialogTitle>
            <DialogDescription>This removes the user. This action cannot be undone.</DialogDescription>
          </DialogHeader>

          <div className="rounded-xl border bg-muted/20 p-4 text-sm">
            <div className="font-medium">{deleteTarget?.full_name || "Unknown user"}</div>
            <div className="text-xs text-muted-foreground">{deleteTarget?.email || "-"}</div>
            <div className="text-xs text-muted-foreground mt-1 break-all">
              ID: <span className="font-mono">{deleteTarget?.user_id}</span>
            </div>
            {deleteTarget?.user_id === myUserId ? (
              <div className="mt-3 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive">
                You cannot delete your own account.
              </div>
            ) : null}
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setOpenDelete(false)} disabled={deleteM.isPending}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteM.isPending || !deleteTarget || deleteTarget.user_id === myUserId}
            >
              {deleteM.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

