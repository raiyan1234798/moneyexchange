"use client";

import { ExternalLink, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getDisplayUrl } from "@/lib/display-url";
import { cn } from "@/lib/utils";

export function PreviewDisplayLink({
  branchCode,
  className,
}: {
  branchCode?: string;
  className?: string;
}) {
  if (!branchCode) return null;

  const href = getDisplayUrl(branchCode);

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-sky-500/25 bg-sky-500/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <Monitor className="mt-0.5 h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />
        <div>
          <p className="text-sm font-medium">Preview Display</p>
          <p className="text-xs text-muted-foreground">
            Open the live signage for branch <span className="font-mono">{branchCode}</span> in a new tab.
          </p>
        </div>
      </div>
      <Button
        size="sm"
        className="shrink-0 rounded-xl"
        render={
          <a href={href} target="_blank" rel="noreferrer">
            <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
            Preview Display
          </a>
        }
      />
    </div>
  );
}
