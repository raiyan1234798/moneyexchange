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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { db } from "@/lib/firebase/client";
import { createDocument } from "@/lib/firebase/firestore";
import { COLLECTIONS, DEFAULT_SYSTEM_SETTINGS, MESSAGE_FONTS, messageFontCss } from "@/lib/constants";
import { ADVERT_IMAGE_OPTIONS, LOGO_IMAGE_OPTIONS, compressImageToDataUrl } from "@/lib/image-utils";
import { isYouTubeUrl, normalizeImageLink, normalizeVideoLink } from "@/lib/media-links";
import { isR2UploadConfigured, uploadVideoToR2 } from "@/lib/r2-upload";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { updateBranch } from "@/lib/services/branch-service";
import type { BranchSettings, RateCardPosition, SystemSettings } from "@/lib/types";

const SETTINGS_ID = "global";

function BranchSettingsForm({
  branchId,
  branchName,
  initialLogoUrl,
  initialColor,
  initialSettings,
  saving,
  onSave,
}: {
  branchId: string;
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
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [promoLinkInput, setPromoLinkInput] = useState("");

  // Promo gallery: the legacy single image migrates into the media list on any edit.
  type PromoItem = { type: "image" | "video"; url: string };
  const legacyPromo = (s: BranchSettings): PromoItem[] =>
    s.ratePromoImageUrl ? [{ type: "image", url: s.ratePromoImageUrl }] : [];
  const promoMediaList: PromoItem[] = [...legacyPromo(settings), ...(settings.ratePromoMedia ?? [])];
  const addPromoMedia = (item: PromoItem) =>
    setSettings((s) => ({
      ...s,
      ratePromoImageUrl: null,
      ratePromoMedia: [...legacyPromo(s), ...(s.ratePromoMedia ?? []), item],
    }));
  const removePromoMedia = (idx: number) =>
    setSettings((s) => {
      const list = [...legacyPromo(s), ...(s.ratePromoMedia ?? [])];
      list.splice(idx, 1);
      return { ...s, ratePromoImageUrl: null, ratePromoMedia: list };
    });

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
        <Label>Ticker Logo (pop-out breaking-news badge)</Label>
        <p className="text-xs text-muted-foreground">
          Leave blank to show the real animated unimoni logo. Paste an image URL or upload a file to
          use a custom logo.
        </p>
        <Input
          value={settings.tickerLogoUrl?.startsWith("data:") ? "" : settings.tickerLogoUrl ?? ""}
          onChange={(event) => setSettings({ ...settings, tickerLogoUrl: event.target.value || null })}
          placeholder="https://example.com/logo.png — or upload below"
          disabled={settings.tickerLogoUrl?.startsWith("data:")}
          className="rounded-xl"
        />
        <div className="flex items-center gap-3">
          <Input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml,.png,.jpg,.jpeg,.webp,.svg"
            aria-label="Upload ticker logo image"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              try {
                const { dataUrl } = await compressImageToDataUrl(file, LOGO_IMAGE_OPTIONS);
                setSettings({ ...settings, tickerLogoUrl: dataUrl });
                toast.success("Logo image ready — click Save Branch Settings to apply");
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Could not read image");
              }
            }}
            className="rounded-xl"
          />
          {settings.tickerLogoUrl ? (
            <div className="flex shrink-0 items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={settings.tickerLogoUrl}
                alt="Logo preview"
                className="h-9 w-14 shrink-0 rounded-md bg-slate-800 object-contain p-1"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-lg"
                onClick={() => setSettings({ ...settings, tickerLogoUrl: null })}
              >
                Clear
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      {/* Rebrand: custom logo for the rate-card header (overrides the unimoni logo). */}
      <div className="space-y-2">
        <Label>Brand logo — rate-card header (rebrand)</Label>
        <p className="text-xs text-muted-foreground">
          Upload your logo (PNG with transparency works best on the blue header). Leave blank to keep
          the unimoni logo.
        </p>
        <div className="flex items-center gap-3">
          <Input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml,.png,.jpg,.jpeg,.webp,.svg"
            aria-label="Upload header brand logo"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              try {
                const { dataUrl } = await compressImageToDataUrl(file, LOGO_IMAGE_OPTIONS);
                setSettings({ ...settings, headerLogoUrl: dataUrl });
                toast.success("Header logo ready — click Save Branch Settings to apply");
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Could not read image");
              }
            }}
            className="rounded-xl"
          />
          {settings.headerLogoUrl ? (
            <div className="flex shrink-0 items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={settings.headerLogoUrl}
                alt="Header logo preview"
                className="h-9 w-16 shrink-0 rounded-md bg-[#0D2680] object-contain p-1"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-lg"
                onClick={() => setSettings({ ...settings, headerLogoUrl: null })}
              >
                Clear
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      {/* Extra logos that scroll right-to-left in the ticker with the message text. */}
      <div className="space-y-2">
        <Label>Scrolling ticker logos</Label>
        <p className="text-xs text-muted-foreground">
          Upload logos to scroll alongside the ticker text (right to left). Add as many as you like.
        </p>
        <Input
          type="file"
          multiple
          accept="image/png,image/jpeg,image/webp,image/svg+xml,.png,.jpg,.jpeg,.webp,.svg"
          aria-label="Upload scrolling ticker logos"
          onChange={async (event) => {
            const files = Array.from(event.target.files ?? []);
            if (files.length === 0) return;
            try {
              const urls: string[] = [];
              for (const file of files) {
                const { dataUrl } = await compressImageToDataUrl(file, LOGO_IMAGE_OPTIONS);
                urls.push(dataUrl);
              }
              setSettings({ ...settings, scrollingLogos: [...(settings.scrollingLogos ?? []), ...urls] });
              toast.success(`${urls.length} logo(s) added — click Save Branch Settings to apply`);
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Could not read image");
            }
          }}
          className="rounded-xl"
        />
        {(settings.scrollingLogos ?? []).length > 0 ? (
          <div className="flex flex-wrap gap-2 pt-1">
            {(settings.scrollingLogos ?? []).map((src, i) => (
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
                    setSettings({
                      ...settings,
                      scrollingLogos: (settings.scrollingLogos ?? []).filter((_, idx) => idx !== i),
                    })
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

      <div className="space-y-2">
        <Label>Rate Card Position</Label>
        <Select
          value={settings.rateCardPosition ?? "right"}
          onValueChange={(value) =>
            setSettings({ ...settings, rateCardPosition: value as RateCardPosition })
          }
        >
          <SelectTrigger className="rounded-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="right">Video left, rates right (default)</SelectItem>
            <SelectItem value="left">Rates left, video right</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Rate Card Display Duration (seconds, 0 = always show)</Label>
        <Input
          type="number"
          min={0}
          value={settings.rateCardDisplaySeconds ?? 0}
          onChange={(event) =>
            setSettings({ ...settings, rateCardDisplaySeconds: Number(event.target.value) })
          }
          className="rounded-xl"
        />
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
        <div>
          <Label>Show &quot;breaking&quot; headline tab</Label>
          <p className="text-xs text-muted-foreground">
            The small gold tab above the ticker (e.g. &quot;WELCOME TO UNIMONI EXCHANGE&quot;). Turn off
            to remove it.
          </p>
        </div>
        <Switch
          checked={settings.showTickerHeadline !== false}
          onCheckedChange={(checked) => setSettings({ ...settings, showTickerHeadline: checked })}
        />
      </div>
      <div className="space-y-2">
        <Label>Headline tab text</Label>
        <Input
          value={settings.tickerHeadline ?? ""}
          onChange={(event) => setSettings({ ...settings, tickerHeadline: event.target.value || null })}
          placeholder="Leave blank to use the first ticker message / branch name"
          disabled={settings.showTickerHeadline === false}
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
      <div className="flex items-center justify-between rounded-xl border border-border/30 p-4">
        <div>
          <Label>Separate TRANSFER card on Display</Label>
          <p className="text-xs text-muted-foreground">
            Rotates in its own &quot;TRANSFER EXCHANGE RATES&quot; card with two columns — $ (USD) and
            the local currency — for currencies that have transfer rates set.
          </p>
        </div>
        <Switch
          checked={settings.showTransferCard !== false}
          onCheckedChange={(checked) => setSettings({ ...settings, showTransferCard: checked })}
        />
      </div>
      <div className="space-y-2">
        <Label>Transfer card — local currency label</Label>
        <Input
          value={settings.transferLocalLabel ?? "UGX"}
          onChange={(event) => setSettings({ ...settings, transferLocalLabel: event.target.value })}
          placeholder="UGX"
          className="rounded-xl"
        />
        <p className="text-xs text-muted-foreground">
          Header for the second transfer column (the branch&apos;s local currency). The first column is
          always $ (USD).
        </p>
      </div>
      <div className="space-y-2">
        <Label>Rate card note (WE BUY @ …)</Label>
        <Input
          value={settings.rateCardNote ?? ""}
          onChange={(event) =>
            setSettings({ ...settings, rateCardNote: event.target.value.toUpperCase() || null })
          }
          placeholder="WE BUY US $ SMALL BILLS 20,10,5,2 & 1 @3300"
          className="rounded-xl"
        />
        <div className="pt-1">
          <Label className="mb-1 block text-xs">Show the note on</Label>
          <Select
            value={settings.rateNotePlacement ?? "first"}
            onValueChange={(value) =>
              setSettings({ ...settings, rateNotePlacement: (value as "first" | "all") ?? "first" })
            }
          >
            <SelectTrigger className="rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="first">The first forex rate page only</SelectItem>
              <SelectItem value="all">Every forex rate page</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-muted-foreground">
          Bold text at the bottom of the forex rates. It follows the forex page wherever you put it in
          the slide order — so it appears even when transfer or promo is first. Leave blank to hide it.
        </p>
      </div>

      {/* ---- Rate-screen sequence timing (per the client: 3s / 6s / 10s, manual) ---- */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Rate screen duration (seconds)</Label>
          <Input
            type="number"
            min={2}
            max={60}
            value={settings.rateSheetIntervalSeconds ?? 5}
            onChange={(event) =>
              setSettings({ ...settings, rateSheetIntervalSeconds: Number(event.target.value) })
            }
            className="rounded-xl"
          />
          <p className="text-xs text-muted-foreground">
            How long each rotating rate screen stays (forex pages, transfer card) — e.g. 3, 6, 10.
          </p>
        </div>
        <div className="space-y-2">
          <Label>Promotion card duration (seconds)</Label>
          <Input
            type="number"
            min={2}
            max={120}
            value={settings.ratePromoDurationSeconds ?? settings.rateSheetIntervalSeconds ?? 5}
            onChange={(event) =>
              setSettings({ ...settings, ratePromoDurationSeconds: Number(event.target.value) })
            }
            className="rounded-xl"
          />
          <p className="text-xs text-muted-foreground">
            How long the promotion card (below) stays on screen in the rotation.
          </p>
        </div>
      </div>

      {/* ---- Promotion card in the rate-card rotation ---- */}
      <div className="rounded-xl border border-primary/20 bg-primary/[0.03] p-4">
        <p className="mb-1 text-sm font-semibold">Promotion card (rate-card rotation)</p>
        <p className="mb-4 text-xs text-muted-foreground">
          Add a message above and/or below the image — it appears as its own screen in the rate-card
          rotation. With no text the image fills the whole card; leave everything empty to hide it.
        </p>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Message ABOVE the image (optional)</Label>
            <Input
              value={settings.ratePromoTextTop ?? ""}
              onChange={(event) =>
                setSettings({ ...settings, ratePromoTextTop: event.target.value || null })
              }
              placeholder="e.g. HI UNIMONI !"
              className="rounded-xl"
            />
          </div>
          <div className="space-y-2">
            <Label>Images &amp; videos — each rotates as its own screen</Label>
            <Input
              type="file"
              accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
              multiple
              aria-label="Upload promotion images"
              onChange={async (event) => {
                const files = Array.from(event.target.files ?? []);
                let added = 0;
                for (const file of files) {
                  try {
                    const { dataUrl } = await compressImageToDataUrl(file, ADVERT_IMAGE_OPTIONS);
                    addPromoMedia({ type: "image", url: dataUrl });
                    added += 1;
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Could not read an image");
                  }
                }
                if (added) toast.success(`${added} image(s) added — Save Branch Settings to apply`);
                event.target.value = "";
              }}
              className="rounded-xl"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={promoLinkInput}
                onChange={(event) => setPromoLinkInput(event.target.value)}
                placeholder="Paste an image or video link (Drive / YouTube ok)"
                className="min-w-[12rem] flex-1 rounded-xl"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-lg"
                onClick={() => {
                  const raw = promoLinkInput.trim();
                  if (!raw) return;
                  addPromoMedia({ type: "image", url: normalizeImageLink(raw) });
                  setPromoLinkInput("");
                }}
              >
                + Image
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-lg"
                onClick={() => {
                  const raw = promoLinkInput.trim();
                  if (!raw) return;
                  if (isYouTubeUrl(raw)) {
                    addPromoMedia({ type: "image", url: normalizeImageLink(raw) });
                    toast.info("YouTube can't stream here — added its thumbnail image instead.");
                  } else {
                    addPromoMedia({ type: "video", url: normalizeVideoLink(raw) || raw });
                  }
                  setPromoLinkInput("");
                }}
              >
                + Video
              </Button>
            </div>
            {promoMediaList.length ? (
              <div className="flex flex-wrap gap-2 pt-1">
                {promoMediaList.map((m, i) => (
                  <div key={`${m.url}-${i}`} className="relative">
                    {m.type === "video" ? (
                      <div className="flex h-14 w-20 items-center justify-center rounded-md bg-slate-800 text-[10px] font-semibold text-white ring-1 ring-border">
                        🎬 Video
                      </div>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={m.url}
                        alt="Promotion item"
                        className="h-14 w-20 rounded-md bg-white object-contain p-1 ring-1 ring-border"
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => removePromoMedia(i)}
                      aria-label="Remove this promotion item"
                      className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-xs font-bold text-white shadow"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
            <p className="text-xs text-muted-foreground">
              Add several images and/or videos — they rotate one after another. Videos play muted.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Message BELOW the image (optional)</Label>
            <Input
              value={settings.ratePromoText ?? ""}
              onChange={(event) =>
                setSettings({ ...settings, ratePromoText: event.target.value || null })
              }
              placeholder="e.g. ZERO FEES ON BANK TRANSFERS THIS WEEK!"
              className="rounded-xl"
            />
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Rate-card slide order</Label>
        <Select
          value={(settings.rateCardOrder ?? ["forex", "transfer", "promo"]).join(",")}
          onValueChange={(value) =>
            setSettings({
              ...settings,
              rateCardOrder: (value ?? "forex,transfer,promo").split(",") as Array<
                "forex" | "transfer" | "promo"
              >,
            })
          }
        >
          <SelectTrigger className="rounded-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="forex,transfer,promo">Forex → Transfer → Promotion (default)</SelectItem>
            <SelectItem value="transfer,forex,promo">Transfer → Forex → Promotion</SelectItem>
            <SelectItem value="promo,forex,transfer">Promotion → Forex → Transfer</SelectItem>
            <SelectItem value="forex,promo,transfer">Forex → Promotion → Transfer</SelectItem>
            <SelectItem value="transfer,promo,forex">Transfer → Promotion → Forex</SelectItem>
            <SelectItem value="promo,transfer,forex">Promotion → Transfer → Forex</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Which slide the rotating rate card shows first, then next. Slides with no content are skipped.
        </p>
      </div>

      {/* ---- ONE font for the whole screen ---- */}
      <div className="space-y-2 rounded-xl border border-primary/25 bg-primary/[0.04] p-4">
        <Label className="text-base">Display font — changes ALL text on the TV</Label>
        <p className="text-xs text-muted-foreground">
          One font for the whole screen: the rate card (WE BUY / WE SELL, currency codes and every
          number), the scrolling message, the announcement, and the logo text — all at once.
        </p>
        <Select
          value={settings.displayFont ?? MESSAGE_FONTS[0].key}
          onValueChange={(value) => setSettings({ ...settings, displayFont: value ?? null })}
        >
          <SelectTrigger className="rounded-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MESSAGE_FONTS.map((f) => (
              <SelectItem key={f.key} value={f.key} style={{ fontFamily: f.css }}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="rounded-lg bg-[#0D2680] px-3 py-2" style={{ fontFamily: messageFontCss(settings.displayFont) }}>
          <span className="block text-sm font-bold uppercase tracking-wide text-white">
            Exchange Rates · USD 3650 / 3680
          </span>
          <span className="block text-xs font-semibold uppercase tracking-wide text-white/80">
            Welcome to Unimoni · We Buy US $ Small Bills
          </span>
        </div>
      </div>

      {/* ---- Pop-up announcement over the video area (admin-only) ---- */}
      <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.04] p-4">
        <p className="mb-1 text-sm font-semibold">Announcement / display message</p>
        <p className="mb-4 text-xs text-muted-foreground">
          Play an announcement (text, image or video) for a set time, then it animates away and the
          screen returns to normal — repeating on the interval you choose. Show it in the message
          area (bottom strip), as a big pop-up over the video, or full screen. Leave empty to turn it off.
        </p>
        <div className="mb-4 flex items-center justify-between rounded-xl border border-border/30 p-3">
          <div>
            <Label>Show announcement on the display</Label>
            <p className="text-xs text-muted-foreground">
              Turn off to hide it from the TV without deleting your text/image/video — switch it back on anytime.
            </p>
          </div>
          <Switch
            checked={settings.announcementEnabled !== false}
            onCheckedChange={(checked) => setSettings({ ...settings, announcementEnabled: checked })}
          />
        </div>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Announcement text</Label>
            <Input
              value={settings.announcementText ?? ""}
              onChange={(event) =>
                setSettings({ ...settings, announcementText: event.target.value || null })
              }
              placeholder="CONGRATULATIONS TO OUR SEND & WIN CONTEST WINNERS!"
              className="rounded-xl"
            />
          </div>
          <div className="space-y-2">
            <Label>Image link (paste any link — direct image, Google Drive, or YouTube)</Label>
            <Input
              value={
                settings.announcementImageUrl?.startsWith("data:")
                  ? ""
                  : settings.announcementImageUrl ?? ""
              }
              onChange={(event) =>
                setSettings({
                  ...settings,
                  announcementImageUrl: normalizeImageLink(event.target.value) || null,
                })
              }
              placeholder="https://drive.google.com/file/d/… or https://youtu.be/… or image URL"
              disabled={settings.announcementImageUrl?.startsWith("data:")}
              className="rounded-xl"
            />
            <p className="text-xs text-muted-foreground">
              Drive links convert automatically; YouTube links use the video&apos;s thumbnail image.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Input
              type="file"
              accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
              aria-label="Upload announcement image"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                try {
                  const { dataUrl } = await compressImageToDataUrl(file, LOGO_IMAGE_OPTIONS);
                  setSettings({ ...settings, announcementImageUrl: dataUrl });
                  toast.success("Announcement image ready — save to apply");
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Could not read image");
                }
              }}
              className="rounded-xl"
            />
            {settings.announcementImageUrl ? (
              <div className="flex shrink-0 items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={settings.announcementImageUrl}
                  alt="Announcement preview"
                  className="h-10 w-14 shrink-0 rounded-md bg-white object-contain p-1 ring-1 ring-border"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-lg"
                  onClick={() => setSettings({ ...settings, announcementImageUrl: null })}
                >
                  Clear
                </Button>
              </div>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label>Video (optional) — link or upload</Label>
            <Input
              value={settings.announcementVideoUrl ?? ""}
              onChange={(event) => {
                const raw = event.target.value;
                if (isYouTubeUrl(raw)) {
                  // YouTube can't stream inside the pop-up — use its thumbnail image.
                  setSettings({
                    ...settings,
                    announcementVideoUrl: null,
                    announcementImageUrl: normalizeImageLink(raw),
                  });
                  toast.info("YouTube can't play inside the pop-up — using the video's thumbnail image instead.");
                  return;
                }
                setSettings({ ...settings, announcementVideoUrl: normalizeVideoLink(raw) || null });
              }}
              placeholder="Direct MP4/WebM link or Google Drive share link"
              className="rounded-xl"
            />
            <div className="flex items-center gap-3">
              <Input
                type="file"
                accept="video/mp4,video/webm,.mp4,.webm"
                aria-label="Upload announcement video"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  if (!isR2UploadConfigured()) {
                    toast.error("Video upload is unavailable — paste a video link instead.");
                    return;
                  }
                  try {
                    toast.info("Uploading announcement video…");
                    const r2 = await uploadVideoToR2(file, branchId);
                    setSettings({ ...settings, announcementVideoUrl: r2.downloadUrl });
                    toast.success("Video ready — click Save Branch Settings to apply");
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Video upload failed");
                  }
                }}
                className="rounded-xl"
              />
              {settings.announcementVideoUrl ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-lg"
                  onClick={() => setSettings({ ...settings, announcementVideoUrl: null })}
                >
                  Clear video
                </Button>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">
              Keep it short — the pop-up shows for a few seconds. Video plays muted.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Where it appears</Label>
            <Select
              value={settings.announcementStyle ?? "popup"}
              onValueChange={(value) =>
                setSettings({
                  ...settings,
                  announcementStyle:
                    (value as "popup" | "fullscreen" | "band" | "video-top" | "rate-card") ?? "popup",
                })
              }
            >
              <SelectTrigger className="rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="lower-third">Lower third — broadcast caption over the video (recommended, looks native)</SelectItem>
                <SelectItem value="video-top">Video — top strip (like an L-band)</SelectItem>
                <SelectItem value="band">Message area — bottom strip (below the video)</SelectItem>
                <SelectItem value="fullscreen">Full screen — cinematic takeover of the video area</SelectItem>
                <SelectItem value="rate-card">Rate-card panel (over the rates)</SelectItem>
                <SelectItem value="popup">Centered card (classic pop-up)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Animation</Label>
            <Select
              value={settings.announcementAnimation ?? "slide"}
              onValueChange={(value) =>
                setSettings({
                  ...settings,
                  announcementAnimation: (value as "none" | "slide" | "fade" | "zoom" | "flip") ?? "slide",
                })
              }
            >
              <SelectTrigger className="rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None — appears instantly (no animation)</SelectItem>
                <SelectItem value="slide">Slide in / out</SelectItem>
                <SelectItem value="fade">Fade in / out</SelectItem>
                <SelectItem value="zoom">Zoom in / out</SelectItem>
                <SelectItem value="flip">Flip</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              How the announcement enters and leaves — pick “None” for no motion. Applies to every placement.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Text colour</Label>
              <Select
                value={settings.announcementColorStyle ?? "white"}
                onValueChange={(value) =>
                  setSettings({
                    ...settings,
                    announcementColorStyle: (value as "white" | "logo" | "gold" | "navy") ?? "white",
                  })
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
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Visible for (seconds)</Label>
              <Input
                type="number"
                min={2}
                max={120}
                value={settings.announcementSeconds ?? 5}
                onChange={(event) =>
                  setSettings({ ...settings, announcementSeconds: Number(event.target.value) })
                }
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label>Gap between shows (minutes)</Label>
              <Input
                type="number"
                min={1}
                max={240}
                value={settings.announcementRepeatMinutes ?? 3}
                onChange={(event) =>
                  setSettings({ ...settings, announcementRepeatMinutes: Number(event.target.value) })
                }
                className="rounded-xl"
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>How many times</Label>
              <Select
                value={settings.announcementPlayMode ?? "repeat"}
                onValueChange={(value) =>
                  setSettings({
                    ...settings,
                    announcementPlayMode: (value as "repeat" | "times") ?? "repeat",
                  })
                }
              >
                <SelectTrigger className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="repeat">Repeat forever (on the gap above)</SelectItem>
                  <SelectItem value="times">Play a set number of times, then stop</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(settings.announcementPlayMode ?? "repeat") === "times" ? (
              <div className="space-y-2">
                <Label>Number of times</Label>
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={settings.announcementPlayTimes ?? 1}
                  onChange={(event) =>
                    setSettings({ ...settings, announcementPlayTimes: Number(event.target.value) })
                  }
                  className="rounded-xl"
                />
                <p className="text-xs text-muted-foreground">
                  e.g. set to 1 to show it just once, or 3 to show it three times.
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* ---- Independent display sizing: each area resizes on its own ---- */}
      <div className="rounded-xl border border-primary/20 bg-primary/[0.03] p-4">
        <p className="mb-1 text-sm font-semibold">Display sizing</p>
        <p className="mb-4 text-xs text-muted-foreground">
          Resize each area of the TV screen independently. 100% is the normal size.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Video area width (% of screen)</Label>
            <Input
              type="number"
              min={40}
              max={75}
              step={1}
              value={settings.videoWidthPercent ?? 72}
              onChange={(event) =>
                setSettings({ ...settings, videoWidthPercent: Number(event.target.value) })
              }
              className="rounded-xl"
            />
            <p className="text-xs text-muted-foreground">
              Rate card takes the rest ({100 - (settings.videoWidthPercent ?? 65)}%).
            </p>
          </div>
          <div className="space-y-2">
            <Label>Video fit</Label>
            <Select
              value={settings.videoFit ?? "stretch"}
              onValueChange={(value) =>
                setSettings({ ...settings, videoFit: (value as "contain" | "cover" | "auto" | "stretch") ?? "stretch" })
              }
            >
              <SelectTrigger className="rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="stretch">Stretch to fill — like the previous display (recommended)</SelectItem>
                <SelectItem value="auto">Auto-fit — area resizes to the video (no stretch)</SelectItem>
                <SelectItem value="cover">Fill a fixed area (may crop edges)</SelectItem>
                <SelectItem value="contain">Whole frame + blurred fill (nothing cropped)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Rate card size (%)</Label>
            <Input
              type="number"
              min={70}
              max={150}
              step={5}
              value={Math.round((settings.rateCardScale ?? 1) * 100)}
              onChange={(event) =>
                setSettings({ ...settings, rateCardScale: Number(event.target.value) / 100 })
              }
              className="rounded-xl"
            />
          </div>
          <div className="space-y-2">
            <Label>Currency code size (%)</Label>
            <Input
              type="number"
              min={50}
              max={200}
              step={5}
              value={Math.round((settings.rateCurrencyScale ?? 1) * 100)}
              onChange={(event) =>
                setSettings({ ...settings, rateCurrencyScale: Number(event.target.value) / 100 })
              }
              className="rounded-xl"
            />
            <p className="text-xs text-muted-foreground">Size of the currency code (USD, GBP…) only.</p>
          </div>
          <div className="space-y-2">
            <Label>We Buy / We Sell number size (%)</Label>
            <Input
              type="number"
              min={50}
              max={200}
              step={5}
              value={Math.round((settings.rateValueScale ?? 1) * 100)}
              onChange={(event) =>
                setSettings({ ...settings, rateValueScale: Number(event.target.value) / 100 })
              }
              className="rounded-xl"
            />
            <p className="text-xs text-muted-foreground">Size of the rate numbers only — set separately from the currency.</p>
          </div>
          <div className="space-y-2">
            <Label>Ticker size (%)</Label>
            <Input
              type="number"
              min={70}
              max={160}
              step={5}
              value={Math.round((settings.tickerScale ?? 1) * 100)}
              onChange={(event) =>
                setSettings({ ...settings, tickerScale: Number(event.target.value) / 100 })
              }
              className="rounded-xl"
            />
          </div>
          <div className="space-y-2">
            <Label>Logo size (%)</Label>
            <Input
              type="number"
              min={60}
              max={200}
              step={5}
              value={Math.round((settings.logoScale ?? 1) * 100)}
              onChange={(event) =>
                setSettings({ ...settings, logoScale: Number(event.target.value) / 100 })
              }
              className="rounded-xl"
            />
          </div>
          <div className="space-y-2">
            <Label>Logo animation</Label>
            <Select
              value={settings.tickerLogoAnimation ?? "spin"}
              onValueChange={(value) =>
                setSettings({
                  ...settings,
                  tickerLogoAnimation:
                    (value as "spin" | "pulse" | "none" | "flip" | "bounce" | "float" | "swing") ?? "spin",
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
        </div>
      </div>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogTrigger
          render={
            <Button disabled={saving} className="rounded-xl">
              {saving ? "Saving..." : "Save Branch Settings"}
            </Button>
          }
        />
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Apply these display changes?</AlertDialogTitle>
            <AlertDialogDescription>
              The branch TV updates immediately after saving. Please double-check the values before
              confirming.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl"
              onClick={() => {
                // Close the dialog immediately, then save — the success toast
                // confirms the write, so the confirm never lingers on screen.
                setConfirmOpen(false);
                void onSave({ logoUrl, brandingColor: color, settings });
              }}
            >
              Yes, apply to the display
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </FormSection>
  );
}

export default function SettingsPage() {
  const { user, profile, isSuperAdmin } = useAuth();
  const { branches, effectiveBranchId, setSelectedBranchId, isAdmin } = useBranchScope();
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
        requireApprovalForChanges:
          settings.requireApprovalForChanges ?? DEFAULT_SYSTEM_SETTINGS.requireApprovalForChanges,
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

  // Per client (2026-07-11): display settings (logos, promo card, sizing,
  // tickers) are ADMIN-ONLY. Branch staff handle forex rates only.
  if (!isSuperAdmin && !isAdmin) {
    return (
      <>
        <DashboardHeader title="Settings" description="System and branch display configuration." accent="default" />
        <PageShell>
          <ContentPanel title="Admins only" description="Display settings are managed centrally by the admins.">
            <p className="text-sm text-muted-foreground">
              Your account manages exchange rates. Logos, videos, messages and display settings are
              controlled by the admin team.
            </p>
          </ContentPanel>
        </PageShell>
      </>
    );
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
                  <p className="font-medium">Require approval for branch user rate edits</p>
                  <p className="text-sm text-muted-foreground">
                    When enabled, branch users submit rate changes for admin review before displays update.
                  </p>
                </div>
                <Switch
                  checked={settings.requireApprovalForChanges ?? false}
                  onCheckedChange={(checked) =>
                    setSettings({ ...settings, requireApprovalForChanges: checked })
                  }
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

        <ContentPanel
          title="Branch Display Control"
          description="Everything on the branch TV in ONE place — with a live preview. Changes apply after you confirm Save."
        >
          {isSuperAdmin || isAdmin ? (
            <BranchSelector branches={branches} value={effectiveBranchId} onChange={setSelectedBranchId} />
          ) : branch ? (
            <p className="mb-4 text-sm text-muted-foreground">
              Branch: <strong>{branch.name}</strong>
            </p>
          ) : null}

          {effectiveBranchId && branch ? (
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,44%)]">
              <BranchSettingsForm
                key={branch.id}
                branchId={branch.id}
                branchName={branch.name}
                initialLogoUrl={branch.logoUrl ?? ""}
                initialColor={branch.brandingColor ?? "#0066B3"}
                initialSettings={branch.settings}
                saving={saving}
                onSave={saveBranchSettings}
              />
              <div className="hidden xl:block">
                <div className="sticky top-20 space-y-2">
                  <Label>Live TV preview — {branch.name}</Label>
                  <div className="overflow-hidden rounded-xl border border-border/60 shadow-lg">
                    <iframe
                      src={`/display/?branch=${encodeURIComponent(branch.code)}`}
                      title={`Live display preview for ${branch.name}`}
                      className="aspect-video w-full border-0"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    This is the real branch display, live. Saved changes appear here within seconds.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Select a branch to configure display settings.</p>
          )}
        </ContentPanel>
      </PageShell>
    </>
  );
}
