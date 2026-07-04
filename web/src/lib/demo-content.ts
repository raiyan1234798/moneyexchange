import { DEFAULT_BRANCH_SETTINGS } from "@/lib/constants";
import { UNIMONI_DEFAULT_RATES, UNIMONI_DEFAULT_TICKER } from "@/lib/unimoni-signage";
import type { Branch, ExchangeRate, TickerMessage, VideoAsset } from "@/lib/types";

export const DEMO_BRANCH_CODE = "DEMO";
export const DEMO_BRANCH_DOC_ID = "demo-main";
export const DEMO_BRANCH_NAME = "Unimoni Kisement";

/** Local demo video served from /public — works on static hosting without Firestore. */
export const DEMO_VIDEO_URL = "/unimoni-promo.mp4";

/** @deprecated Use DEMO_VIDEO_URL */
export const DEMO_SAMPLE_VIDEO_URL = DEMO_VIDEO_URL;

export const DEMO_PUBLIC_SITE_ORIGIN =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://moneyexchange.pages.dev";

/** Resolve absolute URL for the bundled demo video (works on static hosting). */
export function getDemoSampleVideoPublicUrl(origin?: string): string {
  const base =
    origin ?? (typeof window !== "undefined" ? window.location.origin : DEMO_PUBLIC_SITE_ORIGIN);
  return `${base.replace(/\/$/, "")}${DEMO_VIDEO_URL}`;
}

export const DEMO_CURRENCIES = UNIMONI_DEFAULT_RATES.map((rate, index) => ({
  id: `currency_${rate.currencyCode.toLowerCase()}`,
  currencyCode: rate.currencyCode,
  currencyName: rate.currencyCode,
  country: "",
  flag: "",
  sortOrder: index + 1,
}));

/** Unimoni signage reference rates (UGX quote style). */
export const DEMO_RATES: Record<string, { buyRate: number; sellRate: number }> = Object.fromEntries(
  UNIMONI_DEFAULT_RATES.map((rate) => [rate.currencyCode, { buyRate: rate.buyRate, sellRate: rate.sellRate }]),
);

export const DEMO_TICKER_LINES = [UNIMONI_DEFAULT_TICKER];

const demoNow = new Date();

export function getDemoBranch(): Branch {
  return {
    id: "demo",
    name: DEMO_BRANCH_NAME,
    code: DEMO_BRANCH_CODE,
    address: "Kisement",
    city: "Kampala",
    country: "Uganda",
    phone: "0759207000",
    email: "kisement@unimoni.com",
    managerId: null,
    logoUrl: null,
    brandingColor: "#0078D4",
    workingHours: "Mon–Sat 9:00–21:00",
    status: "active",
    settings: {
      ...DEFAULT_BRANCH_SETTINGS,
      slogan: UNIMONI_DEFAULT_TICKER,
    },
    createdAt: demoNow,
    updatedAt: demoNow,
  };
}

export function getDemoRates(): ExchangeRate[] {
  return DEMO_CURRENCIES.map((currency, index) => {
    const rates = DEMO_RATES[currency.currencyCode];
    return {
      id: `demo-rate-${currency.currencyCode.toLowerCase()}`,
      branchId: "demo",
      currencyCode: currency.currencyCode,
      buyRate: rates.buyRate,
      sellRate: rates.sellRate,
      version: 1,
      displayOrder: index + 1,
      isHidden: false,
      status: "published" as const,
      updatedBy: "demo",
      updatedByName: "Demo",
      publishedAt: demoNow,
      createdAt: demoNow,
      updatedAt: demoNow,
    };
  });
}

export function getDemoVideos(): VideoAsset[] {
  return [];
}

export function getDemoTickers(): TickerMessage[] {
  return [
    {
      id: "demo-ticker",
      branchId: "demo",
      messages: DEMO_TICKER_LINES.map((text, index) => ({
        id: `line-${index + 1}`,
        text,
        priority: index + 1,
      })),
      scrollSpeed: 50,
      fontSize: 18,
      fontColor: "#FFFFFF",
      paused: false,
      language: "en",
      scheduleStart: null,
      scheduleEnd: null,
      status: "active",
      createdBy: "demo",
      createdAt: demoNow,
      updatedAt: demoNow,
    },
  ];
}
