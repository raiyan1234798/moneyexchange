/** Per-route ambient background accents — follow the org dashboard theme. */
export const PAGE_BACKGROUNDS: Record<string, { blob1: string; blob2: string; blob3: string }> = {
  "/dashboard": {
    blob1: "color-mix(in srgb, var(--brand-primary-light) 32%, transparent)",
    blob2: "color-mix(in srgb, var(--brand-accent) 20%, transparent)",
    blob3: "color-mix(in srgb, var(--brand-live) 16%, transparent)",
  },
  "/dashboard/branches": {
    blob1: "color-mix(in srgb, var(--brand-primary-light) 30%, transparent)",
    blob2: "color-mix(in srgb, var(--brand-surface) 26%, transparent)",
    blob3: "color-mix(in srgb, var(--brand-gold) 14%, transparent)",
  },
  "/dashboard/managers": {
    blob1: "color-mix(in srgb, var(--brand-accent) 24%, transparent)",
    blob2: "color-mix(in srgb, var(--brand-primary-light) 22%, transparent)",
    blob3: "color-mix(in srgb, var(--brand-surface) 18%, transparent)",
  },
  "/dashboard/currencies": {
    blob1: "color-mix(in srgb, var(--brand-gold) 22%, transparent)",
    blob2: "color-mix(in srgb, var(--brand-gold-bright) 18%, transparent)",
    blob3: "color-mix(in srgb, var(--brand-primary-light) 14%, transparent)",
  },
  "/dashboard/exchange-rates": {
    blob1: "color-mix(in srgb, var(--brand-live) 26%, transparent)",
    blob2: "color-mix(in srgb, var(--brand-primary-light) 22%, transparent)",
    blob3: "color-mix(in srgb, var(--brand-gold) 14%, transparent)",
  },
  "/dashboard/videos": {
    blob1: "color-mix(in srgb, var(--brand-primary-light) 28%, transparent)",
    blob2: "color-mix(in srgb, var(--brand-surface) 22%, transparent)",
    blob3: "color-mix(in srgb, var(--brand-accent) 14%, transparent)",
  },
  "/dashboard/playlists": {
    blob1: "color-mix(in srgb, var(--brand-primary-light) 26%, transparent)",
    blob2: "color-mix(in srgb, var(--brand-gold) 18%, transparent)",
    blob3: "color-mix(in srgb, var(--brand-surface) 16%, transparent)",
  },
  "/dashboard/tickers": {
    blob1: "color-mix(in srgb, var(--brand-accent) 24%, transparent)",
    blob2: "color-mix(in srgb, var(--brand-primary-light) 20%, transparent)",
    blob3: "color-mix(in srgb, var(--brand-gold) 12%, transparent)",
  },
  "/dashboard/tv-devices": {
    blob1: "color-mix(in srgb, var(--brand-primary-light) 28%, transparent)",
    blob2: "color-mix(in srgb, var(--brand-surface) 22%, transparent)",
    blob3: "color-mix(in srgb, var(--brand-live) 14%, transparent)",
  },
  "/dashboard/tv-monitoring": {
    blob1: "color-mix(in srgb, var(--brand-live) 26%, transparent)",
    blob2: "color-mix(in srgb, var(--brand-primary-light) 20%, transparent)",
    blob3: "color-mix(in srgb, var(--brand-gold) 12%, transparent)",
  },
  "/dashboard/analytics": {
    blob1: "color-mix(in srgb, var(--brand-primary-light) 26%, transparent)",
    blob2: "color-mix(in srgb, var(--brand-gold) 18%, transparent)",
    blob3: "color-mix(in srgb, var(--brand-surface) 14%, transparent)",
  },
  "/dashboard/notifications": {
    blob1: "color-mix(in srgb, var(--brand-gold-bright) 22%, transparent)",
    blob2: "color-mix(in srgb, var(--brand-gold) 18%, transparent)",
    blob3: "color-mix(in srgb, var(--brand-primary-light) 14%, transparent)",
  },
  "/dashboard/audit-logs": {
    blob1: "color-mix(in srgb, var(--brand-surface) 24%, transparent)",
    blob2: "color-mix(in srgb, var(--brand-primary-light) 18%, transparent)",
    blob3: "color-mix(in srgb, var(--brand-gold) 12%, transparent)",
  },
  "/dashboard/settings": {
    blob1: "color-mix(in srgb, var(--brand-primary-light) 24%, transparent)",
    blob2: "color-mix(in srgb, var(--brand-surface) 18%, transparent)",
    blob3: "color-mix(in srgb, var(--brand-gold) 12%, transparent)",
  },
  "/dashboard/profile": {
    blob1: "color-mix(in srgb, var(--brand-primary-light) 26%, transparent)",
    blob2: "color-mix(in srgb, var(--brand-gold) 18%, transparent)",
    blob3: "color-mix(in srgb, var(--brand-live) 14%, transparent)",
  },
};

export const DEFAULT_PAGE_BG = PAGE_BACKGROUNDS["/dashboard"];

export function getPageBackground(pathname: string) {
  if (PAGE_BACKGROUNDS[pathname]) return PAGE_BACKGROUNDS[pathname];
  const match = Object.keys(PAGE_BACKGROUNDS)
    .sort((a, b) => b.length - a.length)
    .find((key) => pathname.startsWith(key));
  return match ? PAGE_BACKGROUNDS[match] : DEFAULT_PAGE_BG;
}
