"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { Branch } from "@/lib/types";

export type BranchTargetScope = "current" | "specific" | "all";

export interface BranchTargetSelection {
  scope: BranchTargetScope;
  selectedBranchIds: string[];
}

export function ApplyToAllCheckbox({
  checked,
  onChange,
  branchCount,
  className,
  id = "apply-to-all",
  description,
  // Advanced branch target selection props:
  scope,
  selectedBranchIds = [],
  branches = [],
  currentBranchId,
  onScopeChange,
}: {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  branchCount?: number;
  className?: string;
  id?: string;
  /** Override the helper line under the label. */
  description?: string;
  scope?: BranchTargetScope;
  selectedBranchIds?: string[];
  branches?: Branch[];
  currentBranchId?: string;
  onScopeChange?: (selection: BranchTargetSelection) => void;
}) {
  const activeBranches = branches.filter((b) => b.status === "active");
  // Prefer explicit branchCount when parents pass "other branches only" for the
  // picker list — the All label must still show the real total (e.g. 8 not 7).
  const count = branchCount ?? activeBranches.length;
  const allLabelCount = Math.max(count, activeBranches.length);

  if (count <= 1 && !scope) return null;

  // If advanced target selector is enabled:
  if (onScopeChange && scope) {
    const handleScopeRadio = (newScope: BranchTargetScope) => {
      let nextSelected = selectedBranchIds;
      if (newScope === "specific" && nextSelected.length === 0 && currentBranchId) {
        nextSelected = [currentBranchId];
      }
      onScopeChange({ scope: newScope, selectedBranchIds: nextSelected });
    };

    const toggleBranch = (bId: string) => {
      const exists = selectedBranchIds.includes(bId);
      const next = exists ? selectedBranchIds.filter((id) => id !== bId) : [...selectedBranchIds, bId];
      onScopeChange({ scope: "specific", selectedBranchIds: next });
    };

    return (
      <div className={className}>
        <div className="space-y-3 rounded-xl border border-border/50 bg-muted/30 p-3">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            Apply changes to branches
          </Label>
          {/* Vertical, left-aligned list — in a narrow column the old wrap made
              the last option float on its own row and read as centered. */}
          <div className="flex flex-col items-start gap-2">
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="radio"
                name={`${id}-scope`}
                checked={scope === "current"}
                onChange={() => handleScopeRadio("current")}
                className="h-3.5 w-3.5 text-primary"
              />
              <span className="font-medium">Selected branch only</span>
            </label>
            {allLabelCount > 1 ? (
              <>
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="radio"
                    name={`${id}-scope`}
                    checked={scope === "specific"}
                    onChange={() => handleScopeRadio("specific")}
                    className="h-3.5 w-3.5 text-primary"
                  />
                  <span className="font-medium">Select specific branches</span>
                </label>
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="radio"
                    name={`${id}-scope`}
                    checked={scope === "all"}
                    onChange={() => handleScopeRadio("all")}
                    className="h-3.5 w-3.5 text-primary"
                  />
                  <span className="font-medium">All active branches ({allLabelCount})</span>
                </label>
              </>
            ) : null}
          </div>

          {scope === "specific" && activeBranches.length > 0 ? (
            <div className="mt-2 space-y-2 rounded-lg border border-border/40 bg-background/60 p-2.5">
              <p className="text-[11px] font-semibold text-muted-foreground">
                Pick 1 or more branches:
              </p>
              <div className="flex flex-wrap gap-2">
                {activeBranches.map((b) => {
                  const isSelected = selectedBranchIds.includes(b.id);
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => toggleBranch(b.id)}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                        isSelected
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                      }`}
                    >
                      <span>{isSelected ? "✓" : "+"}</span>
                      <span>{b.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {description ? <p className="text-xs text-muted-foreground pt-1">{description}</p> : null}
        </div>
      </div>
    );
  }

  // Fallback / legacy boolean mode
  return (
    <div className={className}>
      <div className="flex items-start gap-3 rounded-xl border border-border/50 bg-muted/30 p-3">
        <Checkbox
          id={id}
          checked={checked ?? false}
          onCheckedChange={(value) => onChange?.(value === true)}
        />
        <div className="space-y-0.5">
          <Label htmlFor={id} className="cursor-pointer text-sm font-medium">
            Apply to all active branches
          </Label>
          <p className="text-xs text-muted-foreground">
            {description ??
              `Copies this content to each of the ${count} active branches (independent per branch).`}
          </p>
        </div>
      </div>
    </div>
  );
}

