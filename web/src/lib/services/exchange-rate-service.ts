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
  initialRates?: {
    buyRate: number;
    sellRate: number;
    transferUsd?: number | null;
    transferLocal?: number | null;
  },
): Promise<void> {
  const existing = await listExchangeRates(branchId);
  const already = existing.find((r) => r.currencyCode === currency.currencyCode);
  if (already) {
    await updateDocument(COLLECTIONS.exchangeRates, already.id, {
      isHidden: false,
      status: "published",
      ...(initialRates
        ? {
            buyRate: initialRates.buyRate,
            sellRate: initialRates.sellRate,
            transferUsd: initialRates.transferUsd ?? null,
            transferLocal: initialRates.transferLocal ?? null,
          }
        : {}),
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
    buyRate: initialRates?.buyRate ?? 1.0,
    sellRate: initialRates?.sellRate ?? 1.0,
    transferUsd: initialRates?.transferUsd ?? null,
    transferLocal: initialRates?.transferLocal ?? null,
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

/**
 * Hide or show one forex currency on one branch, several branches, or every
 * active branch that already carries that currency code.
 */
export async function setForexCurrencyVisibilityOnBranches(
  currencyCode: string,
  isHidden: boolean,
  branchIds: string[],
  actor: { userId: string; userName: string },
): Promise<number> {
  return setForexCurrenciesVisibilityOnBranches([currencyCode], isHidden, branchIds, actor);
}

/**
 * Hide or show MANY forex currencies in one pass. Lists each branch once and
 * updates all matching rate rows in parallel — much faster than calling
 * setForexCurrencyVisibilityOnBranches per currency.
 */
export async function setForexCurrenciesVisibilityOnBranches(
  currencyCodes: string[],
  isHidden: boolean,
  branchIds: string[],
  actor: { userId: string; userName: string },
): Promise<number> {
  const codes = [
    ...new Set(
      currencyCodes
        .map((c) => c.trim().toUpperCase())
        .filter((c) => /^[A-Z]{3}$/.test(c) || c.length >= 2),
    ),
  ];
  const uniqueBranches = [...new Set(branchIds.filter(Boolean))];
  if (codes.length === 0 || uniqueBranches.length === 0) return 0;
  const codeSet = new Set(codes);

  const perBranch = await Promise.all(
    uniqueBranches.map(async (branchId) => {
      const rates = await listExchangeRates(branchId);
      const matches = rates.filter(
        (r) => codeSet.has(r.currencyCode.toUpperCase()) && r.isHidden !== isHidden,
      );
      if (matches.length === 0) return 0;
      await Promise.all(
        matches.map((rate) => updateDocument(COLLECTIONS.exchangeRates, rate.id, { isHidden })),
      );
      return matches.length;
    }),
  );
  const updated = perBranch.reduce((sum, n) => sum + n, 0);

  if (updated > 0) {
    await writeAuditLog({
      action: isHidden ? "rate_hide_scoped" : "rate_show_scoped",
      entityType: "exchange_rate",
      entityId: codes.length === 1 ? codes[0] : codes.join(","),
      userId: actor.userId,
      userName: actor.userName,
      branchId: uniqueBranches.length === 1 ? uniqueBranches[0] : null,
      metadata: { currencyCodes: codes, isHidden, branchIds: uniqueBranches, updated },
    });
  }
  return updated;
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
  options?: {
    requireApproval?: boolean;
    actorRole?: UserRole;
    displayName?: string;
    remitRate?: number | null;
    transferUsd?: number | null;
    transferLocal?: number | null;
  },
): Promise<"published" | "pending"> {
  // BRANCH USERS update VALUES ONLY (per client): never the display name, the
  // transfer fields, or anything that curates the card — Firestore rules would
  // reject such a write anyway, which used to fail the whole row silently.
  const isBranchUserActor = options?.actorRole === "branchUser";
  const nextDisplayName = isBranchUserActor
    ? rate.displayName || rate.currencyCode
    : options?.displayName?.trim() || rate.displayName || rate.currencyCode;
  const ratesChanged = newBuyRate !== rate.buyRate || newSellRate !== rate.sellRate;
  const nameChanged = nextDisplayName !== (rate.displayName || rate.currencyCode);
  const remitChanged =
    !isBranchUserActor &&
    options?.remitRate !== undefined && (options.remitRate ?? null) !== (rate.remitRate ?? null);
  const transferUsdChanged =
    !isBranchUserActor &&
    options?.transferUsd !== undefined && (options.transferUsd ?? null) !== (rate.transferUsd ?? null);
  const transferLocalChanged =
    !isBranchUserActor &&
    options?.transferLocal !== undefined && (options.transferLocal ?? null) !== (rate.transferLocal ?? null);

  if (!ratesChanged && !nameChanged && !remitChanged && !transferUsdChanged && !transferLocalChanged) {
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
    ...(remitChanged ? { remitRate: options?.remitRate ?? null } : {}),
    ...(transferUsdChanged ? { transferUsd: options?.transferUsd ?? null } : {}),
    ...(transferLocalChanged ? { transferLocal: options?.transferLocal ?? null } : {}),
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
    remitRate?: number | null;
    transferUsd?: number | null;
    transferLocal?: number | null;
  }>,
  actor: { userId: string; userName: string; branchName: string },
  options?: {
    autoCreateCurrencies?: boolean;
    requireApproval?: boolean;
    actorRole?: UserRole;
    /** When false, never create brand-new rate docs (update existing only). */
    allowCreateRates?: boolean;
  },
): Promise<{ processed: number; created: number; skippedNeedApproval: number }> {
  const scopedBranchId = assertBranchId(branchId, "bulkUpdateRates");
  const autoCreate = options?.autoCreateCurrencies !== false;
  // Block creating new branch rates when the caller forbids it, or when a
  // branch user is under the approval workflow (proposing would bypass review).
  const blockNewRates =
    options?.allowCreateRates === false ||
    (options?.requireApproval === true && options?.actorRole === "branchUser");
  // Duplicate codes in one file must not create duplicate rate docs — last row wins.
  const byCode = new Map<string, (typeof updates)[number]>();
  for (const update of updates) {
    byCode.set(normalizeCurrencyCode(update.currencyCode) || update.currencyCode.toUpperCase(), update);
  }
  const uniqueUpdates = [...byCode.values()];
  let existing = await listExchangeRates(scopedBranchId);
  const catalog = autoCreate ? await listCurrencies() : [];
  const catalogByCode = new Map(catalog.map((c) => [c.currencyCode.toUpperCase(), c]));

  for (const update of uniqueUpdates) {
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

  // LOCK the current on-screen order: legacy rows without a displayOrder (or
  // with duplicates) sort by ties, which can visually shuffle after an upload.
  // Admins/managers persist today's effective order ONCE so uploads can never
  // reorder the card — only the values change. (Branch users can't write
  // displayOrder by Firestore rules; their uploads never touch order anyway.)
  if (options?.actorRole !== "branchUser") {
    const seen = new Set<number>();
    let needsNormalize = false;
    for (const row of existing) {
      const d = row.displayOrder;
      if (d == null || seen.has(d)) {
        needsNormalize = true;
        break;
      }
      seen.add(d);
    }
    if (needsNormalize) {
      await Promise.all(
        existing.map((row, index) =>
          updateDocument(COLLECTIONS.exchangeRates, row.id, { displayOrder: index + 1 }),
        ),
      );
      existing.forEach((row, index) => {
        row.displayOrder = index + 1;
      });
    }
  }

  let created = 0;
  let skippedNeedApproval = 0;
  let nextDisplayOrder = existing.reduce((max, r) => Math.max(max, r.displayOrder ?? 0), 0) + 1;

  await Promise.all(
    uniqueUpdates.map(async (update) => {
      const code = normalizeCurrencyCode(update.currencyCode) || update.currencyCode.toUpperCase();
      const label = update.displayName?.trim() || code;
      const rate = existing.find((item) => item.currencyCode.toUpperCase() === code);
      if (!rate) {
        if (blockNewRates) {
          skippedNeedApproval += 1;
          return;
        }
        const displayOrder = nextDisplayOrder;
        nextDisplayOrder += 1;
        created += 1;
        await createDocument(COLLECTIONS.exchangeRates, {
          branchId: scopedBranchId,
          currencyCode: code,
          displayName: label,
          buyRate: update.buyRate,
          sellRate: update.sellRate,
          remitRate: update.remitRate ?? null,
          transferUsd: update.transferUsd ?? null,
          transferLocal: update.transferLocal ?? null,
          version: 1,
          displayOrder,
          isHidden: false,
          status: "published",
          updatedBy: actor.userId,
          updatedByName: actor.userName,
          publishedAt: new Date(),
        });
        return;
      }
      // A transfer-only import row (no buy/sell) must not zero out the existing
      // forex rates — keep the live buy/sell and change only the transfer values.
      const transferOnly =
        update.buyRate === 0 &&
        update.sellRate === 0 &&
        ((update.transferUsd ?? 0) > 0 || (update.transferLocal ?? 0) > 0);
      await updateExchangeRate(
        rate,
        transferOnly ? rate.buyRate : update.buyRate,
        transferOnly ? rate.sellRate : update.sellRate,
        actor,
        "bulk",
        {
          requireApproval: options?.requireApproval,
          actorRole: options?.actorRole,
          displayName: label,
          remitRate: update.remitRate,
          transferUsd: update.transferUsd,
          transferLocal: update.transferLocal,
        },
      );
    }),
  );

  await writeAuditLog({
    action: "rate_bulk_import",
    entityType: "exchange_rate",
    userId: actor.userId,
    userName: actor.userName,
    branchId: scopedBranchId,
    metadata: { count: uniqueUpdates.length, created, skippedNeedApproval },
  });

  return { processed: uniqueUpdates.length, created, skippedNeedApproval };
}

export async function listRateHistory(branchId?: string): Promise<RateHistoryEntry[]> {
  const constraints = branchId
    ? [where("branchId", "==", branchId), orderBy("timestamp", "desc")]
    : [orderBy("timestamp", "desc")];
  return listDocuments<RateHistoryEntry>(COLLECTIONS.rateHistory, constraints);
}
