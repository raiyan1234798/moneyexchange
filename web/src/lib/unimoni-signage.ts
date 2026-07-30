import type { ExchangeRate } from "@/lib/types";
import { BRAND } from "@/lib/brand";
import { flagFromCurrencyCode, getCurrencyMeta, isPlaceholderFlag } from "@/lib/currency-utils";

/**
 * unimoni digital signage palette — locked to the official brand spec:
 *   Signage BG "Rich Deep Blue"  = Pantone 2748 C  (CMYK 90/70/0/50 → ~#0D2680)
 *   Accent "Yellow"              = Pantone 137 C   (~#FFA300)
 * These are used for the rate-card header/background and gold accents so the
 * signage matches the printed brand collateral.
 */
const RICH_DEEP_BLUE = "#0D2680"; // Pantone 2748 C
const RICH_DEEP_BLUE_DARK = "#081B57"; // darker shade for the header gradient top
const BRAND_YELLOW = "#FFA300"; // Pantone 137 C
const BRAND_YELLOW_BRIGHT = "#FFB733";

export const UNIMONI_COLORS = {
  panelBlue: RICH_DEEP_BLUE,
  navy: RICH_DEEP_BLUE_DARK,
  headerBlue: RICH_DEEP_BLUE,
  gold: BRAND_YELLOW,
  goldBright: BRAND_YELLOW_BRIGHT,
  tickerBlack: "#060912",
  white: "#ffffff",
  darkText: RICH_DEEP_BLUE,
  accentBlue: RICH_DEEP_BLUE,
  sellBox: "#ffffff",
  promoText: RICH_DEEP_BLUE,
} as const;

export const UNIMONI_DEFAULT_TICKER = "WELCOME TO UNIMONI";
export const UNIMONI_CONTACT_LINE = BRAND.tagline;
export const UNIMONI_WEBSITE = "unimoni.com";
export const UNIMONI_LOCATIONS = [BRAND.tagline] as const;
export const UNIMONI_USD_NOTE = "Rates update in real time from your branch dashboard";

/** Max rows visible without scrolling on 1080p signage (landscape). */
export const SIGNAGE_MAX_VISIBLE_RATES = 14;

export const UNIMONI_DEFAULT_RATES: Array<{
  currencyCode: string;
  buyRate: number;
  sellRate: number;
}> = [
  { currencyCode: "USD", buyRate: 3650, sellRate: 3680 },
  { currencyCode: "GBP", buyRate: 4725, sellRate: 4975 },
  { currencyCode: "EUR", buyRate: 4095, sellRate: 4315 },
  { currencyCode: "KES", buyRate: 27.3, sellRate: 30 },
  { currencyCode: "ZAR", buyRate: 195, sellRate: 350 },
  { currencyCode: "CAD", buyRate: 2200, sellRate: 3600 },
  { currencyCode: "AUD", buyRate: 2060, sellRate: 2700 },
  { currencyCode: "HKD", buyRate: 450, sellRate: 480 },
  { currencyCode: "CNY", buyRate: 500, sellRate: 520 },
  { currencyCode: "INR", buyRate: 44, sellRate: 46 },
  { currencyCode: "SAR", buyRate: 830, sellRate: 1120 },
  { currencyCode: "QAR", buyRate: 900, sellRate: 1180 },
  { currencyCode: "OMR", buyRate: 9200, sellRate: 9600 },
  { currencyCode: "BHD", buyRate: 9600, sellRate: 9900 },
];

export function formatUnimoniRate(value: number): string {
  const text = value.toFixed(2);
  if (text.endsWith("00")) return String(Math.round(value));
  if (text.endsWith("0")) return value.toFixed(1);
  return text;
}

export function getRateDisplayLabel(rate: ExchangeRate): string {
  return rate.displayName?.trim() || rate.currencyCode;
}

/**
 * Signage shows ONLY the currency code + its flag (per client), never long
 * display names. Flag resolved from the currency catalog metadata by code,
 * then the rate's stored flag, then ISO 4217 → country (works for new codes).
 */
export function getRateFlag(rate: ExchangeRate): string | null {
  const code = rate.currencyCode?.trim() ?? "";
  const catalog = getCurrencyMeta(code)?.flag;
  if (catalog) return catalog;
  // Not in the built-in catalog: use the flag saved on the rate itself (unless
  // it's a stand-in glyph), then derive from the country code (KES → 🇰🇪).
  const stored = rate.flag?.trim();
  if (stored && !isPlaceholderFlag(stored)) return stored;
  return flagFromCurrencyCode(code);
}

/** Prefer a live rate over a leftover 1/1 placeholder when the same code
 *  appears twice on one branch (client saw duplicate SCP rows on the TV). */
function isPlaceholderRate(rate: ExchangeRate): boolean {
  return Number(rate.buyRate) === 1 && Number(rate.sellRate) === 1;
}

function dedupeSignageRates(rates: ExchangeRate[]): ExchangeRate[] {
  const best = new Map<string, ExchangeRate>();
  for (const rate of rates) {
    const code = (rate.currencyCode ?? "").trim().toUpperCase();
    if (!code) continue;
    const existing = best.get(code);
    if (!existing) {
      best.set(code, rate);
      continue;
    }
    const existingPlaceholder = isPlaceholderRate(existing);
    const nextPlaceholder = isPlaceholderRate(rate);
    if (existingPlaceholder && !nextPlaceholder) {
      best.set(code, rate);
      continue;
    }
    if (!existingPlaceholder && nextPlaceholder) continue;
    // Same quality — keep the earlier displayOrder / first seen.
    const eo = existing.displayOrder ?? Number.MAX_SAFE_INTEGER;
    const no = rate.displayOrder ?? Number.MAX_SAFE_INTEGER;
    if (no < eo) best.set(code, rate);
  }
  return [...best.values()];
}

export function resolveSignageRates(rates: ExchangeRate[]): ExchangeRate[] {
  // NEVER invent rates: a branch with no published rates must show an explicit
  // "being updated" state, not fictional prices to walk-in customers.
  return dedupeSignageRates(
    [...rates].filter((rate) => !rate.isHidden && rate.status === "published"),
  ).sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
}
