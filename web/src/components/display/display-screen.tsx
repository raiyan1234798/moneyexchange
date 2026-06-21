"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Image from "next/image";
import { Maximize2, Minimize2, Wifi, WifiOff, TrendingUp, TrendingDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { enableOfflinePersistence } from "@/lib/firebase/client";
import { subscribeBranch } from "@/lib/services/branch-service";
import { subscribeExchangeRates } from "@/lib/services/exchange-rate-service";
import { subscribePlaylists } from "@/lib/services/playlist-service";
import { subscribeTickers } from "@/lib/services/ticker-service";
import { resolveVideoPlaybackUrl, subscribeVideos } from "@/lib/services/video-service";
import { getCachedVideoUrl, cacheVideoBlob } from "@/lib/tv/offline-cache";
import type { Branch, ExchangeRate, TickerMessage, VideoAsset, VideoPlaylist } from "@/lib/types";

interface DisplayScreenProps {
  branchId: string;
}

/** Map currency codes to flag emojis for display */
function getCurrencyFlag(currencyCode: string): string {
  const map: Record<string, string> = {
    USD: "🇺🇸", EUR: "🇪🇺", GBP: "🇬🇧", JPY: "🇯🇵", AED: "🇦🇪",
    SAR: "🇸🇦", KWD: "🇰🇼", BHD: "🇧🇭", QAR: "🇶🇦", OMR: "🇴🇲",
    CAD: "🇨🇦", AUD: "🇦🇺", CHF: "🇨🇭", SEK: "🇸🇪", NOK: "🇳🇴",
    DKK: "🇩🇰", NZD: "🇳🇿", SGD: "🇸🇬", HKD: "🇭🇰", CNY: "🇨🇳",
    INR: "🇮🇳", PKR: "🇵🇰", BDT: "🇧🇩", LKR: "🇱🇰", NPR: "🇳🇵",
    ZAR: "🇿🇦", RUB: "🇷🇺", TRY: "🇹🇷", EGP: "🇪🇬", THB: "🇹🇭",
    MYR: "🇲🇾", IDR: "🇮🇩", PHP: "🇵🇭", KRW: "🇰🇷", VND: "🇻🇳",
    MXN: "🇲🇽", BRL: "🇧🇷", ARS: "🇦🇷", CLP: "🇨🇱", COP: "🇨🇴",
  };
  return map[currencyCode] ?? "💱";
}

function formatDate() {
  return new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function DisplayScreen({ branchId }: DisplayScreenProps) {
  const [online, setOnline] = useState(true);
  const [branch, setBranch] = useState<Branch | null>(null);
  const [rates, setRates] = useState<ExchangeRate[]>([]);
  const [tickers, setTickers] = useState<TickerMessage[]>([]);
  const [playlists, setPlaylists] = useState<VideoPlaylist[]>([]);
  const [videos, setVideos] = useState<VideoAsset[]>([]);
  const [videoIndex, setVideoIndex] = useState(0);
  const [resolvedVideoUrl, setResolvedVideoUrl] = useState<string | null>(null);
  const [clock, setClock] = useState("");
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [videoLoaded, setVideoLoaded] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const syncFullscreen = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      // Browser may block without user gesture — F11 still works
    }
  }, []);

  // Clock
  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = new Date();
      setClock(now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
      setLastUpdated(now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  // Firebase subscriptions
  useEffect(() => {
    if (!branchId) return;
    void enableOfflinePersistence();

    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    const unsubBranch = subscribeBranch(branchId, setBranch);
    const unsubRates = subscribeExchangeRates(branchId, setRates);
    const unsubTickers = subscribeTickers(branchId, setTickers);
    const unsubPlaylists = subscribePlaylists(branchId, setPlaylists);
    const unsubVideos = subscribeVideos(branchId, setVideos);

    return () => {
      unsubBranch();
      unsubRates();
      unsubTickers();
      unsubPlaylists();
      unsubVideos();
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [branchId]);

  // Playlist resolution
  const playlistVideos = useMemo(() => {
    const activePlaylist = playlists[0];
    if (activePlaylist?.videoIds?.length) {
      return activePlaylist.videoIds
        .map((id) => videos.find((v) => v.id === id))
        .filter((v): v is VideoAsset => Boolean(v));
    }
    return videos;
  }, [playlists, videos]);

  const activeVideo = playlistVideos[videoIndex % Math.max(playlistVideos.length, 1)];
  const playbackUrl = useMemo(() => (activeVideo ? resolveVideoPlaybackUrl(activeVideo) : ""), [activeVideo]);
  const currentVideoUrl = resolvedVideoUrl ?? playbackUrl;

  const activeTicker = tickers[0];
  const tickerText = useMemo(() => {
    const slogan = branch?.settings?.slogan ?? "Welcome to Money Exchange — Best Rates Guaranteed";
    if (activeTicker?.messages?.length) {
      return activeTicker.messages.map((line) => line.text).join("   •   ");
    }
    return slogan;
  }, [activeTicker, branch]);

  const tickerSpeed = activeTicker?.scrollSpeed || branch?.settings?.tickerSpeed || 30;
  const tickerFontSize = activeTicker?.fontSize || branch?.settings?.tickerFontSize || 22;
  const tickerFontColor = activeTicker?.fontColor || branch?.settings?.tickerFontColor || "#FFD700";
  const tickerPaused = activeTicker?.paused === true;

  // Auto-rotate videos
  useEffect(() => {
    if (playlistVideos.length <= 1) return;
    const timer = window.setInterval(() => {
      setVideoLoaded(false);
      setVideoIndex((prev) => (prev + 1) % playlistVideos.length);
    }, 60000);
    return () => window.clearInterval(timer);
  }, [playlistVideos.length]);

  // Video caching
  useEffect(() => {
    if (!activeVideo || !playbackUrl) return;
    let alive = true;
    void getCachedVideoUrl(activeVideo.id, playbackUrl).then((url) => {
      if (alive) setResolvedVideoUrl(url);
    });
    if (online && activeVideo.sourceType === "storage") {
      void cacheVideoBlob(activeVideo.id, playbackUrl);
    }
    return () => {
      alive = false;
      setResolvedVideoUrl(null);
    };
  }, [activeVideo?.id, playbackUrl, online, activeVideo]);

  const brandColor = branch?.brandingColor ?? "#D4AF37"; // Default gold

  const handleVideoEnded = useCallback(() => {
    if (playlistVideos.length > 1) {
      setVideoLoaded(false);
      setVideoIndex((prev) => (prev + 1) % playlistVideos.length);
      setResolvedVideoUrl(null);
    }
  }, [playlistVideos.length]);

  return (
    <div
      className={`flex h-screen w-screen flex-col overflow-hidden bg-[#050505] text-white select-none ${
        isFullscreen ? "display-kiosk" : ""
      }`}
    >
      {!isFullscreen ? (
        <div className="absolute right-4 top-4 z-50 flex flex-col items-end gap-2 sm:right-6 sm:top-6">
          <button
            type="button"
            onClick={() => void toggleFullscreen()}
            className="flex items-center gap-2 rounded-xl border border-white/15 bg-black/70 px-4 py-2.5 text-sm font-medium text-white shadow-lg backdrop-blur-md transition-colors hover:bg-black/90"
          >
            <Maximize2 className="h-4 w-4" />
            Enter Fullscreen
          </button>
          <p className="rounded-lg bg-black/50 px-2.5 py-1 text-[11px] text-zinc-400 backdrop-blur-sm">
            Or press <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-zinc-300">F11</kbd>
          </p>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => void toggleFullscreen()}
          aria-label="Exit fullscreen"
          className="absolute right-3 top-3 z-50 rounded-lg bg-black/40 p-2 text-zinc-500 opacity-0 transition-opacity hover:text-white focus:opacity-100"
        >
          <Minimize2 className="h-4 w-4" />
        </button>
      )}

      {/* TOP HEADER BAR */}
      <header
        className={`relative flex shrink-0 items-center justify-between gap-4 px-6 py-3 lg:px-10 lg:py-4 ${
          isFullscreen ? "py-2 lg:py-3" : ""
        }`}
        style={{
          background: `linear-gradient(180deg, ${brandColor}18 0%, transparent 100%)`,
          borderBottom: `1px solid ${brandColor}30`,
        }}
      >
        {/* Left: Logo + Branch Info */}
        <div className="flex min-w-0 items-center gap-4">
          {branch?.logoUrl ? (
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-white/5 lg:h-14 lg:w-14">
              <Image src={branch.logoUrl} alt="" fill className="object-contain p-1" unoptimized />
            </div>
          ) : (
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-lg font-bold lg:h-14 lg:w-14"
              style={{ background: `${brandColor}20`, color: brandColor }}
            >
              {branch?.name?.charAt(0) ?? "M"}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold tracking-tight lg:text-3xl" style={{ color: "#f5f5f5" }}>
              {branch?.name ?? "Money Exchange"}
            </h1>
            <p className="truncate text-xs text-zinc-400 lg:text-sm">
              {branch?.settings?.slogan ?? branch?.city ?? "Your Trusted Exchange Partner"}
            </p>
          </div>
        </div>

        {/* Right: Date, Time, Status */}
        <div className="flex shrink-0 items-center gap-4 text-sm">
          <div className="hidden flex-col items-end lg:flex">
            <span className="text-xs text-zinc-500">{formatDate()}</span>
            <span className="font-mono text-lg font-semibold tabular-nums" style={{ color: brandColor }}>
              {clock}
            </span>
          </div>
          <div className="h-8 w-px bg-white/10 hidden lg:block" />
          <span className="rounded-lg bg-black/40 px-3 py-1.5 text-xs text-zinc-300 border border-white/5">
            {branch?.workingHours ?? "09:00 - 21:00"}
          </span>
          <span
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border"
            style={{
              background: online ? "rgba(16,185,129,0.12)" : "rgba(245,158,11,0.12)",
              borderColor: online ? "rgba(16,185,129,0.25)" : "rgba(245,158,11,0.25)",
              color: online ? "#34d399" : "#fbbf24",
            }}
          >
            {online ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
            {online ? "Live" : "Offline"}
          </span>
        </div>
      </header>

      {/* MAIN CONTENT AREA */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* VIDEO SECTION — 70% */}
        <section className="relative h-[45vh] w-full shrink-0 bg-black lg:h-auto lg:w-[70%]">
          <AnimatePresence mode="wait">
            {currentVideoUrl ? (
              <motion.video
                key={`${activeVideo?.id}-${currentVideoUrl}`}
                src={currentVideoUrl}
                className="h-full w-full object-cover"
                autoPlay
                muted
                loop={playlistVideos.length <= 1}
                playsInline
                initial={{ opacity: 0 }}
                animate={{ opacity: videoLoaded ? 1 : 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.8 }}
                onLoadedData={() => setVideoLoaded(true)}
                onEnded={handleVideoEnded}
              />
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex h-full flex-col items-center justify-center gap-4 bg-gradient-to-br from-zinc-950 to-black"
              >
                <div
                  className="flex h-20 w-20 items-center justify-center rounded-3xl text-3xl"
                  style={{ background: `${brandColor}15`, color: brandColor }}
                >
                  🎬
                </div>
                <p className="text-lg font-medium text-zinc-400">No video assigned</p>
                <p className="text-sm text-zinc-600">Upload a promotional video in the dashboard</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Bottom gradient overlay for seamless ticker transition */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/80 to-transparent" />

          {/* Video info badge */}
          {activeVideo && (
            <div className="absolute bottom-4 left-4 rounded-lg bg-black/60 px-3 py-1.5 text-xs text-zinc-300 backdrop-blur-sm border border-white/5">
              {activeVideo.title}
            </div>
          )}
        </section>

        {/* RATES SECTION — 30% */}
        <aside className="flex w-full flex-col border-t border-white/6 bg-[#0a0a0e] lg:w-[30%] lg:border-l lg:border-t-0">
          {/* Rates Header */}
          <div
            className="flex items-center justify-between border-b border-white/6 px-5 py-3 lg:px-6 lg:py-4"
            style={{ background: `linear-gradient(90deg, ${brandColor}08 0%, transparent 100%)` }}
          >
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">Live Exchange Rates</p>
              <h2 className="mt-0.5 text-xl font-bold tracking-tight" style={{ color: brandColor }}>
                We Buy / We Sell
              </h2>
            </div>
            {lastUpdated && (
              <span className="text-[10px] text-zinc-600">Updated {lastUpdated}</span>
            )}
          </div>

          {/* Rates List */}
          <div className="flex-1 space-y-2 overflow-y-auto p-3 lg:p-4">
            {rates.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <TrendingUp className="h-8 w-8 text-zinc-700" />
                <p className="mt-3 text-sm text-zinc-600">No rates published</p>
                <p className="text-xs text-zinc-700">Manager will update shortly</p>
              </div>
            ) : (
              rates.map((rate, index) => (
                <motion.div
                  key={rate.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05, duration: 0.3 }}
                  className="group rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5 transition-colors hover:border-white/[0.1] hover:bg-white/[0.04] lg:p-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="text-xl lg:text-2xl">{getCurrencyFlag(rate.currencyCode)}</span>
                      <div>
                        <span className="text-base font-bold tracking-wide lg:text-lg">{rate.currencyCode}</span>
                        <span className="ml-2 text-[10px] text-zinc-600">v{rate.version}</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2.5">
                    {(branch?.settings?.showBuyRate ?? true) && (
                      <div className="relative overflow-hidden rounded-lg bg-emerald-500/[0.08] p-2.5 ring-1 ring-emerald-500/20">
                        <div className="absolute -right-2 -top-2 opacity-10">
                          <TrendingUp className="h-10 w-10 text-emerald-400" />
                        </div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400/80">We Buy</p>
                        <p className="mt-1 text-xl font-bold tabular-nums text-emerald-400 lg:text-2xl">
                          {rate.buyRate.toFixed(4)}
                        </p>
                      </div>
                    )}
                    {(branch?.settings?.showSellRate ?? true) && (
                      <div className="relative overflow-hidden rounded-lg bg-amber-500/[0.08] p-2.5 ring-1 ring-amber-500/20">
                        <div className="absolute -right-2 -top-2 opacity-10">
                          <TrendingDown className="h-10 w-10 text-amber-400" />
                        </div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-amber-400/80">We Sell</p>
                        <p className="mt-1 text-xl font-bold tabular-nums text-amber-400 lg:text-2xl">
                          {rate.sellRate.toFixed(4)}
                        </p>
                      </div>
                    )}
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </aside>
      </div>

      {/* TICKER FOOTER */}
      <footer
        className="relative h-14 shrink-0 overflow-hidden lg:h-16"
        style={{
          background: `linear-gradient(180deg, transparent 0%, ${brandColor}10 100%)`,
          borderTop: `1px solid ${brandColor}25`,
        }}
      >
        <div className="absolute inset-y-0 left-0 z-10 w-20 bg-gradient-to-r from-[#050505] to-transparent" />
        <div className="absolute inset-y-0 right-0 z-10 w-20 bg-gradient-to-l from-[#050505] to-transparent" />

        {/* Decorative lines */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

        <div
          className="absolute inset-y-0 flex items-center whitespace-nowrap px-6 font-semibold tracking-wide"
          style={{
            animation: tickerPaused ? "none" : `display-scroll ${tickerSpeed}s linear infinite`,
            color: tickerFontColor,
            fontSize: `${tickerFontSize}px`,
            textShadow: "0 0 20px rgba(212,175,55,0.3)",
          }}
        >
          {tickerText}
        </div>
      </footer>

      <style jsx global>{`
        @keyframes display-scroll {
          0% {
            transform: translateX(100vw);
          }
          100% {
            transform: translateX(-100%);
          }
        }
        .display-kiosk:hover button[aria-label="Exit fullscreen"] {
          opacity: 0.6;
        }
        .display-kiosk {
          cursor: none;
        }
        .display-kiosk:hover {
          cursor: default;
        }
      `}</style>
    </div>
  );
}
