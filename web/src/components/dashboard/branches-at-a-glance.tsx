"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, Monitor, MonitorOff } from "lucide-react";
import { getDisplayUrl } from "@/lib/display-url";
import { listExchangeRates } from "@/lib/services/exchange-rate-service";
import { subscribeTvDevices } from "@/lib/services/tv-service";
import { isTvLive } from "@/lib/tv/liveness";
import { safeFormatDistanceToNow } from "@/lib/utils/date";
import type { Branch, TvDevice } from "@/lib/types";

type BranchRow = {
  branch: Branch;
  /** Rates actually visible on that branch's TV. */
  liveRates: number;
  /** Newest publish time across the branch's rates. */
  lastUpdate: Date | null;
};

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const v = value as { toDate?: () => Date; seconds?: number };
  if (typeof v.toDate === "function") return v.toDate();
  if (typeof v.seconds === "number") return new Date(v.seconds * 1000);
  const p = Date.parse(String(value));
  return Number.isNaN(p) ? null : new Date(p);
}

/**
 * One card per branch: is its TV live, how many rates it is showing, when it
 * last changed, and a one-click link to open that branch's display.
 */
export function BranchesAtAGlance({
  branches,
  onError,
}: {
  branches: Branch[];
  onError?: (e: Error) => void;
}) {
  const [rows, setRows] = useState<BranchRow[] | null>(null);
  const [devices, setDevices] = useState<TvDevice[]>([]);
  // Re-render on a timer so "live" and "2 min ago" stay truthful.
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const t = window.setInterval(() => setNowMs(Date.now()), 30000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    return subscribeTvDevices(setDevices, undefined, onError);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const branchKey = branches.map((b) => b.id).join("|");
  useEffect(() => {
    let alive = true;
    if (branches.length === 0) {
      setRows([]);
      return;
    }
    void Promise.all(
      branches.map(async (branch) => {
        try {
          const rates = await listExchangeRates(branch.id);
          const visible = rates.filter((r) => r.status === "published" && !r.isHidden);
          let last: Date | null = null;
          for (const r of rates) {
            const d = toDate(r.publishedAt) ?? toDate(r.updatedAt);
            if (d && (!last || d > last)) last = d;
          }
          return { branch, liveRates: visible.length, lastUpdate: last } as BranchRow;
        } catch {
          return { branch, liveRates: 0, lastUpdate: null } as BranchRow;
        }
      }),
    ).then((result) => {
      if (alive) setRows(result);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchKey]);

  const list = rows ?? branches.map((branch) => ({ branch, liveRates: 0, lastUpdate: null }));

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {list.map(({ branch, liveRates, lastUpdate }) => {
        const branchDevices = devices.filter((d) => d.branchId === branch.id);
        const liveCount = branchDevices.filter((d) => isTvLive(d, nowMs)).length;
        const hasDevices = branchDevices.length > 0;
        const isLive = liveCount > 0;
        return (
          <div
            key={branch.id}
            className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card/60 p-4 transition-shadow hover:shadow-premium"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-medium">{branch.name}</p>
                <p className="text-xs text-muted-foreground">
                  <span className="font-mono">{branch.code}</span>
                  {branch.city ? ` · ${branch.city}` : ""}
                </p>
              </div>
              {/* Live = a TV checked in within the last few minutes (not just a
                  stale "online" flag that nothing ever clears). */}
              <span
                title={
                  hasDevices
                    ? isLive
                      ? `${liveCount} of ${branchDevices.length} TV(s) checked in recently`
                      : "No TV has checked in recently"
                    : "No TV paired to this branch yet"
                }
                className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${
                  !hasDevices
                    ? "bg-muted/40 text-muted-foreground ring-border/50"
                    : isLive
                      ? "bg-emerald-500/10 text-emerald-600 ring-emerald-500/30 dark:text-emerald-400"
                      : "bg-amber-500/10 text-amber-600 ring-amber-500/30 dark:text-amber-400"
                }`}
              >
                {hasDevices && isLive ? (
                  <Monitor className="h-3 w-3" />
                ) : (
                  <MonitorOff className="h-3 w-3" />
                )}
                {!hasDevices ? "No TV" : isLive ? "Live" : "Offline"}
              </span>
            </div>

            <div className="flex items-baseline gap-4">
              <div>
                <p className="text-2xl font-semibold tabular-nums leading-none">{liveRates}</p>
                <p className="pt-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                  rates on TV
                </p>
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs text-muted-foreground">
                  {lastUpdate
                    ? `Updated ${safeFormatDistanceToNow(lastUpdate)}`
                    : rows === null
                      ? "Loading…"
                      : "No rates yet"}
                </p>
              </div>
            </div>

            <Link
              href={getDisplayUrl(branch.code)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 self-start rounded-lg border border-border/60 px-2.5 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ExternalLink className="h-3 w-3" />
              Open display
            </Link>
          </div>
        );
      })}
    </div>
  );
}
