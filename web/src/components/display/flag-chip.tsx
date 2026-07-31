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
 * Money-exchange rule: the ISO 4217 currency code (plus catalog overrides
 * such as ZMW → Zimbabwe) is the source of truth for which country flag to
 * show. Stored emoji is only a fallback when the code cannot be mapped.
 */

/**
 * Flags whose distinctive emblem sits on the hoist (left). Never crop these —
 * object-cover was cutting Zimbabwe's white triangle / red star / bird on the
 * rate card (ZMW — client 2026-07-31). Use a 2:1 slot + object-contain so the
 * full flag is visible.
 */
const UNCROPPED_FLAGS = new Set([
  "zw", // Zimbabwe — white triangle + bird/star (ZMW on this board)
  "cz", // Czech Republic
  "sk", // Slovakia
  "ph", // Philippines
  "ss", // South Sudan
  "sd", // Sudan
  "ps", // Palestine
  "jo", // Jordan
  "eh", // Western Sahara
  "cu", // Cuba
  "tt", // Trinidad and Tobago
  "dj", // Djibouti
  "er", // Eritrea
  "gy", // Guyana
  "st", // São Tomé and Príncipe
  "tl", // Timor-Leste
]);

function resolveFlagCountry(
  flag: string,
  currencyCode?: string | null,
): string | null {
  // Currency code FIRST (incl. catalog overrides like ZMW → zw).
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
  const uncropped = Boolean(country && UNCROPPED_FLAGS.has(country));
  // Rate-card passes !w-[2.75em] with !important — strip width utilities so we
  // can use a true 2:1 slot (matches zw.png) without fighting !important.
  const sizedChipClass = uncropped
    ? chipClassName
        .split(/\s+/)
        .filter(
          (token) =>
            token.length > 0 &&
            !/^!?w-/.test(token) &&
            !/^!?min-w-/.test(token) &&
            !/^!?max-w-/.test(token) &&
            !/^!?rounded/.test(token),
        )
        .join(" ")
    : chipClassName;

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
      className={`inline-flex h-[1.05em] w-[1.6em] shrink-0 overflow-hidden rounded-[2px] ring-1 ring-black/15 ${sizedChipClass} ${className}`}
      style={
        uncropped
          ? {
              // Exact 2:1 slot matching the PNG — object-contain then shows the
              // FULL flag (triangle + star + bird) with zero crop.
              aspectRatio: "2 / 1",
              width: "auto",
              borderRadius: 2,
              // Keep overflow visible enough that 1px ring does not eat the hoist.
              overflow: "hidden",
            }
          : undefined
      }
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- tiny same-origin flag PNG; next/image adds nothing here */}
      <img
        src={`/flags/${country}.png`}
        alt=""
        onError={() => setFailed(true)}
        // Most flags: cover + center (fill the chip). Uncropped flags
        // (Zimbabwe/ZMW): contain — never clip the hoist emblem.
        className={`h-full w-full ${uncropped ? "object-contain object-center" : "object-cover object-center"}`}
      />
    </span>
  );
}
