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

export async function d1GetDoc<T>(collection: string, id: string): Promise<T | null> {
  const res = await fetch(
    `/api/d1/docs?collection=${encodeURIComponent(collection)}&id=${encodeURIComponent(id)}`,
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`D1 get failed (${res.status})`);
  const data = (await res.json()) as { doc?: T };
  return data.doc ?? null;
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
  const res = await fetch(
    `/api/d1/docs?collection=${encodeURIComponent(collection)}${q ? `&${q}` : ""}${proj}`,
  );
  if (!res.ok) throw new Error(`D1 list failed (${res.status})`);
  const data = (await res.json()) as { docs?: T[] };
  let docs = Array.isArray(data.docs) ? data.docs : [];

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
