import {
  createDocument,
  listDocuments,
  removeDocument,
  subscribeCollection,
  updateDocument,
  writeAuditLog,
} from "@/lib/firebase/firestore";
import { COLLECTIONS } from "@/lib/constants";
import { normalizeCurrencyCode } from "@/lib/currency-utils";
import type { Branch, BranchSettings, TransferRate } from "@/lib/types";

/**
 * CENTRALIZED money-transfer (remittance) rates — one set from head office,
 * identical on every branch display. Per the client (2026-07-11): forex rates
 * are per-branch, but transfer rates are admin-controlled and shared. Doc id =
 * currency code, so upserts are idempotent.
 */

function sortTransferRates(rows: TransferRate[]): TransferRate[] {
  return [...rows].sort(
    (a, b) =>
      (a.displayOrder ?? 0) - (b.displayOrder ?? 0) || a.currencyCode.localeCompare(b.currencyCode),
  );
}

export async function listTransferRates(): Promise<TransferRate[]> {
  const rows = await listDocuments<TransferRate>(COLLECTIONS.transferRates, []);
  return sortTransferRates(rows);
}

export function subscribeTransferRates(
  callback: (rows: TransferRate[]) => void,
  onError?: (error: Error) => void,
): () => void {
  return subscribeCollection<TransferRate>(
    COLLECTIONS.transferRates,
    [],
    (rows) => callback(sortTransferRates(rows)),
    onError,
  );
}

export async function upsertTransferRate(
  input: {
    currencyCode: string;
    transferUsd: number | null;
    transferLocal: number | null;
    displayOrder?: number;
  },
  actor: { userId: string; userName: string },
): Promise<void> {
  // USD is allowed as a row again (client 2026-07-25) — e.g. "USD | 1 | 3785"
  // shows the base dollar rate on the transfer card.
  const code = normalizeCurrencyCode(input.currencyCode) || input.currencyCode.trim().toUpperCase();
  if (!/^[A-Z]{2,5}$/.test(code)) throw new Error(`Invalid currency code: ${input.currencyCode}`);

  const existing = await listDocuments<TransferRate>(COLLECTIONS.transferRates, []);
  const already = existing.find((r) => r.id === code || r.currencyCode === code);

  if (already) {
    await updateDocument(COLLECTIONS.transferRates, already.id, {
      transferUsd: input.transferUsd ?? null,
      transferLocal: input.transferLocal ?? null,
      updatedBy: actor.userId,
      updatedByName: actor.userName,
    });
  } else {
    await createDocument(
      COLLECTIONS.transferRates,
      {
        currencyCode: code,
        transferUsd: input.transferUsd ?? null,
        transferLocal: input.transferLocal ?? null,
        displayOrder: input.displayOrder ?? existing.length + 1,
        updatedBy: actor.userId,
        updatedByName: actor.userName,
      },
      code,
    );
  }

  await writeAuditLog({
    action: "transfer_rate_update",
    entityType: "transfer_rate",
    entityId: code,
    userId: actor.userId,
    userName: actor.userName,
    branchId: null,
    metadata: { transferUsd: input.transferUsd, transferLocal: input.transferLocal },
  });
}

/** Bulk upsert from the Excel Transfer sheet (admins only — rules enforce it). */
export async function bulkUpsertTransferRates(
  rows: Array<{ currencyCode: string; transferUsd: number | null; transferLocal: number | null }>,
  actor: { userId: string; userName: string },
): Promise<number> {
  let count = 0;
  for (const row of rows) {
    if (!row.transferUsd && !row.transferLocal) continue;
    try {
      await upsertTransferRate({ ...row, displayOrder: count + 1 }, actor);
      count += 1;
    } catch (error) {
      // One bad row (e.g. an invalid currency label) must not abort the whole
      // upload — publish the rest and let the caller report the shortfall.
      console.warn(`Transfer upsert skipped ${row.currencyCode}:`, error);
    }
  }
  return count;
}

/**
 * Reorder the TRANSFER card only: writes displayOrder = position for every code,
 * in the given sequence. Forex order is untouched — the client sorts remittance
 * currencies by importance independently of the exchange-rate card.
 */
export async function reorderTransferRates(
  orderedCodes: string[],
  actor: { userId: string; userName: string },
): Promise<void> {
  await Promise.all(
    orderedCodes.map((code, index) =>
      updateDocument(COLLECTIONS.transferRates, code, {
        displayOrder: index + 1,
        updatedBy: actor.userId,
        updatedByName: actor.userName,
      }),
    ),
  );
  await writeAuditLog({
    action: "transfer_rates_reordered",
    entityType: "transfer_rate",
    entityId: "order",
    userId: actor.userId,
    userName: actor.userName,
    branchId: null,
    metadata: { order: orderedCodes },
  });
}

/** Hide/show a single transfer currency on the card without deleting it.
 *  When used alone this sets the GLOBAL flag (every TV). Prefer
 *  setTransferCurrencyVisibilityOnBranches for per-branch hide/show. */
export async function setTransferRateHidden(
  code: string,
  isHidden: boolean,
  actor: { userId: string; userName: string },
): Promise<void> {
  await updateDocument(COLLECTIONS.transferRates, code, {
    isHidden,
    updatedBy: actor.userId,
    updatedByName: actor.userName,
  });
  void writeAuditLog({
    action: isHidden ? "transfer_rate_hide" : "transfer_rate_show",
    entityType: "transfer_rate",
    entityId: code,
    userId: actor.userId,
    userName: actor.userName,
    branchId: null,
  }).catch(() => undefined);
}

/**
 * Hide or show a remittance currency on selected branches via each branch's
 * settings.hiddenTransferCodes. When every active branch is targeted, also
 * flips the global isHidden flag so older displays stay in sync.
 */
export async function setTransferCurrencyVisibilityOnBranches(
  code: string,
  isHidden: boolean,
  targets: Array<Pick<Branch, "id" | "settings">>,
  actor: { userId: string; userName: string },
  opts?: { allActiveBranchIds?: string[] },
): Promise<number> {
  return setTransferCurrenciesVisibilityOnBranches([code], isHidden, targets, actor, opts);
}

/**
 * Hide or show MANY remittance currencies in one pass.
 * Writes each branch settings doc once (no per-branch audit / re-read) so
 * "all branches" finishes in one parallel wave.
 */
export async function setTransferCurrenciesVisibilityOnBranches(
  codes: string[],
  isHidden: boolean,
  targets: Array<Pick<Branch, "id" | "settings">>,
  actor: { userId: string; userName: string },
  opts?: { allActiveBranchIds?: string[] },
): Promise<number> {
  const normalized = [
    ...new Set(codes.map((c) => normalizeCurrencyCode(c) || c.trim().toUpperCase()).filter(Boolean)),
  ];
  if (normalized.length === 0 || targets.length === 0) return 0;

  const { updateDocument } = await import("@/lib/firebase/firestore");
  const { COLLECTIONS } = await import("@/lib/constants");

  // Use in-memory branch.settings (already loaded in the dashboard). Skipping
  // a fresh getDocument per branch cuts the all-branches path roughly in half.
  const branchResults = await Promise.all(
    targets.map(async (branch) => {
      const prevSettings = { ...(branch.settings ?? {}) } as BranchSettings;
      const current = (prevSettings.hiddenTransferCodes ?? [])
        .map((c) => String(c).toUpperCase())
        .filter(Boolean);
      let next = [...current];
      let changed = false;
      for (const code of normalized) {
        const has = next.includes(code);
        if (isHidden && !has) {
          next.push(code);
          changed = true;
        } else if (!isHidden && has) {
          next = next.filter((c) => c !== code);
          changed = true;
        }
      }
      if (!changed) return 0;
      // Direct doc update — skip updateBranch's per-call audit log.
      await updateDocument(COLLECTIONS.branches, branch.id, {
        settings: { ...prevSettings, hiddenTransferCodes: next } satisfies BranchSettings,
      });
      return 1;
    }),
  );
  const updated = branchResults.reduce((sum: number, n) => sum + n, 0);

  const allIds = opts?.allActiveBranchIds ?? [];
  const targetingAll = allIds.length > 0 && targets.length >= allIds.length;
  if (targetingAll) {
    await Promise.all(normalized.map((code) => setTransferRateHidden(code, isHidden, actor)));
  } else if (!isHidden) {
    const rows = await listTransferRates();
    await Promise.all(
      normalized.map(async (code) => {
        const row = rows.find((r) => r.currencyCode.toUpperCase() === code);
        if (row?.isHidden) await setTransferRateHidden(code, false, actor);
      }),
    );
  }

  void writeAuditLog({
    action: isHidden ? "transfer_rate_hide_scoped" : "transfer_rate_show_scoped",
    entityType: "transfer_rate",
    entityId: normalized.length === 1 ? normalized[0] : normalized.join(","),
    userId: actor.userId,
    userName: actor.userName,
    branchId: targets.length === 1 ? targets[0].id : null,
    metadata: { codes: normalized, isHidden, branchIds: targets.map((t) => t.id), updated },
  }).catch(() => undefined);

  return updated;
}

export async function deleteTransferRate(
  code: string,
  actor: { userId: string; userName: string },
): Promise<void> {
  await removeDocument(COLLECTIONS.transferRates, code);
  await writeAuditLog({
    action: "transfer_rate_delete",
    entityType: "transfer_rate",
    entityId: code,
    userId: actor.userId,
    userName: actor.userName,
    branchId: null,
  });
}
