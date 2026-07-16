"use client";

import { useEffect, useRef, useState } from "react";
import { Upload } from "lucide-react";
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
import { COLLECTIONS, DEFAULT_SYSTEM_SETTINGS, MESSAGE_FONTS } from "@/lib/constants";
import {
  ADVERT_IMAGE_OPTIONS,
  LOGO_IMAGE_OPTIONS,
  MEDIA_DIMENSION_HINTS,
  compressImageToDataUrl,
  readLogoFileAsDataUrl,
} from "@/lib/image-utils";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { updateBranch } from "@/lib/services/branch-service";
import { cn } from "@/lib/utils";
import type { BranchSettings, RateCardPosition, SystemSettings } from "@/lib/types";

const SETTINGS_ID = "global";

function LogoUploadField({
  label,
  hint,
  previewBg = "bg-[#0D2680]",
  value,
  onUpload,
  onClear,
}: {
  label: string;
  hint: string;
  previewBg?: string;
  value: string | null | undefined;
  onUpload: (dataUrl: string) => void;
  onClear: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function handleLogoFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const { dataUrl } = await readLogoFileAsDataUrl(file);
      onUpload(dataUrl);
      toast.success(`${label} uploaded — click Save Branch Settings at the bottom to apply`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not read image");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-2 rounded-xl border border-dashed border-border/50 bg-muted/20 p-4">
      <Label>{label}</Label>
      <p className="text-xs text-muted-foreground">{hint}</p>
      <p className="text-[11px] text-muted-foreground/90">Recommended: {MEDIA_DIMENSION_HINTS.logo}</p>
      <input
        ref={fileRef}
        type="file"
        accept="image/*,.png,.jpg,.jpeg,.webp,.svg,.gif,.bmp"
        aria-label={`Upload ${label}`}
        className="hidden"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          await handleLogoFile(file);
          event.target.value = "";
        }}
      />
      <button
        type="button"
        disabled={uploading}
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void handleLogoFile(e.dataTransfer.files?.[0]);
        }}
        className={`flex min-h-[100px] w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-3 py-4 text-center transition-colors ${
          dragOver
            ? "border-[var(--unimoni-blue)] bg-[var(--unimoni-blue)]/10"
            : "border-border/60 bg-background/50 hover:border-[var(--unimoni-blue)]/50 hover:bg-[var(--unimoni-blue)]/5"
        } ${uploading ? "pointer-events-none opacity-60" : "cursor-pointer"}`}
      >
        <Upload className="h-6 w-6 text-[var(--unimoni-blue)]" />
        <span className="text-sm font-medium">
          {uploading ? "Processing…" : "Click or drop your logo here"}
        </span>
        <span className="text-[11px] text-muted-foreground">PNG, JPG, JPEG, WebP, SVG, GIF</span>
      </button>
      {value ? (
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt={`${label} preview`}
            className={`h-12 w-24 shrink-0 rounded-md object-contain p-1 ${previewBg}`}
          />
          <Button type="button" variant="outline" size="sm" className="rounded-lg" onClick={onClear}>
            Clear
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function SettingsCard({
  title,
  description,
  children,
  variant = "default",
  span = "half",
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  variant?: "default" | "primary" | "amber";
  /** half = one column in the 2-col grid; full = spans both columns */
  span?: "half" | "full";
}) {
  const shell =
    variant === "amber"
      ? "border-amber-500/25 bg-amber-500/[0.04]"
      : variant === "primary"
        ? "border-[var(--unimoni-blue)]/25 bg-[var(--unimoni-blue)]/[0.04]"
        : "border-border/45 bg-card/35";
  return (
    <section
      className={cn(
        "flex h-full flex-col rounded-2xl border p-4 sm:p-5",
        shell,
        span === "full" && "md:col-span-2",
      )}
    >
      <header className="mb-3 shrink-0 border-b border-border/30 pb-2.5">
        <h4 className="text-sm font-semibold tracking-tight">{title}</h4>
        {description ? (
          <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{description}</p>
        ) : null}
      </header>
      <div className="min-h-0 flex-1 space-y-3">{children}</div>
    </section>
  );
}

function SettingsFieldGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2">{children}</div>;
}

function SettingsSwitchRow({
  label,
  hint,
  checked,
  onCheckedChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-border/30 bg-background/30 p-4">
      <div className="min-w-0">
        <Label>{label}</Label>
        {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function FontStyleSelect({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string | null | undefined;
  onChange: (key: string | null) => void;
  hint?: string;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      <Select
        value={value ?? MESSAGE_FONTS[0].key}
        onValueChange={(v) => onChange(v ?? null)}
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
    </div>
  );
}

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
    <div className="space-y-4">
      <div className="grid items-start gap-4 md:grid-cols-2">
      <SettingsCard
        span="half"
        title="Brand & colours"
        description={`Logo URL and accent colour for ${branchName}. Used on the dashboard and as fallbacks on the TV.`}
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
            <Label>Primary colour</Label>
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
      </SettingsCard>

      <SettingsCard
        span="full"
        title="Display logos"
        description="Upload logos for the rate-card header and main video area. Click or drag a file into each box, then Save Branch Settings at the bottom."
        variant="primary"
      >
        <div className="grid gap-4 lg:grid-cols-3">
          <LogoUploadField
            label="Primary logo (rate card header)"
            hint="Main brand logo on the rate-card header. Enable Replace Unimoni below to swap out the default."
            value={settings.headerLogoUrl}
            onUpload={(dataUrl) => setSettings({ ...settings, headerLogoUrl: dataUrl })}
            onClear={() => setSettings({ ...settings, headerLogoUrl: null })}
          />
          <LogoUploadField
            label="Alternate / partner logo"
            hint="Second logo (e.g. Wizz Financial) — show side by side, rotate, or on promo slides."
            value={settings.headerLogoUrl2}
            onUpload={(dataUrl) => setSettings({ ...settings, headerLogoUrl2: dataUrl })}
            onClear={() => setSettings({ ...settings, headerLogoUrl2: null })}
          />
          <LogoUploadField
            label="Main video / promo screen logo"
            hint="Top-left glass badge on the big video area. Leave empty to use the primary logo or unimoni default."
            value={settings.promoPanelLogoUrl}
            onUpload={(dataUrl) => setSettings({ ...settings, promoPanelLogoUrl: dataUrl })}
            onClear={() => setSettings({ ...settings, promoPanelLogoUrl: null })}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Rate-card &amp; promo logo size (%)</Label>
            <Input
              type="number"
              min={80}
              max={250}
              step={5}
              value={Math.round((settings.headerLogoScale ?? 1.35) * 100)}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  headerLogoScale: Math.max(0.8, Math.min(2.5, Number(event.target.value) / 100 || 1.35)),
                })
              }
              className="rounded-xl"
            />
            <p className="text-xs text-muted-foreground">
              Scales the rate-card header logo and the glass badge on the main video area. 135% ≈ unimoni ticker size.
            </p>
          </div>
          <SettingsSwitchRow
            label="Glass branding on main video area"
            hint="Frosted-glass overlay with logo, website and locations on the large promo / video panel."
            checked={settings.showPromoGlassBranding !== false}
            onCheckedChange={(checked) => setSettings({ ...settings, showPromoGlassBranding: checked })}
          />
        </div>
      </SettingsCard>

      <SettingsCard
        span="half"
        title="Logo display options"
        description="How logos appear on rate-card slides, the promotion slide, and during video playback."
      >
        <SettingsFieldGrid>
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
          <div className="space-y-2">
            <Label>Logo on the promotion slide</Label>
            <p className="text-xs text-muted-foreground">
              The rate-card header is hidden on the promo slide by default so the image fills the panel.
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
                <SelectItem value="hide">Hide header (full promo)</SelectItem>
                <SelectItem value="second">Show only the alternate / second logo</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </SettingsFieldGrid>
        <SettingsFieldGrid>
          <SettingsSwitchRow
            label="Replace Unimoni default logo"
            hint="Use your uploaded logo instead of the built-in Unimoni logo."
            checked={settings.replaceDefaultLogo === true}
            onCheckedChange={(checked) => setSettings({ ...settings, replaceDefaultLogo: checked })}
          />
          <SettingsSwitchRow
            label="Rotate primary & alternate logo"
            hint="Alternate header logos on a timer. Requires both logos."
            checked={settings.headerLogoRotationEnabled === true}
            onCheckedChange={(checked) => setSettings({ ...settings, headerLogoRotationEnabled: checked })}
          />
        </SettingsFieldGrid>
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
        <SettingsSwitchRow
          label="Play video sound"
          hint="Audio for the main video player AND rate-card promo videos. Tap the screen once to unmute (browser rule)."
          checked={settings.videoSoundOn === true}
          onCheckedChange={(checked) => setSettings({ ...settings, videoSoundOn: checked })}
        />
      </SettingsCard>

      <SettingsCard
        span="half"
        title="Ticker badge & scrolling logos"
        description="Logo on the breaking-news pop-out badge and extra logos that scroll with the ticker message."
      >
        <div className="space-y-2">
          <Label>Ticker logo (pop-out breaking-news badge)</Label>
          <p className="text-xs text-muted-foreground">
            Leave blank to show the animated unimoni logo. Paste a URL or upload a file below.
          </p>
          <Input
            value={settings.tickerLogoUrl?.startsWith("data:") ? "" : settings.tickerLogoUrl ?? ""}
            onChange={(event) => setSettings({ ...settings, tickerLogoUrl: event.target.value || null })}
            placeholder="https://example.com/logo.png — or upload below"
            disabled={settings.tickerLogoUrl?.startsWith("data:")}
            className="rounded-xl"
          />
          <div className="flex flex-wrap items-center gap-3">
            <Input
              type="file"
              accept="image/*,.png,.jpg,.jpeg,.webp,.svg,.gif"
              aria-label="Upload ticker logo image"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                try {
                  const { dataUrl } = await readLogoFileAsDataUrl(file);
                  setSettings({ ...settings, tickerLogoUrl: dataUrl });
                  toast.success("Logo image ready — click Save Branch Settings to apply");
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Could not read image");
                }
              }}
              className="max-w-xs rounded-xl"
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
        <div className="space-y-2">
          <Label>Scrolling ticker logos</Label>
          <p className="text-xs text-muted-foreground">
            Upload logos to scroll alongside the ticker text (right to left). Add as many as you like.
          </p>
          <Input
            type="file"
            multiple
            accept="image/*,.png,.jpg,.jpeg,.webp,.svg,.gif"
            aria-label="Upload scrolling ticker logos"
            onChange={async (event) => {
              const files = Array.from(event.target.files ?? []);
              if (files.length === 0) return;
              try {
                const urls: string[] = [];
                for (const file of files) {
                  const { dataUrl } = await readLogoFileAsDataUrl(file);
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
      </SettingsCard>

      <SettingsCard
        span="half"
        title="Scrolling message bar"
        description="Bottom ticker speed, colour, and the yellow headline box above it. Edit the scrolling text on the Tickers page."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Scrolling speed (seconds)</Label>
            <Input
              type="number"
              value={settings.tickerSpeed}
              onChange={(event) => setSettings({ ...settings, tickerSpeed: Number(event.target.value) })}
              className="rounded-xl"
            />
          </div>
          <div className="space-y-2">
            <Label>Scrolling message colour</Label>
            <Input
              value={settings.tickerFontColor}
              onChange={(event) => setSettings({ ...settings, tickerFontColor: event.target.value })}
              className="rounded-xl"
            />
          </div>
        </div>
        <SettingsSwitchRow
          label="Show yellow headline box"
          hint='The gold curved box above the ticker (e.g. "WELCOME TO UNIMONI"). Turn off to remove it.'
          checked={settings.showTickerHeadline !== false}
          onCheckedChange={(checked) => setSettings({ ...settings, showTickerHeadline: checked })}
        />
        <div className="space-y-2">
          <Label>Yellow headline box text</Label>
          <Input
            value={settings.tickerHeadline ?? ""}
            onChange={(event) => setSettings({ ...settings, tickerHeadline: event.target.value || null })}
            placeholder="e.g. WELCOME TO UNIMONI"
            disabled={settings.showTickerHeadline === false}
            className="rounded-xl"
          />
          <p className="text-xs text-muted-foreground">
            Separate from the scrolling ticker message (Tickers page). Leave blank to use the branch name.
          </p>
        </div>
      </SettingsCard>

      <SettingsCard
        span="half"
        title="Rate card — layout & timing"
        description="Where the rate card sits on screen, how long it shows, and how fast each slide rotates."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Rate card position</Label>
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
            <Label>Rate card duration (seconds)</Label>
            <p className="text-xs text-muted-foreground">0 = always show the rate card.</p>
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
              How long the promotion slide stays on screen in the rotation.
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
      </SettingsCard>

      <SettingsCard
        span="half"
        title="Rate card — forex & transfer"
        description="Which rate tables appear on the TV and optional note text below the forex card."
      >
        <SettingsFieldGrid>
          <SettingsSwitchRow
            label="Show Foreign Exchange card"
            hint="We Buy / We Sell forex table."
            checked={settings.showForexCard !== false}
            onCheckedChange={(checked) => setSettings({ ...settings, showForexCard: checked })}
          />
          <SettingsSwitchRow
            label="Separate TRANSFER card"
            hint="$ (USD) and local currency columns."
            checked={settings.showTransferCard !== false}
            onCheckedChange={(checked) => setSettings({ ...settings, showTransferCard: checked })}
          />
          <SettingsSwitchRow
            label="Show Buy Rate"
            checked={settings.showBuyRate}
            onCheckedChange={(checked) => setSettings({ ...settings, showBuyRate: checked })}
          />
          <SettingsSwitchRow
            label="Show Sell Rate"
            checked={settings.showSellRate}
            onCheckedChange={(checked) => setSettings({ ...settings, showSellRate: checked })}
          />
        </SettingsFieldGrid>
        <div className="space-y-2">
          <Label>Transfer card — local currency label</Label>
          <Input
            value={settings.transferLocalLabel ?? "UGX"}
            onChange={(event) => setSettings({ ...settings, transferLocalLabel: event.target.value })}
            placeholder="UGX"
            className="rounded-xl"
          />
          <p className="text-xs text-muted-foreground">
            Header for the second transfer column. The first column is always $ (USD).
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
            Bold text at the bottom of the forex rates. Leave blank to hide it.
          </p>
        </div>
      </SettingsCard>

      <SettingsCard
        span="full"
        title="Rate card — promotion slide"
        description="Images and videos that rotate on the narrow rate-card panel. With no text, media fills the whole slide."
        variant="primary"
      >
        <SettingsFieldGrid>
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
            <Label>Message BELOW the image (optional)</Label>
            <Input
              value={settings.ratePromoText ?? ""}
              onChange={(event) =>
                setSettings({ ...settings, ratePromoText: event.target.value || null })
              }
              placeholder="e.g. ZERO FEES ON BANK TRANSFERS!"
              className="rounded-xl"
            />
          </div>
        </SettingsFieldGrid>
        <div className="space-y-2">
          <Label>Images &amp; videos — each rotates as its own screen</Label>
          <p className="text-[11px] text-muted-foreground/90">
            Recommended: {MEDIA_DIMENSION_HINTS.rateCardPromo}. Portrait photos/videos fill the rate-card panel best.
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
      </SettingsCard>

      <SettingsCard
        span="full"
        title="Fonts & sizes"
        description="Choose a font style and size for each area of the TV screen independently."
        variant="primary"
      >
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-3 rounded-xl border border-border/30 bg-background/40 p-4">
            <p className="text-sm font-semibold">Rate card</p>
            <FontStyleSelect
              label="Font style"
              value={settings.rateCardFont}
              onChange={(key) => setSettings({ ...settings, rateCardFont: key })}
            />
            <p className="text-xs text-muted-foreground">
              Overall table size is in Layout &amp; sizing below.
            </p>
          </div>
          <div className="space-y-3 rounded-xl border border-border/30 bg-background/40 p-4">
            <p className="text-sm font-semibold">Scrolling message</p>
            <FontStyleSelect
              label="Font style"
              value={settings.tickerMessageFont}
              onChange={(key) => setSettings({ ...settings, tickerMessageFont: key })}
            />
            <div className="space-y-2">
              <Label>Font size (px)</Label>
              <Input
                type="number"
                min={12}
                max={48}
                value={settings.tickerFontSize}
                onChange={(event) =>
                  setSettings({ ...settings, tickerFontSize: Number(event.target.value) })
                }
                className="rounded-xl"
              />
            </div>
          </div>
          <div className="space-y-3 rounded-xl border border-border/30 bg-background/40 p-4">
            <p className="text-sm font-semibold">Promotional page</p>
            <FontStyleSelect
              label="Font style"
              value={settings.promoFont}
              onChange={(key) => setSettings({ ...settings, promoFont: key })}
            />
            <div className="space-y-2">
              <Label>Font size (%)</Label>
              <Input
                type="number"
                min={70}
                max={200}
                step={5}
                value={Math.round((settings.promoScale ?? 1) * 100)}
                onChange={(event) =>
                  setSettings({ ...settings, promoScale: Number(event.target.value) / 100 })
                }
                className="rounded-xl"
              />
            </div>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard
        span="half"
        title="Announcement — content"
        description="Text, image or video for the timed pop-up. Leave empty to turn off."
        variant="amber"
      >
        <SettingsSwitchRow
          label="Show announcement on the display"
          hint="Hide from TV without deleting your content."
          checked={settings.announcementEnabled !== false}
          onCheckedChange={(checked) => setSettings({ ...settings, announcementEnabled: checked })}
        />
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
          <Label>Image link</Label>
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
            placeholder="Drive, YouTube, or direct image URL"
            disabled={settings.announcementImageUrl?.startsWith("data:")}
            className="rounded-xl"
          />
          <div className="flex flex-wrap items-center gap-2">
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
              className="max-w-[12rem] rounded-xl"
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
        </div>
        <div className="space-y-2">
          <Label>Video (optional)</Label>
          <Input
            value={settings.announcementVideoUrl ?? ""}
            onChange={(event) => {
              const raw = event.target.value;
              if (isYouTubeUrl(raw)) {
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
            placeholder="MP4/WebM or Drive link"
            className="rounded-xl"
          />
          <div className="flex flex-wrap items-center gap-2">
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
              className="max-w-[12rem] rounded-xl"
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
        </div>
      </SettingsCard>

      <SettingsCard
        span="half"
        title="Announcement — timing & style"
        description="Where it appears, animation, colours, and how often it repeats."
        variant="amber"
      >
        <SettingsFieldGrid>
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
                <SelectItem value="lower-third">Lower third (recommended)</SelectItem>
                <SelectItem value="video-top">Video — top strip</SelectItem>
                <SelectItem value="band">Message area — bottom strip</SelectItem>
                <SelectItem value="fullscreen">Full screen</SelectItem>
                <SelectItem value="rate-card">Rate-card panel</SelectItem>
                <SelectItem value="popup">Centered pop-up</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Position on video</Label>
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
                <SelectItem value="bottom">Bottom (default)</SelectItem>
                <SelectItem value="top">Top</SelectItem>
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
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="slide">Slide</SelectItem>
                <SelectItem value="fade">Fade</SelectItem>
                <SelectItem value="zoom">Zoom</SelectItem>
                <SelectItem value="flip">Flip</SelectItem>
              </SelectContent>
            </Select>
          </div>
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
                <SelectItem value="logo">Unimoni colours</SelectItem>
                <SelectItem value="gold">Gold</SelectItem>
                <SelectItem value="navy">Navy blue</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Announcement font</Label>
            <Select
              value={settings.announcementFont ?? MESSAGE_FONTS[0].key}
              onValueChange={(value) =>
                setSettings({
                  ...settings,
                  announcementFont: value ?? null,
                })
              }
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
          </div>
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
                <SelectItem value="repeat">Repeat forever</SelectItem>
                <SelectItem value="times">Set number of times</SelectItem>
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
            </div>
          ) : null}
        </SettingsFieldGrid>
      </SettingsCard>

      <SettingsCard
        span="half"
        title="Video layout"
        description="Main video area width and how media fills the screen."
        variant="primary"
      >
        <SettingsFieldGrid>
          <div className="space-y-2">
            <Label>Video area width (%)</Label>
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
              Rate card takes the rest ({100 - (settings.videoWidthPercent ?? 72)}%).
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
                <SelectItem value="stretch">Stretch to fill (recommended)</SelectItem>
                <SelectItem value="auto">Auto-fit to video</SelectItem>
                <SelectItem value="cover">Fill (may crop)</SelectItem>
                <SelectItem value="contain">Whole frame + blur fill</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </SettingsFieldGrid>
      </SettingsCard>

      <SettingsCard
        span="half"
        title="Rate card & ticker sizing"
        description="Fine-tune rate-table columns, ticker bar, and badge logo."
        variant="primary"
      >
        <SettingsFieldGrid>
          <div className="space-y-2">
            <Label>Rate card — overall size (%)</Label>
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
            <p className="text-xs text-muted-foreground">Scales the whole rate-card table.</p>
          </div>
          <div className="space-y-2">
            <Label>Rate card — currency size (%)</Label>
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
            <p className="text-xs text-muted-foreground">Currency codes only (USD, GBP…).</p>
          </div>
          <div className="space-y-2">
            <Label>Rate card — rate numbers (%)</Label>
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
            <Label>Scrolling bar height (%)</Label>
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
            <Label>Ticker badge logo size (%)</Label>
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
        </SettingsFieldGrid>
      </SettingsCard>
      </div>

      <div className="sticky bottom-0 z-10 border-t border-border/40 bg-background/95 py-4 backdrop-blur-sm">
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
            <div className="space-y-6">
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
              <div className="rounded-xl border border-border/60 bg-card/30 p-4">
                <Label>Live TV preview — {branch.name}</Label>
                <div className="mt-2 overflow-hidden rounded-xl border border-border/60 shadow-lg">
                  <iframe
                    src={`/display/?branch=${encodeURIComponent(branch.code)}`}
                    title={`Live display preview for ${branch.name}`}
                    className="aspect-video w-full border-0"
                  />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Saved changes appear here within seconds after you confirm Save.
                </p>
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
