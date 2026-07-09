"use client";

import { useCallback, useMemo, useState } from "react";
import Image from "next/image";
import { BRAND } from "@/lib/brand";
import { UNIMONI_COLORS } from "@/lib/unimoni-signage";

/** The real unimoni brand wordmark — shown by default in the pop-out badge. */
const DEFAULT_LOGO_SRC = "/unimoni-logo-full.png";

interface BreakingNewsTickerProps {
  /** Single line (legacy) — use `messages` when multiple lines should cycle. */
  text?: string;
  messages?: string[];
  logoUrl?: string | null;
  /** Text logo shown in the badge instead of an image. */
  logoText?: string | null;
  /** CSS font-family for the text logo. */
  logoFontCss?: string;
  scrollSpeedSeconds: number;
  fontColor?: string;
  fontSize?: number;
  paused?: boolean;
  /** Tab above the blue bar — defaults to "BIG BREAKING". */
  headline?: string;
  /** Multiplier for the whole ticker bar height + text size (default 1). */
  heightScale?: number;
  /** Multiplier for the pop-out logo badge size (default 1). */
  logoScale?: number;
  /** Animation applied to the pop-out logo badge. Default "spin". */
  logoAnimation?: "spin" | "pulse" | "none";
}

const PAUSE_BETWEEN_CYCLES_MS = 2500;

function BreakingNewsTickerInner({
  text,
  messages: messagesProp,
  logoUrl,
  logoText,
  logoFontCss,
  scrollSpeedSeconds,
  fontColor = "#FFFFFF",
  fontSize,
  paused = false,
  headline = "BIG BREAKING",
  heightScale = 1,
  logoScale = 1,
  logoAnimation = "spin",
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

  // Not a text logo → show the uploaded image if it loads, otherwise the real
  // unimoni brand wordmark. There is always a logo in the badge now.
  const imageLogoSrc = isTextLogo
    ? null
    : logoUrl?.trim() && !logoFailed
      ? logoUrl.trim()
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
  const baseInset = isTextLogo ? "clamp(9rem,21vw,16rem)" : "clamp(9.5rem,20vw,14.5rem)";
  const badgeWidth = `calc(${baseBadgeWidth} * ${logoScale})`;
  const contentInset = `calc(${baseInset} * ${logoScale})`;
  const textLen = resolvedText?.length ?? 0;
  const textLogoSize =
    textLen <= 6 ? "clamp(1.1rem,2.4vw,2.5rem)" : textLen <= 10 ? "clamp(0.85rem,1.8vw,1.9rem)" : "clamp(0.6rem,1.3vw,1.35rem)";

  // Independently resizable ticker: bar height and scrolling text both scale.
  const barHeight = `calc(clamp(3rem,6vh,4.5rem) * ${heightScale})`;
  const scrollFontSize = fontSize
    ? `calc(${fontSize}px * ${heightScale})`
    : `calc(clamp(1.1rem, 2.2vw, 2rem) * ${heightScale})`;

  const spin = logoAnimation === "spin";
  const pulse = logoAnimation === "pulse";

  return (
    <footer className="relative shrink-0">
      {headline ? (
        <div
          className="absolute top-0 z-30 -translate-y-full px-3 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.14em] sm:text-xs"
          style={{
            left: contentInset,
            backgroundColor: UNIMONI_COLORS.gold,
            color: UNIMONI_COLORS.navy,
          }}
        >
          {headline}
        </div>
      ) : null}

      {/* Pop-out logo badge (like the reference "BREAKING NEWS" shield):
          bigger than the bar, overlapping it from the left, visually separate
          from the scrolling strip. Text slides behind it and disappears.
          Image logos sit on a white card so the navy+gold wordmark reads. */}
      <div
        className={`absolute bottom-[10%] left-0 z-40 flex items-center justify-center overflow-hidden rounded-r-[10px] border-2 border-l-0 px-[0.5vw] shadow-[0_4px_18px_rgba(0,0,0,0.55),0_0_14px_rgba(201,162,39,0.35)] ${
          pulse ? "ticker-logo-pulse" : ""
        }`}
        style={{
          width: badgeWidth,
          height: `calc(${barHeight} * 1.5)`,
          backgroundColor: isTextLogo ? UNIMONI_COLORS.tickerBlack : "#FFFFFF",
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
            className={`h-[74%] w-[92%] object-contain drop-shadow-sm ${spin ? "ticker-logo-spin" : ""}`}
            unoptimized
            priority
            onError={() => setLogoFailed(true)}
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
                className="breaking-ticker-text inline-block whitespace-nowrap pl-[100%] font-[Arial,Helvetica,sans-serif] font-bold uppercase tracking-[0.08em] will-change-transform"
                style={{
                  color: fontColor,
                  fontSize: scrollFontSize,
                  animationDuration: `${duration}s`,
                }}
                onAnimationEnd={handleAnimationEnd}
              >
                {activeText}
              </span>
            </div>
          ) : null}
        </div>
      </div>

      <div className="h-1 w-full" style={{ backgroundColor: UNIMONI_COLORS.gold }} />
    </footer>
  );
}

export function BreakingNewsTicker(props: BreakingNewsTickerProps) {
  const messagesKey = props.messages?.join("|") ?? props.text ?? "";
  return <BreakingNewsTickerInner key={`${messagesKey}|${props.paused}|${props.headline}`} {...props} />;
}
