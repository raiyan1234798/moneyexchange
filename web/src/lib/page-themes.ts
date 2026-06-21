/** Per-route ambient background accents (polymorphic minimalism) */
export const PAGE_BACKGROUNDS: Record<string, { blob1: string; blob2: string; blob3: string }> = {
  "/dashboard": {
    blob1: "oklch(0.72 0.14 280 / 0.35)",
    blob2: "oklch(0.78 0.12 200 / 0.28)",
    blob3: "oklch(0.85 0.08 150 / 0.22)",
  },
  "/dashboard/branches": {
    blob1: "oklch(0.75 0.16 250 / 0.32)",
    blob2: "oklch(0.82 0.10 300 / 0.24)",
    blob3: "oklch(0.70 0.12 220 / 0.20)",
  },
  "/dashboard/managers": {
    blob1: "oklch(0.78 0.14 340 / 0.30)",
    blob2: "oklch(0.72 0.10 280 / 0.26)",
    blob3: "oklch(0.80 0.08 200 / 0.18)",
  },
  "/dashboard/currencies": {
    blob1: "oklch(0.82 0.18 85 / 0.30)",
    blob2: "oklch(0.76 0.14 55 / 0.24)",
    blob3: "oklch(0.88 0.10 120 / 0.18)",
  },
  "/dashboard/exchange-rates": {
    blob1: "oklch(0.72 0.16 160 / 0.32)",
    blob2: "oklch(0.78 0.12 190 / 0.26)",
    blob3: "oklch(0.84 0.08 220 / 0.20)",
  },
  "/dashboard/videos": {
    blob1: "oklch(0.74 0.18 15 / 0.28)",
    blob2: "oklch(0.80 0.14 350 / 0.24)",
    blob3: "oklch(0.76 0.10 300 / 0.18)",
  },
  "/dashboard/playlists": {
    blob1: "oklch(0.76 0.16 320 / 0.30)",
    blob2: "oklch(0.82 0.12 280 / 0.22)",
    blob3: "oklch(0.70 0.10 240 / 0.18)",
  },
  "/dashboard/tickers": {
    blob1: "oklch(0.78 0.14 200 / 0.30)",
    blob2: "oklch(0.74 0.12 260 / 0.24)",
    blob3: "oklch(0.86 0.08 180 / 0.20)",
  },
  "/dashboard/tv-devices": {
    blob1: "oklch(0.72 0.16 250 / 0.32)",
    blob2: "oklch(0.78 0.12 290 / 0.26)",
    blob3: "oklch(0.84 0.08 220 / 0.18)",
  },
  "/dashboard/tv-monitoring": {
    blob1: "oklch(0.74 0.18 145 / 0.30)",
    blob2: "oklch(0.80 0.12 180 / 0.24)",
    blob3: "oklch(0.68 0.10 220 / 0.20)",
  },
  "/dashboard/analytics": {
    blob1: "oklch(0.76 0.14 270 / 0.30)",
    blob2: "oklch(0.82 0.10 310 / 0.22)",
    blob3: "oklch(0.72 0.08 200 / 0.18)",
  },
  "/dashboard/notifications": {
    blob1: "oklch(0.78 0.16 40 / 0.28)",
    blob2: "oklch(0.74 0.12 20 / 0.24)",
    blob3: "oklch(0.86 0.08 80 / 0.18)",
  },
  "/dashboard/audit-logs": {
    blob1: "oklch(0.70 0.10 260 / 0.28)",
    blob2: "oklch(0.76 0.08 240 / 0.22)",
    blob3: "oklch(0.82 0.06 280 / 0.16)",
  },
  "/dashboard/settings": {
    blob1: "oklch(0.74 0.12 220 / 0.28)",
    blob2: "oklch(0.80 0.10 260 / 0.22)",
    blob3: "oklch(0.86 0.06 200 / 0.16)",
  },
  "/dashboard/profile": {
    blob1: "oklch(0.76 0.14 280 / 0.30)",
    blob2: "oklch(0.82 0.10 310 / 0.22)",
    blob3: "oklch(0.72 0.08 240 / 0.18)",
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
