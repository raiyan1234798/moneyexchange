"use client";

import { useCallback, useMemo, useState } from "react";
import Image from "next/image";
import { BRAND } from "@/lib/brand";
import { UNIMONI_COLORS } from "@/lib/unimoni-signage";

interface BreakingNewsTickerProps {
  /** Single line (legacy) — use `messages` when multiple lines should cycle. */
  text?: string;
  messages?: string[];
  logoUrl?: string | null;
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
  scrollSpeedSeconds,
  fontColor = "#FFFFFF",
  fontSize,
  paused = false,
  headline = "BIG BREAKING",
}: BreakingNewsTickerProps) {
  const duration = Math.max(scrollSpeedSeconds, 8);
  const resolvedLogo = logoUrl?.trim() || null;

  const messages = useMemo(() => {
    const fromProp = messagesProp?.map((line) => line.trim()).filter(Boolean);
    if (fromProp && fromProp.length > 0) return fromProp;
    if (text?.trim()) return [text.trim()];
    return [];
  }, [messagesProp, text]);

  const [messageIndex, setMessageIndex] = useState(0);
  const [cycle, setCycle] = useState(0);
  const [scrolling, setScrolling] = useState(!paused);

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

  return (
    <footer className="relative shrink-0">
      {headline ? (
        <div
          className="absolute left-[clamp(4.5rem,10vw,7rem)] top-0 z-30 -translate-y-full px-3 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.14em] sm:text-xs"
          style={{
            backgroundColor: UNIMONI_COLORS.gold,
            color: UNIMONI_COLORS.navy,
          }}
        >
          {headline}
        </div>
      ) : null}

      <div
        className="relative flex h-[clamp(3rem,6vh,4.5rem)] overflow-hidden"
        style={{ backgroundColor: UNIMONI_COLORS.navy }}
      >
        <div
          className="relative z-20 flex w-[clamp(4.5rem,10vw,7rem)] shrink-0 items-center justify-center border-r-2 shadow-[0_0_12px_rgba(201,162,39,0.35)]"
          style={{
            backgroundColor: UNIMONI_COLORS.panelBlue,
            borderColor: UNIMONI_COLORS.gold,
          }}
        >
          {resolvedLogo ? (
            <Image
              src={resolvedLogo}
              alt={`${BRAND.name} logo`}
              width={80}
              height={80}
              className="ticker-logo-pulse h-[75%] w-[85%] object-contain drop-shadow-md"
              unoptimized
            />
          ) : (
            <div className="flex flex-col items-center justify-center px-1 text-center">
              <span className="text-[clamp(0.55rem,1vw,0.75rem)] font-black uppercase leading-none text-white">
                NEWS
              </span>
              <span className="mt-0.5 text-[clamp(0.45rem,0.8vw,0.6rem)] font-bold uppercase text-[#F5B942]">
                LIVE
              </span>
            </div>
          )}
        </div>

        <div
          className="relative min-w-0 flex-1 overflow-hidden"
          style={{ backgroundColor: UNIMONI_COLORS.panelBlue }}
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
