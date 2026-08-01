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
/** Maximum number of branches that can be created (per client: 8). */
export const MAX_BRANCHES = 8;

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
  transferRates: "transfer_rates",
  pendingApprovals: "pending_approvals",
  appConfig: "app_config",
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
  tickerMessageFont: null as string | null,
  showBuyRate: true,
  showSellRate: true,
  rateCardPosition: "right" as const,
  rateCardDisplaySeconds: 0,
  rateCardHideSeconds: 0,
  showRemittanceScreen: false,
  showTransferColumn: false,
  showTransferCard: true,
  showForexCard: true,
  transferLocalLabel: "UGX",
  videoWidthPercent: 72,
  // Default "stretch" = media is stretched to exactly fill the fixed area (whole
  // content visible, no bars, no crop) — matches the client's previous signage
  // player. "auto" resizes the area to the media instead; "cover" crops; "contain"
  // shows the whole frame on a blurred fill.
  videoFit: "stretch" as "contain" | "cover" | "auto" | "stretch",
  rateCardScale: 1,
  rateCurrencyScale: 1,
  rateValueScale: 1,
  tickerScale: 1,
  logoScale: 1,
  tickerLogoHeightScale: 1,
  tickerLogoAnimation: "spin" as string,
  tickerHeadline: null as string | null,
  showTickerHeadline: true,
  showTickerLogo: true,
  showVideoCoverLogo: true,
  tickerHeadlineBgColor: null as string | null,
  tickerHeadlineTextColor: null as string | null,
  hiddenTransferCodes: [] as string[],
  tickerHeadlineAnimation: null as string | null,
  tickerMessageAnimation: null as string | null,
  tickerScrollLogoAnimation: null as string | null,
  tickerScrollLogoScale: 1,
  tickerScrollLogoGapVw: 1.2,
  tickerScrollLogoBg: "transparent" as "white" | "transparent" | "auto",
  tickerScrollLogosEnabled: true,
  tickerScrollLogoPosition: "start" as "start" | "end" | "both",
  scrollingLogoItems: [] as Array<{ url: string; pos: "start" | "end" }>,
  tickerLogoFit: "contain" as "contain" | "cover" | "fill",
  rateCardTransition: "fade" as string,
  /** Seconds the slide/page entrance animation lasts (rate card + video media). */
  slideTransitionSeconds: 0.6,
  rateTextAnimation: null as string | null,
  rateCurrencyAnimation: null as string | null,
  rateFlagAnimation: null as string | null,
  rateHeadingAnimation: null as string | null,
  rateCardBgColor: null as string | null,
  rateCurrencyColor: null as string | null,
  logoAutoRemoveBg: true,
  videoImageTransition: "fade" as string,
  tickerLogoUrls: [] as string[],
  tickerLogoRotateSeconds: 6,
  tickerLogoBgColor: null as string | null,
  headerLogoUrl: null as string | null,
  headerLogoUrl2: null as string | null,
  headerLogoDisplay: "single" as "single" | "both",
  promoLogoMode: "hide" as "keep" | "hide" | "second",
  replaceDefaultLogo: false,
  headerLogoRotationEnabled: false,
  headerLogoRotationIntervalSeconds: 10,
  /** EXTRA rate-card header logos (any number) — they join the logo rotation. */
  headerLogoUrls: [] as string[],
  rateNoteScale: 1,
  rateNoteFont: null as string | null,
  syncRateCardPlayback: false,
  hideDotsOnPromo: false,
  ratePromoTransition: "fade" as string,
  ratePromoTransitionSeconds: 0.6,
  ratePromoTransitionSpeed: 1,
  videoSoundOn: false,
  scrollingLogos: [] as string[],
  scrollLogoFitMode: "fill" as "contain" | "fill" | "stretch",
  scrollLogoRemoveBg: false,
  rateCardNote: null as string | null,
  rateCardNoteFontScale: 1,
  rateNotePlacement: "first" as "first" | "all",
  rateSheetIntervalSeconds: 5,
  // Order the rotating rate-card slides appear in (client can pick which shows
  // first). Only the slides that actually exist are shown, in this order.
  rateCardOrder: ["forex", "transfer", "promo"] as Array<"forex" | "transfer" | "promo">,
  ratePromoImageUrl: null as string | null,
  ratePromoMedia: [] as Array<{ type: "image" | "video"; url: string }>,
  ratePromoSoundOn: null as boolean | null,
  promoSlideLogoUrl: null as string | null,
  promoSlideLogoScale: 1,
  promoSlideLogoAnimation: null as string | null,
  ratePromoTextScale: 1,
  ratePromoTextAnimation: null as string | null,
  ratePromoFont: null as string | null,
  headerLogoScale: 1,
  /** Continuous logo movement — any DISPLAY_ANIMATIONS key (incl. spin/flip/rotate/tilt). */
  headerLogoAnimation: "none" as string,
  announcementTextScale: 1,
  announcementTextAnimation: null as string | null,
  ratePromoEnabled: true,
  ratePromoTextTop: null as string | null,
  ratePromoText: null as string | null,
  ratePromoDurationSeconds: 6,
  /** How promo media fits its card: fill=stretch (no gaps, nothing cut),
      cover=zoom to fill (edges crop), contain=show whole (may leave bands). */
  ratePromoMediaFit: "fill" as "fill" | "cover" | "contain",
  /** Seconds the TRANSFER card stays — null = same as the forex slides. */
  rateTransferDurationSeconds: null as number | null,
  /** TV edge-cut (overscan) fix: shrink the whole display this % per edge. */
  displaySafeAreaPercent: 0,
  /** Seconds per full spin/flip turn for flags, currency letters and headings. */
  rateAnimationSpeedSeconds: 3,
  /** Seconds the flags/letters/numbers STAND STILL between spin/flip turns. */
  rateAnimationPauseSeconds: 1,
  /** TRANSFER-card spin/flip turn seconds — null = same as the forex slides. */
  rateAnimationSpeedSecondsTransfer: null as number | null,
  /** TRANSFER-card stand-still seconds — null = same as the forex slides. */
  rateAnimationPauseSecondsTransfer: null as number | null,
  // ONE font for the whole display — overrides all the individual fonts below.
  displayFont: null as string | null,
  rateCardFont: null as string | null,
  announcementText: null as string | null,
  announcementImageUrl: null as string | null,
  announcementVideoUrl: null as string | null,
  announcementEnabled: true,
  // "band"=bottom message strip, "video-top"=strip at the top of the video,
  // "popup"=big card over the video, "fullscreen"=whole video area,
  // "rate-card"=inside the rate-card panel.
  announcementStyle: "lower-third" as
    | "popup"
    | "fullscreen"
    | "band"
    | "video-top"
    | "rate-card"
    | "lower-third",
  // Top or bottom of the video for the over-video announcement styles.
  announcementPosition: "bottom" as "top" | "bottom",
  announcementAnimation: "slide" as "none" | "slide" | "fade" | "zoom" | "flip",
  // Font + colour treatment for the announcement text.
  announcementFont: null as string | null,
  announcementColorStyle: "white" as "white" | "logo" | "gold" | "navy",
  announcementTextColor: null as string | null,
  announcementSeconds: 5,
  announcementRepeatMinutes: 3,
  announcementRepeatSeconds: null as number | null,
  // "repeat" = show every N minutes forever; "times" = show a fixed number of
  // times total then stop until the settings change.
  announcementPlayMode: "repeat" as "repeat" | "times",
  announcementPlayTimes: 1,
};

/** Cloudflare R2 free tier is 10 GB total — warn/stop uploads near the cap. */
export const MAX_TOTAL_STORAGE_BYTES = 10 * 1024 * 1024 * 1024;
/** Show the friendly "storage almost full" notice once total usage passes ~9 GB
    (Cloudflare R2 bills beyond the 10 GB free tier). */
export const STORAGE_WARN_BYTES = 9 * 1024 * 1024 * 1024;

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

/**
 * Transition styles for slide/page changes — ONE list for rate-card sheets,
 * video-area media, and any other place that offers a "slide change" effect.
 * Keep keys stable; labels can be clarified without breaking saved settings.
 */
export const SLIDE_TRANSITIONS: Array<{ key: string; label: string }> = [
  { key: "fade", label: "Fade (default)" },
  { key: "flip", label: "3D flip (card turn)" },
  { key: "flip-up", label: "Flip up (horizontal hinge)" },
  { key: "cube", label: "Cube turn" },
  { key: "slide-left", label: "Swipe from the right" },
  { key: "slide-right", label: "Swipe from the left" },
  { key: "slide-up", label: "Slide up" },
  { key: "drop", label: "Drop in from the top" },
  { key: "zoom", label: "Zoom in" },
  { key: "zoom-out", label: "Zoom out (pull back)" },
  { key: "spin-in", label: "Spin in" },
  { key: "bounce-in", label: "Bounce in" },
  { key: "wipe", label: "Wipe reveal" },
  { key: "blur", label: "Blur in" },
  { key: "snap", label: "Snap (quick punch)" },
  { key: "none", label: "Instant (no animation)" },
];

/** Circular preset chips for slide transition length ("Between pass"). */
export const SLIDE_TRANSITION_DURATION_PRESETS = [0.4, 0.8, 1.2, 1.5, 2] as const;

/** Presets for forex spin/flip turn length (seconds per turn). */
export const RATE_ANIM_SPEED_PRESETS = [2, 3, 4, 5, 6] as const;

/** Presets for stand-still pause between spins (seconds). */
export const RATE_ANIM_PAUSE_PRESETS = [0, 1, 2, 3, 5] as const;

/** CSS class for a SLIDE_TRANSITIONS key. Unknown keys fall back to fade. */
export function slideTransitionClass(name: string | null | undefined): string {
  switch (name) {
    case "flip": return "sheet-anim-flip";
    case "flip-up": return "sheet-anim-flip-up";
    case "cube": return "sheet-anim-cube";
    case "slide-left": return "sheet-anim-slide-left";
    case "slide-right": return "sheet-anim-slide-right";
    case "slide-up": return "sheet-anim-slide-up";
    case "drop": return "sheet-anim-drop";
    case "zoom": return "sheet-anim-zoom";
    case "zoom-out": return "sheet-anim-zoom-out";
    case "spin-in": return "sheet-anim-spin-in";
    case "bounce-in": return "sheet-anim-bounce-in";
    case "wipe": return "sheet-anim-wipe";
    case "blur": return "sheet-anim-blur";
    case "snap": return "sheet-anim-snap";
    // Legacy keys saved by older versions — keep them animating instead of
    // silently degrading to fade (client 2026-07-25: "old effects missing").
    case "flip-x": return "sheet-anim-flip-up";
    case "rotate": return "sheet-anim-spin-in";
    case "bounce": return "sheet-anim-bounce-in";
    case "none": return "";
    default: return "sheet-anim-fade";
  }
}

/** Every movement effect available across the display — logos, badge, texts.
    ONE list powers every animation selector so new effects appear everywhere. */
export const DISPLAY_ANIMATIONS: Array<{ key: string; label: string }> = [
  { key: "none", label: "No animation" },
  { key: "wave", label: "Wave — gentle rocking" },
  { key: "spin", label: "Rotating flip (Y)" },
  { key: "flip", label: "Flip (X)" },
  { key: "rotate", label: "Rotate — slow full turns" },
  { key: "tilt", label: "3D tilt" },
  { key: "bounce", label: "Bounce" },
  { key: "float", label: "Float" },
  { key: "drift", label: "Drift — slow figure-8" },
  { key: "swing", label: "Swing" },
  { key: "pulse", label: "Gentle pulse" },
  { key: "breathe", label: "Breathe — slow zoom" },
  { key: "heartbeat", label: "Heartbeat" },
  { key: "shine", label: "Shine — glow pulse" },
  { key: "shake", label: "Shake" },
  { key: "wobble", label: "Wobble" },
  { key: "jello", label: "Jello — wobbly squish" },
  { key: "flash", label: "Flash — blink" },
];

/** CSS class for a DISPLAY_ANIMATIONS key ("" = none/unknown). */
export function displayAnimationClass(name: string | null | undefined): string {
  switch (name) {
    case "spin": return "ticker-logo-spin";
    case "flip": return "ticker-logo-flipx";
    case "bounce": return "ticker-logo-bounce";
    case "float": return "ticker-logo-float";
    case "swing": return "ticker-logo-swing";
    case "pulse": return "ticker-logo-pulse";
    case "wave": return "logo-anim-wave";
    case "heartbeat": return "logo-anim-heartbeat";
    case "tilt": return "logo-anim-tilt";
    case "shine": return "logo-anim-shine";
    case "drift": return "logo-anim-drift";
    case "shake": return "logo-anim-shake";
    case "wobble": return "logo-anim-wobble";
    case "jello": return "logo-anim-jello";
    case "breathe": return "logo-anim-breathe";
    case "flash": return "logo-anim-flash";
    case "rotate": return "logo-anim-rotate";
    default: return "";
  }
}

/** Font styles for a TEXT logo on the display ticker badge. */
export const LOGO_FONTS: Array<{ key: string; label: string; css: string }> = [
  // ---- Sans-serif ----
  { key: "sans-bold", label: "Bold Sans (Arial Black)", css: "'Arial Black', Arial, Helvetica, sans-serif" },
  { key: "inter", label: "Inter (Sans-serif)", css: "var(--font-inter), Arial, sans-serif" },
  { key: "roboto", label: "Roboto (Sans-serif)", css: "var(--font-roboto), Arial, sans-serif" },
  { key: "open-sans", label: "Open Sans (Sans-serif)", css: "var(--font-open-sans), Arial, sans-serif" },
  { key: "lato", label: "Lato (Sans-serif)", css: "var(--font-lato), Arial, sans-serif" },
  { key: "work-sans", label: "Work Sans (Sans-serif)", css: "var(--font-work-sans), Arial, sans-serif" },
  // The unimoni creative font (rounded, used across their promo artwork).
  { key: "brand", label: "Unimoni Brand (Nunito, rounded)", css: "var(--font-brand), 'Trebuchet MS', 'Segoe UI', sans-serif" },
  // Bold geometric sans matching the "CHOOSE US FOR MONEY EXCHANGE" artwork.
  { key: "montserrat", label: "Montserrat (Unimoni headline)", css: "var(--font-montserrat), 'Segoe UI', Arial, sans-serif" },
  { key: "poppins", label: "Poppins (Geometric sans)", css: "var(--font-poppins), 'Segoe UI', Arial, sans-serif" },
  // ---- Condensed / tall / display ----
  { key: "oswald", label: "Oswald (Condensed)", css: "var(--font-oswald), 'Arial Narrow', sans-serif" },
  { key: "teko", label: "Teko (Tall condensed)", css: "var(--font-teko), 'Arial Narrow', sans-serif" },
  { key: "bebas", label: "Bebas Neue (Tall caps)", css: "var(--font-bebas), 'Arial Narrow', sans-serif" },
  { key: "anton", label: "Anton (Heavy impact)", css: "var(--font-anton), 'Arial Black', sans-serif" },
  { key: "condensed", label: "Condensed (Arial Narrow)", css: "'Arial Narrow', 'Helvetica Neue', sans-serif" },
  // ---- Rounded ----
  { key: "quicksand", label: "Quicksand (Rounded)", css: "var(--font-quicksand), 'Trebuchet MS', sans-serif" },
  { key: "baloo", label: "Baloo (Rounded bold)", css: "var(--font-baloo), 'Trebuchet MS', sans-serif" },
  { key: "rounded", label: "Rounded (Trebuchet)", css: "'Trebuchet MS', 'Segoe UI', sans-serif" },
  // ---- Serif ----
  { key: "playfair", label: "Playfair (Elegant serif)", css: "var(--font-playfair), Georgia, serif" },
  { key: "merriweather", label: "Merriweather (Serif)", css: "var(--font-merriweather), Georgia, serif" },
  { key: "lora", label: "Lora (Serif)", css: "var(--font-lora), Georgia, serif" },
  { key: "roboto-slab", label: "Roboto Slab (Slab serif)", css: "var(--font-roboto-slab), Georgia, serif" },
  { key: "serif", label: "Classic Serif (Georgia)", css: "Georgia, 'Times New Roman', serif" },
  // ---- Monospace / script ----
  { key: "roboto-mono", label: "Roboto Mono (Monospace)", css: "var(--font-roboto-mono), 'Courier New', monospace" },
  { key: "mono", label: "Monospace (Courier)", css: "'Courier New', monospace" },
  { key: "pacifico", label: "Pacifico (Handwriting)", css: "var(--font-pacifico), cursive" },
];

export function logoFontCss(key: string | null | undefined): string {
  return LOGO_FONTS.find((f) => f.key === key)?.css ?? LOGO_FONTS[0].css;
}

/** Font choices for the SCROLLING ticker message — separate from the logo font. */
export const MESSAGE_FONTS: Array<{ key: string; label: string; css: string }> = [
  { key: "standard", label: "Standard (Arial)", css: "Arial, Helvetica, sans-serif" },
  ...LOGO_FONTS,
];

export function messageFontCss(key: string | null | undefined): string {
  return MESSAGE_FONTS.find((f) => f.key === key)?.css ?? MESSAGE_FONTS[0].css;
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
  // Per client (2026-07-14): branch managers AND branch users handle FOREX RATES
  // ONLY (edit or Excel upload). Everything else is admin-only.
  { href: "/dashboard/users", label: "Users", icon: "Users", roles: ["superAdmin", "admin"] },
  {
    href: "/dashboard/exchange-rates",
    label: "Exchange Rates",
    icon: "TrendingUp",
    roles: ["superAdmin", "admin", "branchManager", "branchUser"],
  },
  // Per client (2026-07-11): advert videos/images, scrolling messages, logos
  // and display settings are ADMIN-ONLY. Branch staff see rates only.
  { href: "/dashboard/videos", label: "Media Manager", icon: "Video", roles: ["superAdmin", "admin"] },
  {
    href: "/dashboard/tickers",
    label: "Display Messages",
    icon: "TextCursorInput",
    roles: ["superAdmin", "admin"],
  },
  // Per-branch announcements + promotion card, on their own page (2026-07-14).
  { href: "/dashboard/promotions", label: "Promotions", icon: "Megaphone", roles: ["superAdmin", "admin"] },
  { href: "/dashboard/settings", label: "Settings", icon: "Settings", roles: ["superAdmin", "admin"] },
  {
    href: "/dashboard/notifications",
    label: "Notifications",
    icon: "Bell",
    roles: ["superAdmin", "admin"],
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
    roles: ["superAdmin", "admin"],
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
  "deleteBranch",
  "manageUsers",
  // Admins curate the currency catalog too — edit flag/name/country (client
  // request 2026-07-20); Firestore rules allow it.
  "manageCurrencies",
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

// Per client (2026-07-11): branch staff handle FOREX RATES ONLY. All display
// content (videos, images, scrolling messages, logos, settings, transfer card)
// is controlled by the admins.
// Per client (2026-07-14): managers, like branch users, can ONLY manage their
// own branch's forex rates (edit or Excel upload) — nothing else.
export const BRANCH_MANAGER_PERMISSIONS = [
  "manageOwnBranchRates",
] as const;

export const BRANCH_USER_PERMISSIONS = ["manageOwnBranchRates"] as const;

export const ROLE_LABELS: Record<string, string> = {
  superAdmin: "Super Admin",
  admin: "Admin",
  branchManager: "Branch Manager",
  branchUser: "Branch User (rates only)",
};

/**
 * The clickable MODULE grid on the user form: which parts of the dashboard a
 * person can use. A user with NO custom selection gets their role's defaults;
 * a custom selection REPLACES the defaults (Overview/Profile/Activity are
 * always available).
 */
export const ACCESS_MODULES = [
  { key: "forexRates", label: "Foreign exchange rates" },
  { key: "forexRatesAllBranches", label: "Forex rates — ALL branches" },
  { key: "transferRates", label: "Transfer rates (all branches)" },
  { key: "addBranchCurrencies", label: "Add new currencies (Excel & UI) — required to create currencies" },
  { key: "media", label: "Media Manager (videos & images)" },
  { key: "displayMessages", label: "Display messages" },
  { key: "promotions", label: "Promotions" },
  { key: "settings", label: "Display settings" },
  { key: "users", label: "Users" },
  { key: "branches", label: "Branches" },
] as const;

export type AccessModuleKey = (typeof ACCESS_MODULES)[number]["key"];

// Per client (2026-07-21): branch managers upload BOTH exchange and transfer
// rates by default; branch users forex only. Custom module picks override.
export const MODULE_DEFAULTS_BY_ROLE: Record<string, AccessModuleKey[]> = {
  superAdmin: ACCESS_MODULES.map((m) => m.key),
  admin: ACCESS_MODULES.map((m) => m.key),
  branchManager: ["forexRates", "transferRates"],
  branchUser: ["forexRates"],
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
  // Not ISO 4217 (Scottish notes are GBP), but the client lists it separately.
  SCP: { name: "Scottish Pound", country: "Scotland", flag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿" },
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
  // Multi-country CFA francs — flag of each central bank's home country
  // (BCEAO in Senegal, BEAC in Cameroon). Changeable via Currency Edit.
  XOF: { name: "West African CFA Franc", country: "West Africa (UEMOA)", flag: "🇸🇳" },
  XAF: { name: "Central African CFA Franc", country: "Central Africa (CEMAC)", flag: "🇨🇲" },
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

export const promoTransitionDurationMs = 600;
