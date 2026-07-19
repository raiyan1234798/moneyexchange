"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Building2, Check, FileSpreadsheet, Monitor, TrendingUp, Activity, Coins, X } from "lucide-react";
import { toast } from "sonner";
import { safeFormatDistanceToNow } from "@/lib/utils/date";
import { DashboardHeader } from "@/components/layout/dashboard-sidebar";
import { RoleFeatureBoard } from "@/components/dashboard/role-feature-board";
import { GettingStartedChecklist } from "@/components/shared/getting-started-checklist";
import { DisplayUrlCard } from "@/components/shared/display-url-card";
import {
  ContentPanel,
  PageLoader,
  PageShell,
  FirestoreSetupNotice,
  QuickActions,
  StatCard,
} from "@/components/shared/page-elements";
import { useAuth } from "@/contexts/auth-context";
import { useBranchScope } from "@/lib/hooks/use-branch-scope";
import { useFirestoreNotice } from "@/lib/hooks/use-firestore-notice";
import { subscribeCurrencies } from "@/lib/services/currency-service";
import { subscribeBranchExchangeRates } from "@/lib/services/exchange-rate-service";
import {
  approvePendingRate,
  rejectPendingRate,
  subscribePendingApprovals,
} from "@/lib/services/pending-approval-service";
import { subscribeTickers } from "@/lib/services/ticker-service";
import { subscribeVideos } from "@/lib/services/video-service";
import { subscribeCollection, orderBy, where, limit } from "@/lib/firebase/firestore";
import { COLLECTIONS } from "@/lib/constants";
import { getDisplayUrl } from "@/lib/display-url";
import type { AuditLog, DashboardStats, PendingApproval } from "@/lib/types";
import { StatusBadge } from "@/components/shared/page-elements";
import { Button } from "@/components/ui/button";

export default function DashboardOverviewPage() {
  const { user, profile, isBranchManager, isSuperAdmin, isAdmin } = useAuth();
  const { branches, effectiveBranchId } = useBranchScope();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentLogs, setRecentLogs] = useState<AuditLog[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [branchRatesCount, setBranchRatesCount] = useState(0);
  const [branchVideosCount, setBranchVideosCount] = useState(0);
  const [branchTickersCount, setBranchTickersCount] = useState(0);

  const scopedBranch = branches.find((b) => b.id === effectiveBranchId);
  const isPlatformAdmin = isSuperAdmin || isAdmin;
  const canReviewApprovals = isPlatformAdmin || isBranchManager;
  // Admins, branch managers, and super admins can approve rate changes.
  const canApproveRates = isPlatformAdmin || isBranchManager;
  const { notice, onError, clearNotice } = useFirestoreNotice("dashboard data");

  useEffect(() => {
    if (!canReviewApprovals) return;
    return subscribePendingApprovals(
      isSuperAdmin ? null : effectiveBranchId ?? null,
      setPendingApprovals,
      onError,
    );
  }, [canReviewApprovals, isSuperAdmin, effectiveBranchId, onError]);

  useEffect(() => {
    let currencies = 0;

    const unsubCurrencies = subscribeCurrencies(
      (items) => {
        currencies = items.length;
        setStats((prev) =>
          prev
            ? { ...prev, totalCurrencies: currencies }
            : {
                totalBranches: branches.length,
                activeTvs: 0,
                offlineTvs: 0,
                totalCurrencies: currencies,
                pendingRateApprovals: 0,
                recentAuditEvents: 0,
              },
        );
        setLoading(false);
        clearNotice();
      },
      onError,
    );

    const rateConstraints = isPlatformAdmin
      ? [where("status", "==", "pending")]
      : effectiveBranchId
        ? [where("status", "==", "pending"), where("branchId", "==", effectiveBranchId)]
        : [where("status", "==", "pending")];

    const unsubRates = subscribeCollection<{ id: string }>(
      COLLECTIONS.pendingApprovals,
      rateConstraints,
      (items) => {
        setStats((prev) =>
          prev
            ? { ...prev, pendingRateApprovals: items.length }
            : {
                totalBranches: branches.length,
                activeTvs: 0,
                offlineTvs: 0,
                totalCurrencies: currencies,
                pendingRateApprovals: items.length,
                recentAuditEvents: 0,
              },
        );
        setLoading(false);
        clearNotice();
      },
      onError,
    );

    // Only admins and branch managers may read audit_logs (Firestore rules).
    // Branch users skip this — otherwise the query is rejected and they see a
    // "permission denied" toast on their own landing page every sign-in.
    const canReadLogs = isPlatformAdmin || isBranchManager;
    const branchLogFilter = !isPlatformAdmin && effectiveBranchId
      ? [where("branchId", "==", effectiveBranchId)]
      : [];
    // CRITICAL: only listen to the few most-recent logs. Audit docs are large
    // (they embed full settings snapshots) and there are many, so an unbounded
    // listener downloads hundreds of MB and starves every other query — the whole
    // dashboard then hangs forever on its loading skeletons.
    const logConstraints = [...branchLogFilter, orderBy("timestamp", "desc"), limit(6)];

    const unsubLogs = canReadLogs
      ? subscribeCollection<AuditLog>(
          COLLECTIONS.auditLogs,
          logConstraints,
          (logs) => {
            setRecentLogs(logs.slice(0, 6));
            setStats((prev) =>
              prev
                ? { ...prev, recentAuditEvents: logs.length, totalBranches: branches.length }
                : {
                    totalBranches: branches.length,
                    activeTvs: 0,
                    offlineTvs: 0,
                    totalCurrencies: currencies,
                    pendingRateApprovals: 0,
                    recentAuditEvents: logs.length,
                  },
            );
            setLoading(false);
            clearNotice();
          },
          onError,
        )
      : () => undefined;

    return () => {
      unsubCurrencies();
      unsubRates();
      unsubLogs();
    };
  }, [branches.length, clearNotice, effectiveBranchId, isBranchManager, isPlatformAdmin, onError]);

  useEffect(() => {
    if (!effectiveBranchId) return;

    const unsubRates = subscribeBranchExchangeRates(
      effectiveBranchId,
      (items) => {
        setBranchRatesCount(items.filter((r) => r.status === "published" && !r.isHidden).length);
        clearNotice();
      },
      onError,
    );
    const unsubVideos = subscribeVideos(
      effectiveBranchId,
      (items) => {
        setBranchVideosCount(items.length);
        clearNotice();
      },
      onError,
    );
    const unsubTickers = subscribeTickers(
      effectiveBranchId,
      (items) => {
        setBranchTickersCount(items.length);
        clearNotice();
      },
      onError,
    );

    return () => {
      unsubRates();
      unsubVideos();
      unsubTickers();
    };
  }, [clearNotice, effectiveBranchId, onError]);

  const quickActions = useMemo(
    () => [
      ...(isPlatformAdmin
        ? [
            {
              label: "Add Branch",
              description: "Create a new location with branding",
              href: "/dashboard/branches",
              icon: Building2,
              accent: "violet" as const,
            },
          ]
        : []),
      {
        label: "Import Excel Rates",
        description: "Upload CURRENCY | WE BUY | WE SELL template",
        href: "/dashboard/exchange-rates",
        icon: FileSpreadsheet,
        accent: "emerald" as const,
      },
      {
        label: "Update Rates",
        description: "Edit buy/sell rates manually",
        href: "/dashboard/exchange-rates",
        icon: TrendingUp,
        accent: "emerald" as const,
      },
      ...(isBranchManager && scopedBranch?.code
        ? [
            {
              label: "View Display",
              description: "Open your branch signage in a new tab",
              href: getDisplayUrl(scopedBranch.code),
              icon: Monitor,
              accent: "sky" as const,
            },
          ]
        : isBranchManager
          ? [
              {
                label: "View Display",
                description: "Open your branch signage in a new tab",
                href: "/display",
                icon: Monitor,
                accent: "sky" as const,
              },
            ]
          : [
              {
                label: "Open Display",
                description: "Launch browser signage for a branch",
                href: "/display",
                icon: Monitor,
                accent: "sky" as const,
              },
            ]),
    ],
    [isBranchManager, isPlatformAdmin, scopedBranch],
  );

  if (loading && !stats) {
    return (
      <>
        <DashboardHeader title="Overview" description="Set up branches, import rates, and open your TV display." accent="violet" />
        <PageLoader />
      </>
    );
  }

  return (
    <>
      <DashboardHeader
        title="Overview"
        description="Your simple control panel — set up branches, import rates, add videos, and open your TV display."
        accent="violet"
      />
      <PageShell accent="violet">
        <FirestoreSetupNotice message={notice} />
        {profile ? (
          <RoleFeatureBoard role={profile.role} branchName={scopedBranch?.name} />
        ) : null}
        <div className="grid grid-cols-2 gap-4 sm:gap-5 md:grid-cols-3 xl:grid-cols-5">
          {isPlatformAdmin ? (
            <StatCard title="Branches" value={stats?.totalBranches ?? 0} loading={loading} accent="violet" icon={Building2} />
          ) : (
            <StatCard
              title="Your Branch"
              value={scopedBranch?.name ?? "—"}
              hint={scopedBranch?.code}
              loading={loading}
              accent="violet"
              icon={Building2}
            />
          )}
          <StatCard
            title={isPlatformAdmin ? "Active Branches" : "Published Rates"}
            value={isPlatformAdmin ? (stats?.totalBranches ?? 0) : branchRatesCount}
            hint={isPlatformAdmin ? "Locations" : "On display"}
            loading={loading}
            accent="emerald"
            icon={Monitor}
          />
          <StatCard title="Currencies" value={stats?.totalCurrencies ?? 0} loading={loading} accent="sky" icon={Coins} />
          <StatCard title="Pending Rates" value={stats?.pendingRateApprovals ?? 0} loading={loading} accent="default" icon={TrendingUp} />
          <StatCard title="Activity" value={stats?.recentAuditEvents ?? 0} hint="Recent events" loading={loading} accent="default" icon={Activity} />
        </div>

        <GettingStartedChecklist
          branchCode={scopedBranch?.code}
          branchName={scopedBranch?.name}
          hasBranch={branches.length > 0 && Boolean(effectiveBranchId)}
          hasRates={Boolean(effectiveBranchId) && branchRatesCount > 0}
          hasVideos={Boolean(effectiveBranchId) && branchVideosCount > 0}
          hasMessages={Boolean(effectiveBranchId) && branchTickersCount > 0}
        />

        {canReviewApprovals && pendingApprovals.length > 0 ? (
          <ContentPanel
            title="Pending your approval"
            description={`${pendingApprovals.length} rate change${pendingApprovals.length === 1 ? "" : "s"} from branch users`}
          >
            <div className="space-y-2">
              {pendingApprovals.slice(0, 5).map((approval) => (
                <div
                  key={approval.id}
                  className="flex flex-col gap-3 rounded-xl border border-border/50 bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium">
                      {approval.currencyCode} — {approval.branchName ?? approval.branchId}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Buy {approval.previousBuyRate} → {approval.proposedBuyRate} · Sell{" "}
                      {approval.previousSellRate} → {approval.proposedSellRate}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Requested by {approval.requestedByName}
                    </p>
                  </div>
                  {canApproveRates ? (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="rounded-lg"
                      onClick={() =>
                        void approvePendingRate(approval, {
                          userId: user!.uid,
                          userName: profile!.displayName || profile!.email,
                        })
                          .then(() => toast.success(`${approval.currencyCode} approved`))
                          .catch((e) =>
                            toast.error(e instanceof Error ? e.message : "Approval failed"),
                          )
                      }
                    >
                      <Check className="mr-1 h-3.5 w-3.5" />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-lg"
                      onClick={() =>
                        void rejectPendingRate(approval, {
                          userId: user!.uid,
                          userName: profile!.displayName || profile!.email,
                        })
                          .then(() => toast.success(`${approval.currencyCode} rejected`))
                          .catch((e) =>
                            toast.error(e instanceof Error ? e.message : "Reject failed"),
                          )
                      }
                    >
                      <X className="mr-1 h-3.5 w-3.5" />
                      Reject
                    </Button>
                  </div>
                  ) : (
                    <span className="shrink-0 rounded-lg bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                      Awaiting branch manager
                    </span>
                  )}
                </div>
              ))}
              {pendingApprovals.length > 5 ? (
                <Link href="/dashboard/exchange-rates" className="inline-block text-sm text-primary underline-offset-4 hover:underline">
                  View all {pendingApprovals.length} pending on Exchange Rates
                </Link>
              ) : null}
            </div>
          </ContentPanel>
        ) : null}

        {isBranchManager && scopedBranch?.code ? (
          <DisplayUrlCard branchCode={scopedBranch.code} branchName={scopedBranch.name} />
        ) : null}

        <ContentPanel title="Quick Actions" description="Jump to common tasks">
          <QuickActions actions={quickActions} />
        </ContentPanel>

        <div className="grid gap-5 xl:grid-cols-2">
          <ContentPanel
            title="Recent Activity"
            description={isPlatformAdmin ? "Latest audit events across the platform" : "Latest activity in your branch"}
          >
            {recentLogs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
            ) : (
              <div className="space-y-3">
                {recentLogs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-start justify-between gap-3 rounded-xl border border-border/30 bg-muted/20 p-3.5"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium capitalize">{log.action.replaceAll("_", " ")}</p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {log.userName} · {log.entityType}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {safeFormatDistanceToNow(log.timestamp, { addSuffix: true })}
                    </span>
                  </div>
                ))}
                <Link href="/dashboard/audit-logs" className="inline-block text-sm text-primary underline-offset-4 hover:underline">
                  View all activity
                </Link>
              </div>
            )}
          </ContentPanel>

          <ContentPanel title="System Status" description="Real-time sync engine">
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-xl border border-border/30 p-4">
                <div>
                  <p className="text-sm font-medium">Live Data Sync</p>
                  <p className="text-xs text-muted-foreground">Rates, messages, and branch settings</p>
                </div>
                <StatusBadge status="live" variant="success" />
              </div>
              <div className="flex items-center justify-between rounded-xl border border-border/30 p-4">
                <div>
                  <p className="text-sm font-medium">Display Sync</p>
                  <p className="text-xs text-muted-foreground">Sub-second updates to open display pages</p>
                </div>
                <StatusBadge status="active" variant="success" />
              </div>
              <div className="flex items-center justify-between rounded-xl border border-border/30 p-4">
                <div>
                  <p className="text-sm font-medium">Offline Cache</p>
                  <p className="text-xs text-muted-foreground">Display continues with cached video when offline</p>
                </div>
                <StatusBadge status="enabled" variant="info" />
              </div>
            </div>
          </ContentPanel>
        </div>
      </PageShell>
    </>
  );
}
