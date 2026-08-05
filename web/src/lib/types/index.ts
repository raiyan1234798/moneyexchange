import type { Timestamp } from "firebase/firestore";

export type UserRole = "superAdmin" | "admin" | "branchManager" | "branchUser";

export type EntityStatus = "active" | "inactive" | "disabled";

export interface UserInvite {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  branchId: string | null;
  branchName?: string | null;
  status?: "pending" | "approved";
  createdBy: string;
  createdAt: Timestamp | Date;
  approvedAt?: Timestamp | Date;
  updatedAt?: Timestamp | Date;
}

export interface AppUser {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  branchId?: string | null;
  photoURL?: string | null;
  isActive: boolean;
  createdAt: Timestamp | Date;
  updatedAt: Timestamp | Date;
  lastLoginAt?: Timestamp | Date | null;
  /** Custom module picks (Users form) — when set, REPLACES the role defaults. */
  moduleAccess?: string[];
}

export interface Branch {
  id: string;
  name: string;
  code: string;
  address: string;
  city: string;
  country: string;
  phone: string;
  email: string;
  managerId?: string | null;
  logoUrl?: string | null;
  brandingColor?: string;
  workingHours: string;
  /** Per-day opening hours (e.g. { mon: "08:30 - 17:30", sun: "Closed" }) —
      workingHours stays as the composed summary line. */
  workingHoursByDay?: Partial<Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", string>>;
  status: EntityStatus;
  /** Manual position in branch lists/dropdowns (1-based). Unset = after ordered ones, A–Z. */
  displayOrder?: number;
  settings: BranchSettings;
  createdAt: Timestamp | Date;
  updatedAt: Timestamp | Date;
}

export type RateCardPosition = "left" | "right";

export interface BranchSettings {
  timezone: string;
  defaultLanguage: string;
  slogan: string;
  tickerSpeed: number;
  tickerFontSize: number;
  tickerFontColor: string;
  tickerLogoUrl?: string | null;
  tickerLogoText?: string | null;
  tickerLogoFont?: string | null;
  /** Font for the SCROLLING ticker message (separate from the logo font). */
  tickerMessageFont?: string | null;
  showBuyRate: boolean;
  showSellRate: boolean;
  rateCardPosition: RateCardPosition;
  /** 0 = always show rate card; otherwise hide after N seconds when rotating */
  rateCardDisplaySeconds: number;
  /** When > 0 (with rateCardDisplaySeconds > 0): the card CYCLES — visible for
      rateCardDisplaySeconds, then hidden for this many seconds while the video
      fills the whole screen, then back again. */
  rateCardHideSeconds?: number;
  /** @deprecated superseded by showTransferCard. */
  showRemittanceScreen?: boolean;
  /** @deprecated inline column removed — transfer is now its own card. */
  showTransferColumn?: boolean;
  /** Rotate in a SEPARATE "TRANSFER EXCHANGE RATES" card ($ + local columns). */
  showTransferCard?: boolean;
  /** Show the FOREX (We Buy / We Sell) rate card at all. Default true. */
  showForexCard?: boolean;
  /** Label for the local-currency transfer column (default "UGX"). */
  transferLocalLabel?: string;

  // --- Independent display sizing (each area is resizable on its own) ---
  /** Width of the video/promo area as a % of the screen (40–80). Rate card takes the rest. Default 65. */
  videoWidthPercent?: number;
  /**
   * How the video/image fits its area:
   * - "stretch" = media is stretched to exactly fill the fixed area — whole content
   *               visible, no bars, no crop (like the client's previous signage player). Default.
   * - "auto"    = the promo AREA resizes to the media's shape (no crop, no bars, no stretch).
   * - "cover"   = media fills a fixed area, cropping the edges.
   * - "contain" = whole media shown with a blurred fill behind it.
   */
  videoFit?: "contain" | "cover" | "auto" | "stretch";
  /** Multiplier for rate-card text/row size (0.7–1.5). Default 1. */
  rateCardScale?: number;
  /** Multiplier for ticker bar height + text (0.7–1.6). Default 1. */
  tickerScale?: number;
  /** Multiplier for the pop-out ticker logo badge WIDTH (0.6–2). Default 1. */
  logoScale?: number;
  /** Multiplier for the pop-out ticker logo badge HEIGHT (0.6–2). Default 1. */
  tickerLogoHeightScale?: number;
  /** Animation style for the pop-out ticker logo. Default "spin". */
  tickerLogoAnimation?: string;
  /** Custom text for the gold "breaking" headline tab above the ticker. */
  tickerHeadline?: string | null;
  /** Show the gold headline tab at all (turn off to remove it). Default true. */
  showTickerHeadline?: boolean;
  /** Movement effect for the yellow headline box text. null/"none" = static. */
  tickerHeadlineAnimation?: string | null;
  /** Extra movement effect on the SCROLLING message text. null/"none" = plain scroll. */
  tickerMessageAnimation?: string | null;
  /** Movement effect on the logos that scroll WITH the message. null/"none" = static. */
  tickerScrollLogoAnimation?: string | null;
  /** Size multiplier for the logos scrolling WITH the message (1 = normal).
      The black bar height is NOT affected. */
  tickerScrollLogoScale?: number;
  /** Space between adjacent scrolling logos, in vw. Default 1.2. Set 0 to
      JOIN the logos with no gap (e.g. Ria + MoneyGram touching). */
  tickerScrollLogoGapVw?: number;
  /** Chip behind each scrolling logo: white card (default), none, or AUTO —
      dark chip behind light artwork, white behind dark artwork. */
  tickerScrollLogoBg?: "white" | "transparent" | "auto";
  /** Show the scrolling logos at all — off keeps them saved but hidden. */
  tickerScrollLogosEnabled?: boolean;
  /** Where the scrolling logos ride: before the text, after it, or both ends.
      @deprecated superseded by scrollingLogoItems (per-logo position). */
  tickerScrollLogoPosition?: "start" | "end" | "both";
  /** Scrolling logos with a PER-LOGO position — e.g. 2–3 at the front and 2–3
      at the end of the message. Legacy scrollingLogos folds into this on edit. */
  scrollingLogoItems?: Array<{
    url: string;
    pos: "start" | "end";
    /** Per-logo: true = stretch to the FULL bar height (big), false = keep it
     *  smaller/contained. Undefined = follow the branch default. Client 2026-08-04. */
    stretch?: boolean;
  }>;
  /** How the badge logo fits its box: contain (default), cover (fill+crop), fill (stretch). */
  tickerLogoFit?: "contain" | "cover" | "fill";
  /** In "contain" (Normal) fit, how much of the badge the WHOLE logo fills,
      0.5–1.0. Higher = bigger logo, still never cropped. Default 0.9. Lets a
      logo with important edge detail be shown large AND complete. */
  tickerLogoContainScale?: number;
  /** PER-LOGO size override for the rotating corner badge: fraction of the badge
      that a specific logo fills in Normal fit (0.5–1). Stored as an ARRAY of
      { url, scale } — NOT a URL-keyed map, because Firestore map keys cannot
      contain "/" (R2 URLs do), which fails the write with "invalid nested
      entity". A logo with no entry falls back to the global tickerLogoContainScale. */
  tickerLogoScales?: Array<{
    url: string;
    scale: number;
    /** Per-logo fit override: "fill" stretches to the badge box; "contain"
        shows the whole logo at its true shape (best for ROUND emblems, which
        cannot fill a rectangle without distortion). Absent = branch fit. */
    fit?: "fill" | "contain";
  }>;
  /** Transition when the rotating rate-card changes sheet (forex/transfer/promo). */
  rateCardTransition?: string;
  /** Seconds the slide/page entrance animation lasts (rate card + video media). Default 0.6. */
  slideTransitionSeconds?: number;
  /** Continuous movement of the WE BUY / WE SELL numbers. null = still. */
  rateTextAnimation?: string | null;
  /** Continuous movement for the currency CODE letters (USD, EUR, …). */
  rateCurrencyAnimation?: string | null;
  /** Continuous movement for the country FLAGS in the rate table. */
  rateFlagAnimation?: string | null;
  /** Continuous movement for the card heading (EXCHANGE RATES / TRANSFER RATES). */
  rateHeadingAnimation?: string | null;
  /** Rate-card background colour (hex). null → the default deep-blue gradient. */
  rateCardBgColor?: string | null;
  /** Currency code/value/header text colour (hex) on the rate card. null → deep blue. */
  rateCurrencyColor?: string | null;
  /** How promo media fits its card: fill (stretch), cover (crop), contain (whole). */
  ratePromoMediaFit?: "fill" | "cover" | "contain";
  /** Seconds the TRANSFER card stays visible — null/unset = same as forex slides. */
  rateTransferDurationSeconds?: number | null;
  /** TV edge-cut (overscan) fix: shrink the whole display by this % per edge
      (0 = off). Many TVs crop 2–5% of an HDMI input; this keeps everything visible. */
  displaySafeAreaPercent?: number;
  /** Seconds per full spin/flip turn for flags, currency letters and headings (default 3). */
  rateAnimationSpeedSeconds?: number;
  /** Seconds the flags/letters/numbers stand still BETWEEN turns (default 1). */
  rateAnimationPauseSeconds?: number;
  /** TRANSFER-card spin/flip turn seconds — null/unset = same as forex. */
  rateAnimationSpeedSecondsTransfer?: number | null;
  /** TRANSFER-card stand-still seconds — null/unset = same as forex. */
  rateAnimationPauseSecondsTransfer?: number | null;
  /** Auto-remove logo backgrounds on upload (default true). Off = upload as-is. */
  logoAutoRemoveBg?: boolean;
  /** Whether the corner logo badge is visible on the ticker. Default true. */
  showTickerLogo?: boolean;
  /** Colour of the yellow headline box AND the logo badge's border (one gold
      trim). null = the standard Unimoni gold. */
  tickerHeadlineBgColor?: string | null;
  /** Colour of the letters inside the yellow headline box. null = deep navy. */
  tickerHeadlineTextColor?: string | null;
  /**
   * Transfer (remittance) currency codes hidden on THIS branch's TV only.
   * The central transfer card stays shared; this list lets each branch hide
   * selected currencies without affecting every other branch.
   */
  hiddenTransferCodes?: string[] | null;

  /** unimoni logo on the navy cover between video clips. Default true. OFF =
      plain navy cover (the cover always stays so the play button never shows). */
  showVideoCoverLogo?: boolean;
  /** Transition when the video-area image/video changes. */
  videoImageTransition?: string;
  /** Gap between announcement shows in SECONDS (overrides the legacy minutes). */
  announcementRepeatSeconds?: number | null;
  /** SEVERAL corner-badge logos that take turns (overrides tickerLogoUrl when set). */
  tickerLogoUrls?: string[];
  /** Seconds each corner-badge logo stays before the next (default 6). */
  tickerLogoRotateSeconds?: number;
  /** Background colour of the corner badge behind IMAGE logos. null = white.
      Accepts any CSS colour, including "transparent". */
  tickerLogoBgColor?: string | null;
  /** Custom brand logo for the rate-card header (rebrand) — overrides the unimoni logo. */
  headerLogoUrl?: string | null;
  /** Optional SECOND rate-card header logo (co-brand / partner). */
  headerLogoUrl2?: string | null;
  /** EXTRA rate-card header logos (any number) — they join the header-logo rotation. */
  headerLogoUrls?: string[];
  /** How the header logos show on normal slides: just the first, or both side by side. */
  headerLogoDisplay?: "single" | "both";
  /** What the header logo does on the PROMO slide: keep it, hide it (default), or show only the 2nd logo. */
  promoLogoMode?: "keep" | "hide" | "second";
  /** When true, uploaded header logo replaces the default Unimoni logo (no fallback). */
  replaceDefaultLogo?: boolean;
  /** Alternate between the two header logos on normal rate-card slides. */
  headerLogoRotationEnabled?: boolean;
  /** Seconds each logo stays visible when header logo rotation is on. Default 10. */
  headerLogoRotationIntervalSeconds?: number;
  /** Play signage videos WITH sound (default muted). Browsers may require a tap/fullscreen first. */
  videoSoundOn?: boolean;
  /** Logo images that scroll right-to-left in the ticker alongside the messages. */
  scrollingLogos?: string[];
  /**
   * How each scrolling logo fits inside the ticker bar.
   * "contain" (default) = aspect-ratio preserved with side padding.
   * "fill" / "stretch"  = logo stretches to the FULL bar height × auto width (no white margins).
   */
  scrollLogoFitMode?: "contain" | "fill" | "stretch";
  /** When true, automatically strip white/solid backgrounds from scrolling logos. Default true. */
  scrollLogoRemoveBg?: boolean;
  /** A note line shown under the forex rate screen (e.g. "USD Small Bill BUY @ 3600"). */
  rateCardNote?: string | null;
  rateNoteScale?: number;
  rateNoteFont?: string | null;
  syncRateCardPlayback?: boolean;
  hideDotsOnPromo?: boolean;
  ratePromoTransition?: string;
  ratePromoTransitionSeconds?: number;
  ratePromoTransitionSpeed?: number | "normal" | "fast" | "slow";
  /** Size multiplier for the rate-card note text (1 = normal). */
  rateCardNoteFontScale?: number;
  /** Which forex page(s) show the note: the first forex page, or every forex page. */
  rateNotePlacement?: "first" | "all";
  /** Seconds each rotating rate screen stays visible (forex/transfer pages). Default 5. */
  rateSheetIntervalSeconds?: number;
  /** Order the rotating rate-card slides appear in. Missing slides are skipped. */
  rateCardOrder?: Array<"forex" | "transfer" | "promo">;
  /** Promotional card in the rate-card rotation: image (upload/URL). Hidden when empty. */
  ratePromoImageUrl?: string | null;
  /** Promotional GALLERY: several images/videos, each rotates as its own promo screen. */
  ratePromoMedia?: Array<{ type: "image" | "video"; url: string }>;
  /** Sound for promo-card VIDEOS on the rate card. null/undefined = follow the
      main "Play video sound" setting; true = sound on; false = always muted. */
  ratePromoSoundOn?: boolean | null;
  /** Dedicated logo for the PROMOTION slide's logo bar — lets a different logo
      appear while the promo image/video runs. Falls back to alternate → main →
      unimoni when empty. Only shown when promoLogoMode enables the logo bar. */
  promoSlideLogoUrl?: string | null;
  /** Size multiplier for the promo-slide logo (1 = normal). */
  promoSlideLogoScale?: number;
  /** Animation for the promo-slide logo — null follows headerLogoAnimation. */
  promoSlideLogoAnimation?: string | null;
  /** Size multiplier for the promotion slide's text messages (1 = normal). */
  ratePromoTextScale?: number;
  /** Continuous movement of the promotion slide's text messages. null = none. */
  ratePromoTextAnimation?: string | null;
  /** Font for the promotion slide's text messages — null = the display font. */
  ratePromoFont?: string | null;
  /** Size multiplier for the rate-card HEADER logo on normal slides (1 = normal). */
  headerLogoScale?: number;
  /** Animated effect for the rate-card header logo. Default "none". */
  headerLogoAnimation?: string;
  /** Size multiplier for the announcement text (1 = normal). */
  announcementTextScale?: number;
  /** Continuous movement of the announcement TEXT while visible. null = none. */
  announcementTextAnimation?: string | null;
  /** Master on/off for the promotion slide — off hides it from the rotation
      WITHOUT deleting the uploaded images/videos/text. Default true. */
  ratePromoEnabled?: boolean;
  /** Promotional card: text message ABOVE the image. */
  ratePromoTextTop?: string | null;
  /** Promotional card: text message below the image (shown alone or under the image). */
  ratePromoText?: string | null;
  /** Seconds the promotional card stays visible. Defaults to rateSheetIntervalSeconds. */
  ratePromoDurationSeconds?: number;
  /** ONE font for the whole TV screen — rate card, messages, announcements, logo.
   *  When set it overrides every individual font below. See MESSAGE_FONTS. */
  displayFont?: string | null;
  /** Font key for the rate card (header + table) — see MESSAGE_FONTS. */
  rateCardFont?: string | null;
  /** Size multiplier for the CURRENCY code text on the rate card (1 = normal). */
  rateCurrencyScale?: number;
  /** Size multiplier for the WE BUY / WE SELL value numbers (1 = normal). */
  rateValueScale?: number;
  /** Drop-down announcement (admin-only): short text shown briefly over the video area. */
  announcementText?: string | null;
  /** Optional small image shown in the announcement banner (upload or any link). */
  announcementImageUrl?: string | null;
  /** Optional short video in the announcement banner (direct/Drive link or R2 upload). */
  announcementVideoUrl?: string | null;
  /** Master on/off for the announcement — off hides it from the TV without deleting the text/image/video. */
  announcementEnabled?: boolean;
  /** Where the announcement appears on the TV. */
  announcementStyle?: "popup" | "fullscreen" | "band" | "video-top" | "rate-card" | "lower-third";
  /** Top or bottom of the video area for the over-video styles (lower-third etc). Default "bottom". */
  announcementPosition?: "top" | "bottom";
  /** Entrance/exit animation for the announcement. "none" shows it instantly (no motion). */
  announcementAnimation?: "none" | "slide" | "fade" | "zoom" | "flip";
  /** Font key for the announcement text — see MESSAGE_FONTS. */
  announcementFont?: string | null;
  /** Colour treatment for the announcement text. */
  announcementColorStyle?: "white" | "logo" | "gold" | "navy";
  /** Explicit announcement text colour (hex) — overrides the style above. null → use the style. */
  announcementTextColor?: string | null;
  /** Seconds the announcement stays visible each time (default 5). */
  announcementSeconds?: number;
  /** Minutes between announcement repeats (default 3). */
  announcementRepeatMinutes?: number;
  /** "repeat" = every N minutes forever; "times" = a fixed number of times then stop. */
  announcementPlayMode?: "repeat" | "times";
  /** How many times to show when playMode = "times". */
  announcementPlayTimes?: number;
}

export type VideoSourceType = "external" | "r2" | "storage" | "chunked";

export interface Currency {
  id: string;
  currencyCode: string;
  currencyName: string;
  country: string;
  flag: string;
  sortOrder: number;
  status: EntityStatus;
  isHidden: boolean;
  createdAt: Timestamp | Date;
  updatedAt: Timestamp | Date;
}

export interface ExchangeRate {
  id: string;
  branchId: string;
  currencyCode: string;
  /** Branch-specific label shown on dashboard and TV display (defaults to currency code). */
  displayName?: string;
  /** Flag emoji saved with the rate (fallback when the code isn't in the catalog). */
  flag?: string;
  buyRate: number;
  sellRate: number;
  /** @deprecated single-value remittance rate — superseded by transferUsd/transferLocal. */
  remitRate?: number | null;
  /** Money-transfer rate in USD — the "$" column of the separate TRANSFER card. */
  transferUsd?: number | null;
  /** Money-transfer rate in the branch's local currency — the "UGX" column of the TRANSFER card. */
  transferLocal?: number | null;
  version: number;
  displayOrder: number;
  isHidden: boolean;
  status: "draft" | "pending" | "approved" | "published" | "emergency";
  updatedBy: string;
  updatedByName: string;
  publishedAt?: Timestamp | Date | null;
  createdAt: Timestamp | Date;
  updatedAt: Timestamp | Date;
}

/** Centralized money-transfer rate (head office) — identical on every branch display. */
export interface TransferRate {
  id: string;
  currencyCode: string;
  /** "$" column — transfer rate in USD. */
  transferUsd: number | null;
  /** Local-currency column (e.g. UGX). */
  transferLocal: number | null;
  displayOrder: number;
  /** Hidden from the transfer card without deleting the rate. */
  isHidden?: boolean;
  updatedBy: string;
  updatedByName: string;
  createdAt: Timestamp | Date;
  updatedAt: Timestamp | Date;
}

export interface RateHistoryEntry {
  id: string;
  branchId: string;
  currencyCode: string;
  oldBuyRate: number;
  oldSellRate: number;
  newBuyRate: number;
  newSellRate: number;
  updatedBy: string;
  updatedByName: string;
  branchName: string;
  timestamp: Timestamp | Date;
  changeType: "manual" | "bulk" | "scheduled" | "emergency";
}

export interface ImageAdvert {
  id: string;
  title: string;
  branchId: string;
  downloadUrl: string;
  storagePath?: string | null;
  /** Stored size in bytes — used for the total-storage budget check. */
  fileSizeBytes?: number;
  displayDurationSeconds: number;
  /** Rotation order on the display (lower = earlier). Unset = by newest. */
  displayOrder?: number;
  /** Position in the COMBINED videos+images play order (lower = earlier). */
  playOrder?: number;
  /** How many times in a row this plays each loop (default 1). */
  playRepeat?: number;
  status: EntityStatus;
  createdBy: string;
  createdAt: Timestamp | Date;
  updatedAt: Timestamp | Date;
}

export interface VideoAsset {
  id: string;
  title: string;
  description?: string;
  branchId: string;
  category?: string;
  sourceType: VideoSourceType;
  storagePath?: string | null;
  downloadUrl: string;
  chunkCount?: number;
  mimeType: string;
  durationSeconds?: number;
  fileSizeBytes?: number;
  /** Rotation order on the display (lower = earlier). Unset = by newest. */
  displayOrder?: number;
  /** Position in the COMBINED videos+images play order (lower = earlier). */
  playOrder?: number;
  /** How many times in a row this plays each loop (default 1). */
  playRepeat?: number;
  /**
   * "pending" = proposed by a branch user, awaiting branch-manager approval.
   * "uploading" = chunked upload in progress — hidden from TV and lists until
   * the upload completes and flips it to "active".
   */
  status: EntityStatus | "pending" | "uploading";
  expiresAt?: Timestamp | Date | null;
  createdBy: string;
  createdAt: Timestamp | Date;
  updatedAt: Timestamp | Date;
}

export interface VideoPlaylist {
  id: string;
  name: string;
  branchId?: string | null;
  videoIds: string[];
  loop: boolean;
  autoSwitch: boolean;
  scheduleStart?: Timestamp | Date | null;
  scheduleEnd?: Timestamp | Date | null;
  status: EntityStatus;
  createdBy: string;
  createdAt: Timestamp | Date;
  updatedAt: Timestamp | Date;
}

export interface TickerMessage {
  id: string;
  branchId?: string | null;
  messages: TickerLine[];
  scrollSpeed: number;
  fontSize: number;
  fontColor: string;
  logoUrl?: string | null;
  /** Text logo shown in the pop-out badge instead of an image. */
  logoText?: string | null;
  /** Font family key for the text logo — see LOGO_FONTS. */
  logoFont?: string | null;
  /** Font family key for the SCROLLING message — see MESSAGE_FONTS. */
  messageFont?: string | null;
  paused?: boolean;
  language: string;
  scheduleStart?: Timestamp | Date | null;
  scheduleEnd?: Timestamp | Date | null;
  status: EntityStatus;
  createdBy: string;
  createdAt: Timestamp | Date;
  updatedAt: Timestamp | Date;
}

export interface TickerLine {
  id: string;
  text: string;
  priority: number;
}

export interface TvDevice {
  id: string;
  name: string;
  branchId: string;
  deviceToken: string;
  pairingCode: string;
  status: "online" | "offline" | "maintenance";
  lastSeenAt?: Timestamp | Date | null;
  currentVideoId?: string | null;
  currentPlaylistId?: string | null;
  ratesVersion?: number;
  internetStatus: "connected" | "disconnected";
  storageStatus: "healthy" | "low" | "critical";
  appVersion?: string;
  ipAddress?: string;
  createdAt: Timestamp | Date;
  updatedAt: Timestamp | Date;
}

export interface TvHealth {
  id: string;
  deviceId: string;
  branchId: string;
  cpuUsage?: number;
  memoryUsage?: number;
  storageFreeMb?: number;
  playbackErrors?: number;
  lastHeartbeat: Timestamp | Date;
}

export interface AuditLog {
  id: string;
  action: string;
  entityType: string;
  entityId?: string;
  userId: string;
  userName: string;
  branchId?: string | null;
  metadata?: Record<string, unknown>;
  timestamp: Timestamp | Date;
}

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  branchId?: string | null;
  read: boolean;
  createdAt: Timestamp | Date;
}

export interface SystemSettings {
  id: string;
  companyName: string;
  supportEmail: string;
  defaultTimezone: string;
  emergencyRateEnabled: boolean;
  offlineCacheEnabled: boolean;
  tvHeartbeatIntervalSeconds: number;
  defaultTickerSpeed?: number;
  maintenanceMode?: boolean;
  auditRetentionDays?: number;
  /** When true, branchUser rate publishes require admin approval before going live. */
  requireApprovalForChanges?: boolean;
  updatedAt: Timestamp | Date;
}

export type PendingApprovalStatus = "pending" | "approved" | "rejected";

export interface PendingApproval {
  id: string;
  type: "rate_change";
  branchId: string;
  branchName?: string;
  entityType: "exchange_rate";
  entityId: string;
  currencyCode: string;
  proposedBuyRate: number;
  proposedSellRate: number;
  previousBuyRate: number;
  previousSellRate: number;
  status: PendingApprovalStatus;
  requestedBy: string;
  requestedByName: string;
  reviewedBy?: string | null;
  reviewedByName?: string | null;
  reviewedAt?: Timestamp | Date | null;
  rejectReason?: string | null;
  createdAt: Timestamp | Date;
  updatedAt: Timestamp | Date;
}

export interface ScheduledContent {
  id: string;
  contentType: "video" | "playlist" | "rate" | "ticker" | "campaign";
  branchId?: string | null;
  contentId: string;
  startAt: Timestamp | Date;
  endAt: Timestamp | Date;
  status: EntityStatus;
  createdBy: string;
  createdAt: Timestamp | Date;
}

export interface DashboardStats {
  totalBranches: number;
  activeTvs: number;
  offlineTvs: number;
  totalCurrencies: number;
  pendingRateApprovals: number;
  recentAuditEvents: number;
}


