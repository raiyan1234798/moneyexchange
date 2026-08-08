/**
 * Some TVs crop 3–5% off each edge over HDMI ("overscan"); most modern ones do
 * not, especially with the panel set to Just Scan / Screen Fit.
 *
 * The admin owns this. A saved 0 means OFF and is respected — previously any
 * TV-looking user agent got a forced 5% floor, so the signage was drawn at 90%
 * with black borders on every Android TV and the Settings control appeared to
 * do nothing (client 2026-08-08). Only when the branch has NEVER been
 * configured do we assume a small TV default.
 */
export function isLikelyTvDisplay(): boolean {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent;
  return /Android TV|GoogleTV|Google TV|CrKey|SmartTV|BRAVIA|Tizen|Web0S|WebOS|AFT[A-Z0-9]|HbbTV|NetCast|Viera|Philips/i.test(
    ua,
  );
}

export function effectiveDisplaySafeAreaPercent(configured: number | null | undefined): number {
  // Explicitly configured (including 0) wins — always.
  if (typeof configured === "number" && Number.isFinite(configured)) {
    return Math.max(0, Math.min(15, configured));
  }
  // Never configured: a conservative TV default, 0 everywhere else.
  return isLikelyTvDisplay() ? 3 : 0;
}

/** CSS length for edge inset (used in var(--display-safe-inset)). */
export function displaySafeInsetCss(percent: number): string {
  if (percent <= 0) return "0px";
  return `${percent}vmin`;
}
