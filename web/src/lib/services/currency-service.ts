import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
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
import type { Currency, EntityStatus } from "@/lib/types";

/** How a currency LOOKS everywhere — admin-editable, overrides the built-in catalog. */
export interface CurrencyOverride {
  id: string;
  code: string;
  flag?: string;
  name?: string;
  country?: string;
}

const OVERRIDES_COLLECTION = "currency_overrides";

export function subscribeCurrencyOverrides(
  onData: (byCode: Record<string, CurrencyOverride>) => void,
  onError?: (error: Error) => void,
) {
  return subscribeCollection<CurrencyOverride>(OVERRIDES_COLLECTION, [], (items) => {
    const map: Record<string, CurrencyOverride> = {};
    for (const item of items) map[(item.code || item.id).toUpperCase()] = item;
    onData(map);
  }, onError);
}

/**
 * Save an admin's look-changes for one currency (flag emoji, name, country):
 * writes the public override the TV display reads, and keeps the catalog
 * document in sync when one exists for that code.
 */
export async function saveCurrencyOverride(
  code: string,
  data: { flag: string; name: string; country: string },
  actor: { userId: string; userName: string },
): Promise<void> {
  const upper = code.trim().toUpperCase();
  if (!upper) throw new Error("Currency code is required");
  await setDoc(
    doc(db, OVERRIDES_COLLECTION, upper),
    {
      code: upper,
      flag: data.flag.trim(),
      name: data.name.trim(),
      country: data.country.trim(),
      updatedBy: actor.userName,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  // Best-effort catalog sync so dashboards list the same look.
  try {
    const catalog = await listDocuments<Currency>(COLLECTIONS.currencies, [
      where("currencyCode", "==", upper),
    ]);
    await Promise.all(
      catalog.map((c) =>
        updateDocument(COLLECTIONS.currencies, c.id, {
          flag: data.flag.trim(),
          currencyName: data.name.trim(),
          country: data.country.trim(),
        }),
      ),
    );
  } catch {
    // Catalog sync is cosmetic — the override alone drives the display.
  }
  await writeAuditLog({
    action: "currency_look_updated",
    entityType: "currency",
    entityId: upper,
    userId: actor.userId,
    userName: actor.userName,
    metadata: { code: upper, ...data },
  });
}

export async function listCurrencies(): Promise<Currency[]> {
  return listDocuments<Currency>(COLLECTIONS.currencies, [orderBy("sortOrder", "asc")]);
}

export function subscribeCurrencies(
  onData: (items: Currency[]) => void,
  onError?: (error: Error) => void,
) {
  return subscribeCollection<Currency>(
    COLLECTIONS.currencies,
    [orderBy("sortOrder", "asc")],
    onData,
    onError,
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
