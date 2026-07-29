"use client";

import { Button } from "@/components/ui/button";

export type ColorApplyScope = "current" | "specific" | "all";

/**
 * Compact this / selected / all picker for applying one colour (or colour
 * group) immediately — without waiting for the full settings save.
 */
export function ColorApplyRow({
  label,
  scope,
  selectedIds,
  branches,
  currentBranchId,
  applying,
  applyLabel = "Apply this colour",
  onScopeChange,
  onApply,
}: {
  label: string;
  scope: ColorApplyScope;
  selectedIds: string[];
  branches: Array<{ id: string; name: string }>;
  currentBranchId: string;
  applying: boolean;
  applyLabel?: string;
  onScopeChange: (scope: ColorApplyScope, ids: string[]) => void;
  onApply: () => void;
}) {
  return (
    <div className="space-y-2 rounded-xl border border-border/50 bg-background/60 p-2.5">
      <p className="text-xs font-medium">{label}</p>
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["current", "This branch"],
            ["specific", "Selected"],
            ["all", "All branches"],
          ] as const
        ).map(([key, text]) => (
          <label key={key} className="flex cursor-pointer items-center gap-1.5 text-[11px]">
            <input
              type="radio"
              checked={scope === key}
              onChange={() =>
                onScopeChange(
                  key,
                  key === "specific" && selectedIds.length === 0 ? [currentBranchId] : selectedIds,
                )
              }
              className="h-3 w-3"
            />
            {text}
          </label>
        ))}
      </div>
      {scope === "specific" ? (
        <div className="flex max-h-28 flex-wrap gap-1 overflow-y-auto">
          {branches.map((b) => {
            const on = selectedIds.includes(b.id);
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => {
                  const next = on ? selectedIds.filter((id) => id !== b.id) : [...selectedIds, b.id];
                  onScopeChange("specific", next.length > 0 ? next : [currentBranchId]);
                }}
                className={`rounded-md border px-2 py-0.5 text-[10px] ${
                  on ? "border-primary/50 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground"
                }`}
              >
                {b.name}
              </button>
            );
          })}
        </div>
      ) : null}
      <Button
        type="button"
        size="sm"
        className="h-8 w-full rounded-lg text-xs"
        disabled={applying || (scope === "specific" && selectedIds.length === 0)}
        onClick={onApply}
      >
        {applying ? "Applying…" : applyLabel}
      </Button>
    </div>
  );
}
