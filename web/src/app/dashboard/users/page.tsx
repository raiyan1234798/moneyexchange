"use client";

import { useEffect, useState } from "react";
import { Plus, Copy, Users, CheckCircle2, Pencil, Trash2, Check, Link2 } from "lucide-react";
import { toast } from "sonner";
import { DashboardHeader } from "@/components/layout/dashboard-sidebar";
import { BranchSelector } from "@/components/shared/branch-selector";
import {
  ContentPanel,
  DataTable,
  EmptyState,
  FirestoreSetupNotice,
  PageActions,
  PageShell,
  StatusBadge,
} from "@/components/shared/page-elements";
import { useAuth } from "@/contexts/auth-context";
import { useBranchScope } from "@/lib/hooks/use-branch-scope";
import { useFirestoreNotice } from "@/lib/hooks/use-firestore-notice";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { inviteFeaturePreview } from "@/components/dashboard/role-feature-board";
import { COLLECTIONS, RECOMMENDED_BRANCH_USERS, ROLE_LABELS } from "@/lib/constants";
import { subscribeCollection, where } from "@/lib/firebase/firestore";
import {
  approveUserInvite,
  createUserInvite,
  deleteUserInvite,
  updateUserInvite,
} from "@/lib/services/manager-service";
import { normalizeEmail } from "@/lib/auth/user-profile";
import type { AppUser, UserInvite, UserRole } from "@/lib/types";

const LOGIN_URL = "https://unimoni.pages.dev/login";

const emptyForm = {
  email: "",
  displayName: "",
  role: "branchManager" as "admin" | "branchManager" | "branchUser",
  branchId: "",
};

const MANAGED_ROLES: UserRole[] = ["admin", "branchManager", "branchUser"];

type InviteForm = typeof emptyForm & { inviteId?: string };

export default function UsersPage() {
  const { user, profile, hasPermission, isBranchManager } = useAuth();
  const { branches, managerBranchId } = useBranchScope();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [invites, setInvites] = useState<UserInvite[]>([]);
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<UserInvite | null>(null);
  const [form, setForm] = useState<InviteForm>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [successDialog, setSuccessDialog] = useState<{
    email: string;
    role: InviteForm["role"];
    branchName?: string | null;
  } | null>(null);
  const { notice, onError, clearNotice } = useFirestoreNotice("users");

  useEffect(() => {
    const userConstraints = isBranchManager && managerBranchId
      ? [where("branchId", "==", managerBranchId)]
      : [where("role", "in", MANAGED_ROLES)];

    const unsubUsers = subscribeCollection<AppUser>(
      COLLECTIONS.users,
      userConstraints,
      (items) => {
        setUsers(items);
        clearNotice();
      },
      onError,
    );
    const inviteConstraints = isBranchManager && managerBranchId
      ? [where("branchId", "==", managerBranchId)]
      : [];
    const unsubInvites = subscribeCollection<UserInvite>(
      COLLECTIONS.userInvites,
      inviteConstraints,
      (items) => {
        setInvites(items);
        clearNotice();
      },
      onError,
    );
    return () => {
      unsubUsers();
      unsubInvites();
    };
  }, [clearNotice, isBranchManager, managerBranchId, onError]);

  const branchMap = Object.fromEntries(branches.map((branch) => [branch.id, branch.name]));
  const canManage = hasPermission("manageUsers") || hasPermission("inviteBranchUsers");
  const canInviteAdmin = hasPermission("manageUsers");
  const needsBranch = form.role === "branchManager" || form.role === "branchUser";

  const scopedBranchId = isBranchManager ? managerBranchId : form.branchId;
  const branchTeamCount = needsBranch && scopedBranchId
    ? users.filter((member) => member.branchId === scopedBranchId).length +
      invites.filter((invite) => invite.branchId === scopedBranchId).length
    : 0;
  const branchTeamLabel = needsBranch && scopedBranchId
    ? `${branchTeamCount} users on this branch (recommended ${RECOMMENDED_BRANCH_USERS})`
    : null;

  function isDuplicateEmail(email: string, excludeInviteId?: string) {
    const normalized = normalizeEmail(email);
    if (users.some((member) => normalizeEmail(member.email) === normalized)) {
      return "This email already has an active account.";
    }
    const pending = invites.find(
      (invite) =>
        normalizeEmail(invite.email) === normalized &&
        (!excludeInviteId || invite.id !== excludeInviteId),
    );
    if (pending) {
      return "This email already has a pending invite.";
    }
    return null;
  }

  async function handleCreate() {
    if (!user || !profile || !form.email || !form.displayName) return;
    if (needsBranch && !form.branchId && !isBranchManager) {
      toast.error("Select a branch for this role");
      return;
    }

    const branchId = needsBranch
      ? isBranchManager
        ? managerBranchId
        : form.branchId
      : null;

    setSubmitting(true);
    const normalizedEmail = normalizeEmail(form.email);
    const duplicateMessage = isDuplicateEmail(normalizedEmail);
    if (duplicateMessage) {
      toast.error(duplicateMessage);
      setSubmitting(false);
      return;
    }

    try {
      await createUserInvite({
        email: normalizedEmail,
        displayName: form.displayName,
        role: form.role,
        branchId,
        createdBy: user.uid,
      });

      setOpen(false);
      setForm(emptyForm);
      const branchName = branchId ? branchMap[branchId] ?? null : null;
      setSuccessDialog({ email: normalizedEmail, role: form.role, branchName });
      toast.success("Invite sent — user can sign in with Google immediately");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to invite user");
    } finally {
      setSubmitting(false);
    }
  }

  function openEditInvite(invite: UserInvite) {
    setForm({
      inviteId: invite.id,
      email: invite.email,
      displayName: invite.displayName,
      role: invite.role as InviteForm["role"],
      branchId: invite.branchId ?? "",
    });
    setEditOpen(true);
  }

  async function handleEdit() {
    if (!form.inviteId || !form.displayName) return;
    if (needsBranch && !form.branchId && !isBranchManager) {
      toast.error("Select a branch for this role");
      return;
    }

    const branchId = needsBranch
      ? isBranchManager
        ? managerBranchId
        : form.branchId
      : null;

    setSubmitting(true);
    try {
      await updateUserInvite({
        inviteId: form.inviteId,
        email: form.email,
        displayName: form.displayName,
        role: form.role,
        branchId,
      });
      setEditOpen(false);
      setForm(emptyForm);
      toast.success("Invite updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update invite");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleApprove(invite: UserInvite) {
    setActionId(invite.id);
    try {
      await approveUserInvite(invite.id);
      toast.success(`${invite.email} marked approved (optional — pending invites can sign in too)`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to approve invite");
    } finally {
      setActionId(null);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setActionId(deleteTarget.id);
    try {
      await deleteUserInvite(deleteTarget.id);
      toast.success("Invite deleted");
      setDeleteTarget(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete invite");
    } finally {
      setActionId(null);
    }
  }

  function copyInviteMessage(email: string) {
    const message = `You've been invited to Unimoni. Sign in at ${LOGIN_URL} with Google using ${email}.`;
    void navigator.clipboard.writeText(message);
    toast.success("Invite message copied");
  }

  function copyLoginLink() {
    void navigator.clipboard.writeText(LOGIN_URL);
    toast.success("Login link copied");
  }

  return (
    <>
      <DashboardHeader
        title={isBranchManager ? "Team" : "Users"}
        description={
          isBranchManager
            ? "Invite branch users who can edit exchange rates. They sign in with the exact Gmail address invited."
            : "Invite admins, branch managers, and branch users by Gmail. They sign in at /login with Google using the exact invited address."
        }
        accent="rose"
      />
      <PageShell accent="rose">
        <FirestoreSetupNotice message={notice} />
        {canManage ? (
          <PageActions>
            <Dialog open={open} onOpenChange={(next) => {
              setOpen(next);
              if (next && isBranchManager) {
                setForm({
                  email: "",
                  displayName: "",
                  role: "branchUser",
                  branchId: managerBranchId,
                });
              } else if (!next) {
                setForm(emptyForm);
              }
            }}>
              <DialogTrigger render={<Button className="rounded-xl"><Plus className="mr-2 h-4 w-4" />Invite by Gmail</Button>} />
              <DialogContent className="rounded-2xl sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Invite user</DialogTitle>
                </DialogHeader>
                <p className="text-sm text-muted-foreground">
                  Enter their Gmail address — they must sign in at <strong>/login</strong> with Google
                  using that exact address.
                </p>
                <div className="grid gap-4 py-2">
                  <div className="space-y-2">
                    <Label htmlFor="user-email">Gmail address</Label>
                    <Input
                      id="user-email"
                      type="email"
                      placeholder="name@gmail.com"
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
                          branchId: value === "admin" ? "" : isBranchManager ? managerBranchId : prev.branchId,
                        }))
                      }
                    >
                      <SelectTrigger className="rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {canInviteAdmin ? (
                          <SelectItem value="admin">Admin — all branches, media & view rates</SelectItem>
                        ) : null}
                        {canInviteAdmin ? (
                          <SelectItem value="branchManager">Branch Manager — full branch control</SelectItem>
                        ) : null}
                        <SelectItem value="branchUser">Branch User — exchange rates only</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {needsBranch ? (
                    <BranchSelector
                      branches={branches}
                      value={isBranchManager ? managerBranchId : form.branchId}
                      onChange={(branchId) => setForm((prev) => ({ ...prev, branchId }))}
                      label="Assigned branch"
                    />
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Admins can manage videos, images, and display messages across all branches.
                    </p>
                  )}
                  {branchTeamLabel ? (
                    <p className="text-xs text-muted-foreground">{branchTeamLabel}</p>
                  ) : null}
                </div>
                <DialogFooter>
                  <Button
                    onClick={() => void handleCreate()}
                    disabled={submitting || !form.email || !form.displayName || (needsBranch && !form.branchId)}
                    className="rounded-xl"
                  >
                    {submitting ? "Sending invite…" : "Send Gmail invite"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </PageActions>
        ) : null}

        <Dialog open={editOpen} onOpenChange={(next) => {
          setEditOpen(next);
          if (!next) setForm(emptyForm);
        }}>
          <DialogContent className="rounded-2xl sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Edit invite</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="space-y-2">
                <Label>Email (read-only)</Label>
                <Input value={form.email} disabled className="rounded-xl" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-name">Display name</Label>
                <Input
                  id="edit-name"
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
                      branchId: value === "admin" ? "" : isBranchManager ? managerBranchId : prev.branchId,
                    }))
                  }
                  disabled={isBranchManager}
                >
                  <SelectTrigger className="rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {canInviteAdmin ? <SelectItem value="admin">Admin</SelectItem> : null}
                    {canInviteAdmin ? <SelectItem value="branchManager">Branch Manager</SelectItem> : null}
                    <SelectItem value="branchUser">Branch User</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.role !== "admin" ? (
                <BranchSelector
                  branches={branches}
                  value={isBranchManager ? managerBranchId : form.branchId}
                  onChange={(branchId) => setForm((prev) => ({ ...prev, branchId }))}
                  label="Assigned branch"
                />
              ) : null}
            </div>
            <DialogFooter>
              <Button onClick={() => void handleEdit()} disabled={submitting || !form.displayName} className="rounded-xl">
                {submitting ? "Saving…" : "Save changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete invite?</AlertDialogTitle>
              <AlertDialogDescription>
                Remove the pending invite for <strong>{deleteTarget?.email}</strong>? They will not be able to sign in until re-invited.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => void handleDelete()}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Dialog open={!!successDialog} onOpenChange={() => setSuccessDialog(null)}>
          <DialogContent className="rounded-2xl sm:max-w-md">
            <DialogHeader>
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15">
                <CheckCircle2 className="h-6 w-6 text-emerald-600" />
              </div>
              <DialogTitle className="text-center">Invite sent</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-center text-sm">
              <p className="text-emerald-700 dark:text-emerald-400">
                <strong>{successDialog?.email}</strong> can login now at unimoni.pages.dev/login with Google.
              </p>
              <div className="rounded-xl border border-border/40 bg-muted/30 p-4 text-left text-xs leading-relaxed text-muted-foreground">
                Send them: Go to <strong>{LOGIN_URL}</strong> and click{" "}
                <strong>Continue with Google</strong> with <strong>{successDialog?.email}</strong>.
              </div>
              {successDialog ? (
                <div className="rounded-xl border border-[var(--unimoni-blue)]/20 bg-[var(--unimoni-blue)]/5 p-4 text-left">
                  <p className="text-xs font-medium text-foreground">
                    As {ROLE_LABELS[successDialog.role] ?? successDialog.role}
                    {successDialog.branchName ? ` · ${successDialog.branchName}` : ""}, they will see:
                  </p>
                  <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {inviteFeaturePreview(successDialog.role).map((feature) => (
                      <li key={feature} className="flex items-center gap-1.5">
                        <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-600" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="outline" size="sm" className="rounded-lg" onClick={copyLoginLink}>
                  <Link2 className="mr-1.5 h-3.5 w-3.5" />
                  Copy login link
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-lg"
                  onClick={() => successDialog && copyInviteMessage(successDialog.email)}
                >
                  <Copy className="mr-1.5 h-3.5 w-3.5" />
                  Copy invite message
                </Button>
              </div>
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
                  cell: (i) => (
                    <StatusBadge
                      status={i.status === "approved" ? "approved" : "pending"}
                      variant={i.status === "approved" ? "success" : "warning"}
                    />
                  ),
                },
                ...(canManage
                  ? [{
                      key: "actions",
                      header: "Actions",
                      cell: (i: UserInvite) => (
                        <div className="flex flex-wrap items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 rounded-lg px-2"
                            disabled={actionId === i.id}
                            onClick={() => openEditInvite(i)}
                          >
                            <Pencil className="mr-1 h-3.5 w-3.5" />
                            Edit
                          </Button>
                          {i.status !== "approved" ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 rounded-lg px-2 text-emerald-700 hover:text-emerald-800"
                              disabled={actionId === i.id}
                              onClick={() => void handleApprove(i)}
                            >
                              <Check className="mr-1 h-3.5 w-3.5" />
                              Approve
                            </Button>
                          ) : null}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 rounded-lg px-2 text-destructive hover:text-destructive"
                            disabled={actionId === i.id}
                            onClick={() => setDeleteTarget(i)}
                          >
                            <Trash2 className="mr-1 h-3.5 w-3.5" />
                            Delete
                          </Button>
                        </div>
                      ),
                    }]
                  : []),
              ]}
            />
          </ContentPanel>
        ) : null}

        {users.length > 0 ? (
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

        {users.length === 0 && invites.length === 0 ? (
          <EmptyState
            title="No users yet"
            description="Invite admins, branch managers, or branch users by Gmail."
            icon={Users}
            actionLabel={canManage ? "Invite User" : undefined}
            onAction={canManage ? () => setOpen(true) : undefined}
          />
        ) : null}
      </PageShell>
    </>
  );
}
