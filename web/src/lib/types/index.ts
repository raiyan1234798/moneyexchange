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
  status: EntityStatus;
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
  /** @deprecated superseded by showTransferCard. */
  showRemittanceScreen?: boolean;
  /** @deprecated inline column removed — transfer is now its own card. */
  showTransferColumn?: boolean;
  /** Rotate in a SEPARATE "TRANSFER EXCHANGE RATES" card ($ + local columns). */
  showTransferCard?: boolean;
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
  /** Multiplier for the pop-out ticker logo badge size (0.6–2). Default 1. */
  logoScale?: number;
  /** Animation style for the pop-out ticker logo. Default "spin". */
  tickerLogoAnimation?: "spin" | "pulse" | "none";
  /** Custom text for the gold "breaking" headline tab above the ticker. */
  tickerHeadline?: string | null;
  /** Show the gold headline tab at all (turn off to remove it). Default true. */
  showTickerHeadline?: boolean;
  /** Custom brand logo for the rate-card header (rebrand) — overrides the unimoni logo. */
  headerLogoUrl?: string | null;
  /** Logo images that scroll right-to-left in the ticker alongside the messages. */
  scrollingLogos?: string[];
  /** A note line shown at the bottom of the FIRST rate screen only (e.g. "USD Small Bill BUY @ 3600"). */
  rateCardNote?: string | null;
  /** Seconds each rotating rate screen stays visible (forex/transfer pages). Default 5. */
  rateSheetIntervalSeconds?: number;
  /** Promotional card in the rate-card rotation: image (upload/URL). Hidden when empty. */
  ratePromoImageUrl?: string | null;
  /** Promotional card: text message (shown alone or under the image). */
  ratePromoText?: string | null;
  /** Seconds the promotional card stays visible. Defaults to rateSheetIntervalSeconds. */
  ratePromoDurationSeconds?: number;
  /** Font key for the rate card (header + table) — see MESSAGE_FONTS. */
  rateCardFont?: string | null;
  /** Drop-down announcement (admin-only): short text shown briefly over the video area. */
  announcementText?: string | null;
  /** Optional small image shown in the announcement banner (upload or any link). */
  announcementImageUrl?: string | null;
  /** Optional short video in the announcement banner (direct/Drive link or R2 upload). */
  announcementVideoUrl?: string | null;
  /** "popup" = big centered card; "fullscreen" = takes over the whole video area. */
  announcementStyle?: "popup" | "fullscreen";
  /** Seconds the announcement stays visible each time (default 5). */
  announcementSeconds?: number;
  /** Minutes between announcement repeats (default 3). */
  announcementRepeatMinutes?: number;
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
