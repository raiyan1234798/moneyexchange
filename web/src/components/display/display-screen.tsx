"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { subscribeBranch } from "@/lib/services/branch-service";
import { subscribeExchangeRates } from "@/lib/services/exchange-rate-service";
import { subscribeImageAdverts } from "@/lib/services/image-advert-service";
import { subscribeTickers } from "@/lib/services/ticker-service";
import { resolveVideoPlaybackUrl, subscribeVideos, isChunkedVideo, loadChunkedVideoBlobUrl } from "@/lib/services/video-service";
import { getCachedVideoUrl, cacheVideoBlob } from "@/lib/tv/offline-cache";
import { DEFAULT_BRANCH_SETTINGS } from "@/lib/constants";
import { UNIMONI_DEFAULT_TICKER } from "@/lib/unimoni-signage";
import { UnimoniPromoPanel } from "@/components/display/unimoni-promo-panel";
import { UnimoniRatesPanel } from "@/components/display/unimoni-rates-panel";
import { BreakingNewsTicker } from "@/components/display/breaking-news-ticker";
import type { Branch, ExchangeRate, ImageAdvert, TickerMessage, VideoAsset } from "@/lib/types";

interface DisplayScreenProps {
  branchId?: string;
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

  // Return the panel directly — it already carries its own lg:w-[35%] flex-none
  // width. Wrapping it in a flex-1 div made it render at 35% of 35% (~12% of the
  // screen) with a black gap on desktop/TV.
  return <UnimoniRatesPanel rates={rates} showBuyRate={showBuyRate} showSellRate={showSellRate} />;
}

export function DisplayScreen({ branchId }: DisplayScreenProps) {
  const [branch, setBranch] = useState<Branch | null>(null);
  const [rates, setRates] = useState<ExchangeRate[]>([]);
  const [tickers, setTickers] = useState<TickerMessage[]>([]);
  const [videos, setVideos] = useState<VideoAsset[]>([]);
  const [images, setImages] = useState<ImageAdvert[]>([]);
  const [videoIndex, setVideoIndex] = useState(0);
  const [imageIndex, setImageIndex] = useState(0);
  const ratesCycleKey = rates.map((r) => `${r.id}:${r.version}`).join("|");
  const [cachedStorageUrl, setCachedStorageUrl] = useState<string | null>(null);
  const [chunkedVideoUrl, setChunkedVideoUrl] = useState<string | null>(null);
  const prevHeadVideoIdRef = useRef("");
  const [videoLoaded, setVideoLoaded] = useState(false);
  const [erroredVideoId, setErroredVideoId] = useState("");
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
    if (!branchId) return;

    // BRANCH ISOLATION: every subscription is scoped to this branchId only.
    // Videos, rates, and tickers from other branches never appear here unless
    // an admin explicitly used "Apply to all branches" (creates per-branch copies).
    const scopedBranchId = branchId;
    const unsubBranch = subscribeBranch(scopedBranchId, setBranch);
    const unsubRates = subscribeExchangeRates(scopedBranchId, setRates);
    const unsubTickers = subscribeTickers(scopedBranchId, setTickers);
    const unsubVideos = subscribeVideos(scopedBranchId, setVideos);
    const unsubImages = subscribeImageAdverts(scopedBranchId, setImages);

    return () => {
      unsubBranch();
      unsubRates();
      unsubTickers();
      unsubVideos();
      unsubImages();
    };
  }, [branchId]);

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
    setErroredVideoId("");
    setCachedStorageUrl(null);
    setChunkedVideoUrl(null);
  }, [headVideoId]);

  const activeVideo = activeVideos[videoIndex % Math.max(activeVideos.length, 1)];
  const activeVideoId = activeVideo?.id ?? "";

  // Self-healing kiosk: the error is scoped to the video id that failed, so
  // rotating to another video (or replacing the video) clears it automatically
  // — a transient error can never latch the whole display forever.
  const videoError = activeVideoId !== "" && erroredVideoId === activeVideoId;

  // Retry the SAME video on a 60s backoff (e.g. after a network blip).
  useEffect(() => {
    if (!videoError) return;
    const timer = window.setTimeout(() => {
      setErroredVideoId("");
      setVideoLoaded(false);
    }, 60_000);
    return () => window.clearTimeout(timer);
  }, [videoError]);
  const activeImage = activeImages[imageIndex % Math.max(activeImages.length, 1)];
  const playbackUrl = useMemo(() => {
    if (!activeVideo) return "";
    return resolveVideoPlaybackUrl(activeVideo);
  }, [activeVideo]);

  const branchVideoUrl = useMemo(() => {
    if (!activeVideo) return null;
    if (isChunkedVideo(activeVideo)) return chunkedVideoUrl || null;
    if (activeVideo.sourceType === "external") return playbackUrl || null;
    return cachedStorageUrl ?? playbackUrl ?? null;
  }, [activeVideo, chunkedVideoUrl, cachedStorageUrl, playbackUrl]);

  const branchImageUrl = useMemo(() => {
    if (!activeImage) return null;
    if (activeVideos.length > 0 && videoLoaded && !videoError) return null;
    return activeImage.downloadUrl;
  }, [activeImage, activeVideos.length, videoError, videoLoaded]);

  const activeTicker = tickers[0];
  const tickerMessages = useMemo(() => {
    const lines = (activeTicker?.messages ?? [])
      .map((line) => line.text?.trim())
      .filter((text): text is string => Boolean(text));
    if (lines.length > 0) return lines;
    if (branch?.settings?.slogan) return [branch.settings.slogan.toUpperCase()];
    return [UNIMONI_DEFAULT_TICKER];
  }, [activeTicker, branch]);

  const tickerSpeed = activeTicker?.scrollSpeed || branchSettings.tickerSpeed || 35;
  const tickerPaused = activeTicker?.paused === true;
  const tickerLogoUrl =
    branch?.logoUrl || branchSettings.tickerLogoUrl || activeTicker?.logoUrl || null;
  const tickerHeadline =
    activeTicker?.messages?.[0]?.text?.slice(0, 24).toUpperCase() ||
    branch?.name?.toUpperCase() ||
    "BIG BREAKING";
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
        if (alive) setErroredVideoId(activeVideo.id);
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
      loopVideo={activeVideos.length <= 1}
      onVideoLoaded={() => {
        setVideoLoaded(true);
        setErroredVideoId("");
      }}
      onVideoError={() => {
        setVideoLoaded(false);
        setErroredVideoId(activeVideoId);
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

  // Always the classic TV layout: video/promo area + fixed rate table.
  // With no video, the promo panel shows the branded placeholder — the
  // signage format never changes shape on the TV.

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
          className="absolute left-3 top-3 z-50 flex items-center gap-2 rounded-lg border border-white/20 bg-[#0B1F3A]/90 px-4 py-2.5 text-sm font-medium text-white shadow-lg backdrop-blur-sm transition-colors hover:bg-[#1A4D8F]/95"
        >
          <Maximize2 className="h-3.5 w-3.5" />
          Fullscreen
        </button>
      ) : (
        <button
          type="button"
          onClick={() => void toggleFullscreen()}
          aria-label="Exit fullscreen"
          className="absolute left-3 top-3 z-50 rounded-lg bg-black/40 p-2 text-zinc-500 opacity-0 transition-opacity hover:text-white focus:opacity-100"
        >
          <Minimize2 className="h-4 w-4" />
        </button>
      )}

      <div
        className={`display-main-area flex h-full min-h-0 flex-1 flex-col lg:items-stretch ${
          rateCardPosition === "left" ? "lg:flex-row-reverse" : "lg:flex-row"
        }`}
      >
        {promoPanel}
        {ratesPanel}
      </div>

      <BreakingNewsTicker
        messages={tickerMessages}
        logoUrl={tickerLogoUrl}
        scrollSpeedSeconds={tickerSpeed}
        fontColor={tickerFontColor}
        fontSize={tickerFontSize}
        paused={tickerPaused}
        headline={tickerHeadline}
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
        @media (max-width: 1023px) {
          .display-main-area .display-promo-panel {
            flex: 1 1 0%;
            min-height: clamp(10rem, 34vh, 24rem);
          }
          .display-main-area .display-rates-panel {
            flex: 1 1 0%;
            min-height: clamp(12rem, 36vh, 18rem);
          }
        }
      `}</style>
    </div>
  );
}
