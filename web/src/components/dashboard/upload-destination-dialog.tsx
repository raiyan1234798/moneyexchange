"use client";

import { useEffect, useMemo, useState } from "react";
import { ApplyToAllCheckbox, type BranchTargetScope } from "@/components/shared/apply-to-all-checkbox";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { listVideos } from "@/lib/services/video-service";
import { listImageAdverts } from "@/lib/services/image-advert-service";
import type { Branch } from "@/lib/types";

export type UploadExistingHit = {
  key: string;
  branchId: string;
  branchName: string;
  itemTitle: string;
  fileLabel: string;
};

function normalizeTitle(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ");
}

function titlesMatch(a: string, b: string): boolean {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  return Boolean(na) && na === nb;
}

export function uploadSkipKey(branchId: string, fileLabel: string): string {
  return `${branchId}::${normalizeTitle(fileLabel)}`;
}

/** Scan target branches for media that already matches these file titles/sizes. */
export async function scanExistingMediaOnBranches(opts: {
  kind: "video" | "image";
  files: { label: string; size: number }[];
  branchIds: string[];
  branches: Branch[];
}): Promise<UploadExistingHit[]> {
  const hits: UploadExistingHit[] = [];
  await Promise.all(
    opts.branchIds.map(async (branchId) => {
      const branchName = opts.branches.find((b) => b.id === branchId)?.name ?? branchId;
      if (opts.kind === "video") {
        const existing = (await listVideos(branchId)).filter((v) => v.status === "active");
        for (const file of opts.files) {
          const match = existing.find(
            (v) =>
              titlesMatch(v.title, file.label) ||
              (typeof v.fileSizeBytes === "number" &&
                v.fileSizeBytes === file.size &&
                titlesMatch(v.title, file.label)),
          );
          if (match) {
            hits.push({
              key: uploadSkipKey(branchId, file.label),
              branchId,
              branchName,
              itemTitle: match.title,
              fileLabel: file.label,
            });
          }
        }
        return;
      }
      const existing = (await listImageAdverts(branchId)).filter((img) => img.status === "active");
      for (const file of opts.files) {
        const match = existing.find(
          (img) =>
            titlesMatch(img.title, file.label) ||
            (typeof img.fileSizeBytes === "number" &&
              img.fileSizeBytes === file.size &&
              titlesMatch(img.title, file.label)),
        );
        if (match) {
          hits.push({
            key: uploadSkipKey(branchId, file.label),
            branchId,
            branchName,
            itemTitle: match.title,
            fileLabel: file.label,
          });
        }
      }
    }),
  );
  return hits.sort((a, b) => a.branchName.localeCompare(b.branchName) || a.fileLabel.localeCompare(b.fileLabel));
}

export function UploadDestinationDialog({
  open,
  kind,
  fileLabels,
  fileSizes,
  branches,
  currentBranchId,
  canChooseBranches,
  initialScope,
  initialSelectedBranchIds,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  kind: "video" | "image";
  fileLabels: string[];
  fileSizes: number[];
  branches: Branch[];
  currentBranchId: string;
  canChooseBranches: boolean;
  initialScope: BranchTargetScope;
  initialSelectedBranchIds: string[];
  onOpenChange: (open: boolean) => void;
  onConfirm: (result: {
    scope: BranchTargetScope;
    selectedBranchIds: string[];
    /** Skip copy/upload for this branch+file (already present). */
    skipKeys: Set<string>;
  }) => void;
}) {
  const [scope, setScope] = useState<BranchTargetScope>(initialScope);
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>(initialSelectedBranchIds);
  const [hits, setHits] = useState<UploadExistingHit[]>([]);
  const [skipKeys, setSkipKeys] = useState<Set<string>>(new Set());
  const [scanning, setScanning] = useState(false);

  const files = useMemo(
    () => fileLabels.map((label, i) => ({ label, size: fileSizes[i] ?? 0 })),
    [fileLabels, fileSizes],
  );

  const targetBranchIds = useMemo(() => {
    const active = branches.filter((b) => b.status === "active");
    if (!canChooseBranches || scope === "current") return [currentBranchId];
    if (scope === "all") return active.map((b) => b.id);
    const selected = new Set([currentBranchId, ...selectedBranchIds]);
    return active.filter((b) => selected.has(b.id)).map((b) => b.id);
  }, [branches, canChooseBranches, scope, selectedBranchIds, currentBranchId]);

  useEffect(() => {
    if (!open) return;
    setScope(initialScope);
    setSelectedBranchIds(initialSelectedBranchIds);
  }, [open, initialScope, initialSelectedBranchIds]);

  useEffect(() => {
    if (!open || files.length === 0 || targetBranchIds.length === 0) {
      setHits([]);
      setSkipKeys(new Set());
      return;
    }
    let alive = true;
    setScanning(true);
    void scanExistingMediaOnBranches({
      kind,
      files,
      branchIds: targetBranchIds,
      branches,
    })
      .then((found) => {
        if (!alive) return;
        setHits(found);
        // Default: skip branches/items that already have the file.
        setSkipKeys(new Set(found.map((h) => h.key)));
      })
      .finally(() => {
        if (alive) setScanning(false);
      });
    return () => {
      alive = false;
    };
  }, [open, kind, files, targetBranchIds, branches]);

  const label = kind === "video" ? "video" : "image";

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-h-[85vh] overflow-y-auto rounded-2xl sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>
            Where should {files.length > 1 ? `these ${files.length} ${label}s` : `this ${label}`} go?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Choose this branch only, specific branches, or all branches. If a file is already on a
            branch, you can skip that copy so nothing is duplicated.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4 py-1">
          {canChooseBranches ? (
            <ApplyToAllCheckbox
              id={`upload-dest-${kind}`}
              scope={scope}
              selectedBranchIds={selectedBranchIds}
              branches={branches}
              currentBranchId={currentBranchId}
              onScopeChange={(sel) => {
                setScope(sel.scope);
                setSelectedBranchIds(sel.selectedBranchIds);
              }}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Uploading to the current branch only.
            </p>
          )}

          <div className="rounded-xl border border-border/50 bg-muted/20 p-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Already on a branch?
            </p>
            {scanning ? (
              <p className="text-sm text-muted-foreground">Checking selected branches…</p>
            ) : hits.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No matching {label}s found on the selected branches — safe to upload.
              </p>
            ) : (
              <ul className="space-y-2">
                {hits.map((hit) => {
                  const checked = skipKeys.has(hit.key);
                  return (
                    <li key={hit.key} className="flex items-start gap-2 text-sm">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => {
                          setSkipKeys((prev) => {
                            const next = new Set(prev);
                            if (v === true) next.add(hit.key);
                            else next.delete(hit.key);
                            return next;
                          });
                        }}
                        className="mt-0.5"
                      />
                      <span>
                        <strong className="text-foreground">Skip</strong> — {hit.branchName} already
                        has “{hit.itemTitle}” (matches “{hit.fileLabel}”)
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <AlertDialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="rounded-xl"
            disabled={scanning}
            onClick={() => {
              onConfirm({ scope, selectedBranchIds, skipKeys });
              onOpenChange(false);
            }}
          >
            Continue upload
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
