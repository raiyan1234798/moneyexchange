"use client";

import { useEffect, useState } from "react";
import { Copy, Monitor, Plus, QrCode, Tv } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { DashboardHeader } from "@/components/layout/dashboard-sidebar";
import { BranchSelector } from "@/components/shared/branch-selector";
import {
  ContentPanel,
  DataTable,
  EmptyState,
  PageActions,
  PageShell,
  StatusBadge,
} from "@/components/shared/page-elements";
import { useAuth } from "@/contexts/auth-context";
import { useBranchScope, useContentPermissions } from "@/lib/hooks/use-branch-scope";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createTvDevice, getTvPlayerUrl, subscribeTvDevices } from "@/lib/services/tv-service";
import type { TvDevice } from "@/lib/types";

function QrImage({ url }: { url: string }) {
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}&bgcolor=ffffff&color=000000&margin=8`;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={qrUrl} alt="QR code to connect TV" className="rounded-xl border border-border/30 bg-white p-2 shadow-sm" width={200} height={200} />
  );
}

function PairingCodeDisplay({ device, setupUrl }: { device: TvDevice; setupUrl: string }) {
  function copy(text: string, label: string) {
    void navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  }

  return (
    <div className="mt-4 rounded-2xl border border-border/40 bg-muted/20 p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pairing Code</p>
      <p className="mt-1 font-mono text-4xl font-bold tracking-[0.3em]">{device.pairingCode}</p>
      <div className="mt-5 flex flex-col items-center gap-5 sm:flex-row sm:items-start">
        <QrImage url={`${setupUrl}?code=${device.pairingCode}`} />
        <div className="flex w-full flex-col gap-2 sm:w-auto">
          <Button variant="outline" className="rounded-xl" onClick={() => copy(device.pairingCode, "Pairing code")}>
            <Copy className="mr-2 h-4 w-4" />
            Copy Code
          </Button>
          <Button variant="outline" className="rounded-xl" onClick={() => copy(`${setupUrl}?code=${device.pairingCode}`, "Setup URL")}>
            <QrCode className="mr-2 h-4 w-4" />
            Copy Setup URL
          </Button>
          <Button variant="outline" className="rounded-xl" onClick={() => copy(getTvPlayerUrl(device.branchId), "Player URL")}>
            <Monitor className="mr-2 h-4 w-4" />
            Copy Player URL
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function TvDevicesPage() {
  const { user, profile } = useAuth();
  const { branches, effectiveBranchId, setSelectedBranchId, isSuperAdmin } = useBranchScope();
  const { canManageTvs } = useContentPermissions();
  const [devices, setDevices] = useState<TvDevice[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [newDevice, setNewDevice] = useState<TvDevice | null>(null);

  useEffect(() => {
    if (!effectiveBranchId && !isSuperAdmin) return;
    return subscribeTvDevices(setDevices, isSuperAdmin ? undefined : effectiveBranchId);
  }, [effectiveBranchId, isSuperAdmin]);

  async function handleCreate() {
    if (!user || !profile || !effectiveBranchId || !name) return;
    const device = await createTvDevice(
      { name, branchId: effectiveBranchId },
      { userId: user.uid, userName: profile.displayName || profile.email },
    );
    setNewDevice(device);
    toast.success("TV registered — share the pairing code with your display");
    setName("");
  }

  function copy(text: string) {
    void navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  }

  const setupUrl = typeof window !== "undefined" ? `${window.location.origin}/tv/setup` : "/tv/setup";

  return (
    <>
      <DashboardHeader
        title="TV Devices"
        description="Register Android TVs and connect them with a pairing code or QR scan."
        accent="sky"
      />
      <PageShell accent="sky">
        {isSuperAdmin ? (
          <BranchSelector branches={branches} value={effectiveBranchId} onChange={setSelectedBranchId} />
        ) : null}

        <ContentPanel title="Connection Guide" description="Four steps to get signage running">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { step: "1", text: "Register a TV below for this branch" },
              { step: "2", text: `Open ${setupUrl} on the Android TV browser` },
              { step: "3", text: "Enter the 6-character pairing code or scan QR" },
              { step: "4", text: "Video, rates, and slogans appear automatically" },
            ].map((item) => (
              <div key={item.step} className="rounded-xl border border-border/30 bg-muted/20 p-4">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-foreground text-xs font-bold text-background">{item.step}</span>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.text}</p>
              </div>
            ))}
          </div>
        </ContentPanel>

        {canManageTvs && effectiveBranchId ? (
          <PageActions>
            <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setNewDevice(null); }}>
              <DialogTrigger render={<Button className="rounded-xl"><Plus className="mr-2 h-4 w-4" />Register TV</Button>} />
              <DialogContent className="rounded-2xl sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Register Android TV</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <Label>TV Name</Label>
                    <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Main Display TV" className="rounded-xl" />
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={() => void handleCreate()} disabled={!name} className="rounded-xl">
                    Create & Get Pairing Code
                  </Button>
                </DialogFooter>
                {newDevice ? <PairingCodeDisplay device={newDevice} setupUrl={setupUrl} /> : null}
              </DialogContent>
            </Dialog>
          </PageActions>
        ) : null}

        {devices.length === 0 ? (
          <EmptyState
            title="No TV devices registered"
            description="Register a TV to get a pairing code for Android TV signage."
            icon={Tv}
            actionLabel={canManageTvs ? "Register TV" : undefined}
            onAction={canManageTvs ? () => setOpen(true) : undefined}
          />
        ) : (
          <ContentPanel title="Registered TVs" description={`${devices.length} device${devices.length === 1 ? "" : "s"}`}>
            <DataTable
              data={devices}
              keyExtractor={(d) => d.id}
              mobileTitle={(d) => d.name}
              columns={[
                { key: "name", header: "Name", cell: (d) => <span className="font-medium">{d.name}</span> },
                {
                  key: "branch",
                  header: "Branch",
                  cell: (d) => branches.find((b) => b.id === d.branchId)?.name ?? d.branchId,
                  hideOnMobile: true,
                },
                {
                  key: "code",
                  header: "Pairing Code",
                  cell: (d) => (
                    <button type="button" className="font-mono text-sm font-bold tracking-widest hover:underline" onClick={() => copy(d.pairingCode)}>
                      {d.pairingCode}
                    </button>
                  ),
                },
                {
                  key: "status",
                  header: "Status",
                  cell: (d) => <StatusBadge status={d.status} />,
                },
                {
                  key: "actions",
                  header: "Connect",
                  className: "text-right",
                  cell: (d) => (
                    <div className="flex justify-end gap-1.5">
                      <Button variant="outline" size="sm" className="rounded-lg" onClick={() => copy(d.pairingCode)}>
                        <Copy className="mr-1 h-3 w-3" />
                        Code
                      </Button>
                      <Link href={getTvPlayerUrl(d.branchId)}>
                        <Button size="sm" variant="outline" className="rounded-lg">
                          <Monitor className="mr-1 h-3 w-3" />
                          Preview
                        </Button>
                      </Link>
                    </div>
                  ),
                },
              ]}
            />
          </ContentPanel>
        )}
      </PageShell>
    </>
  );
}
