"use client";

import { useEffect } from "react";

// Next.js content-hashes its JS/CSS assets, so a new build changes the filenames
// of every chunk that changed (the page chunk, the CSS, …). The webpack runtime
// chunk, by contrast, stays byte-identical across builds — so we must compare the
// FULL asset set, not one marker. Signage browsers cache the app hard, so without
// this a deployed change can sit invisible on the TV for days.
const ASSET_RE = /\/_next\/static\/[^"'\s\\)]+?\.(?:js|css)/g;

function assetsFromHtml(html: string): Set<string> {
  return new Set(html.match(ASSET_RE) ?? []);
}

/**
 * On the signage display only: every few minutes, fetch the current page fresh
 * and reload if the server is now serving a NEWER build (an asset filename the
 * running page never loaded), so the TV picks up deployed features by itself.
 */
export function useAutoRefreshOnNewBuild(enabled: boolean, intervalMs = 4 * 60 * 1000): void {
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    // What THIS page actually loaded — read from the live DOM, NOT a fresh fetch.
    // A fresh fetch could already be a newer build than the code that is running,
    // which would make us treat "stale cached page" as "up to date" forever.
    const loaded = assetsFromHtml(document.documentElement.outerHTML);
    if (loaded.size === 0) return;

    let stopped = false;
    let reloading = false;
    const check = async () => {
      if (reloading || stopped) return;
      try {
        // Cache-bust hard so no edge/proxy hands back a stale copy.
        const res = await fetch(`${window.location.pathname}?_v=${Date.now()}`, {
          cache: "no-store",
          headers: { "cache-control": "no-cache" },
        });
        if (!res.ok || stopped) return;
        const fresh = assetsFromHtml(await res.text());
        // A newer build introduces content-hashed filenames the running page
        // never loaded. (Chunks lazily added to the DOM after load only grow
        // `loaded`, so checking "fresh has something new" never false-fires.)
        let hasNew = false;
        for (const asset of fresh) {
          if (!loaded.has(asset)) {
            hasNew = true;
            break;
          }
        }
        if (hasNew && !stopped) {
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
