"use client";

import { useEffect } from "react";
import { toast } from "sonner";

import { useNewBuildAvailable } from "@/lib/tv/use-auto-refresh";

/**
 * Quiet update notice for the dashboard: when a newer build is deployed, show a
 * single small toast (ONCE per build — never a persistent bar, never repeated)
 * with a Refresh action. It never reloads on its own, so it can't interrupt an
 * upload or lose unsaved edits.
 */
export function UpdateBanner() {
  const newBuildId = useNewBuildAvailable();

  useEffect(() => {
    if (!newBuildId) return;
    const key = `seen-build-${newBuildId}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // sessionStorage unavailable — still show the toast once per mount.
    }
    toast.info("A new version is ready.", {
      id: "new-build",
      duration: 12000,
      action: {
        label: "Refresh",
        onClick: () => window.location.reload(),
      },
    });
  }, [newBuildId]);

  return null;
}
