"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Building2, Monitor, TrendingUp, Activity, Coins } from "lucide-react";
import { safeFormatDistanceToNow } from "@/lib/utils/date";
import { DashboardHeader } from "@/components/layout/dashboard-sidebar";
import {
  ContentPanel,
  PageLoader,
  PageShell,
  QuickActions,
  StatCard,
} from "@/components/shared/page-elements";
import { useAuth } from "@/contexts/auth-context";
import { subscribeBranches } from "@/lib/services/branch-service";
import { subscribeCurrencies } from "@/lib/services/currency-service";
import { subscribeCollection, orderBy, where } from "@/lib/firebase/firestore";
import { COLLECTIONS } from "@/lib/constants";
import type { AuditLog, DashboardStats } from "@/lib/types";
import { StatusBadge } from "@/components/shared/page-elements";

export default function DashboardOverviewPage() {
  const { isBranchManager } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentLogs, setRecentLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let branches = 0;
    let currencies = 0;
    let pendingRates = 0;

    const unsubBranches = subscribeBranches((items) => {
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
    });

    const unsubCurrencies = subscribeCurrencies((items) => {
      currencies = items.length;
      setStats((prev) => (prev ? { ...prev, totalCurrencies: currencies } : prev));
    });

    const unsubRates = subscribeCollection<{ id: string }>(
      COLLECTIONS.exchangeRates,
      [where("status", "==", "pending")],
      (items) => {
        pendingRates = items.length;
        setStats((prev) => (prev ? { ...prev, pendingRateApprovals: pendingRates } : prev));
      },
    );

    const unsubLogs = subscribeCollection<AuditLog>(
      COLLECTIONS.auditLogs,
      [orderBy("timestamp", "desc")],
      (logs) => {
        setRecentLogs(logs.slice(0, 6));
        setStats((prev) => (prev ? { ...prev, recentAuditEvents: logs.length } : prev));
      },
    );

    return () => {
      unsubBranches();
      unsubCurrencies();
      unsubRates();
      unsubLogs();
    };
  }, []);

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
      ...(isBranchManager
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
    [isBranchManager],
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
        <div className="grid grid-cols-2 gap-4 sm:gap-5 md:grid-cols-3 xl:grid-cols-5">
          <StatCard title="Branches" value={stats?.totalBranches ?? 0} loading={loading} accent="violet" icon={Building2} />
          <StatCard title="Active Branches" value={stats?.totalBranches ?? 0} hint="Locations" loading={loading} accent="emerald" icon={Monitor} />
          <StatCard title="Currencies" value={stats?.totalCurrencies ?? 0} loading={loading} accent="sky" icon={Coins} />
          <StatCard title="Pending Rates" value={stats?.pendingRateApprovals ?? 0} loading={loading} accent="default" icon={TrendingUp} />
          <StatCard title="Audit Events" value={stats?.recentAuditEvents ?? 0} hint="Total logged" loading={loading} accent="default" icon={Activity} />
        </div>

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
