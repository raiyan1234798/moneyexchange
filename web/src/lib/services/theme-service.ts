import {
  deleteField,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from "firebase/firestore";

import { db } from "@/lib/firebase/client";
import { normalizeFirestoreError } from "@/lib/firebase/firestore-errors";
import { COLLECTIONS } from "@/lib/constants";

/** The single doc that holds the ORG-WIDE dashboard theme colours. */
export const THEME_DOC_ID = "theme";

/**
 * Colours an admin can override for EVERY user's dashboard. null/missing = use
 * the built-in default from globals.css, so "Reset to default" simply clears
 * the override.
 */
export interface ThemeConfig {
  /** Main brand colour (buttons, links, active nav). Default #0066B3. */
  dashboardPrimary: string | null;
  /** Accent colour (highlights, cyan details). Default #00A3E0. */
  dashboardAccent: string | null;
  /** Gold colour (stat icons, warm accents). Default #C9A227. */
  dashboardGold: string | null;
  updatedByName?: string;
}

type Actor = { userId: string; userName: string };

function ref() {
  return doc(db, COLLECTIONS.appConfig, THEME_DOC_ID);
}

function cleanColor(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Live-subscribe to the org theme. Errors (offline/permission) → null = defaults. */
export function subscribeThemeConfig(onData: (config: ThemeConfig | null) => void): Unsubscribe {
  return onSnapshot(
    ref(),
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      const data = snap.data() as Partial<ThemeConfig>;
      onData({
        dashboardPrimary: cleanColor(data.dashboardPrimary),
        dashboardAccent: cleanColor(data.dashboardAccent),
        dashboardGold: cleanColor(data.dashboardGold),
        updatedByName: data.updatedByName,
      });
    },
    () => onData(null),
  );
}

/** Save the org-wide theme. Pass null for a colour to clear it back to default. */
export async function setThemeConfig(
  colors: { dashboardPrimary?: string | null; dashboardAccent?: string | null; dashboardGold?: string | null },
  actor: Actor,
): Promise<void> {
  try {
    const payload: Record<string, unknown> = {
      updatedByName: actor.userName,
      updatedAt: serverTimestamp(),
    };
    for (const key of ["dashboardPrimary", "dashboardAccent", "dashboardGold"] as const) {
      if (key in colors) {
        const v = colors[key];
        payload[key] = v && v.trim() ? v.trim() : deleteField();
      }
    }
    await setDoc(ref(), payload, { merge: true });
  } catch (error) {
    throw normalizeFirestoreError(error);
  }
}
