"use client";

import { useEffect } from "react";
import { subscribeThemeConfig } from "@/lib/services/theme-service";

/**
 * Applies the ORG-WIDE dashboard theme (app_config/theme) to every signed-in
 * user's dashboard by overriding the brand CSS variables at runtime. Clearing a
 * colour removes the override so the globals.css default reapplies — that is
 * what makes "Reset to default" free. Renders nothing.
 */
// The --unimoni-* vars in globals.css are aliases of these, so overriding the
// three roots recolours the whole dashboard.
const VAR_BY_KEY = {
  dashboardPrimary: "--brand-primary",
  dashboardAccent: "--brand-accent",
  dashboardGold: "--brand-gold",
} as const;

export function OrgThemeProvider() {
  useEffect(() => {
    const root = document.documentElement;
    const unsub = subscribeThemeConfig((config) => {
      for (const [key, cssVar] of Object.entries(VAR_BY_KEY)) {
        const value = config?.[key as keyof typeof VAR_BY_KEY] ?? null;
        if (value) root.style.setProperty(cssVar, value);
        else root.style.removeProperty(cssVar);
      }
    });
    return () => {
      unsub();
      // Leaving the dashboard (e.g. to the TV display) drops the overrides.
      for (const cssVar of Object.values(VAR_BY_KEY)) {
        document.documentElement.style.removeProperty(cssVar);
      }
    };
  }, []);

  return null;
}
