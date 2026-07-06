import type { ExchangeRate } from "@/lib/types";
import { BRAND, BRAND_COLORS } from "@/lib/brand";

/** unimoni digital signage palette. */
export const UNIMONI_COLORS = {
  panelBlue: BRAND_COLORS.primaryLight,
  navy: BRAND_COLORS.surface,
  headerBlue: BRAND_COLORS.primary,
  gold: BRAND_COLORS.gold,
  goldBright: BRAND_COLORS.goldBright,
  tickerBlack: "#060912",
  white: "#ffffff",
  darkText: BRAND_COLORS.primary,
  accentBlue: BRAND_COLORS.primaryLight,
  sellBox: "#ffffff",
  promoText: BRAND_COLORS.primary,
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

export function resolveSignageRates(rates: ExchangeRate[]): ExchangeRate[] {
  if (rates.length > 0) {
    return [...rates]
      .filter((rate) => !rate.isHidden && rate.status === "published")
      .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
  }

  const now = new Date();
  return UNIMONI_DEFAULT_RATES.map((rate, index) => ({
    id: `unimoni-${rate.currencyCode.toLowerCase()}`,
    branchId: "default",
    currencyCode: rate.currencyCode,
    buyRate: rate.buyRate,
    sellRate: rate.sellRate,
    version: 1,
    displayOrder: index + 1,
    isHidden: false,
    status: "published" as const,
    updatedBy: "system",
    updatedByName: "System",
    publishedAt: now,
    createdAt: now,
    updatedAt: now,
  }));
}
