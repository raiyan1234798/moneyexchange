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
  return letters.length === 2 ? letters.join("").toLowerCase() : null;
}

export function FlagChip({ flag, className = "" }: { flag: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  const country = flagEmojiToCountryCode(flag);

  if (!country || failed) {
    return <span className={`shrink-0 leading-none ${className}`}>{flag}</span>;
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
