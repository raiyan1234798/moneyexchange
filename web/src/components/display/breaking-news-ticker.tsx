"use client";

import { useCallback, useState } from "react";
import Image from "next/image";
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
        style={{ backgroundColor: UNIMONI_COLORS.tickerBlack }}
      >
        <div
          className="relative z-20 flex w-[clamp(4.5rem,10vw,7rem)] shrink-0 items-center justify-center border-r-2 border-yellow-400 shadow-[0_0_12px_rgba(250,204,21,0.35)]"
          style={{ backgroundColor: "#CC0000" }}
        >
          {logoUrl ? (
            <Image
              src={logoUrl}
              alt="Branch logo"
              width={80}
              height={80}
              className="h-[70%] w-[70%] object-contain drop-shadow-md animate-[logo-glow_2.5s_ease-in-out_infinite]"
              unoptimized
            />
          ) : (
            <div className="flex flex-col items-center justify-center px-1 text-center animate-[logo-glow_2.5s_ease-in-out_infinite]">
              <span className="text-[clamp(0.55rem,1vw,0.75rem)] font-black uppercase leading-none text-white">
                NEWS
              </span>
              <span className="mt-0.5 text-[clamp(0.45rem,0.8vw,0.6rem)] font-bold uppercase text-yellow-300">
                LIVE
              </span>
            </div>
          )}
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

      <div className="h-1 w-full bg-yellow-400" />

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
            filter: drop-shadow(0 0 8px rgba(255, 235, 59, 0.85));
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
