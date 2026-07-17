"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { BRAND } from "@/lib/brand";
import { displayAnimationClass } from "@/lib/constants";
import { UNIMONI_COLORS } from "@/lib/unimoni-signage";

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
  /** Chip behind each scrolling logo: white card (default) or none. */
  scrollLogoBg?: "white" | "transparent";
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
  /** Logo images that scroll right-to-left with the messages. */
  scrollingLogos?: string[];
  /** The promo/video area width as a % of the screen. Caps the gold headline
   *  tab so it can grow up to — but never onto — the rate card. */
  headlineMaxWidthPercent?: number;
  /** Font for the gold headline box (follows the whole-screen master font). */
  headlineFontCss?: string;
  /** Movement effect for the headline text (bounce/flip/...). Default none. */
  headlineAnimation?: string | null;
}

const PAUSE_BETWEEN_CYCLES_MS = 2500;

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
  scrollLogoBg = "white",
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
  logoAnimation = "spin",
  scrollingLogos = [],
  headlineMaxWidthPercent,
  headlineFontCss,
  headlineAnimation = null,
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

  const currentBadge = galleryLen ? effectiveBadgeImages[logoIdx % galleryLen] : null;
  const imageLogoSrc = isTextLogo
    ? null
    : currentBadge && !(galleryLen === 1 && logoFailed)
      ? currentBadge
      : DEFAULT_LOGO_SRC;

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
  const baseBadgeWidth = isTextLogo ? "clamp(8rem,19vw,15rem)" : "clamp(8.5rem,18vw,13rem)";
  const badgeWidth = `calc(${baseBadgeWidth} * ${logoScale})`;
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
          className="absolute top-0 z-30 -translate-y-full truncate rounded-t-lg px-3 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.14em] sm:text-xs"
          style={{
            left: badgeWidth,
            // Single calc (no nested calc()) so TV WebViews resolve it. 0.5vw gap
            // keeps the widest box just short of the rate card.
            maxWidth: headlineMaxWidthPercent
              ? `calc(${headlineMaxWidthPercent}vw - (${baseBadgeWidth}) * ${logoScale} - 0.5vw)`
              : "60vw",
            backgroundColor: UNIMONI_COLORS.gold,
            color: UNIMONI_COLORS.navy,
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
      <div
        // bottom-0 keeps the badge's gold bottom border flush with the ticker's
        // gold underline — one continuous straight line, no double line.
        // The RIGHT end is fully rounded (a clean, complete shape — not a hard
        // rectangle); the left sits flush at the screen edge. More padding + a
        // slightly smaller logo below keep the wordmark clear of the rounded
        // corners so it never looks cut.
        className={`absolute bottom-0 left-0 z-40 flex items-center justify-center overflow-hidden rounded-r-[26px] border-2 border-l-0 px-[1vw] shadow-[0_4px_18px_rgba(0,0,0,0.55),0_0_14px_rgba(201,162,39,0.35)] ${
          pulse ? "ticker-logo-pulse" : ""
        }`}
        style={{
          width: badgeWidth,
          height: `calc(${barHeight} * 1.5 * ${logoHeightScale})`,
          backgroundColor: isTextLogo
            ? UNIMONI_COLORS.tickerBlack
            : logoBgColor?.trim() || "#FFFFFF",
          borderColor: UNIMONI_COLORS.gold,
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
            className={`h-[80%] w-[90%] object-contain drop-shadow-sm ${logoAnimClass}`}
            unoptimized
            priority
            onError={() => (galleryLen > 1 ? setLogoIdx((i) => i + 1) : setLogoFailed(true))}
          />
        )}
      </div>

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
                className="breaking-ticker-text inline-block whitespace-nowrap pl-[100%] font-bold uppercase tracking-[0.08em] will-change-transform"
                style={{
                  color: fontColor,
                  fontSize: scrollFontSize,
                  fontFamily: messageFontCss ?? "Arial, Helvetica, sans-serif",
                  animationDuration: `${duration}s`,
                }}
                onAnimationEnd={handleAnimationEnd}
              >
                <span className={`inline-block ${messageAnimClass}`}>
                {/* Optional logo images scroll right-to-left together with the
                    message text; sized relative to the ticker font. */}
                {scrollingLogos.map((src, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={`${src}-${i}`}
                    src={src}
                    alt=""
                    className={`mr-[1.6vw] inline-block w-auto rounded-[3px] px-[0.3em] py-[0.15em] align-middle object-contain ${scrollLogoBg === "transparent" ? "" : "bg-white/95"} ${scrollLogoAnimClass}`}
                    // Size is user-adjustable; em-based so it rides the message font,
                    // and the BAR height never changes with it.
                    style={{ height: `${(1.4 * scrollLogoScale).toFixed(2)}em` }}
                  />
                ))}
                {activeText}
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
