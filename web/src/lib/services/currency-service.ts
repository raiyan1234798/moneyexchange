import {
  createDocument,
  listDocuments,
  removeDocument,
  subscribeCollection,
  updateDocument,
  orderBy,
  writeAuditLog,
} from "@/lib/firebase/firestore";
import { COLLECTIONS } from "@/lib/constants";
import type { Currency, EntityStatus } from "@/lib/types";

export async function listCurrencies(): Promise<Currency[]> {
  return listDocuments<Currency>(COLLECTIONS.currencies, [orderBy("sortOrder", "asc")]);
}

export function subscribeCurrencies(onData: (items: Currency[]) => void) {
  return subscribeCollection<Currency>(
    COLLECTIONS.currencies,
    [orderBy("sortOrder", "asc")],
    onData,
  );
}

export async function createCurrency(
  data: Omit<Currency, "id" | "createdAt" | "updatedAt">,
  actor: { userId: string; userName: string },
): Promise<string> {
  const id = await createDocument(COLLECTIONS.currencies, data);
  await writeAuditLog({
    action: "currency_add",
    entityType: "currency",
    entityId: id,
    userId: actor.userId,
    userName: actor.userName,
    metadata: { currencyCode: data.currencyCode },
  });
  return id;
}

export async function updateCurrency(
  id: string,
  data: Partial<Currency>,
  actor: { userId: string; userName: string },
): Promise<void> {
  await updateDocument(COLLECTIONS.currencies, id, data);
  await writeAuditLog({
    action: "update",
    entityType: "currency",
    entityId: id,
    userId: actor.userId,
    userName: actor.userName,
    metadata: data,
  });
}

export async function deleteCurrency(
  id: string,
  actor: { userId: string; userName: string },
): Promise<void> {
  await removeDocument(COLLECTIONS.currencies, id);
  await writeAuditLog({
    action: "currency_delete",
    entityType: "currency",
    entityId: id,
    userId: actor.userId,
    userName: actor.userName,
  });
}

export async function toggleCurrencyStatus(
  id: string,
  status: EntityStatus,
  actor: { userId: string; userName: string },
): Promise<void> {
  await updateCurrency(id, { status }, actor);
}
