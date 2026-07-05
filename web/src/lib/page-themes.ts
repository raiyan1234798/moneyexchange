/** Per-route ambient background accents — Unimoney navy & gold palette */
export const PAGE_BACKGROUNDS: Record<string, { blob1: string; blob2: string; blob3: string }> = {
  "/dashboard": {
    blob1: "color-mix(in srgb, #1E3A5F 35%, transparent)",
    blob2: "color-mix(in srgb, #D4A853 22%, transparent)",
    blob3: "color-mix(in srgb, #10B981 18%, transparent)",
  },
  "/dashboard/branches": {
    blob1: "color-mix(in srgb, #1E3A5F 32%, transparent)",
    blob2: "color-mix(in srgb, #0F2847 28%, transparent)",
    blob3: "color-mix(in srgb, #D4A853 16%, transparent)",
  },
  "/dashboard/managers": {
    blob1: "color-mix(in srgb, #D4A853 26%, transparent)",
    blob2: "color-mix(in srgb, #1E3A5F 24%, transparent)",
    blob3: "color-mix(in srgb, #0B1F3A 20%, transparent)",
  },
  "/dashboard/currencies": {
    blob1: "color-mix(in srgb, #F5B942 28%, transparent)",
    blob2: "color-mix(in srgb, #D4A853 22%, transparent)",
    blob3: "color-mix(in srgb, #1E3A5F 16%, transparent)",
  },
  "/dashboard/exchange-rates": {
    blob1: "color-mix(in srgb, #10B981 28%, transparent)",
    blob2: "color-mix(in srgb, #1E3A5F 24%, transparent)",
    blob3: "color-mix(in srgb, #D4A853 18%, transparent)",
  },
  "/dashboard/videos": {
    blob1: "color-mix(in srgb, #1E3A5F 30%, transparent)",
    blob2: "color-mix(in srgb, #0B1F3A 24%, transparent)",
    blob3: "color-mix(in srgb, #D4A853 16%, transparent)",
  },
  "/dashboard/playlists": {
    blob1: "color-mix(in srgb, #1E3A5F 28%, transparent)",
    blob2: "color-mix(in srgb, #D4A853 20%, transparent)",
    blob3: "color-mix(in srgb, #0F2847 18%, transparent)",
  },
  "/dashboard/tickers": {
    blob1: "color-mix(in srgb, #14B8A6 26%, transparent)",
    blob2: "color-mix(in srgb, #1E3A5F 22%, transparent)",
    blob3: "color-mix(in srgb, #D4A853 16%, transparent)",
  },
  "/dashboard/tv-devices": {
    blob1: "color-mix(in srgb, #1E3A5F 30%, transparent)",
    blob2: "color-mix(in srgb, #0F2847 24%, transparent)",
    blob3: "color-mix(in srgb, #10B981 16%, transparent)",
  },
  "/dashboard/tv-monitoring": {
    blob1: "color-mix(in srgb, #10B981 28%, transparent)",
    blob2: "color-mix(in srgb, #1E3A5F 22%, transparent)",
    blob3: "color-mix(in srgb, #D4A853 16%, transparent)",
  },
  "/dashboard/analytics": {
    blob1: "color-mix(in srgb, #1E3A5F 28%, transparent)",
    blob2: "color-mix(in srgb, #D4A853 20%, transparent)",
    blob3: "color-mix(in srgb, #0B1F3A 16%, transparent)",
  },
  "/dashboard/notifications": {
    blob1: "color-mix(in srgb, #F5B942 26%, transparent)",
    blob2: "color-mix(in srgb, #D4A853 22%, transparent)",
    blob3: "color-mix(in srgb, #1E3A5F 16%, transparent)",
  },
  "/dashboard/audit-logs": {
    blob1: "color-mix(in srgb, #0B1F3A 26%, transparent)",
    blob2: "color-mix(in srgb, #1E3A5F 20%, transparent)",
    blob3: "color-mix(in srgb, #D4A853 14%, transparent)",
  },
  "/dashboard/settings": {
    blob1: "color-mix(in srgb, #1E3A5F 26%, transparent)",
    blob2: "color-mix(in srgb, #0F2847 20%, transparent)",
    blob3: "color-mix(in srgb, #D4A853 14%, transparent)",
  },
  "/dashboard/profile": {
    blob1: "color-mix(in srgb, #1E3A5F 28%, transparent)",
    blob2: "color-mix(in srgb, #D4A853 20%, transparent)",
    blob3: "color-mix(in srgb, #10B981 16%, transparent)",
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
