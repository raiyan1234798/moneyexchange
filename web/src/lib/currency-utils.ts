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
  const flag =
    currency.flag?.trim() && currency.flag.trim() !== "💱"
      ? currency.flag.trim()
      : meta?.flag ?? "💱";

  return { code, name, country, flag };
}

export function buildCurrencyPayload(input: {
  currencyCode: string;
  currencyName?: string;
  country?: string;
  flag?: string;
}): { currencyCode: string; currencyName: string; country: string; flag: string } {
  const code = normalizeCurrencyCode(input.currencyCode);
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
    flag: input.flag?.trim() && input.flag.trim() !== "💱" ? input.flag.trim() : meta?.flag ?? "💱",
  };
}
