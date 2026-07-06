"use client";

import { useEffect, useState } from "react";
import { ScrollText } from "lucide-react";
import { safeFormatDate } from "@/lib/utils/date";
import { DashboardHeader } from "@/components/layout/dashboard-sidebar";
import { ContentPanel, DataTable, EmptyState, FirestoreSetupNotice, PageShell } from "@/components/shared/page-elements";
import { subscribeCollection, orderBy, where } from "@/lib/firebase/firestore";
import { COLLECTIONS } from "@/lib/constants";
import { useAuth } from "@/contexts/auth-context";
import { useBranchScope } from "@/lib/hooks/use-branch-scope";
import { useFirestoreNotice } from "@/lib/hooks/use-firestore-notice";
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
              ]}
            />
          </ContentPanel>
        )}
      </PageShell>
    </>
  );
}
