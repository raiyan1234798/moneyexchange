"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { checkPromoMediaFit, PROMO_IDEAL_TEXT } from "@/lib/promo-fit";
import { DashboardHeader } from "@/components/layout/dashboard-sidebar";
import { ApplyToAllCheckbox } from "@/components/shared/apply-to-all-checkbox";
import { BranchSelector } from "@/components/shared/branch-selector";
import { DisplayAnimationSelect } from "@/components/shared/animation-controls";
import { PreviewDisplayLink } from "@/components/shared/preview-display-link";
import { ContentPanel, PageShell } from "@/components/shared/page-elements";
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
import { useAuth } from "@/contexts/auth-context";
import { canApplyToAllBranches } from "@/lib/branch-isolation";
import { useBranchScope } from "@/lib/hooks/use-branch-scope";
import { updateBranch } from "@/lib/services/branch-service";
import { DEFAULT_BRANCH_SETTINGS, MESSAGE_FONTS } from "@/lib/constants";
import { ADVERT_IMAGE_OPTIONS, LOGO_IMAGE_OPTIONS, compressImageToDataUrl, compressLogoTransparent } from "@/lib/image-utils";
import { isYouTubeUrl, normalizeImageLink, normalizeVideoLink } from "@/lib/media-links";
import { isR2UploadConfigured, uploadVideoToR2 } from "@/lib/r2-upload";
import type { BranchSettings } from "@/lib/types";

export default function PromotionsPage() {
  const { user, profile, isSuperAdmin, isAdmin } = useAuth();
  const { branches, effectiveBranchId, setSelectedBranchId } = useBranchScope();
  const isPlatformAdmin = isSuperAdmin || isAdmin;
  const canApplyToAll = canApplyToAllBranches(profile?.role);
  const branch = branches.find((b) => b.id === effectiveBranchId);
  const activeBranchCount = branches.filter((b) => b.status === "active").length;

  const initial = useMemo<BranchSettings>(
    () => ({ ...DEFAULT_BRANCH_SETTINGS, ...(branch?.settings ?? {}) }),
    [branch?.settings],
  );
  const [settings, setSettings] = useState<BranchSettings>(initial);
  const [saving, setSaving] = useState(false);
  const [applyToAll, setApplyToAll] = useState(false);

  // Reseed the form when the selected branch changes — the React-recommended
  const [targetScope, setTargetScope] = useState<"current" | "specific" | "all">("current");
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>([effectiveBranchId]);

  // "adjust state during render" pattern (no effect, no cascading render).
  const [loadedBranch, setLoadedBranch] = useState(effectiveBranchId);
  if (loadedBranch !== effectiveBranchId) {
    setLoadedBranch(effectiveBranchId);
    setSettings(initial);
    setTargetScope("current");
    setSelectedBranchIds([effectiveBranchId]);
  }

  const s = settings;
  const set = (patch: Partial<BranchSettings>) => setSettings((prev) => ({ ...prev, ...patch }));

  async function save() {
    if (!user || !profile || !effectiveBranchId || !branch) return;
    setSaving(true);
    const actor = { userId: user.uid, userName: profile.displayName || profile.email || "Admin" };
    try {
      await updateBranch(
        effectiveBranchId,
        { logoUrl: branch.logoUrl ?? "", brandingColor: branch.brandingColor ?? "#0D2680", settings },
        actor,
      );

      // Apply promotion look + flip/message animations (+ promo media) to target branches
      if (targetScope !== "current" && canApplyToAll) {
        const targets =
          targetScope === "all"
            ? branches.filter((b) => b.id !== effectiveBranchId && b.status === "active")
            : branches.filter(
                (b) =>
                  b.id !== effectiveBranchId &&
                  b.status === "active" &&
                  selectedBranchIds.includes(b.id),
              );
        // Keep each branch's own logos / announcement / ticker media; copy the
        // promotion slide fields and continuous animation choices.
        const PROMO_SYNC_KEYS: Array<keyof BranchSettings> = [
          "ratePromoEnabled",
          "ratePromoMedia",
          "ratePromoImageUrl",
          "ratePromoText",
          "ratePromoTextTop",
          "ratePromoDurationSeconds",
          "ratePromoMediaFit",
          "ratePromoSoundOn",
          "ratePromoTextScale",
          "ratePromoTextAnimation",
          "ratePromoFont",
          "promoLogoMode",
          "promoSlideLogoUrl",
          "promoSlideLogoScale",
          "promoSlideLogoAnimation",
          "rateCardTransition",
          "slideTransitionSeconds",
          "videoImageTransition",
          "rateTextAnimation",
          "rateCurrencyAnimation",
          "rateFlagAnimation",
          "rateHeadingAnimation",
          "rateAnimationSpeedSeconds",
          "rateAnimationPauseSeconds",
          "headerLogoAnimation",
        ];
        await Promise.all(
          targets.map((b) => {
            const shared: Partial<BranchSettings> = {};
            for (const key of PROMO_SYNC_KEYS) {
              const value = settings[key];
              if (value !== undefined) {
                (shared as Record<string, unknown>)[key] = value;
              }
            }
            return updateBranch(b.id, { settings: { ...b.settings, ...shared } }, actor);
          }),
        );
        toast.success(
          `Promotions + flip/animations applied to ${targets.length + 1} branches`,
          { duration: 8000 },
        );
      } else {
        toast.success("Promotions saved — live on the branch TV");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  if (!isPlatformAdmin) {
    return (
      <>
        <DashboardHeader title="Promotions" accent="amber" />
        <PageShell>
          <ContentPanel title="Admins only" description="Promotions are managed by the admins.">
            <span />
          </ContentPanel>
        </PageShell>
      </>
    );
  }

  return (
    <>
      <DashboardHeader
        title="Promotions"
        description="Per-branch announcements (prize winners, offers) and the rotating promotion card."
        accent="amber"
      />
      <PageShell>
        <div className="mb-4 max-w-md">
          <BranchSelector branches={branches} value={effectiveBranchId} onChange={setSelectedBranchId} />
        </div>

        {!effectiveBranchId || !branch ? (
          <ContentPanel title="Pick a branch" description="Choose a branch above to manage its promotions.">
            <span />
          </ContentPanel>
        ) : (
          <div className="space-y-6">
            {/* ---- Announcement ---- */}
            <ContentPanel
              title="Announcement / display message"
              description="Play text, an image or a video for a set time, then it animates away and the screen returns to normal."
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-4 rounded-xl border border-border/40 p-3">
                  <div>
                    <p className="text-sm font-semibold">Show announcement on the display</p>
                    <p className="text-xs text-muted-foreground">
                      Turn off to hide it from the TV without deleting your text / image / video.
                    </p>
                  </div>
                  <Switch
                    checked={s.announcementEnabled !== false}
                    onCheckedChange={(v) => set({ announcementEnabled: v })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Announcement text</Label>
                  <Input
                    value={s.announcementText ?? ""}
                    onChange={(e) => set({ announcementText: e.target.value || null })}
                    placeholder="CONGRATULATIONS TO OUR SEND & WIN CONTEST WINNERS!"
                    className="rounded-xl"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Image link (direct image, Google Drive, or YouTube)</Label>
                  <Input
                    value={s.announcementImageUrl?.startsWith("data:") ? "" : s.announcementImageUrl ?? ""}
                    disabled={s.announcementImageUrl?.startsWith("data:")}
                    onChange={(e) => set({ announcementImageUrl: normalizeImageLink(e.target.value) || null })}
                    placeholder="https://drive.google.com/file/d/… or an image URL"
                    className="rounded-xl"
                  />
                  <div className="flex items-center gap-3">
                    <Input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      aria-label="Upload announcement image"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        try {
                          const { dataUrl } = await compressImageToDataUrl(file, ADVERT_IMAGE_OPTIONS);
                          set({ announcementImageUrl: dataUrl });
                          toast.success("Image ready — Save to apply");
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : "Could not read image");
                        }
                      }}
                      className="rounded-xl"
                    />
                    {s.announcementImageUrl ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="rounded-lg"
                        onClick={() => set({ announcementImageUrl: null })}
                      >
                        Clear
                      </Button>
                    ) : null}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Video (optional) — link or upload</Label>
                  <Input
                    value={s.announcementVideoUrl ?? ""}
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (isYouTubeUrl(raw)) {
                        set({ announcementVideoUrl: null, announcementImageUrl: normalizeImageLink(raw) });
                        toast.info("YouTube can't play inside the announcement — using its thumbnail image.");
                        return;
                      }
                      set({ announcementVideoUrl: normalizeVideoLink(raw) || null });
                    }}
                    placeholder="Direct MP4/WebM link or Google Drive share link"
                    className="rounded-xl"
                  />
                  <div className="flex items-center gap-3">
                    <Input
                      type="file"
                      accept="video/mp4,video/webm"
                      aria-label="Upload announcement video"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (!isR2UploadConfigured()) {
                          toast.error("Video upload is unavailable — paste a video link instead.");
                          return;
                        }
                        try {
                          toast.info("Uploading announcement video…");
                          const r2 = await uploadVideoToR2(file, effectiveBranchId);
                          set({ announcementVideoUrl: r2.downloadUrl });
                          toast.success("Video ready — Save to apply");
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : "Video upload failed");
                        }
                      }}
                      className="rounded-xl"
                    />
                    {s.announcementVideoUrl ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="rounded-lg"
                        onClick={() => set({ announcementVideoUrl: null })}
                      >
                        Clear video
                      </Button>
                    ) : null}
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Where it appears</Label>
                    <Select
                      value={s.announcementStyle ?? "popup"}
                      onValueChange={(v) =>
                        set({
                          announcementStyle:
                            (v as
                              | "popup"
                              | "fullscreen"
                              | "band"
                              | "video-top"
                              | "rate-card"
                              | "lower-third") ?? "lower-third",
                        })
                      }
                    >
                      <SelectTrigger className="rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent style={{ width: "max-content", minWidth: "var(--anchor-width)", maxWidth: "28rem" }}>
                        <SelectItem value="lower-third">Lower third — broadcast caption (recommended)</SelectItem>
                        <SelectItem value="video-top">Video — top strip (L-band)</SelectItem>
                        <SelectItem value="band">Message area — bottom strip</SelectItem>
                        <SelectItem value="fullscreen">Full screen (video area)</SelectItem>
                        <SelectItem value="rate-card">Rate-card panel</SelectItem>
                        <SelectItem value="popup">Centered card (classic pop-up)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Animation</Label>
                    <Select
                      value={s.announcementAnimation ?? "slide"}
                      onValueChange={(v) =>
                        set({
                          announcementAnimation: (v as "none" | "slide" | "fade" | "zoom" | "flip") ?? "slide",
                        })
                      }
                    >
                      <SelectTrigger className="rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None (instant)</SelectItem>
                        <SelectItem value="slide">Slide</SelectItem>
                        <SelectItem value="fade">Fade</SelectItem>
                        <SelectItem value="zoom">Zoom</SelectItem>
                        <SelectItem value="flip">Flip (3D card turn)</SelectItem>
                      </SelectContent>
                    </Select>
                </div>
                <div className="space-y-2">
                  <Label>Text movement (while visible)</Label>
                  <DisplayAnimationSelect
                    value={s.announcementTextAnimation ?? "none"}
                    onChange={(value) =>
                      set({ announcementTextAnimation: value === "none" ? null : value })
                    }
                  />                  </div>
                  <div className="space-y-2">
                    <Label>Text colour</Label>
                    <Select
                      value={s.announcementColorStyle ?? "white"}
                      onValueChange={(v) =>
                        set({ announcementColorStyle: (v as "white" | "logo" | "gold" | "navy") ?? "white" })
                      }
                    >
                      <SelectTrigger className="rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="white">White</SelectItem>
                        <SelectItem value="logo">Unimoni logo colours (blue → gold)</SelectItem>
                        <SelectItem value="gold">Gold</SelectItem>
                        <SelectItem value="navy">Navy blue</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Announcement text size (%)</Label>
                    <Input
                      type="number"
                      min={50}
                      max={300}
                      step={10}
                      value={Math.round((s.announcementTextScale ?? 1) * 100)}
                      onChange={(e) =>
                        set({
                          announcementTextScale: Math.min(3, Math.max(0.5, Number(e.target.value) / 100 || 1)),
                        })
                      }
                      className="rounded-xl"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Visible for (seconds)</Label>
                    <Input
                      type="number"
                      min={2}
                      max={120}
                      value={s.announcementSeconds ?? 5}
                      onChange={(e) => set({ announcementSeconds: Number(e.target.value) })}
                      className="rounded-xl"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Gap between shows (seconds)</Label>
                    <Input
                      type="number"
                      min={1}
                      max={14400}
                      value={
                        s.announcementRepeatSeconds ??
                        Math.round((s.announcementRepeatMinutes ?? 3) * 60)
                      }
                      onChange={(e) =>
                        set({ announcementRepeatSeconds: Math.max(1, Number(e.target.value) || 1) })
                      }
                      className="rounded-xl"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>How many times</Label>
                    <Select
                      value={s.announcementPlayMode ?? "repeat"}
                      onValueChange={(v) => set({ announcementPlayMode: (v as "repeat" | "times") ?? "repeat" })}
                    >
                      <SelectTrigger className="rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="repeat">Repeat forever</SelectItem>
                        <SelectItem value="times">A set number of times, then stop</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {(s.announcementPlayMode ?? "repeat") === "times" ? (
                    <div className="space-y-2">
                      <Label>Number of times</Label>
                      <Input
                        type="number"
                        min={1}
                        max={50}
                        value={s.announcementPlayTimes ?? 1}
                        onChange={(e) => set({ announcementPlayTimes: Number(e.target.value) })}
                        className="rounded-xl"
                      />
                    </div>
                  ) : null}
                </div>
              </div>
            </ContentPanel>

            {/* ---- Promotion card in the rate rotation ---- */}
            <ContentPanel
              title="Promotion card (rate rotation)"
              description="An image and/or message that appears as its own screen in the rate-card rotation. Leave empty to hide."
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-4 rounded-xl border border-border/40 p-3">
                  <div>
                    <p className="text-sm font-semibold">Show the promotion slide on the TV</p>
                    <p className="text-xs text-muted-foreground">
                      Turn off to hide it from the rotation without deleting your images/videos/text.
                    </p>
                  </div>
                  <Switch
                    checked={s.ratePromoEnabled !== false}
                    onCheckedChange={(v) => set({ ratePromoEnabled: v })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Promotion image</Label>
                  <p className="text-xs text-muted-foreground">
                    Best size: <span className="font-semibold">{PROMO_IDEAL_TEXT}</span> — that
                    shape fills the whole promo area perfectly.
                  </p>
                  <div className="flex items-center gap-3">
                    <Input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      aria-label="Upload promotion image"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        try {
                          // Warn (never block) when the shape won't fill the tall
                          // promo area without stretching.
                          const fit = await checkPromoMediaFit(file);
                          if (fit) toast.warning(fit, { duration: 12000 });
                          const { dataUrl } = await compressImageToDataUrl(file, ADVERT_IMAGE_OPTIONS);
                          set({ ratePromoImageUrl: dataUrl });
                          toast.success("Promotion image ready — Save to apply");
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : "Could not read image");
                        }
                      }}
                      className="rounded-xl"
                    />
                    {s.ratePromoImageUrl ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="rounded-lg"
                        onClick={() => set({ ratePromoImageUrl: null })}
                      >
                        Clear
                      </Button>
                    ) : null}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Image / video fit on the promo card</Label>
                  <Select
                    value={s.ratePromoMediaFit ?? "fill"}
                    onValueChange={(v) => set({ ratePromoMediaFit: (v as "fill" | "cover" | "contain") ?? "fill" })}
                  >
                    <SelectTrigger className="rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fill">Stretch to fill — no gaps, nothing cut (default)</SelectItem>
                      <SelectItem value="cover">Zoom to fill — no gaps, edges may be cut</SelectItem>
                      <SelectItem value="contain">Show the whole picture — may leave blue bands</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    A {PROMO_IDEAL_TEXT} upload fills perfectly with any of these.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Promotion message (optional)</Label>
                  <Input
                    value={s.ratePromoText ?? ""}
                    onChange={(e) => set({ ratePromoText: e.target.value || null })}
                    placeholder="e.g. ZERO FEES ON BANK TRANSFERS"
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Promotion card duration (seconds)</Label>
                  <Input
                    type="number"
                    min={2}
                    max={60}
                    value={s.ratePromoDurationSeconds ?? 6}
                    onChange={(e) => set({ ratePromoDurationSeconds: Number(e.target.value) })}
                    className="rounded-xl sm:max-w-[200px]"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Promotion video sound (rate card)</Label>
                  <Select
                    value={s.ratePromoSoundOn == null ? "inherit" : s.ratePromoSoundOn ? "on" : "off"}
                    onValueChange={(value) =>
                      set({ ratePromoSoundOn: value === "inherit" ? null : value === "on" })
                    }
                  >
                    <SelectTrigger className="rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="inherit">Same as “Play video sound” (default)</SelectItem>
                      <SelectItem value="on">Sound ON for promotion videos</SelectItem>
                      <SelectItem value="off">Always muted</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Audio for videos on the promotion slide. Browsers keep sound off until the
                    screen has been tapped or made fullscreen once.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Logo on the promotion slide</Label>
                  <Select
                    value={s.promoLogoMode === "second" ? "second" : "hide"}
                    onValueChange={(value) =>
                      set({ promoLogoMode: (value as "keep" | "hide" | "second") ?? "hide" })
                    }
                  >
                    <SelectTrigger className="rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hide">No logo — the promotion fills the whole card (default)</SelectItem>
                      <SelectItem value="second">
                        Show a logo bar (promo logo below → alternate → main → unimoni)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Promotion-slide logo (optional — a DIFFERENT logo during the promo)</Label>
                  <div className="flex items-center gap-3">
                    <Input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/svg+xml,.png,.jpg,.jpeg,.webp,.svg"
                      aria-label="Upload promotion-slide logo"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        try {
                          const { dataUrl } = await compressLogoTransparent(file, LOGO_IMAGE_OPTIONS, "dark");
                          set({ promoSlideLogoUrl: dataUrl });
                          toast.success("Promotion-slide logo ready — Save to apply");
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : "Could not read image");
                        }
                      }}
                      className="rounded-xl"
                    />
                    {s.promoSlideLogoUrl ? (
                      <div className="flex shrink-0 items-center gap-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={s.promoSlideLogoUrl}
                          alt="Promotion-slide logo preview"
                          className="h-9 w-16 shrink-0 rounded-md bg-[#0D2680] object-contain p-1"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="rounded-lg"
                          onClick={() => set({ promoSlideLogoUrl: null })}
                        >
                          Clear
                        </Button>
                      </div>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Shown in the logo bar only while the promotion plays. A white/solid background
                    is removed automatically on upload. Falls back to the alternate/main logo when
                    empty.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Promotion-slide logo size (%)</Label>
                  <Input
                    type="number"
                    min={50}
                    max={300}
                    step={10}
                    value={Math.round((s.promoSlideLogoScale ?? 1) * 100)}
                    onChange={(e) =>
                      set({
                        promoSlideLogoScale: Math.min(3, Math.max(0.5, Number(e.target.value) / 100 || 1)),
                      })
                    }
                    className="rounded-xl sm:max-w-[200px]"
                  />
                  <p className="text-xs text-muted-foreground">
                    Make the logo on the promotion slide bigger or smaller (100% = normal).
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Promotion-slide logo animation</Label>
                  <DisplayAnimationSelect
                    value={s.promoSlideLogoAnimation ?? "__inherit"}
                    onChange={(value) =>
                      set({ promoSlideLogoAnimation: value === "__inherit" ? null : value })
                    }
                    allowInherit
                  />
                </div>
                <div className="space-y-2">
                  <Label>Promotion message font</Label>
                  <Select
                    value={s.ratePromoFont ?? "__master"}
                    onValueChange={(value) =>
                      set({ ratePromoFont: value === "__master" ? null : value })
                    }
                  >
                    <SelectTrigger className="rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__master">Use display font (whole-screen font)</SelectItem>
                      {MESSAGE_FONTS.map((f) => (
                        <SelectItem key={f.key} value={f.key} style={{ fontFamily: f.css }}>
                          {f.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Promotion message size (%)</Label>
                  <Input
                    type="number"
                    min={50}
                    max={300}
                    step={10}
                    value={Math.round((s.ratePromoTextScale ?? 1) * 100)}
                    onChange={(e) =>
                      set({ ratePromoTextScale: Math.min(3, Math.max(0.5, Number(e.target.value) / 100 || 1)) })
                    }
                    className="rounded-xl sm:max-w-[200px]"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Promotion text movement</Label>
                  <DisplayAnimationSelect
                    value={s.ratePromoTextAnimation ?? "none"}
                    onChange={(value) =>
                      set({ ratePromoTextAnimation: value === "none" ? null : value })
                    }
                  />
                </div>
              </div>
            </ContentPanel>

            <PreviewDisplayLink branchCode={branch.code} />

            <div className="space-y-3">
              {canApplyToAll ? (
                <ApplyToAllCheckbox
                  id="promotions-apply-all"
                  scope={targetScope}
                  selectedBranchIds={selectedBranchIds}
                  branches={branches}
                  currentBranchId={effectiveBranchId}
                  onScopeChange={(sel) => {
                    setTargetScope(sel.scope);
                    setSelectedBranchIds(sel.selectedBranchIds);
                  }}
                  description="Copies this promotion slide, message movement, and related animation timings to the selected target branches."
                />
              ) : null}
              <div className="flex justify-end">
                <Button className="rounded-xl" disabled={saving} onClick={() => void save()}>
                  {saving ? "Saving…" : applyToAll ? "Save to all branches" : "Save promotions"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </PageShell>
    </>
  );
}
