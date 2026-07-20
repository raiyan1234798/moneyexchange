"use client";

import { useEffect, useState } from "react";

import { BUILD_ID } from "@/lib/build-id";

/**
 * Polls for a newer deployed build and returns true once one is live.
 *
 * Compares ONE exact value: the BUILD_ID compiled into this bundle vs the
 * `app-build` meta tag in the freshly-fetched HTML. (Comparing asset lists does
 * NOT work — after client-side navigation the live DOM legitimately holds far
 * fewer script tags than the server HTML, so that approach reported "new build"
 * on every check.)
 */
export function useNewBuildAvailable(enabled = true, intervalMs = 3 * 60 * 1000): string | null {
  const [availableId, setAvailableId] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    if (!BUILD_ID) return; // no id compiled in — never nag
    let stopped = false;
    // Require the SAME different id on two consecutive checks: right after a
    // deploy, Cloudflare's edges can briefly serve a mix of old and new HTML,
    // and a single stale response must not trigger anything.
    let lastSeen: string | null = null;

    const check = async () => {
      if (stopped) return;
      try {
        // Page HTML is served must-revalidate, so this reflects what is deployed now.
        const res = await fetch(`${window.location.pathname}?_v=${Date.now()}`, {
          cache: "no-store",
          headers: { "cache-control": "no-cache" },
        });
        if (!res.ok || stopped) return;
        const html = await res.text();
        const served = html.match(
          /<meta[^>]+name=["']app-build["'][^>]+content=["']([^"']+)["']/i,
        )?.[1];
        if (!served || served === BUILD_ID) {
          lastSeen = null;
          return;
        }
        if (served === lastSeen && !stopped) setAvailableId(served);
        lastSeen = served;
      } catch {
        // Offline or transient network error — try again next tick.
      }
    };

    const id = window.setInterval(check, intervalMs);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, [enabled, intervalMs]);

  return availableId;
}

/**
 * Unattended signage only: reload the TV itself once a newer build is deployed,
 * so displays pick up fixes without anyone touching them. The dashboard instead
 * shows a Refresh banner (see UpdateBanner) so it can never interrupt an upload.
 */
export function useAutoRefreshOnNewBuild(enabled: boolean, intervalMs = 4 * 60 * 1000): void {
  const available = useNewBuildAvailable(enabled, intervalMs);
  useEffect(() => {
    if (available) window.location.reload();
  }, [available]);
}
