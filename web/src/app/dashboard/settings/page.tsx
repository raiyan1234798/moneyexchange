"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
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
import { COLLECTIONS, DEFAULT_SYSTEM_SETTINGS, DISPLAY_ANIMATIONS, MESSAGE_FONTS, SLIDE_TRANSITIONS, messageFontCss } from "@/lib/constants";
import { ADVERT_IMAGE_OPTIONS, LOGO_IMAGE_OPTIONS, compressImageToDataUrl, compressLogoTransparent } from "@/lib/image-utils";
import { isYouTubeUrl, normalizeImageLink, normalizeVideoLink } from "@/lib/media-links";
import { isR2UploadConfigured, uploadFileToR2, uploadVideoToR2 } from "@/lib/r2-upload";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { updateBranch } from "@/lib/services/branch-service";
import type { BranchSettings, RateCardPosition, SystemSettings } from "@/lib/types";

const SETTINGS_ID = "global";

/** Jump-nav for the branch display settings — one chip per section below. */
const SETTINGS_NAV: Array<{ id: string; label: string }> = [
  { id: "sec-logos", label: "Logos & branding" },
  { id: "sec-font", label: "Font" },
  { id: "sec-video", label: "Video & sound" },
  { id: "sec-ratecard", label: "Rate card" },
  { id: "sec-promo", label: "Promotion slide" },
  { id: "sec-announcement", label: "Announcement" },
  { id: "sec-sizing", label: "Sizing" },
];

/** One titled, boxed settings section — keeps related controls together so the
    page reads as a short list of topics instead of one long wall of fields. */
function SettingsGroup({
  id,
  icon,
  title,
  description,
  children,
}: {
  id: string;
  icon: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-16 overflow-hidden rounded-2xl border border-border/50 bg-card/40"
    >
      <div className="border-b border-border/40 bg-muted/40 px-4 py-3 sm:px-5">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <span aria-hidden>{icon}</span>
          {title}
        </p>
        {description ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="space-y-4 p-4 sm:p-5">{children}</div>
    </section>
  );
}

function BranchSettingsForm({
  branchId,
  branchName,
  initialLogoUrl,
  initialColor,
  initialSettings,
  saving,
  saveSlot,
  navSlot,
  onSave,
}: {
  branchId: string;
  branchName: string;
  initialLogoUrl: string;
  initialColor: string;
  initialSettings: BranchSettings;
  saving: boolean;
  /** Element under the live TV preview that hosts the save bar on xl screens. */
  saveSlot?: HTMLElement | null;
  /** Element below the save bar that hosts the section jump-nav on xl screens. */
  navSlot?: HTMLElement | null;
  onSave: (data: { logoUrl: string; brandingColor: string; settings: BranchSettings }) => Promise<void>;
}) {
  const [logoUrl, setLogoUrl] = useState(initialLogoUrl);
  const [color, setColor] = useState(initialColor);
  const [settings, setSettings] = useState(initialSettings);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [promoLinkInput, setPromoLinkInput] = useState("");
  // Find-an-option search: hides sections without a match and glows the
  // matching fields, so nobody has to hunt (or ask) where a setting lives.
  const [searchQuery, setSearchQuery] = useState("");
  useEffect(() => {
    const q = searchQuery.trim().toLowerCase();
    const sections = document.querySelectorAll<HTMLElement>('section[id^="sec-"]');
    let hits = 0;
    sections.forEach((sec) => {
      const text = (sec.textContent ?? "").toLowerCase();
      const match = q === "" || text.includes(q);
      sec.style.display = match ? "" : "none";
      if (match && q !== "") hits++;
      // glow the specific field blocks that match
      sec.querySelectorAll<HTMLElement>("[data-setting-row], .space-y-2, .flex.items-center.justify-between").forEach((row) => {
        const rowMatch = q !== "" && (row.textContent ?? "").toLowerCase().includes(q);
        row.style.outline = rowMatch ? "2px solid var(--color-primary, #38bdf8)" : "";
        row.style.outlineOffset = rowMatch ? "3px" : "";
        row.style.borderRadius = rowMatch ? "12px" : "";
      });
    });
    const empty = document.getElementById("settings-search-empty");
    if (empty) empty.style.display = q !== "" && hits === 0 ? "" : "none";
  }, [searchQuery]);

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
  // Reorder: which item rotates first, second, etc. Moving writes the full list
  // back to ratePromoMedia (legacy single image is folded in and cleared).
  const movePromoMedia = (idx: number, dir: -1 | 1) =>
    setSettings((s) => {
      const list = [...legacyPromo(s), ...(s.ratePromoMedia ?? [])];
      const target = idx + dir;
      if (target < 0 || target >= list.length) return s;
      [list[idx], list[target]] = [list[target], list[idx]];
      return { ...s, ratePromoImageUrl: null, ratePromoMedia: list };
    });

  // Rescue any promo images stored as base64 data URLs by uploading them to R2
  // and swapping in the URL, so the branch doc stays well under Firestore's 1MB
  // limit. Runs at save time; safe no-op when nothing needs migrating.
  async function migratePromoMediaForSave(s: BranchSettings): Promise<BranchSettings> {
    const list = [...legacyPromo(s), ...(s.ratePromoMedia ?? [])];
    const needsUpload = list.some((m) => m.url.startsWith("data:"));
    if (!needsUpload) {
      return { ...s, ratePromoImageUrl: null, ratePromoMedia: list };
    }
    if (!isR2UploadConfigured()) {
      // No R2 here (local/dev): leave as-is; the caller will surface any size error.
      return { ...s, ratePromoImageUrl: null, ratePromoMedia: list };
    }
    toast.info("Optimizing promotion images for upload…");
    const migrated: PromoItem[] = [];
    for (const m of list) {
      if (m.url.startsWith("data:")) {
        try {
          const res = await fetch(m.url);
          const blob = await res.blob();
          const ext = (blob.type.split("/")[1] || "png").replace("+xml", "");
          const file = new File([blob], `promo-${Date.now()}.${ext}`, { type: blob.type });
          const r2 = await uploadFileToR2(file, branchId);
          migrated.push({ type: m.type, url: r2.downloadUrl });
        } catch {
          migrated.push(m); // best-effort — keep original if the upload fails
        }
      } else {
        migrated.push(m);
      }
    }
    return { ...s, ratePromoImageUrl: null, ratePromoMedia: migrated };
  }

  return (
    <div className="space-y-5">
      {/* Section jump-nav: on xl screens it lives in the RIGHT column below the
          save card (via portal); smaller screens keep the sticky top bar. */}
      {navSlot
        ? createPortal(
            <nav className="flex flex-wrap gap-1.5 rounded-2xl border border-border/40 bg-background/95 p-2 shadow-sm">
              {SETTINGS_NAV.map((item) => (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  className="rounded-lg border border-border/50 px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {item.label}
                </a>
              ))}
            </nav>,
            navSlot,
          )
        : null}
      {/* Type what you're looking for — in plain words — and only the matching
          sections stay, with the exact fields highlighted. */}
      <div className="sticky top-2 z-30 rounded-2xl border border-primary/30 bg-background/95 p-2 shadow-sm backdrop-blur">
        <Input
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="🔍 Find a setting… e.g. logo size, sound, animation, font, hide rate card"
          className="rounded-xl"
        />
        <p id="settings-search-empty" style={{ display: "none" }} className="px-1 pt-2 text-xs text-muted-foreground">
          Nothing found for this word — try another word like “logo”, “size”, “sound”, “animation”, “font”, “video”, “promotion”.
        </p>
      </div>
      <nav
        className={`${navSlot ? "xl:hidden " : ""}sticky top-2 z-20 flex flex-wrap gap-1.5 rounded-2xl border border-border/40 bg-background/95 p-2 shadow-sm backdrop-blur`}
      >
        {SETTINGS_NAV.map((item) => (
          <a
            key={item.id}
            href={`#${item.id}`}
            className="rounded-lg border border-border/50 px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {item.label}
          </a>
        ))}
      </nav>

      <SettingsGroup
        id="sec-logos"
        icon="🏷️"
        title="Logos & branding"
        description="Every logo on the TV — the rate-card header, the ticker badge, and logos that scroll with the message."
      >
      <div className="grid gap-4 sm:grid-cols-2">
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
      </div>
      {/* Rebrand: custom logo for the rate-card header (overrides the unimoni logo). */}
      <div className="space-y-2">
        <Label>Primary brand logo — rate-card header</Label>
        <p className="text-xs text-muted-foreground">
          Upload your main logo (PNG with transparency works best on the blue header). Enable
          &quot;Replace Unimoni default&quot; below to use this instead of the built-in Unimoni logo.
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
                const { dataUrl } = await compressLogoTransparent(file, LOGO_IMAGE_OPTIONS, "dark");
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

      {/* Second rate-card header logo (co-brand / partner) + how the two logos behave. */}
      <div className="space-y-2">
        <Label>Alternate / second logo (optional)</Label>
        <p className="text-xs text-muted-foreground">
          Upload a partner logo (e.g. Wizz Financial). Show it alongside the primary logo, rotate
          between the two on a timer, or swap it in only while the promotion slide is on screen.
        </p>
        <div className="flex items-center gap-3">
          <Input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml,.png,.jpg,.jpeg,.webp,.svg"
            aria-label="Upload second header logo"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              try {
                const { dataUrl } = await compressLogoTransparent(file, LOGO_IMAGE_OPTIONS, "dark");
                setSettings({ ...settings, headerLogoUrl2: dataUrl });
                toast.success("Second logo ready — click Save Branch Settings to apply");
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Could not read image");
              }
            }}
            className="rounded-xl"
          />
          {settings.headerLogoUrl2 ? (
            <div className="flex shrink-0 items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={settings.headerLogoUrl2}
                alt="Second logo preview"
                className="h-9 w-16 shrink-0 rounded-md bg-[#0D2680] object-contain p-1"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-lg"
                onClick={() => setSettings({ ...settings, headerLogoUrl2: null })}
              >
                Clear
              </Button>
            </div>
          ) : null}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Show logos (normal slides)</Label>
          <Select
            value={settings.headerLogoDisplay ?? "single"}
            onValueChange={(value) =>
              setSettings({ ...settings, headerLogoDisplay: (value as "single" | "both") ?? "single" })
            }
          >
            <SelectTrigger className="rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="single">First logo only</SelectItem>
              <SelectItem value="both">Both logos side by side</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex items-center justify-between rounded-xl border border-border/30 p-4">
        <div>
          <Label>Replace Unimoni default logo</Label>
          <p className="text-xs text-muted-foreground">
            When enabled, your uploaded primary logo is used instead of the built-in Unimoni logo on
            the rate card and ticker badge (when no separate ticker logo is set).
          </p>
        </div>
        <Switch
          checked={settings.replaceDefaultLogo === true}
          onCheckedChange={(checked) => setSettings({ ...settings, replaceDefaultLogo: checked })}
        />
      </div>
      <div className="flex items-center justify-between rounded-xl border border-border/30 p-4">
        <div>
          <Label>Rotate between primary and alternate logo</Label>
          <p className="text-xs text-muted-foreground">
            On normal rate-card slides, alternate between the two uploaded header logos on a timer.
            Requires both logos to be uploaded.
          </p>
        </div>
        <Switch
          checked={settings.headerLogoRotationEnabled === true}
          onCheckedChange={(checked) => setSettings({ ...settings, headerLogoRotationEnabled: checked })}
        />
      </div>
      <div className="space-y-2">
        <Label>Rate-card logo size (%)</Label>
        <Input
          type="number"
          min={50}
          max={300}
          step={10}
          value={Math.round((settings.headerLogoScale ?? 1) * 100)}
          onChange={(event) =>
            setSettings({
              ...settings,
              headerLogoScale: Math.min(3, Math.max(0.5, Number(event.target.value) / 100 || 1)),
            })
          }
          className="max-w-[10rem] rounded-xl"
        />
        <p className="text-xs text-muted-foreground">
          Size of the logo at the top of the rate card on the normal slides (100% = normal). The
          promotion slide has its own size control; the ticker corner badge is sized under Sizing.
        </p>
      </div>
      <div className="space-y-2">
        <Label>Rate-card logo animation</Label>
        <Select
          value={settings.headerLogoAnimation ?? "none"}
          onValueChange={(value) =>
            setSettings({
              ...settings,
              headerLogoAnimation: (value ?? "none") as NonNullable<
                BranchSettings["headerLogoAnimation"]
              >,
            })
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
          Movement effect for the logo at the top of the rate card (unimoni or your uploaded logo).
        </p>
      </div>
      {settings.headerLogoRotationEnabled ? (
        <div className="space-y-2">
          <Label>Logo rotation interval (seconds)</Label>
          <Input
            type="number"
            min={2}
            max={120}
            value={settings.headerLogoRotationIntervalSeconds ?? 10}
            onChange={(event) =>
              setSettings({
                ...settings,
                headerLogoRotationIntervalSeconds: Math.max(2, Number(event.target.value) || 10),
              })
            }
            className="max-w-[10rem] rounded-xl"
          />
        </div>
      ) : null}
      </SettingsGroup>

      <SettingsGroup
        id="sec-font"
        icon="🔤"
        title="Display font"
        description="ONE font for ALL text on the TV — rate card (values, date, note), scrolling message, yellow headline box, announcement, promotion text and logo text. Each area can still override it with its own font selector."
      >
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
      </SettingsGroup>

      <SettingsGroup
        id="sec-video"
        icon="🎬"
        title="Video & sound"
        description="The advert video area on the left of the TV."
      >
      <div className="flex items-center justify-between rounded-xl border border-border/30 p-4">
        <div>
          <Label>Play video sound</Label>
          <p className="text-xs text-muted-foreground">
            Play branch, promotion and rate-card videos WITH audio. Browsers keep videos muted until
            the screen is tapped or made fullscreen once — then sound turns on automatically.
          </p>
        </div>
        <Switch
          checked={settings.videoSoundOn === true}
          onCheckedChange={(checked) => setSettings({ ...settings, videoSoundOn: checked })}
        />
      </div>
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
          <Label>Image / video change animation</Label>
          <Select
            value={settings.videoImageTransition ?? "fade"}
            onValueChange={(value) =>
              setSettings({ ...settings, videoImageTransition: value ?? "fade" })
            }
          >
            <SelectTrigger className="rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SLIDE_TRANSITIONS.map((t) => (
                  <SelectItem key={t.key} value={t.key}>
                    {t.label}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            How the advert image/video enters when it changes in the video area.
          </p>
        </div>
      </div>
      </SettingsGroup>

      <SettingsGroup
        id="sec-ratecard"
        icon="💱"
        title="Rate card"
        description="The rates panel — position, which cards rotate, the WE BUY note, timing and slide order."
      >
      <div className="grid gap-4 sm:grid-cols-2">
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
        <Label>Rate card visible for (seconds, 0 = always show)</Label>
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
        <Label>Then hidden for (seconds, 0 = off)</Label>
        <Input
          type="number"
          min={0}
          max={3600}
          value={settings.rateCardHideSeconds ?? 0}
          onChange={(event) =>
            setSettings({ ...settings, rateCardHideSeconds: Math.max(0, Number(event.target.value) || 0) })
          }
          className="rounded-xl"
        />
        <p className="text-xs text-muted-foreground">
          The rate card disappears for this long and the VIDEO fills the whole screen, then the
          card returns — repeating. Needs &quot;visible for&quot; above to be set too.
        </p>
      </div>
      <div className="space-y-2">
        <Label>Slide change animation</Label>
        <Select
          value={settings.rateCardTransition ?? "fade"}
          onValueChange={(value) => setSettings({ ...settings, rateCardTransition: value ?? "fade" })}
        >
          <SelectTrigger className="rounded-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SLIDE_TRANSITIONS.map((t) => (
                  <SelectItem key={t.key} value={t.key}>
                    {t.label}
                  </SelectItem>
                ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          How each rotating screen (forex pages, transfer card, promotion) enters when the card
          changes.
        </p>
      </div>
      <div className="space-y-2">
        <Label>Rate numbers movement (WE BUY / WE SELL)</Label>
        <Select
          value={settings.rateTextAnimation ?? "none"}
          onValueChange={(value) =>
            setSettings({ ...settings, rateTextAnimation: value === "none" ? null : value })
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
          Moves every rate NUMBER inside the table, all the time. Gentle pulse or Breathe read
          best — strong effects can make numbers hard to read.
        </p>
      </div>
      </div>
      <div className="flex items-center justify-between rounded-xl border border-border/30 p-4">
        <div>
          <Label>Show Foreign Exchange card on Display</Label>
          <p className="text-xs text-muted-foreground">
            The We Buy / We Sell forex card. Turn off to hide the whole forex card from the display.
          </p>
        </div>
        <Switch
          checked={settings.showForexCard !== false}
          onCheckedChange={(checked) => setSettings({ ...settings, showForexCard: checked })}
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
      </SettingsGroup>

      <SettingsGroup
        id="sec-promo"
        icon="🎁"
        title="Promotion slide"
        description="Its own screen in the rate-card rotation: message above and/or below, with images and videos. With no text the image fills the whole card; leave everything empty to hide it."
      >
        <div className="flex items-center justify-between rounded-xl border border-border/30 p-4">
          <div>
            <Label>Show the promotion slide on the TV</Label>
            <p className="text-xs text-muted-foreground">
              Turn off to remove the promotion from the rotation WITHOUT deleting your images,
              videos or text — switch it back on anytime.
            </p>
          </div>
          <Switch
            checked={settings.ratePromoEnabled !== false}
            onCheckedChange={(checked) => setSettings({ ...settings, ratePromoEnabled: checked })}
          />
        </div>
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
              accept="image/png,image/jpeg,image/webp,video/mp4,video/webm,.png,.jpg,.jpeg,.webp,.mp4,.webm"
              multiple
              aria-label="Upload promotion images or videos"
              onChange={async (event) => {
                const files = Array.from(event.target.files ?? []);
                let added = 0;
                for (const file of files) {
                  try {
                    if (file.type.startsWith("video/") || /\.(mp4|webm|mov)$/i.test(file.name)) {
                      // Videos go to R2 (a data URL would be far too big for the doc).
                      if (!isR2UploadConfigured()) {
                        toast.error("Video upload is unavailable here — paste a video link instead.");
                        continue;
                      }
                      toast.info(`Uploading ${file.name}…`);
                      const r2 = await uploadVideoToR2(file, branchId);
                      addPromoMedia({ type: "video", url: r2.downloadUrl });
                    } else if (isR2UploadConfigured()) {
                      // Images ALSO go to R2 now: storing several as base64 data
                      // URLs pushes the branch doc past Firestore's 1MB limit.
                      toast.info(`Uploading ${file.name}…`);
                      const r2 = await uploadFileToR2(file, branchId);
                      addPromoMedia({ type: "image", url: r2.downloadUrl });
                    } else {
                      // No R2 (local/dev): fall back to a compressed inline image.
                      const { dataUrl } = await compressImageToDataUrl(file, ADVERT_IMAGE_OPTIONS);
                      addPromoMedia({ type: "image", url: dataUrl });
                    }
                    added += 1;
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : `Could not add ${file.name}`);
                  }
                }
                if (added) toast.success(`${added} item(s) added — Save Branch Settings to apply`);
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
              <div className="flex flex-wrap gap-3 pt-1">
                {promoMediaList.map((m, i) => (
                  <div key={`${m.url}-${i}`} className="relative flex flex-col items-center gap-1">
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
                    {/* Order badge: shows the rotation position (1 = first). */}
                    <span className="absolute -left-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground shadow">
                      {i + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => removePromoMedia(i)}
                      aria-label="Remove this promotion item"
                      className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-xs font-bold text-white shadow"
                    >
                      ×
                    </button>
                    {/* Reorder controls: move earlier / later in the rotation. */}
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => movePromoMedia(i, -1)}
                        disabled={i === 0}
                        aria-label="Move earlier in the rotation"
                        className="flex h-5 w-6 items-center justify-center rounded border border-border text-xs font-bold disabled:opacity-30"
                      >
                        ‹
                      </button>
                      <button
                        type="button"
                        onClick={() => movePromoMedia(i, 1)}
                        disabled={i === promoMediaList.length - 1}
                        aria-label="Move later in the rotation"
                        className="flex h-5 w-6 items-center justify-center rounded border border-border text-xs font-bold disabled:opacity-30"
                      >
                        ›
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
            <p className="text-xs text-muted-foreground">
              Add several images and/or videos — they rotate one after another (the number shows the
              order). Use ‹ › to set which plays first, second, and so on. Videos play muted.
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
          <div className="space-y-2">
            <Label>Promotion video sound (rate card)</Label>
            <Select
              value={
                settings.ratePromoSoundOn == null
                  ? "inherit"
                  : settings.ratePromoSoundOn
                    ? "on"
                    : "off"
              }
              onValueChange={(value) =>
                setSettings({
                  ...settings,
                  ratePromoSoundOn: value === "inherit" ? null : value === "on",
                })
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
              Audio for videos playing on the promotion slide of the rate card. Browsers keep
              sound off until the screen has been tapped or made fullscreen once — then it plays
              automatically.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Logo on the promotion slide</Label>
            <p className="text-xs text-muted-foreground">
              The rate-card header (logos + clock) is hidden on the promo slide by default so the
              media fills the panel. Turn the logo bar on to keep a logo visible during the promo.
            </p>
            <Select
              value={settings.promoLogoMode === "second" ? "second" : "hide"}
              onValueChange={(value) =>
                setSettings({ ...settings, promoLogoMode: (value as "keep" | "hide" | "second") ?? "hide" })
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
            <p className="text-xs text-muted-foreground">
              Shown in the logo bar only while the promotion image/video plays — so the promo can
              carry its own branding. A white/solid background is removed automatically on upload.
              Leave empty to fall back to the alternate/main logo.
            </p>
            <div className="flex items-center gap-3">
              <Input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml,.png,.jpg,.jpeg,.webp,.svg"
                aria-label="Upload promotion-slide logo"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  try {
                    const { dataUrl } = await compressLogoTransparent(file, LOGO_IMAGE_OPTIONS, "dark");
                    setSettings({ ...settings, promoSlideLogoUrl: dataUrl });
                    toast.success("Promotion-slide logo ready — click Save Branch Settings to apply");
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Could not read image");
                  }
                }}
                className="rounded-xl"
              />
              {settings.promoSlideLogoUrl ? (
                <div className="flex shrink-0 items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={settings.promoSlideLogoUrl}
                    alt="Promotion-slide logo preview"
                    className="h-9 w-16 shrink-0 rounded-md bg-[#0D2680] object-contain p-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-lg"
                    onClick={() => setSettings({ ...settings, promoSlideLogoUrl: null })}
                  >
                    Clear
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Promotion-slide logo size (%)</Label>
            <Input
              type="number"
              min={50}
              max={300}
              step={10}
              value={Math.round((settings.promoSlideLogoScale ?? 1) * 100)}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  promoSlideLogoScale: Math.min(3, Math.max(0.5, Number(event.target.value) / 100 || 1)),
                })
              }
              className="max-w-[10rem] rounded-xl"
            />
            <p className="text-xs text-muted-foreground">
              Make the logo on the promotion slide bigger or smaller (100% = normal).
            </p>
          </div>
          <div className="space-y-2">
            <Label>Promotion-slide logo animation</Label>
            <Select
              value={settings.promoSlideLogoAnimation ?? "__inherit"}
              onValueChange={(value) =>
                setSettings({
                  ...settings,
                  promoSlideLogoAnimation: value === "__inherit" ? null : value,
                })
              }
            >
              <SelectTrigger className="rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__inherit">Same as rate-card logo animation (default)</SelectItem>
                {DISPLAY_ANIMATIONS.map((a) => (
                  <SelectItem key={a.key} value={a.key}>
                    {a.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Movement effect for the logo while the promotion plays — can differ from the normal
              rate-card slides.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Promotion message size (%)</Label>
            <Input
              type="number"
              min={50}
              max={300}
              step={10}
              value={Math.round((settings.ratePromoTextScale ?? 1) * 100)}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  ratePromoTextScale: Math.min(3, Math.max(0.5, Number(event.target.value) / 100 || 1)),
                })
              }
              className="max-w-[10rem] rounded-xl"
            />
            <p className="text-xs text-muted-foreground">
              Size of the messages above/below the promotion image (100% = normal).
            </p>
          </div>
          <div className="space-y-2">
            <Label>Promotion text movement</Label>
            <Select
              value={settings.ratePromoTextAnimation ?? "none"}
              onValueChange={(value) =>
                setSettings({
                  ...settings,
                  ratePromoTextAnimation: value === "none" ? null : value,
                })
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
              Keeps the promotion messages (above/below the image) moving while the slide shows.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Promotion message font</Label>
            <Select
              value={settings.ratePromoFont ?? "__master"}
              onValueChange={(value) =>
                setSettings({ ...settings, ratePromoFont: value === "__master" ? null : value })
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
            <p className="text-xs text-muted-foreground">
              A font just for the promotion messages — overrides the whole-screen font here only.
            </p>
          </div>
        </div>
      </SettingsGroup>

      <SettingsGroup
        id="sec-announcement"
        icon="📢"
        title="Announcement / display message"
        description="Play an announcement (text, image or video) for a set time, then it animates away and the screen returns to normal — repeating on the interval you choose. Leave empty to turn it off."
      >
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
              <SelectContent style={{ width: "max-content", minWidth: "var(--anchor-width)", maxWidth: "28rem" }}>
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
            <Label>Position (top / bottom of the video)</Label>
            <Select
              value={settings.announcementPosition ?? "bottom"}
              onValueChange={(value) =>
                setSettings({
                  ...settings,
                  announcementPosition: (value as "top" | "bottom") ?? "bottom",
                })
              }
            >
              <SelectTrigger className="rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bottom">Bottom of the video (default)</SelectItem>
                <SelectItem value="top">Top of the video</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Places the over-video caption at the top or bottom of the video player. Applies to the lower-third caption.
            </p>
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
          <div className="space-y-2">
            <Label>Text movement (while visible)</Label>
            <Select
              value={settings.announcementTextAnimation ?? "none"}
              onValueChange={(value) =>
                setSettings({
                  ...settings,
                  announcementTextAnimation: value === "none" ? null : value,
                })
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
              Keeps the announcement TEXT moving the whole time it is on screen — separate from
              how it enters and leaves.
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
            <div className="space-y-2">
              <Label>Announcement font</Label>
              <Select
                value={settings.announcementFont ?? "__master"}
                onValueChange={(value) =>
                  setSettings({
                    ...settings,
                    announcementFont: value === "__master" ? null : value,
                  })
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
              <p className="text-xs text-muted-foreground">
                A font just for the announcement. When set, it overrides the whole-screen display
                font for this message only.
              </p>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Announcement text size (%)</Label>
            <Input
              type="number"
              min={50}
              max={300}
              step={10}
              value={Math.round((settings.announcementTextScale ?? 1) * 100)}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  announcementTextScale: Math.min(3, Math.max(0.5, Number(event.target.value) / 100 || 1)),
                })
              }
              className="max-w-[10rem] rounded-xl"
            />
            <p className="text-xs text-muted-foreground">
              Size of the announcement text on the TV (100% = normal).
            </p>
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
              <Label>Gap between shows (seconds)</Label>
              <Input
                type="number"
                min={1}
                max={14400}
                value={
                  settings.announcementRepeatSeconds ??
                  Math.round((settings.announcementRepeatMinutes ?? 3) * 60)
                }
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    announcementRepeatSeconds: Math.max(1, Number(event.target.value) || 1),
                  })
                }
                className="rounded-xl"
              />
              <p className="text-xs text-muted-foreground">
                e.g. 60 = show again after a minute.
              </p>
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
      </SettingsGroup>

      <SettingsGroup
        id="sec-sizing"
        icon="📐"
        title="Display sizing"
        description="Resize each area of the TV screen independently. 100% is the normal size."
      >
        <div className="grid gap-4 sm:grid-cols-2">
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
                  tickerLogoAnimation: value ?? "spin",
                })
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
      </SettingsGroup>

      {/* Save bar: on large screens it lives in the RIGHT column, right below
          the live TV preview (via portal); smaller screens keep a sticky
          bottom bar so Save is always in reach. */}
      {saveSlot
        ? createPortal(
            <div className="space-y-2 rounded-2xl border border-primary/30 bg-background/95 px-4 py-3 shadow-lg">
              <p className="text-xs text-muted-foreground">
                Changes go live on the <strong>{branchName}</strong> TV only after you save.
              </p>
              <Button
                disabled={saving}
                className="w-full rounded-xl"
                onClick={() => setConfirmOpen(true)}
              >
                {saving ? "Saving..." : "Save Branch Settings"}
              </Button>
            </div>,
            saveSlot,
          )
        : null}
      <div
        className={`${saveSlot ? "xl:hidden " : ""}sticky bottom-3 z-20 flex items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-background/95 px-4 py-3 shadow-lg backdrop-blur`}
      >
        <p className="text-xs text-muted-foreground">
          Changes go live on the <strong>{branchName}</strong> TV only after you save.
        </p>
        <Button disabled={saving} className="rounded-xl" onClick={() => setConfirmOpen(true)}>
          {saving ? "Saving..." : "Save Branch Settings"}
        </Button>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
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
                void (async () => {
                  // Move any inline (base64) promo images to R2 first so the doc
                  // stays under Firestore's 1MB limit.
                  const prepared = await migratePromoMediaForSave(settings);
                  if (prepared !== settings) setSettings(prepared);
                  await onSave({ logoUrl, brandingColor: color, settings: prepared });
                })();
              }}
            >
              Yes, apply to the display
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { user, profile, isSuperAdmin } = useAuth();
  const { branches, effectiveBranchId, setSelectedBranchId, isAdmin } = useBranchScope();
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [globalLoading, setGlobalLoading] = useState(isSuperAdmin);
  const [saving, setSaving] = useState(false);
  // Slots under the live TV preview: save bar, then the section jump-nav.
  const [saveSlot, setSaveSlot] = useState<HTMLElement | null>(null);
  const [navSlot, setNavSlot] = useState<HTMLElement | null>(null);

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
          // overflow must stay visible here or every sticky child (section nav,
          // save bar, live preview) silently stops sticking.
          className="overflow-visible"
          contentClassName="overflow-x-visible"
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
                saveSlot={saveSlot}
                navSlot={navSlot}
                onSave={saveBranchSettings}
              />
              <div className="hidden xl:block">
                <div className="sticky top-3 space-y-2">
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
                  <div id="branch-save-slot" ref={setSaveSlot} className="pt-1" />
                  <div id="branch-nav-slot" ref={setNavSlot} />
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
