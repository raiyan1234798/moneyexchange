"use client";

import { useState } from "react";
import {
  countryCodeFromCurrencyCode,
  countryCodeFromFlagEmoji,
} from "@/lib/currency-utils";

/**
 * Country-flag chip. Every flag renders as a small PNG served from THIS site
 * (/public/flags — all 252 countries + UK subdivisions), because the client's
 * actual TVs have no colour-emoji font: emoji flags degrade to bare letter
 * pairs ("US", "GB" — client screenshot 2026-07-27). Self-hosting also fixes
 * the earlier mixed look, where an external flag CDN loaded for some rows and
 * failed for others. The emoji span remains only as a last-resort fallback
 * (custom currencies with no country, or a missing file).
 *
 * Slot is a fixed box rendered with object-fill so every flag (including wide
 * 2:1 flags like Zimbabwe) displays all its emblem symbols and triangles completely
 * without cropping any side edges.
 */
function resolveFlagCountry(
  flag: string,
  currencyCode?: string | null,
): string | null {
  const fromEmoji = countryCodeFromFlagEmoji(flag);
  if (fromEmoji) return fromEmoji;

  const codeHint = currencyCode?.trim() || "";
  if (codeHint) {
    const fromCurrency = countryCodeFromCurrencyCode(codeHint);
    if (fromCurrency) return fromCurrency;
  }

  // Allow callers to pass a raw ISO currency or country code as `flag`
  // when no emoji was stored yet (new catalog rows).
  const trimmed = flag.trim();
  if (/^[A-Za-z]{2,3}$/.test(trimmed)) {
    return countryCodeFromCurrencyCode(trimmed);
  }

  return null;
}

export function FlagChip({
  flag,
  currencyCode,
  className = "",
  chipClassName = "",
}: {
  flag: string;
  /** ISO 4217 code — used when `flag` is missing/placeholder so new currencies
      still load `/flags/{country}.png` from the alphabetic currency code. */
  currencyCode?: string | null;
  /** Applied to BOTH forms (emoji span and image wrapper) — animations, margins. */
  className?: string;
  /** Applied ONLY when a real image renders (box size, ring, shadow). Emoji
      must never get these — a ringed fixed-size box around a glyph paints an
      ugly empty pill next to the flag (client 2026-07-27). */
  chipClassName?: string;
}) {
  const [failed, setFailed] = useState(false);
  const country = resolveFlagCountry(flag, currencyCode);

  if (!country || failed) {
    // Last-resort emoji glyph (custom currencies / missing file): no box
    // styling — a ringed empty pill next to a glyph looks broken.
    return (
      <span className={`inline-flex shrink-0 items-center justify-center text-[1.7em] leading-none ${className}`}>
        {flag}
      </span>
    );
  }

  // NEVER crop: emblems/symbols at flag edges must always be visible (client
  // 2026-08-01). object-fill stretches slightly instead of cutting — the same
  // trade the client chose for videos. One rule, no per-flag exceptions to
  // forget for future currencies.
  const fitClass = "object-fill";

  return (
    <span
      className={`inline-flex h-[1.05em] w-[1.6em] shrink-0 overflow-hidden rounded-[2px] ring-1 ring-black/15 ${chipClassName} ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- tiny same-origin flag PNG; next/image adds nothing here */}
      <img
        src={`/flags/${country}.png`}
        alt=""
        onError={() => setFailed(true)}
        className={`h-full w-full ${fitClass}`}
      />
    </span>
  );
}
