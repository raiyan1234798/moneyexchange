"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { doc, onSnapshot } from "firebase/firestore";
import { toast } from "sonner";
import { DashboardHeader } from "@/components/layout/dashboard-sidebar";
import { BranchSelector } from "@/components/shared/branch-selector";
import { ApplyToAllCheckbox } from "@/components/shared/apply-to-all-checkbox";
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
import {
  DisplayAnimationSelect,
  SecondsPresetField,
  SlideTransitionRow,
} from "@/components/shared/animation-controls";
import {
  COLLECTIONS,
  DEFAULT_SYSTEM_SETTINGS,
  MESSAGE_FONTS,
  RATE_ANIM_PAUSE_PRESETS,
  RATE_ANIM_SPEED_PRESETS,
  messageFontCss,
} from "@/lib/constants";
import { ADVERT_IMAGE_OPTIONS, LOGO_IMAGE_OPTIONS, compressImageToDataUrl, compressLogoTransparent } from "@/lib/image-utils";
import { checkPromoMediaFit } from "@/lib/promo-fit";
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

/** Cap on the extra rate-card logo gallery — the logos are stored inside the
    branch document, which Firestore rejects above 1 MB. 8 logos within a
    ~400 KB budget keeps every settings save comfortably under the limit. */
const MAX_EXTRA_HEADER_LOGOS = 8;
const EXTRA_HEADER_LOGOS_CHAR_BUDGET = 400_000;

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
  onCopyFontsToAll,
  branchCount = 1,
  otherBranches = [],
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
  onSave: (
    data: { logoUrl: string; brandingColor: string; settings: BranchSettings },
    opts?: { targetBranchIds?: string[]; includePromo?: boolean },
  ) => Promise<void>;
  /** Copy THIS form's font choices to every branch (admin convenience). */
  onCopyFontsToAll?: (settings: BranchSettings) => Promise<void>;
  /** How many active branches exist — shows the "apply to all N" count. */
  branchCount?: number;
  /** Other branches (excluding the one being edited) for the apply-to picker. */
  otherBranches?: Array<{ id: string; name: string; code: string }>;
}) {
  const [logoUrl, setLogoUrl] = useState(initialLogoUrl);
  const [color, setColor] = useState(initialColor);
  const [settings, setSettings] = useState(initialSettings);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Save-target choice in the confirm dialog: this branch, all, or picked ones,
  // plus whether to also copy the promotion images/videos to them.
  const [applyMode, setApplyMode] = useState<"this" | "all" | "some">("this");
  const [pickedBranchIds, setPickedBranchIds] = useState<string[]>([]);
  const [includePromo, setIncludePromo] = useState(false);
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
      {/* ANY NUMBER of extra header logos — they join the rotation, each animated. */}
      <div className="space-y-2">
        <Label>More rate-card logos — they take turns</Label>
        <p className="text-xs text-muted-foreground">
          Add up to 8 extra logos. With &quot;Rotate between logos&quot; ON below, the rate-card
          header cycles through every logo — primary, alternate and these — and each one moves
          with your saved &quot;Rate-card logo animation&quot;. Use ◀ ▶ under a logo to change the
          order they appear in.
        </p>
        <Input
          type="file"
          multiple
          accept="image/png,image/jpeg,image/webp,image/svg+xml,.png,.jpg,.jpeg,.webp,.svg"
          aria-label="Upload extra rate-card logos"
          onChange={async (event) => {
            const input = event.target;
            const files = Array.from(input.files ?? []);
            if (files.length === 0) return;
            if ((settings.headerLogoUrls ?? []).length + files.length > MAX_EXTRA_HEADER_LOGOS) {
              toast.error(
                `You can have up to ${MAX_EXTRA_HEADER_LOGOS} extra logos — remove one first, then add the new one.`,
              );
              input.value = "";
              return;
            }
            try {
              const urls: string[] = [];
              let kept = 0;
              for (const file of files) {
                const res =
                  settings.logoAutoRemoveBg !== false
                    ? await compressLogoTransparent(file, LOGO_IMAGE_OPTIONS, "dark")
                    : { ...(await compressImageToDataUrl(file, LOGO_IMAGE_OPTIONS)), backgroundKept: false };
                urls.push(res.dataUrl);
                if (res.backgroundKept) kept++;
              }
              // Size budget: the logos live inside the branch document and
              // Firestore rejects documents over 1 MB — refuse the batch rather
              // than let every later settings save fail.
              const totalChars = [...(settings.headerLogoUrls ?? []), ...urls].reduce(
                (n, u) => n + u.length,
                0,
              );
              if (totalChars > EXTRA_HEADER_LOGOS_CHAR_BUDGET) {
                toast.error(
                  "These logos are too large together — remove one, or upload smaller images.",
                );
                input.value = "";
                return;
              }
              // Functional update: the compressions above can take seconds — don't
              // clobber edits made meanwhile with a stale snapshot.
              setSettings((prev) => ({
                ...prev,
                headerLogoUrls: [...(prev.headerLogoUrls ?? []), ...urls],
              }));
              toast.success(
                `${urls.length} logo(s) added${kept ? ` — ${kept} kept their background (needed for readability)` : ""} — click Save Branch Settings to apply`,
                { duration: 8000 },
              );
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Could not read image");
            }
            input.value = "";
          }}
          className="rounded-xl"
        />
        {(settings.headerLogoUrls ?? []).length > 0 ? (
          <div className="flex flex-wrap gap-3 pt-1">
            {(settings.headerLogoUrls ?? []).map((src: string, i: number) => (
              <div key={`${i}-${src.slice(-12)}`} className="relative flex flex-col items-center gap-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt={`Extra rate-card logo ${i + 1}`}
                  className="h-9 w-16 rounded-md bg-[#0D2680] object-contain p-1"
                />
                <button
                  type="button"
                  aria-label="Remove extra rate-card logo"
                  onClick={() =>
                    setSettings((prev) => ({
                      ...prev,
                      headerLogoUrls: (prev.headerLogoUrls ?? []).filter(
                        (_: string, idx: number) => idx !== i,
                      ),
                    }))
                  }
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-xs text-white"
                >
                  ×
                </button>
                {/* Order = the order they take turns on the TV. */}
                <div className="flex gap-1">
                  <button
                    type="button"
                    aria-label={`Move logo ${i + 1} earlier`}
                    disabled={i === 0}
                    onClick={() =>
                      setSettings((prev) => {
                        const arr = [...(prev.headerLogoUrls ?? [])];
                        [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
                        return { ...prev, headerLogoUrls: arr };
                      })
                    }
                    className="rounded border border-border/50 px-1.5 text-[10px] leading-4 text-muted-foreground disabled:opacity-30"
                  >
                    ◀
                  </button>
                  <button
                    type="button"
                    aria-label={`Move logo ${i + 1} later`}
                    disabled={i === (settings.headerLogoUrls ?? []).length - 1}
                    onClick={() =>
                      setSettings((prev) => {
                        const arr = [...(prev.headerLogoUrls ?? [])];
                        if (i >= arr.length - 1) return prev;
                        [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
                        return { ...prev, headerLogoUrls: arr };
                      })
                    }
                    className="rounded border border-border/50 px-1.5 text-[10px] leading-4 text-muted-foreground disabled:opacity-30"
                  >
                    ▶
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
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
          <Label>Rotate between logos (they take turns)</Label>
          <p className="text-xs text-muted-foreground">
            On normal rate-card slides, the header cycles through ALL uploaded logos — primary,
            alternate and every extra logo — on a timer. Each logo moves with your saved
            &quot;Rate-card logo animation&quot;. Needs at least 2 logos.
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
        <DisplayAnimationSelect
          value={settings.headerLogoAnimation ?? "none"}
          onChange={(value) =>
            setSettings({ ...settings, headerLogoAnimation: value ?? "none" })
          }
        />
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
        {onCopyFontsToAll ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              onClick={() => void onCopyFontsToAll(settings)}
            >
              Copy fonts to ALL branches
            </Button>
            <p className="text-xs text-muted-foreground">
              Makes every branch&apos;s TV use the SAME fonts as this one — nothing else changes.
            </p>
          </div>
        ) : null}
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
          <Label>TV edge-cut fix (%)</Label>
          <Input
            type="number"
            min={0}
            max={10}
            step={1}
            key={`safe-area-${settings.displaySafeAreaPercent ?? 0}`}
            defaultValue={settings.displaySafeAreaPercent ?? 0}
            onBlur={(event) => {
              const value = Math.max(0, Math.min(10, Number(event.target.value) || 0));
              event.target.value = String(value);
              setSettings({ ...settings, displaySafeAreaPercent: value });
            }}
            className="rounded-xl"
          />
          <p className="text-xs text-muted-foreground">
            Some TVs cut off the edges of the picture (logo, date or last column not fully
            visible). Increase this until everything fits — 3 to 5 works for most TVs. 0 = off.
          </p>
        </div>
      </div>
      <div className="mt-4">
        <SlideTransitionRow
          transitionValue={settings.videoImageTransition ?? "fade"}
          onTransitionChange={(value) =>
            setSettings({ ...settings, videoImageTransition: value })
          }
          durationValue={settings.slideTransitionSeconds ?? 0.6}
          onDurationChange={(value) =>
            setSettings({ ...settings, slideTransitionSeconds: value })
          }
          transitionLabel="Image / video change animation"
          transitionHint="How the advert image/video enters when it changes in the video area. Same effect list as the rate card."
          durationHint="Shared with the rate card — length of the flip/fade. Try 1.2s if cube/flip was invisible before."
        />
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
      <div className="space-y-2 sm:col-span-2">
        <SlideTransitionRow
          transitionValue={settings.rateCardTransition ?? "fade"}
          onTransitionChange={(value) => setSettings({ ...settings, rateCardTransition: value })}
          durationValue={settings.slideTransitionSeconds ?? 0.6}
          onDurationChange={(value) =>
            setSettings({ ...settings, slideTransitionSeconds: value })
          }
          transitionLabel="Slide change animation"
          transitionHint="How forex, transfer and promotion pages enter when the card changes. Same full list as Video & sound — including 3D flip / flip-up."
        />
      </div>
      <div className="space-y-2">
        <Label>Rate numbers movement (WE BUY / WE SELL)</Label>
        <DisplayAnimationSelect
          value={settings.rateTextAnimation ?? "none"}
          onChange={(value) =>
            setSettings({ ...settings, rateTextAnimation: value === "none" ? null : value })
          }
        />
        <p className="text-xs text-muted-foreground">
          Moves every rate NUMBER inside the table, all the time. Includes Rotating flip (Y),
          Flip (X), Rotate and 3D tilt — same list as promotion message animation.
        </p>
      </div>
      <div className="space-y-2">
        <Label>Currency letters movement (USD, EUR, GBP…)</Label>
        <DisplayAnimationSelect
          value={settings.rateCurrencyAnimation ?? "none"}
          onChange={(value) =>
            setSettings({ ...settings, rateCurrencyAnimation: value === "none" ? null : value })
          }
        />
        <p className="text-xs text-muted-foreground">
          Moves every currency CODE (the letters like USD, EUR) in the table. Try Flip (X) or
          Rotating flip (Y).
        </p>
      </div>
      <div className="space-y-2">
        <Label>Flags movement</Label>
        <DisplayAnimationSelect
          value={settings.rateFlagAnimation ?? "none"}
          onChange={(value) =>
            setSettings({ ...settings, rateFlagAnimation: value === "none" ? null : value })
          }
        />
        <p className="text-xs text-muted-foreground">
          Moves every country FLAG in the table. Flip (X), Rotating flip (Y) and Rotate look
          great on the flags.
        </p>
      </div>
      <div className="space-y-2">
        <Label>Card heading movement (EXCHANGE RATES / TRANSFER RATES)</Label>
        <DisplayAnimationSelect
          value={settings.rateHeadingAnimation ?? "none"}
          onChange={(value) =>
            setSettings({ ...settings, rateHeadingAnimation: value === "none" ? null : value })
          }
        />
        <p className="text-xs text-muted-foreground">
          Moves the card title — the &quot;EXCHANGE RATES&quot; and &quot;TRANSFER RATES&quot;
          heading at the top of the rate card. Same flip options as message animation.
        </p>
      </div>
      <SecondsPresetField
        label="Spin / flip speed (seconds per turn)"
        value={settings.rateAnimationSpeedSeconds ?? 3}
        onChange={(value) =>
          setSettings({ ...settings, rateAnimationSpeedSeconds: value ?? 3 })
        }
        presets={RATE_ANIM_SPEED_PRESETS}
        min={1}
        max={30}
        hint="How long ONE full spin or flip takes for the flags, currency letters and headings above. Bigger number = slower, calmer movement. 3 is the default."
      />
      <SecondsPresetField
        label="Pause between spins (seconds)"
        value={settings.rateAnimationPauseSeconds ?? 1}
        onChange={(value) =>
          setSettings({ ...settings, rateAnimationPauseSeconds: value ?? 0 })
        }
        presets={RATE_ANIM_PAUSE_PRESETS}
        min={0}
        max={30}
        hint="How long the flags / letters / numbers stand still BEFORE each spin or flip. Gives viewers time to read. 1 second is the default; 0 = continuous spinning."
      />
      <SecondsPresetField
        label="TRANSFER card: spin speed (seconds per turn)"
        value={settings.rateAnimationSpeedSecondsTransfer ?? null}
        onChange={(value) =>
          setSettings({ ...settings, rateAnimationSpeedSecondsTransfer: value })
        }
        presets={RATE_ANIM_SPEED_PRESETS}
        min={1}
        max={30}
        allowEmpty
        placeholder="Same as forex"
        hint="The TRANSFER RATES slide can turn at its own speed. Leave empty to match the forex slides."
      />
      <SecondsPresetField
        label="TRANSFER card: pause between spins (seconds)"
        value={settings.rateAnimationPauseSecondsTransfer ?? null}
        onChange={(value) =>
          setSettings({ ...settings, rateAnimationPauseSecondsTransfer: value })
        }
        presets={RATE_ANIM_PAUSE_PRESETS}
        min={0}
        max={30}
        allowEmpty
        placeholder="Same as forex"
        hint="Stand-still time on the TRANSFER slide only. Leave empty to match the forex slides."
      />
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
          always USD.
        </p>
      </div>
      <div className="space-y-2">
        <Label>Rate card note (We buy @ …)</Label>
        <Input
          value={settings.rateCardNote ?? ""}
          onChange={(event) =>
            setSettings({ ...settings, rateCardNote: event.target.value.trim() ? event.target.value : null })
          }
          placeholder="We buy USD small bills $20, $10, $5, $2, $1 @ 3300"
          className="rounded-xl"
        />
        <p className="text-xs text-muted-foreground">
          One line under the rate card. Same font as the board; only size is adjustable below.
        </p>
        <div className="grid gap-3 pt-1 sm:grid-cols-2">
          <div>
            <Label className="mb-1 block text-xs">Note text size (%)</Label>
            <Input
              type="number"
              min={50}
              max={300}
              step={10}
              value={Math.round((settings.rateCardNoteFontScale ?? 1) * 100)}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  rateCardNoteFontScale: Math.min(
                    3,
                    Math.max(0.5, Number(event.target.value) / 100 || 1),
                  ),
                })
              }
              className="rounded-xl"
            />
          </div>
          <div>
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
        </div>
        <p className="text-xs text-muted-foreground">
          Bold text at the bottom of the forex rates. It follows the forex page wherever you put it in
          the slide order — so it appears even when transfer or promo is first. Leave blank to hide it.
          Size 100% = normal; raise or lower to enlarge or shrink the note on the TV.
        </p>
      </div>
      </div>

      {/* ---- Rate-screen sequence timing: THREE separate manual timers (per the
              client) — forex slides, the transfer card, and the promotion slide. ---- */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label>Forex slides show for (seconds)</Label>
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
            Manual seconds for each foreign-exchange (WE BUY / WE SELL) page. E.g. 3, 6, 10.
          </p>
        </div>
        <div className="space-y-2">
          <Label>Transfer card shows for (seconds)</Label>
          <Input
            type="number"
            min={2}
            max={120}
            placeholder="Same as forex"
            value={settings.rateTransferDurationSeconds ?? ""}
            onChange={(event) =>
              setSettings({
                ...settings,
                rateTransferDurationSeconds:
                  event.target.value === "" ? null : Number(event.target.value),
              })
            }
            className="rounded-xl"
          />
          <p className="text-xs text-muted-foreground">
            The TRANSFER RATES card&apos;s own manual seconds. Leave empty to match the forex
            slides.
          </p>
        </div>
        <div className="space-y-2">
          <Label>Promotion slide shows for (seconds)</Label>
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
            The promotion slide&apos;s own manual seconds — longer or shorter than the others.
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
        <div className="space-y-2">
          <Label>Image / video fit on the promo card</Label>
          <Select
            value={settings.ratePromoMediaFit ?? "fill"}
            onValueChange={(value) =>
              setSettings({ ...settings, ratePromoMediaFit: (value as "fill" | "cover" | "contain") ?? "fill" })
            }
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
            How every promotion image and video sits in the card. Upload at 1080 × 1800 (3:5)
            and all three look identical.
          </p>
        </div>
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
            <p className="text-xs text-muted-foreground">
              Best size: <span className="font-semibold">tall (portrait) 3:5 — e.g. 1080 × 1800 px</span>{" "}
              (same shape as a phone screen). The poster always fills the whole space with no blue
              gaps and nothing cut off. A picture that isn&apos;t 3:5 stretches a little to fit —
              upload at 3:5 and it fills perfectly with no stretch.
            </p>
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
                    // Friendly shape check: warn when this won't fill the tall
                    // promo area without stretching (upload continues either way).
                    const fit = await checkPromoMediaFit(file);
                    if (fit) toast.warning(`${file.name}: ${fit}`, { duration: 12000 });
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
            <DisplayAnimationSelect
              value={settings.promoSlideLogoAnimation ?? "__inherit"}
              onChange={(value) =>
                setSettings({
                  ...settings,
                  promoSlideLogoAnimation: value === "__inherit" ? null : value,
                })
              }
              allowInherit
            />
            <p className="text-xs text-muted-foreground">
              Movement effect for the logo while the promotion plays — includes Rotating flip (Y),
              Flip (X), Rotate and 3D tilt; same full list everywhere.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 sm:col-span-2">
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
              className="rounded-xl"
            />
            <p className="text-xs text-muted-foreground">
              Size of the messages above/below the promotion image (100% = normal).
            </p>
          </div>
          <div className="space-y-2">
            <Label>Promotion text movement / Message animation</Label>
            <DisplayAnimationSelect
              value={settings.ratePromoTextAnimation ?? "none"}
              onChange={(value) =>
                setSettings({
                  ...settings,
                  ratePromoTextAnimation: value === "none" ? null : value,
                })
              }
            />
            <p className="text-xs text-muted-foreground">
              Same flip options as forex / rate card: Rotating flip (Y), Flip (X), Rotate, 3D tilt,
              and the rest of the shared list.
            </p>
          </div>
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
                <SelectItem value="flip">Flip (3D card turn)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              How the announcement enters and leaves — pick “None” for no motion. Applies to every placement.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Text movement (while visible)</Label>
            <DisplayAnimationSelect
              value={settings.announcementTextAnimation ?? "none"}
              onChange={(value) =>
                setSettings({
                  ...settings,
                  announcementTextAnimation: value === "none" ? null : value,
                })
              }
            />
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
            <DisplayAnimationSelect
              value={settings.tickerLogoAnimation ?? "spin"}
              onChange={(value) =>
                setSettings({ ...settings, tickerLogoAnimation: value ?? "spin" })
              }
            />
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
                Animations (including flip) travel with look &amp; behaviour when you apply to all.
              </p>
              {branchCount > 1 ? (
                <ApplyToAllCheckbox
                  id="settings-apply-all-portal"
                  scope={applyMode === "all" ? "all" : applyMode === "some" ? "specific" : "current"}
                  selectedBranchIds={pickedBranchIds}
                  branches={otherBranches.map((b) => ({ ...b, status: "active" } as any))}
                  currentBranchId={branchId}
                  onScopeChange={(sel) => {
                    setApplyMode(sel.scope === "all" ? "all" : sel.scope === "specific" ? "some" : "this");
                    setPickedBranchIds(sel.selectedBranchIds);
                  }}
                  description="Copies fonts, colours, sizes, animations, timers and layout to selected target branches."
                />
              ) : null}
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
        className={`${saveSlot ? "xl:hidden " : ""}sticky bottom-3 z-20 flex flex-col gap-3 rounded-2xl border border-primary/30 bg-background/95 px-4 py-3 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between`}
      >
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-xs text-muted-foreground">
            Changes go live on the <strong>{branchName}</strong> TV only after you save.
            Animations (including flip) travel with look &amp; behaviour when you apply to all.
          </p>
          {branchCount > 1 ? (
            <ApplyToAllCheckbox
              id="settings-apply-all-sticky"
              scope={applyMode === "all" ? "all" : applyMode === "some" ? "specific" : "current"}
              selectedBranchIds={pickedBranchIds}
              branches={otherBranches.map((b) => ({ ...b, status: "active" } as any))}
              currentBranchId={branchId}
              onScopeChange={(sel) => {
                setApplyMode(sel.scope === "all" ? "all" : sel.scope === "specific" ? "some" : "this");
                setPickedBranchIds(sel.selectedBranchIds);
              }}
              description="Copies fonts, colours, sizes, animations, timers and layout to selected target branches."
            />
          ) : null}
        </div>
        <Button disabled={saving} className="shrink-0 rounded-xl" onClick={() => setConfirmOpen(true)}>
          {saving ? "Saving..." : "Save Branch Settings"}
        </Button>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="max-h-[90dvh] overflow-y-auto rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Apply these display changes?</AlertDialogTitle>
            <AlertDialogDescription>
              The chosen TVs update immediately after saving. Please double-check the values before
              confirming.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {branchCount > 1 ? (
            <div className="space-y-3">
              <div>
                <p className="mb-1.5 text-sm font-medium">Apply to</p>
                <div className="flex flex-wrap gap-1.5">
                  {([
                    ["this", "This branch only"],
                    ["all", `All ${branchCount} branches`],
                    ["some", "Choose branches"],
                  ] as Array<["this" | "all" | "some", string]>).map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setApplyMode(mode)}
                      className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                        applyMode === mode
                          ? "border-primary/60 bg-primary/15 text-primary"
                          : "border-border/50 text-muted-foreground hover:bg-muted/40"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {applyMode === "some" ? (
                <div className="max-h-40 space-y-1.5 overflow-y-auto rounded-xl border border-border/40 p-2">
                  {otherBranches.map((b) => {
                    const on = pickedBranchIds.includes(b.id);
                    return (
                      <label key={b.id} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-muted/40">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() =>
                            setPickedBranchIds((prev) =>
                              on ? prev.filter((id) => id !== b.id) : [...prev, b.id],
                            )
                          }
                          className="h-4 w-4"
                        />
                        <span className="text-sm">
                          {b.name} <span className="text-xs text-muted-foreground">({b.code})</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              ) : null}

              {applyMode !== "this" ? (
                <>
                  <p className="rounded-lg bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                    Copies the look &amp; behaviour (fonts, colours, sizes, <strong>animations</strong>,
                    timers, layout, ticker style) to the chosen branches. Their videos, logos and
                    rates are never changed.
                  </p>
                  <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/50 bg-muted/30 p-3">
                    <input
                      type="checkbox"
                      checked={includePromo}
                      onChange={(e) => setIncludePromo(e.target.checked)}
                      className="mt-0.5 h-4 w-4"
                    />
                    <span className="text-sm">
                      <span className="font-medium">Also copy the promotion images &amp; videos</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        Puts THIS branch&apos;s promotion slide pictures/videos on the chosen branches
                        too, so they all play the same promotions. This replaces whatever promotions
                        those branches currently have.
                      </span>
                    </span>
                  </label>
                </>
              ) : null}
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl"
              onClick={() => {
                // Resolve the target branch ids from the chosen mode.
                const targetBranchIds =
                  applyMode === "all"
                    ? otherBranches.map((b) => b.id)
                    : applyMode === "some"
                      ? pickedBranchIds
                      : [];
                const alsoPromo = applyMode !== "this" && includePromo;
                setConfirmOpen(false);
                setApplyMode("this");
                setPickedBranchIds([]);
                setIncludePromo(false);
                void (async () => {
                  const prepared = await migratePromoMediaForSave(settings);
                  if (prepared !== settings) setSettings(prepared);
                  await onSave(
                    { logoUrl, brandingColor: color, settings: prepared },
                    { targetBranchIds, includePromo: alsoPromo },
                  );
                })();
              }}
              disabled={applyMode === "some" && pickedBranchIds.length === 0}
            >
              {applyMode === "all"
                ? `Yes, apply to all ${branchCount}`
                : applyMode === "some"
                  ? `Yes, apply to ${pickedBranchIds.length || ""} branch${pickedBranchIds.length === 1 ? "" : "es"}`
                  : "Yes, apply to the display"}
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

  // "Copy fonts to ALL branches": writes ONLY the font choices of the current
  // form to every branch's settings — layout, media, timers stay untouched.
  async function copyFontsToAllBranches(current: BranchSettings) {
    if (!user || !profile) return;
    const fontKeys = [
      "displayFont",
      "rateCardFont",
      "tickerLogoFont",
      "tickerMessageFont",
      "ratePromoFont",
      "announcementFont",
    ] as const;
    const fonts: Partial<BranchSettings> = {};
    for (const k of fontKeys) {
      (fonts as Record<string, unknown>)[k] = current[k] ?? null;
    }
    try {
      await Promise.all(
        branches.map((b) =>
          updateBranch(
            b.id,
            { settings: { ...b.settings, ...fonts } },
            { userId: user.uid, userName: profile.displayName || profile.email },
          ),
        ),
      );
      toast.success(`Fonts copied to all ${branches.length} branches — every TV now matches.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not copy the fonts");
    }
  }

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

  async function saveBranchSettings(
    data: { logoUrl: string; brandingColor: string; settings: BranchSettings },
    opts?: { targetBranchIds?: string[]; includePromo?: boolean },
  ) {
    if (!user || !profile || !effectiveBranchId) return;
    setSaving(true);
    const actor = { userId: user.uid, userName: profile.displayName || profile.email };
    try {
      // Always save the branch being edited in full (its own media included).
      await updateBranch(
        effectiveBranchId,
        { logoUrl: data.logoUrl || null, brandingColor: data.brandingColor, settings: data.settings },
        actor,
      );

      const targets = branches.filter(
        (b) => b.id !== effectiveBranchId && (opts?.targetBranchIds ?? []).includes(b.id),
      );
      if (targets.length > 0) {
        // Copy the LOOK & BEHAVIOUR settings (incl. animations) to the chosen
        // branches. Their own CONTENT is preserved — videos live outside
        // settings; logos, announcements and per-branch text stay untouched.
        // The PROMOTION images/videos are preserved too UNLESS the admin ticked
        // "also copy promotions", in which case those branches get THIS branch's
        // promotions so they all play the same ones.
        const CONTENT_KEYS: Array<keyof BranchSettings> = [
          "headerLogoUrl", "headerLogoUrl2", "headerLogoUrls", "promoSlideLogoUrl",
          "tickerLogoUrl", "tickerLogoUrls", "tickerLogoText", "tickerHeadline",
          "announcementText", "announcementImageUrl", "announcementVideoUrl",
          "scrollingLogos", "scrollingLogoItems", "slogan",
        ];
        const PROMO_KEYS: Array<keyof BranchSettings> = [
          "ratePromoMedia", "ratePromoImageUrl", "ratePromoText", "ratePromoTextTop",
        ];
        const skip = opts?.includePromo ? CONTENT_KEYS : [...CONTENT_KEYS, ...PROMO_KEYS];
        const shared: Partial<BranchSettings> = { ...data.settings };
        for (const k of skip) delete shared[k];

        await Promise.all(
          targets.map((b) => updateBranch(b.id, { settings: { ...b.settings, ...shared } }, actor)),
        );
        toast.success(
          opts?.includePromo
            ? `Settings + promotions applied to ${targets.length + 1} branches — they now play the same look and promotions.`
            : `Settings applied to ${targets.length + 1} branches — each keeps its own videos, promotions and logos.`,
          { duration: 8000 },
        );
      } else {
        toast.success("Branch settings saved");
      }
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
                onCopyFontsToAll={copyFontsToAllBranches}
                branchCount={branches.length}
                otherBranches={branches
                  .filter((b) => b.id !== effectiveBranchId)
                  .map((b) => ({ id: b.id, name: b.name, code: b.code }))}
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
