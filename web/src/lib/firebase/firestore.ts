import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getAggregateFromServer,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  sum,
  updateDoc,
  where,
  type DocumentData,
  type QueryConstraint,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { normalizeFirestoreError } from "@/lib/firebase/firestore-errors";
import type { AuditLog } from "@/lib/types";

export { getFirestoreErrorMessage, isFirestoreIndexBuildingError, isFirestoreIndexError } from "@/lib/firebase/firestore-errors";

export function timestampNow() {
  return serverTimestamp();
}

export async function getDocument<T>(collectionName: string, id: string): Promise<T | null> {
  const snapshot = await getDoc(doc(db, collectionName, id));
  if (!snapshot.exists()) return null;
  return { id: snapshot.id, ...snapshot.data() } as T;
}

export async function listDocuments<T>(
  collectionName: string,
  constraints: QueryConstraint[] = [],
): Promise<T[]> {
  try {
    const q = query(collection(db, collectionName), ...constraints);
    const snapshot = await getDocs(q);
    return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as T);
  } catch (error) {
    throw normalizeFirestoreError(error, `Failed to load ${collectionName}`);
  }
}

export async function createDocument<T extends DocumentData>(
  collectionName: string,
  data: T,
  id?: string,
): Promise<string> {
  if (id) {
    await setDoc(doc(db, collectionName, id), {
      ...data,
      createdAt: timestampNow(),
      updatedAt: timestampNow(),
    });
    return id;
  }
  const ref = await addDoc(collection(db, collectionName), {
    ...data,
    createdAt: timestampNow(),
    updatedAt: timestampNow(),
  });
  return ref.id;
}

export async function updateDocument<T extends DocumentData>(
  collectionName: string,
  id: string,
  data: Partial<T>,
): Promise<void> {
  await updateDoc(doc(db, collectionName, id), {
    ...data,
    updatedAt: timestampNow(),
  });
}

export async function removeDocument(collectionName: string, id: string): Promise<void> {
  await deleteDoc(doc(db, collectionName, id));
}

export function subscribeCollection<T>(
  collectionName: string,
  constraints: QueryConstraint[],
  onData: (items: T[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const q = query(collection(db, collectionName), ...constraints);
  return onSnapshot(
    q,
    (snapshot) => {
      onData(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as T));
    },
    (error) => onError?.(normalizeFirestoreError(error, `Failed to load ${collectionName}`)),
  );
}

export async function writeAuditLog(entry: Omit<AuditLog, "id" | "timestamp">): Promise<void> {
  await addDoc(collection(db, "audit_logs"), {
    ...entry,
    timestamp: timestampNow(),
  });
}

export { collection, doc, query, where, orderBy, limit, onSnapshot, getDocs, getDoc };

/**
 * Server-side SUM of a numeric field across matching documents — computed by
 * Firestore without downloading any docs. Used to total storage usage across all
 * branches cheaply (the alternative, fetching every video/image doc, would be
 * slow and heavy). Returns 0 on any error so a meter never blocks the page.
 */
export async function sumField(
  collectionName: string,
  field: string,
  constraints: QueryConstraint[] = [],
): Promise<number> {
  try {
    const snapshot = await getAggregateFromServer(
      query(collection(db, collectionName), ...constraints),
      { total: sum(field) },
    );
    return snapshot.data().total ?? 0;
  } catch {
    return 0;
  }
}
