"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Wifi, WifiOff } from "lucide-react";
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

  useEffect(() => {
    const timer = window.setInterval(() => {
      setClock(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

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

  const playbackUrl = useMemo(
    () => (activeVideo ? resolveVideoPlaybackUrl(activeVideo) : ""),
    [activeVideo],
  );

  const currentVideoUrl = resolvedVideoUrl ?? playbackUrl;

  const activeTicker = tickers[0];

  const tickerText = useMemo(() => {
    const slogan = branch?.settings?.slogan ?? "Welcome to Money Exchange";
    if (activeTicker?.messages?.length) {
      return activeTicker.messages.map((line) => line.text).join("   •   ");
    }
    return slogan;
  }, [activeTicker, branch]);

  const tickerSpeed = activeTicker?.scrollSpeed || branch?.settings?.tickerSpeed || 30;
  const tickerFontSize = activeTicker?.fontSize || branch?.settings?.tickerFontSize || 18;
  const tickerFontColor = activeTicker?.fontColor || branch?.settings?.tickerFontColor || "#fff";
  const tickerPaused = activeTicker?.paused === true;

  useEffect(() => {
    if (playlistVideos.length <= 1) return;
    const timer = window.setInterval(() => {
      setVideoIndex((prev) => (prev + 1) % playlistVideos.length);
    }, 60000);
    return () => window.clearInterval(timer);
  }, [playlistVideos.length]);

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

  const brandColor = branch?.brandingColor ?? "#10b981";

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#06060a] text-white">
      <header
        className="relative flex shrink-0 items-center justify-between gap-4 px-5 py-3 sm:px-8 sm:py-4"
        style={{
          background: `linear-gradient(180deg, ${brandColor}28 0%, ${brandColor}08 100%)`,
          borderBottom: `1px solid ${brandColor}44`,
        }}
      >
        <div className="flex min-w-0 items-center gap-3">
          {branch?.logoUrl ? (
            <Image
              src={branch.logoUrl}
              alt=""
              width={48}
              height={48}
              className="h-10 w-10 shrink-0 rounded-lg object-contain sm:h-12 sm:w-12"
              unoptimized
            />
          ) : null}
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold tracking-tight sm:text-2xl">{branch?.name ?? "Money Exchange"}</h1>
            <p className="truncate text-xs text-zinc-400 sm:text-sm">{branch?.settings?.slogan ?? branch?.city}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3 text-sm">
          {clock ? <span className="hidden font-mono tabular-nums text-zinc-400 sm:block">{clock}</span> : null}
          <span className="rounded-lg bg-black/40 px-2.5 py-1 text-xs text-zinc-300">{branch?.workingHours}</span>
          <span className="flex items-center gap-1.5 rounded-full bg-black/40 px-3 py-1.5 text-xs font-medium">
            {online ? <Wifi className="h-3.5 w-3.5 text-emerald-400" /> : <WifiOff className="h-3.5 w-3.5 text-amber-400" />}
            {online ? "Live" : "Offline"}
          </span>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <section className="relative h-[48vh] w-full shrink-0 bg-black lg:h-auto lg:w-[70%]">
          {currentVideoUrl ? (
            <video
              key={`${activeVideo?.id}-${currentVideoUrl}`}
              src={currentVideoUrl}
              className="h-full w-full object-cover"
              autoPlay
              muted
              loop={playlistVideos.length <= 1}
              playsInline
              onEnded={() => {
                if (playlistVideos.length > 1) {
                  setVideoIndex((prev) => (prev + 1) % playlistVideos.length);
                  setResolvedVideoUrl(null);
                }
              }}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-zinc-950 to-black">
              <div className="h-16 w-16 rounded-2xl border border-white/10 bg-white/5" />
              <p className="text-lg font-medium text-zinc-400">No video assigned</p>
              <p className="text-sm text-zinc-600">Upload a video in the dashboard</p>
            </div>
          )}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/60 to-transparent" />
        </section>

        <aside className="flex w-full flex-col border-t border-white/8 bg-zinc-950/80 backdrop-blur-sm lg:w-[30%] lg:border-l lg:border-t-0">
          <div className="border-b border-white/8 px-5 py-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">Live Rates</p>
            <h2 className="mt-1 text-xl font-semibold" style={{ color: brandColor }}>
              Buy / Sell
            </h2>
          </div>
          <div className="flex-1 space-y-2.5 overflow-y-auto p-3 sm:p-4">
            {rates.length === 0 ? (
              <p className="py-8 text-center text-sm text-zinc-600">No rates published for this branch</p>
            ) : (
              rates.map((rate) => (
                <div key={rate.id} className="rounded-xl border border-white/8 bg-white/[0.03] p-3.5 transition-colors hover:bg-white/[0.05]">
                  <div className="flex items-center justify-between">
                    <span className="text-base font-bold tracking-wide">{rate.currencyCode}</span>
                    <span className="text-[10px] text-zinc-600">v{rate.version}</span>
                  </div>
                  <div className="mt-2.5 grid grid-cols-2 gap-2">
                    {(branch?.settings?.showBuyRate ?? true) ? (
                      <div className="rounded-lg bg-emerald-500/10 p-2.5 ring-1 ring-emerald-500/20">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400/80">Buy</p>
                        <p className="mt-0.5 text-lg font-bold tabular-nums text-emerald-400">{rate.buyRate.toFixed(4)}</p>
                      </div>
                    ) : null}
                    {(branch?.settings?.showSellRate ?? true) ? (
                      <div className="rounded-lg bg-sky-500/10 p-2.5 ring-1 ring-sky-500/20">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-sky-400/80">Sell</p>
                        <p className="mt-0.5 text-lg font-bold tabular-nums text-sky-400">{rate.sellRate.toFixed(4)}</p>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>
      </div>

      <footer
        className="relative h-12 shrink-0 overflow-hidden sm:h-14"
        style={{ background: `linear-gradient(180deg, ${brandColor}12 0%, ${brandColor}22 100%)` }}
      >
        <div className="absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-[#06060a] to-transparent" />
        <div className="absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-[#06060a] to-transparent" />
        <div
          className="absolute inset-y-0 flex items-center whitespace-nowrap px-4 font-medium"
          style={{
            animation: tickerPaused ? "none" : `display-scroll ${tickerSpeed}s linear infinite`,
            color: tickerFontColor,
            fontSize: tickerFontSize,
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
      `}</style>
    </div>
  );
}
