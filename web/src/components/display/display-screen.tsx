"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { subscribeBranch } from "@/lib/services/branch-service";
import { subscribeExchangeRates } from "@/lib/services/exchange-rate-service";
import { subscribeTransferRates } from "@/lib/services/transfer-rate-service";
import { subscribeImageAdverts } from "@/lib/services/image-advert-service";
import { subscribeTickers } from "@/lib/services/ticker-service";
import { resolveVideoPlaybackUrl, subscribeVideos, isChunkedVideo, loadChunkedVideoBlobUrl } from "@/lib/services/video-service";
import { getCachedVideoUrl, cacheVideoBlob } from "@/lib/tv/offline-cache";
import { DEFAULT_BRANCH_SETTINGS, logoFontCss, messageFontCss } from "@/lib/constants";
import { UNIMONI_DEFAULT_TICKER } from "@/lib/unimoni-signage";
import { UnimoniPromoPanel } from "@/components/display/unimoni-promo-panel";
import {
  AnnouncementBanner,
  MessageAreaAnnouncement,
  useAnnouncementCycle,
} from "@/components/display/announcement-banner";
import { UnimoniRatesPanel } from "@/components/display/unimoni-rates-panel";
import { BreakingNewsTicker } from "@/components/display/breaking-news-ticker";
import type { Branch, ExchangeRate, ImageAdvert, TickerMessage, TransferRate, VideoAsset } from "@/lib/types";

interface DisplayScreenProps {
  branchId?: string;
}

interface TimedRatesPanelProps {
  rates: ExchangeRate[];
  displaySeconds: number;
  showBuyRate: boolean;
  showSellRate: boolean;
  showTransferCard: boolean;
  showForexCard: boolean;
  transferRates: TransferRate[];
  transferLocalLabel: string;
  scale: number;
  currencyScale: number;
  valueScale: number;
  widthPercent: number;
  headerLogoUrl: string | null;
  headerLogoUrl2: string | null;
  headerLogoDisplay: "single" | "both";
  promoLogoMode: "keep" | "hide" | "second";
  replaceDefaultLogo: boolean;
  headerLogoRotationEnabled: boolean;
  headerLogoRotationIntervalSeconds: number;
  rateCardNote: string | null;
  rateNotePlacement: "first" | "all";
  fontCss: string;
  sheetIntervalSeconds: number;
  promoImageUrl: string | null;
  promoMedia: Array<{ type: "image" | "video"; url: string }>;
  promoTextTop: string | null;
  promoText: string | null;
  promoDurationSeconds: number;
  rateCardOrder: Array<"forex" | "transfer" | "promo">;
  videoSoundOn: boolean;
}

function TimedRatesPanel({
  rates,
  displaySeconds,
  showBuyRate,
  showSellRate,
  showTransferCard,
  showForexCard,
  transferRates,
  transferLocalLabel,
  scale,
  currencyScale,
  valueScale,
  widthPercent,
  headerLogoUrl,
  headerLogoUrl2,
  headerLogoDisplay,
  promoLogoMode,
  replaceDefaultLogo,
  headerLogoRotationEnabled,
  headerLogoRotationIntervalSeconds,
  rateCardNote,
  rateNotePlacement,
  fontCss,
  sheetIntervalSeconds,
  promoImageUrl,
  promoMedia,
  promoTextTop,
  promoText,
  promoDurationSeconds,
  rateCardOrder,
  videoSoundOn,
}: TimedRatesPanelProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (displaySeconds <= 0) return;
    const timer = window.setTimeout(() => setVisible(false), displaySeconds * 1000);
    return () => window.clearTimeout(timer);
  }, [displaySeconds]);

  if (displaySeconds > 0 && !visible) return null;

  // Return the panel directly — it already carries its own width. Wrapping it in
  // a flex-1 div made it render at 35% of 35% (~12% of the screen) with a black
  // gap on desktop/TV.
  return (
    <UnimoniRatesPanel
      rates={rates}
      showBuyRate={showBuyRate}
      showSellRate={showSellRate}
      showTransferCard={showTransferCard}
      showForexCard={showForexCard}
      transferRates={transferRates}
      transferLocalLabel={transferLocalLabel}
      scale={scale}
      currencyScale={currencyScale}
      valueScale={valueScale}
      widthPercent={widthPercent}
      headerLogoUrl={headerLogoUrl}
      headerLogoUrl2={headerLogoUrl2}
      headerLogoDisplay={headerLogoDisplay}
      promoLogoMode={promoLogoMode}
      replaceDefaultLogo={replaceDefaultLogo}
      headerLogoRotationEnabled={headerLogoRotationEnabled}
      headerLogoRotationIntervalSeconds={headerLogoRotationIntervalSeconds}
      rateCardNote={rateCardNote}
      rateNotePlacement={rateNotePlacement}
      fontCss={fontCss}
      sheetIntervalSeconds={sheetIntervalSeconds}
      promoImageUrl={promoImageUrl}
      promoMedia={promoMedia}
      promoTextTop={promoTextTop}
      promoText={promoText}
      promoDurationSeconds={promoDurationSeconds}
      rateCardOrder={rateCardOrder}
      videoSoundOn={videoSoundOn}
    />
  );
}

export function DisplayScreen({ branchId }: DisplayScreenProps) {
  const [branch, setBranch] = useState<Branch | null>(null);
  const [rates, setRates] = useState<ExchangeRate[]>([]);
  const [transferRates, setTransferRates] = useState<TransferRate[]>([]);
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
  // Adaptive promo sizing: measure the live main-area box and the current media
  // aspect so "auto" fit can resize the promo area to the video/image shape.
  const mainAreaRef = useRef<HTMLDivElement>(null);
  const [mediaAspect, setMediaAspect] = useState<number | null>(null);
  const [mainDims, setMainDims] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const el = mainAreaRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const update = () => setMainDims({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const branchSettings = branch?.settings ?? DEFAULT_BRANCH_SETTINGS;
  const rateCardPosition = branchSettings.rateCardPosition ?? "right";
  const rateCardDisplaySeconds = branchSettings.rateCardDisplaySeconds ?? 0;

  // Independently resizable areas (each editable in Settings → Display sizing).
  const videoWidthPercent = Math.max(40, Math.min(75, branchSettings.videoWidthPercent ?? 72));
  const videoFit = branchSettings.videoFit ?? "stretch";

  // "auto" fit: resize the promo area to the media's shape so the WHOLE media
  // fills it with no crop and no bars. The rate card takes the rest. Clamped so
  // the rate card always keeps at least 25% (readable rates) and at most 55%.
  const adaptivePromoPercent = useMemo(() => {
    if (videoFit !== "auto" || !mediaAspect || !mainDims || mainDims.w <= 0 || mainDims.h <= 0) {
      return null;
    }
    const idealPx = mainDims.h * mediaAspect;
    return Math.max(45, Math.min(75, (idealPx / mainDims.w) * 100));
  }, [videoFit, mediaAspect, mainDims]);

  const effectivePromoWidth = adaptivePromoPercent ?? videoWidthPercent;
  const rateWidthPercent = 100 - effectivePromoWidth;
  const rateCardScale = branchSettings.rateCardScale ?? 1;
  const rateCurrencyScale = branchSettings.rateCurrencyScale ?? 1;
  const rateValueScale = branchSettings.rateValueScale ?? 1;
  const tickerScale = branchSettings.tickerScale ?? 1;
  const logoScale = branchSettings.logoScale ?? 1;
  // Transfer is its OWN rotating card now (centralized head-office rates), a
  // different feature from the OLD remittance column. Default it ON when the
  // branch hasn't explicitly chosen — otherwise a stale `showRemittanceScreen:
  // false` (set for the old column) silently hides the transfer card even after
  // an admin uploads transfer rates. Only an explicit showTransferCard === false
  // turns it off now.
  const showTransferCard = branchSettings.showTransferCard ?? true;
  const showForexCard = branchSettings.showForexCard ?? true;
  const transferLocalLabel = branchSettings.transferLocalLabel?.trim() || "UGX";
  const tickerLogoAnimation = branchSettings.tickerLogoAnimation ?? "spin";
  const headerLogoUrl = branchSettings.headerLogoUrl?.trim() || null;
  const headerLogoUrl2 = branchSettings.headerLogoUrl2?.trim() || null;
  const headerLogoDisplay = (branchSettings.headerLogoDisplay ?? "single") as "single" | "both";
  // Promo slides always hide the rate-card header unless the admin explicitly
  // chose "second" — legacy Firestore "keep" values are treated as hide.
  const promoLogoMode = (branchSettings.promoLogoMode === "second" ? "second" : "hide") as
    | "keep"
    | "hide"
    | "second";
  const replaceDefaultLogo = branchSettings.replaceDefaultLogo === true;
  const headerLogoRotationEnabled = branchSettings.headerLogoRotationEnabled === true;
  const headerLogoRotationIntervalSeconds = branchSettings.headerLogoRotationIntervalSeconds ?? 10;
  const videoSoundOn = branchSettings.videoSoundOn === true;
  const scrollingLogos = (branchSettings.scrollingLogos ?? []).filter(Boolean);

  // Browsers block UNMUTED autoplay until the page gets a user gesture. When the
  // branch wants sound, unmute every video on the first tap/click/key or when
  // entering fullscreen, so audio kicks in as soon as the screen is touched.
  useEffect(() => {
    if (!videoSoundOn) return;
    const unmuteAll = () => {
      document.querySelectorAll("video").forEach((v) => {
        // Leave the blurred backdrop copies muted (they're aria-hidden).
        if (v.getAttribute("aria-hidden") === "true") return;
        v.muted = false;
        void v.play().catch(() => {});
      });
    };
    window.addEventListener("pointerdown", unmuteAll);
    window.addEventListener("keydown", unmuteAll);
    document.addEventListener("fullscreenchange", unmuteAll);
    return () => {
      window.removeEventListener("pointerdown", unmuteAll);
      window.removeEventListener("keydown", unmuteAll);
      document.removeEventListener("fullscreenchange", unmuteAll);
    };
  }, [videoSoundOn]);
  const rateCardNote = branchSettings.rateCardNote?.trim() || null;
  const rateNotePlacement = (branchSettings.rateNotePlacement ?? "first") as "first" | "all";
  // ONE font for the whole screen. When set, it overrides every element's font
  // below (rate card, announcement, ticker message, ticker logo).
  const masterFont = branchSettings.displayFont?.trim() || null;
  const rateCardFontCss = messageFontCss(masterFont || branchSettings.rateCardFont);
  const announcementText = branchSettings.announcementText?.trim() || null;
  const announcementImageUrl = branchSettings.announcementImageUrl?.trim() || null;
  const announcementVideoUrl = branchSettings.announcementVideoUrl?.trim() || null;
  const announcementStyle = (branchSettings.announcementStyle ?? "lower-third") as
    | "popup"
    | "fullscreen"
    | "band"
    | "video-top"
    | "rate-card"
    | "lower-third";
  const announcementPosition = (branchSettings.announcementPosition ?? "bottom") as
    | "top"
    | "bottom";
  const announcementAnimation = (branchSettings.announcementAnimation ?? "slide") as
    | "slide"
    | "fade"
    | "zoom"
    | "flip";
  const announcementSeconds = branchSettings.announcementSeconds ?? 5;
  const announcementRepeatMinutes = branchSettings.announcementRepeatMinutes ?? 3;
  // A per-announcement font WINS over the master font when the admin picks one,
  // so the announcement can read in a different typeface than the rest of the
  // screen; otherwise it follows the whole-screen display font.
  const announcementFontCss = messageFontCss(branchSettings.announcementFont || masterFont);
  const announcementColorStyle = (branchSettings.announcementColorStyle ?? "white") as
    | "white"
    | "logo"
    | "gold"
    | "navy";
  // "times" mode plays a fixed number of times then stops; "repeat" (0) loops.
  const announcementMaxTimes =
    branchSettings.announcementPlayMode === "times"
      ? Math.max(1, branchSettings.announcementPlayTimes ?? 1)
      : 0;
  // Master on/off — off hides the announcement without deleting its content.
  const announcementOn = branchSettings.announcementEnabled !== false;
  const hasAnnouncement =
    announcementOn &&
    Boolean(announcementText || announcementImageUrl || announcementVideoUrl);
  // "band"=bottom message strip, "video-top"=strip at the top of the video —
  // both animate in for the visible window then hand the area back. The hook
  // runs unconditionally (Rules of Hooks); the overlay stays mounted so its exit
  // animation can play — `bandCycleVisible` drives it.
  const isStripStyle = announcementStyle === "band" || announcementStyle === "video-top";
  const bandCycleVisible = useAnnouncementCycle(
    hasAnnouncement && isStripStyle,
    announcementSeconds,
    announcementRepeatMinutes,
    announcementMaxTimes,
  );
  const sheetIntervalSeconds = branchSettings.rateSheetIntervalSeconds ?? 5;
  const rateCardOrder = (branchSettings.rateCardOrder && branchSettings.rateCardOrder.length > 0
    ? branchSettings.rateCardOrder
    : ["forex", "transfer", "promo"]) as Array<"forex" | "transfer" | "promo">;
  const ratePromoImageUrl = branchSettings.ratePromoImageUrl?.trim() || null;
  const ratePromoMedia = (branchSettings.ratePromoMedia ?? []).filter((m) => m?.url?.trim());
  const ratePromoText = branchSettings.ratePromoText?.trim() || null;
  const ratePromoTextTop = branchSettings.ratePromoTextTop?.trim() || null;
  const ratePromoDurationSeconds =
    branchSettings.ratePromoDurationSeconds ?? sheetIntervalSeconds;

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
    // Centralized head-office transfer rates — global, identical on every branch.
    const unsubTransfer = subscribeTransferRates(setTransferRates);
    const unsubTickers = subscribeTickers(scopedBranchId, setTickers);
    const unsubVideos = subscribeVideos(scopedBranchId, setVideos);
    const unsubImages = subscribeImageAdverts(scopedBranchId, setImages);

    return () => {
      unsubBranch();
      unsubRates();
      unsubTransfer();
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
    branch?.logoUrl ||
    branchSettings.tickerLogoUrl ||
    activeTicker?.logoUrl ||
    (replaceDefaultLogo && headerLogoUrl) ||
    null;
  const tickerLogoText = activeTicker?.logoText || branchSettings.tickerLogoText || null;
  const tickerLogoFontCss = logoFontCss(
    masterFont || activeTicker?.logoFont || branchSettings.tickerLogoFont,
  );
  const tickerMessageFontCss = messageFontCss(
    masterFont || activeTicker?.messageFont || branchSettings.tickerMessageFont,
  );
  // Gold headline box follows the whole-screen master font (one place controls it).
  const tickerHeadlineFontCss = messageFontCss(masterFont || branchSettings.tickerMessageFont);
  // The gold "breaking" headline tab is its OWN text, fully independent from the
  // scrolling ticker message (edited separately in Settings → "Yellow headline
  // box text"). It never mirrors the scrolling message: when blank it falls back
  // only to the branch name / default welcome, so admins can set one message in
  // the yellow box and a different one in the scrolling ticker.
  const showTickerHeadline = branchSettings.showTickerHeadline !== false;
  const customHeadline = branchSettings.tickerHeadline?.trim();
  const tickerHeadline = !showTickerHeadline
    ? "" // empty string overrides the component default → tab not rendered
    : customHeadline
      ? customHeadline.toUpperCase()
      : branch?.name?.toUpperCase() || UNIMONI_DEFAULT_TICKER;
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
      fit={videoFit}
      widthPercent={effectivePromoWidth}
      soundOn={videoSoundOn}
      overlayLogoUrl={headerLogoUrl}
      contactLine={branch?.phone?.trim() || null}
      onMediaAspectChange={setMediaAspect}
      onVideoLoaded={() => {
        setVideoLoaded(true);
        setErroredVideoId("");
      }}
      onVideoError={() => {
        setVideoLoaded(false);
        setErroredVideoId(activeVideoId);
      }}
      onVideoEnded={handleVideoEnded}
    >
      {/* Admin-controlled announcement over the video area (pop-up / full screen).
          band / video-top render in the message strip, rate-card over the rate
          panel (both below, outside the promo panel). */}
      {announcementOn &&
      (announcementStyle === "popup" ||
        announcementStyle === "fullscreen" ||
        announcementStyle === "lower-third") ? (
        <AnnouncementBanner
          text={announcementText}
          imageUrl={announcementImageUrl}
          videoUrl={announcementVideoUrl}
          displayStyle={announcementStyle}
          visibleSeconds={announcementSeconds}
          repeatMinutes={announcementRepeatMinutes}
          maxTimes={announcementMaxTimes}
          fontCss={announcementFontCss}
          colorStyle={announcementColorStyle}
          animation={announcementAnimation}
          anchor={announcementPosition}
        />
      ) : null}
    </UnimoniPromoPanel>
  );

  const ratesPanel = (
    <TimedRatesPanel
      key={ratesCycleKey}
      rates={rates}
      displaySeconds={rateCardDisplaySeconds}
      showBuyRate={branchSettings.showBuyRate}
      showSellRate={branchSettings.showSellRate}
      showTransferCard={showTransferCard}
      showForexCard={showForexCard}
      transferRates={transferRates}
      transferLocalLabel={transferLocalLabel}
      scale={rateCardScale}
      currencyScale={rateCurrencyScale}
      valueScale={rateValueScale}
      widthPercent={rateWidthPercent}
      headerLogoUrl={headerLogoUrl}
      headerLogoUrl2={headerLogoUrl2}
      headerLogoDisplay={headerLogoDisplay}
      promoLogoMode={promoLogoMode}
      replaceDefaultLogo={replaceDefaultLogo}
      headerLogoRotationEnabled={headerLogoRotationEnabled}
      headerLogoRotationIntervalSeconds={headerLogoRotationIntervalSeconds}
      rateCardNote={rateCardNote}
      rateNotePlacement={rateNotePlacement}
      fontCss={rateCardFontCss}
      sheetIntervalSeconds={sheetIntervalSeconds}
      promoImageUrl={ratePromoImageUrl}
      promoMedia={ratePromoMedia}
      promoTextTop={ratePromoTextTop}
      promoText={ratePromoText}
      promoDurationSeconds={ratePromoDurationSeconds}
      rateCardOrder={rateCardOrder}
      videoSoundOn={videoSoundOn}
    />
  );

  // Always the classic TV layout: video/promo area + fixed rate table.
  // With no video, the promo panel shows the branded placeholder — the
  // signage format never changes shape on the TV.

  return (
    <div
      className={`relative flex h-screen w-screen flex-col overflow-hidden bg-black text-white select-none ${
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
        ref={mainAreaRef}
        // A TV is landscape: ALWAYS lay the video + rate card side-by-side when the
        // screen is wider than tall, regardless of pixel width (many Android TVs
        // report a narrow logical width and were falling into the phone "stacked"
        // layout). Portrait phones still stack (handled in the style block below).
        className={`display-main-area flex h-full min-h-0 flex-1 flex-col items-stretch ${
          rateCardPosition === "left" ? "landscape:flex-row-reverse" : "landscape:flex-row"
        }`}
      >
        {promoPanel}
        {ratesPanel}
      </div>

      <BreakingNewsTicker
        messages={tickerMessages}
        logoUrl={tickerLogoUrl}
        logoText={tickerLogoText}
        logoFontCss={tickerLogoFontCss}
        messageFontCss={tickerMessageFontCss}
        scrollSpeedSeconds={tickerSpeed}
        fontColor={tickerFontColor}
        fontSize={tickerFontSize}
        paused={tickerPaused}
        headline={tickerHeadline}
        heightScale={tickerScale}
        logoScale={logoScale}
        logoAnimation={tickerLogoAnimation}
        scrollingLogos={scrollingLogos}
        headlineMaxWidthPercent={effectivePromoWidth}
        headlineFontCss={tickerHeadlineFontCss}
      />

      {/* Animated announcement strip: "band" takes over the bottom message area,
          "video-top" a strip at the top of the video. Then it animates away and
          the area returns to normal. */}
      {isStripStyle && announcementOn ? (
        <MessageAreaAnnouncement
          visible={bandCycleVisible}
          text={announcementText}
          imageUrl={announcementImageUrl}
          videoUrl={announcementVideoUrl}
          animation={announcementAnimation}
          heightScale={tickerScale}
          anchor={announcementStyle === "video-top" ? "top" : "bottom"}
          fontCss={announcementFontCss}
          colorStyle={announcementColorStyle}
        />
      ) : null}

      {/* "rate-card" placement: a pop-up card over the rate-card panel. */}
      {announcementStyle === "rate-card" && announcementOn ? (
        <div
          className="pointer-events-none absolute top-0 z-40 h-full"
          style={{
            width: `${rateWidthPercent}%`,
            ...(rateCardPosition === "left" ? { left: 0 } : { right: 0 }),
          }}
        >
          <AnnouncementBanner
            text={announcementText}
            imageUrl={announcementImageUrl}
            videoUrl={announcementVideoUrl}
            displayStyle="popup"
            visibleSeconds={announcementSeconds}
            repeatMinutes={announcementRepeatMinutes}
            maxTimes={announcementMaxTimes}
            fontCss={announcementFontCss}
            colorStyle={announcementColorStyle}
            animation={announcementAnimation}
          />
        </div>
      ) : null}

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
        /* Stack vertically ONLY in portrait (phones) — a landscape TV always keeps
           the side-by-side layout, even at a narrow logical width. */
        @media (orientation: portrait) {
          .display-main-area .display-promo-panel,
          .display-main-area .display-rates-panel {
            width: 100% !important;
          }
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
