import type { ExchangeRate } from "@/lib/types";

/** Unimoni digital signage palette (from branch display reference). */
export const UNIMONI_COLORS = {
  panelBlue: "#0078D4",
  navy: "#0a1628",
  headerBlue: "#33B5E5",
  tickerBlack: "#000000",
  white: "#ffffff",
  darkText: "#001f3f",
  /** @deprecated Use panelBlue */
  accentBlue: "#0078D4",
  /** @deprecated Use white for both rate boxes */
  sellBox: "#ffffff",
  /** @deprecated Use darkText */
  promoText: "#001f3f",
} as const;

export const UNIMONI_DEFAULT_TICKER = "WELCOME TO UNIMONI KISEMENT";

export const UNIMONI_CONTACT_LINE = "Dial 0759207000/001/002 & 0772207001";

export const UNIMONI_WEBSITE = "www.unimoni.com";

export const UNIMONI_LOCATIONS = [
  "Lugogo Mall | Amber House | Arua Park | Kampala Road",
  "Imperial Mall - Entebbe | Nabugabo | Bugolobi | Nakivubo",
] as const;

export const UNIMONI_USD_NOTE = "WE BUY USD 20, 10, 5, 2 & 1 @ 3400";

/** Reference rates from Unimoni signage (UGX quote style). */
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
