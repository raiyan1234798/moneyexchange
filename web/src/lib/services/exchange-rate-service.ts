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
import { buildCurrencyPayload, normalizeCurrencyCode } from "@/lib/currency-utils";
import { assertBranchId } from "@/lib/branch-isolation";
import { createCurrency, listCurrencies } from "@/lib/services/currency-service";
import { createRatePendingApproval } from "@/lib/services/pending-approval-service";
import type { Currency, ExchangeRate, RateHistoryEntry, UserRole } from "@/lib/types";

function sortRates(rates: ExchangeRate[]): ExchangeRate[] {
  return [...rates].sort(
    (a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0) || a.currencyCode.localeCompare(b.currencyCode),
  );
}

export async function listExchangeRates(branchId: string): Promise<ExchangeRate[]> {
  const scopedBranchId = assertBranchId(branchId, "listExchangeRates");
  const rates = await listDocuments<ExchangeRate>(COLLECTIONS.exchangeRates, [
    where("branchId", "==", scopedBranchId),
  ]);
  return sortRates(rates);
}

export function subscribeBranchExchangeRates(
  branchId: string,
  onData: (rates: ExchangeRate[]) => void,
  onError?: (error: Error) => void,
) {
  const scopedBranchId = assertBranchId(branchId, "subscribeBranchExchangeRates");
  return subscribeCollection<ExchangeRate>(
    COLLECTIONS.exchangeRates,
    [where("branchId", "==", scopedBranchId)],
    (items) => onData(sortRates(items)),
    onError,
  );
}

/** Display signage: published rates for one branch only — never cross-branch. */
export function subscribeExchangeRates(
  branchId: string,
  onData: (rates: ExchangeRate[]) => void,
  onError?: (error: Error) => void,
) {
  const scopedBranchId = assertBranchId(branchId, "subscribeExchangeRates");
  return subscribeCollection<ExchangeRate>(
    COLLECTIONS.exchangeRates,
    [
      where("branchId", "==", scopedBranchId),
      where("status", "==", "published"),
    ],
    (items) => onData(sortRates(items.filter((rate) => rate.isHidden !== true))),
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
      displayName: currency.currencyName || currency.currencyCode,
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
    displayName: currency.currencyName || currency.currencyCode,
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
  options?: { requireApproval?: boolean; actorRole?: UserRole; displayName?: string },
): Promise<"published" | "pending"> {
  const nextDisplayName = options?.displayName?.trim() || rate.displayName || rate.currencyCode;
  const ratesChanged = newBuyRate !== rate.buyRate || newSellRate !== rate.sellRate;
  const nameChanged = nextDisplayName !== (rate.displayName || rate.currencyCode);

  if (!ratesChanged && !nameChanged) {
    return "published";
  }

  const needsApproval =
    ratesChanged && options?.requireApproval === true && options.actorRole === "branchUser";

  if (needsApproval) {
    // Do NOT touch the live exchange_rates doc — it must keep showing its
    // current published rate on the TV until a manager approves. The proposed
    // change lives only in pending_approvals until then.
    await createRatePendingApproval(rate, newBuyRate, newSellRate, actor);
    await writeAuditLog({
      action: "rate_change_pending",
      entityType: "exchange_rate",
      entityId: rate.id,
      userId: actor.userId,
      userName: actor.userName,
      branchId: rate.branchId,
      metadata: {
        currencyCode: rate.currencyCode,
        proposedBuyRate: newBuyRate,
        proposedSellRate: newSellRate,
      },
    });
    return "pending";
  }

  const nextVersion = ratesChanged ? (rate.version ?? 0) + 1 : (rate.version ?? 1);
  await updateDocument(COLLECTIONS.exchangeRates, rate.id, {
    ...(ratesChanged ? { buyRate: newBuyRate, sellRate: newSellRate } : {}),
    ...(nameChanged ? { displayName: nextDisplayName } : {}),
    version: nextVersion,
    status: "published",
    updatedBy: actor.userId,
    updatedByName: actor.userName,
    publishedAt: new Date(),
  });

  if (ratesChanged) {
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
  }

  await writeAuditLog({
    action: ratesChanged ? "rate_change" : "rate_display_name_change",
    entityType: "exchange_rate",
    entityId: rate.id,
    userId: actor.userId,
    userName: actor.userName,
    branchId: rate.branchId,
    metadata: {
      currencyCode: rate.currencyCode,
      ...(ratesChanged
        ? {
            oldBuyRate: rate.buyRate,
            oldSellRate: rate.sellRate,
            newBuyRate,
            newSellRate,
          }
        : {}),
      ...(nameChanged ? { displayName: nextDisplayName } : {}),
      version: nextVersion,
    },
  });
  return "published";
}

export async function bulkUpdateRates(
  branchId: string,
  updates: Array<{
    currencyCode: string;
    displayName?: string;
    currencyName?: string;
    country?: string;
    flag?: string;
    buyRate: number;
    sellRate: number;
  }>,
  actor: { userId: string; userName: string; branchName: string },
  options?: { autoCreateCurrencies?: boolean; requireApproval?: boolean; actorRole?: UserRole },
): Promise<number> {
  const scopedBranchId = assertBranchId(branchId, "bulkUpdateRates");
  const autoCreate = options?.autoCreateCurrencies !== false;
  let existing = await listExchangeRates(scopedBranchId);
  const catalog = autoCreate ? await listCurrencies() : [];
  const catalogByCode = new Map(catalog.map((c) => [c.currencyCode.toUpperCase(), c]));

  for (const update of updates) {
    const code = normalizeCurrencyCode(update.currencyCode) || update.currencyCode.toUpperCase();
    const catalogFields = buildCurrencyPayload({
      currencyCode: code,
      currencyName: update.currencyName,
      country: update.country,
      flag: update.flag,
    });
    if (!catalogByCode.has(code) && autoCreate) {
      const sortOrder = catalog.length + 1;
      const currencyId = await createCurrency(
        {
          currencyCode: catalogFields.currencyCode,
          currencyName: catalogFields.currencyName,
          country: catalogFields.country,
          flag: catalogFields.flag,
          sortOrder,
          status: "active",
          isHidden: false,
        },
        { userId: actor.userId, userName: actor.userName },
      );
      catalog.push({
        id: currencyId,
        currencyCode: catalogFields.currencyCode,
        currencyName: catalogFields.currencyName,
        country: catalogFields.country,
        flag: catalogFields.flag,
        sortOrder,
        status: "active",
        isHidden: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      catalogByCode.set(code, catalog[catalog.length - 1]);
    }
  }

  existing = await listExchangeRates(scopedBranchId);

  await Promise.all(
    updates.map(async (update) => {
      const code = normalizeCurrencyCode(update.currencyCode) || update.currencyCode.toUpperCase();
      const label = update.displayName?.trim() || code;
      const rate = existing.find((item) => item.currencyCode.toUpperCase() === code);
      if (!rate) {
        await createDocument(COLLECTIONS.exchangeRates, {
          branchId: scopedBranchId,
          currencyCode: code,
          displayName: label,
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
      await updateExchangeRate(rate, update.buyRate, update.sellRate, actor, "bulk", {
        requireApproval: options?.requireApproval,
        actorRole: options?.actorRole,
        displayName: label,
      });
    }),
  );

  await writeAuditLog({
    action: "rate_bulk_import",
    entityType: "exchange_rate",
    userId: actor.userId,
    userName: actor.userName,
    branchId: scopedBranchId,
    metadata: { count: updates.length },
  });

  return updates.length;
}

export async function listRateHistory(branchId?: string): Promise<RateHistoryEntry[]> {
  const constraints = branchId
    ? [where("branchId", "==", branchId), orderBy("timestamp", "desc")]
    : [orderBy("timestamp", "desc")];
  return listDocuments<RateHistoryEntry>(COLLECTIONS.rateHistory, constraints);
}
