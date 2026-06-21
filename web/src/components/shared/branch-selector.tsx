"use client";

import { Building2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { Branch } from "@/lib/types";

export function BranchSelector({
  branches,
  value,
  onChange,
  label = "Branch",
  className,
}: {
  branches: Branch[];
  value: string;
  onChange: (branchId: string) => void;
  label?: string;
  className?: string;
}) {
  if (branches.length === 0) return null;

  const selected = branches.find((b) => b.id === value);

  return (
    <div className={cn("space-y-2", className)}>
      <Label>{label}</Label>
      <Select value={value} onValueChange={(v) => v && onChange(v)}>
        <SelectTrigger className="h-11 w-full max-w-md rounded-xl">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <div
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
              style={{ backgroundColor: `${selected?.brandingColor ?? "#6366f1"}22` }}
            >
              <Building2
                className="h-3.5 w-3.5"
                style={{ color: selected?.brandingColor ?? "#6366f1" }}
              />
            </div>
            <span className="truncate text-left">
              {selected ? (
                <>
                  {selected.name}
                  <span className="ml-1.5 text-muted-foreground">({selected.code})</span>
                </>
              ) : (
                <span className="text-muted-foreground">Select branch</span>
              )}
            </span>
          </div>
        </SelectTrigger>
        <SelectContent className="rounded-xl">
          {branches.map((branch) => (
            <SelectItem key={branch.id} value={branch.id} className="rounded-lg">
              <span className="flex items-center gap-2">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: branch.brandingColor ?? "#6366f1" }}
                />
                {branch.name}
                <span className="text-muted-foreground">({branch.code})</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
