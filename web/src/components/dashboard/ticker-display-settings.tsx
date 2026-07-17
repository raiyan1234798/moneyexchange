"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ContentPanel } from "@/components/shared/page-elements";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DEFAULT_BRANCH_SETTINGS } from "@/lib/constants";
import { LOGO_IMAGE_OPTIONS, compressLogoTransparent, compressImageToDataUrl } from "@/lib/image-utils";
import { updateBranch } from "@/lib/services/branch-service";
import type { Branch, BranchSettings } from "@/lib/types";

/**
 * ALL ticker (bottom bar) display settings in ONE place, right where the
 * scrolling messages are edited — corner logo (text/image/animation/size),
 * scrolling logos, the yellow headline box (text + animation), and the bar
 * itself (speed, text size/colour, height). Per the client: no hunting
 * through the Settings page for ticker things.
 */
export function TickerDisplaySettings({
  branch,
  actor,
}: {
  branch: Branch;
  actor: { userId: string; userName: string };
}) {
  const seed = (): BranchSettings => ({ ...DEFAULT_BRANCH_SETTINGS, ...(branch.settings ?? {}) });
  const [settings, setSettings] = useState<BranchSettings>(seed);
  const [saving, setSaving] = useState(false);

  // Reseed when the selected branch changes (render-time adjust, no effect).
  const [loadedBranch, setLoadedBranch] = useState(branch.id);
  if (loadedBranch !== branch.id) {
    setLoadedBranch(branch.id);
    setSettings(seed());
  }

  const s = settings;
  const set = (patch: Partial<BranchSettings>) => setSettings((prev) => ({ ...prev, ...patch }));

  async function save() {
    setSaving(true);
    try {
      await updateBranch(
        branch.id,
        { logoUrl: branch.logoUrl ?? "", brandingColor: branch.brandingColor ?? "#0D2680", settings },
        actor,
      );
      toast.success("Ticker settings saved — live on the branch TV");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save ticker settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ContentPanel
      title="Ticker display settings"
      description="Everything about the bottom bar in one place — corner logo, scrolling logos, the yellow headline box, and the bar itself. Changes apply after Save."
    >
      <div className="space-y-4">
        {/* ---- Corner logo (bottom-left badge) ---- */}
        <div className="space-y-3 rounded-xl border border-border/40 bg-muted/20 p-4">
          <div>
            <Label className="text-sm">Corner logo — the badge at the bottom-left of the TV</Label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Shows the <strong>unimoni logo</strong> by default. Type text to show text instead,
              or upload an image (white/solid backgrounds are removed automatically). Text wins
              over the image; clear both to get the unimoni logo back.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Badge text
              </Label>
              <Input
                value={s.tickerLogoText ?? ""}
                onChange={(e) => set({ tickerLogoText: e.target.value || null })}
                placeholder="e.g. UNIMONI"
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Badge image (used when no text is set)
              </Label>
              <div className="flex items-center gap-3">
                <Input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml,.png,.jpg,.jpeg,.webp,.svg"
                  aria-label="Upload ticker corner logo image"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      const { dataUrl } = await compressLogoTransparent(file, LOGO_IMAGE_OPTIONS);
                      set({ tickerLogoUrl: dataUrl });
                      toast.success("Corner logo ready (background removed) — Save to apply");
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : "Could not read image");
                    }
                  }}
                  className="rounded-xl"
                />
                {s.tickerLogoUrl ? (
                  <div className="flex shrink-0 items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={s.tickerLogoUrl}
                      alt="Corner logo preview"
                      className="h-9 w-14 shrink-0 rounded-md bg-slate-800 object-contain p-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-lg"
                      onClick={() => set({ tickerLogoUrl: null })}
                    >
                      Clear
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Logo movement
              </Label>
              <Select
                value={s.tickerLogoAnimation ?? "spin"}
                onValueChange={(value) =>
                  set({
                    tickerLogoAnimation:
                      (value as "spin" | "pulse" | "none" | "flip" | "bounce" | "float" | "swing") ??
                      "spin",
                  })
                }
              >
                <SelectTrigger className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="spin">Rotating flip (Y)</SelectItem>
                  <SelectItem value="flip">Flip (X)</SelectItem>
                  <SelectItem value="bounce">Bounce</SelectItem>
                  <SelectItem value="float">Float</SelectItem>
                  <SelectItem value="swing">Swing</SelectItem>
                  <SelectItem value="pulse">Gentle pulse</SelectItem>
                  <SelectItem value="none">No animation</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Badge size (%)
              </Label>
              <Input
                type="number"
                min={60}
                max={200}
                step={5}
                value={Math.round((s.logoScale ?? 1) * 100)}
                onChange={(e) =>
                  set({ logoScale: Math.min(2, Math.max(0.6, Number(e.target.value) / 100 || 1)) })
                }
                className="rounded-xl"
              />
            </div>
          </div>
        </div>

        {/* ---- Scrolling logos ---- */}
        <div className="space-y-2 rounded-xl border border-border/40 bg-muted/20 p-4">
          <Label className="text-sm">Scrolling ticker logos</Label>
          <p className="text-xs text-muted-foreground">
            Logos that scroll alongside the ticker text (right to left). Add as many as you like;
            click × to remove one.
          </p>
          <Input
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp,image/svg+xml,.png,.jpg,.jpeg,.webp,.svg"
            aria-label="Upload scrolling ticker logos"
            onChange={async (e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length === 0) return;
              try {
                const urls: string[] = [];
                for (const file of files) {
                  const { dataUrl } = await compressImageToDataUrl(file, LOGO_IMAGE_OPTIONS);
                  urls.push(dataUrl);
                }
                set({ scrollingLogos: [...(s.scrollingLogos ?? []), ...urls] });
                toast.success(`${urls.length} logo(s) added — Save to apply`);
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Could not read image");
              }
            }}
            className="rounded-xl"
          />
          {(s.scrollingLogos ?? []).length > 0 ? (
            <div className="flex flex-wrap gap-2 pt-1">
              {(s.scrollingLogos ?? []).map((src, i) => (
                <div key={i} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt={`Scrolling logo ${i + 1}`}
                    className="h-9 w-14 rounded-md bg-slate-800 object-contain p-1"
                  />
                  <button
                    type="button"
                    aria-label="Remove logo"
                    onClick={() =>
                      set({ scrollingLogos: (s.scrollingLogos ?? []).filter((_, idx) => idx !== i) })
                    }
                    className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-xs text-white"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {/* ---- Yellow headline box ---- */}
        <div className="space-y-3 rounded-xl border border-border/40 bg-muted/20 p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label className="text-sm">Yellow headline box</Label>
              <p className="text-xs text-muted-foreground">
                The gold curved box above the ticker (e.g. &quot;WELCOME TO UNIMONI&quot;).
              </p>
            </div>
            <Switch
              checked={s.showTickerHeadline !== false}
              onCheckedChange={(checked) => set({ showTickerHeadline: checked })}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Headline text
              </Label>
              <Input
                value={s.tickerHeadline ?? ""}
                onChange={(e) => set({ tickerHeadline: e.target.value || null })}
                placeholder="e.g. WELCOME TO UNIMONI"
                disabled={s.showTickerHeadline === false}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Text movement
              </Label>
              <Select
                value={s.tickerHeadlineAnimation ?? "none"}
                onValueChange={(value) =>
                  set({ tickerHeadlineAnimation: value === "none" ? null : value })
                }
              >
                <SelectTrigger className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No animation</SelectItem>
                  <SelectItem value="bounce">Bounce</SelectItem>
                  <SelectItem value="flip">Flip (X)</SelectItem>
                  <SelectItem value="spin">Rotating flip (Y)</SelectItem>
                  <SelectItem value="pulse">Gentle pulse</SelectItem>
                  <SelectItem value="swing">Swing</SelectItem>
                  <SelectItem value="float">Float</SelectItem>
                  <SelectItem value="wave">Wave</SelectItem>
                  <SelectItem value="heartbeat">Heartbeat</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* ---- The bar itself ---- */}
        <div className="space-y-3 rounded-xl border border-border/40 bg-muted/20 p-4">
          <Label className="text-sm">Black ticker bar (scrolling message)</Label>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Bar height / size (%)
              </Label>
              <Input
                type="number"
                min={70}
                max={160}
                step={5}
                value={Math.round((s.tickerScale ?? 1) * 100)}
                onChange={(e) =>
                  set({ tickerScale: Math.min(1.6, Math.max(0.7, Number(e.target.value) / 100 || 1)) })
                }
                className="rounded-xl"
              />
              <p className="text-xs text-muted-foreground">
                Makes the black bar taller and the running message bigger together.
              </p>
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Default speed (seconds)
              </Label>
              <Input
                type="number"
                value={s.tickerSpeed}
                onChange={(e) => set({ tickerSpeed: Number(e.target.value) })}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Message font size
              </Label>
              <Input
                type="number"
                value={s.tickerFontSize}
                onChange={(e) => set({ tickerFontSize: Number(e.target.value) })}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Message font colour
              </Label>
              <Input
                value={s.tickerFontColor}
                onChange={(e) => set({ tickerFontColor: e.target.value })}
                className="rounded-xl"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <Button className="rounded-xl" disabled={saving} onClick={() => void save()}>
            {saving ? "Saving…" : "Save ticker settings"}
          </Button>
        </div>
      </div>
    </ContentPanel>
  );
}
