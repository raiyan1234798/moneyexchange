/** Per-route ambient background accents — Unimoni blue & gold palette */
export const PAGE_BACKGROUNDS: Record<string, { blob1: string; blob2: string; blob3: string }> = {
  "/dashboard": {
    blob1: "color-mix(in srgb, #0066CC 30%, transparent)",
    blob2: "color-mix(in srgb, #C9A227 20%, transparent)",
    blob3: "color-mix(in srgb, #4AB3E2 16%, transparent)",
  },
  "/dashboard/branches": {
    blob1: "color-mix(in srgb, #0066CC 28%, transparent)",
    blob2: "color-mix(in srgb, #1A2B4A 24%, transparent)",
    blob3: "color-mix(in srgb, #C9A227 14%, transparent)",
  },
  "/dashboard/managers": {
    blob1: "color-mix(in srgb, #C9A227 24%, transparent)",
    blob2: "color-mix(in srgb, #0066CC 22%, transparent)",
    blob3: "color-mix(in srgb, #1A2B4A 18%, transparent)",
  },
  "/dashboard/currencies": {
    blob1: "color-mix(in srgb, #D4A017 26%, transparent)",
    blob2: "color-mix(in srgb, #C9A227 20%, transparent)",
    blob3: "color-mix(in srgb, #0066CC 14%, transparent)",
  },
  "/dashboard/exchange-rates": {
    blob1: "color-mix(in srgb, #10B981 26%, transparent)",
    blob2: "color-mix(in srgb, #0066CC 22%, transparent)",
    blob3: "color-mix(in srgb, #C9A227 16%, transparent)",
  },
  "/dashboard/videos": {
    blob1: "color-mix(in srgb, #0066CC 28%, transparent)",
    blob2: "color-mix(in srgb, #1A2B4A 22%, transparent)",
    blob3: "color-mix(in srgb, #C9A227 14%, transparent)",
  },
  "/dashboard/playlists": {
    blob1: "color-mix(in srgb, #0066CC 26%, transparent)",
    blob2: "color-mix(in srgb, #C9A227 18%, transparent)",
    blob3: "color-mix(in srgb, #1A2B4A 16%, transparent)",
  },
  "/dashboard/tickers": {
    blob1: "color-mix(in srgb, #4AB3E2 24%, transparent)",
    blob2: "color-mix(in srgb, #0066CC 20%, transparent)",
    blob3: "color-mix(in srgb, #C9A227 14%, transparent)",
  },
  "/dashboard/tv-devices": {
    blob1: "color-mix(in srgb, #0066CC 28%, transparent)",
    blob2: "color-mix(in srgb, #1A2B4A 22%, transparent)",
    blob3: "color-mix(in srgb, #10B981 14%, transparent)",
  },
  "/dashboard/tv-monitoring": {
    blob1: "color-mix(in srgb, #10B981 26%, transparent)",
    blob2: "color-mix(in srgb, #0066CC 20%, transparent)",
    blob3: "color-mix(in srgb, #C9A227 14%, transparent)",
  },
  "/dashboard/analytics": {
    blob1: "color-mix(in srgb, #0066CC 26%, transparent)",
    blob2: "color-mix(in srgb, #C9A227 18%, transparent)",
    blob3: "color-mix(in srgb, #1A2B4A 14%, transparent)",
  },
  "/dashboard/notifications": {
    blob1: "color-mix(in srgb, #D4A017 24%, transparent)",
    blob2: "color-mix(in srgb, #C9A227 20%, transparent)",
    blob3: "color-mix(in srgb, #0066CC 14%, transparent)",
  },
  "/dashboard/audit-logs": {
    blob1: "color-mix(in srgb, #1A2B4A 24%, transparent)",
    blob2: "color-mix(in srgb, #0066CC 18%, transparent)",
    blob3: "color-mix(in srgb, #C9A227 12%, transparent)",
  },
  "/dashboard/settings": {
    blob1: "color-mix(in srgb, #0066CC 24%, transparent)",
    blob2: "color-mix(in srgb, #1A2B4A 18%, transparent)",
    blob3: "color-mix(in srgb, #C9A227 12%, transparent)",
  },
  "/dashboard/profile": {
    blob1: "color-mix(in srgb, #0066CC 26%, transparent)",
    blob2: "color-mix(in srgb, #C9A227 18%, transparent)",
    blob3: "color-mix(in srgb, #4AB3E2 14%, transparent)",
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
