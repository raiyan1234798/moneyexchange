/**
 * Many TVs (HDMI + Android TV Chrome) crop 3–5% off each edge. Laptops do not.
 * Admin can raise displaySafeAreaPercent in Settings; on likely-TV clients we
 * apply a small floor so logo/date/ticker are not clipped when that setting is 0.
 */
export function isLikelyTvDisplay(): boolean {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent;
  return /Android TV|GoogleTV|Google TV|CrKey|SmartTV|BRAVIA|Tizen|Web0S|WebOS|AFT[A-Z0-9]|HbbTV|NetCast|Viera|Philips/i.test(
    ua,
  );
}

export function effectiveDisplaySafeAreaPercent(configured: number | null | undefined): number {
  const c = Math.max(0, Math.min(15, configured ?? 0));
  const tvFloor = isLikelyTvDisplay() ? 5 : 0;
  return Math.max(c, tvFloor);
}

/** CSS length for edge inset (used in var(--display-safe-inset)). */
export function displaySafeInsetCss(percent: number): string {
  if (percent <= 0) return "0px";
  return `${percent}vmin`;
}
