"use client";

import { useCallback, useMemo, useState } from "react";
import Image from "next/image";
import { BRAND } from "@/lib/brand";
import { UnimoniMark } from "@/components/brand/unimoni-logo";
import { UNIMONI_COLORS } from "@/lib/unimoni-signage";

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
}: BreakingNewsTickerProps) {
  const duration = Math.max(scrollSpeedSeconds, 8);
  const resolvedText = logoText?.trim() || null;
  const resolvedLogo = resolvedText ? null : logoUrl?.trim() || null;

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
  // instead of an image) — fall back to the brand mark instead of a broken img.
  const [logoFailed, setLogoFailed] = useState(false);

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
  // word like "UNIMONI" fits on ONE line instead of wrapping mid-word. The
  // scrolling strip and headline tab shift right to clear the badge.
  const badgeWidth = resolvedText ? "clamp(8rem,19vw,15rem)" : "clamp(6rem,13vw,9.5rem)";
  const contentInset = resolvedText ? "clamp(9rem,21vw,16rem)" : "clamp(7rem,15vw,10.5rem)";
  const textLen = resolvedText?.length ?? 0;
  const textLogoSize =
    textLen <= 6 ? "clamp(1.1rem,2.4vw,2.5rem)" : textLen <= 10 ? "clamp(0.85rem,1.8vw,1.9rem)" : "clamp(0.6rem,1.3vw,1.35rem)";

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
          from the scrolling strip. Text slides behind it and disappears. */}
      <div
        className="ticker-logo-pulse absolute bottom-[12%] left-[0.6vw] z-40 flex h-[135%] items-center justify-center rounded-[10px] border-2 px-[0.5vw] shadow-[0_4px_18px_rgba(0,0,0,0.55),0_0_14px_rgba(201,162,39,0.35)]"
        style={{
          width: badgeWidth,
          backgroundColor: UNIMONI_COLORS.tickerBlack,
          borderColor: UNIMONI_COLORS.gold,
        }}
      >
        {resolvedText ? (
          <span
            className="whitespace-nowrap text-center font-extrabold uppercase leading-none tracking-tight text-white drop-shadow-md"
            style={{
              fontFamily: logoFontCss ?? "'Arial Black', Arial, sans-serif",
              fontSize: textLogoSize,
            }}
          >
            {resolvedText}
          </span>
        ) : resolvedLogo && !logoFailed ? (
          <Image
            src={resolvedLogo}
            alt={`${BRAND.name} logo`}
            width={140}
            height={140}
            className="h-[80%] w-[88%] object-contain drop-shadow-md"
            unoptimized
            onError={() => setLogoFailed(true)}
          />
        ) : (
          <UnimoniMark size={64} className="shadow-md" />
        )}
      </div>

      <div
        className="relative flex h-[clamp(3rem,6vh,4.5rem)] overflow-hidden"
        style={{ backgroundColor: UNIMONI_COLORS.tickerBlack }}
      >
        <div
          className="relative min-w-0 flex-1 overflow-hidden"
          // Scrolling strip is black with white text (per client) — the gold
          // headline tab and underline stay for brand contrast. Left padding
          // clears the pop-out badge (wider when it's a text logo).
          style={{ backgroundColor: UNIMONI_COLORS.tickerBlack, paddingLeft: contentInset }}
        >
          {scrolling && activeText ? (
            <div key={`${messageIndex}-${cycle}`} className="absolute inset-y-0 flex w-full items-center">
              <span
                className="breaking-ticker-text inline-block whitespace-nowrap pl-[100%] font-[Arial,Helvetica,sans-serif] font-bold uppercase tracking-[0.08em] will-change-transform"
                style={{
                  color: fontColor,
                  fontSize: fontSize ? `${fontSize}px` : "clamp(1.1rem, 2.2vw, 2rem)",
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
