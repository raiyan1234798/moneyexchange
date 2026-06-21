const DISPLAY_BRANCH_STORAGE_KEY = "moneyexchange_display_branch_code";

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

export function getStoredDisplayBranchCode(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(DISPLAY_BRANCH_STORAGE_KEY)?.trim().toUpperCase() ?? "";
}

export function setStoredDisplayBranchCode(branchCode: string): void {
  if (typeof window === "undefined") return;
  const code = branchCode.trim().toUpperCase();
  if (code) {
    localStorage.setItem(DISPLAY_BRANCH_STORAGE_KEY, code);
  } else {
    localStorage.removeItem(DISPLAY_BRANCH_STORAGE_KEY);
  }
}
