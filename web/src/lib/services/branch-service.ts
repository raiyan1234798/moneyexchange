import { collection, doc, onSnapshot, query } from "firebase/firestore";
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
import { COLLECTIONS, DEFAULT_BRANCH_SETTINGS } from "@/lib/constants";
import type { Branch, DashboardStats, EntityStatus } from "@/lib/types";

export function subscribeBranchByCode(
  branchCode: string,
  onData: (branch: Branch | null) => void,
) {
  const normalized = branchCode.trim().toUpperCase();
  if (!normalized) {
    onData(null);
    return () => undefined;
  }

  const q = query(
    collection(db, COLLECTIONS.branches),
    where("code", "==", normalized),
    where("status", "==", "active"),
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const docSnap = snapshot.docs[0];
      if (!docSnap) {
        onData(null);
        return;
      }
      onData({ id: docSnap.id, ...docSnap.data() } as Branch);
    },
    () => onData(null),
  );
}

export function subscribeBranch(branchId: string, onData: (branch: Branch | null) => void) {
  return onSnapshot(
    doc(db, COLLECTIONS.branches, branchId),
    (snapshot) => {
      if (!snapshot.exists()) {
        onData(null);
        return;
      }
      onData({ id: snapshot.id, ...snapshot.data() } as Branch);
    },
    () => onData(null),
  );
}

export async function listBranches(): Promise<Branch[]> {
  return listDocuments<Branch>(COLLECTIONS.branches, [orderBy("name", "asc")]);
}

export function subscribeBranches(onData: (branches: Branch[]) => void) {
  return subscribeCollection<Branch>(
    COLLECTIONS.branches,
    [orderBy("name", "asc")],
    onData,
  );
}

export async function createBranch(
  data: Omit<Branch, "id" | "createdAt" | "updatedAt">,
  actor: { userId: string; userName: string },
): Promise<string> {
  const id = await createDocument(COLLECTIONS.branches, {
    ...data,
    settings: { ...DEFAULT_BRANCH_SETTINGS, ...data.settings },
  });
  await writeAuditLog({
    action: "create",
    entityType: "branch",
    entityId: id,
    userId: actor.userId,
    userName: actor.userName,
    metadata: { name: data.name, code: data.code },
  });
  return id;
}

export async function updateBranch(
  id: string,
  data: Partial<Branch>,
  actor: { userId: string; userName: string },
): Promise<void> {
  await updateDocument(COLLECTIONS.branches, id, data);
  await writeAuditLog({
    action: "update",
    entityType: "branch",
    entityId: id,
    userId: actor.userId,
    userName: actor.userName,
    metadata: data as Record<string, unknown>,
  });
}

export async function disableBranch(
  id: string,
  actor: { userId: string; userName: string },
): Promise<void> {
  await updateBranch(id, { status: "disabled" as EntityStatus }, actor);
}

export async function deleteBranch(
  id: string,
  actor: { userId: string; userName: string },
): Promise<void> {
  await removeDocument(COLLECTIONS.branches, id);
  await writeAuditLog({
    action: "delete",
    entityType: "branch",
    entityId: id,
    userId: actor.userId,
    userName: actor.userName,
  });
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const [branches, tvs, currencies, rates, auditLogs] = await Promise.all([
    listDocuments<Branch>(COLLECTIONS.branches),
    listDocuments<{ status: string }>(COLLECTIONS.tvDevices),
    listDocuments(COLLECTIONS.currencies),
    listDocuments<{ status: string }>(COLLECTIONS.exchangeRates, [
      where("status", "==", "pending"),
    ]),
    listDocuments(COLLECTIONS.auditLogs, [orderBy("timestamp", "desc")]),
  ]);

  return {
    totalBranches: branches.length,
    activeTvs: tvs.filter((tv) => tv.status === "online").length,
    offlineTvs: tvs.filter((tv) => tv.status === "offline").length,
    totalCurrencies: currencies.length,
    pendingRateApprovals: rates.length,
    recentAuditEvents: auditLogs.slice(0, 20).length,
  };
}
