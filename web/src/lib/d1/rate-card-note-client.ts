/**
 * Dual-write / dual-read client for the Phase 2 D1 pilot (rate card notes).
 * Firestore remains source of truth until cutover; failures here never block UI saves.
 */

import { auth } from "@/lib/firebase/client";

async function authHeader(): Promise<HeadersInit> {
  const user = auth.currentUser;
  if (!user) return {};
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

/** Best-effort mirror of rateCardNote into Cloudflare D1 via the Pages worker. */
export async function dualWriteRateCardNote(
  branchId: string,
  note: string | null,
): Promise<void> {
  if (!branchId) return;
  try {
    const headers = await authHeader();
    if (!("Authorization" in headers)) return;
    const res = await fetch("/api/d1/rate-card-note", {
      method: "PUT",
      headers,
      body: JSON.stringify({ branchId, note }),
    });
    if (!res.ok && res.status !== 503) {
      // 503 = D1 not bound yet — expected until Cloudflare binding is attached.
      console.warn("[d1] rate-card-note write", res.status, await res.text().catch(() => ""));
    }
  } catch (error) {
    console.warn("[d1] rate-card-note write failed", error);
  }
}

export async function dualReadRateCardNote(branchId: string): Promise<string | null | undefined> {
  if (!branchId) return undefined;
  try {
    const res = await fetch(`/api/d1/rate-card-note?branchId=${encodeURIComponent(branchId)}`);
    if (!res.ok) return undefined;
    const data = (await res.json()) as { note?: string | null };
    return data.note ?? null;
  } catch {
    return undefined;
  }
}
