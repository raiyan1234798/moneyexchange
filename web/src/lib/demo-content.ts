import { DEFAULT_BRANCH_SETTINGS } from "@/lib/constants";
import type { Branch, ExchangeRate, TickerMessage, VideoAsset } from "@/lib/types";

export const DEMO_BRANCH_CODE = "DEMO";
export const DEMO_BRANCH_DOC_ID = "demo-main";
export const DEMO_BRANCH_NAME = "Demo Branch — Dubai Main";

export const DEMO_SAMPLE_VIDEO_URL =
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";

export const DEMO_CURRENCIES = [
  {
    id: "currency_usd",
    currencyCode: "USD",
    currencyName: "US Dollar",
    country: "United States",
    flag: "🇺🇸",
    sortOrder: 1,
  },
  {
    id: "currency_gbp",
    currencyCode: "GBP",
    currencyName: "British Pound",
    country: "United Kingdom",
    flag: "🇬🇧",
    sortOrder: 2,
  },
  {
    id: "currency_eur",
    currencyCode: "EUR",
    currencyName: "Euro",
    country: "European Union",
    flag: "🇪🇺",
    sortOrder: 3,
  },
  {
    id: "currency_aed",
    currencyCode: "AED",
    currencyName: "UAE Dirham",
    country: "United Arab Emirates",
    flag: "🇦🇪",
    sortOrder: 4,
  },
] as const;

/** Illustrative buy/sell vs AED for demo displays. */
export const DEMO_RATES: Record<string, { buyRate: number; sellRate: number }> = {
  USD: { buyRate: 3.65, sellRate: 3.68 },
  GBP: { buyRate: 4.549, sellRate: 4.579 },
  EUR: { buyRate: 3.949, sellRate: 3.979 },
  AED: { buyRate: 1.0, sellRate: 1.0 },
};

export const DEMO_TICKER_LINES = [
  "WELCOME TO DEMO EXCHANGE • BEST RATES • TRUSTED SERVICE",
  "COMPETITIVE RATES DAILY • FAST & SECURE TRANSFERS",
  "ASK OUR TEAM ABOUT ZERO-FEE TRANSFERS ON SELECT CORRIDORS",
];

const demoNow = new Date();

export function getDemoBranch(): Branch {
  return {
    id: "demo",
    name: DEMO_BRANCH_NAME,
    code: DEMO_BRANCH_CODE,
    address: "Sheikh Zayed Road",
    city: "Dubai",
    country: "United Arab Emirates",
    phone: "+971 4 000 0000",
    email: "demo@moneyexchange.com",
    managerId: null,
    logoUrl: null,
    brandingColor: "#0ea5e9",
    workingHours: "Mon–Sat 9:00–21:00",
    status: "active",
    settings: {
      ...DEFAULT_BRANCH_SETTINGS,
      slogan: "Your trusted exchange partner",
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
  return [
    {
      id: "demo-video",
      title: "Demo signage video",
      description: "Big Buck Bunny sample MP4",
      branchId: "demo",
      category: "promo",
      sourceType: "external",
      storagePath: null,
      downloadUrl: DEMO_SAMPLE_VIDEO_URL,
      mimeType: "video/mp4",
      durationSeconds: 596,
      status: "active",
      expiresAt: null,
      createdBy: "demo",
      createdAt: demoNow,
      updatedAt: demoNow,
    },
  ];
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
