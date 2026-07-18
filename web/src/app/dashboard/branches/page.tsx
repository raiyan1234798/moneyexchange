"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Building2, Copy, ExternalLink, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { DashboardHeader } from "@/components/layout/dashboard-sidebar";
import { BranchSelector } from "@/components/shared/branch-selector";
import { DisplayUrlCard } from "@/components/shared/display-url-card";
import {
  ContentPanel,
  DataTable,
  EmptyState,
  FirestoreSetupNotice,
  FormSection,
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
 
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { MAX_BRANCHES, DEFAULT_BRANCH_SETTINGS } from "@/lib/constants";
import { normalizeEmail } from "@/lib/auth/user-profile";
import { getDisplayUrl, normalizeBranchCode } from "@/lib/display-url";
import { useFirestoreNotice } from "@/lib/hooks/use-firestore-notice";
import { createBranch, deleteBranch, disableBranch, subscribeBranches, updateBranch } from "@/lib/services/branch-service";
import { createUserInvite } from "@/lib/services/manager-service";
import type { Branch } from "@/lib/types";

const emptyForm = {
  name: "",
  code: "",
  address: "",
  city: "",
  country: "",
  phone: "",
  email: "",
  workingHours: "09:00 - 21:00",
  slogan: "Your trusted exchange partner",
  brandingColor: "#0066B3",
  managerEmail: "",
  managerName: "",
};

const fieldLabels: Record<keyof typeof emptyForm, string> = {
  name: "Branch Name",
  code: "Branch Code",
  address: "Address",
  city: "City",
  country: "Country",
  phone: "Phone",
  email: "Email",
  workingHours: "Working Hours",
  slogan: "Slogan",
  brandingColor: "Brand Color",
  managerEmail: "Manager Gmail (optional)",
  managerName: "Manager display name",
};

export default function BranchesPage() {
  const { profile, user, hasPermission } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [editBranch, setEditBranch] = useState<Branch | null>(null);
  const [displayBranchId, setDisplayBranchId] = useState("");

  const activeBranches = useMemo(
    () => branches.filter((b) => b.status === "active"),
    [branches],
  );
  const resolvedDisplayBranchId =
    displayBranchId && activeBranches.some((b) => b.id === displayBranchId)
      ? displayBranchId
      : (activeBranches[0]?.id ?? "");
  const displayBranch = activeBranches.find((b) => b.id === resolvedDisplayBranchId);
  const { notice, onError, clearNotice } = useFirestoreNotice("branches");

  useEffect(() => {
    return subscribeBranches(
      (items) => {
        setBranches(items);
        clearNotice();
      },
      onError,
    );
  }, [clearNotice, onError]);

  function openEditBranch(branch: Branch) {
    setForm({
      name: branch.name,
      code: branch.code,
      address: branch.address ?? "",
      city: branch.city ?? "",
      country: branch.country ?? "",
      phone: branch.phone ?? "",
      email: branch.email ?? "",
      workingHours: branch.workingHours ?? "09:00 - 21:00",
      slogan: branch.settings?.slogan ?? "",
      brandingColor: branch.brandingColor ?? "#0066B3",
      managerEmail: "",
      managerName: "",
    });
    setEditBranch(branch);
    setOpen(true);
  }

  function closeDialog() {
    setOpen(false);
    setEditBranch(null);
    setForm(emptyForm);
  }

  async function handleEnable(branch: Branch) {
    if (!user || !profile) return;
    try {
      await updateBranch(
        branch.id,
        { status: "active" },
        { userId: user.uid, userName: profile.displayName || profile.email },
      );
      toast.success(`${branch.name} is active again`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to enable branch");
    }
  }

  async function handleCreate() {
    if (!user || !profile) return;
    setSaving(true);

    if (editBranch) {
      try {
        const { slogan, brandingColor, managerEmail, managerName, ...branchFields } = form;
        void managerEmail;
        void managerName;
        await updateBranch(
          editBranch.id,
          {
            ...branchFields,
            brandingColor,
            settings: { ...editBranch.settings, slogan },
          },
          { userId: user.uid, userName: profile.displayName || profile.email },
        );
        toast.success(`${form.name} updated`);
        closeDialog();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to update branch");
      } finally {
        setSaving(false);
      }
      return;
    }

    try {
      const { slogan, brandingColor, managerEmail, managerName, ...branchFields } = form;
      const branchId = await createBranch(
        {
          ...branchFields,
          brandingColor,
          status: "active",
          settings: { ...DEFAULT_BRANCH_SETTINGS, slogan },
        },
        { userId: user.uid, userName: profile.displayName || profile.email },
      );

      const normalizedManagerEmail = managerEmail.trim() ? normalizeEmail(managerEmail) : "";
      if (normalizedManagerEmail) {
        await createUserInvite({
          email: normalizedManagerEmail,
          displayName: managerName.trim() || normalizedManagerEmail.split("@")[0] || "Branch Manager",
          role: "branchManager",
          branchId,
          createdBy: user.uid,
        });
        toast.success("Branch created and manager invited — they can sign in at /login with Google");
      } else {
        toast.success("Branch created successfully");
      }

      setOpen(false);
      setForm(emptyForm);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create branch");
    } finally {
      setSaving(false);
    }
  }

  async function handleDisable(branch: Branch) {
    if (!user || !profile) return;
    try {
      await disableBranch(branch.id, {
        userId: user.uid,
        userName: profile.displayName || profile.email,
      });
      toast.success(`${branch.name} has been disabled`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to disable branch");
    }
  }

  async function handleDelete(branch: Branch) {
    if (!user || !profile) return;
    try {
      await deleteBranch(branch.id, {
        userId: user.uid,
        userName: profile.displayName || profile.email,
      });
      toast.success(`${branch.name} has been deleted`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete branch");
    }
  }

  function copyDisplayUrl(code: string) {
    void navigator.clipboard.writeText(getDisplayUrl(code));
    toast.success("Display URL copied");
  }

  return (
    <>
      <DashboardHeader title="Branches" description="Create and manage branch locations, hours, and branding." accent="violet" />
      <PageShell accent="violet">
        <FirestoreSetupNotice message={notice} />
        {hasPermission("createBranch") ? (
          <PageActions>
            {branches.length >= MAX_BRANCHES && !editBranch ? (
              <p className="text-xs text-muted-foreground">
                Branch limit reached ({MAX_BRANCHES} of {MAX_BRANCHES}) — delete a branch to make
                room for a new one.
              </p>
            ) : null}
            <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : closeDialog())}>
              {/* Not a DialogTrigger: at the cap the click must EXPLAIN, not open. */}
              <Button
                className="rounded-xl"
                onClick={() => {
                  if (branches.length >= MAX_BRANCHES) {
                    toast.error(
                      `You can't create a new branch — all ${MAX_BRANCHES} branch slots are used. Delete one branch first, then you can create a new one.`,
                      { duration: 9000 },
                    );
                    return;
                  }
                  setOpen(true);
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Branch
              </Button>
              <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>{editBranch ? `Edit ${editBranch.name}` : "Create Branch"}</DialogTitle>
                </DialogHeader>
                <FormSection title="Location Details" description="Basic branch information">
                  {(Object.keys(emptyForm) as Array<keyof typeof emptyForm>)
                    .filter((key) => !["slogan", "brandingColor", "workingHours", "managerEmail", "managerName"].includes(key))
                    .map((key) => (
                      <div key={key} className="space-y-2">
                        <Label>{fieldLabels[key]}</Label>
                        <Input
                          value={form[key]}
                          onChange={(event) =>
                            setForm((prev) => ({
                              ...prev,
                              [key]: key === "code" ? normalizeBranchCode(event.target.value) : event.target.value,
                            }))
                          }
                          className="rounded-xl"
                          {...(key === "code" ? { placeholder: "e.g. CS02", style: { textTransform: "uppercase" as const } } : {})}
                        />
                      </div>
                    ))}
                </FormSection>
                <FormSection title="Branding & Hours" description="Display signage and operating hours">
                  <div className="space-y-2">
                    <Label>{fieldLabels.workingHours}</Label>
                    <Input
                      value={form.workingHours}
                      onChange={(event) => setForm((prev) => ({ ...prev, workingHours: event.target.value }))}
                      placeholder="09:00 - 21:00"
                      className="rounded-xl"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{fieldLabels.slogan}</Label>
                    <Input
                      value={form.slogan}
                      onChange={(event) => setForm((prev) => ({ ...prev, slogan: event.target.value }))}
                      className="rounded-xl"
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label>{fieldLabels.brandingColor}</Label>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={form.brandingColor}
                        onChange={(event) => setForm((prev) => ({ ...prev, brandingColor: event.target.value }))}
                        className="h-11 w-14 cursor-pointer rounded-xl border border-border bg-transparent"
                      />
                      <Input
                        value={form.brandingColor}
                        onChange={(event) => setForm((prev) => ({ ...prev, brandingColor: event.target.value }))}
                        className="flex-1 rounded-xl font-mono text-sm"
                      />
                      <div
                        className="h-11 w-11 shrink-0 rounded-xl ring-1 ring-border/50"
                        style={{ backgroundColor: form.brandingColor }}
                      />
                    </div>
                  </div>
                </FormSection>
                {editBranch ? null : (
                <FormSection title="Branch Manager" description="Optional — invite a manager by Gmail for first-time Google sign-in">
                  <div className="space-y-2">
                    <Label>{fieldLabels.managerEmail}</Label>
                    <Input
                      type="email"
                      placeholder="manager@gmail.com"
                      value={form.managerEmail}
                      onChange={(event) => setForm((prev) => ({ ...prev, managerEmail: event.target.value }))}
                      className="rounded-xl"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{fieldLabels.managerName}</Label>
                    <Input
                      value={form.managerName}
                      onChange={(event) => setForm((prev) => ({ ...prev, managerName: event.target.value }))}
                      placeholder="Shown in the dashboard"
                      className="rounded-xl"
                    />
                  </div>
                </FormSection>
                )}
                <DialogFooter>
                  <Button onClick={() => void handleCreate()} disabled={saving || !form.name || !form.code} className="rounded-xl">
                    {saving ? "Saving..." : editBranch ? "Save Changes" : "Save Branch"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </PageActions>
        ) : null}

        {branches.length === 0 ? (
          <EmptyState
            title="No branches yet"
            description="Step 1: Create your first branch here. Then add exchange rates, a video URL, and display messages from the sidebar."
            icon={Building2}
            actionLabel="Add Branch"
            onAction={hasPermission("createBranch") ? () => setOpen(true) : undefined}
          />
        ) : (
          <>
            {displayBranch ? (
              <ContentPanel title="Your TV link" description="Copy this link and open it on your shop TV">
                {activeBranches.length > 1 ? (
                  <div className="mb-4">
                    <BranchSelector
                      branches={activeBranches}
                      value={resolvedDisplayBranchId}
                      onChange={setDisplayBranchId}
                      label="Branch"
                    />
                  </div>
                ) : null}
                <DisplayUrlCard branchCode={displayBranch.code} branchName={displayBranch.name} />
              </ContentPanel>
            ) : null}

            <ContentPanel title="Branch Directory" description={`${branches.length} location${branches.length === 1 ? "" : "s"}`}>
            <DataTable
              data={branches}
              keyExtractor={(b) => b.id}
              mobileTitle={(b) => b.name}
              columns={[
                {
                  key: "name",
                  header: "Name",
                  cell: (b) => (
                    <div className="flex items-center gap-2.5">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: b.brandingColor ?? "#6366f1" }}
                      />
                      <span className="font-medium">{b.name}</span>
                    </div>
                  ),
                },
                { key: "code", header: "Code", cell: (b) => <span className="font-mono text-xs">{b.code}</span> },
                {
                  key: "display",
                  header: "Display",
                  cell: (b) => (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-lg text-xs"
                        onClick={() => copyDisplayUrl(b.code)}
                      >
                        <Copy className="mr-1.5 h-3 w-3" />
                        Copy URL
                      </Button>
                      <Button
                        variant="default"
                        size="sm"
                        className="h-8 rounded-lg text-xs"
                        render={
                          <a href={getDisplayUrl(b.code)} target="_blank" rel="noreferrer">
                            <ExternalLink className="mr-1.5 h-3 w-3" />
                            Open
                          </a>
                        }
                      />
                    </div>
                  ),
                },
                { key: "city", header: "City", cell: (b) => b.city, hideOnMobile: true },
                {
                  key: "slogan",
                  header: "Slogan",
                  cell: (b) => <span className="max-w-[180px] truncate">{b.settings?.slogan}</span>,
                  hideOnMobile: true,
                },
                { key: "hours", header: "Hours", cell: (b) => b.workingHours, hideOnMobile: true },
                {
                  key: "status",
                  header: "Status",
                  cell: (b) => <StatusBadge status={b.status} />,
                },
                {
                  key: "actions",
                  header: "Actions",
                  className: "text-right",
                  cell: (b) => (
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {hasPermission("editBranch") ? (
                        <Button variant="outline" size="sm" className="rounded-lg" onClick={() => openEditBranch(b)}>
                          <Pencil className="mr-1 h-3 w-3" />
                          Edit
                        </Button>
                      ) : null}
                      {hasPermission("deleteBranch") ? (
                        b.status === "active" ? (
                          <AlertDialog>
                            <AlertDialogTrigger render={<Button variant="outline" size="sm" className="rounded-lg">Disable</Button>} />
                            <AlertDialogContent className="rounded-2xl sm:max-w-md">
                              <AlertDialogHeader>
                                <AlertDialogTitle>Disable {b.name}?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This branch will no longer appear in active operations. Display signage and rates will remain but the branch status changes to disabled.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
                                <AlertDialogAction className="rounded-xl" onClick={() => void handleDisable(b)}>
                                  Disable Branch
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        ) : (
                          <Button variant="outline" size="sm" className="rounded-lg" onClick={() => void handleEnable(b)}>
                            Enable
                          </Button>
                        )
                      ) : null}
                      {hasPermission("deleteBranch") ? (
                        <AlertDialog>
                          <AlertDialogTrigger
                            render={
                              <Button
                                variant="outline"
                                size="sm"
                                className="rounded-lg text-destructive hover:text-destructive"
                              >
                                <Trash2 className="mr-1 h-3 w-3" />
                                Delete
                              </Button>
                            }
                          />
                          <AlertDialogContent className="rounded-2xl sm:max-w-md">
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete {b.name} permanently?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This removes the branch <span className="font-mono font-semibold">{b.code}</span>{" "}
                                permanently. Its display link will stop working and it will no longer appear
                                anywhere. This cannot be undone — if you only want to hide it, use{" "}
                                <strong>Disable</strong> instead.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                className="rounded-xl bg-destructive text-white hover:bg-destructive/90"
                                onClick={() => void handleDelete(b)}
                              >
                                Delete permanently
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      ) : null}
                    </div>
                  ),
                },
              ]}
            />
            </ContentPanel>
          </>
        )}
      </PageShell>
    </>
  );
}
