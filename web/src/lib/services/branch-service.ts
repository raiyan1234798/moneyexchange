import { collection, doc, onSnapshot, query } from "firebase/firestore";
import {
  createDocument,
  limit,
  listDocuments,
  removeDocument,
  subscribeCollection,
  updateDocument,
  where,
  orderBy,
  writeAuditLog,
} from "@/lib/firebase/firestore";
import { db } from "@/lib/firebase/client";
import { COLLECTIONS, DEFAULT_BRANCH_SETTINGS, MAX_BRANCHES } from "@/lib/constants";
import { normalizeBranchCode } from "@/lib/display-url";
import type { Branch, DashboardStats, EntityStatus } from "@/lib/types";

function branchMatchesCode(branch: Branch, normalizedCode: string): boolean {
  return normalizeBranchCode(String(branch.code ?? "")) === normalizedCode;
}

export function subscribeBranchByCode(
  branchCode: string,
  onData: (branch: Branch | null) => void,
) {
  const normalized = normalizeBranchCode(branchCode);
  if (!normalized) {
    onData(null);
    return () => undefined;
  }

  const exactQuery = query(
    collection(db, COLLECTIONS.branches),
    where("code", "==", normalized),
    where("status", "==", "active"),
  );

  const fallbackQuery = query(
    collection(db, COLLECTIONS.branches),
    where("status", "==", "active"),
  );

  let fallbackUnsub: (() => void) | undefined;
  // An EMPTY result straight from the local cache is not the truth — it happens
  // for a moment while (re)connecting or right after a deploy, and must never
  // flash "Branch not found" on an unattended TV. Prefer a server-confirmed
  // answer — but only for a few seconds: on a degraded connection the cached
  // answer is far better than an endless spinner.
  let acceptCache = false;
  const cacheGraceTimer = setTimeout(() => {
    acceptCache = true;
    startFallback();
  }, 4000);

  function startFallback() {
    if (fallbackUnsub) return;
    fallbackUnsub = onSnapshot(
      fallbackQuery,
      (activeSnapshot) => {
        if (activeSnapshot.metadata.fromCache && activeSnapshot.empty && !acceptCache) return;
        const match = activeSnapshot.docs
          .map((item) => ({ id: item.id, ...item.data() }) as Branch)
          .find((branch) => branchMatchesCode(branch, normalized));
        // Keep listening either way — a later server snapshot self-corrects.
        onData(match ?? null);
      },
      () => onData(null),
    );
  }

  const exactUnsub = onSnapshot(
    exactQuery,
    (snapshot) => {
      const docSnap = snapshot.docs[0];
      if (docSnap) {
        clearTimeout(cacheGraceTimer);
        fallbackUnsub?.();
        fallbackUnsub = undefined;
        onData({ id: docSnap.id, ...docSnap.data() } as Branch);
        return;
      }

      if (snapshot.metadata.fromCache && !acceptCache) return;
      startFallback();
    },
    () => onData(null),
  );

  return () => {
    clearTimeout(cacheGraceTimer);
    exactUnsub();
    fallbackUnsub?.();
  };
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

// Manual order first (▲▼ on the Branches page), then A–Z for branches never
// reordered. Sorting happens client-side: a Firestore orderBy("displayOrder")
// would silently DROP every branch document that lacks the field.
function sortBranches(items: Branch[]): Branch[] {
  return [...items].sort((a, b) => {
    const ao = typeof a.displayOrder === "number" ? a.displayOrder : Number.MAX_SAFE_INTEGER;
    const bo = typeof b.displayOrder === "number" ? b.displayOrder : Number.MAX_SAFE_INTEGER;
    if (ao !== bo) return ao - bo;
    return (a.name ?? "").localeCompare(b.name ?? "");
  });
}

export async function listBranches(): Promise<Branch[]> {
  const items = await listDocuments<Branch>(COLLECTIONS.branches, [orderBy("name", "asc")]);
  return sortBranches(items);
}

export function subscribeBranches(
  onData: (branches: Branch[]) => void,
  onError?: (error: Error) => void,
) {
  return subscribeCollection<Branch>(
    COLLECTIONS.branches,
    [orderBy("name", "asc")],
    (items) => onData(sortBranches(items)),
    onError,
  );
}

/** Persist a new manual order for ALL branches (1-based positions). */
export async function reorderBranches(
  orderedIds: string[],
  actor: { userId: string; userName: string },
): Promise<void> {
  await Promise.all(
    orderedIds.map((id, index) => updateDocument(COLLECTIONS.branches, id, { displayOrder: index + 1 })),
  );
  await writeAuditLog({
    action: "update",
    entityType: "branch",
    entityId: "branch-order",
    userId: actor.userId,
    userName: actor.userName,
    metadata: { reordered: orderedIds },
  });
}

export async function createBranch(
  data: Omit<Branch, "id" | "createdAt" | "updatedAt">,
  actor: { userId: string; userName: string },
): Promise<string> {
  // Per client: at most MAX_BRANCHES branches may exist (was 6, raised to 8).
  const existing = await listDocuments<Branch>(COLLECTIONS.branches, []);
  if (existing.length >= MAX_BRANCHES) {
    throw new Error(
      `Branch limit reached — a maximum of ${MAX_BRANCHES} branches is allowed. Delete an unused branch first.`,
    );
  }
  const id = await createDocument(COLLECTIONS.branches, {
    ...data,
    code: normalizeBranchCode(data.code),
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

/**
 * Audit metadata WITHOUT the inline media blobs. Branch settings embed logos and
 * announcement images as base64 data URLs, so the old "snapshot everything"
 * metadata wrote up to ~744 KB per branch on every save — applying to 8 branches
 * uploaded megabytes of duplicated image data (slow saves, client 2026-07-27)
 * and made audit_logs ~95% of the whole database. Every ordinary setting value
 * is still recorded for recovery; only the base64 payloads become a short note.
 */
function stripInlineMedia(value: unknown, depth = 0): unknown {
  if (typeof value === "string") {
    return value.startsWith("data:")
      ? `[inline media ~${Math.round(value.length / 1024)} KB — not stored in the log]`
      : value;
  }
  if (depth > 5 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => stripInlineMedia(item, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out[key] = stripInlineMedia(val, depth + 1);
  }
  return out;
}

export async function updateBranch(
  id: string,
  data: Partial<Branch>,
  actor: { userId: string; userName: string },
): Promise<void> {
  const payload = data.code !== undefined ? { ...data, code: normalizeBranchCode(data.code) } : data;
  await updateDocument(COLLECTIONS.branches, id, payload);
  await writeAuditLog({
    action: "update",
    entityType: "branch",
    entityId: id,
    userId: actor.userId,
    userName: actor.userName,
    metadata: stripInlineMedia(data) as Record<string, unknown>,
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
  const [branches, tvs, currencies, rates, auditCount] = await Promise.all([
    listDocuments<Branch>(COLLECTIONS.branches),
    listDocuments<{ status: string }>(COLLECTIONS.tvDevices),
    listDocuments(COLLECTIONS.currencies),
    // Pending rate changes live in pending_approvals (never in exchange_rates,
    // which only ever holds published rates) — so count that collection.
    listDocuments<{ status: string }>(COLLECTIONS.pendingApprovals, [
      where("status", "==", "pending"),
    ]),
    // Only the most-recent audit rows — NEVER download every audit doc (they are
    // large and there can be thousands; that would be slow and bandwidth-heavy,
    // and a full count aggregate resource-exhausts on this collection).
    listDocuments(COLLECTIONS.auditLogs, [orderBy("timestamp", "desc"), limit(20)]),
  ]);

  return {
    totalBranches: branches.length,
    activeTvs: tvs.filter((tv) => tv.status === "online").length,
    offlineTvs: tvs.filter((tv) => tv.status === "offline").length,
    totalCurrencies: currencies.length,
    pendingRateApprovals: rates.length,
    recentAuditEvents: auditCount.length,
  };
}
