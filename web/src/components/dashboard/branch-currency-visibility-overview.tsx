"use client";

import { useMemo } from "react";
import { Eye, EyeOff } from "lucide-react";
import { ContentPanel } from "@/components/shared/page-elements";
import type { Branch, ExchangeRate } from "@/lib/types";

/**
 * Cross-branch forex visibility board — which currencies are on each TV vs
 * hidden — without opening a per-currency dialog.
 */
export function BranchCurrencyVisibilityOverview({
  branches,
  rates,
}: {
  branches: Branch[];
  rates: ExchangeRate[];
}) {
  const rows = useMemo(() => {
    const active = branches.filter((b) => b.status === "active");
    return active.map((branch) => {
      // code → visible on TV? (true if at least one non-hidden rate row exists)
      const onTv = new Map<string, boolean>();
      for (const rate of rates) {
        if (rate.branchId !== branch.id) continue;
        const code = (rate.currencyCode ?? "").trim().toUpperCase();
        if (!code) continue;
        if (!rate.isHidden) onTv.set(code, true);
        else if (!onTv.has(code)) onTv.set(code, false);
      }
      const visible: string[] = [];
      const hidden: string[] = [];
      for (const [code, show] of onTv) {
        (show ? visible : hidden).push(code);
      }
      visible.sort();
      hidden.sort();
      const remittanceHidden = [
        ...new Set(
          (branch.settings?.hiddenTransferCodes ?? [])
            .map((c) => String(c).trim().toUpperCase())
            .filter(Boolean),
        ),
      ].sort();
      return { branch, visible, hidden, remittanceHidden };
    });
  }, [branches, rates]);

  if (rows.length === 0) return null;

  return (
    <ContentPanel
      title="Currency visibility by branch"
      description="See which forex currencies are on each branch’s TV and which are hidden — no need to open each currency. Remittance hides are listed separately when set."
    >
      <div className="space-y-3">
        {rows.map(({ branch, visible, hidden, remittanceHidden }) => (
          <div
            key={branch.id}
            className="rounded-xl border border-border/50 bg-muted/15 p-3 sm:p-4"
          >
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">{branch.name}</p>
                <p className="text-[11px] text-muted-foreground">{branch.code}</p>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {visible.length} on TV
                {hidden.length > 0 ? ` · ${hidden.length} hidden` : ""}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="mb-1.5 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <Eye className="h-3 w-3" />
                  Visible on TV
                </p>
                {visible.length === 0 ? (
                  <p className="text-xs text-muted-foreground">None</p>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {visible.map((code) => (
                      <span
                        key={code}
                        className="rounded-md border border-border/50 bg-background/80 px-1.5 py-0.5 font-mono text-[11px] font-medium"
                      >
                        {code}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <p className="mb-1.5 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <EyeOff className="h-3 w-3" />
                  Hidden on TV
                </p>
                {hidden.length === 0 ? (
                  <p className="text-xs text-muted-foreground">None</p>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {hidden.map((code) => (
                      <span
                        key={code}
                        className="rounded-md border border-dashed border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[11px] font-medium text-amber-700 dark:text-amber-300"
                      >
                        {code}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {remittanceHidden.length > 0 ? (
              <div className="mt-3 border-t border-border/40 pt-2">
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Remittance hidden
                </p>
                <div className="flex flex-wrap gap-1">
                  {remittanceHidden.map((code) => (
                    <span
                      key={code}
                      className="rounded-md border border-dashed border-border/60 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
                    >
                      {code}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </ContentPanel>
  );
}
