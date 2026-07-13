"use client";

import { useEffect, useState } from "react";
import { UNIMONI_COLORS } from "@/lib/unimoni-signage";

interface AnnouncementBannerProps {
  /** Short announcement text (e.g. contest winners). Nothing renders when empty. */
  text?: string | null;
  /** Optional image (upload or any link) shown in the announcement. */
  imageUrl?: string | null;
  /** Optional short video (direct/Drive/R2 URL) — takes the image's place. */
  videoUrl?: string | null;
  /** "popup" = big centered card over the video; "fullscreen" = takes over the whole video area. */
  displayStyle?: "popup" | "fullscreen";
  /** Seconds the announcement stays visible each time. */
  visibleSeconds?: number;
  /** Minutes between repeats. */
  repeatMinutes?: number;
}

/**
 * Admin-controlled announcement over the VIDEO area (never the rate card),
 * per the client (2026-07-13): appears for a few seconds on an interval —
 * either a BIG centered pop-up card, or a full takeover of the video area.
 * Carries text, an image, or a muted video.
 */
export function AnnouncementBanner({
  text,
  imageUrl,
  videoUrl,
  displayStyle = "popup",
  visibleSeconds = 5,
  repeatMinutes = 3,
}: AnnouncementBannerProps) {
  const message = text?.trim() || "";
  const image = imageUrl?.trim() || "";
  const video = videoUrl?.trim() || "";
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!message && !image && !video) return;
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
  }, [message, image, video, visibleSeconds, repeatMinutes]);

  if (!message && !image && !video) return null;

  // Remount media on each showing so videos restart from the beginning.
  const mediaKey = visible ? "on" : "off";

  if (displayStyle === "fullscreen") {
    return (
      <div
        aria-live="polite"
        className={`absolute inset-0 z-40 flex flex-col transition-opacity duration-500 ${
          visible ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        style={{ backgroundColor: "#0D2680" }}
      >
        {video ? (
          visible ? (
            <video
              key={mediaKey}
              src={video}
              className="min-h-0 w-full flex-1 object-contain"
              autoPlay
              muted
              loop
              playsInline
            />
          ) : (
            <div className="min-h-0 flex-1" />
          )
        ) : image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" className="min-h-0 w-full flex-1 object-contain" />
        ) : null}
        {message ? (
          <p
            className="shrink-0 px-[3vw] py-[2.2vh] text-center font-extrabold uppercase leading-tight text-white"
            style={{
              fontFamily: "var(--font-brand), 'Trebuchet MS', sans-serif",
              fontSize: video || image ? "clamp(1.1rem,2.4vw,2.6rem)" : "clamp(1.6rem,3.6vw,4rem)",
              textShadow: "0 2px 10px rgba(0,0,0,0.4)",
            }}
          >
            {message}
          </p>
        ) : null}
        <div className="h-[0.6vh] w-full shrink-0" style={{ backgroundColor: UNIMONI_COLORS.gold }} />
      </div>
    );
  }

  // BIG centered pop-up card — sized for TV advertising, over the video only.
  return (
    <div
      aria-live="polite"
      className={`pointer-events-none absolute inset-0 z-40 flex items-center justify-center transition-all duration-500 ease-out ${
        visible ? "translate-y-0 opacity-100" : "-translate-y-[10vh] opacity-0"
      }`}
    >
      <div
        className="flex max-h-[82%] max-w-[78%] min-w-[45%] flex-col items-center gap-[1.4vh] overflow-hidden rounded-2xl border-4 px-[1.6vw] py-[2vh] shadow-[0_14px_50px_rgba(0,0,0,0.6)]"
        style={{ backgroundColor: "#FFFFFF", borderColor: UNIMONI_COLORS.gold }}
      >
        {video ? (
          visible ? (
            <video
              key={mediaKey}
              src={video}
              className="min-h-0 w-full flex-1 rounded-lg object-contain"
              style={{ maxHeight: "52vh" }}
              autoPlay
              muted
              loop
              playsInline
            />
          ) : null
        ) : image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt=""
            className="min-h-0 w-full flex-1 rounded-lg object-contain"
            style={{ maxHeight: "52vh" }}
          />
        ) : null}
        {message ? (
          <p
            className="shrink-0 px-2 text-center font-extrabold uppercase leading-tight"
            style={{
              color: "#0D2680",
              fontFamily: "var(--font-brand), 'Trebuchet MS', sans-serif",
              fontSize: video || image ? "clamp(1rem,1.9vw,2rem)" : "clamp(1.4rem,3vw,3.2rem)",
            }}
          >
            {message}
          </p>
        ) : null}
      </div>
    </div>
  );
}
