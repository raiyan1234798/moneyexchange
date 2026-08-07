import { auth } from "@/lib/firebase/client";

export type BranchSlimResult = {
  ok: boolean;
  branchId: string;
  migrated: number;
  fields?: string[];
  error?: string;
};

/**
 * Ask the Cloudflare Pages worker to move inline `data:` media on a branch
 * document into R2, field-by-field (avoids reading/writing the whole 1MB+ doc).
 * Safe to call before every Save — no-ops when nothing is inline.
 */
export async function slimBranchDocument(branchId: string): Promise<BranchSlimResult> {
  if (!branchId) return { ok: false, branchId, migrated: 0, error: "Missing branchId" };
  const user = auth.currentUser;
  if (!user) return { ok: false, branchId, migrated: 0, error: "Sign in required" };
  const token = await user.getIdToken();
  const res = await fetch("/api/branch-slim", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ branchId }),
  });
  const data = (await res.json().catch(() => ({}))) as BranchSlimResult & { error?: string };
  if (!res.ok) {
    return {
      ok: false,
      branchId,
      migrated: 0,
      error: data.error || `Slim failed (${res.status})`,
    };
  }
  return {
    ok: true,
    branchId: data.branchId || branchId,
    migrated: data.migrated || 0,
    fields: data.fields,
  };
}
