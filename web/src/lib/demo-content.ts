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
