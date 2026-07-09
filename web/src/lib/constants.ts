export const SUPER_ADMIN_EMAIL = "abubackerraiyan@gmail.com";

/**
 * Password (non-Google) admin account handed to the client. It self-provisions
 * an `admin` profile on first sign-in (no Google, no invite) — kept in sync
 * with the `isClientAdminBootstrap()` rule in firestore.rules.
 */
export const CLIENT_ADMIN_EMAIL = "admin@unimoni-signage.com";

/** Recommended team size per branch (soft target shown in UI). */
export const RECOMMENDED_BRANCH_USERS = 8;
/** Hard cap to prevent accidental bulk invites. */
export const MAX_BRANCH_USERS = 50;

export const COLLECTIONS = {
  users: "users",
  userInvites: "user_invites",
  branches: "branches",
  currencies: "currencies",
  exchangeRates: "exchange_rates",
  rateHistory: "rate_history",
  videos: "videos",
  videoChunks: "video_chunks",
  videoPlaylists: "video_playlists",
  tickerMessages: "ticker_messages",
  tvDevices: "tv_devices",
  tvHealth: "tv_health",
  auditLogs: "audit_logs",
  notifications: "notifications",
  settings: "settings",
  roles: "roles",
  permissions: "permissions",
  activityLogs: "activity_logs",
  scheduledContent: "scheduled_content",
  tvPairingCodes: "tv_pairing_codes",
  imageAdverts: "image_adverts",
  pendingApprovals: "pending_approvals",
} as const;

export const DEFAULT_BRANCH_SETTINGS = {
  timezone: "Asia/Dubai",
  defaultLanguage: "en",
  slogan: "Trusted Exchange · Real-Time Signage",
  tickerSpeed: 50,
  tickerFontSize: 18,
  tickerFontColor: "#FFFFFF",
  tickerLogoUrl: null as string | null,
  tickerLogoText: null as string | null,
  tickerLogoFont: null as string | null,
  showBuyRate: true,
  showSellRate: true,
  rateCardPosition: "right" as const,
  rateCardDisplaySeconds: 0,
  showRemittanceScreen: false,
  showTransferColumn: false,
  showTransferCard: true,
  transferLocalLabel: "UGX",
  videoWidthPercent: 65,
  // Default to FILL (no black bars) — the whole promo area is covered; edges may
  // crop. Switch to "contain" in Settings to show the entire frame (letterboxed).
  videoFit: "cover" as "contain" | "cover",
  rateCardScale: 1,
  tickerScale: 1,
  logoScale: 1,
  tickerLogoAnimation: "spin" as "spin" | "pulse" | "none",
  tickerHeadline: null as string | null,
  showTickerHeadline: true,
};

/** Cloudflare R2 free tier is 10 GB total — warn/stop uploads near the cap. */
export const MAX_TOTAL_STORAGE_BYTES = 10 * 1024 * 1024 * 1024;
/** Warn (but still allow) once total stored content passes this threshold. */
export const STORAGE_WARN_BYTES = 8 * 1024 * 1024 * 1024;

/** Max Firebase Storage upload per file (matches storage.rules) */
export const MAX_VIDEO_UPLOAD_BYTES = 500 * 1024 * 1024;

/** Firestore chunk storage (the active store while R2/Storage are unavailable). */
export const MAX_CHUNKED_VIDEO_BYTES = 50 * 1024 * 1024;

export const CHUNKED_UPLOAD_WARNING =
  "Video saved to the database. Large files take a minute — pasting a direct video link is still the fastest option.";

/** Warn in UI when file exceeds this size — recommend compression */
export const WARN_LARGE_VIDEO_BYTES = 50 * 1024 * 1024;

/** Binary bytes per Firestore chunk document (~1MB doc limit with base64 overhead) */
export const VIDEO_CHUNK_BINARY_BYTES = 750_000;

export const RECOMMENDED_VIDEO_FORMATS = [
  "MP4 H.264 (recommended)",
  "WebM VP9",
  "MOV (QuickTime)",
];

/** Font styles for a TEXT logo on the display ticker badge. */
export const LOGO_FONTS: Array<{ key: string; label: string; css: string }> = [
  { key: "sans-bold", label: "Bold Sans", css: "'Arial Black', Arial, Helvetica, sans-serif" },
  { key: "serif", label: "Classic Serif", css: "Georgia, 'Times New Roman', serif" },
  { key: "condensed", label: "Condensed", css: "'Arial Narrow', 'Helvetica Neue', sans-serif" },
  { key: "rounded", label: "Rounded", css: "'Trebuchet MS', 'Segoe UI', sans-serif" },
  { key: "mono", label: "Monospace", css: "'Courier New', monospace" },
];

export function logoFontCss(key: string | null | undefined): string {
  return LOGO_FONTS.find((f) => f.key === key)?.css ?? LOGO_FONTS[0].css;
}

export const DEFAULT_SYSTEM_SETTINGS = {
  companyName: "unimoni",
  supportEmail: "support@unimoni.com",
  defaultTimezone: "Asia/Dubai",
  emergencyRateEnabled: true,
  offlineCacheEnabled: true,
  tvHeartbeatIntervalSeconds: 60,
  defaultTickerSpeed: 30,
  maintenanceMode: false,
  auditRetentionDays: 90,
  requireApprovalForChanges: false,
} as const;

export const NAV_ITEMS: Array<{
  href: string;
  label: string;
  icon: string;
  roles: readonly ("superAdmin" | "admin" | "branchManager" | "branchUser")[];
}> = [
  { href: "/dashboard", label: "Overview", icon: "LayoutDashboard", roles: ["superAdmin", "admin", "branchManager", "branchUser"] },
  { href: "/dashboard/branches", label: "Branches", icon: "Building2", roles: ["superAdmin", "admin"] },
  { href: "/dashboard/users", label: "Users", icon: "Users", roles: ["superAdmin", "admin", "branchManager"] },
  {
    href: "/dashboard/exchange-rates",
    label: "Exchange Rates",
    icon: "TrendingUp",
    roles: ["superAdmin", "admin", "branchManager", "branchUser"],
  },
  { href: "/dashboard/videos", label: "Videos", icon: "Video", roles: ["superAdmin", "admin", "branchManager", "branchUser"] },
  {
    href: "/dashboard/tickers",
    label: "Display Messages",
    icon: "TextCursorInput",
    roles: ["superAdmin", "admin", "branchManager"],
  },
  { href: "/dashboard/settings", label: "Settings", icon: "Settings", roles: ["superAdmin", "admin", "branchManager"] },
  {
    href: "/dashboard/notifications",
    label: "Notifications",
    icon: "Bell",
    roles: ["superAdmin", "admin", "branchManager"],
  },
  {
    href: "/dashboard/profile",
    label: "Profile",
    icon: "User",
    roles: ["superAdmin", "admin", "branchManager", "branchUser"],
  },
  {
    href: "/dashboard/audit-logs",
    label: "Activity",
    icon: "ScrollText",
    roles: ["superAdmin", "admin", "branchManager"],
  },
];

export const SUPER_ADMIN_PERMISSIONS = [
  "createBranch",
  "editBranch",
  "deleteBranch",
  "assignManager",
  "manageUsers",
  "manageCurrencies",
  "manageExchangeRates",
  "manageVideos",
  "managePlaylists",
  "manageTickers",
  "manageImageAdverts",
  "manageTVDevices",
  "viewAnalytics",
  "viewAuditLogs",
  "viewTVStatus",
  "pushEmergencyRates",
  "manageSystemSettings",
  "manageAllBranches",
] as const;

export const ADMIN_PERMISSIONS = [
  "createBranch",
  "editBranch",
  "manageUsers",
  "manageVideos",
  "managePlaylists",
  "manageTickers",
  "manageImageAdverts",
  "viewExchangeRates",
  "manageExchangeRates",
  "manageAllBranches",
  "viewTVStatus",
  "viewAuditLogs",
  "manageBranchDisplaySettings",
] as const;

export const BRANCH_MANAGER_PERMISSIONS = [
  "manageOwnBranchRates",
  "manageOwnBranchVideos",
  "manageOwnBranchPlaylists",
  "manageOwnBranchTickers",
  "manageOwnBranchTVDevices",
  "manageImageAdverts",
  "viewOwnBranchAnalytics",
  "viewOwnBranchAuditLogs",
  "inviteBranchUsers",
] as const;

export const BRANCH_USER_PERMISSIONS = ["manageOwnBranchRates", "proposeOwnBranchVideos"] as const;

export const ROLE_LABELS: Record<string, string> = {
  superAdmin: "Super Admin",
  admin: "Admin",
  branchManager: "Branch Manager",
  branchUser: "Branch User (rates only)",
};

/** ISO currency code → display metadata for catalog normalization and import. */
export const CURRENCY_METADATA: Record<
  string,
  { name: string; country: string; flag: string }
> = {
  USD: { name: "US Dollar", country: "United States", flag: "🇺🇸" },
  GBP: { name: "British Pound", country: "United Kingdom", flag: "🇬🇧" },
  EUR: { name: "Euro", country: "European Union", flag: "🇪🇺" },
  KES: { name: "Kenyan Shilling", country: "Kenya", flag: "🇰🇪" },
  ZAR: { name: "South African Rand", country: "South Africa", flag: "🇿🇦" },
  CAD: { name: "Canadian Dollar", country: "Canada", flag: "🇨🇦" },
  AUD: { name: "Australian Dollar", country: "Australia", flag: "🇦🇺" },
  HKD: { name: "Hong Kong Dollar", country: "Hong Kong", flag: "🇭🇰" },
  CNY: { name: "Chinese Yuan", country: "China", flag: "🇨🇳" },
  INR: { name: "Indian Rupee", country: "India", flag: "🇮🇳" },
  SAR: { name: "Saudi Riyal", country: "Saudi Arabia", flag: "🇸🇦" },
  QAR: { name: "Qatari Riyal", country: "Qatar", flag: "🇶🇦" },
  OMR: { name: "Omani Rial", country: "Oman", flag: "🇴🇲" },
  BHD: { name: "Bahraini Dinar", country: "Bahrain", flag: "🇧🇭" },
  AED: { name: "UAE Dirham", country: "United Arab Emirates", flag: "🇦🇪" },
  JPY: { name: "Japanese Yen", country: "Japan", flag: "🇯🇵" },
  CHF: { name: "Swiss Franc", country: "Switzerland", flag: "🇨🇭" },
  NZD: { name: "New Zealand Dollar", country: "New Zealand", flag: "🇳🇿" },
  SGD: { name: "Singapore Dollar", country: "Singapore", flag: "🇸🇬" },
  ZMW: { name: "Zambian Kwacha", country: "Zambia", flag: "🇿🇲" },
  UGX: { name: "Ugandan Shilling", country: "Uganda", flag: "🇺🇬" },
  TZS: { name: "Tanzanian Shilling", country: "Tanzania", flag: "🇹🇿" },
  NGN: { name: "Nigerian Naira", country: "Nigeria", flag: "🇳🇬" },
  EGP: { name: "Egyptian Pound", country: "Egypt", flag: "🇪🇬" },
  PKR: { name: "Pakistani Rupee", country: "Pakistan", flag: "🇵🇰" },
  BDT: { name: "Bangladeshi Taka", country: "Bangladesh", flag: "🇧🇩" },
  LKR: { name: "Sri Lankan Rupee", country: "Sri Lanka", flag: "🇱🇰" },
  NPR: { name: "Nepalese Rupee", country: "Nepal", flag: "🇳🇵" },
  THB: { name: "Thai Baht", country: "Thailand", flag: "🇹🇭" },
  MYR: { name: "Malaysian Ringgit", country: "Malaysia", flag: "🇲🇾" },
  IDR: { name: "Indonesian Rupiah", country: "Indonesia", flag: "🇮🇩" },
  PHP: { name: "Philippine Peso", country: "Philippines", flag: "🇵🇭" },
  KRW: { name: "South Korean Won", country: "South Korea", flag: "🇰🇷" },
  TRY: { name: "Turkish Lira", country: "Turkey", flag: "🇹🇷" },
  RUB: { name: "Russian Ruble", country: "Russia", flag: "🇷🇺" },
  SEK: { name: "Swedish Krona", country: "Sweden", flag: "🇸🇪" },
  NOK: { name: "Norwegian Krone", country: "Norway", flag: "🇳🇴" },
  DKK: { name: "Danish Krone", country: "Denmark", flag: "🇩🇰" },
  PLN: { name: "Polish Zloty", country: "Poland", flag: "🇵🇱" },
  CZK: { name: "Czech Koruna", country: "Czech Republic", flag: "🇨🇿" },
  HUF: { name: "Hungarian Forint", country: "Hungary", flag: "🇭🇺" },
  ILS: { name: "Israeli Shekel", country: "Israel", flag: "🇮🇱" },
  JOD: { name: "Jordanian Dinar", country: "Jordan", flag: "🇯🇴" },
  KWD: { name: "Kuwaiti Dinar", country: "Kuwait", flag: "🇰🇼" },
  LBP: { name: "Lebanese Pound", country: "Lebanon", flag: "🇱🇧" },
  MAD: { name: "Moroccan Dirham", country: "Morocco", flag: "🇲🇦" },
  TND: { name: "Tunisian Dinar", country: "Tunisia", flag: "🇹🇳" },
  GHS: { name: "Ghanaian Cedi", country: "Ghana", flag: "🇬🇭" },
  XOF: { name: "West African CFA Franc", country: "West Africa", flag: "🌍" },
  XAF: { name: "Central African CFA Franc", country: "Central Africa", flag: "🌍" },
  RWF: { name: "Rwandan Franc", country: "Rwanda", flag: "🇷🇼" },
  BIF: { name: "Burundian Franc", country: "Burundi", flag: "🇧🇮" },
  ETB: { name: "Ethiopian Birr", country: "Ethiopia", flag: "🇪🇹" },
  SSP: { name: "South Sudanese Pound", country: "South Sudan", flag: "🇸🇸" },
  CDF: { name: "Congolese Franc", country: "DR Congo", flag: "🇨🇩" },
  MWK: { name: "Malawian Kwacha", country: "Malawi", flag: "🇲🇼" },
  SOS: { name: "Somali Shilling", country: "Somalia", flag: "🇸🇴" },
  DJF: { name: "Djiboutian Franc", country: "Djibouti", flag: "🇩🇯" },
  ERN: { name: "Eritrean Nakfa", country: "Eritrea", flag: "🇪🇷" },
  MZN: { name: "Mozambican Metical", country: "Mozambique", flag: "🇲🇿" },
};
