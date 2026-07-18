"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
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
import { DEFAULT_BRANCH_SETTINGS, DISPLAY_ANIMATIONS } from "@/lib/constants";
import { LOGO_IMAGE_OPTIONS, compressImageToDataUrl, compressLogoTransparent, stripLogoBackground } from "@/lib/image-utils";
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
  saveSlot,
}: {
  branch: Branch;
  actor: { userId: string; userName: string };
  /** Element under the live TV preview that hosts the save bar on xl screens. */
  saveSlot?: HTMLElement | null;
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

  // Corner-badge logo GALLERY: several logos take turns. The legacy single
  // tickerLogoUrl folds into the list on any edit so old branches keep working.
  const badgeLogos: string[] = [
    ...(s.tickerLogoUrl ? [s.tickerLogoUrl] : []),
    ...(s.tickerLogoUrls ?? []),
  ];
  const addBadgeLogos = (urls: string[]) =>
    set({ tickerLogoUrl: null, tickerLogoUrls: [...badgeLogos, ...urls] });
  const removeBadgeLogo = (idx: number) =>
    set({ tickerLogoUrl: null, tickerLogoUrls: badgeLogos.filter((_, i) => i !== idx) });

  // Scrolling logos with PER-LOGO front/end placement. Legacy string list folds
  // into items (using the old whole-list position) on any edit.
  const legacyPos = (s.tickerScrollLogoPosition === "end" ? "end" : "start") as "start" | "end";
  const scrollItems: Array<{ url: string; pos: "start" | "end" }> = [
    ...((s.scrollingLogoItems ?? []).filter((it) => it?.url?.trim())),
    ...((s.scrollingLogos ?? []).map((url) => ({ url, pos: legacyPos }))),
  ];
  const setScrollItems = (items: Array<{ url: string; pos: "start" | "end" }>) =>
    set({ scrollingLogoItems: items, scrollingLogos: [] });

  // Where each logo will sit — so background removal can protect readability
  // (e.g. white lettering is kept on its dark box when the badge is white).
  const badgeSurface = (): "light" | "dark" => {
    const bg = s.tickerLogoBgColor?.trim();
    if (!bg) return "light"; // default white badge
    if (bg === "transparent") return "dark"; // black bar behind
    const m = /^#?([0-9a-f]{6})$/i.exec(bg.replace("#", "#").startsWith("#") ? bg.slice(1) : bg);
    if (!m) return "light";
    const n = parseInt(m[1], 16);
    const lum = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
    return lum > 140 ? "light" : "dark";
  };
  const scrollSurface = (): "light" | "dark" | "any" => {
    const mode = s.tickerScrollLogoBg ?? "white";
    return mode === "white" ? "light" : mode === "transparent" ? "dark" : "any";
  };

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
        {/* Some brand logos NEED their background — this switch turns the
            automatic removal off entirely (uploads are kept exactly as-is). */}
        <div className="flex items-center justify-between gap-4 rounded-xl border border-border/40 bg-muted/20 p-3">
          <div>
            <Label className="text-sm">Remove logo backgrounds automatically</Label>
            <p className="text-xs text-muted-foreground">
              On: white/solid backgrounds are stripped when you upload a logo (kept when the logo
              needs them). Off: every logo is uploaded exactly as-is.
            </p>
          </div>
          <Switch
            checked={s.logoAutoRemoveBg !== false}
            onCheckedChange={(checked) => set({ logoAutoRemoveBg: checked })}
          />
        </div>
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
                Badge image(s) — add SEVERAL and they take turns
              </Label>
              <Input
                type="file"
                multiple
                accept="image/png,image/jpeg,image/webp,image/svg+xml,.png,.jpg,.jpeg,.webp,.svg"
                aria-label="Upload ticker corner logo images"
                onChange={async (e) => {
                  const files = Array.from(e.target.files ?? []);
                  if (files.length === 0) return;
                  try {
                    const urls: string[] = [];
                    let kept = 0;
                    for (const file of files) {
                      const res =
                        s.logoAutoRemoveBg !== false
                          ? await compressLogoTransparent(file, LOGO_IMAGE_OPTIONS, badgeSurface())
                          : { ...(await compressImageToDataUrl(file, LOGO_IMAGE_OPTIONS)), backgroundKept: false };
                      urls.push(res.dataUrl);
                      if (res.backgroundKept) kept++;
                    }
                    addBadgeLogos(urls);
                    toast.success(
                      `${urls.length} logo(s) ready${kept ? ` — ${kept} kept their background (needed for readability)` : " (backgrounds removed)"} — Save to apply`,
                      { duration: 8000 },
                    );
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Could not read image");
                  }
                }}
                className="rounded-xl"
              />
              {badgeLogos.length > 0 ? (
                <div className="flex flex-wrap gap-2 pt-1">
                  {badgeLogos.map((src, i) => (
                    <div key={`${i}-${src.slice(-12)}`} className="relative flex flex-col items-center gap-1">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={src}
                        alt={`Corner logo ${i + 1}`}
                        className="h-9 w-14 rounded-md bg-slate-800 object-contain p-1"
                      />
                      <button
                        type="button"
                        aria-label="Remove corner logo"
                        onClick={() => removeBadgeLogo(i)}
                        className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-xs text-white"
                      >
                        ×
                      </button>
                      <button
                        type="button"
                        title="Remove the background from this logo"
                        onClick={() =>
                          void stripLogoBackground(src, badgeSurface())
                            .then((cleaned) =>
                              set({
                                tickerLogoUrl: null,
                                tickerLogoUrls: badgeLogos.map((u, idx) => (idx === i ? cleaned : u)),
                              }),
                            )
                            .then(() => toast.success("Background removed — Save to apply"))
                            .catch((e) =>
                              toast.error(e instanceof Error ? e.message : "Could not process"),
                            )
                        }
                        className="rounded border border-border/60 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground hover:bg-muted"
                      >
                        Remove BG
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
              {badgeLogos.length > 1 ? (
                <div className="flex items-center gap-2 pt-1">
                  <Label className="text-xs text-muted-foreground">Change logo every</Label>
                  <Input
                    type="number"
                    min={2}
                    max={120}
                    value={s.tickerLogoRotateSeconds ?? 6}
                    onChange={(e) =>
                      set({ tickerLogoRotateSeconds: Math.max(2, Number(e.target.value) || 6) })
                    }
                    className="h-8 w-20 rounded-lg"
                  />
                  <span className="text-xs text-muted-foreground">seconds</span>
                </div>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Logo movement
              </Label>
              <Select
                value={s.tickerLogoAnimation ?? "spin"}
                onValueChange={(value) => set({ tickerLogoAnimation: value ?? "spin" })}
              >
                <SelectTrigger className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DISPLAY_ANIMATIONS.map((a) => (
                  <SelectItem key={a.key} value={a.key}>
                    {a.label}
                  </SelectItem>
                ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Badge width (%)
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
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Badge height (%)
              </Label>
              <Input
                type="number"
                min={60}
                max={200}
                step={5}
                value={Math.round((s.tickerLogoHeightScale ?? 1) * 100)}
                onChange={(e) =>
                  set({
                    tickerLogoHeightScale: Math.min(2, Math.max(0.6, Number(e.target.value) / 100 || 1)),
                  })
                }
                className="rounded-xl"
              />
              <p className="text-xs text-muted-foreground">
                Width and height are separate — set both to make the whole badge bigger.
              </p>
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Logo fit inside the badge
              </Label>
              <Select
                value={s.tickerLogoFit ?? "contain"}
                onValueChange={(value) =>
                  set({ tickerLogoFit: (value as "contain" | "cover" | "fill") ?? "contain" })
                }
              >
                <SelectTrigger className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="contain">Normal — whole logo inside the box (default)</SelectItem>
                  <SelectItem value="fill">Stretch — logo covers the box completely</SelectItem>
                  <SelectItem value="cover">Zoom — covers the box, edges may crop</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Badge background colour
              </Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  aria-label="Pick badge background colour"
                  value={/^#[0-9a-fA-F]{6}$/.test(s.tickerLogoBgColor ?? "") ? (s.tickerLogoBgColor as string) : "#FFFFFF"}
                  onChange={(e) => set({ tickerLogoBgColor: e.target.value })}
                  className="h-9 w-12 cursor-pointer rounded-lg border border-border bg-transparent"
                />
                <Input
                  value={s.tickerLogoBgColor ?? ""}
                  onChange={(e) => set({ tickerLogoBgColor: e.target.value || null })}
                  placeholder="default white — or e.g. #0D2680 / transparent"
                  className="rounded-xl"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-lg"
                  onClick={() => set({ tickerLogoBgColor: "transparent" })}
                >
                  Transparent
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                The white card behind the badge logo. Pick a colour, type any CSS colour, use
                Transparent, or clear the box to go back to the default white.
              </p>
            </div>
          </div>
        </div>

        {/* ---- Scrolling logos ---- */}
        <div className="space-y-2 rounded-xl border border-border/40 bg-muted/20 p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label className="text-sm">Scrolling ticker logos</Label>
              <p className="text-xs text-muted-foreground">
                Logos that ride along with the ticker text. Add as many as you like; click × to
                remove one. Backgrounds are removed automatically on upload.
              </p>
            </div>
            <Switch
              checked={s.tickerScrollLogosEnabled !== false}
              onCheckedChange={(checked) => set({ tickerScrollLogosEnabled: checked })}
            />
          </div>

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
                let kept = 0;
                for (const file of files) {
                  const res =
                    s.logoAutoRemoveBg !== false
                      ? await compressLogoTransparent(file, LOGO_IMAGE_OPTIONS, scrollSurface())
                      : { ...(await compressImageToDataUrl(file, LOGO_IMAGE_OPTIONS)), backgroundKept: false };
                  urls.push(res.dataUrl);
                  if (res.backgroundKept) kept++;
                }
                setScrollItems([
                  ...scrollItems,
                  ...urls.map((url) => ({ url, pos: "start" as const })),
                ]);
                toast.success(
                  `${urls.length} logo(s) added${kept ? ` — ${kept} kept their background (needed for readability)` : " (backgrounds removed)"} — set Front/End below, then Save`,
                  { duration: 8000 },
                );
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Could not read image");
              }
            }}
            className="rounded-xl"
          />
          {scrollItems.length > 0 ? (
            <div className="flex flex-wrap gap-3 pt-1">
              {scrollItems.map((item, i) => (
                <div key={`${i}-${item.url.slice(-12)}`} className="relative flex flex-col items-center gap-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.url}
                    alt={`Scrolling logo ${i + 1}`}
                    className="h-9 w-14 rounded-md bg-slate-800 object-contain p-1"
                  />
                  <button
                    type="button"
                    aria-label="Remove logo"
                    onClick={() => setScrollItems(scrollItems.filter((_, idx) => idx !== i))}
                    className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-xs text-white"
                  >
                    ×
                  </button>
                  {/* One-click fix for OLD logos uploaded before auto-removal. */}
                  <button
                    type="button"
                    title="Remove the background from this logo"
                    onClick={() =>
                      void stripLogoBackground(item.url, scrollSurface())
                        .then((cleaned) =>
                          setScrollItems(
                            scrollItems.map((it, idx) => (idx === i ? { ...it, url: cleaned } : it)),
                          ),
                        )
                        .then(() => toast.success("Background removed — Save to apply"))
                        .catch((e) => toast.error(e instanceof Error ? e.message : "Could not process"))
                    }
                    className="rounded border border-border/60 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground hover:bg-muted"
                  >
                    Remove BG
                  </button>
                  {/* Per-logo placement: FRONT of the message or at its END. */}
                  <div className="flex overflow-hidden rounded-md border border-border/60 text-[10px] font-semibold">
                    <button
                      type="button"
                      onClick={() =>
                        setScrollItems(scrollItems.map((it, idx) => (idx === i ? { ...it, pos: "start" } : it)))
                      }
                      className={`px-1.5 py-0.5 ${item.pos !== "end" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                    >
                      Front
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setScrollItems(scrollItems.map((it, idx) => (idx === i ? { ...it, pos: "end" } : it)))
                      }
                      className={`px-1.5 py-0.5 ${item.pos === "end" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                    >
                      End
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          <div className="grid gap-4 pt-1 sm:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Logo size (%)
            </Label>
            <Input
              type="number"
              min={60}
              max={250}
              step={10}
              value={Math.round((s.tickerScrollLogoScale ?? 1) * 100)}
              onChange={(e) =>
                set({
                  tickerScrollLogoScale: Math.min(2.5, Math.max(0.6, Number(e.target.value) / 100 || 1)),
                })
              }
              className="rounded-xl"
            />
            <p className="text-xs text-muted-foreground">
              Only the scrolling logos grow — the black bar height stays the same.
            </p>
          </div>
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Logo background chip
            </Label>
            <Select
              value={s.tickerScrollLogoBg ?? "white"}
              onValueChange={(value) =>
                set({ tickerScrollLogoBg: (value as "white" | "transparent" | "auto") ?? "white" })
              }
            >
              <SelectTrigger className="rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto — dark chip for light logos, white for dark (recommended)</SelectItem>
                <SelectItem value="white">White chip behind each logo</SelectItem>
                <SelectItem value="transparent">No chip — logo directly on the black bar</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Logo movement (while scrolling)
            </Label>
            <Select
              value={s.tickerScrollLogoAnimation ?? "none"}
              onValueChange={(value) =>
                set({ tickerScrollLogoAnimation: value === "none" ? null : value })
              }
            >
              <SelectTrigger className="rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DISPLAY_ANIMATIONS.map((a) => (
                  <SelectItem key={a.key} value={a.key}>
                    {a.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Movement applied to each logo as it scrolls along with the message.
            </p>
          </div>
          </div>
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
                  {DISPLAY_ANIMATIONS.map((a) => (
                  <SelectItem key={a.key} value={a.key}>
                    {a.label}
                  </SelectItem>
                ))}
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
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Message movement effect
              </Label>
              <Select
                value={s.tickerMessageAnimation ?? "none"}
                onValueChange={(value) =>
                  set({ tickerMessageAnimation: value === "none" ? null : value })
                }
              >
                <SelectTrigger className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DISPLAY_ANIMATIONS.map((a) => (
                  <SelectItem key={a.key} value={a.key}>
                    {a.label}
                  </SelectItem>
                ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Extra movement applied to the running message while it scrolls.
              </p>
            </div>
          </div>
        </div>

        {/* On xl screens the save bar lives right BELOW the live TV preview
            (portal); smaller screens keep the inline left-side button. */}
        {saveSlot
          ? createPortal(
              <div className="space-y-2 rounded-2xl border border-primary/30 bg-background/95 px-4 py-3 shadow-lg">
                <p className="text-xs text-muted-foreground">
                  Ticker changes go live on the <strong>{branch.name}</strong> TV only after you save.
                </p>
                <Button
                  disabled={saving}
                  className="w-full rounded-xl"
                  onClick={() => void save()}
                >
                  {saving ? "Saving…" : "Save ticker settings"}
                </Button>
              </div>,
              saveSlot,
            )
          : null}
        <div className={`${saveSlot ? "xl:hidden " : ""}flex justify-start`}>
          <Button className="rounded-xl" disabled={saving} onClick={() => void save()}>
            {saving ? "Saving…" : "Save ticker settings"}
          </Button>
        </div>
      </div>
    </ContentPanel>
  );
}
