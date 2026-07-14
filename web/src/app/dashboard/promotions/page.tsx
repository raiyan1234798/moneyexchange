"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { DashboardHeader } from "@/components/layout/dashboard-sidebar";
import { BranchSelector } from "@/components/shared/branch-selector";
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
import { useBranchScope } from "@/lib/hooks/use-branch-scope";
import { updateBranch } from "@/lib/services/branch-service";
import { DEFAULT_BRANCH_SETTINGS, MESSAGE_FONTS } from "@/lib/constants";
import { ADVERT_IMAGE_OPTIONS, compressImageToDataUrl } from "@/lib/image-utils";
import { isYouTubeUrl, normalizeImageLink, normalizeVideoLink } from "@/lib/media-links";
import { isR2UploadConfigured, uploadVideoToR2 } from "@/lib/r2-upload";
import type { BranchSettings } from "@/lib/types";

export default function PromotionsPage() {
  const { user, profile, isSuperAdmin, isAdmin } = useAuth();
  const { branches, effectiveBranchId, setSelectedBranchId } = useBranchScope();
  const isPlatformAdmin = isSuperAdmin || isAdmin;
  const branch = branches.find((b) => b.id === effectiveBranchId);

  const initial = useMemo<BranchSettings>(
    () => ({ ...DEFAULT_BRANCH_SETTINGS, ...(branch?.settings ?? {}) }),
    [branch?.settings],
  );
  const [settings, setSettings] = useState<BranchSettings>(initial);
  const [saving, setSaving] = useState(false);

  // Reseed the form when the selected branch changes — the React-recommended
  // "adjust state during render" pattern (no effect, no cascading render).
  const [loadedBranch, setLoadedBranch] = useState(effectiveBranchId);
  if (loadedBranch !== effectiveBranchId) {
    setLoadedBranch(effectiveBranchId);
    setSettings(initial);
  }

  const s = settings;
  const set = (patch: Partial<BranchSettings>) => setSettings((prev) => ({ ...prev, ...patch }));

  async function save() {
    if (!user || !profile || !effectiveBranchId || !branch) return;
    setSaving(true);
    try {
      await updateBranch(
        effectiveBranchId,
        { logoUrl: branch.logoUrl ?? "", brandingColor: branch.brandingColor ?? "#0D2680", settings },
        { userId: user.uid, userName: profile.displayName || profile.email || "Admin" },
      );
      toast.success("Promotions saved — live on the branch TV");
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
                            (v as "popup" | "fullscreen" | "band" | "video-top" | "rate-card") ?? "popup",
                        })
                      }
                    >
                      <SelectTrigger className="rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="band">Message area — bottom strip</SelectItem>
                        <SelectItem value="video-top">Video — top strip</SelectItem>
                        <SelectItem value="popup">Big pop-up over the video</SelectItem>
                        <SelectItem value="fullscreen">Full screen (whole video area)</SelectItem>
                        <SelectItem value="rate-card">Rate-card panel</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Animation</Label>
                    <Select
                      value={s.announcementAnimation ?? "slide"}
                      onValueChange={(v) =>
                        set({ announcementAnimation: (v as "slide" | "fade" | "zoom" | "flip") ?? "slide" })
                      }
                    >
                      <SelectTrigger className="rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="slide">Slide</SelectItem>
                        <SelectItem value="fade">Fade</SelectItem>
                        <SelectItem value="zoom">Zoom</SelectItem>
                        <SelectItem value="flip">Flip</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Text font</Label>
                    <Select
                      value={s.announcementFont ?? MESSAGE_FONTS[0].key}
                      onValueChange={(v) => set({ announcementFont: v ?? null })}
                    >
                      <SelectTrigger className="rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MESSAGE_FONTS.map((f) => (
                          <SelectItem key={f.key} value={f.key}>
                            {f.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
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
                    <Label>Gap between shows (minutes)</Label>
                    <Input
                      type="number"
                      min={1}
                      max={240}
                      value={s.announcementRepeatMinutes ?? 3}
                      onChange={(e) => set({ announcementRepeatMinutes: Number(e.target.value) })}
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
                <div className="space-y-2">
                  <Label>Promotion image</Label>
                  <div className="flex items-center gap-3">
                    <Input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      aria-label="Upload promotion image"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        try {
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
              </div>
            </ContentPanel>

            <PreviewDisplayLink branchCode={branch.code} />

            <div className="flex justify-end">
              <Button className="rounded-xl" disabled={saving} onClick={() => void save()}>
                {saving ? "Saving…" : "Save promotions"}
              </Button>
            </div>
          </div>
        )}
      </PageShell>
    </>
  );
}
