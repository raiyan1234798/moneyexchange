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

export const DEFAULT_SYSTEM_SETTINGS = {
  companyName: "MoneyExchange",
  supportEmail: "support@moneyexchange.com",
  defaultTimezone: "Asia/Dubai",
  emergencyRateEnabled: true,
  offlineCacheEnabled: true,
  tvHeartbeatIntervalSeconds: 60,
  defaultTickerSpeed: 30,
  maintenanceMode: false,
  auditRetentionDays: 90,
} as const;

export const NAV_ITEMS: Array<{
  href: string;
  label: string;
  icon: string;
  roles: readonly ("superAdmin" | "branchManager")[];
}> = [
  { href: "/dashboard", label: "Overview", icon: "LayoutDashboard", roles: ["superAdmin", "branchManager"] },
  { href: "/dashboard/branches", label: "Branches", icon: "Building2", roles: ["superAdmin"] },
  { href: "/dashboard/managers", label: "Managers", icon: "Users", roles: ["superAdmin"] },
  { href: "/dashboard/exchange-rates", label: "Exchange Rates", icon: "TrendingUp", roles: ["superAdmin", "branchManager"] },
  { href: "/dashboard/videos", label: "Videos", icon: "Video", roles: ["superAdmin", "branchManager"] },
  { href: "/dashboard/tickers", label: "Display Messages", icon: "TextCursorInput", roles: ["superAdmin", "branchManager"] },
  { href: "/dashboard/settings", label: "Settings", icon: "Settings", roles: ["superAdmin", "branchManager"] },
  { href: "/dashboard/profile", label: "Profile", icon: "User", roles: ["superAdmin", "branchManager"] },
  { href: "/dashboard/audit-logs", label: "Audit Logs", icon: "ScrollText", roles: ["superAdmin"] },
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
