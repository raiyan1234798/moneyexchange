"use client";

import { useEffect, useState } from "react";
import { Plus, Copy, Users, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { DashboardHeader } from "@/components/layout/dashboard-sidebar";
import { BranchSelector } from "@/components/shared/branch-selector";
import {
  ContentPanel,
  DataTable,
  EmptyState,
  PageActions,
  PageShell,
  StatusBadge,
} from "@/components/shared/page-elements";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { COLLECTIONS, ROLE_LABELS } from "@/lib/constants";
import { subscribeCollection, where } from "@/lib/firebase/firestore";
import { subscribeBranches } from "@/lib/services/branch-service";
import { createUserInvite, provisionUserAccount } from "@/lib/services/manager-service";
import { normalizeEmail } from "@/lib/auth/user-profile";
import type { AppUser, Branch, UserInvite, UserRole } from "@/lib/types";

const emptyForm = {
  email: "",
  displayName: "",
  role: "branchManager" as "admin" | "branchManager" | "branchUser",
  branchId: "",
};

const MANAGED_ROLES: UserRole[] = ["admin", "branchManager", "branchUser"];

export default function ManagersPage() {
  const { user, profile, hasPermission } = useAuth();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [invites, setInvites] = useState<UserInvite[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [successDialog, setSuccessDialog] = useState<{ email: string; tempPassword?: string } | null>(null);

  useEffect(() => {
    const unsubUsers = subscribeCollection<AppUser>(
      COLLECTIONS.users,
      [where("role", "in", MANAGED_ROLES)],
      setUsers,
      (error) => toast.error(error.message || "Failed to load users"),
    );
    const unsubInvites = subscribeCollection<UserInvite>(
      COLLECTIONS.userInvites,
      [],
      setInvites,
      (error) => toast.error(error.message || "Failed to load invites"),
    );
    const unsubBranches = subscribeBranches(
      setBranches,
      (error) => toast.error(error.message || "Failed to load branches"),
    );
    return () => {
      unsubUsers();
      unsubInvites();
      unsubBranches();
    };
  }, []);

  const branchMap = Object.fromEntries(branches.map((branch) => [branch.id, branch.name]));
  const canManage = hasPermission("manageUsers");
  const needsBranch = form.role === "branchManager" || form.role === "branchUser";

  async function handleCreate() {
    if (!user || !profile || !form.email || !form.displayName) return;
    if (needsBranch && !form.branchId) {
      toast.error("Select a branch for this role");
      return;
    }

    setSubmitting(true);
    const normalizedEmail = normalizeEmail(form.email);
    const branchId = needsBranch ? form.branchId : null;

    try {
      await createUserInvite({
        email: normalizedEmail,
        displayName: form.displayName,
        role: form.role,
        branchId,
        createdBy: user.uid,
      });

      let tempPassword: string | undefined;
      try {
        const result = await provisionUserAccount({
          email: normalizedEmail,
          displayName: form.displayName,
          role: form.role,
          branchId,
        });
        tempPassword = result.temporaryPassword;
      } catch {
        // Invite record is enough for Google sign-in at /login
      }

      setOpen(false);
      setForm(emptyForm);
      setSuccessDialog({ email: normalizedEmail, tempPassword });
      toast.success(`${ROLE_LABELS[form.role]} invited — they can sign in at /login`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to invite user");
    } finally {
      setSubmitting(false);
    }
  }

  function copyPassword(password: string) {
    void navigator.clipboard.writeText(password);
    toast.success("Password copied");
  }

  return (
    <>
      <DashboardHeader
        title="Managers"
        description="Invite admins, branch managers, and branch users. Admins control all branches' media; branch users edit rates only."
        accent="rose"
      />
      <PageShell accent="rose">
        {canManage ? (
          <PageActions>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger render={<Button className="rounded-xl"><Plus className="mr-2 h-4 w-4" />Invite User</Button>} />
              <DialogContent className="rounded-2xl sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Invite User</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-2">
                  <div className="space-y-2">
                    <Label htmlFor="user-email">Email</Label>
                    <Input
                      id="user-email"
                      type="email"
                      placeholder="user@company.com"
                      value={form.email}
                      onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                      className="rounded-xl"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="user-name">Display name</Label>
                    <Input
                      id="user-name"
                      value={form.displayName}
                      onChange={(event) => setForm((prev) => ({ ...prev, displayName: event.target.value }))}
                      className="rounded-xl"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Role</Label>
                    <Select
                      value={form.role}
                      onValueChange={(value) =>
                        setForm((prev) => ({
                          ...prev,
                          role: value as typeof form.role,
                          branchId: value === "admin" ? "" : prev.branchId,
                        }))
                      }
                    >
                      <SelectTrigger className="rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin — all branches, media & view rates</SelectItem>
                        <SelectItem value="branchManager">Branch Manager — full branch control</SelectItem>
                        <SelectItem value="branchUser">Branch User — exchange rates only</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {needsBranch ? (
                    <BranchSelector
                      branches={branches}
                      value={form.branchId}
                      onChange={(branchId) => setForm((prev) => ({ ...prev, branchId }))}
                      label="Assigned branch"
                    />
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Admins can manage videos, images, and display messages across all branches.
                    </p>
                  )}
                </div>
                <DialogFooter>
                  <Button
                    onClick={() => void handleCreate()}
                    disabled={submitting || !form.email || !form.displayName || (needsBranch && !form.branchId)}
                    className="rounded-xl"
                  >
                    {submitting ? "Sending invite..." : "Send Invite"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </PageActions>
        ) : null}

        <Dialog open={!!successDialog} onOpenChange={() => setSuccessDialog(null)}>
          <DialogContent className="rounded-2xl sm:max-w-md">
            <DialogHeader>
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15">
                <CheckCircle2 className="h-6 w-6 text-emerald-600" />
              </div>
              <DialogTitle className="text-center">User Invited</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-center text-sm">
              <p>
                <strong>{successDialog?.email}</strong> has been invited.
              </p>
              {successDialog?.tempPassword ? (
                <div className="rounded-xl border border-border/40 bg-muted/30 p-4 text-left">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Temporary Password</p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <code className="text-lg font-semibold tracking-wide">{successDialog.tempPassword}</code>
                    <Button variant="outline" size="sm" className="rounded-lg" onClick={() => copyPassword(successDialog.tempPassword!)}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground">They can sign in with Google using this email address.</p>
              )}
            </div>
            <DialogFooter>
              <Button onClick={() => setSuccessDialog(null)} className="w-full rounded-xl">Done</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {invites.length > 0 ? (
          <ContentPanel title="Pending Invites" description={`${invites.length} awaiting first sign-in`}>
            <DataTable
              data={invites}
              keyExtractor={(i) => i.id}
              mobileTitle={(i) => i.displayName}
              columns={[
                { key: "name", header: "Name", cell: (i) => i.displayName },
                { key: "email", header: "Email", cell: (i) => i.email },
                { key: "role", header: "Role", cell: (i) => ROLE_LABELS[i.role] ?? i.role },
                {
                  key: "branch",
                  header: "Branch",
                  cell: (i) => (i.branchId ? branchMap[i.branchId] ?? i.branchId : "All branches"),
                },
                {
                  key: "status",
                  header: "Status",
                  cell: () => <StatusBadge status="pending" variant="warning" />,
                },
              ]}
            />
          </ContentPanel>
        ) : null}

        {users.length === 0 && invites.length === 0 ? (
          <EmptyState
            title="No users yet"
            description="Invite admins, branch managers, or branch users by email."
            icon={Users}
            actionLabel={canManage ? "Invite User" : undefined}
            onAction={canManage ? () => setOpen(true) : undefined}
          />
        ) : users.length > 0 ? (
          <ContentPanel title="Active Users" description={`${users.length} user${users.length === 1 ? "" : "s"}`}>
            <DataTable
              data={users}
              keyExtractor={(m) => m.uid}
              mobileTitle={(m) => m.displayName}
              columns={[
                { key: "name", header: "Name", cell: (m) => <span className="font-medium">{m.displayName}</span> },
                { key: "email", header: "Email", cell: (m) => m.email, hideOnMobile: true },
                { key: "role", header: "Role", cell: (m) => ROLE_LABELS[m.role] ?? m.role },
                {
                  key: "branch",
                  header: "Branch",
                  cell: (m) => (m.branchId ? branchMap[m.branchId] ?? m.branchId : "All branches"),
                },
                {
                  key: "status",
                  header: "Status",
                  cell: (m) => <StatusBadge status={m.isActive ? "active" : "inactive"} />,
                },
              ]}
            />
          </ContentPanel>
        ) : null}
      </PageShell>
    </>
  );
}
