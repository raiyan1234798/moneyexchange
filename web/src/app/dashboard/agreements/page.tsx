"use client";

import { useEffect, useState } from "react";
import {
  FileText,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Clock,
  ExternalLink,
  Archive,
} from "lucide-react";
import { toast } from "sonner";
import { DashboardHeader } from "@/components/layout/dashboard-sidebar";
import {
  ContentPanel,
  DataTable,
  EmptyState,
  FirestoreSetupNotice,
  PageActions,
  PageShell,
  StatusBadge,
} from "@/components/shared/page-elements";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
import { useAuth } from "@/contexts/auth-context";
import { useBranchScope } from "@/lib/hooks/use-branch-scope";
import { useFirestoreNotice } from "@/lib/hooks/use-firestore-notice";
import {
  subscribeAgreements,
  subscribeAllAgreements,
  subscribeSignatures,
  getUserSignature,
  addAgreement,
  archiveAgreement,
  signAgreement,
} from "@/lib/services/agreement-service";
import type { Agreement, AgreementSignature, UserRole } from "@/lib/types";
import { safeFormatDistanceToNow } from "@/lib/utils/date";

// ─── Role-label helper ────────────────────────────────────────────────────────

const ROLE_LABELS: Record<UserRole, string> = {
  superAdmin: "Super Admin",
  admin: "Admin",
  branchManager: "Branch Manager",
  branchUser: "Branch User",
};

const ALL_ROLES: UserRole[] = ["superAdmin", "admin", "branchManager", "branchUser"];

// ─── Signature row inside an expanded agreement ───────────────────────────────

function SignaturesPanel({ agreementId }: { agreementId: string }) {
  const [sigs, setSigs] = useState<AgreementSignature[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return subscribeSignatures(agreementId, (items) => {
      setSigs(items);
      setLoading(false);
    });
  }, [agreementId]);

  if (loading) return <p className="text-sm text-muted-foreground">Loading signatures…</p>;
  if (sigs.length === 0)
    return <p className="text-sm italic text-muted-foreground">No signatures yet.</p>;

  return (
    <div className="space-y-2">
      {sigs.map((sig) => (
        <div
          key={sig.id}
          className="flex items-center justify-between rounded-xl border border-border/30 bg-background/60 px-3 py-2 text-sm"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
            <span className="font-medium">{sig.userName}</span>
            {sig.branchName && (
              <span className="text-muted-foreground">· {sig.branchName}</span>
            )}
          </div>
          <span className="text-xs text-muted-foreground">
            {safeFormatDistanceToNow(sig.signedAt)} ago
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Admin view ───────────────────────────────────────────────────────────────

function AdminView() {
  const { user, profile } = useAuth();
  const { notice, onError, clearNotice } = useFirestoreNotice("agreements");
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<Agreement | null>(null);

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const [fileName, setFileName] = useState("");
  const [requiresSig, setRequiresSig] = useState(true);
  const [targetRoles, setTargetRoles] = useState<UserRole[]>(["branchManager", "branchUser"]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    return subscribeAllAgreements((items) => {
      setAgreements(items);
      clearNotice();
    }, onError);
  }, [clearNotice, onError]);

  function resetForm() {
    setTitle("");
    setDescription("");
    setFileUrl("");
    setFileName("");
    setRequiresSig(true);
    setTargetRoles(["branchManager", "branchUser"]);
  }

  function toggleRole(role: UserRole) {
    setTargetRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );
  }

  async function handleAdd() {
    if (!user || !profile) return;
    if (!title.trim()) { toast.error("Title is required"); return; }
    if (!fileUrl.trim()) { toast.error("Document URL is required"); return; }
    if (targetRoles.length === 0) { toast.error("Select at least one target role"); return; }
    setSaving(true);
    try {
      await addAgreement(
        {
          title: title.trim(),
          description: description.trim() || undefined,
          fileUrl: fileUrl.trim(),
          fileName: fileName.trim() || title.trim(),
          uploadedBy: user.uid,
          uploadedByName: profile.displayName || profile.email,
          requiresSignature: requiresSig,
          targetRoles,
          status: "active",
        },
        { userId: user.uid, userName: profile.displayName || profile.email },
      );
      toast.success("Agreement published");
      setOpen(false);
      resetForm();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive() {
    if (!archiveTarget || !user || !profile) return;
    try {
      await archiveAgreement(archiveTarget.id, {
        userId: user.uid,
        userName: profile.displayName || profile.email,
      });
      toast.success("Agreement archived");
      setArchiveTarget(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to archive");
    }
  }

  const active = agreements.filter((a) => a.status === "active");
  const archived = agreements.filter((a) => a.status === "archived");

  return (
    <>
      <FirestoreSetupNotice message={notice} />

      <PageActions>
        <Dialog open={open} onOpenChange={(next) => { if (!next) resetForm(); setOpen(next); }}>
          <DialogTrigger render={
            <Button className="rounded-xl">
              <Plus className="mr-2 h-4 w-4" />
              Add Agreement
            </Button>
          } />
          <DialogContent className="max-h-[85vh] overflow-y-auto rounded-2xl sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>New Agreement</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Title <span className="text-destructive">*</span></Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Branch Staff Service Agreement 2026"
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label>Description (optional)</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Brief note about what this agreement covers"
                  rows={2}
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label>Document URL <span className="text-destructive">*</span></Label>
                <Input
                  value={fileUrl}
                  onChange={(e) => setFileUrl(e.target.value)}
                  placeholder="https://… (PDF, Google Drive, etc.)"
                  className="rounded-xl"
                />
                <p className="text-xs text-muted-foreground">
                  Paste a publicly accessible link to the agreement document (PDF or web page).
                </p>
              </div>
              <div className="space-y-2">
                <Label>Document label / file name</Label>
                <Input
                  value={fileName}
                  onChange={(e) => setFileName(e.target.value)}
                  placeholder="e.g. service-agreement-2026.pdf"
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-3 rounded-xl border border-border/40 bg-muted/20 p-4">
                <Label>Who must sign this?</Label>
                <div className="flex flex-wrap gap-2">
                  {ALL_ROLES.map((role) => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => toggleRole(role)}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                        targetRoles.includes(role)
                          ? "border-[var(--brand-primary)] bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]"
                          : "border-border/40 text-muted-foreground hover:border-border"
                      }`}
                    >
                      {ROLE_LABELS[role]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-border/40 bg-muted/20 p-4">
                <div>
                  <p className="text-sm font-medium">Requires digital signature</p>
                  <p className="text-xs text-muted-foreground">
                    Staff must tap &quot;Sign&quot; to acknowledge they have read this.
                  </p>
                </div>
                <Switch checked={requiresSig} onCheckedChange={setRequiresSig} />
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={() => void handleAdd()}
                disabled={saving || !title.trim() || !fileUrl.trim()}
                className="rounded-xl"
              >
                {saving ? "Publishing…" : "Publish Agreement"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageActions>

      {/* Active agreements */}
      {active.length === 0 ? (
        <EmptyState
          title="No agreements yet"
          description="Add your first agreement — branch staff will see it when they log in."
          icon={FileText}
          actionLabel="Add Agreement"
          onAction={() => setOpen(true)}
        />
      ) : (
        <ContentPanel title="Active Agreements">
          <div className="divide-y divide-border/30">
            {active.map((ag) => (
              <div key={ag.id} className="py-4 first:pt-0 last:pb-0">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 shrink-0 text-[var(--brand-primary)]" />
                      <span className="truncate font-semibold">{ag.title}</span>
                      {ag.requiresSignature && (
                        <span className="shrink-0 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                          Signature required
                        </span>
                      )}
                    </div>
                    {ag.description && (
                      <p className="mt-1 pl-6 text-sm text-muted-foreground">{ag.description}</p>
                    )}
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 pl-6 text-xs text-muted-foreground">
                      <span>
                        For: {ag.targetRoles.map((r) => ROLE_LABELS[r]).join(", ")}
                      </span>
                      <span>·</span>
                      <span>Added {safeFormatDistanceToNow(ag.createdAt)} ago</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-lg"
                      render={<a href={ag.fileUrl} target="_blank" rel="noopener noreferrer" />}
                    >
                      <ExternalLink className="mr-1 h-3 w-3" />
                      View
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-lg"
                      onClick={() => setExpanded(expanded === ag.id ? null : ag.id)}
                    >
                      {expanded === ag.id ? (
                        <ChevronUp className="mr-1 h-3 w-3" />
                      ) : (
                        <ChevronDown className="mr-1 h-3 w-3" />
                      )}
                      {expanded === ag.id ? "Hide" : "Signatures"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-lg text-muted-foreground hover:text-destructive"
                      onClick={() => setArchiveTarget(ag)}
                    >
                      <Archive className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                {expanded === ag.id && (
                  <div className="mt-4 rounded-xl border border-border/30 bg-muted/20 p-4">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Signatures
                    </p>
                    <SignaturesPanel agreementId={ag.id} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </ContentPanel>
      )}

      {/* Archived agreements */}
      {archived.length > 0 && (
        <ContentPanel title="Archived Agreements">
          <div className="divide-y divide-border/30 opacity-60">
            {archived.map((ag) => (
              <div key={ag.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                <div className="flex items-center gap-2 min-w-0">
                  <Archive className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate text-sm text-muted-foreground">{ag.title}</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0 rounded-lg text-xs"
                  render={<a href={ag.fileUrl} target="_blank" rel="noopener noreferrer" />}
                >
                  <ExternalLink className="mr-1 h-3 w-3" />
                  View
                </Button>
              </div>
            ))}
          </div>
        </ContentPanel>
      )}

      <AlertDialog open={!!archiveTarget} onOpenChange={(next) => !next && setArchiveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive this agreement?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{archiveTarget?.title}&rdquo; will be hidden from branch staff. You can still
              view it in the Archived section. This does not delete existing signatures.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleArchive()}>Archive</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ─── Branch staff view ────────────────────────────────────────────────────────

function StaffView() {
  const { user, profile } = useAuth();
  const { branches, effectiveBranchId } = useBranchScope();
  const { notice, onError, clearNotice } = useFirestoreNotice("agreements");
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [signedMap, setSignedMap] = useState<Record<string, boolean>>({});
  const [signTarget, setSignTarget] = useState<Agreement | null>(null);
  const [signing, setSigning] = useState(false);
  const role = profile?.role ?? "branchUser";

  useEffect(() => {
    return subscribeAgreements((items) => {
      // Only show agreements targeting this role
      const relevant = items.filter((ag) => ag.targetRoles.includes(role as UserRole));
      setAgreements(relevant);
      clearNotice();

      if (!user) return;
      // Check signatures in parallel
      void Promise.all(
        relevant.map(async (ag) => {
          if (!ag.requiresSignature) return;
          const sig = await getUserSignature(ag.id, user.uid);
          setSignedMap((prev) => ({ ...prev, [ag.id]: !!sig }));
        }),
      );
    }, onError);
  }, [user, role, clearNotice, onError]);

  const branch = branches.find((b) => b.id === effectiveBranchId);

  async function handleSign() {
    if (!signTarget || !user || !profile) return;
    setSigning(true);
    try {
      await signAgreement(signTarget.id, {
        userId: user.uid,
        userEmail: profile.email,
        userName: profile.displayName || profile.email,
        branchId: effectiveBranchId ?? null,
        branchName: branch?.name ?? null,
      });
      setSignedMap((prev) => ({ ...prev, [signTarget.id]: true }));
      toast.success("Agreement signed — thank you!");
      setSignTarget(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to sign");
    } finally {
      setSigning(false);
    }
  }

  return (
    <>
      <FirestoreSetupNotice message={notice} />

      {agreements.length === 0 ? (
        <EmptyState
          title="No agreements"
          description="There are no agreements requiring your attention right now."
          icon={FileText}
        />
      ) : (
        <ContentPanel
          title="Your Agreements"
          description="Please review and sign any agreements marked as required."
        >
          <div className="divide-y divide-border/30">
            {agreements.map((ag) => {
              const signed = signedMap[ag.id] ?? false;
              const needsSign = ag.requiresSignature && !signed;
              return (
                <div key={ag.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 shrink-0 text-[var(--brand-primary)]" />
                      <span className="truncate font-semibold">{ag.title}</span>
                    </div>
                    {ag.description && (
                      <p className="mt-1 pl-6 text-sm text-muted-foreground">{ag.description}</p>
                    )}
                    <div className="mt-1.5 flex items-center gap-2 pl-6">
                      {ag.requiresSignature ? (
                        signed ? (
                          <span className="flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Signed
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                            <Clock className="h-3.5 w-3.5" />
                            Signature pending
                          </span>
                        )
                      ) : (
                        <span className="text-xs text-muted-foreground">No signature required</span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-lg"
                      render={<a href={ag.fileUrl} target="_blank" rel="noopener noreferrer" />}
                    >
                      <ExternalLink className="mr-1 h-3 w-3" />
                      View
                    </Button>
                    {needsSign && (
                      <Button
                        size="sm"
                        className="rounded-lg"
                        onClick={() => setSignTarget(ag)}
                      >
                        Sign
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </ContentPanel>
      )}

      <AlertDialog open={!!signTarget} onOpenChange={(next) => !next && setSignTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign this agreement?</AlertDialogTitle>
            <AlertDialogDescription>
              By signing, you confirm that you have read and understood &ldquo;
              {signTarget?.title}&rdquo;. This action will be recorded.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleSign()}
              disabled={signing}
            >
              {signing ? "Signing…" : "Sign Agreement"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AgreementsPage() {
  const { isSuperAdmin, isAdmin } = useAuth();
  const isPlatformAdmin = isSuperAdmin || isAdmin;

  return (
    <>
      <DashboardHeader
        title="Agreements"
        description={
          isPlatformAdmin
            ? "Upload and manage agreement documents. Branch staff can view and sign them here."
            : "Review and sign agreements shared with your role."
        }
        accent="violet"
      />
      <PageShell accent="violet">
        {isPlatformAdmin ? <AdminView /> : <StaffView />}
      </PageShell>
    </>
  );
}
