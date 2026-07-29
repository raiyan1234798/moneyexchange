"use client";

import { useEffect } from "react";
import { subscribeThemeConfig } from "@/lib/services/theme-service";
import { applyThemeCssVars, clearThemeCssVars } from "@/lib/theme-css";

/**
 * Applies the ORG-WIDE dashboard theme (app_config/theme) to every signed-in
 * user's dashboard by overriding the brand CSS variables at runtime. Clearing a
 * colour removes the override so the globals.css default reapplies — that is
 * what makes "Reset to default" free. Renders nothing.
 *
 * Live Firestore subscribe → every open dashboard updates as soon as an admin
 * saves. --unimoni-* aliases in globals.css follow these roots automatically.
 */
export function OrgThemeProvider() {
  useEffect(() => {
    const root = document.documentElement.style;
    const unsub = subscribeThemeConfig((config) => {
      applyThemeCssVars(root, config);
    });
    return () => {
      unsub();
      // Leaving the dashboard (e.g. to the TV display) drops the overrides.
      clearThemeCssVars(document.documentElement.style);
    };
  }, []);

  return null;
}
