"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { toast } from "sonner";
import { DashboardHeader } from "@/components/layout/dashboard-sidebar";
import { BranchSelector } from "@/components/shared/branch-selector";
import { ContentPanel, FormSection, PageShell, PageLoader } from "@/components/shared/page-elements";
import { useAuth } from "@/contexts/auth-context";
import { useBranchScope } from "@/lib/hooks/use-branch-scope";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { db } from "@/lib/firebase/client";
import { createDocument } from "@/lib/firebase/firestore";
import { COLLECTIONS, DEFAULT_SYSTEM_SETTINGS } from "@/lib/constants";
import { updateBranch } from "@/lib/services/branch-service";
import type { BranchSettings, SystemSettings } from "@/lib/types";

const SETTINGS_ID = "global";

function BranchSettingsForm({
  branchName,
  initialLogoUrl,
  initialColor,
  initialSettings,
  saving,
  onSave,
}: {
  branchName: string;
  initialLogoUrl: string;
  initialColor: string;
  initialSettings: BranchSettings;
  saving: boolean;
  onSave: (data: { logoUrl: string; brandingColor: string; settings: BranchSettings }) => Promise<void>;
}) {
  const [logoUrl, setLogoUrl] = useState(initialLogoUrl);
  const [color, setColor] = useState(initialColor);
  const [settings, setSettings] = useState(initialSettings);

  return (
    <FormSection title={`${branchName} Branding`}>
      <div className="space-y-2">
        <Label>Logo URL</Label>
        <Input
          value={logoUrl}
          onChange={(event) => setLogoUrl(event.target.value)}
          placeholder="https://example.com/logo.png"
          className="rounded-xl"
        />
      </div>
      <div className="space-y-2">
        <Label>Primary Color</Label>
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={color}
            onChange={(event) => setColor(event.target.value)}
            className="h-11 w-14 cursor-pointer rounded-xl border border-border bg-transparent"
          />
          <Input
            value={color}
            onChange={(event) => setColor(event.target.value)}
            className="flex-1 rounded-xl font-mono text-sm"
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Default Ticker Speed (seconds)</Label>
        <Input
          type="number"
          value={settings.tickerSpeed}
          onChange={(event) => setSettings({ ...settings, tickerSpeed: Number(event.target.value) })}
          className="rounded-xl"
        />
      </div>
      <div className="space-y-2">
        <Label>Ticker Font Size</Label>
        <Input
          type="number"
          value={settings.tickerFontSize}
          onChange={(event) => setSettings({ ...settings, tickerFontSize: Number(event.target.value) })}
          className="rounded-xl"
        />
      </div>
      <div className="space-y-2">
        <Label>Ticker Font Color</Label>
        <Input
          value={settings.tickerFontColor}
          onChange={(event) => setSettings({ ...settings, tickerFontColor: event.target.value })}
          className="rounded-xl"
        />
      </div>
      <div className="flex items-center justify-between rounded-xl border border-border/30 p-4">
        <Label>Show Buy Rate on Display</Label>
        <Switch
          checked={settings.showBuyRate}
          onCheckedChange={(checked) => setSettings({ ...settings, showBuyRate: checked })}
        />
      </div>
      <div className="flex items-center justify-between rounded-xl border border-border/30 p-4">
        <Label>Show Sell Rate on Display</Label>
        <Switch
          checked={settings.showSellRate}
          onCheckedChange={(checked) => setSettings({ ...settings, showSellRate: checked })}
        />
      </div>
      <Button
        onClick={() => void onSave({ logoUrl, brandingColor: color, settings })}
        disabled={saving}
        className="rounded-xl"
      >
        {saving ? "Saving..." : "Save Branch Settings"}
      </Button>
    </FormSection>
  );
}

export default function SettingsPage() {
  const { user, profile, isSuperAdmin } = useAuth();
  const { branches, effectiveBranchId, setSelectedBranchId } = useBranchScope();
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [globalLoading, setGlobalLoading] = useState(isSuperAdmin);
  const [saving, setSaving] = useState(false);

  const branch = branches.find((b) => b.id === effectiveBranchId);

  useEffect(() => {
    if (!isSuperAdmin) return;
    const ref = doc(db, COLLECTIONS.settings, SETTINGS_ID);
    const unsubscribe = onSnapshot(
      ref,
      (snapshot) => {
        if (snapshot.exists()) {
          setSettings({ id: snapshot.id, ...snapshot.data() } as SystemSettings);
        } else {
          setSettings({
            id: SETTINGS_ID,
            ...DEFAULT_SYSTEM_SETTINGS,
            updatedAt: new Date(),
          });
        }
        setGlobalLoading(false);
      },
      () => {
        setSettings({
          id: SETTINGS_ID,
          ...DEFAULT_SYSTEM_SETTINGS,
          updatedAt: new Date(),
        });
        setGlobalLoading(false);
      },
    );
    return unsubscribe;
  }, [isSuperAdmin]);

  async function saveGlobalSettings() {
    if (!settings || !user || !profile || !isSuperAdmin) return;
    setSaving(true);
    try {
      const payload = {
        companyName: settings.companyName,
        supportEmail: settings.supportEmail,
        defaultTimezone: settings.defaultTimezone,
        emergencyRateEnabled: settings.emergencyRateEnabled,
        offlineCacheEnabled: settings.offlineCacheEnabled,
        tvHeartbeatIntervalSeconds: settings.tvHeartbeatIntervalSeconds,
        defaultTickerSpeed: settings.defaultTickerSpeed ?? DEFAULT_SYSTEM_SETTINGS.defaultTickerSpeed,
        maintenanceMode: settings.maintenanceMode ?? false,
        auditRetentionDays: settings.auditRetentionDays ?? DEFAULT_SYSTEM_SETTINGS.auditRetentionDays,
      };
      await createDocument(COLLECTIONS.settings, payload, SETTINGS_ID);
      toast.success("System settings saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  async function saveBranchSettings(data: {
    logoUrl: string;
    brandingColor: string;
    settings: BranchSettings;
  }) {
    if (!user || !profile || !effectiveBranchId) return;
    setSaving(true);
    try {
      await updateBranch(
        effectiveBranchId,
        {
          logoUrl: data.logoUrl || null,
          brandingColor: data.brandingColor,
          settings: data.settings,
        },
        { userId: user.uid, userName: profile.displayName || profile.email },
      );
      toast.success("Branch settings saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save branch settings");
    } finally {
      setSaving(false);
    }
  }

  if (globalLoading) {
    return (
      <>
        <DashboardHeader title="Settings" description="System and branch display configuration." accent="default" />
        <PageLoader count={1} />
      </>
    );
  }

  return (
    <>
      <DashboardHeader title="Settings" description="System and branch display configuration." accent="default" />
      <PageShell>
        {isSuperAdmin && settings ? (
          <ContentPanel title="System Settings" description="Company-wide defaults for super admins">
            <FormSection title="Organization">
              <div className="space-y-2">
                <Label>Company Name</Label>
                <Input
                  value={settings.companyName}
                  onChange={(event) => setSettings({ ...settings, companyName: event.target.value })}
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label>Support Email</Label>
                <Input
                  value={settings.supportEmail}
                  onChange={(event) => setSettings({ ...settings, supportEmail: event.target.value })}
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label>Default Timezone</Label>
                <Input
                  value={settings.defaultTimezone}
                  onChange={(event) => setSettings({ ...settings, defaultTimezone: event.target.value })}
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label>Default Ticker Speed (seconds)</Label>
                <Input
                  type="number"
                  value={settings.defaultTickerSpeed ?? DEFAULT_SYSTEM_SETTINGS.defaultTickerSpeed}
                  onChange={(event) =>
                    setSettings({ ...settings, defaultTickerSpeed: Number(event.target.value) })
                  }
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label>TV Heartbeat Interval (seconds)</Label>
                <Input
                  type="number"
                  value={settings.tvHeartbeatIntervalSeconds}
                  onChange={(event) =>
                    setSettings({ ...settings, tvHeartbeatIntervalSeconds: Number(event.target.value) })
                  }
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label>Audit Log Retention (days)</Label>
                <Input
                  type="number"
                  value={settings.auditRetentionDays ?? DEFAULT_SYSTEM_SETTINGS.auditRetentionDays}
                  onChange={(event) =>
                    setSettings({ ...settings, auditRetentionDays: Number(event.target.value) })
                  }
                  className="rounded-xl"
                />
              </div>
            </FormSection>

            <div className="mt-6 space-y-3">
              <div className="flex items-center justify-between rounded-xl border border-border/30 p-4">
                <div>
                  <p className="font-medium">Emergency Rate Push</p>
                  <p className="text-sm text-muted-foreground">Allow super admins to broadcast emergency rates.</p>
                </div>
                <Switch
                  checked={settings.emergencyRateEnabled}
                  onCheckedChange={(checked) => setSettings({ ...settings, emergencyRateEnabled: checked })}
                />
              </div>
              <div className="flex items-center justify-between rounded-xl border border-border/30 p-4">
                <div>
                  <p className="font-medium">Offline Cache</p>
                  <p className="text-sm text-muted-foreground">Enable display-side caching for rates and videos.</p>
                </div>
                <Switch
                  checked={settings.offlineCacheEnabled}
                  onCheckedChange={(checked) => setSettings({ ...settings, offlineCacheEnabled: checked })}
                />
              </div>
              <div className="flex items-center justify-between rounded-xl border border-border/30 p-4">
                <div>
                  <p className="font-medium">Maintenance Mode</p>
                  <p className="text-sm text-muted-foreground">Show maintenance notice on public displays.</p>
                </div>
                <Switch
                  checked={settings.maintenanceMode ?? false}
                  onCheckedChange={(checked) => setSettings({ ...settings, maintenanceMode: checked })}
                />
              </div>
            </div>

            <Button onClick={() => void saveGlobalSettings()} disabled={saving} className="mt-6 rounded-xl">
              {saving ? "Saving..." : "Save System Settings"}
            </Button>
          </ContentPanel>
        ) : null}

        <ContentPanel title="Branch Display Settings" description="Branding and ticker defaults for branch signage">
          {isSuperAdmin ? (
            <BranchSelector branches={branches} value={effectiveBranchId} onChange={setSelectedBranchId} />
          ) : branch ? (
            <p className="mb-4 text-sm text-muted-foreground">
              Branch: <strong>{branch.name}</strong>
            </p>
          ) : null}

          {effectiveBranchId && branch ? (
            <BranchSettingsForm
              key={branch.id}
              branchName={branch.name}
              initialLogoUrl={branch.logoUrl ?? ""}
              initialColor={branch.brandingColor ?? "#6366f1"}
              initialSettings={branch.settings}
              saving={saving}
              onSave={saveBranchSettings}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Select a branch to configure display settings.</p>
          )}
        </ContentPanel>
      </PageShell>
    </>
  );
}
