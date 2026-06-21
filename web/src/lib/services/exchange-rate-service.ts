import { addDoc, collection } from "firebase/firestore";
import {
  createDocument,
  listDocuments,
  removeDocument,
  subscribeCollection,
  updateDocument,
  where,
  orderBy,
  writeAuditLog,
} from "@/lib/firebase/firestore";
import { db } from "@/lib/firebase/client";
import { COLLECTIONS } from "@/lib/constants";
import type { Currency, ExchangeRate, RateHistoryEntry } from "@/lib/types";

function sortRates(rates: ExchangeRate[]): ExchangeRate[] {
  return [...rates].sort(
    (a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0) || a.currencyCode.localeCompare(b.currencyCode),
  );
}

export async function listExchangeRates(branchId: string): Promise<ExchangeRate[]> {
  const rates = await listDocuments<ExchangeRate>(COLLECTIONS.exchangeRates, [
    where("branchId", "==", branchId),
  ]);
  return sortRates(rates);
}

export function subscribeBranchExchangeRates(
  branchId: string,
  onData: (rates: ExchangeRate[]) => void,
  onError?: (error: Error) => void,
) {
  return subscribeCollection<ExchangeRate>(
    COLLECTIONS.exchangeRates,
    [where("branchId", "==", branchId)],
    (items) => onData(sortRates(items)),
    onError,
  );
}

export function subscribeExchangeRates(
  branchId: string,
  onData: (rates: ExchangeRate[]) => void,
  onError?: (error: Error) => void,
) {
  return subscribeCollection<ExchangeRate>(
    COLLECTIONS.exchangeRates,
    [where("branchId", "==", branchId)],
    (items) =>
      onData(
        sortRates(
          items.filter((rate) => rate.status === "published" && rate.isHidden !== true),
        ),
      ),
    onError,
  );
}

export async function initializeBranchRates(
  branchId: string,
  currencies: Currency[],
  actor: { userId: string; userName: string; branchName: string },
): Promise<void> {
  const existing = await listExchangeRates(branchId);
  const existingCodes = new Set(existing.map((r) => r.currencyCode));
  let order = existing.length;

  for (const currency of currencies.filter((c) => c.status === "active" && !c.isHidden)) {
    if (existingCodes.has(currency.currencyCode)) continue;
    order++;
    await createDocument(COLLECTIONS.exchangeRates, {
      branchId,
      currencyCode: currency.currencyCode,
      buyRate: 1.0,
      sellRate: 1.0,
      version: 1,
      displayOrder: order,
      isHidden: false,
      status: "published",
      updatedBy: actor.userId,
      updatedByName: actor.userName,
      publishedAt: new Date(),
    });
  }
}

export async function addBranchRate(
  branchId: string,
  currency: Currency,
  actor: { userId: string; userName: string; branchName: string },
): Promise<void> {
  const existing = await listExchangeRates(branchId);
  const already = existing.find((r) => r.currencyCode === currency.currencyCode);
  if (already) {
    await updateDocument(COLLECTIONS.exchangeRates, already.id, {
      isHidden: false,
      status: "published",
      updatedBy: actor.userId,
      updatedByName: actor.userName,
      updatedAt: new Date(),
    });
    return;
  }
  await createDocument(COLLECTIONS.exchangeRates, {
    branchId,
    currencyCode: currency.currencyCode,
    buyRate: 1.0,
    sellRate: 1.0,
    version: 1,
    displayOrder: existing.length + 1,
    isHidden: false,
    status: "published",
    updatedBy: actor.userId,
    updatedByName: actor.userName,
    publishedAt: new Date(),
  });
  await writeAuditLog({
    action: "rate_add_currency",
    entityType: "exchange_rate",
    userId: actor.userId,
    userName: actor.userName,
    branchId,
    metadata: { currencyCode: currency.currencyCode },
  });
}

export async function removeBranchRate(
  rateId: string,
  actor: { userId: string; userName: string },
  branchId?: string,
): Promise<void> {
  await removeDocument(COLLECTIONS.exchangeRates, rateId);
  await writeAuditLog({
    action: "rate_remove_currency",
    entityType: "exchange_rate",
    entityId: rateId,
    userId: actor.userId,
    userName: actor.userName,
    branchId: branchId ?? null,
  });
}

export async function toggleRateVisibility(
  rateId: string,
  isHidden: boolean,
  actor: { userId: string; userName: string },
  branchId?: string,
): Promise<void> {
  await updateDocument(COLLECTIONS.exchangeRates, rateId, { isHidden });
  await writeAuditLog({
    action: isHidden ? "rate_hide" : "rate_show",
    entityType: "exchange_rate",
    entityId: rateId,
    userId: actor.userId,
    userName: actor.userName,
    branchId: branchId ?? null,
  });
}

export async function reorderRates(
  branchId: string,
  orderedIds: string[],
  actor: { userId: string; userName: string },
): Promise<void> {
  await Promise.all(
    orderedIds.map((id, index) =>
      updateDocument(COLLECTIONS.exchangeRates, id, { displayOrder: index + 1 }),
    ),
  );
  await writeAuditLog({
    action: "rate_reorder",
    entityType: "exchange_rate",
    userId: actor.userId,
    userName: actor.userName,
    branchId,
    metadata: { count: orderedIds.length },
  });
}

export async function updateExchangeRate(
  rate: ExchangeRate,
  newBuyRate: number,
  newSellRate: number,
  actor: { userId: string; userName: string; branchName: string },
  changeType: RateHistoryEntry["changeType"] = "manual",
): Promise<void> {
  const nextVersion = (rate.version ?? 0) + 1;
  await updateDocument(COLLECTIONS.exchangeRates, rate.id, {
    buyRate: newBuyRate,
    sellRate: newSellRate,
    version: nextVersion,
    status: "published",
    updatedBy: actor.userId,
    updatedByName: actor.userName,
    publishedAt: new Date(),
  });

  await addDoc(collection(db, COLLECTIONS.rateHistory), {
    branchId: rate.branchId,
    currencyCode: rate.currencyCode,
    oldBuyRate: rate.buyRate,
    oldSellRate: rate.sellRate,
    newBuyRate,
    newSellRate,
    updatedBy: actor.userId,
    updatedByName: actor.userName,
    branchName: actor.branchName,
    changeType,
    timestamp: new Date(),
  });

  await writeAuditLog({
    action: "rate_change",
    entityType: "exchange_rate",
    entityId: rate.id,
    userId: actor.userId,
    userName: actor.userName,
    branchId: rate.branchId,
    metadata: {
      currencyCode: rate.currencyCode,
      oldBuyRate: rate.buyRate,
      oldSellRate: rate.sellRate,
      newBuyRate,
      newSellRate,
      version: nextVersion,
    },
  });
}

export async function bulkUpdateRates(
  branchId: string,
  updates: Array<{ currencyCode: string; buyRate: number; sellRate: number }>,
  actor: { userId: string; userName: string; branchName: string },
): Promise<void> {
  const existing = await listExchangeRates(branchId);
  await Promise.all(
    updates.map(async (update) => {
      const rate = existing.find((item) => item.currencyCode === update.currencyCode);
      if (!rate) {
        await createDocument(COLLECTIONS.exchangeRates, {
          branchId,
          currencyCode: update.currencyCode,
          buyRate: update.buyRate,
          sellRate: update.sellRate,
          version: 1,
          displayOrder: existing.length + 1,
          isHidden: false,
          status: "published",
          updatedBy: actor.userId,
          updatedByName: actor.userName,
          publishedAt: new Date(),
        });
        return;
      }
      await updateExchangeRate(rate, update.buyRate, update.sellRate, actor, "bulk");
    }),
  );
}

export async function listRateHistory(branchId?: string): Promise<RateHistoryEntry[]> {
  const constraints = branchId
    ? [where("branchId", "==", branchId), orderBy("timestamp", "desc")]
    : [orderBy("timestamp", "desc")];
  return listDocuments<RateHistoryEntry>(COLLECTIONS.rateHistory, constraints);
}
