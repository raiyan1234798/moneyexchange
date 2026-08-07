/**
 * Offload base64 `data:` URLs from branch settings (and logoUrl) to Cloudflare R2
 * so Firestore branch docs stay under the 1 MiB hard limit.
 *
 * Fail-closed: if R2 is required and an upload fails, throws — callers must not
 * keep bloating the document with the original data URL.
 */

import { isR2UploadConfigured, uploadFileToR2 } from "@/lib/r2-upload";
import type { BranchSettings } from "@/lib/types";

/** Soft ceiling before a write — leave headroom under Firestore's 1_048_576.
 *  Kept well below 1 MiB because Firestore encoding + sibling fields inflate size. */
export const BRANCH_SETTINGS_SOFT_LIMIT_BYTES = 750_000;

/** Hard reject — never attempt a full settings write above this. */
export const BRANCH_SETTINGS_HARD_LIMIT_BYTES = 950_000;

export class InlineMediaMigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InlineMediaMigrationError";
  }
}

function isDataUrl(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("data:");
}

async function dataUrlToR2(dataUrl: string, branchId: string, label: string): Promise<string> {
  if (!isR2UploadConfigured()) {
    throw new InlineMediaMigrationError(
      `Cannot save ${label}: Cloudflare R2 is not configured, and the file is stored inline. Ask an admin to enable R2 uploads.`,
    );
  }
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const ext = (blob.type.split("/")[1] || "png").replace("+xml", "");
  const file = new File([blob], `${label}-${Date.now()}.${ext}`, {
    type: blob.type || "image/png",
  });
  try {
    const r2 = await uploadFileToR2(file, branchId);
    return r2.downloadUrl;
  } catch (error) {
    throw new InlineMediaMigrationError(
      error instanceof Error
        ? `Could not upload ${label} to R2: ${error.message}`
        : `Could not upload ${label} to R2`,
    );
  }
}

async function migrateStringField(
  value: string | null | undefined,
  branchId: string,
  label: string,
): Promise<string | null | undefined> {
  if (!isDataUrl(value)) return value;
  return dataUrlToR2(value, branchId, label);
}

async function migrateStringList(
  list: string[] | undefined,
  branchId: string,
  label: string,
): Promise<string[] | undefined> {
  if (!list?.length) return list;
  if (!list.some(isDataUrl)) return list;
  const out: string[] = [];
  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    out.push(isDataUrl(item) ? await dataUrlToR2(item, branchId, `${label}-${i + 1}`) : item);
  }
  return out;
}

function legacyPromo(s: BranchSettings): Array<{ type: "image" | "video"; url: string }> {
  return s.ratePromoImageUrl ? [{ type: "image" as const, url: s.ratePromoImageUrl }] : [];
}

/** Approximate UTF-8 byte length of a JSON-serializable value. */
export function estimateJsonBytes(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).length;
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

export function assertBranchPayloadUnderLimit(payload: {
  logoUrl?: string | null;
  settings: BranchSettings;
}): void {
  const bytes = estimateJsonBytes(payload);
  if (bytes > BRANCH_SETTINGS_SOFT_LIMIT_BYTES) {
    throw new InlineMediaMigrationError(
      `Branch display data is still too large (~${Math.round(bytes / 1024)} KB). Remove unused promo slides or re-run the R2 media backfill, then try again.`,
    );
  }
}

export type MigrateInlineMediaResult = {
  settings: BranchSettings;
  logoUrl?: string | null;
  migratedCount: number;
};

/**
 * Replace every `data:` media field on branch settings (+ optional logoUrl) with R2 HTTPS URLs.
 */
export async function migrateBranchInlineMedia(opts: {
  branchId: string;
  settings: BranchSettings;
  logoUrl?: string | null;
  onProgress?: (message: string) => void;
}): Promise<MigrateInlineMediaResult> {
  const { branchId, onProgress } = opts;
  let settings = { ...opts.settings };
  let logoUrl = opts.logoUrl;
  let migratedCount = 0;

  const bump = (label: string) => {
    migratedCount += 1;
    onProgress?.(`Uploading ${label} to cloud storage…`);
  };

  // Promo gallery (+ legacy single image folded in)
  {
    const list = [...legacyPromo(settings), ...(settings.ratePromoMedia ?? [])];
    if (list.some((m) => isDataUrl(m.url))) {
      const migrated: Array<{ type: "image" | "video"; url: string }> = [];
      for (let i = 0; i < list.length; i++) {
        const m = list[i];
        if (isDataUrl(m.url)) {
          bump(`promo-${i + 1}`);
          migrated.push({ type: m.type, url: await dataUrlToR2(m.url, branchId, `promo-${i + 1}`) });
        } else {
          migrated.push(m);
        }
      }
      settings = { ...settings, ratePromoImageUrl: null, ratePromoMedia: migrated };
    } else if (settings.ratePromoImageUrl) {
      settings = { ...settings, ratePromoImageUrl: null, ratePromoMedia: list };
    }
  }

  const scalarFields: Array<keyof BranchSettings> = [
    "headerLogoUrl",
    "headerLogoUrl2",
    "promoSlideLogoUrl",
    "tickerLogoUrl",
    "announcementImageUrl",
    "announcementVideoUrl",
    "videoPlaceholderImageUrl",
  ];
  for (const key of scalarFields) {
    const current = settings[key];
    if (isDataUrl(current)) {
      bump(String(key));
      settings = {
        ...settings,
        [key]: await dataUrlToR2(current as string, branchId, String(key)),
      };
    }
  }

  if (settings.headerLogoUrls?.some(isDataUrl)) {
    bump("headerLogoUrls");
    settings = {
      ...settings,
      headerLogoUrls: await migrateStringList(settings.headerLogoUrls, branchId, "header-logo"),
    };
  }

  if (settings.tickerLogoUrls?.some(isDataUrl)) {
    bump("tickerLogoUrls");
    settings = {
      ...settings,
      tickerLogoUrls: await migrateStringList(settings.tickerLogoUrls, branchId, "ticker-logo"),
    };
  }

  if (settings.scrollingLogos?.some(isDataUrl)) {
    bump("scrollingLogos");
    settings = {
      ...settings,
      scrollingLogos: await migrateStringList(settings.scrollingLogos, branchId, "scroll-logo"),
    };
  }

  if (settings.scrollingLogoItems?.some((item) => isDataUrl(item.url))) {
    bump("scrollingLogoItems");
    const items = [];
    for (let i = 0; i < (settings.scrollingLogoItems?.length ?? 0); i++) {
      const item = settings.scrollingLogoItems![i];
      if (isDataUrl(item.url)) {
        items.push({
          ...item,
          url: await dataUrlToR2(item.url, branchId, `scroll-item-${i + 1}`),
        });
      } else {
        items.push(item);
      }
    }
    settings = { ...settings, scrollingLogoItems: items };
  }

  if (settings.tickerLogoScales?.some((item) => isDataUrl(item.url))) {
    bump("tickerLogoScales");
    const items = [];
    for (let i = 0; i < (settings.tickerLogoScales?.length ?? 0); i++) {
      const item = settings.tickerLogoScales![i];
      if (isDataUrl(item.url)) {
        items.push({
          ...item,
          url: await dataUrlToR2(item.url, branchId, `ticker-scale-${i + 1}`),
        });
      } else {
        items.push(item);
      }
    }
    settings = { ...settings, tickerLogoScales: items };
  }

  if (isDataUrl(logoUrl)) {
    bump("logoUrl");
    logoUrl = await dataUrlToR2(logoUrl, branchId, "branch-logo");
  }

  // Catch-all: any future / unknown field still holding a data: URL.
  const deep = await deepMigrateDataUrls(settings, branchId, bump);
  settings = deep.value;
  migratedCount += deep.migrated;

  return { settings, logoUrl, migratedCount };
}

/**
 * Walk an arbitrary JSON value and upload every `data:` string to R2.
 * Used as a safety net so new media fields can't silently re-bloat docs.
 */
export async function deepMigrateDataUrls<T>(
  value: T,
  branchId: string,
  onBump?: (label: string) => void,
  path = "value",
): Promise<{ value: T; migrated: number }> {
  let migrated = 0;
  if (isDataUrl(value)) {
    onBump?.(path);
    return {
      value: (await dataUrlToR2(value, branchId, path.replace(/[^\w.-]+/g, "-").slice(0, 80))) as T,
      migrated: 1,
    };
  }
  if (Array.isArray(value)) {
    const out = [];
    for (let i = 0; i < value.length; i++) {
      const r = await deepMigrateDataUrls(value[i], branchId, onBump, `${path}[${i}]`);
      out.push(r.value);
      migrated += r.migrated;
    }
    return { value: out as T, migrated };
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const r = await deepMigrateDataUrls(v, branchId, onBump, `${path}.${k}`);
      out[k] = r.value;
      migrated += r.migrated;
    }
    return { value: out as T, migrated };
  }
  return { value, migrated };
}

/** Paths of remaining `data:` strings (for diagnostics / fail-closed checks). */
export function listInlineDataUrlPaths(value: unknown, path = "root"): string[] {
  const found: string[] = [];
  if (typeof value === "string") {
    if (value.startsWith("data:")) found.push(path);
    return found;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => found.push(...listInlineDataUrlPaths(item, `${path}[${i}]`)));
    return found;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      found.push(...listInlineDataUrlPaths(v, `${path}.${k}`));
    }
  }
  return found;
}

/**
 * Prepare branch settings for a Firestore write: migrate every inline media
 * URL to R2, fail closed if any remain, and reject oversized payloads before
 * they hit Firestore's 1 MiB hard limit.
 */
export async function prepareBranchSettingsForWrite(opts: {
  branchId: string;
  settings: BranchSettings;
  logoUrl?: string | null;
  onProgress?: (message: string) => void;
}): Promise<MigrateInlineMediaResult> {
  const migrated = await migrateBranchInlineMedia(opts);
  const leftover = [
    ...listInlineDataUrlPaths(migrated.settings, "settings"),
    ...(isDataUrl(migrated.logoUrl) ? ["logoUrl"] : []),
  ];
  if (leftover.length > 0) {
    throw new InlineMediaMigrationError(
      `Cannot save: ${leftover.length} image(s) are still stored inline (${leftover.slice(0, 3).join(", ")}). Enable R2 uploads and try again.`,
    );
  }
  const bytes = estimateJsonBytes({
    logoUrl: migrated.logoUrl ?? "",
    settings: migrated.settings,
  });
  if (bytes > BRANCH_SETTINGS_HARD_LIMIT_BYTES) {
    throw new InlineMediaMigrationError(
      `Branch display data is still too large (~${Math.round(bytes / 1024)} KB) even after moving images to R2. Remove unused promo slides, then try again.`,
    );
  }
  if (bytes > BRANCH_SETTINGS_SOFT_LIMIT_BYTES) {
    opts.onProgress?.(
      `Display data is large (~${Math.round(bytes / 1024)} KB) — saving carefully…`,
    );
  }
  return migrated;
}

export function isFirestoreDocumentSizeError(error: unknown): boolean {
  const msg =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error && "message" in error
        ? String((error as { message: unknown }).message)
        : String(error ?? "");
  return /exceeds the maximum allowed size|invalid-argument.*size|too large/i.test(msg);
}

/**
 * Compress/prepare a File, then upload to R2 when configured so state never
 * holds a fat data URL. Falls back to the provided dataUrl builder only when
 * R2 is unavailable (local/dev).
 */
export async function storeImageForBranch(opts: {
  file: File;
  branchId: string;
  label: string;
  toDataUrl: (file: File) => Promise<string>;
}): Promise<string> {
  const { file, branchId, label, toDataUrl } = opts;
  if (isR2UploadConfigured()) {
    // Prefer uploading the original/compressed file blob when possible.
    // Callers may pass an already-compressed File; otherwise we upload as-is
    // after a client-side compress to data URL then re-blob (keeps size down).
    const dataUrl = await toDataUrl(file);
    if (dataUrl.startsWith("data:")) {
      return dataUrlToR2(dataUrl, branchId, label);
    }
    return dataUrl;
  }
  return toDataUrl(file);
}

/** True if settings / logo still contain any inline data URLs. */
export function branchHasInlineMedia(settings: BranchSettings, logoUrl?: string | null): boolean {
  if (isDataUrl(logoUrl)) return true;
  if (isDataUrl(settings.ratePromoImageUrl)) return true;
  if (settings.ratePromoMedia?.some((m) => isDataUrl(m.url))) return true;
  for (const key of [
    "headerLogoUrl",
    "headerLogoUrl2",
    "promoSlideLogoUrl",
    "tickerLogoUrl",
    "announcementImageUrl",
    "videoPlaceholderImageUrl",
  ] as const) {
    if (isDataUrl(settings[key])) return true;
  }
  if (settings.headerLogoUrls?.some(isDataUrl)) return true;
  if (settings.tickerLogoUrls?.some(isDataUrl)) return true;
  if (settings.scrollingLogos?.some(isDataUrl)) return true;
  if (settings.scrollingLogoItems?.some((i) => isDataUrl(i.url))) return true;
  if (settings.tickerLogoScales?.some((i) => isDataUrl(i.url))) return true;
  if (isDataUrl(settings.announcementVideoUrl)) return true;
  return listInlineDataUrlPaths(settings, "settings").length > 0;
}
