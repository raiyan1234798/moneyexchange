"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { subscribeBranch } from "@/lib/services/branch-service";
import { subscribeExchangeRates } from "@/lib/services/exchange-rate-service";
import { subscribeTransferRates } from "@/lib/services/transfer-rate-service";
import { subscribeImageAdverts } from "@/lib/services/image-advert-service";
import { expandMediaSequence, sortBranchMedia } from "@/lib/services/media-order-service";
import { subscribeTickers } from "@/lib/services/ticker-service";
import { resolveVideoPlaybackUrl, subscribeVideos, isChunkedVideo, loadChunkedVideoBlobUrl } from "@/lib/services/video-service";
import { subscribeCurrencyOverrides } from "@/lib/services/currency-service";
import { getCachedVideoUrl, cacheVideoBlob } from "@/lib/tv/offline-cache";
import { DEFAULT_BRANCH_SETTINGS, logoFontCss, messageFontCss } from "@/lib/constants";
import { UNIMONI_DEFAULT_TICKER } from "@/lib/unimoni-signage";
import { UnimoniPromoPanel } from "@/components/display/unimoni-promo-panel";
import {
  AnnouncementBanner,
  MessageAreaAnnouncement,
  useAnnouncementCycle,
} from "@/components/display/announcement-banner";
import { rateCardHasContent, UnimoniRatesPanel } from "@/components/display/unimoni-rates-panel";
import { BreakingNewsTicker } from "@/components/display/breaking-news-ticker";
import type { Branch, ExchangeRate, ImageAdvert, TickerMessage, TransferRate, VideoAsset } from "@/lib/types";

interface DisplayScreenProps {
  branchId?: string;
  /** When set (Settings live preview), these override Firestore branch.settings. */
  settingsOverride?: Partial<import("@/lib/types").BranchSettings> | null;
}

interface TimedRatesPanelProps {
  rates: ExchangeRate[];
  displaySeconds: number;
  showBuyRate: boolean;
  showSellRate: boolean;
  showTransferCard: boolean;
  showForexCard: boolean;
  transferRates: TransferRate[];
  hiddenTransferCodes: string[];
  transferLocalLabel: string;
  scale: number;
  currencyScale: number;
  valueScale: number;
  widthPercent: number;
  headerLogoUrl: string | null;
  headerLogoUrl2: string | null;
  headerLogoUrls: string[];
  promoSlideLogoUrl: string | null;
  promoSlideLogoScale: number;
  headerLogoScale: number;
  promoTextScale: number;
  promoTextAnimation: string | null;
  promoFontCss?: string;
  headerLogoAnimation: string;
  promoSlideLogoAnimation: string | null;
  headerLogoDisplay: "single" | "both";
  promoLogoMode: "keep" | "hide" | "second";
  replaceDefaultLogo: boolean;
  headerLogoRotationEnabled: boolean;
  headerLogoRotationIntervalSeconds: number;
  rateCardNote: string | null;
  rateCardNoteFontScale: number;
  rateNotePlacement: "first" | "all";
  rateNoteScale: number;
  rateNoteFontCss?: string;
  syncPlayback: boolean;
  hideDotsOnPromo: boolean;
  fontCss: string;
  sheetIntervalSeconds: number;
  promoImageUrl: string | null;
  promoMedia: Array<{ type: "image" | "video"; url: string }>;
  promoTextTop: string | null;
  promoText: string | null;
  promoDurationSeconds: number;
  transferDurationSeconds: number | null;
  promoMediaFit: "fill" | "cover" | "contain";
  rateCardOrder: Array<"forex" | "transfer" | "promo">;
  videoSoundOn: boolean;
  sheetTransition: string;
  promoTransition: string | null;
  promoTransitionSeconds: number;
  promoTransitionSpeed: "fast" | "normal" | "slow";
  valueTextAnimation: string | null;
  currencyTextAnimation: string | null;
  flagAnimation: string | null;
  headingAnimation: string | null;
  currencyOverrides: Record<string, { flag?: string; name?: string }> | null;
  rateCardBgColor: string | null;
  rateCurrencyColor: string | null;
  onRotationComplete?: () => void;
}

function TimedRatesPanel({
  rates,
  displaySeconds,
  showBuyRate,
  showSellRate,
  showTransferCard,
  showForexCard,
  transferRates,
  hiddenTransferCodes,
  transferLocalLabel,
  scale,
  currencyScale,
  valueScale,
  widthPercent,
  headerLogoUrl,
  headerLogoUrl2,
  headerLogoUrls,
  promoSlideLogoUrl,
  promoSlideLogoScale,
  headerLogoScale,
  promoTextScale,
  promoTextAnimation,
  promoFontCss,
  headerLogoAnimation,
  promoSlideLogoAnimation,
  headerLogoDisplay,
  promoLogoMode,
  replaceDefaultLogo,
  headerLogoRotationEnabled,
  headerLogoRotationIntervalSeconds,
  rateCardNote,
  rateCardNoteFontScale,
  rateNotePlacement,
  rateNoteScale,
  rateNoteFontCss,
  syncPlayback,
  hideDotsOnPromo,
  fontCss,
  sheetIntervalSeconds,
  promoImageUrl,
  promoMedia,
  promoTextTop,
  promoText,
  promoDurationSeconds,
  transferDurationSeconds,
  promoMediaFit,
  rateCardOrder,
  videoSoundOn,
  sheetTransition,
  promoTransition,
  promoTransitionSeconds,
  promoTransitionSpeed,
  valueTextAnimation,
  currencyTextAnimation,
  flagAnimation,
  headingAnimation,
  currencyOverrides,
  rateCardBgColor,
  rateCurrencyColor,
  onRotationComplete,
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
      hiddenTransferCodes={hiddenTransferCodes}
      transferLocalLabel={transferLocalLabel}
      scale={scale}
      currencyScale={currencyScale}
      valueScale={valueScale}
      widthPercent={widthPercent}
      headerLogoUrl={headerLogoUrl}
      headerLogoUrl2={headerLogoUrl2}
      headerLogoUrls={headerLogoUrls}
      promoSlideLogoUrl={promoSlideLogoUrl}
      promoSlideLogoScale={promoSlideLogoScale}
      headerLogoScale={headerLogoScale}
      promoTextScale={promoTextScale}
      promoTextAnimation={promoTextAnimation}
      promoFontCss={promoFontCss}
      headerLogoAnimation={headerLogoAnimation}
      promoSlideLogoAnimation={promoSlideLogoAnimation}
      headerLogoDisplay={headerLogoDisplay}
      promoLogoMode={promoLogoMode}
      replaceDefaultLogo={replaceDefaultLogo}
      headerLogoRotationEnabled={headerLogoRotationEnabled}
      headerLogoRotationIntervalSeconds={headerLogoRotationIntervalSeconds}
      rateCardNote={rateCardNote}
      rateCardNoteFontScale={rateCardNoteFontScale}
      rateNotePlacement={rateNotePlacement}
      rateNoteScale={rateNoteScale}
      rateNoteFontCss={rateNoteFontCss}
      syncPlayback={syncPlayback}
      hideDotsOnPromo={hideDotsOnPromo}
      fontCss={fontCss}
      sheetIntervalSeconds={sheetIntervalSeconds}
      promoImageUrl={promoImageUrl}
      promoMedia={promoMedia}
      promoTextTop={promoTextTop}
      promoText={promoText}
      promoDurationSeconds={promoDurationSeconds}
      transferDurationSeconds={transferDurationSeconds}
      promoMediaFit={promoMediaFit}
      rateCardOrder={rateCardOrder}
      videoSoundOn={videoSoundOn}
      sheetTransition={sheetTransition}
      promoTransition={promoTransition}
      promoTransitionSeconds={promoTransitionSeconds}
      promoTransitionSpeed={promoTransitionSpeed}
      valueTextAnimation={valueTextAnimation}
      currencyTextAnimation={currencyTextAnimation}
      rateCardBgColor={rateCardBgColor}
      rateCurrencyColor={rateCurrencyColor}
      flagAnimation={flagAnimation}
      headingAnimation={headingAnimation}
      currencyOverrides={currencyOverrides}
      onRotationComplete={onRotationComplete}
    />
  );
}

export function DisplayScreen({ branchId, settingsOverride = null }: DisplayScreenProps) {
  const [branch, setBranch] = useState<Branch | null>(null);
  const [rates, setRates] = useState<ExchangeRate[]>([]);
  const [transferRates, setTransferRates] = useState<TransferRate[]>([]);
  const [tickers, setTickers] = useState<TickerMessage[]>([]);
  const [videos, setVideos] = useState<VideoAsset[]>([]);
  // Admin look-changes for currencies (flag emoji by code) — public read.
  const [currencyOverrides, setCurrencyOverrides] = useState<Record<string, { flag?: string; name?: string }> | null>(null);
  const [images, setImages] = useState<ImageAdvert[]>([]);
  // ONE combined videos+images sequence cursor (admin-arranged play order).
  const [seqIndex, setSeqIndex] = useState(0);
  const seqLenRef = useRef(0);
  const ratesCycleKey = rates.map((r) => `${r.id}:${r.version}`).join("|");
  // Cached/assembled playback URLs are TAGGED with the video id they belong to
  // — a step change can then never serve one video with another's cached bytes,
  // and repeat/return steps of the same video reuse them without reloading.
  const [cachedStorageUrl, setCachedStorageUrl] = useState<{ id: string; url: string } | null>(null);
  const [chunkedVideoUrl, setChunkedVideoUrl] = useState<{ id: string; url: string } | null>(null);
  const chunkedObjectUrlRef = useRef<{ id: string; url: string } | null>(null);
  const prevHeadVideoIdRef = useRef("");
  const [videoLoaded, setVideoLoaded] = useState(false);
  const [erroredVideoId, setErroredVideoId] = useState("");
  // WHEN the current video error happened — a video the rotation returns to
  // after 60s gets retried instead of staying error-latched forever.
  const erroredAtRef = useRef(0);
  // Last time the playing video reported progress — the stall watchdog below.
  const videoProgressAtRef = useRef(0);
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

  const branchSettings = {
    ...DEFAULT_BRANCH_SETTINGS,
    ...(branch?.settings ?? {}),
    ...(settingsOverride ?? {}),
  };
  const rateCardPosition = branchSettings.rateCardPosition ?? "right";
  const rateCardDisplaySeconds = branchSettings.rateCardDisplaySeconds ?? 0;
  const rateCardHideSeconds = branchSettings.rateCardHideSeconds ?? 0;
  // Rate-card show/hide CYCLE: visible for rateCardDisplaySeconds, hidden for
  // rateCardHideSeconds (video fills the whole screen), repeat. hide=0 keeps
  // the legacy behaviour (hide once after the display time, or always show).
  const [rateCardVisible, setRateCardVisible] = useState(true);
  const wantHideRef = useRef(false);
  // Reset to visible whenever the cycle settings change (render-time adjust).
  const [cycleCfg, setCycleCfg] = useState({ show: rateCardDisplaySeconds, hide: rateCardHideSeconds });
  if (cycleCfg.show !== rateCardDisplaySeconds || cycleCfg.hide !== rateCardHideSeconds) {
    setCycleCfg({ show: rateCardDisplaySeconds, hide: rateCardHideSeconds });
    setRateCardVisible(true);
  }
  // The card hides only AFTER a full rotation completes (all sheets, incl. the
  // promotion slide) — the visible-timer just ARMS the hide.
  const handleRotationComplete = useCallback(() => {
    if (!wantHideRef.current) return;
    wantHideRef.current = false;
    setRateCardVisible(false);
    window.setTimeout(() => setRateCardVisible(true), Math.max(2, cycleCfg.hide) * 1000);
  }, [cycleCfg.hide]);
  useEffect(() => {
    wantHideRef.current = false;
    // show<=0 → always visible; the render-time adjust above already reset it.
    if (cycleCfg.show <= 0) return;
    if (cycleCfg.hide <= 0) {
      // Legacy one-shot: show for N seconds, then hide until settings change.
      const t = window.setTimeout(() => setRateCardVisible(false), cycleCfg.show * 1000);
      return () => window.clearTimeout(t);
    }
  }, [cycleCfg]);
  // Cycle mode: every time the card is (re)shown, arm the next hide; a card
  // with a single sheet never rotates, so a fallback hides it after 90s.
  useEffect(() => {
    if (!rateCardVisible || cycleCfg.show <= 0 || cycleCfg.hide <= 0) return;
    const arm = window.setTimeout(() => {
      wantHideRef.current = true;
    }, cycleCfg.show * 1000);
    const fallback = window.setTimeout(
      () => handleRotationComplete(),
      cycleCfg.show * 1000 + 90_000,
    );
    return () => {
      window.clearTimeout(arm);
      window.clearTimeout(fallback);
      wantHideRef.current = false;
    };
  }, [rateCardVisible, cycleCfg, handleRotationComplete]);

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
  // Primary rate-card header logo: an uploaded header logo wins, but a plain
  // "Logo URL" (branch.logoUrl) now also drives the header — previously it only
  // showed on the ticker corner badge, so pasting a Logo URL "did nothing" to
  // the big header. Falling back here makes that field behave as expected.
  const headerLogoUrl = branchSettings.headerLogoUrl?.trim() || branch?.logoUrl?.trim() || null;
  const headerLogoUrl2 = branchSettings.headerLogoUrl2?.trim() || null;
  const headerLogoUrls = Array.isArray(branchSettings.headerLogoUrls)
    ? branchSettings.headerLogoUrls.filter(
        (u): u is string => typeof u === "string" && u.trim().length > 0,
      )
    : [];
  const promoSlideLogoUrl = branchSettings.promoSlideLogoUrl?.trim() || null;
  const promoSlideLogoScale = branchSettings.promoSlideLogoScale ?? 1;
  const headerLogoScale = branchSettings.headerLogoScale ?? 1;
  const ratePromoTextScale = branchSettings.ratePromoTextScale ?? 1;
  const announcementTextScale = branchSettings.announcementTextScale ?? 1;
  const headerLogoAnimation = branchSettings.headerLogoAnimation ?? "none";
  const promoSlideLogoAnimation = branchSettings.promoSlideLogoAnimation ?? null;
  // Promo message font: its own choice, else the whole-screen / rate-card font
  // — so changing the rate-card font restyles EVERY slide, promo text included
  // (client 2026-08-01). Same cascade the rate-card note already uses.
  const ratePromoFontCss = messageFontCss(
    branchSettings.ratePromoFont || branchSettings.displayFont || branchSettings.rateCardFont,
  );
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
  // Per-logo placement: items carry their own front/end position; legacy
  // scrollingLogos follow the old whole-list position setting.
  const legacyScrollPos = branchSettings.tickerScrollLogoPosition ?? "start";
  const scrollLogoItems = [
    ...(branchSettings.scrollingLogoItems ?? []).filter((it) => it?.url?.trim()),
    ...scrollingLogos.map((url) => ({
      url,
      pos: (legacyScrollPos === "end" ? "end" : "start") as "start" | "end",
    })),
    ...(legacyScrollPos === "both"
      ? scrollingLogos.map((url) => ({ url, pos: "end" as const }))
      : []),
  ];
  // Carry each logo's per-logo stretch choice through to the ticker (not just
  // the URL) so the admin can stretch some scrolling logos and not others.
  const toLogo = (it: { url: string; stretch?: boolean }) => ({ url: it.url, stretch: it.stretch });
  const scrollingLogosStart = scrollLogoItems.filter((it) => it.pos !== "end").map(toLogo);
  const scrollingLogosEnd = scrollLogoItems.filter((it) => it.pos === "end").map(toLogo);

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
  const rateCardNoteFontScale = branchSettings.rateCardNoteFontScale ?? 1;
  const rateNotePlacement = (branchSettings.rateNotePlacement ?? "first") as "first" | "all";
  const rateNoteScale = branchSettings.rateNoteScale ?? 0.85;
  const rateNoteFontCss = messageFontCss(
    branchSettings.rateNoteFont || branchSettings.displayFont || branchSettings.rateCardFont,
  );
  const syncRateCardPlayback = branchSettings.syncRateCardPlayback === true;
  const hideDotsOnPromo = branchSettings.hideDotsOnPromo !== false;
  // ONE font for the whole screen. When set, it overrides every element's font
  // below (rate card, announcement, ticker message, ticker logo).
  // TV browsers (Android TV WebView etc.) can paint their own prev/play/next
  // overlay from the Media Session API on top of signage video. Null every
  // action handler so that overlay has nothing to show (client 2026-08-05).
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const actions = ["play","pause","stop","seekbackward","seekforward","seekto","previoustrack","nexttrack"];
    for (const a of actions) {
      try { navigator.mediaSession.setActionHandler(a as MediaSessionAction, null); } catch { /* unsupported action */ }
    }
    try { navigator.mediaSession.metadata = null; } catch { /* older WebView */ }
  }, []);

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
  const announcementRepeatMinutes =
    branchSettings.announcementRepeatSeconds != null
      ? branchSettings.announcementRepeatSeconds / 60
      : (branchSettings.announcementRepeatMinutes ?? 3);
  // A per-announcement font WINS over the master font when the admin picks one,
  // so the announcement can read in a different typeface than the rest of the
  // screen; otherwise it follows the whole-screen display font.
  const announcementFontCss = messageFontCss(branchSettings.announcementFont || masterFont);
  const announcementColorStyle = (branchSettings.announcementColorStyle ?? "white") as
    | "white"
    | "logo"
    | "gold"
    | "navy";
  const announcementTextColor = branchSettings.announcementTextColor ?? null;
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
  // Master on/off for the promotion slide: off hides it from the rotation
  // without deleting any uploaded content.
  const ratePromoEnabled = branchSettings.ratePromoEnabled !== false;
  const ratePromoImageUrl = ratePromoEnabled
    ? branchSettings.ratePromoImageUrl?.trim() || null
    : null;
  const ratePromoMedia = ratePromoEnabled
    ? (branchSettings.ratePromoMedia ?? []).filter((m) => m?.url?.trim())
    : [];
  // Promo-card video sound: its own option; unset falls back to the main
  // "Play video sound" setting so existing branches keep their behaviour.
  const ratePromoSoundOn =
    branchSettings.ratePromoSoundOn ?? (branchSettings.videoSoundOn === true);
  const ratePromoText = ratePromoEnabled
    ? branchSettings.ratePromoText?.trim() || null
    : null;
  const ratePromoTextTop = ratePromoEnabled
    ? branchSettings.ratePromoTextTop?.trim() || null
    : null;
  const ratePromoDurationSeconds =
    branchSettings.ratePromoDurationSeconds ?? sheetIntervalSeconds;

  // A branch with NOTHING to put on the rate card (no published forex rates,
  // no transfer rows, no promo slide) must not cycle a "Rates are being
  // updated" card on the TV — the video/promo area takes the whole screen
  // until rates exist. Same logic the panel itself uses to build its slides.
  const hasAnyRateContent = rateCardHasContent({
    rates,
    transferRates,
    hiddenTransferCodes: branchSettings.hiddenTransferCodes ?? [],
    showForexCard,
    showTransferCard,
    promoMedia: ratePromoMedia,
    promoImageUrl: ratePromoImageUrl,
    promoText: ratePromoText,
    promoTextTop: ratePromoTextTop,
  });
  const rateCardShown = rateCardVisible && hasAnyRateContent;
  const effectivePromoWidth = rateCardShown ? (adaptivePromoPercent ?? videoWidthPercent) : 100;
  const rateWidthPercent = 100 - effectivePromoWidth;

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
    const unsubOverrides = subscribeCurrencyOverrides(setCurrencyOverrides, () => undefined);

    return () => {
      unsubBranch();
      unsubRates();
      unsubTransfer();
      unsubTickers();
      unsubVideos();
      unsubImages();
      unsubOverrides();
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

  // The admin-arranged TV sequence: videos and images MIXED in one order
  // (Media Manager → "TV play order"), each item repeated playRepeat times.
  const mediaSequence = useMemo(
    () => expandMediaSequence(sortBranchMedia(activeVideos, activeImages)),
    [activeVideos, activeImages],
  );
  // Ref write happens in an effect (never during render — breaks lint/compiler).
  useEffect(() => {
    seqLenRef.current = mediaSequence.length;
  }, [mediaSequence.length]);
  const currentMedia = mediaSequence[seqIndex % Math.max(mediaSequence.length, 1)];

  // Advance to the next play-order step. NOTE: cached/chunked URLs are NOT
  // cleared here — repeat steps reuse the SAME video object, and clearing per
  // step would strand a chunked/cached clip with no effect re-run to reload it
  // (the loaders below key off the video identity/id, not the step).
  const advanceMedia = useCallback(() => {
    if (seqLenRef.current <= 1) return;
    setVideoLoaded(false);
    setSeqIndex((prev) => prev + 1);
  }, []);

  const headVideoId = activeVideos[0]?.id ?? "";

  useEffect(() => {
    if (!headVideoId || prevHeadVideoIdRef.current === headVideoId) return;
    prevHeadVideoIdRef.current = headVideoId;
    setSeqIndex(0);
    setVideoLoaded(false);
    setErroredVideoId("");
    setCachedStorageUrl(null);
    setChunkedVideoUrl(null);
    if (chunkedObjectUrlRef.current) {
      URL.revokeObjectURL(chunkedObjectUrlRef.current.url);
      chunkedObjectUrlRef.current = null;
    }
  }, [headVideoId]);

  const activeVideo = currentMedia?.kind === "video" ? currentMedia.video : undefined;
  const activeVideoId = activeVideo?.id ?? "";

  // Self-healing kiosk: the error is scoped to the video id that failed, so
  // rotating to another video (or replacing the video) clears it automatically
  // — a transient error can never latch the whole display forever.
  const videoError = activeVideoId !== "" && erroredVideoId === activeVideoId;

  // A failed video is skipped after 8s so the rotation keeps moving. The error
  // is remembered WITH its time: when the loop comes back to that video and the
  // error is older than 60s, it gets a fresh chance (the cleanup-based retry of
  // the old build died as soon as the rotation moved on, latching the error
  // forever). Re-armed per STEP so a repeat step of a failed video also skips.
  useEffect(() => {
    if (!videoError) return;
    const skipTimer = window.setTimeout(() => advanceMedia(), 8_000);
    return () => window.clearTimeout(skipTimer);
  }, [videoError, seqIndex, advanceMedia]);

  useEffect(() => {
    if (!videoError) return;
    if (Date.now() - erroredAtRef.current > 60_000) {
      setErroredVideoId("");
      setVideoLoaded(false);
      return;
    }
    // Single-item sequence: nothing to skip to — retry in place after 60s.
    const retryTimer = window.setTimeout(() => {
      setErroredVideoId("");
      setVideoLoaded(false);
    }, 61_000);
    return () => window.clearTimeout(retryTimer);
  }, [videoError, seqIndex]);
  const activeImage = currentMedia?.kind === "image" ? currentMedia.image : undefined;
  const playbackUrl = useMemo(() => {
    if (!activeVideo) return "";
    return resolveVideoPlaybackUrl(activeVideo);
  }, [activeVideo]);

  const branchVideoUrl = useMemo(() => {
    if (!activeVideo) return null;
    if (isChunkedVideo(activeVideo)) {
      return chunkedVideoUrl?.id === activeVideo.id ? chunkedVideoUrl.url : null;
    }
    if (activeVideo.sourceType === "external") return playbackUrl || null;
    return (cachedStorageUrl?.id === activeVideo.id ? cachedStorageUrl.url : null) ?? playbackUrl ?? null;
  }, [activeVideo, chunkedVideoUrl, cachedStorageUrl, playbackUrl]);

  // With the unified sequence an image simply IS the current item — no more
  // "images only while no video can play".
  const branchImageUrl = activeImage?.downloadUrl ?? null;

  // NEWEST message wins. tickers[0] took whatever order the query returned, so
  // a branch with an old leftover ticker kept scrolling THAT instead of the
  // message the admin just published to all branches (Bugolobi, 2026-07-27).
  const activeTicker = useMemo(() => {
    const ms = (t: unknown): number => {
      if (!t) return 0;
      const withMillis = t as { toMillis?: () => number };
      if (typeof withMillis.toMillis === "function") return withMillis.toMillis();
      const d = new Date(t as string | number | Date).getTime();
      return Number.isFinite(d) ? d : 0;
    };
    return [...tickers].sort(
      (a, b) => ms(b.updatedAt ?? b.createdAt) - ms(a.updatedAt ?? a.createdAt),
    )[0];
  }, [tickers]);
  const tickerMessages = useMemo(() => {
    const lines = (activeTicker?.messages ?? [])
      .map((line) => line.text?.trim())
      .filter((text): text is string => Boolean(text));
    if (lines.length > 0) return lines;
    // Typed slogan keeps its case too — only the built-in default is fixed text.
    if (branch?.settings?.slogan) return [branch.settings.slogan];
    return [UNIMONI_DEFAULT_TICKER];
  }, [activeTicker, branch]);

  const tickerSpeed = activeTicker?.scrollSpeed || branchSettings.tickerSpeed || 35;
  const tickerPaused = activeTicker?.paused === true;
  // The DEDICATED corner-badge upload wins over the generic branch Logo URL —
  // otherwise "change the ticker corner logo" silently does nothing whenever a
  // branch Logo URL happens to be set.
  const tickerLogoUrl =
    branchSettings.tickerLogoUrl ||
    branch?.logoUrl ||
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
    : // The admin's typed capitals AND small letters show exactly as entered
      // (client 2026-07-27). Only the auto fallback (branch name) is capitalised.
      customHeadline || branch?.name?.toUpperCase() || UNIMONI_DEFAULT_TICKER;
  const tickerFontColor = activeTicker?.fontColor || branchSettings.tickerFontColor || "#FFFFFF";
  const tickerFontSize = activeTicker?.fontSize || branchSettings.tickerFontSize;

  // IMAGE step: stays exactly its "Seconds on screen", then the next item.
  useEffect(() => {
    if (!activeImage || mediaSequence.length <= 1) return;
    const durationMs = Math.max(2, activeImage.displayDurationSeconds ?? 15) * 1000;
    const timer = window.setTimeout(() => advanceMedia(), durationMs);
    return () => window.clearTimeout(timer);
    // Re-arm per sequence STEP (repeat steps show the image again).
  }, [activeImage, seqIndex, mediaSequence.length, advanceMedia]);

  // VIDEO step: plays to its natural end (handleVideoEnded advances). Only a
  // clip that never manages to START within 90s is skipped, so one broken
  // upload can't freeze the rotation. (The old build force-cut every video at
  // 60s even while playing fine — full clips now play out.)
  useEffect(() => {
    if (!activeVideo || videoLoaded || mediaSequence.length <= 1) return;
    const timer = window.setTimeout(() => advanceMedia(), 90_000);
    return () => window.clearTimeout(timer);
  }, [activeVideo, videoLoaded, seqIndex, mediaSequence.length, advanceMedia]);

  // STALL watchdog for a video that started fine and then hung mid-stream
  // (Wi-Fi drop while streaming): no error/ended ever fires, so without this
  // the rotation would freeze. "No progress reported for 45s" = move on.
  useEffect(() => {
    if (!activeVideo || !videoLoaded || mediaSequence.length <= 1) return;
    videoProgressAtRef.current = Date.now();
    const timer = window.setInterval(() => {
      if (Date.now() - videoProgressAtRef.current > 45_000) advanceMedia();
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [activeVideo, videoLoaded, seqIndex, mediaSequence.length, advanceMedia]);

  useEffect(() => {
    if (!activeVideo || !playbackUrl || activeVideo.sourceType !== "storage") return;

    const videoId = activeVideo.id;
    let alive = true;
    void getCachedVideoUrl(videoId, playbackUrl).then((url) => {
      if (alive && url) setCachedStorageUrl({ id: videoId, url });
    });
    void cacheVideoBlob(videoId, playbackUrl);
    return () => {
      alive = false;
    };
  }, [activeVideo, playbackUrl]);

  // Chunked videos: assembling the blob costs ~70 Firestore doc reads, so the
  // assembled object URL is KEPT (in chunkedObjectUrlRef) while other items
  // play and reused when the rotation returns — it is only revoked when a
  // DIFFERENT chunked video replaces it or the display unmounts.
  useEffect(() => {
    if (!activeVideo || !isChunkedVideo(activeVideo)) return;

    const videoId = activeVideo.id;
    const kept = chunkedObjectUrlRef.current;
    if (kept?.id === videoId) {
      setChunkedVideoUrl(kept);
      return;
    }
    let alive = true;
    void loadChunkedVideoBlobUrl(activeVideo)
      .then((url) => {
        if (!alive) {
          URL.revokeObjectURL(url);
          return;
        }
        if (chunkedObjectUrlRef.current && chunkedObjectUrlRef.current.id !== videoId) {
          URL.revokeObjectURL(chunkedObjectUrlRef.current.url);
        }
        chunkedObjectUrlRef.current = { id: videoId, url };
        setChunkedVideoUrl({ id: videoId, url });
      })
      .catch(() => {
        if (alive) {
          erroredAtRef.current = Date.now();
          setErroredVideoId(videoId);
        }
      });

    return () => {
      alive = false;
    };
  }, [activeVideo]);

  // Unmount only: release the kept chunked blob.
  useEffect(
    () => () => {
      if (chunkedObjectUrlRef.current) URL.revokeObjectURL(chunkedObjectUrlRef.current.url);
    },
    [],
  );

  const handleVideoEnded = useCallback(() => {
    advanceMedia();
  }, [advanceMedia]);

  const promoPanel = (
    <UnimoniPromoPanel
      placeholderMode={branchSettings.videoPlaceholderMode ?? "logo"}
      placeholderText={branchSettings.videoPlaceholderText ?? null}
      placeholderImageUrl={branchSettings.videoPlaceholderImageUrl ?? null}
      placeholderFontCss={rateCardFontCss}
      videoUrl={branchVideoUrl && !videoError ? branchVideoUrl : null}
      imageUrl={branchImageUrl}
      // Chunked/cached videos resolve async — keep the previous frame up instead
      // of flashing the empty navy placeholder between image ↔ video steps.
      mediaPending={Boolean(activeVideo && !videoError && !branchVideoUrl)}
      videoLoaded={videoLoaded}
      loopVideo={mediaSequence.length <= 1}
      mediaKey={seqIndex}
      fit={videoFit}
      widthPercent={effectivePromoWidth}
      soundOn={videoSoundOn}
      onMediaAspectChange={setMediaAspect}
      onVideoLoaded={() => {
        setVideoLoaded(true);
        setErroredVideoId("");
      }}
      onVideoError={() => {
        erroredAtRef.current = Date.now();
        setVideoLoaded(false);
        setErroredVideoId(activeVideoId);
      }}
      onVideoProgress={() => {
        videoProgressAtRef.current = Date.now();
      }}
      onVideoEnded={handleVideoEnded}
      // The "Image / video change animation" setting. It MUST read
      // videoImageTransition (what the Settings select writes) — the old
      // ratePromoTransition-first chain never reached it because
      // DEFAULT_BRANCH_SETTINGS always defines ratePromoTransition ("fade"),
      // so the admin's chosen effect silently never played.
      mediaTransition={branchSettings.videoImageTransition ?? "fade"}
      mediaTransitionSeconds={branchSettings.slideTransitionSeconds ?? 0.6}
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
          colorOverride={announcementTextColor}
          textAnimation={branchSettings.announcementTextAnimation ?? null}
          animation={announcementAnimation}
          anchor={announcementPosition}
          textScale={announcementTextScale}
        />
      ) : null}
    </UnimoniPromoPanel>
  );

  const ratesPanel = (
    <TimedRatesPanel
      key={ratesCycleKey}
      rates={rates}
      displaySeconds={rateCardHideSeconds > 0 ? 0 : rateCardDisplaySeconds}
      showBuyRate={branchSettings.showBuyRate}
      showSellRate={branchSettings.showSellRate}
      showTransferCard={showTransferCard}
      showForexCard={showForexCard}
      transferRates={transferRates}
      hiddenTransferCodes={branchSettings.hiddenTransferCodes ?? []}
      transferLocalLabel={transferLocalLabel}
      scale={rateCardScale}
      currencyScale={rateCurrencyScale}
      valueScale={rateValueScale}
      widthPercent={rateWidthPercent}
      headerLogoUrl={headerLogoUrl}
      headerLogoUrl2={headerLogoUrl2}
      headerLogoUrls={headerLogoUrls}
      promoSlideLogoUrl={promoSlideLogoUrl}
      promoSlideLogoScale={promoSlideLogoScale}
      headerLogoScale={headerLogoScale}
      promoTextScale={ratePromoTextScale}
      promoTextAnimation={branchSettings.ratePromoTextAnimation ?? null}
      promoFontCss={ratePromoFontCss}
      headerLogoAnimation={headerLogoAnimation}
      promoSlideLogoAnimation={promoSlideLogoAnimation}
      headerLogoDisplay={headerLogoDisplay}
      promoLogoMode={promoLogoMode}
      replaceDefaultLogo={replaceDefaultLogo}
      headerLogoRotationEnabled={headerLogoRotationEnabled}
      headerLogoRotationIntervalSeconds={headerLogoRotationIntervalSeconds}
      rateCardNote={rateCardNote}
      rateCardNoteFontScale={rateCardNoteFontScale}
      rateNotePlacement={rateNotePlacement}
      rateNoteScale={rateNoteScale}
      rateNoteFontCss={rateNoteFontCss}
      syncPlayback={syncRateCardPlayback}
      hideDotsOnPromo={hideDotsOnPromo}
      fontCss={rateCardFontCss}
      sheetIntervalSeconds={sheetIntervalSeconds}
      promoImageUrl={ratePromoImageUrl}
      promoMedia={ratePromoMedia}
      promoTextTop={ratePromoTextTop}
      promoText={ratePromoText}
      promoDurationSeconds={ratePromoDurationSeconds}
      transferDurationSeconds={branchSettings.rateTransferDurationSeconds ?? null}
      promoMediaFit={branchSettings.ratePromoMediaFit ?? "fill"}
      rateCardOrder={rateCardOrder}
      videoSoundOn={ratePromoSoundOn}
      sheetTransition={branchSettings.rateCardTransition ?? "fade"}
      promoTransition={branchSettings.ratePromoTransition ?? "flip"}
      promoTransitionSeconds={
        branchSettings.ratePromoTransitionSeconds ??
        (branchSettings.ratePromoTransitionSpeed === "fast"
          ? 0.3
          : branchSettings.ratePromoTransitionSpeed === "slow"
            ? 0.75
            : 0.8)
      }
      promoTransitionSpeed={typeof branchSettings.ratePromoTransitionSpeed === "string" ? branchSettings.ratePromoTransitionSpeed : "normal"}
      valueTextAnimation={branchSettings.rateTextAnimation ?? null}
      currencyTextAnimation={branchSettings.rateCurrencyAnimation ?? null}
      rateCardBgColor={branchSettings.rateCardBgColor ?? null}
      rateCurrencyColor={branchSettings.rateCurrencyColor ?? null}
      flagAnimation={branchSettings.rateFlagAnimation ?? null}
      headingAnimation={branchSettings.rateHeadingAnimation ?? null}
      currencyOverrides={currencyOverrides}
      onRotationComplete={handleRotationComplete}
    />
  );

  // Always the classic TV layout: video/promo area + fixed rate table.
  // With no video, the promo panel shows the branded placeholder — the
  // signage format never changes shape on the TV.

  // TV edge-cut (overscan) fix: many TVs crop a few % of an HDMI input on every
  // edge (logo/date/last column not fully visible). Uniformly shrinking the
  // WHOLE display leaves a black margin the TV crops instead of the content.
  const safeAreaPercent = Math.max(0, Math.min(15, branchSettings.displaySafeAreaPercent ?? 0));
  // Admin-adjustable spin/flip cadence (Settings → "Spin / flip speed") plus an
  // adjustable STAND-STILL between turns: one animation cycle = pause + turn,
  // holding still for the first pause/(pause+turn) of the cycle. The keyframes
  // are re-declared below with the computed hold percentage (CSS can't put a
  // var() inside a keyframe selector), overriding the static ones in globals.css.
  const rateAnimSecs = Math.max(1, Math.min(30, branchSettings.rateAnimationSpeedSeconds ?? 3));
  const rateAnimPauseSecs = Math.max(0, Math.min(30, branchSettings.rateAnimationPauseSeconds ?? 1));
  const rateAnimCycleSecs = rateAnimSecs + rateAnimPauseSecs;
  const rateAnimHoldPct = Math.round((rateAnimPauseSecs / rateAnimCycleSecs) * 1000) / 10;
  // TRANSFER slide gets its OWN cadence when set (null = same as forex).
  const trAnimSecs = Math.max(
    1,
    Math.min(30, branchSettings.rateAnimationSpeedSecondsTransfer ?? rateAnimSecs),
  );
  const trAnimPauseSecs = Math.max(
    0,
    Math.min(30, branchSettings.rateAnimationPauseSecondsTransfer ?? rateAnimPauseSecs),
  );
  const trAnimCycleSecs = trAnimSecs + trAnimPauseSecs;
  const trAnimHoldPct = Math.round((trAnimPauseSecs / trAnimCycleSecs) * 1000) / 10;

  return (
    <div
      className={`relative flex h-screen w-screen flex-col overflow-hidden bg-black text-white select-none ${
        isFullscreen ? "display-kiosk" : ""
      }`}
      style={{
        ...(safeAreaPercent > 0
          ? {
              transform: `scale(${(100 - 2 * safeAreaPercent) / 100})`,
              transformOrigin: "50% 50%",
              // Fill the inset margin the shrink reveals with solid black, so a
              // TV that crops edges shows clean black bars (never white page
              // bleed or the TV's own menu) around the fully-visible signage.
              boxShadow: "0 0 0 100vmax #000",
            }
          : {}),
        ["--rate-anim-secs" as string]: `${rateAnimCycleSecs}s`,
        ["--sheet-anim-secs" as string]: `${Math.max(0.2, Math.min(5, branchSettings.slideTransitionSeconds ?? 0.6))}s`,
      }}
    >
      {/* Dynamic spin/flip keyframes as a RAW style tag — styled-jsx strips
          interpolated @keyframes bodies (they arrived EMPTY in production and
          silently killed every spin), so this must NOT go through it. Rendered
          in the body = later in cascade order than the static stylesheet. */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
@keyframes display-cell-spin { 0%, ${rateAnimHoldPct}% { transform: perspective(600px) rotateY(0deg); } 100% { transform: perspective(600px) rotateY(360deg); } }
@keyframes display-cell-flip { 0%, ${rateAnimHoldPct}% { transform: perspective(600px) rotateX(0deg); } 100% { transform: perspective(600px) rotateX(360deg); } }
@keyframes display-cell-spin-tr { 0%, ${trAnimHoldPct}% { transform: perspective(600px) rotateY(0deg); } 100% { transform: perspective(600px) rotateY(360deg); } }
@keyframes display-cell-flip-tr { 0%, ${trAnimHoldPct}% { transform: perspective(600px) rotateX(0deg); } 100% { transform: perspective(600px) rotateX(360deg); } }
[data-anim-kind="transfer"] .display-rate-row .ticker-logo-spin,
[data-anim-kind="transfer"] .display-text-anim.ticker-logo-spin { animation: display-cell-spin-tr ${trAnimCycleSecs}s ease-in-out infinite; }
[data-anim-kind="transfer"] .display-rate-row .ticker-logo-flipx,
[data-anim-kind="transfer"] .display-text-anim.ticker-logo-flipx { animation: display-cell-flip-tr ${trAnimCycleSecs}s ease-in-out infinite; }
`,
        }}
      />
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
        {rateCardShown ? ratesPanel : null}
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
        headlineBgColor={branchSettings.tickerHeadlineBgColor ?? null}
        headlineTextColor={branchSettings.tickerHeadlineTextColor ?? null}
        heightScale={tickerScale}
        logoScale={logoScale}
        logoHeightScale={branchSettings.tickerLogoHeightScale ?? 1}
        logoAnimation={tickerLogoAnimation}
        scrollingLogos={scrollingLogosStart}
        scrollingLogosEnd={scrollingLogosEnd}
        headlineMaxWidthPercent={effectivePromoWidth}
        headlineFontCss={tickerHeadlineFontCss}
        headlineAnimation={branchSettings.tickerHeadlineAnimation ?? null}
        logoUrls={branchSettings.tickerLogoUrls ?? []}
        logoRotateSeconds={branchSettings.tickerLogoRotateSeconds ?? 6}
        messageAnimation={branchSettings.tickerMessageAnimation ?? null}
        logoBgColor={branchSettings.tickerLogoBgColor ?? null}
        scrollLogoAnimation={branchSettings.tickerScrollLogoAnimation ?? null}
        scrollLogoScale={branchSettings.tickerScrollLogoScale ?? 1}
        scrollLogoGapVw={branchSettings.tickerScrollLogoGapVw ?? 1.2}
        scrollLogoBg={branchSettings.tickerScrollLogoBg ?? "white"}
        scrollLogosEnabled={branchSettings.tickerScrollLogosEnabled !== false}
        logoFit={branchSettings.tickerLogoFit ?? "contain"}
        logoContainScale={branchSettings.tickerLogoContainScale ?? 0.9}
        logoScales={Array.isArray(branchSettings.tickerLogoScales) ? branchSettings.tickerLogoScales : []}
        scrollLogoFitMode={branchSettings.scrollLogoFitMode ?? "fill"}
        scrollLogoRemoveBg={branchSettings.scrollLogoRemoveBg !== false}
        showLogo={branchSettings.showTickerLogo !== false}
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
          colorOverride={announcementTextColor}
          textAnimation={branchSettings.announcementTextAnimation ?? null}
          textScale={announcementTextScale}
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
          colorOverride={announcementTextColor}
            textAnimation={branchSettings.announcementTextAnimation ?? null}
            animation={announcementAnimation}
            textScale={announcementTextScale}
          />
        </div>
      ) : null}

      <style jsx global>{`
        /* Behind the (possibly safe-area-scaled) display, the page must be
           BLACK — the margin the TV crops away should never flash white. */
        html,
        body {
          background: #000;
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
