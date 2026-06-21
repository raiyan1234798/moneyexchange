export const SUPER_ADMIN_EMAIL = "abubackerraiyan@gmail.com";

export const COLLECTIONS = {
  users: "users",
  userInvites: "user_invites",
  branches: "branches",
  currencies: "currencies",
  exchangeRates: "exchange_rates",
  rateHistory: "rate_history",
  videos: "videos",
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
} as const;

export const DEFAULT_BRANCH_SETTINGS = {
  timezone: "Asia/Dubai",
  defaultLanguage: "en",
  slogan: "Your trusted exchange partner",
  tickerSpeed: 50,
  tickerFontSize: 18,
  tickerFontColor: "#FFFFFF",
  showBuyRate: true,
  showSellRate: true,
};

/** Max Firebase Storage upload per file (matches storage.rules) */
export const MAX_VIDEO_UPLOAD_BYTES = 500 * 1024 * 1024;

export const RECOMMENDED_VIDEO_FORMATS = [
  "MP4 H.264 (recommended)",
  "WebM VP9",
  "MOV (QuickTime)",
];

export const NAV_ITEMS = [
  { href: "/dashboard", label: "Overview", icon: "LayoutDashboard" },
  { href: "/dashboard/branches", label: "Branches", icon: "Building2" },
  { href: "/dashboard/managers", label: "Managers", icon: "Users" },
  { href: "/dashboard/currencies", label: "Currencies", icon: "Coins" },
  { href: "/dashboard/exchange-rates", label: "Exchange Rates", icon: "TrendingUp" },
  { href: "/dashboard/videos", label: "Videos", icon: "Video" },
  { href: "/dashboard/playlists", label: "Playlists", icon: "ListVideo" },
  { href: "/dashboard/tickers", label: "Tickers", icon: "TextCursorInput" },
  { href: "/dashboard/analytics", label: "Analytics", icon: "BarChart3" },
  { href: "/dashboard/notifications", label: "Notifications", icon: "Bell" },
  { href: "/dashboard/audit-logs", label: "Audit Logs", icon: "ScrollText" },
  { href: "/dashboard/settings", label: "Settings", icon: "Settings" },
  { href: "/dashboard/profile", label: "Profile", icon: "User" },
] as const;

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
  "manageTVDevices",
  "viewAnalytics",
  "viewAuditLogs",
  "viewTVStatus",
  "pushEmergencyRates",
  "manageSystemSettings",
  "manageAllBranches",
] as const;

export const BRANCH_MANAGER_PERMISSIONS = [
  "manageOwnBranchRates",
  "manageOwnBranchVideos",
  "manageOwnBranchPlaylists",
  "manageOwnBranchTickers",
  "manageOwnBranchTVDevices",
  "viewOwnBranchAnalytics",
  "viewOwnBranchAuditLogs",
] as const;
