/**
 * Cloudflare D1 document API client — replaces Firestore for app data.
 * Auth: Firebase ID token on mutating requests only.
 */

import { auth } from "@/lib/firebase/client";

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

export async function d1GetDoc<T>(collection: string, id: string): Promise<T | null> {
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
        return data.doc ?? null;
      }
    } else if (res.status === 404) {
      const ct = res.headers.get("Content-Type") || "";
      if (ct.includes("application/json")) return null;
    }
  } catch {
    /* network error — fall through to the snapshot */
  }
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
    }
  } catch {
    /* network error — fall through to the snapshot */
  }
  if (!served) {
    // API unavailable (daily Functions ceiling / outage): serve the static
    // snapshot so screens keep working instead of throwing.
    const snap = await snapshotList<T>(collection, constraints);
    if (snap) return snap;
    throw new Error(`D1 list failed and no snapshot for ${collection}`);
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

export async function d1UpsertDoc(
  collection: string,
  id: string,
  data: Record<string, unknown>,
  opts?: { merge?: boolean },
): Promise<void> {
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
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || `D1 upsert failed (${res.status})`);
  }
}

export async function d1DeleteDoc(collection: string, id: string): Promise<void> {
  const headers = await authHeaders();
  const res = await fetch("/api/d1/docs", {
    method: "DELETE",
    headers,
    body: JSON.stringify({ collection, id }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || `D1 delete failed (${res.status})`);
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
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || `D1 bulk failed (${res.status})`);
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
