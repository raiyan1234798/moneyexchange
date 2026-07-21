"use client";

import { useState } from "react";

/**
 * Rectangular country-flag chip (like airport/exchange signage boards).
 * The ISO country code is derived from the catalog's flag emoji (regional
 * indicator pairs), served as a small PNG; falls back to the emoji itself
 * for multi-region currencies (🌍) or if the image fails to load.
 */
function flagEmojiToCountryCode(flag: string): string | null {
  const letters = [...flag]
    .map((ch) => ch.codePointAt(0) ?? 0)
    .filter((cp) => cp >= 0x1f1e6 && cp <= 0x1f1ff)
    .map((cp) => String.fromCharCode(cp - 0x1f1e6 + 65));
  if (letters.length === 2) return letters.join("").toLowerCase();

  // Subdivision flags (Scotland 🏴󠁧󠁢󠁳󠁣󠁴󠁿, Wales, England) are a black flag +
  // "tag letter" sequence, not regional-indicator pairs. Decode the tags to
  // flagcdn's "gb-sct" style code — many TVs can't draw these emoji at all,
  // so the PNG is the only way the flag shows up.
  const tags = [...flag]
    .map((ch) => ch.codePointAt(0) ?? 0)
    .filter((cp) => cp >= 0xe0061 && cp <= 0xe007a)
    .map((cp) => String.fromCharCode(cp - 0xe0000));
  if (flag.includes("\u{1F3F4}") && tags.length >= 4) {
    return `${tags.slice(0, 2).join("")}-${tags.slice(2).join("")}`;
  }
  return null;
}

export function FlagChip({ flag, className = "" }: { flag: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  const country = flagEmojiToCountryCode(flag);

  if (!country || failed) {
    // Emoji fallback (custom currencies): size the glyph up so it matches the
    // enlarged flag images rather than shrinking to text size.
    return (
      <span className={`inline-flex shrink-0 items-center justify-center text-[1.7em] leading-none ${className}`}>
        {flag}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- tiny external flag PNG; next/image adds nothing here
    <img
      src={`https://flagcdn.com/w80/${country}.png`}
      alt=""
      onError={() => setFailed(true)}
      className={`h-[1.05em] w-[1.6em] shrink-0 rounded-[2px] object-cover ring-1 ring-black/15 ${className}`}
    />
  );
}
