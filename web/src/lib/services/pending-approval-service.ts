import {
  createDocument,
  getDocument,
  listDocuments,
  subscribeCollection,
  updateDocument,
  where,
  orderBy,
  writeAuditLog,
} from "@/lib/firebase/firestore";
import { COLLECTIONS } from "@/lib/constants";
import { assertBranchId } from "@/lib/branch-isolation";
import type { ExchangeRate, PendingApproval } from "@/lib/types";

export async function createRatePendingApproval(
  rate: ExchangeRate,
  proposedBuy: number,
  proposedSell: number,
  actor: { userId: string; userName: string; branchName: string },
): Promise<string> {
  const branchId = assertBranchId(rate.branchId, "createRatePendingApproval");
  return createDocument(COLLECTIONS.pendingApprovals, {
    type: "rate_change",
    branchId,
    branchName: actor.branchName,
    entityType: "exchange_rate",
    entityId: rate.id,
    currencyCode: rate.currencyCode,
    proposedBuyRate: proposedBuy,
    proposedSellRate: proposedSell,
    previousBuyRate: rate.buyRate,
    previousSellRate: rate.sellRate,
    status: "pending",
    requestedBy: actor.userId,
    requestedByName: actor.userName,
  });
}

export function subscribePendingApprovals(
  branchId: string | null,
  onData: (items: PendingApproval[]) => void,
  onError?: (error: Error) => void,
) {
  const constraints = branchId
    ? [
        where("status", "==", "pending"),
        where("branchId", "==", assertBranchId(branchId, "subscribePendingApprovals")),
        orderBy("createdAt", "desc"),
      ]
    : [where("status", "==", "pending"), orderBy("createdAt", "desc")];

  return subscribeCollection<PendingApproval>(
    COLLECTIONS.pendingApprovals,
    constraints,
    onData,
    onError,
  );
}

export async function listPendingApprovals(branchId?: string): Promise<PendingApproval[]> {
  const constraints = branchId
    ? [
        where("status", "==", "pending"),
        where("branchId", "==", assertBranchId(branchId, "listPendingApprovals")),
        orderBy("createdAt", "desc"),
      ]
    : [where("status", "==", "pending"), orderBy("createdAt", "desc")];
  return listDocuments<PendingApproval>(COLLECTIONS.pendingApprovals, constraints);
}

export async function approvePendingRate(
  approval: PendingApproval,
  actor: { userId: string; userName: string },
): Promise<void> {
  if (!approval.entityId) return;

  const rate = await getDocument<ExchangeRate>(COLLECTIONS.exchangeRates, approval.entityId);
  const version = (rate?.version ?? 0) + 1;

  await updateDocument(COLLECTIONS.exchangeRates, approval.entityId, {
    buyRate: approval.proposedBuyRate,
    sellRate: approval.proposedSellRate,
    version,
    status: "published",
    updatedBy: actor.userId,
    updatedByName: actor.userName,
    publishedAt: new Date(),
  });

  await updateDocument(COLLECTIONS.pendingApprovals, approval.id, {
    status: "approved",
    reviewedBy: actor.userId,
    reviewedByName: actor.userName,
    reviewedAt: new Date(),
  });

  await writeAuditLog({
    action: "rate_approval_approved",
    entityType: "exchange_rate",
    entityId: approval.entityId,
    userId: actor.userId,
    userName: actor.userName,
    branchId: approval.branchId,
    metadata: {
      currencyCode: approval.currencyCode,
      proposedBuyRate: approval.proposedBuyRate,
      proposedSellRate: approval.proposedSellRate,
    },
  });
}

export async function rejectPendingRate(
  approval: PendingApproval,
  actor: { userId: string; userName: string },
  reason?: string,
): Promise<void> {
  await updateDocument(COLLECTIONS.pendingApprovals, approval.id, {
    status: "rejected",
    reviewedBy: actor.userId,
    reviewedByName: actor.userName,
    reviewedAt: new Date(),
    rejectReason: reason ?? null,
  });

  await writeAuditLog({
    action: "rate_approval_rejected",
    entityType: "exchange_rate",
    entityId: approval.entityId ?? null,
    userId: actor.userId,
    userName: actor.userName,
    branchId: approval.branchId,
    metadata: { currencyCode: approval.currencyCode, reason },
  });
}
