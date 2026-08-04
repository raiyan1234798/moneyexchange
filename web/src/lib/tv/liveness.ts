import type { TvDevice } from "@/lib/types";

/**
 * Is a TV actually live RIGHT NOW?
 *
 * The stored `status` field alone is not trustworthy: the player writes
 * status:"online" + lastSeenAt on every heartbeat (~30s), but NOTHING ever
 * writes it back to "offline" — so a TV that was unplugged days ago still
 * reads "online" forever. We therefore treat a device as live only when its
 * last heartbeat is recent.
 */
export const TV_STALE_AFTER_SECONDS = 180; // 3 min ≈ 6 missed 30s heartbeats

function toMillis(value: unknown): number | null {
  if (!value) return null;
  if (value instanceof Date) return value.getTime();
  // Firestore Timestamp (has toDate) or a serialized {seconds}
  const v = value as { toDate?: () => Date; seconds?: number };
  if (typeof v.toDate === "function") return v.toDate().getTime();
  if (typeof v.seconds === "number") return v.seconds * 1000;
  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? null : parsed;
}

/** True when the device reported in recently enough to count as online. */
export function isTvLive(
  device: Pick<TvDevice, "status" | "lastSeenAt">,
  nowMs: number = Date.now(),
  staleAfterSeconds: number = TV_STALE_AFTER_SECONDS,
): boolean {
  if (device.status === "maintenance") return false;
  const seen = toMillis(device.lastSeenAt);
  // No heartbeat recorded at all — fall back to the stored flag so freshly
  // paired devices aren't shown as offline before their first heartbeat.
  if (seen === null) return device.status === "online";
  return nowMs - seen <= staleAfterSeconds * 1000;
}

/** Milliseconds since the device last checked in (null when never). */
export function tvLastSeenMs(
  device: Pick<TvDevice, "lastSeenAt">,
  nowMs: number = Date.now(),
): number | null {
  const seen = toMillis(device.lastSeenAt);
  return seen === null ? null : nowMs - seen;
}

/** Split a device list into live / offline counts using real heartbeat times. */
export function summarizeTvs(
  devices: Array<Pick<TvDevice, "status" | "lastSeenAt">>,
  nowMs: number = Date.now(),
): { live: number; offline: number; total: number } {
  let live = 0;
  for (const d of devices) if (isTvLive(d, nowMs)) live += 1;
  return { live, offline: devices.length - live, total: devices.length };
}
