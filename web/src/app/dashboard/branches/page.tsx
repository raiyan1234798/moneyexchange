"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Building2, Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { DashboardHeader } from "@/components/layout/dashboard-sidebar";
import { BranchSelector } from "@/components/shared/branch-selector";
import { DisplayUrlCard } from "@/components/shared/display-url-card";
import { LoadDemoContentButton } from "@/components/shared/load-demo-content-button";
import {
  ContentPanel,
  DataTable,
  EmptyState,
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
  DialogTrigger,
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
import { DEFAULT_BRANCH_SETTINGS } from "@/lib/constants";
import { getDisplayUrl } from "@/lib/display-url";
import { DEMO_BRANCH_CODE } from "@/lib/demo-content";
import { createBranch, disableBranch, subscribeBranches } from "@/lib/services/branch-service";
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
  brandingColor: "#6366f1",
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
};

export default function BranchesPage() {
  const { profile, user, hasPermission } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
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
  const demoBranch = branches.find((b) => b.code === DEMO_BRANCH_CODE);

  useEffect(() => {
    return subscribeBranches(setBranches);
  }, []);

  async function handleCreate() {
    if (!user || !profile) return;
    setSaving(true);
    try {
      const { slogan, brandingColor, ...branchFields } = form;
      await createBranch(
        {
          ...branchFields,
          brandingColor,
          status: "active",
          settings: { ...DEFAULT_BRANCH_SETTINGS, slogan },
        },
        { userId: user.uid, userName: profile.displayName || profile.email },
      );
      toast.success("Branch created successfully");
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
    await disableBranch(branch.id, {
      userId: user.uid,
      userName: profile.displayName || profile.email,
    });
    toast.success(`${branch.name} has been disabled`);
  }

  function copyDisplayUrl(code: string) {
    void navigator.clipboard.writeText(getDisplayUrl(code));
    toast.success("Display URL copied");
  }

  return (
    <>
      <DashboardHeader title="Branches" description="Create and manage branch locations, hours, and branding." accent="violet" />
      <PageShell accent="violet">
        {hasPermission("createBranch") ? (
          <PageActions>
            {user && profile ? (
              <LoadDemoContentButton
                userId={user.uid}
                userName={profile.displayName || profile.email}
                variant="outline"
              />
            ) : null}
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger render={<Button className="rounded-xl"><Plus className="mr-2 h-4 w-4" />Add Branch</Button>} />
              <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Create Branch</DialogTitle>
                </DialogHeader>
                <FormSection title="Location Details" description="Basic branch information">
                  {(Object.keys(emptyForm) as Array<keyof typeof emptyForm>)
                    .filter((key) => !["slogan", "brandingColor", "workingHours"].includes(key))
                    .map((key) => (
                      <div key={key} className="space-y-2">
                        <Label>{fieldLabels[key]}</Label>
                        <Input
                          value={form[key]}
                          onChange={(event) => setForm((prev) => ({ ...prev, [key]: event.target.value }))}
                          className="rounded-xl"
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
                <DialogFooter>
                  <Button onClick={() => void handleCreate()} disabled={saving || !form.name || !form.code} className="rounded-xl">
                    {saving ? "Creating..." : "Save Branch"}
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
            {demoBranch ? (
              <ContentPanel
                title="Demo Branch Display"
                description="Share this URL with clients — loads rates, video, and ticker after Load Demo Content"
              >
                <DisplayUrlCard branchCode={demoBranch.code} branchName={demoBranch.name} />
              </ContentPanel>
            ) : null}

            {displayBranch ? (
              <ContentPanel title="Launch Display" description="Copy or scan to open signage on any screen">
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
                  cell: (b) =>
                    hasPermission("deleteBranch") ? (
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
                    ) : null,
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
