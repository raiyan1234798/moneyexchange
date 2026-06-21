"use client";

import { useEffect, useState } from "react";
import { Activity, Monitor, Wifi, WifiOff } from "lucide-react";
import { DashboardHeader } from "@/components/layout/dashboard-sidebar";
import {
  ContentPanel,
  DataTable,
  EmptyState,
  PageShell,
  StatCard,
  StatusBadge,
} from "@/components/shared/page-elements";
import { subscribeTvDevices } from "@/lib/services/tv-service";
import type { TvDevice } from "@/lib/types";

export default function TvMonitoringPage() {
  const [devices, setDevices] = useState<TvDevice[]>([]);

  useEffect(() => {
    return subscribeTvDevices(setDevices);
  }, []);

  const online = devices.filter((device) => device.status === "online").length;
  const offline = devices.filter((device) => device.status !== "online").length;

  return (
    <>
      <DashboardHeader title="TV Monitoring" description="Live health, connectivity, and playback status across all displays." accent="emerald" />
      <PageShell accent="emerald">
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard title="Total TVs" value={devices.length} icon={Monitor} accent="sky" />
          <StatCard title="Online" value={online} icon={Wifi} accent="emerald" hint="Connected now" />
          <StatCard title="Offline" value={offline} icon={WifiOff} accent="amber" hint="Needs attention" />
        </div>

        {devices.length === 0 ? (
          <EmptyState title="No TVs to monitor" description="Register TV devices to see live health and connectivity status." icon={Activity} actionHref="/dashboard/tv-devices" actionLabel="Register TV" />
        ) : (
          <ContentPanel title="Device Health" description="Real-time status from TV heartbeats">
            <DataTable
              data={devices}
              keyExtractor={(d) => d.id}
              mobileTitle={(d) => d.name}
              columns={[
                { key: "device", header: "Device", cell: (d) => <span className="font-medium">{d.name}</span> },
                { key: "status", header: "Status", cell: (d) => <StatusBadge status={d.status} /> },
                {
                  key: "internet",
                  header: "Internet",
                  cell: (d) => <StatusBadge status={d.internetStatus} variant={d.internetStatus === "connected" ? "success" : "warning"} />,
                },
                {
                  key: "storage",
                  header: "Storage",
                  cell: (d) => <StatusBadge status={d.storageStatus} variant={d.storageStatus === "healthy" ? "success" : "warning"} />,
                  hideOnMobile: true,
                },
                { key: "playlist", header: "Playlist", cell: (d) => d.currentPlaylistId ?? "—", hideOnMobile: true },
                { key: "rates", header: "Rates Ver.", cell: (d) => `v${d.ratesVersion ?? 0}`, hideOnMobile: true },
              ]}
            />
          </ContentPanel>
        )}
      </PageShell>
    </>
  );
}
