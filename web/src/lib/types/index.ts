import type { Timestamp } from "firebase/firestore";

export type UserRole = "superAdmin" | "branchManager";

export type EntityStatus = "active" | "inactive" | "disabled";

export interface UserInvite {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  branchId: string;
  createdBy: string;
  createdAt: Timestamp | Date;
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

export interface BranchSettings {
  timezone: string;
  defaultLanguage: string;
  slogan: string;
  tickerSpeed: number;
  tickerFontSize: number;
  tickerFontColor: string;
  showBuyRate: boolean;
  showSellRate: boolean;
}

export type VideoSourceType = "external" | "storage";

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
  buyRate: number;
  sellRate: number;
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

export interface VideoAsset {
  id: string;
  title: string;
  description?: string;
  branchId: string;
  category?: string;
  sourceType: VideoSourceType;
  storagePath?: string | null;
  downloadUrl: string;
  mimeType: string;
  durationSeconds?: number;
  fileSizeBytes?: number;
  status: EntityStatus;
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
