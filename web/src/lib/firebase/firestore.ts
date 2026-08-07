/**
 * App data layer — Cloudflare D1 (via /api/d1/docs) + R2 for files.
 * Firebase/Google is used for Authentication only.
 *
 * The function names historically matched Firestore helpers so existing
 * services keep working without a wholesale rewrite.
 */

import type { AuditLog } from "@/lib/types";
import {
  d1BulkUpsert,
  d1DeleteDoc,
  d1GetDoc,
  d1ListDocs,
  d1SubscribeCollection,
  d1UpsertDoc,
  type D1Constraint,
} from "@/lib/d1/docs-client";
import { normalizeFirestoreError } from "@/lib/firebase/firestore-errors";

export type QueryConstraint = D1Constraint;
export type Unsubscribe = () => void;
export type DocumentData = Record<string, unknown>;

/** ISO timestamp string — replaces Firestore serverTimestamp() in payloads. */
export function timestampNow(): string {
  return new Date().toISOString();
}

/** Minimal Timestamp shim for UI code that calls `.toDate()`. */
export class Timestamp {
  constructor(private readonly iso: string) {}
  toDate(): Date {
    return new Date(this.iso);
  }
  toMillis(): number {
    return this.toDate().getTime();
  }
  static now(): Timestamp {
    return new Timestamp(new Date().toISOString());
  }
  static fromDate(d: Date): Timestamp {
    return new Timestamp(d.toISOString());
  }
  static fromMillis(ms: number): Timestamp {
    return new Timestamp(new Date(ms).toISOString());
  }
}

export function where(
  field: string,
  op: "==" | "!=" | "<" | "<=" | ">" | ">=" | "in" | "array-contains",
  value: unknown,
): QueryConstraint {
  return { type: "where", field, op, value };
}

export function orderBy(field: string, direction: "asc" | "desc" = "asc"): QueryConstraint {
  return { type: "orderBy", field, direction };
}

export function limit(n: number): QueryConstraint {
  return { type: "limit", n };
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID().replace(/-/g, "").slice(0, 20);
  return `id_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function stripUndefined(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue;
    out[k] = v;
  }
  return out;
}

export async function getDocument<T>(collectionName: string, id: string): Promise<T | null> {
  return d1GetDoc<T>(collectionName, id);
}

export async function listDocuments<T>(
  collectionName: string,
  constraints: QueryConstraint[] = [],
): Promise<T[]> {
  try {
    return await d1ListDocs<T>(collectionName, constraints);
  } catch (error) {
    throw normalizeFirestoreError(error, `Failed to load ${collectionName}`);
  }
}

export async function createDocument<T extends DocumentData>(
  collectionName: string,
  data: T,
  id?: string,
): Promise<string> {
  const docId = id || newId();
  const now = timestampNow();
  await d1UpsertDoc(collectionName, docId, stripUndefined({
    ...data,
    createdAt: (data as { createdAt?: unknown }).createdAt ?? now,
    updatedAt: now,
  }));
  return docId;
}

export async function updateDocument<T extends DocumentData>(
  collectionName: string,
  id: string,
  data: Partial<T>,
): Promise<void> {
  await d1UpsertDoc(
    collectionName,
    id,
    stripUndefined({
      ...(data as Record<string, unknown>),
      updatedAt: timestampNow(),
    }),
    { merge: true },
  );
}

export async function removeDocument(collectionName: string, id: string): Promise<void> {
  await d1DeleteDoc(collectionName, id);
}

export function subscribeCollection<T>(
  collectionName: string,
  constraints: QueryConstraint[],
  onData: (items: T[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return d1SubscribeCollection(collectionName, constraints, onData, onError);
}

export async function writeAuditLog(entry: Omit<AuditLog, "id" | "timestamp">): Promise<void> {
  const id = newId();
  await d1UpsertDoc("audit_logs", id, {
    ...entry,
    timestamp: timestampNow(),
  });
}

export async function sumField(
  collectionName: string,
  field: string,
  constraints: QueryConstraint[] = [],
): Promise<number> {
  try {
    const docs = await d1ListDocs<Record<string, unknown>>(collectionName, constraints);
    return docs.reduce((sum, d) => sum + (Number(d[field]) || 0), 0);
  } catch {
    return 0;
  }
}

export async function countDocuments(
  collectionName: string,
  constraints: QueryConstraint[] = [],
): Promise<number> {
  const docs = await d1ListDocs(collectionName, constraints);
  return docs.length;
}

export async function deleteAuditLogsBefore(
  cutoff: Date | null,
  onProgress?: (deletedSoFar: number) => void,
): Promise<number> {
  const all = await d1ListDocs<{ id: string; timestamp?: string }>("audit_logs", []);
  const cutoffMs = cutoff ? cutoff.getTime() : null;
  let total = 0;
  for (const row of all) {
    const ts = row.timestamp ? new Date(row.timestamp).getTime() : 0;
    if (cutoffMs != null && !(ts < cutoffMs)) continue;
    await d1DeleteDoc("audit_logs", row.id);
    total += 1;
    if (total % 50 === 0) onProgress?.(total);
  }
  onProgress?.(total);
  return total;
}

/** @deprecated no-op stubs kept for imports that still mention Firestore shapes */
export function collection(_db: unknown, name: string) {
  return { __collection: name };
}
export function doc(_dbOrCol: unknown, ...path: string[]) {
  if (typeof _dbOrCol === "object" && _dbOrCol && "__collection" in (_dbOrCol as object)) {
    return { __collection: (_dbOrCol as { __collection: string }).__collection, __id: path[0] };
  }
  return { __collection: path[0], __id: path[1] };
}
export function query(..._args: unknown[]) {
  return { __query: true, args: _args };
}
export async function getDocs(_q: unknown) {
  return { docs: [], empty: true, size: 0 };
}
export async function getDoc(_ref: unknown) {
  return { exists: () => false, data: () => undefined, id: "" };
}
export function onSnapshot(..._args: unknown[]): Unsubscribe {
  return () => undefined;
}

export {
  getFirestoreErrorMessage,
  isFirestoreIndexBuildingError,
  isFirestoreIndexError,
  normalizeFirestoreError,
} from "@/lib/firebase/firestore-errors";

// Re-export bulk helper for migration scripts / admin tools
export { d1BulkUpsert };
