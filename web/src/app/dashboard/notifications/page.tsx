"use client";

import { useEffect, useMemo, useState } from "react";
import { limit } from "@/lib/d1/firestore-compat";
import {
  Bell,
  Building2,
  ImageIcon,
  KeyRound,
  MonitorPlay,
  ScrollText,
  TrendingUp,
  UserPlus,
  Video,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { DashboardHeader } from "@/components/layout/dashboard-sidebar";
import { Badge } from "@/components/ui/badge";
import { ContentPanel, EmptyState, FirestoreSetupNotice, PageShell } from "@/components/shared/page-elements";
import { subscribeCollection, orderBy, where } from "@/lib/firebase/firestore";
import { COLLECTIONS } from "@/lib/constants";
import { useAuth } from "@/contexts/auth-context";
import { useBranchScope } from "@/lib/hooks/use-branch-scope";
import { useFirestoreNotice } from "@/lib/hooks/use-firestore-notice";
import { safeFormatDistanceToNow } from "@/lib/utils/date";
import type { AuditLog } from "@/lib/types";

const FEED_LIMIT = 80;
const LAST_SEEN_KEY = "unimoni-notifications-last-seen";

interface FeedEntry {
  icon: LucideIcon;
  title: string;
  detail: string;
}

function prettify(slug: string): string {
  const text = slug.replace(/_/g, " ").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function describeLog(log: AuditLog): FeedEntry {
  const meta = (log.metadata ?? {}) as Record<string, unknown>;
  const currency = typeof meta.currencyCode === "string" ? meta.currencyCode : "";
  const contentTitle = typeof meta.title === "string" ? meta.title : "";
  const buy = meta.buyRate ?? meta.newBuyRate ?? meta.proposedBuyRate;
  const sell = meta.sellRate ?? meta.newSellRate ?? meta.proposedSellRate;
  const rateLine = buy != null && sell != null ? `Buy ${buy} / Sell ${sell}` : "";

  switch (log.action) {
    case "rate_change":
      return {
        icon: TrendingUp,
        title: `Rate updated${currency ? ` — ${currency}` : ""}`,
        detail: rateLine || "Exchange rate changed",
      };
    case "rate_display_name_change":
      return {
        icon: TrendingUp,
        title: `Currency renamed${currency ? ` — ${currency}` : ""}`,
        detail: typeof meta.displayName === "string" ? `Now shows as "${meta.displayName}"` : "",
      };
    case "update":
      if (log.entityType === "exchange_rate") {
        return {
          icon: TrendingUp,
          title: `Rate updated${currency ? ` — ${currency}` : ""}`,
          detail: rateLine || "Exchange rate changed",
        };
      }
      return { icon: Bell, title: `${prettify(log.entityType)} updated`, detail: contentTitle };
    case "rate_add_currency":
      return { icon: TrendingUp, title: `Currency added${currency ? ` — ${currency}` : ""}`, detail: "New currency on the rate board" };
    case "rate_remove_currency":
      return { icon: TrendingUp, title: "Currency removed", detail: "Removed from the rate board" };
    case "rate_bulk_import":
      return { icon: TrendingUp, title: "Rates imported from file", detail: `${meta.count ?? "All"} currencies updated at once` };
    case "rate_reorder":
      return { icon: TrendingUp, title: "Rate board reordered", detail: "Display order changed" };
    case "rate_change_pending":
      return { icon: TrendingUp, title: `Rate change awaiting approval${currency ? ` — ${currency}` : ""}`, detail: rateLine || "Submitted for review" };
    case "rate_approval_approved":
      return { icon: TrendingUp, title: `Rate change approved${currency ? ` — ${currency}` : ""}`, detail: rateLine || "Now live on the display" };
    case "rate_approval_rejected":
      return { icon: TrendingUp, title: `Rate change rejected${currency ? ` — ${currency}` : ""}`, detail: String(meta.reason ?? "") };
    case "video_proposed":
      return { icon: Video, title: "Video proposed — needs approval", detail: contentTitle };
    case "video_approved":
      return { icon: Video, title: "Video approved — now playing", detail: contentTitle };
    case "video_rejected":
      return { icon: Video, title: "Video rejected", detail: contentTitle };
    case "video_add_external":
    case "video_add_google_drive":
      return { icon: Video, title: "Video linked to display", detail: contentTitle };
    case "video_upload":
    case "video_upload_r2":
    case "video_upload_chunked":
      return { icon: Video, title: "Video uploaded to display", detail: contentTitle };
    case "video_replace":
      return { icon: Video, title: "Video replaced", detail: contentTitle };
    case "video_sync_all_branches":
      return { icon: Video, title: "Video applied to all branches", detail: contentTitle };
    case "delete":
      if (log.entityType === "video") {
        return { icon: Video, title: "Video removed", detail: contentTitle };
      }
      return { icon: Bell, title: `${prettify(log.entityType)} removed`, detail: contentTitle };
    case "image_advert_add":
    case "image_advert_upload":
      return { icon: ImageIcon, title: "Image advert added", detail: contentTitle };
    case "image_advert_delete":
      return { icon: ImageIcon, title: "Image advert removed", detail: contentTitle };
    case "ticker_change":
      return { icon: ScrollText, title: "Display message updated", detail: contentTitle };
    case "currency_add":
      return { icon: TrendingUp, title: `Currency created${currency ? ` — ${currency}` : ""}`, detail: "" };
    case "currency_delete":
      return { icon: TrendingUp, title: "Currency deleted", detail: "" };
    case "tv_create":
      return { icon: MonitorPlay, title: "TV device registered", detail: contentTitle };
    case "tv_restart":
      return { icon: MonitorPlay, title: "TV restart requested", detail: contentTitle };
    case "create":
      if (log.entityType === "branch") {
        return { icon: Building2, title: "Branch created", detail: contentTitle };
      }
      return { icon: Bell, title: `${prettify(log.entityType)} created`, detail: contentTitle };
    case "login":
      return { icon: KeyRound, title: "Signed in", detail: "" };
    case "logout":
      return { icon: KeyRound, title: "Signed out", detail: "" };
    case "invite_created":
      return { icon: UserPlus, title: "User invited", detail: contentTitle };
    default:
      return { icon: Bell, title: prettify(log.action), detail: contentTitle };
  }
}

function toMillis(value: AuditLog["timestamp"]): number {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "object" && "toDate" in value) return value.toDate().getTime();
  return 0;
}

export default function NotificationsPage() {
  const { isSuperAdmin, isAdmin } = useAuth();
  const { branches, managerBranchId } = useBranchScope();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loaded, setLoaded] = useState(false);
  const isPlatformAdmin = isSuperAdmin || isAdmin;
  const { notice, onError, clearNotice } = useFirestoreNotice("notifications");

  // Captured once per visit: everything newer than the previous visit is "New".
  const [lastSeen] = useState<number>(() => {
    if (typeof window === "undefined") return 0;
    return Number(window.localStorage.getItem(LAST_SEEN_KEY) ?? 0);
  });

  useEffect(() => {
    window.localStorage.setItem(LAST_SEEN_KEY, String(Date.now()));
  }, []);

  useEffect(() => {
    // Admins see every branch; branch managers see their own branch only
    // (the query must match the audit_logs rules scope or Firestore rejects it).
    if (!isPlatformAdmin && !managerBranchId) return;
    const constraints = isPlatformAdmin
      ? [orderBy("timestamp", "desc"), limit(FEED_LIMIT)]
      : [where("branchId", "==", managerBranchId), orderBy("timestamp", "desc"), limit(FEED_LIMIT)];

    return subscribeCollection<AuditLog>(
      COLLECTIONS.auditLogs,
      constraints,
      (items) => {
        setLogs(items);
        setLoaded(true);
        clearNotice();
      },
      onError,
    );
  }, [clearNotice, isPlatformAdmin, managerBranchId, onError]);

  const branchNameById = useMemo(
    () => new Map(branches.map((branch) => [branch.id, branch.name])),
    [branches],
  );

  const newCount = useMemo(
    () => logs.filter((log) => toMillis(log.timestamp) > lastSeen).length,
    [lastSeen, logs],
  );

  return (
    <>
      <DashboardHeader
        title="Notifications"
        description="Every change across rates, videos, messages, and users — live."
        accent="amber"
      />
      <PageShell accent="amber">
        <FirestoreSetupNotice message={notice} />
        {logs.length === 0 ? (
          <EmptyState
            title={
              loaded || (!isPlatformAdmin && !managerBranchId)
                ? "No activity yet"
                : "Loading notifications…"
            }
            description="Rate updates, video changes, display messages, and user changes appear here in real time."
            icon={Bell}
          />
        ) : (
          <ContentPanel
            title="Change Feed"
            description={
              newCount > 0 ? `${newCount} new since your last visit` : "You're all caught up"
            }
          >
            <div className="space-y-3">
              {logs.map((log) => {
                const entry = describeLog(log);
                const Icon = entry.icon;
                const isNew = toMillis(log.timestamp) > lastSeen;
                const branchName = log.branchId
                  ? branchNameById.get(log.branchId) ?? log.branchId
                  : "All branches";
                return (
                  <div
                    key={log.id}
                    className="flex items-start gap-4 rounded-xl border border-border/30 bg-muted/15 p-4 transition-colors hover:bg-muted/25"
                  >
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <Icon className="h-4 w-4 text-primary" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{entry.title}</p>
                        {isNew ? (
                          <Badge className="bg-amber-500/15 text-[10px] uppercase tracking-wide text-amber-600 hover:bg-amber-500/15 dark:text-amber-400">
                            New
                          </Badge>
                        ) : null}
                      </div>
                      {entry.detail ? (
                        <p className="mt-1 truncate text-sm text-muted-foreground">{entry.detail}</p>
                      ) : null}
                      <p className="mt-1.5 text-xs text-muted-foreground/80">
                        {branchName} · {log.userName || "System"} · {safeFormatDistanceToNow(log.timestamp)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </ContentPanel>
        )}
      </PageShell>
    </>
  );
}
