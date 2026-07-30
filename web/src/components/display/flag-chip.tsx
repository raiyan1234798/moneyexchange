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
 * Slot is a fixed box filled with object-cover so every flag (2:1, square,
 * Nepal, …) occupies the full chip — no letterboxing empty bands.
 *
 * Currency code wins over a stored/override emoji when both resolve: a wrong
 * emoji saved on ZMW (Zimbabwe 🇿🇼 instead of Zambia 🇿🇲) must not paint the
 * wrong country on the TV.
 */
function resolveFlagCountry(
  flag: string,
  currencyCode?: string | null,
): string | null {
  const codeHint = currencyCode?.trim() || "";
  if (codeHint) {
    const fromCurrency = countryCodeFromCurrencyCode(codeHint);
    if (fromCurrency) return fromCurrency;
  }

  const fromEmoji = countryCodeFromFlagEmoji(flag);
  if (fromEmoji) return fromEmoji;

  // Allow callers to pass a raw ISO currency or country code as `flag`
  // when no emoji was stored yet (new catalog rows).
  const trimmed = flag.trim();
  if (/^[A-Za-z]{2,3}$/.test(trimmed)) {
    return countryCodeFromCurrencyCode(trimmed);
  }

  return null;
}

/** Focal point inside the chip — some flags put identity marks off-center. */
function flagObjectPosition(country: string): string {
  switch (country) {
    case "zm":
      // Eagle + red/black/orange bars sit in the fly (bottom-right).
      return "right bottom";
    case "np":
      return "center top";
    default:
      return "center";
  }
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

  return (
    <span
      className={`inline-flex h-[1.05em] w-[1.6em] shrink-0 overflow-hidden rounded-[2px] ring-1 ring-black/15 ${chipClassName} ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- tiny same-origin flag PNG; next/image adds nothing here */}
      <img
        src={`/flags/${country}.png`}
        alt=""
        onError={() => setFailed(true)}
        // Fill the chip completely. Wide flags (AED/GBP), square (CHF), and
        // tall (Nepal) all crop to the slot instead of leaving empty bands.
        className="h-full w-full object-cover"
        style={{ objectPosition: flagObjectPosition(country) }}
      />
    </span>
  );
}
