import { doc, getDoc, onSnapshot, serverTimestamp, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { COLLECTIONS } from "@/lib/constants";
import { subscribeCollection } from "@/lib/firebase/firestore";
import type { Branch } from "@/lib/types";

export type BranchDisplayPrefs = {
  hiddenTransferCodes?: string[];
  updatedAt?: unknown;
};

export function subscribeBranchDisplayPrefs(
  branchId: string,
  onData: (prefs: BranchDisplayPrefs | null) => void,
): () => void {
  if (!branchId) {
    onData(null);
    return () => undefined;
  }
  return onSnapshot(
    doc(db, COLLECTIONS.branchDisplayPrefs, branchId),
    (snap) => {
      onData(snap.exists() ? (snap.data() as BranchDisplayPrefs) : null);
    },
    () => onData(null),
  );
}

/** All branch prefs (≤ MAX_BRANCHES docs) — for dashboard merge. */
export function subscribeAllBranchDisplayPrefs(
  onData: (byBranchId: Record<string, string[]>) => void,
): () => void {
  return subscribeCollection<BranchDisplayPrefs & { id: string }>(
    COLLECTIONS.branchDisplayPrefs,
    [],
    (items) => {
      const map: Record<string, string[]> = {};
      for (const item of items) {
        map[item.id] = (item.hiddenTransferCodes ?? [])
          .map((c) => String(c).toUpperCase())
          .filter(Boolean);
      }
      onData(map);
    },
  );
}

export function mergeBranchWithDisplayPrefs(
  branch: Branch,
  prefCodes: string[] | undefined,
): Branch {
  if (!prefCodes) return branch;
  return {
    ...branch,
    settings: {
      ...(branch.settings ?? {}),
      hiddenTransferCodes: prefCodes,
    },
  };
}

export async function getHiddenTransferCodesForBranch(branchId: string): Promise<string[] | null> {
  const snap = await getDoc(doc(db, COLLECTIONS.branchDisplayPrefs, branchId));
  if (!snap.exists()) return null;
  const codes = (snap.data() as BranchDisplayPrefs).hiddenTransferCodes;
  if (!codes?.length) return [];
  return codes.map((c) => String(c).toUpperCase()).filter(Boolean);
}

/** Resolve current hidden list: prefs doc wins when it exists. */
export async function resolveHiddenTransferCodes(
  branchId: string,
  legacyFromSettings: string[] | null | undefined,
): Promise<string[]> {
  const fromPrefs = await getHiddenTransferCodesForBranch(branchId);
  if (fromPrefs !== null) return fromPrefs;
  return (legacyFromSettings ?? []).map((c) => String(c).toUpperCase()).filter(Boolean);
}

/**
 * Write hidden remittance codes to the small prefs doc — never touch the fat
 * branch.settings blob (Firestore 1 MiB document limit).
 */
export async function setHiddenTransferCodesOnBranches(
  updates: Array<{ branchId: string; hiddenTransferCodes: string[] }>,
): Promise<void> {
  if (updates.length === 0) return;
  const batch = writeBatch(db);
  for (const { branchId, hiddenTransferCodes } of updates) {
    batch.set(
      doc(db, COLLECTIONS.branchDisplayPrefs, branchId),
      {
        hiddenTransferCodes: [...new Set(hiddenTransferCodes.map((c) => c.toUpperCase()))],
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  }
  await batch.commit();
}
