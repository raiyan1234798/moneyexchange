"use client";

import { useEffect, useState } from "react";
import { ScrollText } from "lucide-react";
import { format } from "date-fns";
import { DashboardHeader } from "@/components/layout/dashboard-sidebar";
import { ContentPanel, DataTable, EmptyState, PageShell } from "@/components/shared/page-elements";
import { subscribeCollection, orderBy } from "@/lib/firebase/firestore";
import { COLLECTIONS } from "@/lib/constants";
import type { AuditLog } from "@/lib/types";

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);

  useEffect(() => {
    return subscribeCollection<AuditLog>(COLLECTIONS.auditLogs, [orderBy("timestamp", "desc")], setLogs);
  }, []);

  return (
    <>
      <DashboardHeader title="Audit Logs" description="Immutable activity trail for compliance and operations." accent="default" />
      <PageShell>
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
                  cell: (l) =>
                    l.timestamp ? format(new Date(String(l.timestamp)), "MMM d, yyyy HH:mm") : "—",
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
