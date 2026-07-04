"use client";

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

export function BreakingNewsTicker({
  text,
  logoUrl,
  scrollSpeedSeconds,
  fontColor = "#FFFFFF",
  fontSize,
  paused = false,
}: BreakingNewsTickerProps) {
  const duration = Math.max(scrollSpeedSeconds, 8);

  return (
    <footer className="relative shrink-0">
      <div
        className="relative flex h-[clamp(3rem,6vh,4.5rem)] overflow-hidden"
        style={{ backgroundColor: UNIMONI_COLORS.tickerBlack }}
      >
        {/* Fixed logo box — breaking news style */}
        <div
          className="relative z-20 flex w-[clamp(4.5rem,10vw,7rem)] shrink-0 items-center justify-center border-r-2 border-yellow-400"
          style={{ backgroundColor: "#CC0000" }}
        >
          {logoUrl ? (
            <Image
              src={logoUrl}
              alt="Branch logo"
              width={80}
              height={80}
              className="h-[70%] w-[70%] object-contain drop-shadow-md animate-pulse"
              unoptimized
            />
          ) : (
            <div className="flex flex-col items-center justify-center px-1 text-center">
              <span className="text-[clamp(0.55rem,1vw,0.75rem)] font-black uppercase leading-none text-white animate-pulse">
                NEWS
              </span>
              <span className="mt-0.5 text-[clamp(0.45rem,0.8vw,0.6rem)] font-bold uppercase text-yellow-300">
                LIVE
              </span>
            </div>
          )}
        </div>

        {/* Blue scroll area */}
        <div
          className="relative min-w-0 flex-1 overflow-hidden"
          style={{ backgroundColor: UNIMONI_COLORS.panelBlue }}
        >
          <div
            className="absolute inset-y-0 flex items-center whitespace-nowrap px-4 font-[Arial,Helvetica,sans-serif] font-bold uppercase tracking-[0.08em]"
            style={{
              color: fontColor,
              fontSize: fontSize ? `${fontSize}px` : "clamp(1.1rem, 2.2vw, 2rem)",
              animation: paused ? "none" : `breaking-scroll ${duration}s linear infinite`,
            }}
          >
            <span className="pr-[100vw]">{text}</span>
          </div>
        </div>
      </div>

      {/* Yellow bottom strip */}
      <div className="h-1 w-full bg-yellow-400" />

      <style jsx global>{`
        @keyframes breaking-scroll {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-100%);
          }
        }
      `}</style>
    </footer>
  );
}
