/**
 * Branch isolation guards — every display/dashboard query MUST scope by branchId.
 * Cross-branch content only flows through explicit "apply to all" (admin/superAdmin).
 */

export const BRANCH_SCOPED_COLLECTIONS = [
  "exchange_rates",
  "videos",
  "video_chunks",
  "ticker_messages",
  "image_adverts",
  "video_playlists",
  "scheduled_content",
] as const;

/** Reject empty or whitespace branch ids before Firestore queries. */
export function assertBranchId(branchId: string, context: string): string {
  const trimmed = branchId?.trim();
  if (!trimmed) {
    throw new Error(`[branch-isolation] Missing branchId in ${context}`);
  }
  return trimmed;
}

/**
 * Ensures a loaded document belongs to the requested branch.
 * Prevents accidental cross-branch reads if query constraints are bypassed.
 */
export function assertDocumentBranch<T extends { branchId?: string | null }>(
  doc: T,
  expectedBranchId: string,
  context: string,
): T {
  const expected = assertBranchId(expectedBranchId, context);
  if (doc.branchId != null && doc.branchId !== expected) {
    throw new Error(
      `[branch-isolation] ${context}: document branchId "${doc.branchId}" !== expected "${expected}"`,
    );
  }
  return doc;
}

/** Only admin/superAdmin may opt in to multi-branch sync. */
export function canApplyToAllBranches(role: string | undefined): boolean {
  return role === "superAdmin" || role === "admin";
}

/**
 * Resolves target branches for apply-to-all.
 * When applyToAll is false, returns only the source branch (never leaks to others).
 */
export function resolveBranchTargets<T extends { id: string; status: string }>(
  branches: T[],
  sourceBranchId: string,
  applyToAll: boolean,
): T[] {
  const active = branches.filter((b) => b.status === "active");
  if (!applyToAll) {
    const source = active.find((b) => b.id === sourceBranchId);
    return source ? [source] : [];
  }
  return active;
}
