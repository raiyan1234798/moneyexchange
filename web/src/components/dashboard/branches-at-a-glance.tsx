"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ExternalLink, Monitor, MonitorOff } from "lucide-react";
import { getDisplayUrl, normalizeBranchCode } from "@/lib/display-url";
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

/** Lazy iframe — loads the real branch display only when the card is on screen. */
function BranchTvView({ branchCode, name }: { branchCode: string; name: string }) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState(false);
  const code = normalizeBranchCode(branchCode);
  const src = `/display/?branch=${encodeURIComponent(code)}&preview=1`;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setActive(true);
          io.disconnect();
        }
      },
      { rootMargin: "200px", threshold: 0.05 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={wrapRef}
      className="overflow-hidden rounded-xl border border-border/50 bg-black shadow-inner"
    >
      {active ? (
        <iframe
          src={src}
          title={`TV view — ${name}`}
          className="aspect-video w-full border-0"
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="flex aspect-video w-full items-center justify-center bg-muted/30 text-xs text-muted-foreground">
          Loading TV view…
        </div>
      )}
    </div>
  );
}

/**
 * One card per branch: live TV view of the display, rates on screen, last
 * update, pairing status, and a one-click link to open that branch's display.
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
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
              <span
                title={
                  hasDevices
                    ? isLive
                      ? `${liveCount} of ${branchDevices.length} TV(s) checked in recently`
                      : "Paired TV has not checked in recently"
                    : "Display is ready — no hardware TV device paired yet"
                }
                className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${
                  isLive
                    ? "bg-emerald-500/10 text-emerald-600 ring-emerald-500/30 dark:text-emerald-400"
                    : hasDevices
                      ? "bg-amber-500/10 text-amber-600 ring-amber-500/30 dark:text-amber-400"
                      : "bg-sky-500/10 text-sky-700 ring-sky-500/30 dark:text-sky-400"
                }`}
              >
                {isLive || !hasDevices ? (
                  <Monitor className="h-3 w-3" />
                ) : (
                  <MonitorOff className="h-3 w-3" />
                )}
                {isLive ? "Live" : hasDevices ? "Offline" : "TV view"}
              </span>
            </div>

            <BranchTvView branchCode={branch.code} name={branch.name} />

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
