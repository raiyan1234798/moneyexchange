"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { subscribeBranch } from "@/lib/services/branch-service";
import { subscribeExchangeRates } from "@/lib/services/exchange-rate-service";
import { subscribeImageAdverts } from "@/lib/services/image-advert-service";
import { subscribeTickers } from "@/lib/services/ticker-service";
import { resolveVideoPlaybackUrl, subscribeVideos, isChunkedVideo, loadChunkedVideoBlobUrl } from "@/lib/services/video-service";
import { getCachedVideoUrl, cacheVideoBlob } from "@/lib/tv/offline-cache";
import {
  DEMO_VIDEO_URL,
  getDemoBranch,
  getDemoRates,
  getDemoTickers,
} from "@/lib/demo-content";
import { DEFAULT_BRANCH_SETTINGS } from "@/lib/constants";
import { UNIMONI_DEFAULT_TICKER } from "@/lib/unimoni-signage";
import { UnimoniPromoPanel } from "@/components/display/unimoni-promo-panel";
import { UnimoniRatesPanel } from "@/components/display/unimoni-rates-panel";
import { BreakingNewsTicker } from "@/components/display/breaking-news-ticker";
import type { Branch, ExchangeRate, ImageAdvert, TickerMessage, VideoAsset } from "@/lib/types";

interface DisplayScreenProps {
  branchId?: string;
  demoMode?: boolean;
}

interface TimedRatesPanelProps {
  rates: ExchangeRate[];
  displaySeconds: number;
  showBuyRate: boolean;
  showSellRate: boolean;
}

function TimedRatesPanel({ rates, displaySeconds, showBuyRate, showSellRate }: TimedRatesPanelProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (displaySeconds <= 0) return;
    const timer = window.setTimeout(() => setVisible(false), displaySeconds * 1000);
    return () => window.clearTimeout(timer);
  }, [displaySeconds]);

  if (displaySeconds > 0 && !visible) return null;

  return (
    <UnimoniRatesPanel rates={rates} showBuyRate={showBuyRate} showSellRate={showSellRate} />
  );
}

export function DisplayScreen({ branchId, demoMode = false }: DisplayScreenProps) {
  const [branch, setBranch] = useState<Branch | null>(demoMode ? getDemoBranch() : null);
  const [rates, setRates] = useState<ExchangeRate[]>(demoMode ? getDemoRates() : []);
  const [tickers, setTickers] = useState<TickerMessage[]>(demoMode ? getDemoTickers() : []);
  const [videos, setVideos] = useState<VideoAsset[]>([]);
  const [images, setImages] = useState<ImageAdvert[]>([]);
  const [videoIndex, setVideoIndex] = useState(0);
  const [imageIndex, setImageIndex] = useState(0);
  const ratesCycleKey = rates.map((r) => `${r.id}:${r.version}`).join("|");
  const [cachedStorageUrl, setCachedStorageUrl] = useState<string | null>(null);
  const [chunkedVideoUrl, setChunkedVideoUrl] = useState<string | null>(null);
  const prevHeadVideoIdRef = useRef("");
  const [videoLoaded, setVideoLoaded] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const branchSettings = branch?.settings ?? DEFAULT_BRANCH_SETTINGS;
  const rateCardPosition = branchSettings.rateCardPosition ?? "right";
  const rateCardDisplaySeconds = branchSettings.rateCardDisplaySeconds ?? 0;

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
      // Browser may block without user gesture
    }
  }, []);

  useEffect(() => {
    if (demoMode || !branchId) return;

    const unsubBranch = subscribeBranch(branchId, setBranch);
    const unsubRates = subscribeExchangeRates(branchId, setRates);
    const unsubTickers = subscribeTickers(branchId, setTickers);
    const unsubVideos = subscribeVideos(branchId, setVideos);
    const unsubImages = subscribeImageAdverts(branchId, setImages);

    return () => {
      unsubBranch();
      unsubRates();
      unsubTickers();
      unsubVideos();
      unsubImages();
    };
  }, [branchId, demoMode]);

  const activeVideos = useMemo(
    () => videos.filter((video) => video.status === "active"),
    [videos],
  );
  const activeImages = useMemo(
    () => images.filter((img) => img.status === "active"),
    [images],
  );
  const headVideoId = activeVideos[0]?.id ?? "";

  useEffect(() => {
    if (!headVideoId || prevHeadVideoIdRef.current === headVideoId) return;
    prevHeadVideoIdRef.current = headVideoId;
    setVideoIndex(0);
    setVideoLoaded(false);
    setVideoError(false);
    setCachedStorageUrl(null);
    setChunkedVideoUrl(null);
  }, [headVideoId]);

  const activeVideo = activeVideos[videoIndex % Math.max(activeVideos.length, 1)];
  const activeImage = activeImages[imageIndex % Math.max(activeImages.length, 1)];
  const playbackUrl = useMemo(() => {
    if (!activeVideo) return "";
    return resolveVideoPlaybackUrl(activeVideo);
  }, [activeVideo]);

  const branchVideoUrl = useMemo(() => {
    if (demoMode) return DEMO_VIDEO_URL;
    if (!activeVideo) return null;
    if (activeVideo.downloadUrl === DEMO_VIDEO_URL) return DEMO_VIDEO_URL;
    if (isChunkedVideo(activeVideo)) return chunkedVideoUrl || null;
    if (activeVideo.sourceType === "external") return playbackUrl || null;
    return cachedStorageUrl ?? playbackUrl ?? null;
  }, [activeVideo, chunkedVideoUrl, cachedStorageUrl, demoMode, playbackUrl]);

  const branchImageUrl = useMemo(() => {
    if (demoMode || !activeImage) return null;
    if (activeVideos.length > 0 && videoLoaded && !videoError) return null;
    return activeImage.downloadUrl;
  }, [activeImage, activeVideos.length, demoMode, videoError, videoLoaded]);

  const activeTicker = tickers[0];
  const tickerText = useMemo(() => {
    if (activeTicker?.messages?.length) {
      return activeTicker.messages.map((line) => line.text).join("   •   ");
    }
    if (branch?.settings?.slogan) return branch.settings.slogan.toUpperCase();
    return UNIMONI_DEFAULT_TICKER;
  }, [activeTicker, branch]);

  const tickerSpeed = activeTicker?.scrollSpeed || branchSettings.tickerSpeed || 35;
  const tickerPaused = activeTicker?.paused === true;
  const tickerLogoUrl =
    activeTicker?.logoUrl || branchSettings.tickerLogoUrl || branch?.logoUrl || null;
  const tickerFontColor = activeTicker?.fontColor || branchSettings.tickerFontColor || "#FFFFFF";
  const tickerFontSize = activeTicker?.fontSize || branchSettings.tickerFontSize;

  useEffect(() => {
    if (activeVideos.length <= 1) return;
    const timer = window.setInterval(() => {
      setVideoLoaded(false);
      setVideoIndex((prev) => (prev + 1) % activeVideos.length);
    }, 60000);
    return () => window.clearInterval(timer);
  }, [activeVideos.length]);

  useEffect(() => {
    if (activeImages.length <= 1) return;
    const durationMs = (activeImage?.displayDurationSeconds ?? 15) * 1000;
    const timer = window.setInterval(() => {
      setImageIndex((prev) => (prev + 1) % activeImages.length);
    }, durationMs);
    return () => window.clearInterval(timer);
  }, [activeImages.length, activeImage?.displayDurationSeconds]);

  useEffect(() => {
    if (!activeVideo || !playbackUrl || activeVideo.sourceType !== "storage") return;

    let alive = true;
    void getCachedVideoUrl(activeVideo.id, playbackUrl).then((url) => {
      if (alive) setCachedStorageUrl(url);
    });
    void cacheVideoBlob(activeVideo.id, playbackUrl);
    return () => {
      alive = false;
    };
  }, [activeVideo, playbackUrl]);

  useEffect(() => {
    if (!activeVideo || !isChunkedVideo(activeVideo)) return;

    let alive = true;
    let objectUrl: string | null = null;
    void loadChunkedVideoBlobUrl(activeVideo)
      .then((url) => {
        if (!alive) {
          URL.revokeObjectURL(url);
          return;
        }
        objectUrl = url;
        setChunkedVideoUrl(url);
      })
      .catch(() => {
        if (alive) setVideoError(true);
      });

    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [activeVideo]);

  const handleVideoEnded = useCallback(() => {
    if (activeVideos.length > 1) {
      setVideoLoaded(false);
      setVideoIndex((prev) => (prev + 1) % activeVideos.length);
      setCachedStorageUrl(null);
      setChunkedVideoUrl(null);
    }
  }, [activeVideos.length]);

  const promoPanel = (
    <UnimoniPromoPanel
      videoUrl={branchVideoUrl && !videoError ? branchVideoUrl : null}
      imageUrl={branchImageUrl}
      videoLoaded={videoLoaded}
      loopVideo={demoMode || activeVideos.length <= 1}
      onVideoLoaded={() => {
        setVideoLoaded(true);
        setVideoError(false);
      }}
      onVideoError={() => {
        setVideoLoaded(false);
        setVideoError(true);
      }}
      onVideoEnded={handleVideoEnded}
    />
  );

  const ratesPanel = (
    <TimedRatesPanel
      key={ratesCycleKey}
      rates={rates}
      displaySeconds={rateCardDisplaySeconds}
      showBuyRate={branchSettings.showBuyRate}
      showSellRate={branchSettings.showSellRate}
    />
  );

  return (
    <div
      className={`flex h-screen w-screen flex-col overflow-hidden bg-black text-white select-none ${
        isFullscreen ? "display-kiosk" : ""
      }`}
    >
      {!isFullscreen ? (
        <button
          type="button"
          onClick={() => void toggleFullscreen()}
          className="absolute right-3 top-3 z-50 flex items-center gap-2 rounded-lg border border-white/15 bg-black/60 px-3 py-2 text-xs font-medium text-white/80 backdrop-blur-sm transition-colors hover:bg-black/80"
        >
          <Maximize2 className="h-3.5 w-3.5" />
          Fullscreen
        </button>
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

      <div className="flex min-h-0 flex-1">
        {rateCardPosition === "left" ? (
          <>
            {ratesPanel}
            {promoPanel}
          </>
        ) : (
          <>
            {promoPanel}
            {ratesPanel}
          </>
        )}
      </div>

      <BreakingNewsTicker
        text={tickerText}
        logoUrl={tickerLogoUrl}
        scrollSpeedSeconds={tickerSpeed}
        fontColor={tickerFontColor}
        fontSize={tickerFontSize}
        paused={tickerPaused}
      />

      <style jsx global>{`
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
