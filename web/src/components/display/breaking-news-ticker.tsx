"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { BRAND } from "@/lib/brand";
import { displayAnimationClass } from "@/lib/constants";
import { UNIMONI_COLORS } from "@/lib/unimoni-signage";
import { stripLogoBackground } from "@/lib/image-utils";

/** The real unimoni brand wordmark — shown by default in the pop-out badge. */
const DEFAULT_LOGO_SRC = "/unimoni-logo-full.png";

interface BreakingNewsTickerProps {
  /** Single line (legacy) — use `messages` when multiple lines should cycle. */
  text?: string;
  messages?: string[];
  logoUrl?: string | null;
  /** SEVERAL badge logos that take turns (used instead of logoUrl when non-empty). */
  logoUrls?: string[];
  /** Seconds each badge logo stays before the next. Default 6. */
  logoRotateSeconds?: number;
  /** Extra movement effect on the scrolling message content. Default none. */
  messageAnimation?: string | null;
  /** Badge background behind IMAGE logos (any CSS colour incl. "transparent"). Default white. */
  logoBgColor?: string | null;
  /** Movement effect for the logos scrolling WITH the message. Default none. */
  scrollLogoAnimation?: string | null;
  /** Size multiplier for the scrolling logos (bar height unchanged). Default 1. */
  scrollLogoScale?: number;
  /** Space between adjacent scrolling logos, in vw. Default 1.2. 0 = joined. */
  scrollLogoGapVw?: number;
  /** Chip behind each scrolling logo: white, none, or auto (contrast-aware). */
  scrollLogoBg?: "white" | "transparent" | "auto";
  /** Show the scrolling logos at all. Default true. */
  scrollLogosEnabled?: boolean;
  /** Badge logo fit: contain (default), cover, or fill (stretch to the box). */
  /** Badge logo fit: "contain" = whole logo at true shape; "fill" = stretch to
   *  fill the badge box (client 2026-08-04). "cover" (crop) is accepted for
   *  legacy saved settings but renders as contain — nothing is ever cropped. */
  logoFit?: "contain" | "cover" | "fill";
  /** In contain fit, fraction of the badge the whole logo fills (0.5–1). Default 0.9. */
  logoContainScale?: number;
  /** Per-logo overrides: size (0.5–1) and optional fit. Falls back to the badge fit. */
  logoScales?: Array<{ url: string; scale: number; fit?: "fill" | "contain" }>;
  /**
   * How each SCROLLING logo fits inside the ticker bar.
   * - "contain" (default): logo kept at aspect ratio, centred with side padding.
   * - "fill"  / "stretch": logo is stretched to fill the FULL bar height × auto width with no white margins.
   */
  scrollLogoFitMode?: "contain" | "fill" | "stretch";
  /** When true, automatically strip the white/solid background from scrolling logos. Default true. */
  scrollLogoRemoveBg?: boolean;
  /** Text logo shown in the badge instead of an image. */
  logoText?: string | null;
  /** CSS font-family for the text logo. */
  logoFontCss?: string;
  /** CSS font-family for the SCROLLING message (separate from the logo font). */
  messageFontCss?: string;
  scrollSpeedSeconds: number;
  fontColor?: string;
  fontSize?: number;
  paused?: boolean;
  /** Tab above the blue bar — defaults to "BIG BREAKING". */
  headline?: string;
  /** Multiplier for the whole ticker bar height + text size (default 1). */
  heightScale?: number;
  /** Multiplier for the pop-out logo badge WIDTH (default 1). */
  logoScale?: number;
  /** Multiplier for the pop-out logo badge HEIGHT (default 1). */
  logoHeightScale?: number;
  /** Animation applied to the pop-out logo badge. Default "spin". */
  logoAnimation?: string;
  /** Logos riding at the FRONT of the scrolling message (with per-logo stretch). */
  scrollingLogos?: Array<{ url: string; stretch?: boolean }>;
  /** Logos riding at the END of the scrolling message (with per-logo stretch). */
  scrollingLogosEnd?: Array<{ url: string; stretch?: boolean }>;
  /** The promo/video area width as a % of the screen. Caps the gold headline
   *  tab so it can grow up to — but never onto — the rate card. */
  headlineMaxWidthPercent?: number;
  /** Font for the gold headline box (follows the whole-screen master font). */
  headlineFontCss?: string;
  /** Movement effect for the headline text (bounce/flip/...). Default none. */
  headlineAnimation?: string | null;
  /** Colour of the yellow headline box + the badge border. null = Unimoni gold. */
  headlineBgColor?: string | null;
  /** Colour of the headline letters. null = deep navy. */
  headlineTextColor?: string | null;

  /** Whether the corner logo badge is visible. Default true. */
  showLogo?: boolean;
}

const PAUSE_BETWEEN_CYCLES_MS = 2500;

/** Average luminance of a logo's visible pixels — decides the chip colour in
    "auto" mode (light artwork → dark chip, dark artwork → white chip). */
function useLogoTone(src: string): "light" | "dark" | null {
  const [tone, setTone] = useState<"light" | "dark" | null>(null);
  useEffect(() => {
    let alive = true;
    // window.Image — the next/image import shadows the global constructor.
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const size = 24;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, size, size);
        const d = ctx.getImageData(0, 0, size, size).data;
        let sum = 0;
        let n = 0;
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] < 40) continue;
          sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          n++;
        }
        if (alive) setTone(n === 0 ? "dark" : sum / n > 150 ? "light" : "dark");
      } catch {
        if (alive) setTone("dark");
      }
    };
    img.onerror = () => {
      if (alive) setTone("dark");
    };
    img.src = src;
    return () => {
      alive = false;
    };
  }, [src]);
  return tone;
}

const cleanLogoCache = new Map<string, string>();

/** Automatically strips white/solid sticker backgrounds on the fly for scrolling logos.
 *  surface="any" skips the readability guard so ALL solid backgrounds are removed regardless
 *  of artwork colour — correct for fill-mode logos on a black ticker bar. */
function useCleanLogoSrc(
  src: string,
  enabled: boolean,
  surface: "light" | "dark" | "any" = "dark",
): string {
  const cacheKey = `${surface}:${src}`;
  const [cleaned, setCleaned] = useState<string>(() => cleanLogoCache.get(cacheKey) ?? src);

  useEffect(() => {
    if (!enabled || !src) return;
    if (cleanLogoCache.has(cacheKey)) {
      setCleaned(cleanLogoCache.get(cacheKey)!);
      return;
    }
    let active = true;
    void stripLogoBackground(src, surface)
      .then((res) => {
        if (!active) return;
        cleanLogoCache.set(cacheKey, res);
        setCleaned(res);
      })
      .catch(() => {
        if (!active) return;
        // Strip failed (e.g. photo or CORS) — use original
        cleanLogoCache.set(cacheKey, src);
      });
    return () => {
      active = false;
    };
  }, [src, enabled, surface, cacheKey]);

  return enabled ? cleaned : src;
}

/** One scrolling logo — every logo uses the SAME fixed slot (bar-height × 14:5 /
 *  ~2.8:1 landscape); artwork stays fully visible via object-contain (never
 *  cropped). Optional on-the-fly background strip removes white sticker boxes. */
function ScrollingLogoImg({
  src,
  animClass,
  side,
  gapVw = 1.2,
  scale = 1,
  heightScale = 1,
  removeBg = true,
}: {
  src: string;
  bgMode: "white" | "transparent" | "auto";
  animClass: string;
  heightEm: string;
  side: "start" | "end";
  gapVw?: number;
  scale?: number;
  heightScale?: number;
  fitMode?: "contain" | "cover" | "fill" | "stretch";
  stretch?: boolean;
  removeBg?: boolean;
}) {
  const cleanSrc = useCleanLogoSrc(src, removeBg, "any");
  const gap = Math.max(0, gapVw);
  const gapStyle = side === "start" ? { marginRight: `${gap}vw` } : { marginLeft: `${gap}vw` };
  const sizeScale = Math.max(0.3, Math.min(1, scale));
  // Fixed landscape slot ≈ 14:5 (width = height × 2.8). Matches upload spec.
  const slotH = `calc(clamp(3rem, 6vh, 4.5rem) * ${heightScale} * ${sizeScale})`;
  const slotW = `calc(clamp(3rem, 6vh, 4.5rem) * ${heightScale} * ${sizeScale} * 2.8)`;
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center ${animClass}`}
      style={{
        ...gapStyle,
        width: slotW,
        height: slotH,
        minWidth: slotW,
        minHeight: slotH,
        maxWidth: slotW,
        maxHeight: slotH,
        background: "transparent",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={cleanSrc}
        alt=""
        className="block"
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          objectPosition: "center",
        }}
      />
    </span>
  );
}


function BreakingNewsTickerInner({
  text,
  messages: messagesProp,
  logoUrl,
  logoUrls = [],
  logoRotateSeconds = 6,
  messageAnimation = null,
  logoBgColor = null,
  scrollLogoAnimation = null,
  scrollLogoScale = 1,
  scrollLogoGapVw = 1.2,
  scrollLogoBg = "white",
  scrollLogosEnabled = true,
  logoContainScale = 0.9,
  logoScales = [],
  scrollLogoFitMode = "contain",
  scrollLogoRemoveBg = true,
  logoText,
  logoFontCss,
  messageFontCss,
  scrollSpeedSeconds,
  fontColor = "#FFFFFF",
  fontSize,
  paused = false,
  headline = "BIG BREAKING",
  heightScale = 1,
  logoScale = 1,
  logoHeightScale = 1,
  logoFit = "contain",
  logoAnimation = "spin",
  scrollingLogos = [],
  scrollingLogosEnd = [],
  headlineMaxWidthPercent,
  headlineFontCss,
  headlineAnimation = null,
  headlineBgColor = null,
  headlineTextColor = null,
  showLogo = true,
}: BreakingNewsTickerProps) {
  const duration = Math.max(scrollSpeedSeconds, 8);
  const resolvedText = logoText?.trim() || null;
  const isTextLogo = Boolean(resolvedText);

  const messages = useMemo(() => {
    const fromProp = messagesProp?.map((line) => line.trim()).filter(Boolean);
    if (fromProp && fromProp.length > 0) return fromProp;
    if (text?.trim()) return [text.trim()];
    return [];
  }, [messagesProp, text]);

  const [messageIndex, setMessageIndex] = useState(0);
  const [cycle, setCycle] = useState(0);
  const [scrolling, setScrolling] = useState(!paused);
  // Bad logo URLs happen in the field (e.g. a Google Images PAGE link pasted
  // instead of an image) — fall back to the real brand logo instead of a broken
  // img.
  const [logoFailed, setLogoFailed] = useState(false);
  const [logoIdx, setLogoIdx] = useState(0);

  // The badge can hold SEVERAL logos that take turns; a single logoUrl still
  // works. Not a text logo → show the current image if it loads, otherwise the
  // real unimoni wordmark. There is always a logo in the badge.
  const badgeImages = (logoUrls ?? []).map((u) => u?.trim()).filter(Boolean) as string[];
  const effectiveBadgeImages = badgeImages.length
    ? badgeImages
    : logoUrl?.trim()
      ? [logoUrl.trim()]
      : [];
  const galleryLen = effectiveBadgeImages.length;

  useEffect(() => {
    if (isTextLogo || galleryLen <= 1) return;
    const t = window.setInterval(
      () => setLogoIdx((i) => i + 1),
      Math.max(2, logoRotateSeconds) * 1000,
    );
    return () => window.clearInterval(t);
  }, [isTextLogo, galleryLen, logoRotateSeconds]);

  // REAL-TIME per-logo feedback: when the admin changes ONE logo's Size, jump the
  // rotating badge straight to that logo so the change is visible immediately in
  // the live preview, instead of waiting for it to come round again (client
  // 2026-08-04: "I need this to reflect in real time").
  const prevScalesRef = useRef<Array<{ url: string; scale: number }>>(logoScales);
  useEffect(() => {
    const prev = prevScalesRef.current;
    if (prev === logoScales) return;
    prevScalesRef.current = logoScales;
    const changed = logoScales.find((x) => {
      const before = prev.find((p) => p.url === x.url);
      return !before || before.scale !== x.scale;
    });
    if (!changed) return;
    const idx = effectiveBadgeImages.indexOf(changed.url);
    if (idx >= 0) setLogoIdx(idx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logoScales]);

  const currentBadge = galleryLen ? effectiveBadgeImages[logoIdx % galleryLen] : null;
  const imageLogoSrc = isTextLogo
    ? null
    : currentBadge && !(galleryLen === 1 && logoFailed)
      ? currentBadge
      : DEFAULT_LOGO_SRC;
  // Per-logo size override wins for the logo currently on screen; otherwise the
  // global Normal-fit size. Lets a wide logo be shrunk until it clears the
  // rounded corner while the rest stay large.
  const perLogoEntry = currentBadge ? logoScales.find((x) => x.url === currentBadge) : undefined;
  // How much of the badge the logo fills. BOTH knobs work in EVERY fit mode
  // (client 2026-08-04: "Logo size inside badge" did nothing unless the fit was
  // Normal): the global "Logo size inside badge" is the base, and a per-logo
  // Size box overrides it for that one logo.
  const rawScale =
    perLogoEntry && typeof perLogoEntry.scale === "number" ? perLogoEntry.scale : logoContainScale;
  const containPct = Math.round(Math.max(50, Math.min(100, rawScale * 100)));
  // Per-logo fit beats the branch fit: a round emblem set to "Whole" stays a
  // clean circle while wide wordmarks stretch to fill (client 2026-08-05).
  const effLogoFit = perLogoEntry?.fit ?? logoFit;

  const activeText = messages[messageIndex] ?? "";

  const handleAnimationEnd = useCallback(() => {
    setScrolling(false);
    window.setTimeout(() => {
      if (paused) return;
      if (messages.length > 1) {
        setMessageIndex((prev) => (prev + 1) % messages.length);
      }
      setCycle((prev) => prev + 1);
      setScrolling(true);
    }, PAUSE_BETWEEN_CYCLES_MS);
  }, [messages.length, paused]);

  // Text logos get a wider badge and a font size that shrinks with length so a
  // word like "UNIMONI" fits on ONE line instead of wrapping mid-word. Image
  // logos (the real wordmark) sit on a horizontal white card. The scrolling
  // strip and headline tab shift right to clear the badge; the whole badge and
  // the inset scale together with logoScale.
  const baseBadgeWidth = !showLogo ? "0px" : isTextLogo ? "clamp(8rem,19vw,15rem)" : "clamp(8.5rem,18vw,13rem)";
  const badgeWidth = !showLogo ? "0px" : `calc(${baseBadgeWidth} * ${logoScale})`;
  const textLen = resolvedText?.length ?? 0;
  const textLogoSize =
    textLen <= 6 ? "clamp(1.1rem,2.4vw,2.5rem)" : textLen <= 10 ? "clamp(0.85rem,1.8vw,1.9rem)" : "clamp(0.6rem,1.3vw,1.35rem)";

  // Independently resizable ticker: bar height and scrolling text both scale.
  const barHeight = `calc(clamp(3rem,6vh,4.5rem) * ${heightScale})`;
  const scrollFontSize = fontSize
    ? `calc(${fontSize}px * ${heightScale})`
    : `calc(clamp(1.1rem, 2.2vw, 2rem) * ${heightScale})`;

  const scrollLogoAnimClass = displayAnimationClass(scrollLogoAnimation);

  const messageAnimClass = displayAnimationClass(messageAnimation);

  const headlineAnimClass = displayAnimationClass(headlineAnimation);
  // Admin colours for the gold trim; null keeps today's exact look so "Reset to
  // default" is free (client 2026-07-27).
  const goldTrim = headlineBgColor?.trim() || UNIMONI_COLORS.gold;
  const headlineInk = headlineTextColor?.trim() || UNIMONI_COLORS.navy;

  const pulse = logoAnimation === "pulse";
  // Animation class applied to the logo image itself (pulse animates the whole
  // badge instead — see below).
  const logoAnimClass = logoAnimation === "pulse" ? "" : displayAnimationClass(logoAnimation);

  return (
    <footer className="relative shrink-0">
      {headline ? (
        <div
          // Flush against the logo's right edge so it reads as one continuous
          // gold band extending FROM the logo. It sizes to the text — short text
          // = short box, long text = wider box — and is CAPPED so it can grow up
          // to but never onto the rate card (long text then ellipsizes).
          // No `uppercase` class: the headline shows EXACTLY the capitals and
          // small letters the admin typed (client 2026-07-27).
          className="absolute top-0 z-30 -translate-y-full truncate rounded-t-lg px-3 py-0.5 text-[10px] font-extrabold tracking-[0.14em] sm:text-xs"
          style={{
            left: badgeWidth,
            // Single calc (no nested calc()) so TV WebViews resolve it. 0.5vw gap
            // keeps the widest box just short of the rate card.
            maxWidth: headlineMaxWidthPercent
              ? `calc(${headlineMaxWidthPercent}vw - (${baseBadgeWidth}) * ${logoScale} - 0.5vw)`
              : "60vw",
            backgroundColor: goldTrim,
            color: headlineInk,
            fontFamily: headlineFontCss,
          }}
        >
          <span className={`inline-block ${headlineAnimClass}`}>{headline}</span>
        </div>
      ) : null}

      {/* Pop-out logo badge (like the reference "BREAKING NEWS" shield):
          bigger than the bar, overlapping it from the left, visually separate
          from the scrolling strip. Text slides behind it and disappears.
          Image logos sit on a white card so the navy+gold wordmark reads. */}
      {showLogo ? (
        <div
          // bottom-0 keeps the badge's gold bottom border flush with the ticker's
          // gold underline — one continuous straight line, no double line.
          // The RIGHT end is fully rounded (a clean, complete shape — not a hard
          // rectangle); the left sits flush at the screen edge. More padding + a
          // slightly smaller logo below keep the wordmark clear of the rounded
          // corners so it never looks cut.
          // "Fill the badge" goes truly edge-to-edge (no inner padding) — the
          // classic Stretch look the client wants back (2026-08-04); only the
          // rounded-right corner curves over the logo's corner pixels. "Whole
          // logo" keeps breathing room on all sides so wordmarks clear the
          // corner and gold border. Cropping via object-cover stays gone.
          className={`absolute bottom-0 left-0 z-40 flex items-center justify-center overflow-hidden rounded-r-[26px] border-2 border-l-0 shadow-[0_4px_18px_rgba(0,0,0,0.55),0_0_14px_rgba(201,162,39,0.35)] ${
            isTextLogo || effLogoFit !== "fill" ? "px-[1.3vw] py-[0.7vh]" : "p-0"
          } ${pulse ? "ticker-logo-pulse" : ""}`}
          style={{
            width: badgeWidth,
            height: `calc(${barHeight} * 1.5 * ${logoHeightScale})`,
            backgroundColor: isTextLogo
              ? UNIMONI_COLORS.tickerBlack
              : logoBgColor?.trim() === "transparent"
                ? "transparent"
                : logoBgColor?.trim() || "#FFFFFF",
            borderColor: goldTrim,
          }}
        >
          {isTextLogo ? (
            <span
              className="whitespace-nowrap text-center font-extrabold uppercase leading-none tracking-tight text-white drop-shadow-md"
              style={{
                fontFamily: logoFontCss ?? "'Arial Black', Arial, sans-serif",
                fontSize: textLogoSize,
              }}
            >
              {resolvedText}
            </span>
          ) : (
            <Image
              src={imageLogoSrc!}
              alt={`${BRAND.name} logo`}
              width={260}
              height={84}
              // Two honest modes (client 2026-08-04: "fill the badge" is back):
              // - contain: WHOLE logo, true proportions, centred.
              // - fill: stretches the logo to the badge box so it FILLS it —
              //   nothing is ever cropped in either mode (object-cover is gone
              //   for good; it cut M-PESA to "IEPES").
              className={`drop-shadow-sm ${
                effLogoFit === "fill" ? "object-fill" : "object-contain"
              } ${logoAnimClass}`}
              style={{ height: `${containPct}%`, width: `${containPct}%` }}
              unoptimized
              priority
              onError={() => (galleryLen > 1 ? setLogoIdx((i) => i + 1) : setLogoFailed(true))}
            />
          )}
        </div>
      ) : null}

      <div
        className="relative flex overflow-hidden"
        style={{ height: barHeight, backgroundColor: UNIMONI_COLORS.tickerBlack }}
      >
        <div
          className="relative min-w-0 flex-1 overflow-hidden"
          // Scrolling strip is black with white text (per client). The text runs
          // the FULL width and slides UNDER the opaque pop-out logo (z-40) on the
          // left, so the whole message stays visible right up to the logo edge —
          // no mid-strip clipping. The gold headline tab is offset to clear it.
          style={{ backgroundColor: UNIMONI_COLORS.tickerBlack }}
        >
          {scrolling && activeText ? (
            <div key={`${messageIndex}-${cycle}`} className="absolute inset-y-0 flex w-full items-center">
              <span
                // No `uppercase`: the scrolling message shows exactly the
                // capitals and small letters the admin typed (client 2026-07-27).
                className="breaking-ticker-text inline-flex h-full w-auto items-center whitespace-nowrap pl-[100%] font-bold tracking-[0.08em] will-change-transform"
                style={{
                  color: fontColor,
                  fontSize: scrollFontSize,
                  fontFamily: messageFontCss ?? "Arial, Helvetica, sans-serif",
                  animationDuration: `${duration}s`,
                }}
                onAnimationEnd={handleAnimationEnd}
              >
                {/* The message-movement animation is applied to the TEXT ONLY
                    (below), NOT this wrapper — otherwise it would also spin/flip
                    the logos, so "Logo movement = none" could never stop them
                    (client 2026-08-01). The logos animate solely via their own
                    "Logo movement" control (scrollLogoAnimClass). */}
                <span className="inline-flex h-full items-center">
                {/* Optional logo images ride with the message — at the FRONT,
                    the END, or both (admin choice). In fill/stretch mode they
                    expand to the full bar height; in contain mode they respect
                    scrollLogoScale. */}
                {scrollLogosEnabled
                  ? scrollingLogos.map((item, i) => (
                      <ScrollingLogoImg
                        key={`start-${item.url.slice(-12)}-${i}`}
                        src={item.url}
                        bgMode={scrollLogoBg}
                        animClass={scrollLogoAnimClass}
                        heightEm={`${(2.2 * scrollLogoScale).toFixed(2)}em`}
                        side="start"
                        gapVw={scrollLogoGapVw}
                        scale={scrollLogoScale}
                        heightScale={heightScale}
                        fitMode={scrollLogoFitMode}
                        stretch={item.stretch}
                        removeBg={scrollLogoRemoveBg}
                      />
                    ))
                  : null}
                <span className={`inline-flex h-full items-center ${messageAnimClass}`}>
                  {activeText}
                </span>
                {scrollLogosEnabled
                  ? scrollingLogosEnd.map((item, i) => (
                      <ScrollingLogoImg
                        key={`end-${item.url.slice(-12)}-${i}`}
                        src={item.url}
                        bgMode={scrollLogoBg}
                        animClass={scrollLogoAnimClass}
                        heightEm={`${(2.2 * scrollLogoScale).toFixed(2)}em`}
                        side="end"
                        gapVw={scrollLogoGapVw}
                        scale={scrollLogoScale}
                        heightScale={heightScale}
                        fitMode={scrollLogoFitMode}
                        stretch={item.stretch}
                        removeBg={scrollLogoRemoveBg}
                      />
                    ))
                  : null}
                </span>
              </span>
            </div>
          ) : null}
        </div>
      </div>

    </footer>
  );
}

export function BreakingNewsTicker(props: BreakingNewsTickerProps) {
  const messagesKey = props.messages?.join("|") ?? props.text ?? "";
  return <BreakingNewsTickerInner key={`${messagesKey}|${props.paused}|${props.headline}`} {...props} />;
}
