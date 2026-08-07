/**
 * Cloudflare D1 document API client — replaces Firestore for app data.
 * Auth: Firebase ID token on mutating requests only.
 */

import { auth, db } from "@/lib/firebase/client";
import {
  collection as fsCollection,
  doc as fsDoc,
  getDoc as fsGetDoc,
  getDocs as fsGetDocs,
  limit as fsLimit,
  query as fsQuery,
  where as fsWhere,
  setDoc as fsSetDoc,
  deleteDoc as fsDeleteDoc,
} from "firebase/firestore";

export type D1Constraint =
  | {
      type: "where";
      field: string;
      op: "==" | "!=" | "<" | "<=" | ">" | ">=" | "in" | "array-contains";
      value: unknown;
    }
  | { type: "orderBy"; field: string; direction?: "asc" | "desc" }
  | { type: "limit"; n: number };

async function authHeaders(json = true): Promise<HeadersInit> {
  const user = auth.currentUser;
  const headers: Record<string, string> = {};
  if (json) headers["Content-Type"] = "application/json";
  if (user) headers.Authorization = `Bearer ${await user.getIdToken()}`;
  return headers;
}

function constraintsToQuery(constraints: D1Constraint[]): string {
  const params = new URLSearchParams();
  for (const c of constraints) {
    if (c.type === "where") {
      params.append("eq", `${c.field}:${JSON.stringify(c.value)}`);
      if (c.op !== "==") params.append("op", `${c.field}:${c.op}`);
    } else if (c.type === "orderBy") {
      params.set("orderBy", c.field);
      if (c.direction) params.set("orderDir", c.direction);
    } else if (c.type === "limit") {
      params.set("limit", String(c.n));
    }
  }
  return params.toString();
}


/* ------------------------------------------------------------------ *
 * STATIC SNAPSHOT FALLBACK
 *
 * Cloudflare Pages serves static assets free and unlimited, while Pages
 * Functions carry a daily request ceiling — when it is reached, every
 * /api/* call 404s and the app would otherwise be dead. /data/snapshot.json
 * is a build-time copy of the public display data, so TVs and dashboards
 * keep showing real content until the API returns. Reads only: writes still
 * need the API and report honestly when they cannot go through.
 * ------------------------------------------------------------------ */

type Snapshot = { generatedAt: string; collections: Record<string, Record<string, unknown>[]> };
let snapshotPromise: Promise<Snapshot | null> | null = null;
let snapshotNotified = false;

function loadSnapshot(): Promise<Snapshot | null> {
  if (!snapshotPromise) {
    snapshotPromise = fetch("/data/snapshot.json")
      .then((r) => (r.ok ? (r.json() as Promise<Snapshot>) : null))
      .catch(() => null)
      .then((snap) => {
        if (snap && !snapshotNotified) {
          snapshotNotified = true;
          console.info(
            `[unimoni] Live server unavailable — showing saved data from ${snap.generatedAt}. Edits are paused until it returns.`,
          );
        }
        return snap;
      });
  }
  return snapshotPromise;
}

/** True when the app is currently running on the static snapshot. */
export function isUsingSnapshot(): boolean {
  return snapshotNotified;
}

/** Set whenever a read had to fall back because the API was unreachable.
 *  Callers use it to distinguish "this really does not exist" from
 *  "we could not check right now" — the difference between denying a user
 *  access forever and asking them to retry (client 2026-08-07). */
let lastReadWasFallback = false;
export function lastReadUsedFallback(): boolean {
  return lastReadWasFallback;
}

function matchesConstraints(row: Record<string, unknown>, constraints: D1Constraint[]): boolean {
  for (const c of constraints) {
    if (c.type !== "where") continue;
    const cur = row[c.field];
    switch (c.op) {
      case "==":
        if (cur !== c.value) return false;
        break;
      case "!=":
        if (cur === c.value) return false;
        break;
      case "<":
        if (!((cur as number) < (c.value as number))) return false;
        break;
      case "<=":
        if (!((cur as number) <= (c.value as number))) return false;
        break;
      case ">":
        if (!((cur as number) > (c.value as number))) return false;
        break;
      case ">=":
        if (!((cur as number) >= (c.value as number))) return false;
        break;
      case "in":
        if (!Array.isArray(c.value) || !c.value.includes(cur)) return false;
        break;
      case "array-contains":
        if (!Array.isArray(cur) || !cur.includes(c.value)) return false;
        break;
    }
  }
  return true;
}

async function snapshotList<T>(collection: string, constraints: D1Constraint[]): Promise<T[] | null> {
  const snap = await loadSnapshot();
  const rows = snap?.collections?.[collection];
  if (!rows) return null;
  let out = rows.filter((r) => matchesConstraints(r, constraints));
  const order = constraints.find((c) => c.type === "orderBy");
  if (order && order.type === "orderBy") {
    const dir = order.direction === "desc" ? -1 : 1;
    out = [...out].sort((a, b) => {
      const av = a[order.field] as string | number | undefined;
      const bv = b[order.field] as string | number | undefined;
      if (av === bv) return 0;
      return (av ?? 0) > (bv ?? 0) ? dir : -dir;
    });
  }
  const lim = constraints.find((c) => c.type === "limit");
  if (lim && lim.type === "limit") out = out.slice(0, lim.n);
  return out as T[];
}

async function snapshotDoc<T>(collection: string, id: string): Promise<T | null> {
  const snap = await loadSnapshot();
  const rows = snap?.collections?.[collection];
  if (!rows) return null;
  return (rows.find((r) => r.id === id) as T) ?? null;
}


/* PRIVATE collections are deliberately NOT in the public static snapshot
 * (they hold user emails, roles and approvals). When the API is unavailable
 * they fall back to FIREBASE instead — it still holds this data, enforces
 * per-user access rules, and is the platform sign-in already runs on. That
 * keeps login working without publishing anything private. */
/* NEVER let these touch D1: GET /api/d1/docs is unauthenticated (TV display
 * data is public by design), so anything here would be world-readable.
 * user_credentials holds team sign-in passwords — Firestore only, where rules
 * restrict it to the credential owners (client 2026-08-07). */
const FIRESTORE_ONLY_COLLECTIONS = new Set(["user_credentials"]);

const FIRESTORE_FALLBACK_COLLECTIONS = new Set([
  "user_credentials",
  "users",
  "user_invites",
  "settings",
  "app_config",
  "pending_approvals",
  "notifications",
  "branch_display_prefs",
  "tv_devices",
  "tv_health",
  "video_playlists",
  "audit_logs",
  "rate_history",
  "scheduled_content",
  "roles",
  "permissions",
]);

async function firestoreDoc<T>(collection: string, id: string): Promise<T | null> {
  if (!FIRESTORE_FALLBACK_COLLECTIONS.has(collection)) return null;
  try {
    const snap = await fsGetDoc(fsDoc(db, collection, id));
    return snap.exists() ? ({ id: snap.id, ...snap.data() } as T) : null;
  } catch {
    return null;
  }
}

async function firestoreList<T>(collection: string, constraints: D1Constraint[]): Promise<T[] | null> {
  if (!FIRESTORE_FALLBACK_COLLECTIONS.has(collection)) return null;
  try {
    const parts = [];
    for (const c of constraints) {
      if (c.type === "where" && c.op === "==") parts.push(fsWhere(c.field, "==", c.value));
      else if (c.type === "limit") parts.push(fsLimit(c.n));
    }
    const snap = await fsGetDocs(fsQuery(fsCollection(db, collection), ...parts));
    let rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Record<string, unknown>);
    rows = rows.filter((r) => matchesConstraints(r, constraints));
    return rows as T[];
  } catch {
    return null;
  }
}

export async function d1GetDoc<T>(collection: string, id: string): Promise<T | null> {
  if (FIRESTORE_ONLY_COLLECTIONS.has(collection)) return firestoreDoc<T>(collection, id);
  try {
    const res = await fetch(
      `/api/d1/docs?collection=${encodeURIComponent(collection)}&id=${encodeURIComponent(id)}`,
    );
    // A 404 that is NOT our JSON means the API itself is unavailable (the
    // static site answered) — fall back to the snapshot rather than reporting
    // "missing" for a document that exists.
    if (res.ok) {
      const ct = res.headers.get("Content-Type") || "";
      if (ct.includes("application/json")) {
        const data = (await res.json()) as { doc?: T };
        lastReadWasFallback = false;
        return data.doc ?? null;
      }
    } else if (res.status === 404) {
      const ct = res.headers.get("Content-Type") || "";
      if (ct.includes("application/json")) return null;
    }
  } catch {
    /* network error — fall through to the snapshot */
  }
  lastReadWasFallback = true;
  const viaFirestore = await firestoreDoc<T>(collection, id);
  if (viaFirestore !== null) return viaFirestore;
  return snapshotDoc<T>(collection, id);
}

export async function d1ListDocs<T>(
  collection: string,
  constraints: D1Constraint[] = [],
  fields?: string[],
): Promise<T[]> {
  // Send == filters to the API; apply the rest client-side.
  const apiConstraints = constraints.filter((c) => c.type !== "where" || c.op === "==");
  const q = constraintsToQuery(apiConstraints);
  if (FIRESTORE_ONLY_COLLECTIONS.has(collection)) {
    return (await firestoreList<T>(collection, constraints)) ?? [];
  }
  const proj = fields && fields.length ? `&fields=${encodeURIComponent(fields.join(","))}` : "";
  let docs: T[] = [];
  let served = false;
  try {
    const res = await fetch(
      `/api/d1/docs?collection=${encodeURIComponent(collection)}${q ? `&${q}` : ""}${proj}`,
    );
    const ct = res.headers.get("Content-Type") || "";
    if (res.ok && ct.includes("application/json")) {
      const data = (await res.json()) as { docs?: T[] };
      docs = Array.isArray(data.docs) ? data.docs : [];
      served = true;
      lastReadWasFallback = false;
    }
  } catch {
    /* network error — fall through to the snapshot */
  }
  if (!served) {
    lastReadWasFallback = true;
    // API unavailable (daily Functions ceiling / outage): serve the static
    // snapshot so screens keep working instead of throwing.
    const viaFirestore = await firestoreList<T>(collection, constraints);
    if (viaFirestore) return viaFirestore;
    const snap = await snapshotList<T>(collection, constraints);
    if (snap) return snap;
    // Nothing to fall back to: return empty rather than throwing, so a page
    // renders its normal "nothing here yet" state instead of an error toast
    // while the server is unavailable. Live data returns automatically.
    return [];
  }

  for (const c of constraints) {
    if (c.type !== "where" || c.op === "==") continue;
    docs = docs.filter((row) => {
      const cur = (row as Record<string, unknown>)[c.field];
      switch (c.op) {
        case "!=":
          return cur !== c.value;
        case "<":
          return (cur as number) < (c.value as number);
        case "<=":
          return (cur as number) <= (c.value as number);
        case ">":
          return (cur as number) > (c.value as number);
        case ">=":
          return (cur as number) >= (c.value as number);
        case "in":
          return Array.isArray(c.value) && c.value.includes(cur);
        case "array-contains":
          return Array.isArray(cur) && cur.includes(c.value);
        default:
          return true;
      }
    });
  }
  return docs;
}


/* WRITE FALLBACK.
 * When the D1 API is unavailable (Pages Functions daily ceiling: the static
 * site answers with 404/405), writes go to FIREBASE instead of failing. The
 * user keeps working; Firestore holds a full copy of every collection, and a
 * sync pushes changes back into D1 once the API returns. Without this, every
 * save/delete in the dashboard errors out for hours (client 2026-08-07). */
function apiUnavailable(status: number): boolean {
  return status === 404 || status === 405 || status === 503;
}

let pendingSyncCount = 0;
/** Number of writes made through the Firebase fallback this session. */
export function pendingD1SyncCount(): number {
  return pendingSyncCount;
}

async function firestoreWrite(
  collection: string,
  id: string,
  data: Record<string, unknown>,
  merge: boolean,
): Promise<void> {
  await fsSetDoc(fsDoc(db, collection, id), data, { merge });
  pendingSyncCount += 1;
}

async function firestoreDelete(collection: string, id: string): Promise<void> {
  await fsDeleteDoc(fsDoc(db, collection, id));
  pendingSyncCount += 1;
}

export async function d1UpsertDoc(
  collection: string,
  id: string,
  data: Record<string, unknown>,
  opts?: { merge?: boolean },
): Promise<void> {
  if (FIRESTORE_ONLY_COLLECTIONS.has(collection)) {
    await fsSetDoc(fsDoc(db, collection, id), data, { merge: opts?.merge ?? false });
    return;
  }
  const headers = await authHeaders();
  const res = await fetch("/api/d1/docs", {
    method: "PUT",
    headers,
    body: JSON.stringify({
      collection,
      id,
      data,
      merge: opts?.merge ?? false,
    }),
  });
  if (!res.ok) {
    if (apiUnavailable(res.status)) {
      await firestoreWrite(collection, id, data, opts?.merge ?? false);
      return;
    }
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || `Could not save (${res.status})`);
  }
}

export async function d1DeleteDoc(collection: string, id: string): Promise<void> {
  if (FIRESTORE_ONLY_COLLECTIONS.has(collection)) {
    await fsDeleteDoc(fsDoc(db, collection, id));
    return;
  }
  const headers = await authHeaders();
  const res = await fetch("/api/d1/docs", {
    method: "DELETE",
    headers,
    body: JSON.stringify({ collection, id }),
  });
  if (!res.ok) {
    if (apiUnavailable(res.status)) {
      await firestoreDelete(collection, id);
      return;
    }
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || `Could not delete (${res.status})`);
  }
}

export async function d1BulkUpsert(
  docs: Array<{ collection: string; id: string; data: Record<string, unknown> }>,
): Promise<{ upserted: number }> {
  const headers = await authHeaders();
  const res = await fetch("/api/d1/docs/bulk", {
    method: "POST",
    headers,
    body: JSON.stringify({ docs }),
  });
  if (!res.ok) {
    if (apiUnavailable(res.status)) {
      for (const d of docs) await firestoreWrite(d.collection, d.id, d.data, true);
      return { upserted: docs.length };
    }
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || `Could not save (${res.status})`);
  }
  return (await res.json()) as { upserted: number };
}

/** Polling subscription — replaces Firestore onSnapshot for D1. */
export function d1SubscribeCollection<T>(
  collection: string,
  constraints: D1Constraint[],
  onData: (items: T[]) => void,
  onError?: (error: Error) => void,
  intervalMs = 20000,
): () => void {
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const tick = async () => {
    if (cancelled) return;
    try {
      const items = await d1ListDocs<T>(collection, constraints);
      if (!cancelled) onData(items);
    } catch (error) {
      if (!cancelled) onError?.(error instanceof Error ? error : new Error(String(error)));
    } finally {
      if (cancelled) return;
      // Hidden tabs (background dashboards, stacked TV previews) poll at a
      // quarter rate — they are not being watched.
      const hidden = typeof document !== "undefined" && document.visibilityState === "hidden";
      timer = setTimeout(tick, hidden ? intervalMs * 4 : intervalMs);
    }
  };
  void tick();
  return () => {
    cancelled = true;
    if (timer) clearTimeout(timer);
  };
}
