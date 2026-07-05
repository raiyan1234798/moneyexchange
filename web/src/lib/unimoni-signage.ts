import type { ExchangeRate } from "@/lib/types";
import { BRAND, BRAND_COLORS } from "@/lib/brand";

/** Unimoney digital signage palette. */
export const UNIMONI_COLORS = {
  panelBlue: BRAND_COLORS.primaryLight,
  navy: BRAND_COLORS.primary,
  headerBlue: BRAND_COLORS.accent,
  gold: BRAND_COLORS.accent,
  goldBright: BRAND_COLORS.accentBright,
  tickerBlack: "#060912",
  white: "#ffffff",
  darkText: BRAND_COLORS.primary,
  accentBlue: BRAND_COLORS.primaryLight,
  sellBox: "#ffffff",
  promoText: BRAND_COLORS.primary,
} as const;

export const UNIMONI_DEFAULT_TICKER = "WELCOME TO UNIMONEY";
export const UNIMONI_CONTACT_LINE = BRAND.tagline;
export const UNIMONI_WEBSITE = "unimoney.com";
export const UNIMONI_LOCATIONS = [BRAND.tagline] as const;
export const UNIMONI_USD_NOTE = "Rates update in real time from your branch dashboard";

export const UNIMONI_DEFAULT_RATES: Array<{
  currencyCode: string;
  buyRate: number;
  sellRate: number;
}> = [
  { currencyCode: "USD", buyRate: 3625, sellRate: 3685 },
  { currencyCode: "GBP", buyRate: 4725, sellRate: 4975 },
  { currencyCode: "EUR", buyRate: 4095, sellRate: 4315 },
  { currencyCode: "AUD", buyRate: 2060, sellRate: 2700 },
  { currencyCode: "CAD", buyRate: 2200, sellRate: 3600 },
  { currencyCode: "CHF", buyRate: 3010, sellRate: 4500 },
  { currencyCode: "KES", buyRate: 27.3, sellRate: 30 },
  { currencyCode: "ZAR", buyRate: 195, sellRate: 350 },
  { currencyCode: "TZS", buyRate: 1.3, sellRate: 1.65 },
  { currencyCode: "RWF", buyRate: 1.55, sellRate: 4.0 },
  { currencyCode: "SAR", buyRate: 830, sellRate: 1120 },
  { currencyCode: "AED", buyRate: 870, sellRate: 1250 },
];

export function formatUnimoniRate(value: number): string {
  const text = value.toFixed(2);
  if (text.endsWith("00")) return String(Math.round(value));
  if (text.endsWith("0")) return value.toFixed(1);
  return text;
}

export function resolveSignageRates(rates: ExchangeRate[]): ExchangeRate[] {
  if (rates.length > 0) {
    return [...rates]
      .filter((rate) => !rate.isHidden && rate.status === "published")
      .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
  }

  const now = new Date();
  return UNIMONI_DEFAULT_RATES.map((rate, index) => ({
    id: `unimoney-${rate.currencyCode.toLowerCase()}`,
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
