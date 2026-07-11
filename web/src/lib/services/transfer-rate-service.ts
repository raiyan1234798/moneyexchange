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
import type { TransferRate } from "@/lib/types";

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
    await upsertTransferRate(
      { ...row, displayOrder: count + 1 },
      actor,
    );
    count += 1;
  }
  return count;
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
