import { CURRENCY_METADATA } from "@/lib/constants";

export type CurrencyMeta = { name: string; country: string; flag: string };

const NAME_ALIASES: Record<string, string> = {
  "ZAMBIAN CURRENCY": "ZMW",
  "ZAMBIAN KWACHA": "ZMW",
  // Zimbabwe ≠ Zambia (ZMW). Keep these aliases so imports don't land on ZMW.
  ZIMBABWE: "ZWL",
  "ZIMBABWEAN DOLLAR": "ZWL",
  "ZIMBABWE DOLLAR": "ZWL",
  "CANADA CAD": "CAD",
  "CANADIAN DOLLAR": "CAD",
  "AUSTRALIAN DOLLAR": "AUD",
  "US DOLLAR": "USD",
  "BRITISH POUND": "GBP",
};

/**
 * Currencies whose ISO 4217 letters are NOT a valid ISO 3166 country (or
 * should prefer a specific flag file under /public/flags). Values are
 * lowercase paths without ".png" (e.g. "eu", "gb-sct").
 */
const CURRENCY_FLAG_COUNTRY_OVERRIDES: Record<string, string> = {
  EUR: "eu",
  SCP: "gb-sct",
  XOF: "sn",
  XAF: "cm",
  XPF: "pf",
  XCD: "ag",
  ANG: "cw",
};

export function getCurrencyMeta(code: string): CurrencyMeta | undefined {
  return CURRENCY_METADATA[code.trim().toUpperCase()];
}

/** Decode a flag emoji (🇿🇲 / 🏴󠁧󠁢󠁳󠁣󠁴󠁿) to a /public/flags file stem. */
export function countryCodeFromFlagEmoji(flag: string): string | null {
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

function isKnownRegionCode(cc: string): boolean {
  const upper = cc.trim().toUpperCase();
  if (upper === "EU") return true; // /flags/eu.png — not always in Intl regions
  if (!/^[A-Z]{2}$/.test(upper)) return false;
  try {
    const name = new Intl.DisplayNames(["en"], { type: "region" }).of(upper);
    // Unknown regions echo the code back — that's not a country.
    return Boolean(name && name !== upper);
  } catch {
    return false;
  }
}

/**
 * Map an ISO 4217 currency code to a /public/flags/{code}.png stem.
 * Uses catalog metadata + explicit overrides, then the ISO rule that most
 * currency codes start with their country (KES → ke). Works for new
 * currencies that are not yet in CURRENCY_METADATA.
 */
export function countryCodeFromCurrencyCode(code: string): string | null {
  const upper = code.trim().toUpperCase();
  if (!upper) return null;

  const override = CURRENCY_FLAG_COUNTRY_OVERRIDES[upper];
  if (override) return override;

  const meta = getCurrencyMeta(upper);
  if (meta?.flag) {
    const fromMeta = countryCodeFromFlagEmoji(meta.flag);
    if (fromMeta) return fromMeta;
  }

  // Bare ISO 3166 alpha-2 passed in (rare).
  if (upper.length === 2 && isKnownRegionCode(upper)) {
    return upper.toLowerCase();
  }

  const cc = upper.slice(0, 2);
  if (!isKnownRegionCode(cc)) return null;
  return cc.toLowerCase();
}

/**
 * Derive a flag emoji from a currency code the built-in catalog doesn't know:
 * ISO 4217 codes start with the ISO country code (KES → KE → 🇰🇪), so unknown
 * codes still get the right flag automatically on import. Returns null when the
 * first two letters aren't a real country, so callers can fall back.
 */
export function flagFromCurrencyCode(code: string): string | null {
  const country = countryCodeFromCurrencyCode(code);
  if (!country || country.includes("-") || country === "eu") {
    // Subdivision / EU: prefer catalog emoji when available; otherwise no
    // single regional-indicator pair exists for these stems.
    const meta = getCurrencyMeta(code.trim().toUpperCase());
    return meta?.flag ?? null;
  }
  const cc = country.toUpperCase();
  const A = 0x1f1e6;
  return (
    String.fromCodePoint(A + cc.charCodeAt(0) - 65) + String.fromCodePoint(A + cc.charCodeAt(1) - 65)
  );
}

export function isValidCurrencyCode(code: string): boolean {
  return /^[A-Z]{3}$/.test(code.trim().toUpperCase());
}

export function titleCaseName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

/** Extract a clean 3-letter ISO code from messy catalog or Excel input. */
export function normalizeCurrencyCode(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  const upper = trimmed.toUpperCase();
  const alias = NAME_ALIASES[upper];
  if (alias) return alias;

  if (/^[A-Z]{3}$/.test(upper)) return upper;

  const tokens = upper.split(/[\s/\-_]+/).filter(Boolean);
  const last = tokens[tokens.length - 1];
  if (last && /^[A-Z]{3}$/.test(last)) return last;

  const compact = upper.replace(/[^A-Z]/g, "");
  if (/^[A-Z]{3}$/.test(compact)) return compact;

  for (const [code, meta] of Object.entries(CURRENCY_METADATA)) {
    if (meta.name.toUpperCase() === upper) return code;
  }

  for (const [label, code] of Object.entries(NAME_ALIASES)) {
    if (upper.includes(label) || label.includes(upper)) return code;
  }

  // NEVER guess by truncation/suffix: "USDT" must not become "USD" (that would
  // silently overwrite the real USD rate) and junk like "TOTAL" must not
  // become a fake code. Unrecognized input returns "" — callers keep the raw
  // token as a custom code or skip the row.
  return "";
}

function isLowQualityCurrencyName(name: string, code: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return true;

  const upper = trimmed.toUpperCase();
  const codeUpper = code.toUpperCase();
  if (upper === codeUpper) return true;
  if (NAME_ALIASES[upper]) return true;
  if (/^[A-Z][A-Z\s]+\s[A-Z]{3}$/.test(upper)) return true;
  if (upper.endsWith(` ${codeUpper}`) && upper.length > codeUpper.length + 1) return true;

  return false;
}

/** Resolve display fields for catalog rows — fills gaps from metadata without mutating Firestore. */
export function resolveCurrencyFields(currency: {
  currencyCode: string;
  currencyName: string;
  country: string;
  flag: string;
}): { code: string; name: string; country: string; flag: string } {
  const code = normalizeCurrencyCode(currency.currencyCode) || currency.currencyCode.trim().toUpperCase();
  const meta = getCurrencyMeta(code);

  let name = currency.currencyName?.trim() ?? "";
  if (isLowQualityCurrencyName(name, code)) {
    name = meta?.name ?? (name && !isLowQualityCurrencyName(name, code) ? titleCaseName(name) : code);
  } else if (name === name.toLowerCase()) {
    name = titleCaseName(name);
  }

  const country = currency.country?.trim() || meta?.country || "";
  const stored = currency.flag?.trim() ?? "";
  const flag = !isPlaceholderFlag(stored)
    ? stored
    : meta?.flag ?? flagFromCurrencyCode(code) ?? (stored || "💱");

  return { code, name, country, flag };
}

/** Generic stand-in glyphs saved before a real flag was known — never show these
    when the catalog or the country-code rule can produce the actual flag. */
export function isPlaceholderFlag(flag: string | null | undefined): boolean {
  const f = flag?.trim() ?? "";
  return f === "" || f === "💱" || f === "🌍" || f === "🌐" || f === "🏳️";
}

export function buildCurrencyPayload(input: {
  currencyCode: string;
  currencyName?: string;
  country?: string;
  flag?: string;
}): { currencyCode: string; currencyName: string; country: string; flag: string } {
  // Keep the raw code when it isn't a known ISO code (e.g. USDT) — otherwise
  // normalize() returns "" and we'd write a ghost catalog doc with a blank
  // code/name/country and the 💱 fallback glyph (looks like a broken spinner
  // row). Mirrors resolveCurrencyFields so both paths agree.
  const code = normalizeCurrencyCode(input.currencyCode) || input.currencyCode.trim().toUpperCase();
  const meta = getCurrencyMeta(code);

  const rawName = input.currencyName?.trim() ?? "";
  const currencyName =
    rawName && !isLowQualityCurrencyName(rawName, code)
      ? titleCaseName(rawName)
      : meta?.name ?? titleCaseName(rawName || code);

  return {
    currencyCode: code,
    currencyName,
    country: input.country?.trim() || meta?.country || "",
    flag:
      input.flag?.trim() && !isPlaceholderFlag(input.flag)
        ? input.flag.trim()
        : meta?.flag ?? flagFromCurrencyCode(code) ?? (input.flag?.trim() || "💱"),
  };
}
