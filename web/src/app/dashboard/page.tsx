"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Building2, Monitor, TrendingUp, Activity, Coins } from "lucide-react";
import { safeFormatDistanceToNow } from "@/lib/utils/date";
import { DashboardHeader } from "@/components/layout/dashboard-sidebar";
import { GettingStartedChecklist } from "@/components/shared/getting-started-checklist";
import { DisplayUrlCard } from "@/components/shared/display-url-card";
import { LoadDemoContentButton } from "@/components/shared/load-demo-content-button";
import { Button } from "@/components/ui/button";
import {
  ContentPanel,
  PageLoader,
  PageShell,
  QuickActions,
  StatCard,
} from "@/components/shared/page-elements";
import { useAuth } from "@/contexts/auth-context";
import { useBranchScope } from "@/lib/hooks/use-branch-scope";
import { subscribeBranches } from "@/lib/services/branch-service";
import { subscribeCurrencies } from "@/lib/services/currency-service";
import { subscribeBranchExchangeRates } from "@/lib/services/exchange-rate-service";
import { subscribeTickers } from "@/lib/services/ticker-service";
import { subscribeVideos } from "@/lib/services/video-service";
import { subscribeCollection, orderBy, where } from "@/lib/firebase/firestore";
import { COLLECTIONS } from "@/lib/constants";
import { DEMO_DISPLAY_PATH, getDisplayUrl } from "@/lib/display-url";
import type { AuditLog, DashboardStats } from "@/lib/types";
import { StatusBadge } from "@/components/shared/page-elements";

export default function DashboardOverviewPage() {
  const { user, profile, isBranchManager, isSuperAdmin } = useAuth();
  const { branches, effectiveBranchId } = useBranchScope();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentLogs, setRecentLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [branchRatesCount, setBranchRatesCount] = useState(0);
  const [branchVideosCount, setBranchVideosCount] = useState(0);
  const [branchTickersCount, setBranchTickersCount] = useState(0);

  const scopedBranch = branches.find((b) => b.id === effectiveBranchId);

  useEffect(() => {
    let branches = 0;
    let currencies = 0;
    let pendingRates = 0;

    const unsubBranches = subscribeBranches(
      (items) => {
        branches = items.length;
        setStats((prev) =>
          prev
            ? { ...prev, totalBranches: branches, activeTvs: branches, offlineTvs: 0 }
            : {
                totalBranches: branches,
                activeTvs: branches,
                offlineTvs: 0,
                totalCurrencies: currencies,
                pendingRateApprovals: pendingRates,
                recentAuditEvents: 0,
              },
        );
        setLoading(false);
      },
      (error) => toast.error(error.message || "Failed to load branches"),
    );

    const unsubCurrencies = subscribeCurrencies(
      (items) => {
        currencies = items.length;
        setStats((prev) => (prev ? { ...prev, totalCurrencies: currencies } : prev));
      },
      (error) => toast.error(error.message || "Failed to load currencies"),
    );

    const unsubRates = subscribeCollection<{ id: string }>(
      COLLECTIONS.exchangeRates,
      [where("status", "==", "pending")],
      (items) => {
        pendingRates = items.length;
        setStats((prev) => (prev ? { ...prev, pendingRateApprovals: pendingRates } : prev));
      },
      (error) => toast.error(error.message || "Failed to load pending rates"),
    );

    const unsubLogs = subscribeCollection<AuditLog>(
      COLLECTIONS.auditLogs,
      [orderBy("timestamp", "desc")],
      (logs) => {
        setRecentLogs(logs.slice(0, 6));
        setStats((prev) => (prev ? { ...prev, recentAuditEvents: logs.length } : prev));
      },
      (error) => toast.error(error.message || "Failed to load activity"),
    );

    return () => {
      unsubBranches();
      unsubCurrencies();
      unsubRates();
      unsubLogs();
    };
  }, []);

  useEffect(() => {
    if (!effectiveBranchId) return;

    const unsubRates = subscribeBranchExchangeRates(
      effectiveBranchId,
      (items) => setBranchRatesCount(items.filter((r) => r.status === "published" && !r.isHidden).length),
      (error) => toast.error(error.message || "Failed to load branch rates"),
    );
    const unsubVideos = subscribeVideos(
      effectiveBranchId,
      (items) => setBranchVideosCount(items.length),
      (error) => toast.error(error.message || "Failed to load branch videos"),
    );
    const unsubTickers = subscribeTickers(
      effectiveBranchId,
      (items) => setBranchTickersCount(items.length),
      (error) => toast.error(error.message || "Failed to load display messages"),
    );

    return () => {
      unsubRates();
      unsubVideos();
      unsubTickers();
    };
  }, [effectiveBranchId]);

  const quickActions = useMemo(
    () => [
      {
        label: "Add Branch",
        description: "Create a new location with branding",
        href: "/dashboard/branches",
        icon: Building2,
        accent: "violet" as const,
      },
      {
        label: "Update Rates",
        description: "Publish buy/sell rates to displays",
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
    [isBranchManager, scopedBranch],
  );

  if (loading && !stats) {
    return (
      <>
        <DashboardHeader title="Overview" description="Live network status across branches and displays." accent="violet" />
        <PageLoader />
      </>
    );
  }

  return (
    <>
      <DashboardHeader
        title="Overview"
        description="Real-time command center for branches, displays, and exchange rates."
        accent="violet"
      />
      <PageShell accent="violet">
        {isSuperAdmin && user && profile ? (
          <ContentPanel
            title="Client Demo"
            description="One-click sample branch with rates, video, and scrolling messages for client previews"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                Creates branch <strong className="font-mono text-foreground">DEMO</strong> with sample exchange rates,
                your demo video (<code className="text-xs">/demo-video.mp4</code>), and ticker text. Share{" "}
                <Link href={DEMO_DISPLAY_PATH} target="_blank" className="font-mono text-primary underline-offset-4 hover:underline">
                  /display/demo
                </Link>{" "}
                for an instant client preview — no Firestore setup required.
              </p>
              <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                <Button
                  variant="outline"
                  className="rounded-xl"
                  render={
                    <Link href={DEMO_DISPLAY_PATH} target="_blank" rel="noreferrer">
                      <Monitor className="mr-2 h-4 w-4" />
                      Open Demo Display
                    </Link>
                  }
                />
                <LoadDemoContentButton
                  userId={user.uid}
                  userName={profile.displayName || profile.email}
                />
              </div>
            </div>
          </ContentPanel>
        ) : null}

        <div className="grid grid-cols-2 gap-4 sm:gap-5 md:grid-cols-3 xl:grid-cols-5">
          <StatCard title="Branches" value={stats?.totalBranches ?? 0} loading={loading} accent="violet" icon={Building2} />
          <StatCard title="Active Branches" value={stats?.totalBranches ?? 0} hint="Locations" loading={loading} accent="emerald" icon={Monitor} />
          <StatCard title="Currencies" value={stats?.totalCurrencies ?? 0} loading={loading} accent="sky" icon={Coins} />
          <StatCard title="Pending Rates" value={stats?.pendingRateApprovals ?? 0} loading={loading} accent="default" icon={TrendingUp} />
          <StatCard title="Audit Events" value={stats?.recentAuditEvents ?? 0} hint="Total logged" loading={loading} accent="default" icon={Activity} />
        </div>

        <GettingStartedChecklist
          branchCode={scopedBranch?.code}
          branchName={scopedBranch?.name}
          hasBranch={branches.length > 0 && Boolean(effectiveBranchId)}
          hasRates={Boolean(effectiveBranchId) && branchRatesCount > 0}
          hasVideos={Boolean(effectiveBranchId) && branchVideosCount > 0}
          hasMessages={Boolean(effectiveBranchId) && branchTickersCount > 0}
        />

        {isBranchManager && scopedBranch?.code ? (
          <DisplayUrlCard branchCode={scopedBranch.code} branchName={scopedBranch.name} />
        ) : null}

        <ContentPanel title="Quick Actions" description="Jump to common tasks">
          <QuickActions actions={quickActions} />
        </ContentPanel>

        <div className="grid gap-5 xl:grid-cols-2">
          <ContentPanel title="Recent Activity" description="Latest audit events across the platform">
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
                  View all audit logs
                </Link>
              </div>
            )}
          </ContentPanel>

          <ContentPanel title="System Status" description="Real-time sync engine">
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-xl border border-border/30 p-4">
                <div>
                  <p className="text-sm font-medium">Firestore Sync</p>
                  <p className="text-xs text-muted-foreground">Rates, tickers, playlists, branch settings</p>
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
