/** Public signage URL — open in Chrome fullscreen on any display */
export function getDisplayUrl(branchCode: string, origin?: string): string {
  const base = origin ?? (typeof window !== "undefined" ? window.location.origin : "");
  const code = encodeURIComponent(branchCode.trim().toUpperCase());
  return `${base}/display?branch=${code}`;
}

export function getDisplayUrlById(branchId: string, origin?: string): string {
  const base = origin ?? (typeof window !== "undefined" ? window.location.origin : "");
  return `${base}/display?branchId=${encodeURIComponent(branchId)}`;
}
