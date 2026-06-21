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
import { COLLECTIONS } from "@/lib/constants";
import { subscribeCollection, where } from "@/lib/firebase/firestore";
import { subscribeBranches } from "@/lib/services/branch-service";
import {
  createBranchManagerInvite,
  provisionBranchManagerAccount,
} from "@/lib/services/manager-service";
import { normalizeEmail } from "@/lib/auth/user-profile";
import type { AppUser, Branch, UserInvite } from "@/lib/types";

const emptyForm = {
  email: "",
  displayName: "",
  branchId: "",
};

export default function ManagersPage() {
  const { user, profile, hasPermission } = useAuth();
  const [managers, setManagers] = useState<AppUser[]>([]);
  const [invites, setInvites] = useState<UserInvite[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [successDialog, setSuccessDialog] = useState<{ email: string; tempPassword?: string } | null>(null);

  useEffect(() => {
    const unsubManagers = subscribeCollection<AppUser>(
      COLLECTIONS.users,
      [where("role", "==", "branchManager")],
      setManagers,
    );
    const unsubInvites = subscribeCollection<UserInvite>(COLLECTIONS.userInvites, [], setInvites);
    const unsubBranches = subscribeBranches(setBranches);
    return () => {
      unsubManagers();
      unsubInvites();
      unsubBranches();
    };
  }, []);

  const branchMap = Object.fromEntries(branches.map((branch) => [branch.id, branch.name]));
  const canManage = hasPermission("manageUsers");

  async function handleCreate() {
    if (!user || !profile || !form.email || !form.displayName || !form.branchId) return;
    setSubmitting(true);
    const normalizedEmail = normalizeEmail(form.email);
    try {
      await createBranchManagerInvite({
        email: normalizedEmail,
        displayName: form.displayName,
        branchId: form.branchId,
        createdBy: user.uid,
      });

      let tempPassword: string | undefined;
      try {
        const result = await provisionBranchManagerAccount({
          email: normalizedEmail,
          displayName: form.displayName,
          branchId: form.branchId,
        });
        tempPassword = result.temporaryPassword;
      } catch {
        // Invite record is enough for Google sign-in at /login
      }

      setOpen(false);
      setForm(emptyForm);
      setSuccessDialog({ email: normalizedEmail, tempPassword });
      toast.success("Branch manager invited — they can sign in with Google at /login");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to invite manager");
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
        description="Invite branch managers by email. They can sign in with Google or email and password."
        accent="rose"
      />
      <PageShell accent="rose">
        {canManage ? (
          <PageActions>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger render={<Button className="rounded-xl"><Plus className="mr-2 h-4 w-4" />Invite Manager</Button>} />
              <DialogContent className="rounded-2xl sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Invite Branch Manager</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-2">
                  <div className="space-y-2">
                    <Label htmlFor="manager-email">Email</Label>
                    <Input
                      id="manager-email"
                      type="email"
                      placeholder="manager@company.com"
                      value={form.email}
                      onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                      className="rounded-xl"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="manager-name">Display name</Label>
                    <Input
                      id="manager-name"
                      value={form.displayName}
                      onChange={(event) => setForm((prev) => ({ ...prev, displayName: event.target.value }))}
                      className="rounded-xl"
                    />
                  </div>
                  <BranchSelector
                    branches={branches}
                    value={form.branchId}
                    onChange={(branchId) => setForm((prev) => ({ ...prev, branchId }))}
                    label="Assigned branch"
                  />
                </div>
                <DialogFooter>
                  <Button
                    onClick={() => void handleCreate()}
                    disabled={submitting || !form.email || !form.displayName || !form.branchId}
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
              <DialogTitle className="text-center">Manager Invited</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-center text-sm">
              <p>
                <strong>{successDialog?.email}</strong> has been invited as a branch manager.
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
                  <p className="mt-2 text-xs text-muted-foreground">Share this password securely. They can change it after first login.</p>
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
                { key: "branch", header: "Branch", cell: (i) => branchMap[i.branchId] ?? i.branchId },
                {
                  key: "status",
                  header: "Status",
                  cell: () => <StatusBadge status="pending" variant="warning" />,
                },
              ]}
            />
          </ContentPanel>
        ) : null}

        {managers.length === 0 && invites.length === 0 ? (
          <EmptyState
            title="No branch managers"
            description="Invite a branch manager by email. They will get access after signing in with Google or the password you share."
            icon={Users}
            actionLabel={canManage ? "Invite Manager" : undefined}
            onAction={canManage ? () => setOpen(true) : undefined}
          />
        ) : managers.length > 0 ? (
          <ContentPanel title="Active Managers" description={`${managers.length} branch manager${managers.length === 1 ? "" : "s"}`}>
            <DataTable
              data={managers}
              keyExtractor={(m) => m.uid}
              mobileTitle={(m) => m.displayName}
              columns={[
                { key: "name", header: "Name", cell: (m) => <span className="font-medium">{m.displayName}</span> },
                { key: "email", header: "Email", cell: (m) => m.email, hideOnMobile: true },
                {
                  key: "branch",
                  header: "Branch",
                  cell: (m) => (m.branchId ? branchMap[m.branchId] ?? m.branchId : "Unassigned"),
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
