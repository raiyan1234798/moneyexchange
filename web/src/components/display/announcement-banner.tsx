"use client";

import { useEffect, useState } from "react";
import { UNIMONI_COLORS } from "@/lib/unimoni-signage";

interface AnnouncementBannerProps {
  /** Short announcement text (e.g. contest winners). Nothing renders when empty. */
  text?: string | null;
  /** Optional small image (e.g. a winner photo) shown beside the text. */
  imageUrl?: string | null;
  /** Seconds the banner stays visible each time. */
  visibleSeconds?: number;
  /** Minutes between repeats. */
  repeatMinutes?: number;
}

/**
 * Admin-controlled drop-down announcement (per client voice note 2026-07-13):
 * a SMALL banner that slides down from the top of the VIDEO area (never over
 * the rate card), holds a few seconds, then slides away — repeating on an
 * interval. Text-first; an optional small image.
 */
export function AnnouncementBanner({
  text,
  imageUrl,
  visibleSeconds = 5,
  repeatMinutes = 3,
}: AnnouncementBannerProps) {
  const message = text?.trim() || "";
  const image = imageUrl?.trim() || "";
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!message && !image) return;
    const showMs = Math.max(2, visibleSeconds) * 1000;
    const gapMs = Math.max(0.5, repeatMinutes) * 60_000;

    let hideTimer: number | undefined;
    // First appearance shortly after load, then repeat on the interval.
    const firstTimer = window.setTimeout(() => {
      setVisible(true);
      hideTimer = window.setTimeout(() => setVisible(false), showMs);
    }, 3000);
    const repeatTimer = window.setInterval(() => {
      setVisible(true);
      hideTimer = window.setTimeout(() => setVisible(false), showMs);
    }, gapMs + showMs);

    return () => {
      window.clearTimeout(firstTimer);
      window.clearInterval(repeatTimer);
      if (hideTimer) window.clearTimeout(hideTimer);
    };
  }, [message, image, visibleSeconds, repeatMinutes]);

  if (!message && !image) return null;

  return (
    <div
      aria-live="polite"
      className={`pointer-events-none absolute inset-x-[6%] top-0 z-40 flex justify-center transition-transform duration-500 ease-out ${
        visible ? "translate-y-[1.2vh]" : "-translate-y-[130%]"
      }`}
    >
      <div
        className="flex max-w-full items-center gap-[0.8vw] rounded-b-[12px] border-2 border-t-0 px-[1.4vw] py-[1vh] shadow-[0_6px_24px_rgba(0,0,0,0.45)]"
        style={{ backgroundColor: "#FFFFFF", borderColor: UNIMONI_COLORS.gold }}
      >
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt=""
            className="h-[clamp(2rem,6vh,4rem)] w-auto shrink-0 rounded-md object-contain"
          />
        ) : null}
        {message ? (
          <p
            className="min-w-0 text-center font-extrabold uppercase leading-tight"
            style={{
              color: "#0D2680",
              fontFamily: "var(--font-brand), 'Trebuchet MS', sans-serif",
              fontSize: "clamp(0.85rem,1.5vw,1.5rem)",
            }}
          >
            {message}
          </p>
        ) : null}
      </div>
    </div>
  );
}
