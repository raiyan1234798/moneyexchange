"use client";

import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { safeFormatDistanceToNow } from "@/lib/utils/date";
import { DashboardHeader } from "@/components/layout/dashboard-sidebar";
import { ContentPanel, PageShell } from "@/components/shared/page-elements";
import { subscribeBranches, getDashboardStats } from "@/lib/services/branch-service";
import { subscribeTvDevices } from "@/lib/services/tv-service";
import { subscribeCurrencies } from "@/lib/services/currency-service";
import { subscribeCollection, orderBy } from "@/lib/firebase/firestore";
import { COLLECTIONS } from "@/lib/constants";
import type { AuditLog } from "@/lib/types";

export default function AnalyticsPage() {
  const [chartData, setChartData] = useState<Array<{ name: string; value: number }>>([]);
  const [recentActions, setRecentActions] = useState<AuditLog[]>([]);

  useEffect(() => {
    let stats = { totalBranches: 0, activeTvs: 0, offlineTvs: 0, totalCurrencies: 0 };

    function refreshChart() {
      setChartData([
        { name: "Branches", value: stats.totalBranches },
        { name: "Active TVs", value: stats.activeTvs },
        { name: "Offline TVs", value: stats.offlineTvs },
        { name: "Currencies", value: stats.totalCurrencies },
      ]);
    }

    const unsubBranches = subscribeBranches((items) => {
      stats.totalBranches = items.length;
      refreshChart();
    });
    const unsubTvs = subscribeTvDevices((devices) => {
      stats.activeTvs = devices.filter((d) => d.status === "online").length;
      stats.offlineTvs = devices.filter((d) => d.status !== "online").length;
      refreshChart();
    });
    const unsubCurrencies = subscribeCurrencies((items) => {
      stats.totalCurrencies = items.length;
      refreshChart();
    });
    const unsubLogs = subscribeCollection<AuditLog>(
      COLLECTIONS.auditLogs,
      [orderBy("timestamp", "desc")],
      (logs) => setRecentActions(logs.slice(0, 10)),
    );

    void getDashboardStats().then((s) => {
      stats = { ...stats, ...s };
      refreshChart();
    });

    return () => {
      unsubBranches();
      unsubTvs();
      unsubCurrencies();
      unsubLogs();
    };
  }, []);

  return (
    <>
      <DashboardHeader title="Analytics" description="Branch, TV, and activity reporting with live data." accent="violet" />
      <PageShell accent="violet">
        <div className="grid gap-5 xl:grid-cols-2">
          <ContentPanel title="Network Overview" description="Live counts across the platform">
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.5 0.02 265 / 0.15)" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: "0.75rem",
                      border: "1px solid oklch(0.9 0.012 265 / 0.6)",
                      background: "oklch(1 0.002 265 / 0.95)",
                    }}
                  />
                  <Bar dataKey="value" fill="oklch(0.28 0.06 265)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ContentPanel>

          <ContentPanel title="Recent Activity" description="Latest manager and system actions">
            {recentActions.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No activity recorded yet.</p>
            ) : (
              <div className="max-h-80 space-y-2 overflow-y-auto">
                {recentActions.map((log) => (
                  <div key={log.id} className="flex items-start justify-between gap-3 rounded-xl border border-border/30 p-3.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium capitalize">{log.action.replaceAll("_", " ")}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {log.userName} · {log.entityType}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {safeFormatDistanceToNow(log.timestamp, { addSuffix: true })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </ContentPanel>
        </div>
      </PageShell>
    </>
  );
}
