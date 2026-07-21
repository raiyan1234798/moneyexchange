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
import { ACCESS_MODULES, COLLECTIONS, MODULE_DEFAULTS_BY_ROLE, RECOMMENDED_BRANCH_USERS, ROLE_LABELS } from "@/lib/constants";
import { subscribeCollection, where } from "@/lib/firebase/firestore";
import {
  approveUserInvite,
  createPasswordUser,
  createUserInvite,
  deleteUserInvite,
  deleteUserProfile,
  setUserActive,
  updateUserInvite,
  updateUserProfile,
} from "@/lib/services/manager-service";
import { completeLoginEmail, normalizeEmail, TEAM_LOGIN_DOMAIN } from "@/lib/auth/user-profile";
import {
  canManageCredentials,
  changeUserEmail,
  deleteCredential,
  deleteUserAccount,
  resetUserPassword,
  saveCredential,
  subscribeUserCredentials,
  type StoredCredential,
} from "@/lib/services/credential-service";
import type { AppUser, UserInvite, UserRole } from "@/lib/types";

// Derive from the domain the admin is actually on, so the invite link/message
// always points at the current site (never a stale hard-coded project URL).
const FALLBACK_LOGIN_URL = "https://unimoni-6va.pages.dev/login";
function loginUrl(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}/login`;
  }
  return FALLBACK_LOGIN_URL;
}

const emptyForm = {
  email: "",
  displayName: "",
  role: "branchManager" as "admin" | "branchManager" | "branchUser",
  branchId: "",
};

const MANAGED_ROLES: UserRole[] = ["admin", "branchManager", "branchUser"];

type InviteForm = typeof emptyForm & { inviteId?: string };

export default function UsersPage() {
  const { user, profile, hasPermission, isBranchManager, isSuperAdmin } = useAuth();
  const { branches, managerBranchId } = useBranchScope();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [invites, setInvites] = useState<UserInvite[]>([]);
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<UserInvite | null>(null);
  const [editUser, setEditUser] = useState<AppUser | null>(null);
  const [editUserForm, setEditUserForm] = useState({
    displayName: "",
    role: "branchManager" as "admin" | "branchManager" | "branchUser",
    branchId: "",
  });
  const [deleteUserTarget, setDeleteUserTarget] = useState<AppUser | null>(null);
  const [form, setForm] = useState<InviteForm>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [successDialog, setSuccessDialog] = useState<{
    email: string;
    role: InviteForm["role"];
    branchName?: string | null;
    /** Set when the account was created with email + password (no Google). */
    password?: string;
  } | null>(null);
  const [accountMode, setAccountMode] = useState<"google" | "password">("google");
  const [passwordValue, setPasswordValue] = useState("");
  // MODULE grid: pre-picked from the role; clicking customises this user.
  const [moduleSel, setModuleSel] = useState<string[]>([...(MODULE_DEFAULTS_BY_ROLE.branchManager ?? [])]);
  const [moduleTouched, setModuleTouched] = useState(false);
  // Stored sign-in passwords — visible ONLY to the two owner admins (+ dev).
  const isCredentialOwner = canManageCredentials(profile?.email, isSuperAdmin);
  const [credentials, setCredentials] = useState<StoredCredential[]>([]);
  const [credBusy, setCredBusy] = useState<string | null>(null);
  // "Set password" / "Change email or user ID" dialog for a vault entry.
  const [credEdit, setCredEdit] = useState<{ mode: "password" | "email"; cred: StoredCredential } | null>(null);
  const [credEditValue, setCredEditValue] = useState("");
  const { notice, onError, clearNotice } = useFirestoreNotice("users");

  useEffect(() => {
    if (!isCredentialOwner) return;
    return subscribeUserCredentials(setCredentials, () => setCredentials([]));
  }, [isCredentialOwner]);

  useEffect(() => {
    const userConstraints = isBranchManager && managerBranchId
      ? [where("branchId", "==", managerBranchId)]
      : [where("role", "in", MANAGED_ROLES)];

    const unsubUsers = subscribeCollection<AppUser & { id?: string }>(
      COLLECTIONS.users,
      userConstraints,
      (items) => {
        // Profile docs don't store a `uid` field — the doc id IS the uid.
        // Without this mapping every row action (edit/deactivate/delete)
        // crashes on doc(db, "users", undefined).
        setUsers(items.map((m) => ({ ...m, uid: m.uid ?? m.id ?? "" })));
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

  /** Clickable module board — which parts of the dashboard this user can use. */
  function moduleGrid() {
    return (
      <div className="space-y-2">
        <Label>Access — what this user can open &amp; edit</Label>
        <div className="flex flex-wrap gap-1.5">
          {ACCESS_MODULES.map((m) => {
            const on = moduleSel.includes(m.key);
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => {
                  setModuleTouched(true);
                  setModuleSel((prev) => (on ? prev.filter((k) => k !== m.key) : [...prev, m.key]));
                }}
                className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                  on
                    ? "border-primary/60 bg-primary/15 text-primary"
                    : "border-border/50 text-muted-foreground hover:bg-muted/40"
                }`}
              >
                {on ? "✓ " : ""}{m.label}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          Pre-picked from the role — click to give or take away single modules for this user.
        </p>
      </div>
    );
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

    // Password logins may be plain user IDs (e.g. "manager.kampalaroad") — the
    // company domain is appended automatically. Google invites MUST be a real
    // Gmail address, or that person could never sign in.
    const normalizedEmail =
      accountMode === "password" ? completeLoginEmail(form.email) : normalizeEmail(form.email);
    if (accountMode === "google" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      toast.error("Enter their full Gmail address (e.g. name@gmail.com) — Google sign-in needs the exact address.");
      return;
    }
    setSubmitting(true);
    const duplicateMessage = isDuplicateEmail(normalizedEmail);
    if (duplicateMessage) {
      toast.error(duplicateMessage);
      setSubmitting(false);
      return;
    }

    try {
      const branchName = branchId ? branchMap[branchId] ?? null : null;
      if (accountMode === "password") {
        await createPasswordUser(
          {
            email: normalizedEmail,
            password: passwordValue,
            displayName: form.displayName,
            role: form.role,
            branchId,
            moduleAccess: moduleTouched ? moduleSel : null,
          },
          { userId: user.uid, userName: profile.displayName || profile.email },
        );
        // Remember the password so the OWNER admins can look it up / regenerate
        // it later (best-effort — only they can write this collection).
        await saveCredential(normalizedEmail, passwordValue, form.displayName, {
          userId: user.uid,
          userName: profile.displayName || profile.email,
        }).catch(() => undefined);
        setOpen(false);
        setForm(emptyForm);
        setModuleTouched(false);
        setModuleSel([...(MODULE_DEFAULTS_BY_ROLE.branchManager ?? [])]);
        setSuccessDialog({ email: normalizedEmail, role: form.role, branchName, password: passwordValue });
        setPasswordValue("");
        toast.success("Login created — hand over the email and password");
      } else {
        await createUserInvite({
          email: normalizedEmail,
          displayName: form.displayName,
          role: form.role,
          branchId,
          createdBy: user.uid,
          moduleAccess: moduleTouched ? moduleSel : null,
        });
        setOpen(false);
        setForm(emptyForm);
        setModuleTouched(false);
        setModuleSel([...(MODULE_DEFAULTS_BY_ROLE.branchManager ?? [])]);
        setSuccessDialog({ email: normalizedEmail, role: form.role, branchName });
        toast.success("Invite sent — user can sign in with Google immediately");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create the user");
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

  function openEditUser(member: AppUser) {
    setEditUserForm({
      displayName: member.displayName,
      role: (member.role === "superAdmin" ? "admin" : member.role) as
        | "admin"
        | "branchManager"
        | "branchUser",
      branchId: member.branchId ?? "",
    });
    setModuleSel(
      member.moduleAccess && member.moduleAccess.length > 0
        ? [...member.moduleAccess]
        : [...(MODULE_DEFAULTS_BY_ROLE[member.role] ?? [])],
    );
    setModuleTouched(false);
    setEditUser(member);
  }

  async function handleEditUser() {
    if (!editUser || !user || !profile) return;
    setActionId(editUser.uid);
    try {
      await updateUserProfile(
        editUser.uid,
        {
          displayName: editUserForm.displayName,
          role: editUserForm.role,
          branchId: editUserForm.role === "admin" ? null : editUserForm.branchId || null,
          ...(moduleTouched || (editUser.moduleAccess?.length ?? 0) > 0
            ? { moduleAccess: moduleSel }
            : {}),
        },
        { userId: user.uid, userName: profile.displayName || profile.email },
      );
      toast.success("User updated");
      setEditUser(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update user");
    } finally {
      setActionId(null);
    }
  }

  async function handleToggleActive(member: AppUser) {
    if (!user || !profile) return;
    setActionId(member.uid);
    try {
      await setUserActive(
        { uid: member.uid, branchId: member.branchId },
        !member.isActive,
        { userId: user.uid, userName: profile.displayName || profile.email },
      );
      toast.success(member.isActive ? `${member.displayName} deactivated` : `${member.displayName} activated`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update status");
    } finally {
      setActionId(null);
    }
  }

  async function handleDeleteUser() {
    if (!deleteUserTarget || !user || !profile) return;
    setActionId(deleteUserTarget.uid);
    try {
      if (isCredentialOwner) {
        // Full removal: destroys the password login itself (when we hold the
        // password in the vault) + profile + invite + stored password.
        const stored = credentials.find(
          (c) => normalizeEmail(c.email) === normalizeEmail(deleteUserTarget.email),
        );
        const { authDeleted } = await deleteUserAccount(
          { uid: deleteUserTarget.uid, email: deleteUserTarget.email },
          stored?.password ?? null,
          { userId: user.uid, userName: profile.displayName || profile.email },
        );
        toast.success(
          authDeleted
            ? "User deleted — their email & password can no longer sign in"
            : "User deleted — any sign-in attempt now gets no access",
        );
      } else {
        await deleteUserProfile(
          { uid: deleteUserTarget.uid, email: deleteUserTarget.email, branchId: deleteUserTarget.branchId },
          { userId: user.uid, userName: profile.displayName || profile.email },
        );
        toast.success("User removed");
      }
      setDeleteUserTarget(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to remove user");
    } finally {
      setActionId(null);
    }
  }

  function copyInviteMessage(email: string) {
    const message = `You've been invited to Unimoni. Sign in at ${loginUrl()} with Google using ${email}.`;
    void navigator.clipboard.writeText(message);
    toast.success("Invite message copied");
  }

  function copyLoginLink() {
    void navigator.clipboard.writeText(loginUrl());
    toast.success("Login link copied");
  }

  // ONE list: real accounts AND invited people together, each with a clear
  // status (Active / Deactivated / Waiting for first sign-in).
  type MemberRow =
    | { rowKey: string; kind: "user"; user: AppUser }
    | { rowKey: string; kind: "invite"; invite: UserInvite };
  const memberRows: MemberRow[] = [
    ...users.map((u) => ({ rowKey: `u-${u.uid}`, kind: "user" as const, user: u })),
    ...invites.map((i) => ({ rowKey: `i-${i.id}`, kind: "invite" as const, invite: i })),
  ];

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
                  <DialogTitle>Add user</DialogTitle>
                </DialogHeader>
                {hasPermission("manageUsers") ? (
                  <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted/40 p-1">
                    <Button
                      type="button"
                      variant={accountMode === "google" ? "default" : "ghost"}
                      size="sm"
                      className="rounded-lg"
                      onClick={() => setAccountMode("google")}
                    >
                      Google invite
                    </Button>
                    <Button
                      type="button"
                      variant={accountMode === "password" ? "default" : "ghost"}
                      size="sm"
                      className="rounded-lg"
                      onClick={() => setAccountMode("password")}
                    >
                      Email &amp; password
                    </Button>
                  </div>
                ) : null}
                <p className="text-sm text-muted-foreground">
                  {accountMode === "password" ? (
                    <>You set their password now — they sign in at <strong>/login</strong> with email
                    and password immediately. Share the credentials with them.</>
                  ) : (
                    <>Enter their Gmail address — they must sign in at <strong>/login</strong> with Google
                    using that exact address.</>
                  )}
                </p>
                <div className="grid gap-4 py-2">
                  <div className="space-y-2">
                    <Label htmlFor="user-email">{accountMode === "password" ? "Email or user ID" : "Gmail address"}</Label>
                    <Input
                      id="user-email"
                      type={accountMode === "password" ? "text" : "email"}
                      placeholder={accountMode === "password" ? "e.g. manager.kampalaroad" : "name@gmail.com"}
                      value={form.email}
                      onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                      className="rounded-xl"
                    />
                    {accountMode === "password" && form.email.trim() && !form.email.includes("@") ? (
                      <p className="text-xs text-muted-foreground">
                        Will sign in as{" "}
                        <span className="font-mono font-medium">{completeLoginEmail(form.email)}</span>
                        {" "}— they can type just{" "}
                        <span className="font-mono">{form.email.trim().toLowerCase()}</span> on the login page.
                      </p>
                    ) : null}
                    {accountMode === "password" ? (
                      <p className="text-xs text-muted-foreground">
                        A plain user ID is fine — @{TEAM_LOGIN_DOMAIN} is added automatically.
                      </p>
                    ) : null}
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
                  {accountMode === "password" ? (
                    <div className="space-y-2">
                      <Label htmlFor="user-password">Password (min 8 characters)</Label>
                      <div className="flex gap-2">
                        <Input
                          id="user-password"
                          value={passwordValue}
                          onChange={(event) => setPasswordValue(event.target.value)}
                          placeholder="Set their password"
                          className="rounded-xl font-mono"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          className="shrink-0 rounded-xl"
                          onClick={() =>
                            setPasswordValue(
                              `Unimoni-${Math.random().toString(36).slice(2, 8)}${Math.floor(Math.random() * 90 + 10)}`,
                            )
                          }
                        >
                          Generate
                        </Button>
                      </div>
                    </div>
                  ) : null}
                  <div className="space-y-2">
                    <Label>Role</Label>
                    <Select
                      value={form.role}
                      onValueChange={(value) => {
                        setForm((prev) => ({
                          ...prev,
                          role: value as typeof form.role,
                          branchId: value === "admin" ? "" : isBranchManager ? managerBranchId : prev.branchId,
                        }));
                        if (!moduleTouched && value) {
                          setModuleSel([...(MODULE_DEFAULTS_BY_ROLE[value] ?? [])]);
                        }
                      }}
                    >
                      <SelectTrigger className="rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {canInviteAdmin ? (
                          <SelectItem value="admin">Admin — all branches, media & view rates</SelectItem>
                        ) : null}
                        {canInviteAdmin ? (
                          <SelectItem value="branchManager">Branch Manager — exchange & transfer rates</SelectItem>
                        ) : null}
                        <SelectItem value="branchUser">Branch User — forex rates only</SelectItem>
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
                  {moduleGrid()}
                </div>
                <DialogFooter>
                  <Button
                    onClick={() => void handleCreate()}
                    disabled={
                      submitting ||
                      !form.email ||
                      !form.displayName ||
                      (needsBranch && !form.branchId) ||
                      (accountMode === "password" && passwordValue.length < 8)
                    }
                    className="rounded-xl"
                  >
                    {submitting
                      ? accountMode === "password"
                        ? "Creating login…"
                        : "Sending invite…"
                      : accountMode === "password"
                        ? "Create login"
                        : "Send Gmail invite"}
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
              <DialogTitle className="text-center">
                {successDialog?.password ? "Login created" : "Invite sent"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-center text-sm">
              <p className="text-emerald-700 dark:text-emerald-400">
                <strong>{successDialog?.email}</strong> can login now at {loginUrl().replace(/^https?:\/\//, "")}
                {successDialog?.password ? " with the password below." : " with Google."}
              </p>
              {successDialog?.password ? (
                <div className="space-y-2 rounded-xl border border-border/40 bg-muted/30 p-4 text-left text-sm">
                  <p>
                    <span className="text-muted-foreground">Email:</span>{" "}
                    <strong className="font-mono">{successDialog.email}</strong>
                  </p>
                  <p>
                    <span className="text-muted-foreground">Password:</span>{" "}
                    <strong className="font-mono">{successDialog.password}</strong>
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-lg"
                    onClick={() => {
                      void navigator.clipboard.writeText(
                        `Unimoni sign-in: ${loginUrl()}\nEmail: ${successDialog.email}\nPassword: ${successDialog.password}`,
                      );
                      toast.success("Credentials copied — share them securely");
                    }}
                  >
                    <Copy className="mr-1.5 h-3.5 w-3.5" />
                    Copy credentials
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Save this now — the password is not shown again.
                  </p>
                </div>
              ) : (
              <div className="rounded-xl border border-border/40 bg-muted/30 p-4 text-left text-xs leading-relaxed text-muted-foreground">
                Send them: Go to <strong>{loginUrl()}</strong> and click{" "}
                <strong>Continue with Google</strong> with <strong>{successDialog?.email}</strong>.
              </div>
              )}
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

        {isCredentialOwner && credentials.length > 0 ? (
          <ContentPanel
            title="Sign-in passwords (owner only)"
            description="Only you can see these. Copy a password to hand it over, or generate a new one."
          >
            <DataTable
              data={credentials}
              keyExtractor={(c) => c.id}
              mobileTitle={(c) => c.email}
              columns={[
                { key: "email", header: "Email", cell: (c) => c.email },
                {
                  key: "password",
                  header: "Password",
                  cell: (c) => (
                    <span className="inline-flex items-center gap-1.5">
                      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">{c.password}</code>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 rounded px-2 text-xs"
                        onClick={() => {
                          void navigator.clipboard.writeText(`${c.email}  ${c.password}`);
                          toast.success("Email + password copied");
                        }}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </span>
                  ),
                },
                {
                  key: "actions",
                  header: "",
                  className: "text-right",
                  cell: (c) => (
                    <span className="inline-flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-lg"
                        disabled={credBusy === c.id}
                        onClick={() => {
                          if (!user || !profile) return;
                          setCredBusy(c.id);
                          void resetUserPassword(c, {
                            userId: user.uid,
                            userName: profile.displayName || profile.email,
                          })
                            .then((next) => {
                              void navigator.clipboard.writeText(`${c.email}  ${next}`);
                              toast.success(`New password for ${c.email}: ${next} (copied)`, { duration: 12000 });
                            })
                            .catch((e) => toast.error(e instanceof Error ? e.message : "Could not reset"))
                            .finally(() => setCredBusy(null));
                        }}
                      >
                        {credBusy === c.id ? "Working…" : "Generate new password"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-lg"
                        disabled={credBusy === c.id}
                        onClick={() => {
                          setCredEditValue("");
                          setCredEdit({ mode: "password", cred: c });
                        }}
                      >
                        Set password
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-lg"
                        disabled={credBusy === c.id}
                        onClick={() => {
                          setCredEditValue("");
                          setCredEdit({ mode: "email", cred: c });
                        }}
                      >
                        Change email / ID
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="rounded-lg text-muted-foreground"
                        onClick={() => {
                          void deleteCredential(c.email).then(() => toast.success("Removed from this list"));
                        }}
                      >
                        Forget
                      </Button>
                    </span>
                  ),
                },
              ]}
            />
          </ContentPanel>
        ) : null}

        {memberRows.length > 0 ? (
          <ContentPanel
            title="Users"
            description={`${users.length} account${users.length === 1 ? "" : "s"}${
              invites.length > 0 ? ` · ${invites.length} invited (waiting for first sign-in)` : ""
            }`}
          >
            <DataTable
              data={memberRows}
              keyExtractor={(row) => row.rowKey}
              mobileTitle={(row) => (row.kind === "user" ? row.user.displayName : row.invite.displayName)}
              columns={[
                {
                  key: "name",
                  header: "Name",
                  cell: (row) => (
                    <span className="font-medium">
                      {row.kind === "user" ? row.user.displayName : row.invite.displayName}
                    </span>
                  ),
                },
                {
                  key: "email",
                  header: "Email",
                  cell: (row) => (row.kind === "user" ? row.user.email : row.invite.email),
                  hideOnMobile: true,
                },
                {
                  key: "role",
                  header: "Role",
                  cell: (row) => {
                    const role = row.kind === "user" ? row.user.role : row.invite.role;
                    return ROLE_LABELS[role] ?? role;
                  },
                },
                {
                  key: "branch",
                  header: "Branch",
                  cell: (row) => {
                    const b = row.kind === "user" ? row.user.branchId : row.invite.branchId;
                    return b ? branchMap[b] ?? b : "All branches";
                  },
                },
                {
                  key: "status",
                  header: "Status",
                  cell: (row) =>
                    row.kind === "user" ? (
                      <StatusBadge status={row.user.isActive ? "active" : "inactive"} />
                    ) : (
                      <span className="inline-flex rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                        Waiting for first sign-in
                      </span>
                    ),
                },
                {
                  key: "actions",
                  header: "Actions",
                  className: "text-right",
                  cell: (row) => {
                    if (row.kind === "invite") {
                      const i = row.invite;
                      if (!canManage) return null;
                      if (isBranchManager && i.role !== "branchUser") {
                        return <span className="text-xs text-muted-foreground">Managed by admin</span>;
                      }
                      return (
                        <div className="flex flex-wrap justify-end gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-lg"
                            disabled={actionId === i.id}
                            onClick={() => openEditInvite(i)}
                          >
                            <Pencil className="mr-1 h-3 w-3" />
                            Edit
                          </Button>
                          {i.status !== "approved" ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="rounded-lg text-emerald-700 hover:text-emerald-800"
                              disabled={actionId === i.id}
                              onClick={() => void handleApprove(i)}
                            >
                              <Check className="mr-1 h-3 w-3" />
                              Approve
                            </Button>
                          ) : null}
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-lg text-destructive hover:text-destructive"
                            disabled={actionId === i.id}
                            onClick={() => setDeleteTarget(i)}
                          >
                            <Trash2 className="mr-1 h-3 w-3" />
                            Delete
                          </Button>
                        </div>
                      );
                    }
                    const m = row.user;
                    {
                    // Rules: only manageUsers roles may edit; admins cannot touch
                    // superAdmin accounts; nobody edits their own row (lockout guard).
                    const canAct =
                      hasPermission("manageUsers") &&
                      m.uid !== user?.uid &&
                      (m.role !== "superAdmin" || isSuperAdmin);
                    if (!canAct) return null;
                    return (
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-lg"
                          disabled={actionId === m.uid}
                          onClick={() => openEditUser(m)}
                        >
                          <Pencil className="mr-1 h-3 w-3" />
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-lg"
                          disabled={actionId === m.uid}
                          onClick={() => void handleToggleActive(m)}
                        >
                          {m.isActive ? "Deactivate" : "Activate"}
                        </Button>
                        {isSuperAdmin || isCredentialOwner ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-lg text-destructive hover:text-destructive"
                            disabled={actionId === m.uid}
                            onClick={() => setDeleteUserTarget(m)}
                          >
                            <Trash2 className="mr-1 h-3 w-3" />
                            Delete
                          </Button>
                        ) : null}
                      </div>
                    );
                    }
                  },
                },
              ]}
            />
          </ContentPanel>
        ) : null}

        {/* Owner tools: set a chosen password, or move the login to a new
            email / user ID (same password, same role & branch). */}
        <Dialog open={credEdit !== null} onOpenChange={(o) => !o && setCredEdit(null)}>
          <DialogContent className="rounded-2xl sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {credEdit?.mode === "password"
                  ? `Set a new password for ${credEdit?.cred.email}`
                  : `Change sign-in for ${credEdit?.cred.email}`}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-2 py-2">
              <Label>
                {credEdit?.mode === "password" ? "New password (min 8 characters)" : "New email or user ID"}
              </Label>
              <Input
                value={credEditValue}
                onChange={(e) => setCredEditValue(e.target.value)}
                placeholder={credEdit?.mode === "password" ? "Type the password to give them" : "e.g. manager.newname"}
                className="rounded-xl font-mono"
              />
              {credEdit?.mode === "email" ? (
                <p className="text-xs text-muted-foreground">
                  Their password stays the same. A plain user ID gets @{TEAM_LOGIN_DOMAIN} added
                  automatically. The old sign-in stops working immediately.
                </p>
              ) : null}
            </div>
            <DialogFooter>
              <Button
                className="rounded-xl"
                disabled={
                  !credEdit ||
                  credBusy !== null ||
                  (credEdit.mode === "password" ? credEditValue.trim().length < 8 : !credEditValue.trim())
                }
                onClick={() => {
                  if (!credEdit || !user || !profile) return;
                  const a = { userId: user.uid, userName: profile.displayName || profile.email };
                  setCredBusy(credEdit.cred.id);
                  const done = () => {
                    setCredBusy(null);
                    setCredEdit(null);
                    setCredEditValue("");
                  };
                  if (credEdit.mode === "password") {
                    void resetUserPassword(credEdit.cred, a, credEditValue)
                      .then((next) => {
                        void navigator.clipboard.writeText(`${credEdit.cred.email}  ${next}`);
                        toast.success(`Password changed — ${credEdit.cred.email} now signs in with ${next} (copied)`, { duration: 12000 });
                        done();
                      })
                      .catch((e) => {
                        toast.error(e instanceof Error ? e.message : "Could not change the password");
                        setCredBusy(null);
                      });
                  } else {
                    const target = users.find((u) => normalizeEmail(u.email) === normalizeEmail(credEdit.cred.email));
                    void changeUserEmail(credEdit.cred, credEditValue, target ? { uid: target.uid } : null, a)
                      .then((newEmail) => {
                        void navigator.clipboard.writeText(`${newEmail}  ${credEdit.cred.password}`);
                        toast.success(`Sign-in moved to ${newEmail} (email + password copied)`, { duration: 12000 });
                        done();
                      })
                      .catch((e) => {
                        toast.error(e instanceof Error ? e.message : "Could not change the email");
                        setCredBusy(null);
                      });
                  }
                }}
              >
                {credBusy !== null ? "Working…" : credEdit?.mode === "password" ? "Set password" : "Change sign-in"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!editUser} onOpenChange={(next) => !next && setEditUser(null)}>
          <DialogContent className="rounded-2xl sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Edit user</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">{editUser?.email}</p>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={editUserForm.displayName}
                  onChange={(e) => setEditUserForm((f) => ({ ...f, displayName: e.target.value }))}
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select
                  value={editUserForm.role}
                  onValueChange={(value) =>
                    setEditUserForm((f) => ({ ...f, role: value as typeof f.role }))
                  }
                >
                  <SelectTrigger className="rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">{ROLE_LABELS.admin}</SelectItem>
                    <SelectItem value="branchManager">{ROLE_LABELS.branchManager}</SelectItem>
                    <SelectItem value="branchUser">{ROLE_LABELS.branchUser}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {editUserForm.role !== "admin" ? (
                <BranchSelector
                  branches={branches}
                  value={editUserForm.branchId}
                  onChange={(branchId) => setEditUserForm((f) => ({ ...f, branchId }))}
                  label="Assigned branch"
                />
              ) : null}
            </div>
            {moduleGrid()}
            <DialogFooter>
              <Button
                onClick={() => void handleEditUser()}
                disabled={
                  !editUserForm.displayName.trim() ||
                  (editUserForm.role !== "admin" && !editUserForm.branchId) ||
                  actionId === editUser?.uid
                }
                className="rounded-xl"
              >
                {actionId === editUser?.uid ? "Saving…" : "Save changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={!!deleteUserTarget} onOpenChange={(open) => !open && setDeleteUserTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {deleteUserTarget?.displayName} permanently?</AlertDialogTitle>
              <AlertDialogDescription>
                <strong>{deleteUserTarget?.email}</strong> is removed completely: their password
                login is destroyed and any sign-in (email &amp; password or Google) gets no access.
                They can only return if you create them again. Past activity stays in the audit trail.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => void handleDeleteUser()}>Remove user</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

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
