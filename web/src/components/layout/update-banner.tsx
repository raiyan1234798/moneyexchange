"use client";

import { useState } from "react";
import { RefreshCw, X } from "lucide-react";

import { useNewBuildAvailable } from "@/lib/tv/use-auto-refresh";

/**
 * A gentle "a new version is ready" banner for the dashboard. It never reloads on
 * its own — the admin might be mid-upload or typing — so it just offers a Refresh
 * button. This stops the app from silently running an old cached version (which,
 * for example, made big video uploads fail with an out-of-date uploader).
 */
export function UpdateBanner() {
  const available = useNewBuildAvailable();
  const [dismissed, setDismissed] = useState(false);
  if (!available || dismissed) return null;

  return (
    <div className="flex items-center justify-center gap-3 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-700 dark:text-amber-300">
      <RefreshCw className="h-4 w-4 shrink-0" />
      <span>A new version is ready. Refresh to get the latest fixes and features.</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="rounded-lg bg-amber-500/20 px-3 py-1 font-medium transition-colors hover:bg-amber-500/30"
      >
        Refresh now
      </button>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => setDismissed(true)}
        className="ml-1 rounded-md p-1 hover:bg-amber-500/20"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
