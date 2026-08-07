/**
 * Branch display settings writes:
 *  1) Migrate any inline `data:` media to Cloudflare R2
 *  2) Persist full settings to Cloudflare D1 (source of truth)
 *  3) Keep only a thin Firestore index row (id/name/status/logo URL) — no fat settings blob
 */

import { doc, updateDoc } from "@/lib/d1/firestore-compat";
import { db } from "@/lib/firebase/client";
import { COLLECTIONS } from "@/lib/constants";
import { timestampNow } from "@/lib/firebase/firestore";
import type { Branch, BranchSettings } from "@/lib/types";
import {
  InlineMediaMigrationError,
  prepareBranchSettingsForWrite,
} from "@/lib/migrate-inline-media";
import { putBranchSettingsToD1 } from "@/lib/d1/branch-settings-client";

function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    out[k] = v;
  }
  return out as T;
}

/**
 * Prepare + write branch fields. Display settings go to Cloudflare D1 + R2.
 * Firestore only stores lightweight branch index fields.
 */
export async function safeUpdateBranchFields(
  branchId: string,
  data: Partial<Branch>,
  opts?: { onProgress?: (message: string) => void },
): Promise<Partial<Branch>> {
  let payload: Partial<Branch> = { ...data };

  if (payload.settings) {
    opts?.onProgress?.("Uploading images to Cloudflare R2…");
    const prepared = await prepareBranchSettingsForWrite({
      branchId,
      settings: payload.settings,
      logoUrl: payload.logoUrl,
      onProgress: opts?.onProgress,
    });
    payload = {
      ...payload,
      settings: prepared.settings,
      logoUrl: prepared.logoUrl ?? payload.logoUrl,
    };

    opts?.onProgress?.("Saving display settings to Cloudflare…");
    await putBranchSettingsToD1({
      branchId,
      settings: prepared.settings,
      logoUrl: prepared.logoUrl ?? payload.logoUrl,
      name: payload.name,
      code: payload.code,
      status: payload.status,
      brandingColor: payload.brandingColor,
    });
  } else if (typeof payload.logoUrl === "string" && payload.logoUrl.startsWith("data:")) {
    const prepared = await prepareBranchSettingsForWrite({
      branchId,
      settings: {} as BranchSettings,
      logoUrl: payload.logoUrl,
      onProgress: opts?.onProgress,
    });
    payload = { ...payload, logoUrl: prepared.logoUrl ?? "" };
  }

  const clean = stripUndefined(payload as Record<string, unknown>) as Partial<Branch>;

  // Thin Firestore index only — never rewrite the fat settings map.
  const firestoreIndex: Record<string, unknown> = {
    updatedAt: timestampNow(),
    settingsHost: "cloudflare-d1",
  };
  for (const key of [
    "name",
    "code",
    "status",
    "brandingColor",
    "logoUrl",
    "displayOrder",
    "address",
    "city",
    "phone",
  ] as const) {
    if (clean[key] !== undefined) firestoreIndex[key] = clean[key];
  }

  try {
    await updateDoc(doc(db, COLLECTIONS.branches, branchId), firestoreIndex);
  } catch (error) {
    // Settings already saved on Cloudflare — index sync failure must not undo that.
    console.warn("[branch] Firestore index sync failed after D1 save", error);
    if (!clean.settings) throw error;
  }

  return clean;
}

export { InlineMediaMigrationError };
