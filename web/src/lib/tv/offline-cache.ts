const CACHE_PREFIX = "moneyexchange_tv_cache_v1";
const SESSION_KEY = "moneyexchange_tv_session_v1";

export interface TvSession {
  branchId: string;
  deviceId: string;
  deviceName?: string;
}

export interface TvCachePayload {
  branchId: string;
  deviceId: string;
  branch?: unknown;
  rates: unknown[];
  tickers: unknown[];
  playlists: unknown[];
  videos: unknown[];
  cachedAt: string;
}

function cacheKey(branchId: string, deviceId: string) {
  return `${CACHE_PREFIX}:${branchId}:${deviceId}`;
}

export function saveTvSession(session: TvSession): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function getTvSession(): TvSession | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TvSession;
  } catch {
    return null;
  }
}

export function clearTvSession(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(SESSION_KEY);
}

export function readTvCache(branchId: string, deviceId: string): TvCachePayload | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(cacheKey(branchId, deviceId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TvCachePayload;
  } catch {
    return null;
  }
}

export function writeTvCache(payload: TvCachePayload): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(cacheKey(payload.branchId, payload.deviceId), JSON.stringify(payload));
}

/** Only cache small storage uploads locally; external URLs stream directly */
export async function cacheVideoBlob(videoId: string, url: string): Promise<void> {
  if (typeof window === "undefined" || !("caches" in window)) return;
  try {
    const cache = await caches.open(`${CACHE_PREFIX}_videos`);
    await cache.add(new Request(url, { cache: "reload" }));
    localStorage.setItem(`${CACHE_PREFIX}_video_${videoId}`, url);
  } catch {
    // External URLs may block CORS caching — playback still works online
  }
}

export async function getCachedVideoUrl(videoId: string, fallbackUrl: string): Promise<string> {
  if (typeof window === "undefined") return fallbackUrl;
  const cachedPath = localStorage.getItem(`${CACHE_PREFIX}_video_${videoId}`);
  if (!cachedPath || !("caches" in window)) return fallbackUrl;
  try {
    const cache = await caches.open(`${CACHE_PREFIX}_videos`);
    const match = await cache.match(cachedPath);
    if (!match) return fallbackUrl;
    const blob = await match.blob();
    return URL.createObjectURL(blob);
  } catch {
    return fallbackUrl;
  }
}

export function isOnline(): boolean {
  if (typeof window === "undefined") return true;
  return navigator.onLine;
}
