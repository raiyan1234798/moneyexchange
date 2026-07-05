"use client";

import { useCallback, useState } from "react";
import Image from "next/image";
import { BRAND } from "@/lib/brand";
import { UNIMONI_COLORS } from "@/lib/unimoni-signage";

interface BreakingNewsTickerProps {
  text: string;
  logoUrl?: string | null;
  scrollSpeedSeconds: number;
  fontColor?: string;
  fontSize?: number;
  paused?: boolean;
}

const PAUSE_BETWEEN_CYCLES_MS = 2500;

function BreakingNewsTickerInner({
  text,
  logoUrl,
  scrollSpeedSeconds,
  fontColor = "#FFFFFF",
  fontSize,
  paused = false,
}: BreakingNewsTickerProps) {
  const duration = Math.max(scrollSpeedSeconds, 8);
  const [cycle, setCycle] = useState(0);
  const [scrolling, setScrolling] = useState(!paused);
  const resolvedLogo = logoUrl || BRAND.logoPath;

  const handleAnimationEnd = useCallback(() => {
    setScrolling(false);
    window.setTimeout(() => {
      if (!paused) {
        setCycle((prev) => prev + 1);
        setScrolling(true);
      }
    }, PAUSE_BETWEEN_CYCLES_MS);
  }, [paused]);

  return (
    <footer className="relative shrink-0">
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
          <Image
            src={resolvedLogo}
            alt={BRAND.name}
            width={80}
            height={80}
            className="h-[75%] w-[85%] object-contain drop-shadow-md animate-[logo-glow_2.5s_ease-in-out_infinite]"
            unoptimized
          />
        </div>

        <div
          className="relative min-w-0 flex-1 overflow-hidden"
          style={{ backgroundColor: UNIMONI_COLORS.panelBlue }}
        >
          {scrolling && text ? (
            <div key={cycle} className="absolute inset-y-0 flex items-center">
              <span
                className="inline-block whitespace-nowrap pl-[100%] font-[Arial,Helvetica,sans-serif] font-bold uppercase tracking-[0.08em] will-change-transform"
                style={{
                  color: fontColor,
                  fontSize: fontSize ? `${fontSize}px` : "clamp(1.1rem, 2.2vw, 2rem)",
                  animation: `breaking-scroll-once ${duration}s linear forwards`,
                }}
                onAnimationEnd={handleAnimationEnd}
              >
                {text}
              </span>
            </div>
          ) : null}
        </div>
      </div>

      <div className="h-1 w-full" style={{ backgroundColor: UNIMONI_COLORS.gold }} />

      <style jsx global>{`
        @keyframes breaking-scroll-once {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-100%);
          }
        }
        @keyframes logo-glow {
          0%,
          100% {
            filter: drop-shadow(0 0 2px rgba(255, 255, 255, 0.4));
            opacity: 1;
          }
          50% {
            filter: drop-shadow(0 0 8px rgba(201, 162, 39, 0.85));
            opacity: 0.92;
          }
        }
      `}</style>
    </footer>
  );
}

export function BreakingNewsTicker(props: BreakingNewsTickerProps) {
  return <BreakingNewsTickerInner key={`${props.text}|${props.paused}`} {...props} />;
}
