/**
 * Helpers that push org-wide dashboard theme colours onto CSS variables.
 * Used by OrgThemeProvider (live subscribe) and OrgThemePanel (optimistic save).
 */

const DEFAULTS = {
  primary: "#0066B3",
  accent: "#00A3E0",
  gold: "#C9A227",
} as const;

function parseHex(value: string): { r: number; g: number; b: number } | null {
  const raw = value.trim().replace(/^#/, "");
  const hex =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
  const n = parseInt(hex, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function toHex({ r, g, b }: { r: number; g: number; b: number }): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${[clamp(r), clamp(g), clamp(b)]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("")}`;
}

/** Mix toward white (amount 0–1). */
export function lightenHex(hex: string, amount: number): string {
  const c = parseHex(hex);
  if (!c) return hex;
  return toHex({
    r: c.r + (255 - c.r) * amount,
    g: c.g + (255 - c.g) * amount,
    b: c.b + (255 - c.b) * amount,
  });
}

/** Mix toward black (amount 0–1). */
export function darkenHex(hex: string, amount: number): string {
  const c = parseHex(hex);
  if (!c) return hex;
  return toHex({
    r: c.r * (1 - amount),
    g: c.g * (1 - amount),
    b: c.b * (1 - amount),
  });
}

export type ThemeCssColors = {
  dashboardPrimary?: string | null;
  dashboardAccent?: string | null;
  dashboardGold?: string | null;
};

/**
 * Write (or clear) brand CSS variables on :root so every dashboard user sees
 * the same colours. Derived light/surface/bright tokens follow the three
 * admin pickers so hardcoded page blobs and dark-mode primary also update.
 */
export function applyThemeCssVars(
  root: CSSStyleDeclaration,
  colors: ThemeCssColors | null,
): void {
  const primary = colors?.dashboardPrimary?.trim() || null;
  const accent = colors?.dashboardAccent?.trim() || null;
  const gold = colors?.dashboardGold?.trim() || null;

  if (primary) {
    root.setProperty("--brand-primary", primary);
    root.setProperty("--brand-primary-light", lightenHex(primary, 0.12));
    root.setProperty("--brand-surface", darkenHex(primary, 0.28));
  } else {
    root.removeProperty("--brand-primary");
    root.removeProperty("--brand-primary-light");
    root.removeProperty("--brand-surface");
  }

  if (accent) {
    root.setProperty("--brand-accent", accent);
    root.setProperty("--brand-accent-bright", lightenHex(accent, 0.45));
  } else {
    root.removeProperty("--brand-accent");
    root.removeProperty("--brand-accent-bright");
  }

  if (gold) {
    root.setProperty("--brand-gold", gold);
    root.setProperty("--brand-gold-bright", lightenHex(gold, 0.18));
  } else {
    root.removeProperty("--brand-gold");
    root.removeProperty("--brand-gold-bright");
  }
}

export function clearThemeCssVars(root: CSSStyleDeclaration): void {
  applyThemeCssVars(root, null);
}

export const THEME_COLOR_DEFAULTS = DEFAULTS;
