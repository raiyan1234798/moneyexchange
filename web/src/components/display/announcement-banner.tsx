"use client";

import { useEffect, useRef, useState } from "react";
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
/** Shared show/hide cycle: appears for N seconds, repeats every M minutes. */
export function useAnnouncementCycle(
  active: boolean,
  visibleSeconds = 5,
  repeatMinutes = 3,
): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!active) {
      setVisible(false);
      return;
    }
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
  }, [active, visibleSeconds, repeatMinutes]);

  return visible;
}

/**
 * Announcement as a bold YELLOW BAND in the ticker area (like the client's
 * reference): swapped in for the scrolling bar during the announcement, no
 * animation, back to the normal ticker afterwards. Rendered by display-screen.
 */
export function TickerAnnouncementBand({
  text,
  imageUrl,
  heightScale = 1,
}: {
  text?: string | null;
  imageUrl?: string | null;
  heightScale?: number;
}) {
  const message = text?.trim() || "";
  const image = imageUrl?.trim() || "";
  return (
    <footer
      className="relative flex shrink-0 items-center justify-center gap-[1.2vw] overflow-hidden px-[1.5vw]"
      style={{
        height: `calc(clamp(3rem,6vh,4.5rem) * ${heightScale})`,
        backgroundColor: "#F5B800",
        borderTop: "3px solid #1A73C9",
        borderBottom: "3px solid #1A73C9",
      }}
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className="h-[86%] w-auto shrink-0 rounded-sm object-contain" />
      ) : null}
      <p
        className="min-w-0 truncate text-center font-extrabold uppercase leading-none text-white"
        style={{
          fontFamily: "var(--font-brand), 'Trebuchet MS', sans-serif",
          fontSize: `calc(clamp(1.4rem,3vh,2.6rem) * ${heightScale})`,
          textShadow: "0 2px 4px rgba(0,0,0,0.35)",
          letterSpacing: "0.04em",
        }}
      >
        {message}
      </p>
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className="h-[86%] w-auto shrink-0 rounded-sm object-contain" />
      ) : null}
    </footer>
  );
}

/**
 * Animated announcement that takes over the DISPLAY MESSAGE AREA (the bottom
 * ticker strip) for a set time, then animates away and hands the strip back to
 * the normal scrolling message. Per the client (2026-07-13): "play images or
 * videos or texts in the display message area for the needed seconds/minutes,
 * then go back to normal — with animation."
 *
 * Text-only shows a thin yellow strip (ticker height). With an image/video the
 * band grows into an "L-band" panel so the media is clearly visible, then
 * shrinks back. `visible` is driven by the shared show/hide cycle; the element
 * stays mounted so the exit animation can play.
 */
export function MessageAreaAnnouncement({
  text,
  imageUrl,
  videoUrl,
  visible,
  animation = "slide",
  heightScale = 1,
}: {
  text?: string | null;
  imageUrl?: string | null;
  videoUrl?: string | null;
  visible: boolean;
  animation?: "slide" | "fade" | "zoom" | "flip";
  heightScale?: number;
}) {
  const message = text?.trim() || "";
  const image = imageUrl?.trim() || "";
  const video = videoUrl?.trim() || "";
  const hasMedia = Boolean(image || video);

  // Restart the video from the top each time the band re-appears. The video
  // stays mounted (even while hidden) so it fades out WITH the band instead of
  // snapping to a blank panel mid-animation. Hooks run before any early return.
  const [showCount, setShowCount] = useState(0);
  const wasVisibleRef = useRef(false);
  useEffect(() => {
    if (visible && !wasVisibleRef.current) setShowCount((count) => count + 1);
    wasVisibleRef.current = visible;
  }, [visible]);

  if (!message && !hasMedia) return null;

  // Grows for media so images/video are readable; thin strip for text only.
  const bandHeight = video
    ? "clamp(11rem,40vh,32rem)"
    : image
      ? "clamp(9rem,32vh,26rem)"
      : undefined;

  const hiddenTransform =
    animation === "fade"
      ? "none"
      : animation === "zoom"
        ? "scale(0.55)"
        : animation === "flip"
          ? "rotateX(-92deg)"
          : "translateY(112%)"; // slide (default)

  return (
    <div
      aria-live="polite"
      // Above the ticker's pop-out logo badge (z-40) so the band fully covers it.
      className="pointer-events-none absolute inset-x-0 bottom-0 z-50"
      style={{ perspective: animation === "flip" ? "1400px" : undefined }}
    >
      <div
        className="w-full overflow-hidden transition-all duration-500 ease-out"
        style={{
          transformOrigin: "bottom center",
          transform: visible ? "none" : hiddenTransform,
          opacity: visible ? 1 : 0,
        }}
      >
        {hasMedia ? (
          <div className="flex w-full flex-col bg-[#0D2680]" style={{ height: bandHeight }}>
            <div className="relative min-h-0 flex-1">
              {video ? (
                <video
                  key={showCount}
                  src={video}
                  className="h-full w-full object-contain"
                  autoPlay
                  muted
                  loop
                  playsInline
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={image} alt="" className="h-full w-full object-contain" />
              )}
            </div>
            {message ? <TickerAnnouncementBand text={message} heightScale={heightScale} /> : null}
          </div>
        ) : (
          <TickerAnnouncementBand text={message} heightScale={heightScale} />
        )}
      </div>
    </div>
  );
}

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
  const visible = useAnnouncementCycle(
    Boolean(message || image || video),
    visibleSeconds,
    repeatMinutes,
  );

  // Restart the video from the top each time the announcement re-appears while
  // keeping it mounted the whole cycle, so it fades out WITH the overlay instead
  // of snapping to a blank panel. Hooks run before any early return.
  const [showCount, setShowCount] = useState(0);
  const wasVisibleRef = useRef(false);
  useEffect(() => {
    if (visible && !wasVisibleRef.current) setShowCount((count) => count + 1);
    wasVisibleRef.current = visible;
  }, [visible]);

  if (!message && !image && !video) return null;

  const hasMedia = Boolean(video || image);

  if (displayStyle === "fullscreen") {
    return (
      <div
        aria-live="polite"
        className={`absolute inset-0 z-40 flex flex-col transition-opacity duration-500 ${
          visible ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        // Only cover the branch video with the opaque blue takeover when there is
        // actual media to show. Text-only stays transparent so the branch video
        // keeps playing underneath and the screen never goes blank.
        style={hasMedia ? { backgroundColor: "#0D2680" } : undefined}
      >
        {video ? (
          <video
            key={showCount}
            src={video}
            className="min-h-0 w-full flex-1 object-contain"
            autoPlay
            muted
            loop
            playsInline
          />
        ) : image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" className="min-h-0 w-full flex-1 object-contain" />
        ) : (
          // No media: leave the branch video visible; the text sits at the bottom.
          <div className="min-h-0 flex-1" />
        )}
        {message ? (
          <p
            className="shrink-0 px-[3vw] py-[2.2vh] text-center font-extrabold uppercase leading-tight text-white"
            style={{
              fontFamily: "var(--font-brand), 'Trebuchet MS', sans-serif",
              fontSize: hasMedia ? "clamp(1.1rem,2.4vw,2.6rem)" : "clamp(1.6rem,3.6vw,4rem)",
              textShadow: "0 2px 10px rgba(0,0,0,0.55)",
              // Text-only gets its own readable band so it stands out over the video.
              background: hasMedia
                ? undefined
                : "linear-gradient(to top, rgba(13,38,128,0.94), rgba(13,38,128,0.5))",
            }}
          >
            {message}
          </p>
        ) : null}
        {hasMedia ? (
          <div className="h-[0.6vh] w-full shrink-0" style={{ backgroundColor: UNIMONI_COLORS.gold }} />
        ) : null}
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
          <video
            key={showCount}
            src={video}
            className="min-h-0 w-full flex-1 rounded-lg object-contain"
            style={{ maxHeight: "52vh" }}
            autoPlay
            muted
            loop
            playsInline
          />
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
