/**
 * Drop-in stand-ins for the firebase/firestore helpers used across the app.
 * Backed by Cloudflare D1 (+ R2 for media). Firebase Auth stays separate.
 */

import {
  d1DeleteDoc,
  d1GetDoc,
  d1ListDocs,
  d1SubscribeCollection,
  d1UpsertDoc,
  type D1Constraint,
} from "@/lib/d1/docs-client";

export type Unsubscribe = () => void;
export type DocumentData = Record<string, unknown>;
export type DocumentReference = DocRef;

export class Timestamp {
  constructor(private readonly iso: string) {}
  toDate(): Date {
    return new Date(this.iso);
  }
  toMillis(): number {
    return this.toDate().getTime();
  }
  isEqual(other: Timestamp): boolean {
    return this.iso === other.iso;
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

export function serverTimestamp(): string {
  return new Date().toISOString();
}

/** Sentinel deleted later during strip — matches Firestore deleteField(). */
export function deleteField(): { __delete: true } {
  return { __delete: true };
}

export function arrayUnion(...items: unknown[]): { __arrayUnion: unknown[] } {
  return { __arrayUnion: items };
}

export function arrayRemove(...items: unknown[]): { __arrayRemove: unknown[] } {
  return { __arrayRemove: items };
}

type DocRef = { collection: string; id: string; path: string };
type ColRef = { collection: string };
type QueryRef = { collection: string; constraints: D1Constraint[] };

export function collection(_db: unknown, name: string, ...more: string[]): ColRef {
  if (more.length === 0) return { collection: name };
  // collection(db, "video_chunks", videoId, "parts") → flat collection key
  return { collection: [name, ...more].join("__") };
}

export function doc(dbOrCol: unknown, ...path: string[]): DocRef {
  if (
    typeof dbOrCol === "object" &&
    dbOrCol &&
    "collection" in (dbOrCol as object) &&
    !("id" in (dbOrCol as object))
  ) {
    const col = dbOrCol as ColRef;
    const id = String(path[0] ?? "");
    return { collection: col.collection, id, path: `${col.collection}/${id}` };
  }
  // doc(db, col, id) OR doc(db, col, id, sub, subId, ...)
  if (path.length >= 2) {
    if (path.length === 2) {
      return {
        collection: path[0],
        id: path[1],
        path: `${path[0]}/${path[1]}`,
      };
    }
    // Nested: flatten to collection=a__b__c, id=last
    const id = path[path.length - 1];
    const collectionName = path.slice(0, -1).join("__");
    return { collection: collectionName, id, path: path.join("/") };
  }
  return { collection: String(path[0] || "unknown"), id: "unknown", path: "unknown" };
}

export function where(
  field: string,
  op: "==" | "!=" | "<" | "<=" | ">" | ">=" | "in" | "array-contains",
  value: unknown,
): D1Constraint {
  return { type: "where", field, op, value };
}

export function orderBy(field: string, direction: "asc" | "desc" = "asc"): D1Constraint {
  return { type: "orderBy", field, direction };
}

export function limit(n: number): D1Constraint {
  return { type: "limit", n };
}

export function query(col: ColRef, ...constraints: D1Constraint[]): QueryRef {
  return { collection: col.collection, constraints };
}

type Snap = {
  id: string;
  exists: () => boolean;
  data: () => Record<string, unknown> | undefined;
  ref: DocRef;
};

function toSnap(id: string, data: Record<string, unknown> | null, ref: DocRef): Snap {
  return {
    id,
    exists: () => data != null,
    data: () => {
      if (!data) return undefined;
      const { id: _id, ...rest } = data;
      return rest;
    },
    ref,
  };
}

function applySentinels(
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  const out = { ...existing };
  for (const [k, v] of Object.entries(incoming)) {
    if (v && typeof v === "object" && "__delete" in (v as object)) {
      delete out[k];
      continue;
    }
    if (v && typeof v === "object" && "__arrayUnion" in (v as object)) {
      const cur = Array.isArray(out[k]) ? [...(out[k] as unknown[])] : [];
      for (const item of (v as { __arrayUnion: unknown[] }).__arrayUnion) {
        if (!cur.includes(item)) cur.push(item);
      }
      out[k] = cur;
      continue;
    }
    if (v && typeof v === "object" && "__arrayRemove" in (v as object)) {
      const remove = new Set((v as { __arrayRemove: unknown[] }).__arrayRemove);
      const cur = Array.isArray(out[k]) ? (out[k] as unknown[]) : [];
      out[k] = cur.filter((x) => !remove.has(x));
      continue;
    }
    if (v !== undefined) out[k] = v;
  }
  return out;
}

export async function getDoc(ref: DocRef): Promise<Snap> {
  const data = await d1GetDoc<Record<string, unknown>>(ref.collection, ref.id);
  return toSnap(ref.id, data, ref);
}

export async function getDocs(q: QueryRef | ColRef) {
  const collectionName = q.collection;
  const constraints = "constraints" in q ? q.constraints : [];
  const docs = await d1ListDocs<Record<string, unknown>>(collectionName, constraints);
  const mapped = docs.map((d) => {
    const id = String(d.id);
    const ref = { collection: collectionName, id, path: `${collectionName}/${id}` };
    return toSnap(id, d, ref);
  });
  return {
    docs: mapped,
    empty: mapped.length === 0,
    size: mapped.length,
    forEach: (fn: (d: Snap) => void) => mapped.forEach(fn),
  };
}

export async function setDoc(
  ref: DocRef,
  data: Record<string, unknown>,
  opts?: { merge?: boolean },
): Promise<void> {
  if (opts?.merge) {
    const existing = (await d1GetDoc<Record<string, unknown>>(ref.collection, ref.id)) || {};
    const { id: _i, ...rest } = existing;
    const merged = applySentinels(rest, data);
    await d1UpsertDoc(ref.collection, ref.id, merged, { merge: false });
    return;
  }
  const cleaned: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined && !(v && typeof v === "object" && "__delete" in (v as object))) {
      cleaned[k] = v;
    }
  }
  await d1UpsertDoc(ref.collection, ref.id, cleaned, { merge: false });
}

export async function updateDoc(ref: DocRef, data: Record<string, unknown>): Promise<void> {
  await setDoc(ref, data, { merge: true });
}

export async function deleteDoc(ref: DocRef): Promise<void> {
  await d1DeleteDoc(ref.collection, ref.id);
}

export async function addDoc(col: ColRef, data: Record<string, unknown>): Promise<DocRef> {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 20)
      : `id_${Date.now().toString(36)}`;
  const ref = { collection: col.collection, id, path: `${col.collection}/${id}` };
  await setDoc(ref, { ...data, createdAt: data.createdAt ?? serverTimestamp() });
  return ref;
}

export function onSnapshot(
  refOrQuery: DocRef | QueryRef | ColRef,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onNext: (snap: any) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  if ("constraints" in refOrQuery || (refOrQuery as ColRef).collection) {
    const collectionName = refOrQuery.collection;
    const constraints = "constraints" in refOrQuery ? refOrQuery.constraints : [];
    // DocRef also has collection+id — detect by id presence without constraints
    if ("id" in refOrQuery && !("constraints" in refOrQuery)) {
      const ref = refOrQuery as DocRef;
      let cancelled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const tick = async () => {
        if (cancelled) return;
        try {
          const snap = await getDoc(ref);
          if (!cancelled) onNext(snap);
        } catch (error) {
          if (!cancelled) onError?.(error instanceof Error ? error : new Error(String(error)));
        } finally {
          if (cancelled) return;
          const hidden = typeof document !== "undefined" && document.visibilityState === "hidden";
          timer = setTimeout(tick, hidden ? 80000 : 20000);
        }
      };
      void tick();
      return () => {
        cancelled = true;
        if (timer) clearTimeout(timer);
      };
    }
    return d1SubscribeCollection(
      collectionName,
      constraints,
      (items) => {
        const docs = items.map((d) => {
          const id = String((d as { id: string }).id);
          const ref = { collection: collectionName, id, path: `${collectionName}/${id}` };
          return toSnap(id, d as Record<string, unknown>, ref);
        });
        onNext({
          docs,
          empty: docs.length === 0,
          size: docs.length,
          metadata: { fromCache: false, hasPendingWrites: false },
          forEach: (fn: (d: Snap) => void) => docs.forEach(fn),
        });
      },
      onError,
    );
  }
  return () => undefined;
}

type BatchOp = () => Promise<void>;

export function writeBatch(_db?: unknown) {
  const ops: BatchOp[] = [];
  return {
    set(ref: DocRef, data: Record<string, unknown>, opts?: { merge?: boolean }) {
      ops.push(() => setDoc(ref, data, opts));
    },
    update(ref: DocRef, data: Record<string, unknown>) {
      ops.push(() => updateDoc(ref, data));
    },
    delete(ref: DocRef) {
      ops.push(() => deleteDoc(ref));
    },
    async commit() {
      for (const op of ops) await op();
    },
  };
}

export async function getCountFromServer(q: QueryRef) {
  const docs = await d1ListDocs(q.collection, q.constraints);
  return { data: () => ({ count: docs.length }) };
}

export async function getAggregateFromServer(q: QueryRef, _spec: unknown) {
  const docs = await d1ListDocs<Record<string, unknown>>(q.collection, q.constraints);
  return { data: () => ({ total: docs.length }) };
}

export function sum(_field: string) {
  return { __sum: true };
}
