import { CURRENCY_METADATA } from "@/lib/constants";

export type CurrencyMeta = { name: string; country: string; flag: string };

const NAME_ALIASES: Record<string, string> = {
  "ZAMBIAN CURRENCY": "ZMW",
  "ZAMBIAN KWACHA": "ZMW",
  "CANADA CAD": "CAD",
  "CANADIAN DOLLAR": "CAD",
  "AUSTRALIAN DOLLAR": "AUD",
  "US DOLLAR": "USD",
  "BRITISH POUND": "GBP",
};

export function getCurrencyMeta(code: string): CurrencyMeta | undefined {
  return CURRENCY_METADATA[code.trim().toUpperCase()];
}

/**
 * Derive a flag emoji from a currency code the built-in catalog doesn't know:
 * ISO 4217 codes start with the ISO country code (KES → KE → 🇰🇪), so unknown
 * codes still get the right flag automatically on import. Returns null when the
 * first two letters aren't a real country, so callers can fall back.
 */
export function flagFromCurrencyCode(code: string): string | null {
  const cc = code.trim().toUpperCase().slice(0, 2);
  if (!/^[A-Z]{2}$/.test(cc)) return null;
  try {
    const name = new Intl.DisplayNames(["en"], { type: "region" }).of(cc);
    // Unknown regions echo the code back — that's not a country.
    if (!name || name === cc) return null;
  } catch {
    return null;
  }
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
