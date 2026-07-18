"use client";

import { useEffect } from "react";

// Every build gives the webpack runtime chunk a new content hash. Comparing the
// hash the page LOADED with the hash the server now serves tells us a newer
// build is live — the signage TV then reloads itself so new features actually
// appear without anyone touching the TV. (Signage browsers cache the JS
// aggressively, so without this a deployed change can sit invisible for days.)
const BUILD_MARKER_RE = /_next\/static\/chunks\/webpack-[a-f0-9]+\.js/;

function markerFromScripts(): string | null {
  const scripts = Array.from(document.querySelectorAll<HTMLScriptElement>("script[src]"));
  for (const s of scripts) {
    const m = s.src.match(BUILD_MARKER_RE);
    if (m) return m[0];
  }
  return null;
}

/**
 * On the signage display only: poll the current page every few minutes and, if a
 * newer build has been deployed, reload so the TV runs the latest code.
 */
export function useAutoRefreshOnNewBuild(enabled: boolean, intervalMs = 4 * 60 * 1000): void {
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    const loaded = markerFromScripts();
    if (!loaded) return; // dev / unexpected markup — do nothing rather than reload-loop

    let stopped = false;
    let reloading = false;
    const check = async () => {
      if (reloading) return;
      try {
        // Cache-bust hard: no-store + a unique query so no edge/proxy serves a stale copy.
        const res = await fetch(`${window.location.pathname}?_v=${Date.now()}`, {
          cache: "no-store",
          headers: { "cache-control": "no-cache" },
        });
        if (!res.ok || stopped) return;
        const html = await res.text();
        const fresh = html.match(BUILD_MARKER_RE)?.[0];
        if (fresh && fresh !== loaded && !stopped) {
          reloading = true;
          window.location.reload();
        }
      } catch {
        // Offline or transient network error — ignore and try again next tick.
      }
    };

    const id = window.setInterval(check, intervalMs);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, [enabled, intervalMs]);
}
