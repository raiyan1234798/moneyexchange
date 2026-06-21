"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { toast } from "sonner";
import { DashboardHeader } from "@/components/layout/dashboard-sidebar";
import { ContentPanel, FormSection, PageShell, PageLoader } from "@/components/shared/page-elements";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { db } from "@/lib/firebase/client";
import { updateDocument } from "@/lib/firebase/firestore";
import { COLLECTIONS } from "@/lib/constants";
import type { SystemSettings } from "@/lib/types";

const SETTINGS_ID = "global";

export default function SettingsPage() {
  const { user, profile } = useAuth();
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const ref = doc(db, COLLECTIONS.settings, SETTINGS_ID);
    const unsubscribe = onSnapshot(
      ref,
      (snapshot) => {
        if (snapshot.exists()) {
          setSettings({ id: snapshot.id, ...snapshot.data() } as SystemSettings);
        }
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsubscribe;
  }, []);

  async function saveSettings() {
    if (!settings || !user || !profile) return;
    setSaving(true);
    try {
      await updateDocument(COLLECTIONS.settings, SETTINGS_ID, settings);
      toast.success("Settings saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  if (loading || !settings) {
    return (
      <>
        <DashboardHeader title="Settings" description="System-wide configuration and operational defaults." accent="default" />
        <PageLoader count={1} />
      </>
    );
  }

  return (
    <>
      <DashboardHeader title="Settings" description="System-wide configuration and operational defaults." accent="default" />
      <PageShell>
        <ContentPanel title="Company Profile">
          <FormSection title="Organization" description="Default company information">
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
                <p className="text-sm text-muted-foreground">Enable TV-side caching for rates, tickers, and videos.</p>
              </div>
              <Switch
                checked={settings.offlineCacheEnabled}
                onCheckedChange={(checked) => setSettings({ ...settings, offlineCacheEnabled: checked })}
              />
            </div>
          </div>
        </ContentPanel>

        <Button onClick={() => void saveSettings()} disabled={saving} className="rounded-xl">
          {saving ? "Saving..." : "Save Settings"}
        </Button>
      </PageShell>
    </>
  );
}
