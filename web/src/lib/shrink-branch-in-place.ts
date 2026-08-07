/**
 * Shrink an already-oversize branch document from the browser:
 * upload each local `data:` URL to R2, then PATCH that single field so the
 * resulting Firestore doc gets smaller (any full rewrite of a 1.1MB doc fails).
 */

import { doc, updateDoc } from "@/lib/d1/firestore-compat";
import { db } from "@/lib/firebase/client";
import { COLLECTIONS } from "@/lib/constants";
import { isR2UploadConfigured, uploadFileToR2 } from "@/lib/r2-upload";
import type { BranchSettings } from "@/lib/types";
import { InlineMediaMigrationError } from "@/lib/migrate-inline-media";

function isDataUrl(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("data:");
}

async function dataUrlToR2(dataUrl: string, branchId: string, label: string): Promise<string> {
  if (!isR2UploadConfigured()) {
    throw new InlineMediaMigrationError(
      "Cloudflare R2 is not configured — cannot free space on this branch document.",
    );
  }
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const ext = (blob.type.split("/")[1] || "png").replace("+xml", "");
  const file = new File([blob], `${label}-${Date.now()}.${ext}`, {
    type: blob.type || "image/png",
  });
  const r2 = await uploadFileToR2(file, branchId);
  return r2.downloadUrl;
}

async function patchFields(branchId: string, fields: Record<string, unknown>): Promise<void> {
  if (Object.keys(fields).length === 0) return;
  await updateDoc(doc(db, COLLECTIONS.branches, branchId), fields);
}

/**
 * Move inline media from the in-memory draft onto R2 and patch Firestore
 * field-by-field. Returns the slimmed settings (+ logoUrl) for the following save.
 */
export async function shrinkBranchMediaInPlace(opts: {
  branchId: string;
  settings: BranchSettings;
  logoUrl?: string | null;
  onProgress?: (message: string) => void;
}): Promise<{ settings: BranchSettings; logoUrl?: string | null; migrated: number }> {
  const { branchId, onProgress } = opts;
  let settings = { ...opts.settings };
  let logoUrl = opts.logoUrl;
  let migrated = 0;

  const bump = (label: string) => {
    migrated += 1;
    onProgress?.(`Uploading ${label} to R2…`);
  };

  // Promo gallery
  {
    const legacy = settings.ratePromoImageUrl
      ? [{ type: "image" as const, url: settings.ratePromoImageUrl }]
      : [];
    const list = [...legacy, ...(settings.ratePromoMedia ?? [])];
    if (list.some((m) => isDataUrl(m.url))) {
      const next: Array<{ type: "image" | "video"; url: string }> = [];
      for (let i = 0; i < list.length; i++) {
        const m = list[i];
        if (isDataUrl(m.url)) {
          bump(`promo-${i + 1}`);
          next.push({ type: m.type, url: await dataUrlToR2(m.url, branchId, `promo-${i + 1}`) });
        } else {
          next.push(m);
        }
      }
      settings = { ...settings, ratePromoImageUrl: null, ratePromoMedia: next };
      await patchFields(branchId, {
        "settings.ratePromoMedia": next,
        "settings.ratePromoImageUrl": null,
      });
    }
  }

  const scalars: Array<keyof BranchSettings> = [
    "headerLogoUrl",
    "headerLogoUrl2",
    "promoSlideLogoUrl",
    "tickerLogoUrl",
    "announcementImageUrl",
    "announcementVideoUrl",
    "videoPlaceholderImageUrl",
  ];
  for (const key of scalars) {
    const current = settings[key];
    if (isDataUrl(current)) {
      bump(String(key));
      const url = await dataUrlToR2(current, branchId, String(key));
      settings = { ...settings, [key]: url };
      await patchFields(branchId, { [`settings.${key}`]: url });
    }
  }

  for (const key of ["headerLogoUrls", "tickerLogoUrls", "scrollingLogos"] as const) {
    const list = settings[key];
    if (!list?.some(isDataUrl)) continue;
    const next: string[] = [];
    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      if (isDataUrl(item)) {
        bump(`${key}-${i + 1}`);
        next.push(await dataUrlToR2(item, branchId, `${key}-${i + 1}`));
      } else {
        next.push(item);
      }
    }
    settings = { ...settings, [key]: next };
    await patchFields(branchId, { [`settings.${key}`]: next });
  }

  if (settings.scrollingLogoItems?.some((i) => isDataUrl(i.url))) {
    const items = [];
    for (let i = 0; i < (settings.scrollingLogoItems?.length ?? 0); i++) {
      const item = settings.scrollingLogoItems![i];
      if (isDataUrl(item.url)) {
        bump(`scroll-item-${i + 1}`);
        items.push({
          ...item,
          url: await dataUrlToR2(item.url, branchId, `scroll-item-${i + 1}`),
        });
      } else {
        items.push(item);
      }
    }
    settings = { ...settings, scrollingLogoItems: items };
    await patchFields(branchId, { "settings.scrollingLogoItems": items });
  }

  if (settings.tickerLogoScales?.some((i) => isDataUrl(i.url))) {
    const items = [];
    for (let i = 0; i < (settings.tickerLogoScales?.length ?? 0); i++) {
      const item = settings.tickerLogoScales![i];
      if (isDataUrl(item.url)) {
        bump(`ticker-scale-${i + 1}`);
        items.push({
          ...item,
          url: await dataUrlToR2(item.url, branchId, `ticker-scale-${i + 1}`),
        });
      } else {
        items.push(item);
      }
    }
    settings = { ...settings, tickerLogoScales: items };
    await patchFields(branchId, { "settings.tickerLogoScales": items });
  }

  if (isDataUrl(logoUrl)) {
    bump("logoUrl");
    logoUrl = await dataUrlToR2(logoUrl, branchId, "branch-logo");
    await patchFields(branchId, { logoUrl });
  }

  return { settings, logoUrl, migrated };
}
