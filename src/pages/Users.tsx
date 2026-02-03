import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import {
  Search,
  Shield,
  MoreHorizontal,
  UserPlus,
  KeyRound,
  Settings2,
  Crown,
  Lock,
  CheckCircle2,
  Trash2,
} from "lucide-react";

/* =========================
   Roles + Permissions Model
========================= */
type AppRole = "admin" | "manager" | "accountant" | "sales" | "viewer";

const roleConfig: Record<AppRole, { label: string; className: string; icon?: React.ReactNode }> = {
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
    desc: "Products, warehouses, movement",
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

/* =========================
   DB rows
   profiles: id(uuid), role(text), full_name(text), created_at(timestamptz)
   rp_users: user_id(uuid), username(email), permissions(jsonb), is_active(bool)
========================= */
type ProfileRow = {
  id: string; // UUID
  role: string | null;
  full_name: string | null;
  created_at: string;
};

type RpUserRow = {
  user_id: string | null;
  username: string | null; // email/login
  name: string | null;
  role: string | null;
  permissions: Record<string, boolean> | null;
  is_active: boolean | null;
  created_at: string;
};

type UserRow = {
  user_id: string; // UUID
  full_name: string | null;
  email: string | null;
  role: AppRole;
  is_active: boolean;
  permissions: Record<string, boolean>;
  created_at: string;
};

function s(v: any) {
  return String(v ?? "").trim();
}

/* =========================
   Admin API calls
========================= */
async function apiCreateUser(payload: {
  email: string;
  password?: string;
  full_name?: string;
  role: AppRole;
  is_active: boolean;
  permissions: Record<string, boolean>;
}) {
  const res = await fetch("/api/admin/users/create", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!json?.ok) throw new Error(json?.error || "Failed to create user");
  return json as { ok: true; user_id: string; temp_password: string | null };
}

async function apiUpdateUser(payload: {
  user_id: string;
  full_name?: string;
  role?: AppRole;
  is_active?: boolean;
  permissions?: Record<string, boolean>;
  reset_password?: string;
}) {
  const res = await fetch("/api/admin/users/update", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!json?.ok) throw new Error(json?.error || "Failed to update user");
  return json as { ok: true };
}

async function apiDeleteUser(user_id: string) {
  const res = await fetch("/api/admin/users/delete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ user_id }),
  });
  const json = await res.json();
  if (!json?.ok) throw new Error(json?.error || "Failed to delete user");
  return json as { ok: true };
}

/* =========================
   Permission presets
========================= */
function presetForRole(role: AppRole): Record<string, boolean> {
  const all = Object.fromEntries(permissionGroups.flatMap((g) => g.items.map((i) => [i.key, true]))) as Record<
    string,
    boolean
  >;

  if (role === "admin") return all;

  if (role === "manager") {
    return { ...all, "settings.edit": false, "users.manage": false };
  }

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

  // viewer
  return Object.fromEntries(permissionGroups.flatMap((g) => g.items.map((i) => [i.key, i.key.endsWith(".view")]))) as Record<
    string,
    boolean
  >;
}

function normalizeRole(v: any): AppRole {
  const x = String(v || "").toLowerCase();
  if (x === "admin" || x === "manager" || x === "accountant" || x === "sales" || x === "viewer") return x as AppRole;
  return "viewer";
}

/* =========================
   Fetch users joined:
   - profiles.id + profiles.role + profiles.full_name + profiles.created_at
   - rp_users.user_id + rp_users.username(email) + perms + is_active
========================= */
async function fetchUsersJoined(): Promise<UserRow[]> {
  const { data: profiles, error: pErr } = await supabase
    .from("profiles")
    .select("id,role,full_name,created_at")
    .order("full_name", { ascending: true });

  if (pErr) throw pErr;

  const { data: rpUsers } = await supabase
    .from("rp_users")
    .select("user_id,username,permissions,is_active,role,name,created_at");

  const rpMap = new Map<string, RpUserRow>();
  (rpUsers as any[] | null)?.forEach((r) => {
    if (r?.user_id) rpMap.set(r.user_id, r as RpUserRow);
  });

  return (profiles as ProfileRow[]).map((p) => {
    const rp = rpMap.get(p.id);
    const role = normalizeRole(rp?.role ?? p.role);

    return {
      user_id: p.id,
      full_name: p.full_name ?? rp?.name ?? null,
      email: rp?.username ?? null,
      role,
      is_active: typeof rp?.is_active === "boolean" ? rp.is_active : true,
      permissions: (rp?.permissions as any) || presetForRole(role),
      created_at: p.created_at,
    };
  });
}

/* =========================
   UI components
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
                const checked = !!value[it.key];
                return (
                  <div key={it.key} className="flex items-center justify-between rounded-lg border bg-background px-3 py-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{it.label}</div>
                      <div className="text-xs text-muted-foreground">{it.hint}</div>
                    </div>
                    <Switch
                      checked={checked}
                      onCheckedChange={(v) => onChange({ ...value, [it.key]: !!v })}
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
   Page
========================= */
export default function Users() {
  const { toast } = useToast();
  const { isAdmin } = useAuth();

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<UserRow[]>([]);
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
  const [creating, setCreating] = useState(false);

  // edit form
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [eName, setEName] = useState("");
  const [eRole, setERole] = useState<AppRole>("viewer");
  const [eActive, setEActive] = useState(true);
  const [ePerm, setEPerm] = useState<Record<string, boolean>>({});
  const [eResetPwd, setEResetPwd] = useState("");
  const [saving, setSaving] = useState(false);

  // delete target
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function reload() {
    setLoading(true);
    try {
      const data = await fetchUsersJoined();
      setRows(data);
    } catch (e: any) {
      toast({ title: "Error", description: e?.message || "Failed to load users", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        return name.includes(q) || email.includes(q);
      });
  }, [rows, searchQuery, roleFilter]);

  function openCreateDialog() {
    setCEmail("");
    setCName("");
    setCPassword("");
    setCRole("viewer");
    setCActive(true);
    setCPerm(presetForRole("viewer"));
    setOpenCreate(true);
  }

  function openEditDialog(user: UserRow) {
    setEditing(user);
    setEName(user.full_name || "");
    setERole(user.role);
    setEActive(!!user.is_active);
    setEPerm({ ...(user.permissions || presetForRole(user.role)) });
    setEResetPwd("");
    setOpenEdit(true);
  }

  function openDeleteDialog(user: UserRow) {
    setDeleteTarget(user);
    setOpenDelete(true);
  }

  async function handleCreate() {
    if (!isAdmin) {
      return toast({ title: "Forbidden", description: "Admin only", variant: "destructive" });
    }
    const email = s(cEmail).toLowerCase();
    if (!email) return toast({ title: "Missing", description: "Email is required", variant: "destructive" });

    setCreating(true);
    try {
      const enforcedPerm = cRole === "admin" ? presetForRole("admin") : cPerm;

      const res = await apiCreateUser({
        email,
        password: s(cPassword) || undefined,
        full_name: s(cName) || undefined,
        role: cRole,
        is_active: cActive,
        permissions: enforcedPerm,
      });

      toast({
        title: "User created",
        description: res.temp_password ? `Temporary password: ${res.temp_password} (copy it now)` : "User created successfully",
      });

      setOpenCreate(false);
      await reload();
    } catch (e: any) {
      toast({ title: "Error", description: e?.message || "Failed to create user", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  }

  async function handleSaveEdit() {
    if (!isAdmin || !editing) return;

    setSaving(true);
    try {
      const enforcedPerm = eRole === "admin" ? presetForRole("admin") : ePerm;

      await apiUpdateUser({
        user_id: editing.user_id,
        full_name: s(eName) || "",
        role: eRole,
        is_active: eActive,
        permissions: enforcedPerm,
        reset_password: s(eResetPwd) || undefined,
      });

      toast({ title: "Saved", description: "User updated successfully" });
      setOpenEdit(false);
      await reload();
    } catch (e: any) {
      toast({ title: "Error", description: e?.message || "Failed to update user", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!isAdmin || !deleteTarget) return;

    setDeleting(true);
    try {
      await apiDeleteUser(deleteTarget.user_id);
      toast({ title: "Deleted", description: "User deleted successfully" });
      setOpenDelete(false);
      setDeleteTarget(null);
      await reload();
    } catch (e: any) {
      toast({ title: "Error", description: e?.message || "Failed to delete user", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-3xl font-bold text-foreground tracking-tight">Users & Permissions</div>
          <div className="text-muted-foreground mt-1">
            Premium access control • Roles + permission matrix • Admin-only actions
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={reload} disabled={loading}>
            <CheckCircle2 className="h-4 w-4 mr-2" />
            {loading ? "Loading..." : "Refresh"}
          </Button>

          {isAdmin ? (
            <Button className="gradient-primary shadow-glow text-primary-foreground" onClick={openCreateDialog}>
              <UserPlus className="h-4 w-4 mr-2" />
              Create User
            </Button>
          ) : (
            <Button variant="outline" disabled title="Admin only">
              <Lock className="h-4 w-4 mr-2" />
              Admin Only
            </Button>
          )}
        </div>
      </div>

      {/* KPI */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
        <Card className="shadow-premium">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Total Users</p>
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
      <Card className="shadow-premium">
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>All Users</CardTitle>
              <CardDescription>Create, edit, disable and control module access</CardDescription>
            </div>

            <div className="flex flex-wrap gap-2 items-center">
              <div className="relative w-72">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search name / email..."
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
          {loading ? (
            <div className="text-center py-10 text-muted-foreground">Loading users…</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <Shield className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
              <h3 className="font-semibold text-foreground mb-2">No users found</h3>
              <p className="text-muted-foreground">Create users with the button on top right</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="w-[56px]"></TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {filtered.map((u) => (
                  <TableRow key={u.user_id} className="hover:bg-muted/30">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                          {u.full_name?.charAt(0) || u.email?.charAt(0) || "U"}
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium truncate">{u.full_name || "Unknown"}</div>
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
                      {isAdmin ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>

                          <DropdownMenuContent align="end" className="w-60">
                            <DropdownMenuItem onClick={() => openEditDialog(u)}>
                              <Settings2 className="h-4 w-4 mr-2" />
                              Edit / Update Access
                            </DropdownMenuItem>

                            <DropdownMenuItem
                              onClick={async () => {
                                try {
                                  await apiUpdateUser({ user_id: u.user_id, is_active: !u.is_active });
                                  toast({
                                    title: "Updated",
                                    description: u.is_active ? "User deactivated" : "User activated",
                                  });
                                  await reload();
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
                            </DropdownMenuItem>

                            <DropdownMenuSeparator />

                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => openDeleteDialog(u)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete User
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <div className="mt-4 text-xs text-muted-foreground">
            Admin actions use secure server routes (service-role). Profiles store role + name; rp_users stores permissions + active + login.
          </div>
        </CardContent>
      </Card>

      {/* ========================= CREATE USER ========================= */}
      <Dialog open={openCreate} onOpenChange={setOpenCreate}>
  <DialogContent className="sm:max-w-[520px]">
    <DialogHeader>
      <DialogTitle>Create User</DialogTitle>
      <DialogDescription>
        Create login access and assign role
      </DialogDescription>
    </DialogHeader>

    <div className="grid gap-4">
      {/* Identity */}
      <div className="grid gap-3">
        <div>
          <Label>Email *</Label>
          <Input
            value={cEmail}
            onChange={(e) => setCEmail(e.target.value)}
            placeholder="user@company.mu"
          />
        </div>

        <div>
          <Label>Full Name</Label>
          <Input
            value={cName}
            onChange={(e) => setCName(e.target.value)}
            placeholder="John Doe"
          />
        </div>

        <div>
          <Label>Password (optional)</Label>
          <Input
            type="password"
            value={cPassword}
            onChange={(e) => setCPassword(e.target.value)}
            placeholder="Auto-generate if empty"
          />
        </div>
      </div>

      {/* Role */}
      <div className="grid gap-3">
        <Label>Role</Label>
        <select
          className="h-10 rounded-md border px-3 bg-background"
          value={cRole}
          onChange={(e) => {
            const r = e.target.value as AppRole;
            setCRole(r);
            setCPerm(presetForRole(r));
          }}
        >
          <option value="admin">Admin — Full access</option>
          <option value="manager">Manager</option>
          <option value="accountant">Accountant</option>
          <option value="sales">Sales</option>
          <option value="viewer">Viewer</option>
        </select>
      </div>

      {/* Status */}
      <div className="flex items-center gap-3">
        <Switch checked={cActive} onCheckedChange={setCActive} />
        <span className="text-sm text-muted-foreground">Active</span>
      </div>
    </div>

    <DialogFooter className="mt-4">
      <Button variant="outline" onClick={() => setOpenCreate(false)}>
        Cancel
      </Button>
      <Button
        className="gradient-primary shadow-glow text-primary-foreground"
        onClick={handleCreate}
        disabled={creating}
      >
        Create User
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>

      {/* ========================= EDIT USER ========================= */}
      <Dialog open={openEdit} onOpenChange={setOpenEdit}>
        <DialogContent className="sm:max-w-[860px]">
          <DialogHeader>
            <DialogTitle>Update User</DialogTitle>
            <DialogDescription>{editing ? `${editing.full_name || editing.email} • ${editing.email || "-"}` : "—"}</DialogDescription>
          </DialogHeader>

          {!editing ? null : (
            <div className="grid gap-4">
              <Card className="shadow-premium">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Account</CardTitle>
                  <CardDescription>Status + role + password</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Full Name</Label>
                    <Input value={eName} onChange={(e) => setEName(e.target.value)} />
                  </div>

                  <div className="space-y-2">
                    <Label>Role</Label>
                    <select
                      className="h-10 w-full rounded-md border px-3 bg-background"
                      value={eRole}
                      onChange={(e) => {
                        const r = e.target.value as AppRole;
                        setERole(r);
                        setEPerm(presetForRole(r));
                      }}
                    >
                      <option value="admin">Admin — Full access</option>
                      <option value="manager">Manager — Operations</option>
                      <option value="accountant">Accountant — Finance</option>
                      <option value="sales">Sales — Invoices</option>
                      <option value="viewer">Viewer — Read only</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <Label>Status</Label>
                    <div className="flex items-center gap-3 rounded-lg border px-3 py-2">
                      <Switch checked={eActive} onCheckedChange={(v) => setEActive(!!v)} />
                      <span className="text-sm text-muted-foreground">Active</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Reset Password (optional)</Label>
                    <div className="relative">
                      <KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        className="pl-10"
                        value={eResetPwd}
                        onChange={(e) => setEResetPwd(e.target.value)}
                        placeholder="Leave empty to keep unchanged"
                        type="password"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <PermissionMatrix value={ePerm} onChange={setEPerm} locked={eRole === "admin"} />
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpenEdit(false)}>
              Cancel
            </Button>
            <Button className="gradient-primary shadow-glow text-primary-foreground" onClick={handleSaveEdit} disabled={saving || !editing}>
              {saving ? "Saving..." : "Update User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========================= DELETE CONFIRM ========================= */}
      <Dialog open={openDelete} onOpenChange={setOpenDelete}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="text-destructive">Delete User</DialogTitle>
            <DialogDescription>
              This will permanently remove the user from Auth + profiles + rp_users.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="text-sm font-semibold">{deleteTarget?.full_name || "Unknown"}</div>
            <div className="text-xs text-muted-foreground">{deleteTarget?.email || "-"}</div>
            <div className="text-xs text-muted-foreground mt-1">ID: {deleteTarget?.user_id}</div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpenDelete(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting || !deleteTarget}>
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

