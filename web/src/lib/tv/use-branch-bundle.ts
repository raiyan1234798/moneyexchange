"use client";

import { useEffect, useState } from "react";
import type { Branch, ExchangeRate, ImageAdvert, TickerMessage, TransferRate, VideoAsset } from "@/lib/types";

/**
 * ONE polled request for everything a TV shows.
 *
 * The display used to open EIGHT separate subscriptions (branch, rates,
 * transfer rates, tickers, videos, images, prefs, currency overrides). Across
 * 8 screens that was ~276k server requests/day — nearly 3x Cloudflare's
 * free-plan ceiling, which took the whole API down (client 2026-08-07).
 * /api/tv returns the same data in a single call, so the fleet costs ~8x less.
 *
 * Returns null while unavailable; the caller then keeps its existing
 * per-collection subscriptions (which fall back to the static snapshot), so a
 * failure here never blanks a screen.
 */
export interface BranchBundle {
  branch: Branch | null;
  rates: ExchangeRate[];
  transferRates: TransferRate[];
  tickers: TickerMessage[];
  videos: VideoAsset[];
  images: ImageAdvert[];
  prefs: { hiddenTransferCodes?: string[] } | null;
  currencyOverrides: Array<{ id: string; flag?: string; name?: string }>;
  servedAt?: string;
}

export function useBranchBundle(branchCode: string | null, intervalMs = 30_000): BranchBundle | null {
  const [bundle, setBundle] = useState<BranchBundle | null>(null);

  useEffect(() => {
    if (!branchCode) return;
    let cancelled = false;
    let timer: number | undefined;

    const tick = async () => {
      try {
        const res = await fetch(`/api/tv?branch=${encodeURIComponent(branchCode)}`);
        const ct = res.headers.get("Content-Type") || "";
        if (res.ok && ct.includes("application/json")) {
          const data = (await res.json()) as BranchBundle;
          if (!cancelled && data && data.branch) setBundle(data);
        }
      } catch {
        // Unavailable — the caller's own subscriptions/snapshot keep the screen alive.
      }
      if (cancelled) return;
      const hidden = typeof document !== "undefined" && document.visibilityState === "hidden";
      timer = window.setTimeout(tick, hidden ? intervalMs * 4 : intervalMs);
    };

    void tick();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [branchCode, intervalMs]);

  return bundle;
}
