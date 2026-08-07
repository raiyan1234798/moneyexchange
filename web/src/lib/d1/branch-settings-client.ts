/**
 * Cloudflare D1 is the source of truth for branch display settings.
 * Firebase Auth is used only to authorize writes. Media files live in R2.
 */

import { auth } from "@/lib/firebase/client";
import type { Branch, BranchSettings } from "@/lib/types";

export type D1BranchSettingsRow = {
  id: string;
  code?: string | null;
  name?: string | null;
  status?: string | null;
  logoUrl?: string | null;
  brandingColor?: string | null;
  settings: BranchSettings;
  updatedAt?: string | null;
};

async function authHeaders(): Promise<HeadersInit> {
  const user = auth.currentUser;
  if (!user) throw new Error("Sign in required to save branch display settings.");
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

/** Public read — used by dashboard + TV display. */
export async function listBranchSettingsFromD1(): Promise<D1BranchSettingsRow[]> {
  try {
    const res = await fetch("/api/d1/branch-settings?all=1");
    if (!res.ok) return [];
    const data = (await res.json()) as { branches?: D1BranchSettingsRow[] };
    return Array.isArray(data.branches) ? data.branches : [];
  } catch {
    return [];
  }
}

export async function getBranchSettingsFromD1(
  branchId: string,
): Promise<D1BranchSettingsRow | null> {
  if (!branchId) return null;
  try {
    const res = await fetch(
      `/api/d1/branch-settings?branchId=${encodeURIComponent(branchId)}`,
    );
    if (res.status === 404) return null;
    if (!res.ok) return null;
    return (await res.json()) as D1BranchSettingsRow;
  } catch {
    return null;
  }
}

/** Write branch display settings to Cloudflare D1 (required path for Saves). */
export async function putBranchSettingsToD1(input: {
  branchId: string;
  settings: BranchSettings;
  logoUrl?: string | null;
  name?: string | null;
  code?: string | null;
  status?: string | null;
  brandingColor?: string | null;
}): Promise<void> {
  const headers = await authHeaders();
  const res = await fetch("/api/d1/branch-settings", {
    method: "PUT",
    headers,
    body: JSON.stringify({
      branchId: input.branchId,
      settings: input.settings,
      logoUrl: input.logoUrl ?? null,
      name: input.name ?? null,
      code: input.code ?? null,
      status: input.status ?? null,
      brandingColor: input.brandingColor ?? null,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { error?: string }).error ||
        `Cloudflare D1 save failed (${res.status})`,
    );
  }
}

/** Overlay D1 settings onto Firestore branch shells (id/name/status still from Auth app index). */
export function mergeBranchesWithD1(
  branches: Branch[],
  d1Rows: D1BranchSettingsRow[],
): Branch[] {
  if (!d1Rows.length) return branches;
  const byId = new Map(d1Rows.map((r) => [r.id, r]));
  return branches.map((b) => {
    const row = byId.get(b.id);
    if (!row) return b;
    return {
      ...b,
      logoUrl: row.logoUrl ?? b.logoUrl,
      brandingColor: row.brandingColor ?? b.brandingColor,
      settings: { ...(b.settings ?? {}), ...(row.settings ?? {}) },
    };
  });
}

export async function hydrateBranchesFromD1(branches: Branch[]): Promise<Branch[]> {
  const rows = await listBranchSettingsFromD1();
  return mergeBranchesWithD1(branches, rows);
}
