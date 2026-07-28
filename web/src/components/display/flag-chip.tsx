"use client";

import { useState } from "react";

/**
 * Country-flag chip. Every flag renders as a small PNG served from THIS site
 * (/public/flags — all 252 countries + UK subdivisions), because the client's
 * actual TVs have no colour-emoji font: emoji flags degrade to bare letter
 * pairs ("US", "GB" — client screenshot 2026-07-27). Self-hosting also fixes
 * the earlier mixed look, where an external flag CDN loaded for some rows and
 * failed for others. The emoji span remains only as a last-resort fallback
 * (custom currencies with no country, or a missing file).
 */
function flagEmojiToCountryCode(flag: string): string | null {
  // Regional-indicator pairs (🇿🇲 → "zm").
  const letters = [...flag]
    .map((ch) => ch.codePointAt(0) ?? 0)
    .filter((cp) => cp >= 0x1f1e6 && cp <= 0x1f1ff)
    .map((cp) => String.fromCharCode(cp - 0x1f1e6 + 65));
  if (letters.length === 2) return letters.join("").toLowerCase();

  // Subdivision flags (Scotland 🏴󠁧󠁢󠁳󠁣󠁴󠁿, Wales, England): black flag + "tag
  // letter" sequence → "gb-sct" style code.
  const tags = [...flag]
    .map((ch) => ch.codePointAt(0) ?? 0)
    .filter((cp) => cp >= 0xe0061 && cp <= 0xe007a)
    .map((cp) => String.fromCharCode(cp - 0xe0000));
  if (flag.includes("\u{1F3F4}") && tags.length >= 4) {
    return `${tags.slice(0, 2).join("")}-${tags.slice(2).join("")}`;
  }
  return null;
}

export function FlagChip({
  flag,
  className = "",
  chipClassName = "",
}: {
  flag: string;
  /** Applied to BOTH forms (emoji span and image) — animations, margins. */
  className?: string;
  /** Applied ONLY when a real image renders (box size, ring, shadow). Emoji
      must never get these — a ringed fixed-size box around a glyph paints an
      ugly empty pill next to the flag (client 2026-07-27). */
  chipClassName?: string;
}) {
  const [failed, setFailed] = useState(false);
  const country = flagEmojiToCountryCode(flag);

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
    // eslint-disable-next-line @next/next/no-img-element -- tiny same-origin flag PNG; next/image adds nothing here
    <img
      src={`/flags/${country}.png`}
      alt=""
      onError={() => setFailed(true)}
      // Natural aspect + object-contain: fixed 1.6×1.05 + object-cover was
      // clipping ~24% of 2:1 flags (AED, GBP, …), ~34% of square ones (CHF),
      // and nearly half of Nepal. Height stays matched to the rate-row type;
      // width follows each flag's real ratio so nothing is cropped.
      className={`h-[1.05em] w-auto max-w-[1.85em] shrink-0 rounded-[2px] object-contain ring-1 ring-black/15 ${chipClassName} ${className}`}
    />
  );
}
