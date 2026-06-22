const DISPLAY_BRANCH_STORAGE_KEY = "moneyexchange_display_branch_code";

/** Canonical branch code for Firestore queries and display URLs */
export function normalizeBranchCode(code: string): string {
  return code.trim().toUpperCase();
}

export const DEMO_DISPLAY_PATH = "/display/demo";

/** Public signage URL — open in Chrome fullscreen on any display */
export function getDisplayUrl(branchCode: string, origin?: string): string {
  const base = origin ?? (typeof window !== "undefined" ? window.location.origin : "");
  const code = encodeURIComponent(normalizeBranchCode(branchCode));
  return `${base}/display?branch=${code}`;
}

export function getDisplayUrlById(branchId: string, origin?: string): string {
  const base = origin ?? (typeof window !== "undefined" ? window.location.origin : "");
  return `${base}/display?branchId=${encodeURIComponent(branchId)}`;
}

export function getStoredDisplayBranchCode(): string {
  if (typeof window === "undefined") return "";
  const stored = localStorage.getItem(DISPLAY_BRANCH_STORAGE_KEY);
  return stored ? normalizeBranchCode(stored) : "";
}

export function setStoredDisplayBranchCode(branchCode: string): void {
  if (typeof window === "undefined") return;
  const code = normalizeBranchCode(branchCode);
  if (code) {
    localStorage.setItem(DISPLAY_BRANCH_STORAGE_KEY, code);
  } else {
    localStorage.removeItem(DISPLAY_BRANCH_STORAGE_KEY);
  }
}
