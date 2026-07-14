"use client";

import { type CSSProperties, useEffect, useRef, useState } from "react";
import { UNIMONI_COLORS } from "@/lib/unimoni-signage";

// Broadcast-style easing: a smooth "expo-out" deceleration so overlays glide in
// like TV motion graphics, not snap in like an artificial pop-up. Paired with a
// slightly longer duration for that filmed feel.
const CINEMATIC_EASE = "cubic-bezier(0.16, 1, 0.3, 1)";
const ANIM_MS = 700;
const CINEMATIC_TRANSITION = `transform ${ANIM_MS}ms ${CINEMATIC_EASE}, opacity ${ANIM_MS}ms ${CINEMATIC_EASE}`;

interface AnnouncementBannerProps {
  /** Short announcement text (e.g. contest winners). Nothing renders when empty. */
  text?: string | null;
  /** Optional image (upload or any link) shown in the announcement. */
  imageUrl?: string | null;
  /** Optional short video (direct/Drive/R2 URL) — takes the image's place. */
  videoUrl?: string | null;
  /** "popup" = centered card; "fullscreen" = whole video area; "lower-third" = broadcast caption over the video. */
  displayStyle?: "popup" | "fullscreen" | "lower-third";
  /** Seconds the announcement stays visible each time. */
  visibleSeconds?: number;
  /** Minutes between repeats. */
  repeatMinutes?: number;
  /** Show only this many times total (0 = repeat forever). */
  maxTimes?: number;
  /** Font family for the text. */
  fontCss?: string;
  /** Colour treatment for the text. */
  colorStyle?: "white" | "logo" | "gold" | "navy";
  /** Entrance/exit motion. "none" = instant (no animation). */
  animation?: "none" | "slide" | "fade" | "zoom" | "flip";
}

/**
 * Admin-controlled announcement over the VIDEO area (never the rate card),
 * per the client (2026-07-13): appears for a few seconds on an interval —
 * either a BIG centered pop-up card, or a full takeover of the video area.
 * Carries text, an image, or a muted video.
 */
/**
 * Shared show/hide cycle: appears for N seconds, repeats every M minutes.
 * When `maxTimes > 0` it plays only that many times total, then stops (so an
 * admin can show a prize announcement e.g. exactly 3 times). `maxTimes = 0`
 * means repeat forever.
 */
export function useAnnouncementCycle(
  active: boolean,
  visibleSeconds = 5,
  repeatMinutes = 3,
  maxTimes = 0,
): boolean {
  const [showing, setShowing] = useState(false);
  const shownCountRef = useRef(0);

  useEffect(() => {
    // When inactive we run no timers; the return value below is gated by
    // `active`, so no synchronous state reset is needed here (avoids the
    // cascading-render foot-gun). The cleanup resets `showing` on teardown.
    if (!active) return;
    shownCountRef.current = 0;
    const showMs = Math.max(2, visibleSeconds) * 1000;
    const gapMs = Math.max(0.5, repeatMinutes) * 60_000;

    let hideTimer: number | undefined;
    const showOnce = () => {
      setShowing(true);
      shownCountRef.current += 1;
      hideTimer = window.setTimeout(() => setShowing(false), showMs);
    };
    // First appearance shortly after load, then repeat on the interval.
    const firstTimer = window.setTimeout(showOnce, 3000);
    const repeatTimer = window.setInterval(() => {
      // Stop once we've shown the requested number of times (0 = forever).
      if (maxTimes > 0 && shownCountRef.current >= maxTimes) {
        window.clearInterval(repeatTimer);
        return;
      }
      showOnce();
    }, gapMs + showMs);

    return () => {
      window.clearTimeout(firstTimer);
      window.clearInterval(repeatTimer);
      if (hideTimer) window.clearTimeout(hideTimer);
      setShowing(false);
    };
  }, [active, visibleSeconds, repeatMinutes, maxTimes]);

  // Gate by `active` so the announcement is never "showing" while inactive,
  // even for one render after `active` flips off.
  return active && showing;
}

/** Resolve a colour treatment for announcement text. "logo" = brand gradient. */
export function announcementTextStyle(
  colorStyle: "white" | "logo" | "gold" | "navy" | undefined,
): CSSProperties {
  switch (colorStyle) {
    case "logo":
      // "Extended version of the logo" — unimoni blue→gold gradient text.
      return {
        backgroundImage: `linear-gradient(90deg, ${UNIMONI_COLORS.navy}, ${UNIMONI_COLORS.gold})`,
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        color: "transparent",
        WebkitTextFillColor: "transparent",
      };
    case "gold":
      return { color: UNIMONI_COLORS.gold };
    case "navy":
      return { color: UNIMONI_COLORS.navy };
    default:
      return { color: "#FFFFFF" };
  }
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
  fontCss,
  colorStyle = "white",
}: {
  text?: string | null;
  imageUrl?: string | null;
  heightScale?: number;
  fontCss?: string;
  colorStyle?: "white" | "logo" | "gold" | "navy";
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
        // No truncate: the text wraps to 2 lines so longer announcements fit
        // ("increase the text limit").
        className="line-clamp-2 min-w-0 text-center font-extrabold uppercase leading-tight"
        style={{
          fontFamily: fontCss ?? "var(--font-brand), 'Trebuchet MS', sans-serif",
          fontSize: `calc(clamp(1.4rem,3vh,2.6rem) * ${heightScale})`,
          textShadow: colorStyle === "logo" ? "none" : "0 2px 4px rgba(0,0,0,0.35)",
          letterSpacing: "0.04em",
          ...announcementTextStyle(colorStyle),
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
  anchor = "bottom",
  fontCss,
  colorStyle = "white",
}: {
  text?: string | null;
  imageUrl?: string | null;
  videoUrl?: string | null;
  visible: boolean;
  animation?: "none" | "slide" | "fade" | "zoom" | "flip";
  heightScale?: number;
  /** Where the strip sits — bottom message area (default) or top of the video. */
  anchor?: "bottom" | "top";
  fontCss?: string;
  colorStyle?: "white" | "logo" | "gold" | "navy";
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

  const slideHidden = anchor === "top" ? "translateY(-112%)" : "translateY(112%)";
  const hiddenTransform =
    animation === "none" || animation === "fade"
      ? "none"
      : animation === "zoom"
        ? "scale(0.55)"
        : animation === "flip"
          ? "rotateX(-92deg)"
          : slideHidden; // slide (default)

  return (
    <div
      aria-live="polite"
      // Above the ticker's pop-out logo badge (z-40) so the band fully covers it.
      className={`pointer-events-none absolute inset-x-0 z-50 ${anchor === "top" ? "top-0" : "bottom-0"}`}
      style={{ perspective: animation === "flip" ? "1400px" : undefined }}
    >
      <div
        className="w-full overflow-hidden"
        style={{
          transformOrigin: anchor === "top" ? "top center" : "bottom center",
          transform: visible ? "none" : hiddenTransform,
          opacity: visible ? 1 : 0,
          transition: animation === "none" ? "none" : CINEMATIC_TRANSITION,
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
            {message ? (
              <TickerAnnouncementBand
                text={message}
                heightScale={heightScale}
                fontCss={fontCss}
                colorStyle={colorStyle}
              />
            ) : null}
          </div>
        ) : (
          <TickerAnnouncementBand
            text={message}
            heightScale={heightScale}
            fontCss={fontCss}
            colorStyle={colorStyle}
          />
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
  maxTimes = 0,
  fontCss,
  colorStyle = "white",
  animation = "slide",
}: AnnouncementBannerProps) {
  const message = text?.trim() || "";
  const image = imageUrl?.trim() || "";
  const video = videoUrl?.trim() || "";
  const visible = useAnnouncementCycle(
    Boolean(message || image || video),
    visibleSeconds,
    repeatMinutes,
    maxTimes,
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

  // Entrance/exit motion shared by pop-up + full screen. "none" is instant.
  const shownTransform =
    animation === "zoom"
      ? "scale(1)"
      : animation === "flip"
        ? "perspective(1400px) rotateX(0deg)"
        : animation === "slide"
          ? "translateY(0)"
          : "none";
  const hiddenTransform =
    animation === "none" || animation === "fade"
      ? "none"
      : animation === "zoom"
        ? "scale(0.6)"
        : animation === "flip"
          ? "perspective(1400px) rotateX(-90deg)"
          : "translateY(8vh)";
  const animStyle = {
    transform: visible ? shownTransform : hiddenTransform,
    opacity: visible ? 1 : 0,
    transition: animation === "none" ? "none" : CINEMATIC_TRANSITION,
  } as const;

  // Broadcast lower-third: a translucent gradient caption anchored to the bottom
  // of the video, with a gold accent bar and optional small media — like a TV
  // news graphic that belongs to the footage, not a modal pop-up.
  if (displayStyle === "lower-third") {
    return (
      <div
        aria-live="polite"
        className="pointer-events-none absolute inset-0 z-40 flex flex-col justify-end overflow-hidden"
        style={{ perspective: animation === "flip" ? "1400px" : undefined }}
      >
        <div
          className="w-full"
          style={{ transformOrigin: "bottom center", ...animStyle }}
        >
          <div
            className="flex items-end gap-[1.5vw] px-[3vw] pb-[4.5vh]"
            style={{
              paddingTop: "14vh",
              background:
                "linear-gradient(to top, rgba(13,38,128,0.94) 0%, rgba(13,38,128,0.78) 42%, rgba(13,38,128,0) 100%)",
            }}
          >
            {video ? (
              <video
                key={showCount}
                src={video}
                className="h-[16vh] w-auto shrink-0 rounded-md object-cover shadow-lg"
                autoPlay
                muted
                loop
                playsInline
              />
            ) : image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image} alt="" className="h-[16vh] w-auto shrink-0 rounded-md object-contain shadow-lg" />
            ) : null}
            {message ? (
              <div className="flex min-w-0 flex-1 flex-col">
                <span
                  className="mb-[1.2vh] block h-[0.55vh] w-[6vw] rounded-full"
                  style={{ backgroundColor: UNIMONI_COLORS.gold }}
                />
                <p
                  className="font-extrabold uppercase leading-tight"
                  style={{
                    fontFamily: fontCss ?? "var(--font-brand), 'Trebuchet MS', sans-serif",
                    fontSize: "clamp(1.2rem,2.8vw,3rem)",
                    textShadow: colorStyle === "logo" ? "none" : "0 2px 10px rgba(0,0,0,0.5)",
                    ...announcementTextStyle(colorStyle),
                  }}
                >
                  {message}
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  if (displayStyle === "fullscreen") {
    return (
      <div
        aria-live="polite"
        className={`absolute inset-0 z-40 flex flex-col ${visible ? "" : "pointer-events-none"}`}
        // Only cover the branch video with the opaque blue takeover when there is
        // actual media to show. Text-only stays transparent so the branch video
        // keeps playing underneath and the screen never goes blank.
        style={{
          ...(hasMedia ? { backgroundColor: "#0D2680" } : {}),
          transformOrigin: "center",
          ...animStyle,
        }}
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
              fontFamily: fontCss ?? "var(--font-brand), 'Trebuchet MS', sans-serif",
              fontSize: hasMedia ? "clamp(1.1rem,2.4vw,2.6rem)" : "clamp(1.6rem,3.6vw,4rem)",
              textShadow: colorStyle === "logo" ? "none" : "0 2px 10px rgba(0,0,0,0.55)",
              // Text-only gets its own readable band so it stands out over the video.
              background: hasMedia
                ? undefined
                : "linear-gradient(to top, rgba(13,38,128,0.94), rgba(13,38,128,0.5))",
              ...announcementTextStyle(colorStyle),
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

  // BIG centered card — sized for TV advertising, over the video only. Only the
  // card animates (per the chosen animation); the centering layer stays still.
  return (
    <div
      aria-live="polite"
      className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center"
    >
      <div
        className="flex max-h-[82%] max-w-[78%] min-w-[45%] flex-col items-center gap-[1.4vh] overflow-hidden rounded-2xl border-4 px-[1.6vw] py-[2vh] shadow-[0_14px_50px_rgba(0,0,0,0.6)]"
        style={{
          backgroundColor: "#FFFFFF",
          borderColor: UNIMONI_COLORS.gold,
          transformOrigin: "center",
          ...animStyle,
        }}
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
              // Popup sits on a WHITE card: keep navy unless a non-white colour
              // (gold / logo gradient) was explicitly chosen.
              color: "#0D2680",
              fontFamily: fontCss ?? "var(--font-brand), 'Trebuchet MS', sans-serif",
              fontSize: video || image ? "clamp(1rem,1.9vw,2rem)" : "clamp(1.4rem,3vw,3.2rem)",
              ...(colorStyle && colorStyle !== "white" ? announcementTextStyle(colorStyle) : {}),
            }}
          >
            {message}
          </p>
        ) : null}
      </div>
    </div>
  );
}
