"use client";

import { useState } from "react";

/**
 * Country-flag chip. Ordinary country flags render as their EMOJI — every row
 * looks the same (client 2026-07-25: a lone flagcdn PNG next to emoji rows
 * looked "different"). Only subdivision flags (Scotland 🏴󠁧󠁢󠁳󠁣󠁴󠁿 etc.), which many
 * TVs cannot draw as emoji at all, still use the small PNG image.
 */
function flagEmojiToCountryCode(flag: string): string | null {
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
  // Regional-indicator pairs (🇿🇲 etc.) intentionally return null → emoji.
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
