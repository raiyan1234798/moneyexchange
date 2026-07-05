"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

export function ApplyToAllCheckbox({
  checked,
  onChange,
  branchCount,
  className,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  branchCount: number;
  className?: string;
}) {
  if (branchCount <= 1) return null;

  return (
    <div className={className}>
      <div className="flex items-start gap-3 rounded-xl border border-border/50 bg-muted/30 p-3">
        <Checkbox
          id="apply-to-all"
          checked={checked}
          onCheckedChange={(value) => onChange(value === true)}
        />
        <div className="space-y-0.5">
          <Label htmlFor="apply-to-all" className="cursor-pointer text-sm font-medium">
            Apply to all active branches
          </Label>
          <p className="text-xs text-muted-foreground">
            Copies this content to each of the {branchCount} active branches (independent per branch).
          </p>
        </div>
      </div>
    </div>
  );
}
