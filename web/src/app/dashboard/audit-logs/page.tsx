"use client";

import { useEffect, useState } from "react";
import { ScrollText, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { safeFormatDate } from "@/lib/utils/date";
import { DashboardHeader } from "@/components/layout/dashboard-sidebar";
import { ContentPanel, DataTable, EmptyState, FirestoreSetupNotice, PageShell } from "@/components/shared/page-elements";
import { subscribeCollection, orderBy, where, removeDocument } from "@/lib/firebase/firestore";
import { COLLECTIONS } from "@/lib/constants";
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

export default function AuditLogsPage() {
  const { isSuperAdmin, isAdmin } = useAuth();
  const { effectiveBranchId } = useBranchScope();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const isPlatformAdmin = isSuperAdmin || isAdmin;
  const { notice, onError, clearNotice } = useFirestoreNotice("activity");

  useEffect(() => {
    const constraints = isPlatformAdmin
      ? [orderBy("timestamp", "desc")]
      : effectiveBranchId
        ? [where("branchId", "==", effectiveBranchId), orderBy("timestamp", "desc")]
        : [orderBy("timestamp", "desc")];

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
        {logs.length === 0 ? (
          <EmptyState title="No audit events yet" description="User actions and system events will be recorded here automatically." icon={ScrollText} />
        ) : (
          <ContentPanel title="Audit Trail" description={`${logs.length} events logged`}>
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
                        ),
                      },
                    ]
                  : []),
              ]}
            />
          </ContentPanel>
        )}
      </PageShell>
    </>
  );
}
