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
import { COLLECTIONS } from "@/lib/constants";
import type { TickerMessage } from "@/lib/types";

export async function listTickers(branchId: string): Promise<TickerMessage[]> {
  return listDocuments<TickerMessage>(COLLECTIONS.tickerMessages, [
    where("branchId", "==", branchId),
    where("status", "==", "active"),
    orderBy("updatedAt", "desc"),
  ]);
}

function sortTickers(tickers: TickerMessage[]): TickerMessage[] {
  return [...tickers]
    .filter((ticker) => ticker.status === "active")
    .sort((a, b) => {
      const aTime = a.updatedAt instanceof Date ? a.updatedAt.getTime() : 0;
      const bTime = b.updatedAt instanceof Date ? b.updatedAt.getTime() : 0;
      return bTime - aTime;
    });
}

export function subscribeTickers(
  branchId: string,
  onData: (tickers: TickerMessage[]) => void,
  onError?: (error: Error) => void,
) {
  return subscribeCollection<TickerMessage>(
    COLLECTIONS.tickerMessages,
    [
      where("branchId", "==", branchId),
      where("status", "==", "active"),
    ],
    (items) => onData(sortTickers(items)),
    onError,
  );
}

export async function createTicker(
  data: Omit<TickerMessage, "id" | "createdAt" | "updatedAt">,
  actor: { userId: string; userName: string },
): Promise<string> {
  const id = await createDocument(COLLECTIONS.tickerMessages, data);
  await writeAuditLog({
    action: "ticker_change",
    entityType: "ticker",
    entityId: id,
    userId: actor.userId,
    userName: actor.userName,
    branchId: data.branchId ?? null,
    metadata: { change: "create" },
  });
  return id;
}

export async function updateTicker(
  id: string,
  data: Partial<TickerMessage>,
  actor: { userId: string; userName: string },
): Promise<void> {
  await updateDocument(COLLECTIONS.tickerMessages, id, data);
  await writeAuditLog({
    action: "ticker_change",
    entityType: "ticker",
    entityId: id,
    userId: actor.userId,
    userName: actor.userName,
    branchId: data.branchId ?? null,
    metadata: { change: "update", ...data },
  });
}

export async function deleteTicker(
  id: string,
  actor: { userId: string; userName: string },
  branchId?: string | null,
): Promise<void> {
  await removeDocument(COLLECTIONS.tickerMessages, id);
  await writeAuditLog({
    action: "ticker_change",
    entityType: "ticker",
    entityId: id,
    userId: actor.userId,
    userName: actor.userName,
    branchId: branchId ?? null,
    metadata: { change: "delete" },
  });
}
