"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ContentPanel } from "@/components/shared/page-elements";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setThemeConfig, subscribeThemeConfig } from "@/lib/services/theme-service";

/** Built-in defaults from globals.css — shown in the pickers when no override. */
const DEFAULTS = {
  dashboardPrimary: "#0066B3",
  dashboardAccent: "#00A3E0",
  dashboardGold: "#C9A227",
} as const;

const FIELDS: Array<{ key: keyof typeof DEFAULTS; label: string; hint: string }> = [
  { key: "dashboardPrimary", label: "Main colour", hint: "Buttons, links, active menu" },
  { key: "dashboardAccent", label: "Accent colour", hint: "Highlights and details" },
  { key: "dashboardGold", label: "Gold colour", hint: "Icons and warm accents" },
];

/**
 * ADMIN panel: recolour the WHOLE dashboard for every user (org-wide), with a
 * Reset that returns to the built-in Unimoni colours. Stored in app_config/theme;
 * the OrgThemeProvider applies it live on every signed-in dashboard.
 */
export function OrgThemePanel({ actor }: { actor: { userId: string; userName: string } }) {
  const [colors, setColors] = useState<Record<keyof typeof DEFAULTS, string | null>>({
    dashboardPrimary: null,
    dashboardAccent: null,
    dashboardGold: null,
  });
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    return subscribeThemeConfig((config) => {
      setColors({
        dashboardPrimary: config?.dashboardPrimary ?? null,
        dashboardAccent: config?.dashboardAccent ?? null,
        dashboardGold: config?.dashboardGold ?? null,
      });
      setLoaded(true);
    });
  }, []);

  async function save(next: typeof colors) {
    setSaving(true);
    try {
      await setThemeConfig(next, actor);
      toast.success("Dashboard colours updated for everyone");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the theme");
    } finally {
      setSaving(false);
    }
  }

  const hasOverride = Object.values(colors).some(Boolean);

  return (
    <ContentPanel
      title="Dashboard colours (all users)"
      description="Change the dashboard's colours for EVERY user who signs in. Reset returns to the standard Unimoni look."
    >
      <div className="grid gap-4 sm:grid-cols-3">
        {FIELDS.map(({ key, label, hint }) => (
          <div key={key} className="space-y-1.5">
            <Label className="text-xs">{label}</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label={label}
                value={colors[key] ?? DEFAULTS[key]}
                disabled={!loaded || saving}
                onChange={(e) => setColors((prev) => ({ ...prev, [key]: e.target.value }))}
                className="h-10 w-12 cursor-pointer rounded-lg border border-border bg-transparent"
              />
              <Input
                value={colors[key] ?? ""}
                placeholder={`Default ${DEFAULTS[key]}`}
                disabled={!loaded || saving}
                onChange={(e) =>
                  setColors((prev) => ({ ...prev, [key]: e.target.value.trim() ? e.target.value : null }))
                }
                className="flex-1 rounded-lg font-mono text-sm"
              />
            </div>
            <p className="text-[11px] text-muted-foreground">{hint}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button className="rounded-xl" disabled={!loaded || saving} onClick={() => void save(colors)}>
          {saving ? "Saving…" : "Save dashboard colours"}
        </Button>
        {hasOverride ? (
          <Button
            variant="outline"
            className="rounded-xl"
            disabled={saving}
            onClick={() => {
              const cleared = { dashboardPrimary: null, dashboardAccent: null, dashboardGold: null };
              setColors(cleared);
              void save(cleared);
            }}
          >
            Reset to default
          </Button>
        ) : null}
      </div>
    </ContentPanel>
  );
}
