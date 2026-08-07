"use client";

import { useEffect } from "react";
import { toast } from "sonner";

import { useNewBuildAvailable } from "@/lib/tv/use-auto-refresh";

/**
 * Update notice for the dashboard: when a newer build is deployed, show a
 * toast that STAYS until acted on (client 2026-08-07: a 12s toast was missed,
 * so the tab kept running hours-old code and re-showing errors that were
 * already fixed). Still never reloads on its own — that would interrupt an
 * upload or lose unsaved edits; the user chooses when.
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
    toast.info("A new version is ready — refresh to get the latest fixes.", {
      id: "new-build",
      // Stays until clicked: an update that is missed leaves this tab running
      // old code, which is how already-fixed errors keep reappearing.
      duration: Infinity,
      action: {
        label: "Refresh now",
        onClick: () => window.location.reload(),
      },
    });
  }, [newBuildId]);

  return null;
}
