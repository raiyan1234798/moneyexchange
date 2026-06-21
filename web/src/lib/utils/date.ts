import { format, formatDistanceToNow, type FormatDistanceToNowOptions } from "date-fns";
import { Timestamp } from "firebase/firestore";

export function toSafeDate(value: unknown): Date | null {
  if (value == null) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (value instanceof Timestamp) {
    const d = value.toDate();
    return Number.isNaN(d.getTime()) ? null : d;
  }

  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof (value as { toDate: () => Date }).toDate === "function"
  ) {
    const d = (value as { toDate: () => Date }).toDate();
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
  }

  if (typeof value === "object" && value !== null && "seconds" in value) {
    const { seconds, nanoseconds = 0 } = value as { seconds: number; nanoseconds?: number };
    const d = new Date(seconds * 1000 + nanoseconds / 1_000_000);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  if (typeof value === "number" || typeof value === "string") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  return null;
}

export function safeFormatDate(value: unknown, formatStr: string, fallback = "—"): string {
  const d = toSafeDate(value);
  if (!d) return fallback;
  try {
    return format(d, formatStr);
  } catch {
    return fallback;
  }
}

export function safeFormatDistanceToNow(
  value: unknown,
  options?: FormatDistanceToNowOptions,
  fallback = "—",
): string {
  const d = toSafeDate(value);
  if (!d) return fallback;
  try {
    return formatDistanceToNow(d, options);
  } catch {
    return fallback;
  }
}

export function safeFormatLocaleDateTime(value: unknown, fallback = "—"): string {
  const d = toSafeDate(value);
  if (!d) return fallback;
  try {
    return d.toLocaleString();
  } catch {
    return fallback;
  }
}
