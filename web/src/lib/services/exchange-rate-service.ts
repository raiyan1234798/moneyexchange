import { addDoc, collection } from "firebase/firestore";
import {
  createDocument,
  listDocuments,
  subscribeCollection,
  updateDocument,
  where,
  orderBy,
  writeAuditLog,
} from "@/lib/firebase/firestore";
import { db } from "@/lib/firebase/client";
import { COLLECTIONS } from "@/lib/constants";
import type { Currency, ExchangeRate, RateHistoryEntry } from "@/lib/types";

export async function listExchangeRates(branchId: string): Promise<ExchangeRate[]> {
  return listDocuments<ExchangeRate>(COLLECTIONS.exchangeRates, [
    where("branchId", "==", branchId),
    orderBy("currencyCode", "asc"),
  ]);
}

export function subscribeBranchExchangeRates(
  branchId: string,
  onData: (rates: ExchangeRate[]) => void,
) {
  return subscribeCollection<ExchangeRate>(
    COLLECTIONS.exchangeRates,
    [where("branchId", "==", branchId), orderBy("currencyCode", "asc")],
    onData,
  );
}

export function subscribeExchangeRates(
  branchId: string,
  onData: (rates: ExchangeRate[]) => void,
) {
  return subscribeCollection<ExchangeRate>(
    COLLECTIONS.exchangeRates,
    [
      where("branchId", "==", branchId),
      where("status", "==", "published"),
      orderBy("currencyCode", "asc"),
    ],
    onData,
  );
}

export async function initializeBranchRates(
  branchId: string,
  currencies: Currency[],
  actor: { userId: string; userName: string; branchName: string },
): Promise<void> {
  const existing = await listExchangeRates(branchId);
  const existingCodes = new Set(existing.map((r) => r.currencyCode));

  for (const currency of currencies.filter((c) => c.status === "active" && !c.isHidden)) {
    if (existingCodes.has(currency.currencyCode)) continue;
    await createDocument(COLLECTIONS.exchangeRates, {
      branchId,
      currencyCode: currency.currencyCode,
      buyRate: 1.0,
      sellRate: 1.0,
      version: 1,
      status: "published",
      updatedBy: actor.userId,
      updatedByName: actor.userName,
      publishedAt: new Date(),
    });
  }
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
