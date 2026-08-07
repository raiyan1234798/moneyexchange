import { toast } from "sonner";
import {
  assertBranchPayloadUnderLimit,
  branchHasInlineMedia,
  estimateJsonBytes,
  migrateBranchInlineMedia,
} from "@/lib/migrate-inline-media";
import { updateBranch } from "@/lib/services/branch-service";
import type { Branch } from "@/lib/types";

export type BackfillResult = {
  branchId: string;
  name: string;
  beforeBytes: number;
  afterBytes: number;
  migratedCount: number;
  error?: string;
};

/**
 * Walk every branch, offload inline `data:` media to R2, rewrite the doc.
 * Safe to re-run — already-HTTPS fields are left alone.
 */
export async function backfillBranchesInlineMedia(
  branches: Branch[],
  actor: { userId: string; userName: string },
  opts?: { onProgress?: (message: string) => void },
): Promise<BackfillResult[]> {
  const results: BackfillResult[] = [];

  for (const branch of branches) {
    const settings = branch.settings ?? {};
    const beforeBytes = estimateJsonBytes({
      logoUrl: branch.logoUrl,
      settings,
    });
    const label = `${branch.name} (${branch.code || branch.id})`;

    if (!branchHasInlineMedia(settings, branch.logoUrl)) {
      results.push({
        branchId: branch.id,
        name: label,
        beforeBytes,
        afterBytes: beforeBytes,
        migratedCount: 0,
      });
      continue;
    }

    opts?.onProgress?.(`Migrating ${label}…`);
    try {
      const { settings: nextSettings, logoUrl, migratedCount } = await migrateBranchInlineMedia({
        branchId: branch.id,
        settings,
        logoUrl: branch.logoUrl,
        onProgress: opts?.onProgress,
      });
      assertBranchPayloadUnderLimit({ logoUrl: logoUrl ?? branch.logoUrl, settings: nextSettings });
      await updateBranch(
        branch.id,
        {
          logoUrl: logoUrl ?? branch.logoUrl ?? null,
          settings: nextSettings,
        },
        actor,
      );
      const afterBytes = estimateJsonBytes({
        logoUrl: logoUrl ?? branch.logoUrl,
        settings: nextSettings,
      });
      results.push({
        branchId: branch.id,
        name: label,
        beforeBytes,
        afterBytes,
        migratedCount,
      });
    } catch (error) {
      results.push({
        branchId: branch.id,
        name: label,
        beforeBytes,
        afterBytes: beforeBytes,
        migratedCount: 0,
        error: error instanceof Error ? error.message : "Migration failed",
      });
    }
  }

  return results;
}

export function summarizeBackfill(results: BackfillResult[]): string {
  const migrated = results.filter((r) => r.migratedCount > 0 && !r.error);
  const failed = results.filter((r) => r.error);
  const parts = [
    `Checked ${results.length} branch(es)`,
    `${migrated.length} shrunk`,
    failed.length ? `${failed.length} failed` : "0 failed",
  ];
  return parts.join(" · ");
}

export function reportBackfillToasts(results: BackfillResult[]): void {
  toast.success(summarizeBackfill(results), { duration: 10000 });
  for (const r of results.filter((x) => x.error)) {
    toast.error(`${r.name}: ${r.error}`, { duration: 12000 });
  }
  for (const r of results.filter((x) => x.migratedCount > 0 && !x.error)) {
    toast.message(
      `${r.name}: ${Math.round(r.beforeBytes / 1024)} KB → ${Math.round(r.afterBytes / 1024)} KB (${r.migratedCount} file(s))`,
      { duration: 8000 },
    );
  }
}
