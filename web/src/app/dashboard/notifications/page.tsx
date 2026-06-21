"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { DashboardHeader } from "@/components/layout/dashboard-sidebar";
import { ContentPanel, EmptyState, PageShell, StatusBadge } from "@/components/shared/page-elements";
import { subscribeCollection, orderBy } from "@/lib/firebase/firestore";
import { COLLECTIONS } from "@/lib/constants";
import type { AppNotification } from "@/lib/types";

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  useEffect(() => {
    return subscribeCollection<AppNotification>(
      COLLECTIONS.notifications,
      [orderBy("createdAt", "desc")],
      setNotifications,
    );
  }, []);

  return (
    <>
      <DashboardHeader title="Notifications" description="Operational alerts for TVs, rates, and content." accent="amber" />
      <PageShell accent="amber">
        {notifications.length === 0 ? (
          <EmptyState
            title="No notifications"
            description="Alerts for offline TVs, rate changes, and content expiry will appear here in real time."
            icon={Bell}
          />
        ) : (
          <ContentPanel title="Alert Feed" description={`${notifications.filter((n) => !n.read).length} unread`}>
            <div className="space-y-3">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className="flex items-start justify-between gap-4 rounded-xl border border-border/30 bg-muted/15 p-4 transition-colors hover:bg-muted/25"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{notification.title}</p>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{notification.message}</p>
                    <p className="mt-2 text-xs text-muted-foreground capitalize">{notification.type.replaceAll("_", " ")}</p>
                  </div>
                  <StatusBadge status={notification.read ? "read" : "new"} variant={notification.read ? "neutral" : "info"} />
                </div>
              ))}
            </div>
          </ContentPanel>
        )}
      </PageShell>
    </>
  );
}
