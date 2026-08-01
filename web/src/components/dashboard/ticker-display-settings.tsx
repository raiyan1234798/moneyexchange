"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { ApplyToAllCheckbox } from "@/components/shared/apply-to-all-checkbox";
import { ColorApplyRow, type ColorApplyScope } from "@/components/shared/color-apply-row";
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

// The ONLY settings keys this ticker editor owns. "Apply to other branches"
// copies exactly these onto a target branch and nothing else, so a target's
// rate card, promotions, announcements, header logos, hidden currencies, video
// width, fonts, etc. are never touched. Keep in sync with the controls above.
const TICKER_COPY_KEYS: Array<keyof BranchSettings> = [
  "tickerScale",
  "tickerFontColor",
  "tickerFontSize",
  "tickerSpeed",
  "tickerHeadline",
  "tickerHeadlineAnimation",
  "tickerHeadlineBgColor",
  "tickerHeadlineTextColor",
  "showTickerHeadline",
  "showTickerLogo",
  "tickerLogoUrl",
  "tickerLogoUrls",
  "tickerLogoText",
  "tickerLogoAnimation",
  "tickerLogoBgColor",
  "tickerLogoFit",
  "tickerLogoRotateSeconds",
  "tickerLogoContainScale",
  "tickerLogoScales",
  "tickerLogoHeightScale",
  "tickerMessageAnimation",
  "tickerScrollLogoAnimation",
  "tickerScrollLogoBg",
  "tickerScrollLogoScale",
  "tickerScrollLogoGapVw",
  "tickerScrollLogoPosition",
  "tickerScrollLogosEnabled",
  "scrollingLogos",
  "scrollingLogoItems",
  "scrollLogoFitMode",
  "scrollLogoRemoveBg",
  "logoAutoRemoveBg",
  "logoScale",
];

export function TickerDisplaySettings({
  branch,
  branches = [],
  actor,
  saveSlot,
  onDraftChange,
}: {
  branch: Branch;
  /** All branches — enables “apply to all” for headline + ticker look. */
  branches?: Branch[];
  actor: { userId: string; userName: string };
  /** Element under the live TV preview that hosts the save bar on xl screens. */
  saveSlot?: HTMLElement | null;
  /** Reports the current UNSAVED draft so a live preview can reflect it. */
  onDraftChange?: (draft: BranchSettings) => void;
}) {
  const seed = (): BranchSettings => ({ ...DEFAULT_BRANCH_SETTINGS, ...(branch.settings ?? {}) });
  const [settings, setSettings] = useState<BranchSettings>(seed);
  const [saving, setSaving] = useState(false);
  // Surface the draft to the parent (for the live preview) on every edit.
  useEffect(() => {
    onDraftChange?.(settings);
  }, [settings, onDraftChange]);
  const [targetScope, setTargetScope] = useState<"current" | "specific" | "all">("current");
  // What travels to the other branches. Logos + their sizes DO (one brand set on
  // every TV). The yellow headline does NOT by default — it names the branch
  // ("Welcome to Kisementi Branch!"), so copying it would put one branch's name
  // on every screen. Opt in explicitly when the wording really is shared.
  const [copyLogos, setCopyLogos] = useState(true);
  const [copyHeadline, setCopyHeadline] = useState(false);
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>([branch.id]);
  // Independent apply targets for the two headline colours (box/border vs letters).
  const [borderColorScope, setBorderColorScope] = useState<ColorApplyScope>("current");
  const [borderColorBranchIds, setBorderColorBranchIds] = useState<string[]>([branch.id]);
  const [letterColorScope, setLetterColorScope] = useState<ColorApplyScope>("current");
  const [letterColorBranchIds, setLetterColorBranchIds] = useState<string[]>([branch.id]);
  const [applyingColor, setApplyingColor] = useState<"border" | "letter" | null>(null);

  // Reseed when the selected branch changes (render-time adjust, no effect).
  const [loadedBranch, setLoadedBranch] = useState(branch.id);
  if (loadedBranch !== branch.id) {
    setLoadedBranch(branch.id);
    setSettings(seed());
    setTargetScope("current");
    setSelectedBranchIds([branch.id]);
    setBorderColorScope("current");
    setBorderColorBranchIds([branch.id]);
    setLetterColorScope("current");
    setLetterColorBranchIds([branch.id]);
  }

  const s = settings;
  const set = (patch: Partial<BranchSettings>) => setSettings((prev) => ({ ...prev, ...patch }));
  const activeBranches = branches.filter((b) => b.status === "active");
  const canApplyToAll = activeBranches.length > 1;

  function resolveTargets(
    scope: "current" | "specific" | "all",
    ids: string[],
  ): Branch[] {
    if (scope === "all") return activeBranches;
    if (scope === "specific") {
      const wanted = new Set(ids.length > 0 ? ids : [branch.id]);
      return activeBranches.filter((b) => wanted.has(b.id));
    }
    return [branch];
  }

  /** Push ONLY one headline colour field to the chosen branches. */
  async function applyHeadlineColor(which: "border" | "letter") {
    const scope = which === "border" ? borderColorScope : letterColorScope;
    const ids = which === "border" ? borderColorBranchIds : letterColorBranchIds;
    const targets = resolveTargets(scope, ids);
    if (targets.length === 0) {
      toast.error("Pick at least one branch");
      return;
    }
    setApplyingColor(which);
    try {
      const colorPatch =
        which === "border"
          ? { tickerHeadlineBgColor: settings.tickerHeadlineBgColor ?? null }
          : { tickerHeadlineTextColor: settings.tickerHeadlineTextColor ?? null };
      setSettings((prev) => ({ ...prev, ...colorPatch }));
      const { getDocument } = await import("@/lib/firebase/firestore");
      const { COLLECTIONS } = await import("@/lib/constants");
      await Promise.all(
        targets.map(async (b) => {
          // Read-modify-write so we only change the colour field and keep the
          // latest logos/headline/bar settings already on the server.
          const latest = await getDocument<Branch>(COLLECTIONS.branches, b.id);
          const base = {
            ...DEFAULT_BRANCH_SETTINGS,
            ...(latest?.settings ?? b.settings ?? {}),
          };
          return updateBranch(b.id, { settings: { ...base, ...colorPatch } }, actor);
        }),
      );
      toast.success(
        which === "border"
          ? `Box & border colour applied to ${targets.length} branch${targets.length === 1 ? "" : "es"}`
          : `Letter colour applied to ${targets.length} branch${targets.length === 1 ? "" : "es"}`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not apply colour");
    } finally {
      setApplyingColor(null);
    }
  }

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
  // Drag a badge logo tile onto another to change the rotation order
  // (client 2026-07-27). Order here = the order they take turns on the TV.
  const [badgeDragIndex, setBadgeDragIndex] = useState<number | null>(null);
  const [badgeOverIndex, setBadgeOverIndex] = useState<number | null>(null);
  const moveBadgeLogo = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= badgeLogos.length || to >= badgeLogos.length) return;
    const next = [...badgeLogos];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    set({ tickerLogoUrl: null, tickerLogoUrls: next });
  };

  // Scrolling logos with PER-LOGO front/end placement. Legacy string list folds
  // into items (using the old whole-list position) on any edit.
  const legacyPos = (s.tickerScrollLogoPosition === "end" ? "end" : "start") as "start" | "end";
  const scrollItems: Array<{ url: string; pos: "start" | "end" }> = [
    ...((s.scrollingLogoItems ?? []).filter((it) => it?.url?.trim())),
    ...((s.scrollingLogos ?? []).map((url) => ({ url, pos: legacyPos }))),
  ];
  const setScrollItems = (items: Array<{ url: string; pos: "start" | "end" }>) =>
    set({ scrollingLogoItems: items, scrollingLogos: [] });
  // Drag a scrolling-logo tile onto another to change the order they ride in
  // (client 2026-07-27). The TV builds its Front/End groups by filtering this
  // list in order, so this list order IS the on-screen order.
  const [scrollDragIndex, setScrollDragIndex] = useState<number | null>(null);
  const [scrollOverIndex, setScrollOverIndex] = useState<number | null>(null);
  const moveScrollItem = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= scrollItems.length || to >= scrollItems.length) return;
    const next = [...scrollItems];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setScrollItems(next);
  };

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

  /** What travels to other branches — shown wherever the apply picker appears. */
  const copyOptions = (idPrefix: string) =>
    targetScope === "current" ? null : (
      <div className="space-y-1.5 rounded-xl border border-border/40 bg-muted/20 p-2.5">
        <label className="flex cursor-pointer items-start gap-2">
          <input
            id={`${idPrefix}-logos`}
            type="checkbox"
            checked={copyLogos}
            onChange={(e) => setCopyLogos(e.target.checked)}
            className="mt-0.5 h-4 w-4"
          />
          <span className="text-xs">
            <span className="font-medium">Also copy the logos</span>
            <span className="block text-muted-foreground">
              Corner badge + scrolling logos (their sizes always copy). Off = each branch keeps its
              own logos.
            </span>
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-2">
          <input
            id={`${idPrefix}-headline`}
            type="checkbox"
            checked={copyHeadline}
            onChange={(e) => setCopyHeadline(e.target.checked)}
            className="mt-0.5 h-4 w-4"
          />
          <span className="text-xs">
            <span className="font-medium">Also copy the yellow headline words</span>
            <span className="block text-muted-foreground">
              Normally OFF — the headline names the branch (&quot;Welcome to {branch.name}&quot;), so
              each branch keeps its own. Tick only when the wording is the same everywhere.
            </span>
          </span>
        </label>
      </div>
    );

  async function save() {
    setSaving(true);
    try {
      const targets =
        targetScope === "all"
          ? activeBranches
          : targetScope === "specific"
          ? activeBranches.filter((b) => selectedBranchIds.includes(b.id) || b.id === branch.id)
          : activeBranches.filter((b) => b.id === branch.id);
      const list = targets.length > 0 ? targets : [branch];

      await Promise.all(
        list.map((b) => {
          let nextSettings: BranchSettings = settings;
          if (b.id !== branch.id) {
            // Copy ONLY the ticker/bar keys onto the target — NEVER spread the
            // whole draft, which would overwrite the target branch's rate card,
            // promotions, announcements, header logos, hidden currencies, video
            // width, etc. with this branch's values (silent cross-branch data
            // loss). Everything the target owns outside the ticker is preserved.
            const tickerPatch: Partial<BranchSettings> = {};
            for (const k of TICKER_COPY_KEYS) {
              if (k in settings) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (tickerPatch as any)[k] = (settings as any)[k];
              }
            }
            nextSettings = {
              ...(b.settings ?? {}),
              ...tickerPatch,
              // Logos (and their per-logo sizes) travel only when "copy logos"
              // is on; otherwise the target keeps its OWN logos + sizes.
              ...(copyLogos
                ? {}
                : {
                    tickerLogoUrl: b.settings?.tickerLogoUrl ?? null,
                    tickerLogoUrls: b.settings?.tickerLogoUrls ?? [],
                    tickerLogoText: b.settings?.tickerLogoText ?? null,
                    tickerLogoScales: b.settings?.tickerLogoScales ?? [],
                    scrollingLogos: b.settings?.scrollingLogos ?? [],
                    scrollingLogoItems: b.settings?.scrollingLogoItems ?? [],
                  }),
              // The headline names the branch, so keep the target's own wording
              // unless the admin explicitly opts in.
              ...(copyHeadline ? {} : { tickerHeadline: b.settings?.tickerHeadline ?? null }),
            };
          }
          return updateBranch(
            b.id,
            {
              logoUrl: b.logoUrl ?? "",
              brandingColor: b.brandingColor ?? "#0D2680",
              settings: nextSettings,
            },
            actor,
          );
        }),
      );

      const extras = [copyLogos ? "logos" : null, copyHeadline ? "headline text" : null]
        .filter(Boolean)
        .join(" + ");
      toast.success(
        list.length > 1
          ? `✓ Applied to ${list.length} branches — bar look & sizes${extras ? ` + ${extras}` : ""}${
              copyHeadline ? "" : "; each branch kept its own yellow headline"
            }`
          : "✓ Saved — live on this branch's TV within seconds",
        { duration: 9000 },
      );
      setTargetScope("current");
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
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label className="text-sm">Corner logo — the badge at the bottom-left of the TV</Label>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Shows the <strong>unimoni logo</strong> by default. Turn off to hide/disappear the logo badge completely from the TV screen.
              </p>
            </div>
            <Switch
              checked={s.showTickerLogo !== false}
              onCheckedChange={(checked) => set({ showTickerLogo: checked })}
            />
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
                Badge image(s) — add SEVERAL at once or one by one
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
                    <div
                      key={`${i}-${src.slice(-12)}`}
                      // Drag a tile onto another to reorder — order = the turn
                      // order on the TV badge.
                      draggable
                      onDragStart={(e) => {
                        setBadgeDragIndex(i);
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", String(i));
                      }}
                      onDragOver={(e) => {
                        if (badgeDragIndex === null) return;
                        e.preventDefault();
                        setBadgeOverIndex(i);
                      }}
                      onDrop={(e) => {
                        if (badgeDragIndex === null) return;
                        e.preventDefault();
                        moveBadgeLogo(badgeDragIndex, i);
                        setBadgeDragIndex(null);
                        setBadgeOverIndex(null);
                      }}
                      onDragEnd={() => {
                        setBadgeDragIndex(null);
                        setBadgeOverIndex(null);
                      }}
                      className={`relative flex cursor-grab flex-col items-center gap-1 rounded-lg p-0.5 active:cursor-grabbing ${
                        badgeDragIndex === i ? "opacity-50" : ""
                      } ${
                        badgeOverIndex === i && badgeDragIndex !== null && badgeDragIndex !== i
                          ? "ring-2 ring-primary/60"
                          : ""
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={src}
                        alt={`Corner logo ${i + 1}`}
                        className="pointer-events-none h-9 w-14 rounded-md bg-slate-800 object-contain p-1"
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
                                // Follow this logo's per-logo Size to its new URL
                                // so the size doesn't reset after Remove BG.
                                tickerLogoScales: (Array.isArray(s.tickerLogoScales)
                                  ? s.tickerLogoScales
                                  : []
                                ).map((x) => (x.url === src ? { ...x, url: cleaned } : x)),
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
                      {/* Per-logo size (Normal fit): shrink a wide logo until
                          its edges clear the rounded corner — others stay big. */}
                      <div
                        className="flex items-center gap-1"
                        draggable={false}
                        onPointerDown={(e) => e.stopPropagation()}
                        onDragStart={(e) => e.preventDefault()}
                      >
                        <span className="text-[9px] uppercase text-muted-foreground">Size</span>
                        <input
                          type="number"
                          min={50}
                          max={100}
                          step={5}
                          title="Size of THIS logo inside the badge (Normal fit). Lower it if this logo's edges get cut; other logos are unaffected."
                          value={Math.round(
                            ((Array.isArray(s.tickerLogoScales) ? s.tickerLogoScales : []).find(
                              (x) => x.url === src,
                            )?.scale ??
                              s.tickerLogoContainScale ??
                              0.9) * 100,
                          )}
                          onChange={(e) => {
                            const frac = Math.min(1, Math.max(0.5, Number(e.target.value) / 100 || 0.9));
                            // Upsert into the { url, scale } array (Firestore-safe;
                            // never a URL-keyed map — see BranchSettings type).
                            const cur = Array.isArray(s.tickerLogoScales) ? s.tickerLogoScales : [];
                            const rest = cur.filter((x) => x.url !== src);
                            // Fold the legacy single tickerLogoUrl into the list
                            // (like add/remove/reorder do) so this tile actually
                            // renders on the TV and its Size takes effect.
                            set({
                              tickerLogoUrl: null,
                              tickerLogoUrls: badgeLogos,
                              tickerLogoScales: [...rest, { url: src, scale: frac }],
                            });
                          }}
                          className="w-11 rounded border border-border/60 bg-transparent px-1 py-0.5 text-center text-[10px] tabular-nums"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
              {badgeLogos.length >= 1 ? (
                <p className="pt-1 text-xs text-muted-foreground">
                  Each logo has its own <strong>Size</strong> box — if one logo&apos;s edges get cut,
                  lower just that logo&apos;s size until the whole logo shows (works in Normal fit;
                  other logos are unaffected).
                  {badgeLogos.length > 1
                    ? " Drag a logo onto another to change the order they take turns in."
                    : ""}{" "}
                  Then Save.
                </p>
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
                  <SelectItem value="contain">Normal — whole logo always visible, never cropped (best)</SelectItem>
                  <SelectItem value="fill">Stretch — fills the box, may distort the logo</SelectItem>
                  <SelectItem value="cover">Zoom — fills the box, edges get cropped</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                If a logo&apos;s edges get cut in Stretch/Zoom, use <strong>Normal</strong> and raise
                &ldquo;Logo size inside badge&rdquo; below — the whole logo stays visible at any size.
              </p>
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Logo size inside badge (%)
              </Label>
              <Input
                type="number"
                min={50}
                max={100}
                step={5}
                value={Math.round((s.tickerLogoContainScale ?? 0.9) * 100)}
                onChange={(e) =>
                  set({
                    tickerLogoContainScale: Math.min(1, Math.max(0.5, Number(e.target.value) / 100 || 0.9)),
                  })
                }
                className="rounded-xl"
              />
              <p className="text-xs text-muted-foreground">
                Only for <strong>Normal</strong> fit: how much of the badge the whole logo fills. 100
                = as big as possible with nothing cropped. Raise it if the logo looks too small; the
                complete logo always shows.
              </p>
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
                remove one. <strong>Drag a logo onto another to change the order they appear in</strong>{" "}
                (then Save). Backgrounds are removed automatically on upload.
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
                <div
                  key={`${i}-${item.url.slice(-12)}`}
                  draggable
                  onDragStart={(e) => {
                    setScrollDragIndex(i);
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", String(i));
                  }}
                  onDragOver={(e) => {
                    if (scrollDragIndex === null) return;
                    e.preventDefault();
                    setScrollOverIndex(i);
                  }}
                  onDrop={(e) => {
                    if (scrollDragIndex === null) return;
                    e.preventDefault();
                    moveScrollItem(scrollDragIndex, i);
                    setScrollDragIndex(null);
                    setScrollOverIndex(null);
                  }}
                  onDragEnd={() => {
                    setScrollDragIndex(null);
                    setScrollOverIndex(null);
                  }}
                  className={`relative flex cursor-grab flex-col items-center gap-1 rounded-lg p-0.5 active:cursor-grabbing ${
                    scrollDragIndex === i ? "opacity-50" : ""
                  } ${
                    scrollOverIndex === i && scrollDragIndex !== null && scrollDragIndex !== i
                      ? "ring-2 ring-primary/60"
                      : ""
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.url}
                    alt={`Scrolling logo ${i + 1}`}
                    className="pointer-events-none h-9 w-14 rounded-md bg-slate-800 object-contain p-1"
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
              Space between logos
            </Label>
            <Input
              type="number"
              min={0}
              max={5}
              step={0.2}
              value={s.tickerScrollLogoGapVw ?? 1.2}
              onChange={(e) =>
                set({
                  tickerScrollLogoGapVw: Math.min(5, Math.max(0, Number(e.target.value))),
                })
              }
              className="rounded-xl"
            />
            <p className="text-xs text-muted-foreground">
              Gap between one logo and the next. Set <strong>0</strong> to join the logos with no
              space (e.g. Ria + MoneyGram touching); 1.2 is the normal spacing.
            </p>
          </div>
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Logo background chip
            </Label>
            <Select
              value={s.tickerScrollLogoBg ?? "transparent"}
              onValueChange={(value) =>
                set({ tickerScrollLogoBg: (value as "white" | "transparent" | "auto") ?? "transparent" })
              }
            >
              <SelectTrigger className="rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="transparent">Transparent — logo sits directly on black bar (No white box)</SelectItem>
                <SelectItem value="auto">Auto — contrast chip depending on logo tone</SelectItem>
                <SelectItem value="white">White box chip behind each logo</SelectItem>
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
                max={300}
                step={5}
                value={Math.round((s.tickerScale ?? 1) * 100)}
                onChange={(e) =>
                  set({ tickerScale: Math.min(3, Math.max(0.7, Number(e.target.value) / 100 || 1)) })
                }
                className="rounded-xl"
              />
              <p className="text-xs text-muted-foreground">
                Makes the black bar taller and the running message bigger together. 100 is normal;
                go up to 300 for a much bigger bar (very tall bars start covering the rate card).
              </p>
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Default speed (seconds)
              </Label>
              <Input
                type="number"
                min={8}
                max={120}
                step={1}
                value={s.tickerSpeed}
                // The display floors the scroll duration at 8s, so clamp here to
                // match — values below 8 had no effect; empty no longer jumps to 35.
                onChange={(e) =>
                  set({ tickerSpeed: Math.max(8, Math.min(120, Number(e.target.value) || 8)) })
                }
                className="rounded-xl"
              />
              <p className="text-xs text-muted-foreground">
                Seconds for one message to cross the screen. Lower = faster (minimum 8).
              </p>
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Default message font size
              </Label>
              <Input
                type="number"
                min={8}
                max={80}
                step={1}
                value={s.tickerFontSize}
                onChange={(e) =>
                  set({ tickerFontSize: Math.max(8, Math.min(80, Number(e.target.value) || 18)) })
                }
                className="rounded-xl"
              />
              <p className="text-xs text-muted-foreground">
                Used unless a specific message sets its own size when you create it.
              </p>
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Default message font colour
              </Label>
              <Input
                value={s.tickerFontColor}
                onChange={(e) => set({ tickerFontColor: e.target.value })}
                className="rounded-xl"
              />
              <p className="text-xs text-muted-foreground">
                Used unless a specific message sets its own colour when you create it.
              </p>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <div className="flex items-center justify-between gap-3">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Yellow headline box colours
                </Label>
                {s.tickerHeadlineBgColor || s.tickerHeadlineTextColor ? (
                  <button
                    type="button"
                    onClick={() => set({ tickerHeadlineBgColor: null, tickerHeadlineTextColor: null })}
                    className="rounded-lg border border-border/60 px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted/50"
                  >
                    Reset to default
                  </button>
                ) : null}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Box &amp; border colour</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      aria-label="Headline box colour"
                      value={s.tickerHeadlineBgColor ?? "#FFA300"}
                      onChange={(e) => set({ tickerHeadlineBgColor: e.target.value })}
                      className="h-9 w-11 cursor-pointer rounded-lg border border-border bg-transparent"
                    />
                    <Input
                      value={s.tickerHeadlineBgColor ?? ""}
                      placeholder="Default gold"
                      onChange={(e) => set({ tickerHeadlineBgColor: e.target.value.trim() || null })}
                      className="flex-1 rounded-lg font-mono text-sm"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Letter colour</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      aria-label="Headline letter colour"
                      value={s.tickerHeadlineTextColor ?? "#0D2680"}
                      onChange={(e) => set({ tickerHeadlineTextColor: e.target.value })}
                      className="h-9 w-11 cursor-pointer rounded-lg border border-border bg-transparent"
                    />
                    <Input
                      value={s.tickerHeadlineTextColor ?? ""}
                      placeholder="Default navy"
                      onChange={(e) => set({ tickerHeadlineTextColor: e.target.value.trim() || null })}
                      className="flex-1 rounded-lg font-mono text-sm"
                    />
                  </div>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Box &amp; border colour and letter colour are independent. Blank / Reset = standard
                Unimoni gold box with navy letters. Use the apply rows below to push each colour to
                this branch only, chosen branches, or every branch — without touching the other colour.
              </p>
              {canApplyToAll ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <ColorApplyRow
                    label="Apply box & border colour"
                    scope={borderColorScope}
                    selectedIds={borderColorBranchIds}
                    branches={activeBranches}
                    currentBranchId={branch.id}
                    applying={applyingColor === "border"}
                    onScopeChange={(scope, ids) => {
                      setBorderColorScope(scope);
                      setBorderColorBranchIds(ids);
                    }}
                    onApply={() => void applyHeadlineColor("border")}
                  />
                  <ColorApplyRow
                    label="Apply letter colour"
                    scope={letterColorScope}
                    selectedIds={letterColorBranchIds}
                    branches={activeBranches}
                    currentBranchId={branch.id}
                    applying={applyingColor === "letter"}
                    onScopeChange={(scope, ids) => {
                      setLetterColorScope(scope);
                      setLetterColorBranchIds(ids);
                    }}
                    onApply={() => void applyHeadlineColor("letter")}
                  />
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  Colours save with &quot;Save ticker settings&quot; on this branch.
                </p>
              )}
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
                  Check below to also push the bar look, sizes and logos to other branches.
                </p>
                {canApplyToAll ? (
                  <ApplyToAllCheckbox
                    id="ticker-settings-apply-all-portal"
                    scope={targetScope}
                    selectedBranchIds={selectedBranchIds}
                    branches={branches}
                    currentBranchId={branch.id}
                    onScopeChange={(sel) => {
                      setTargetScope(sel.scope);
                      setSelectedBranchIds(sel.selectedBranchIds);
                    }}
                    description="Copies the ticker bar look and sizes to the selected target branches."
                  />
                ) : null}
                {canApplyToAll ? copyOptions("ticker-portal") : null}
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
        <div className={`${saveSlot ? "xl:hidden " : ""}sticky bottom-3 z-20 space-y-3 rounded-2xl border border-primary/30 bg-background/95 p-3 shadow-lg backdrop-blur`}>
          {canApplyToAll ? (
            <ApplyToAllCheckbox
              id="ticker-settings-apply-all"
              scope={targetScope}
              selectedBranchIds={selectedBranchIds}
              branches={branches}
              currentBranchId={branch.id}
              onScopeChange={(sel) => {
                setTargetScope(sel.scope);
                setSelectedBranchIds(sel.selectedBranchIds);
              }}
              description="Copies the ticker bar look and sizes to the selected target branches."
            />
          ) : null}
          {canApplyToAll ? copyOptions("ticker-inline") : null}
          <div className="flex justify-start">
            <Button className="rounded-xl" disabled={saving} onClick={() => void save()}>
              {saving ? "Saving…" : "Save ticker settings"}
            </Button>
          </div>
        </div>
      </div>
    </ContentPanel>
  );
}
