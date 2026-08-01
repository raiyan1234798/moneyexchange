"use client";

import { useEffect, useState } from "react";
import { Download, ScrollText, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { safeFormatDate } from "@/lib/utils/date";
import { DashboardHeader } from "@/components/layout/dashboard-sidebar";
import { ContentPanel, DataTable, EmptyState, FirestoreSetupNotice, PageShell } from "@/components/shared/page-elements";
import {
  subscribeCollection,
  orderBy,
  where,
  limit,
  removeDocument,
  countDocuments,
  deleteAuditLogsBefore,
} from "@/lib/firebase/firestore";
import { Timestamp } from "firebase/firestore";
import { COLLECTIONS } from "@/lib/constants";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/auth-context";
import { useBranchScope } from "@/lib/hooks/use-branch-scope";
import { useFirestoreNotice } from "@/lib/hooks/use-firestore-notice";
import { Button } from "@/components/ui/button";
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
import type { AuditLog } from "@/lib/types";

// The list shows only the newest entries: audit docs are LARGE (they embed full
// settings snapshots) and an unbounded listener would download the whole
// history — hundreds of MB — every time this page opens.
const RECENT_LIMIT = 300;

export default function AuditLogsPage() {
  const { isSuperAdmin, isAdmin } = useAuth();
  const { effectiveBranchId } = useBranchScope();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const isPlatformAdmin = isSuperAdmin || isAdmin;
  const { notice, onError, clearNotice } = useFirestoreNotice("activity");
  // Bulk cleanup ("delete old activity"): keep the newest N days, delete older.
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [keepDays, setKeepDays] = useState(90);
  // "Everything" mode: delete ALL activity (no keep window).
  const [deleteEverything, setDeleteEverything] = useState(false);
  const [oldCount, setOldCount] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deletedSoFar, setDeletedSoFar] = useState(0);

  useEffect(() => {
    const constraints = isPlatformAdmin
      ? [orderBy("timestamp", "desc"), limit(RECENT_LIMIT)]
      : effectiveBranchId
        ? [where("branchId", "==", effectiveBranchId), orderBy("timestamp", "desc"), limit(RECENT_LIMIT)]
        : [orderBy("timestamp", "desc"), limit(RECENT_LIMIT)];

    return subscribeCollection<AuditLog>(
      COLLECTIONS.auditLogs,
      constraints,
      (items) => {
        setLogs(items);
        clearNotice();
      },
      onError,
    );
  }, [clearNotice, effectiveBranchId, isPlatformAdmin, onError]);

  // Count how many entries would be deleted for the chosen window — live, so
  // the confirm button always states the exact number before anything happens.
  useEffect(() => {
    if (!cleanupOpen || !isPlatformAdmin) return;
    setOldCount(null);
    let cancelled = false;
    const constraints = deleteEverything
      ? [] // total count = everything
      : [where("timestamp", "<", Timestamp.fromDate(new Date(Date.now() - Math.max(1, keepDays) * 86_400_000)))];
    void countDocuments(COLLECTIONS.auditLogs, constraints)
      .then((n) => !cancelled && setOldCount(n))
      .catch(() => !cancelled && setOldCount(-1));
    return () => {
      cancelled = true;
    };
  }, [cleanupOpen, keepDays, deleteEverything, isPlatformAdmin]);

  async function handleBulkCleanup() {
    const days = Math.max(1, keepDays);
    setDeleting(true);
    setDeletedSoFar(0);
    try {
      const deleted = await deleteAuditLogsBefore(
        deleteEverything ? null : new Date(Date.now() - days * 86_400_000),
        setDeletedSoFar,
      );
      toast.success(
        deleted > 0
          ? deleteEverything
            ? `Deleted all ${deleted} activity entries.`
            : `Deleted ${deleted} old activity entr${deleted === 1 ? "y" : "ies"} — everything from the last ${days} days is kept.`
          : "Nothing to delete.",
      );
      setCleanupOpen(false);
      setDeleteEverything(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete old activity");
    } finally {
      setDeleting(false);
    }
  }

  async function handleDelete(log: AuditLog) {
    try {
      await removeDocument(COLLECTIONS.auditLogs, log.id);
      toast.success("Activity entry removed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove the entry");
    }
  }

  return (
    <>
      <DashboardHeader
        title="Activity"
        description={
          isPlatformAdmin
            ? "Immutable activity trail for compliance and operations."
            : "Activity from your branch team — rate edits, uploads, and sign-ins."
        }
        accent="default"
      />
      <PageShell>
        <FirestoreSetupNotice message={notice} />
        {isPlatformAdmin ? (
          <div className="flex justify-end">
            <Button
              variant="outline"
              className="rounded-xl text-destructive hover:text-destructive"
              onClick={() => setCleanupOpen(true)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete old activity
            </Button>
          </div>
        ) : null}
        {logs.length === 0 ? (
          <EmptyState title="No audit events yet" description="User actions and system events will be recorded here automatically." icon={ScrollText} />
        ) : (
          <ContentPanel
            title="Audit Trail"
            description={
              logs.length >= RECENT_LIMIT
                ? `Latest ${RECENT_LIMIT} events (older entries stay stored — use "Delete old activity" to clear them)`
                : `${logs.length} events logged`
            }
          >
            <DataTable
              data={logs}
              keyExtractor={(l) => l.id}
              mobileTitle={(l) => l.action.replaceAll("_", " ")}
              columns={[
                {
                  key: "timestamp",
                  header: "Timestamp",
                  cell: (l) => safeFormatDate(l.timestamp, "MMM d, yyyy HH:mm"),
                  hideOnMobile: true,
                },
                {
                  key: "action",
                  header: "Action",
                  cell: (l) => <span className="font-medium capitalize">{l.action.replaceAll("_", " ")}</span>,
                },
                { key: "user", header: "User", cell: (l) => l.userName },
                { key: "entity", header: "Entity", cell: (l) => l.entityType, hideOnMobile: true },
                { key: "branch", header: "Branch", cell: (l) => l.branchId ?? "Global", hideOnMobile: true },
                ...(isPlatformAdmin
                  ? [
                      {
                        key: "actions",
                        header: "",
                        className: "text-right",
                        cell: (l: AuditLog) => (
                          <div className="flex items-center justify-end gap-1.5">
                          {/* Full entry as JSON — includes the settings snapshot
                              saved with branch updates (useful for recovery). */}
                          <Button
                            variant="outline"
                            size="icon-sm"
                            className="rounded-lg"
                            aria-label="Download this entry as JSON"
                            onClick={() => {
                              const blob = new Blob([JSON.stringify(l, null, 2)], {
                                type: "application/json",
                              });
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement("a");
                              a.href = url;
                              a.download = `activity-${l.id}.json`;
                              a.click();
                              URL.revokeObjectURL(url);
                            }}
                          >
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger
                              render={
                                <Button
                                  variant="outline"
                                  size="icon-sm"
                                  className="rounded-lg text-destructive hover:text-destructive"
                                  aria-label="Delete this activity entry"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              }
                            />
                            <AlertDialogContent className="rounded-2xl">
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete this activity entry?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This removes the log row permanently. Use it to clean up mistaken or
                                  error entries.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => void handleDelete(l)}>
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                          </div>
                        ),
                      },
                    ]
                  : []),
              ]}
            />
          </ContentPanel>
        )}

        {/* Bulk cleanup: keep the last N days, delete everything older. The
            count is fetched server-side first so the red button always states
            exactly how many entries will go. */}
        <AlertDialog open={cleanupOpen} onOpenChange={(o) => !o && !deleting && setCleanupOpen(false)}>
          <AlertDialogContent className="rounded-2xl sm:max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete old activity?</AlertDialogTitle>
              <AlertDialogDescription>
                Keeps every entry from the recent days you choose and permanently deletes everything
                older. This frees database space — old settings snapshots inside the log are gone for
                good, so download anything you want to keep first.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-3 py-1">
              <div className="space-y-2">
                <Label>Keep the last … days</Label>
                <div className="flex flex-wrap items-center gap-1.5">
                  {[30, 60, 90, 180].map((d) => (
                    <button
                      key={d}
                      type="button"
                      disabled={deleting || deleteEverything}
                      onClick={() => setKeepDays(d)}
                      className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-40 ${
                        !deleteEverything && keepDays === d
                          ? "border-primary/60 bg-primary/15 text-primary"
                          : "border-border/50 text-muted-foreground hover:bg-muted/40"
                      }`}
                    >
                      {d} days
                    </button>
                  ))}
                  <Input
                    type="number"
                    min={1}
                    max={3650}
                    value={keepDays}
                    disabled={deleting || deleteEverything}
                    onChange={(e) => setKeepDays(Math.max(1, Math.min(3650, Number(e.target.value) || 1)))}
                    className="w-24 rounded-lg disabled:opacity-40"
                    aria-label="Days of activity to keep"
                  />
                </div>
                {/* One-click select-all: delete EVERYTHING (client 2026-08-01). */}
                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={deleteEverything}
                    disabled={deleting}
                    onChange={(e) => setDeleteEverything(e.target.checked)}
                    className="h-4 w-4"
                  />
                  <span className="text-sm font-medium text-destructive">
                    Select all — delete every activity entry
                  </span>
                </label>
              </div>
              <p className="rounded-lg bg-muted/30 px-3 py-2 text-sm">
                {deleting ? (
                  <>Deleting… <strong>{deletedSoFar}</strong> removed so far. Keep this page open.</>
                ) : oldCount === null ? (
                  "Counting…"
                ) : oldCount === -1 ? (
                  "Could not count — you can still run the delete."
                ) : oldCount === 0 ? (
                  "Nothing to delete."
                ) : deleteEverything ? (
                  <>
                    <strong>ALL {oldCount}</strong> activity entr{oldCount === 1 ? "y" : "ies"} will be
                    permanently deleted — nothing is kept.
                  </>
                ) : (
                  <>
                    <strong>{oldCount}</strong> entr{oldCount === 1 ? "y" : "ies"} older than{" "}
                    {safeFormatDate(new Date(Date.now() - keepDays * 86_400_000), "MMM d, yyyy")} will
                    be deleted. Newer activity stays.
                  </>
                )}
              </p>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel className="rounded-xl" disabled={deleting}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={deleting || oldCount === 0}
                onClick={(e) => {
                  // Keep the dialog open while batches run — progress shows above.
                  e.preventDefault();
                  void handleBulkCleanup();
                }}
              >
                {deleting
                  ? "Deleting…"
                  : deleteEverything
                    ? oldCount && oldCount > 0
                      ? `Delete ALL ${oldCount} entries`
                      : "Delete everything"
                    : oldCount && oldCount > 0
                      ? `Delete ${oldCount} old entries`
                      : "Delete old entries"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </PageShell>
    </>
  );
}
