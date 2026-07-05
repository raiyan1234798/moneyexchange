/** Per-route ambient background accents — unimoni blue palette */
export const PAGE_BACKGROUNDS: Record<string, { blob1: string; blob2: string; blob3: string }> = {
  "/dashboard": {
    blob1: "color-mix(in srgb, #0078C8 32%, transparent)",
    blob2: "color-mix(in srgb, #00A3E0 20%, transparent)",
    blob3: "color-mix(in srgb, #10B981 16%, transparent)",
  },
  "/dashboard/branches": {
    blob1: "color-mix(in srgb, #0078C8 30%, transparent)",
    blob2: "color-mix(in srgb, #1A4D8F 26%, transparent)",
    blob3: "color-mix(in srgb, #C9A227 14%, transparent)",
  },
  "/dashboard/managers": {
    blob1: "color-mix(in srgb, #00A3E0 24%, transparent)",
    blob2: "color-mix(in srgb, #0078C8 22%, transparent)",
    blob3: "color-mix(in srgb, #1A4D8F 18%, transparent)",
  },
  "/dashboard/currencies": {
    blob1: "color-mix(in srgb, #C9A227 22%, transparent)",
    blob2: "color-mix(in srgb, #D4A853 18%, transparent)",
    blob3: "color-mix(in srgb, #0078C8 14%, transparent)",
  },
  "/dashboard/exchange-rates": {
    blob1: "color-mix(in srgb, #10B981 26%, transparent)",
    blob2: "color-mix(in srgb, #0078C8 22%, transparent)",
    blob3: "color-mix(in srgb, #C9A227 14%, transparent)",
  },
  "/dashboard/videos": {
    blob1: "color-mix(in srgb, #0078C8 28%, transparent)",
    blob2: "color-mix(in srgb, #1A4D8F 22%, transparent)",
    blob3: "color-mix(in srgb, #00A3E0 14%, transparent)",
  },
  "/dashboard/playlists": {
    blob1: "color-mix(in srgb, #0078C8 26%, transparent)",
    blob2: "color-mix(in srgb, #C9A227 18%, transparent)",
    blob3: "color-mix(in srgb, #1A4D8F 16%, transparent)",
  },
  "/dashboard/tickers": {
    blob1: "color-mix(in srgb, #00A3E0 24%, transparent)",
    blob2: "color-mix(in srgb, #0078C8 20%, transparent)",
    blob3: "color-mix(in srgb, #C9A227 12%, transparent)",
  },
  "/dashboard/tv-devices": {
    blob1: "color-mix(in srgb, #0078C8 28%, transparent)",
    blob2: "color-mix(in srgb, #1A4D8F 22%, transparent)",
    blob3: "color-mix(in srgb, #10B981 14%, transparent)",
  },
  "/dashboard/tv-monitoring": {
    blob1: "color-mix(in srgb, #10B981 26%, transparent)",
    blob2: "color-mix(in srgb, #0078C8 20%, transparent)",
    blob3: "color-mix(in srgb, #C9A227 12%, transparent)",
  },
  "/dashboard/analytics": {
    blob1: "color-mix(in srgb, #0078C8 26%, transparent)",
    blob2: "color-mix(in srgb, #C9A227 18%, transparent)",
    blob3: "color-mix(in srgb, #1A4D8F 14%, transparent)",
  },
  "/dashboard/notifications": {
    blob1: "color-mix(in srgb, #D4A853 22%, transparent)",
    blob2: "color-mix(in srgb, #C9A227 18%, transparent)",
    blob3: "color-mix(in srgb, #0078C8 14%, transparent)",
  },
  "/dashboard/audit-logs": {
    blob1: "color-mix(in srgb, #1A4D8F 24%, transparent)",
    blob2: "color-mix(in srgb, #0078C8 18%, transparent)",
    blob3: "color-mix(in srgb, #C9A227 12%, transparent)",
  },
  "/dashboard/settings": {
    blob1: "color-mix(in srgb, #0078C8 24%, transparent)",
    blob2: "color-mix(in srgb, #1A4D8F 18%, transparent)",
    blob3: "color-mix(in srgb, #C9A227 12%, transparent)",
  },
  "/dashboard/profile": {
    blob1: "color-mix(in srgb, #0078C8 26%, transparent)",
    blob2: "color-mix(in srgb, #C9A227 18%, transparent)",
    blob3: "color-mix(in srgb, #10B981 14%, transparent)",
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
