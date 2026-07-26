"use client";

import { useState, type CSSProperties } from "react";
import Image from "next/image";
import { UNIMONI_COLORS } from "@/lib/unimoni-signage";
import { promoTransitionDurationMs, slideTransitionClass } from "@/lib/constants";

interface UnimoniPromoPanelProps {
  videoUrl?: string | null;
  imageUrl?: string | null;
  videoLoaded?: boolean;
  loopVideo?: boolean;
  /** "stretch" = stretch to exactly fill (old-player behaviour); "auto" = area resizes to the media; "contain" = whole media + blurred fill; "cover" = fill & crop. */
  fit?: "contain" | "cover" | "auto" | "stretch";
  /** Width of the promo area as a % of the screen (desktop/TV only). */
  widthPercent?: number;
  /** Play the branch video WITH sound (default muted). */
  soundOn?: boolean;
  /** Reports the current media's aspect ratio (w/h) so "auto" can size the area to it. */
  onMediaAspectChange?: (aspect: number | null) => void;
  onVideoLoaded?: () => void;
  onVideoError?: () => void;
  onVideoEnded?: () => void;
  /** Fires on every playback progress tick — feeds the display's stall watchdog. */
  onVideoProgress?: () => void;
  className?: string;
  /** Transition when the image/video changes. Default fade. */
  mediaTransition?: string;
  /** How long that entrance animation lasts (seconds). */
  mediaTransitionSeconds?: number | null;
  /** Changes on every play-order STEP — remounts the media element so the SAME
      video repeated back-to-back restarts instead of freezing on its last frame. */
  mediaKey?: string | number;
  /** Show the unimoni logo chip on the navy cover between clips. OFF = plain
      navy panel — the cover itself ALWAYS stays, so the TV's play button is
      never visible either way (per client, 2026-07-26). */
  showCoverLogo?: boolean;
  /** Overlays scoped to the promo area (e.g. the drop-down announcement). */
  children?: React.ReactNode;
}

export function UnimoniPromoPanel({
  videoUrl,
  imageUrl,
  videoLoaded = false,
  loopVideo = true,
  fit = "stretch",
  widthPercent,
  soundOn = false,
  onMediaAspectChange,
  onVideoLoaded,
  onVideoError,
  onVideoEnded,
  onVideoProgress,
  className = "",
  mediaTransition = "fade",
  mediaTransitionSeconds = null,
  mediaKey,
  showCoverLogo = true,
  children,
}: UnimoniPromoPanelProps) {
  // A broken advert image URL must fall back to the branded placeholder, not
  // leave two-thirds of the TV black. Tracking the URL that failed (instead of
  // a boolean) means a new/fixed URL retries automatically — no reset effect.
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  // Which clip is ACTUALLY rendering frames — drives the swap cover below.
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);
  const imageFailed = Boolean(imageUrl) && failedImageUrl === imageUrl;

  const showVideo = Boolean(videoUrl);
  const showImage = Boolean(imageUrl) && !showVideo && !imageFailed;
  const showPlaceholder = !showVideo && !showImage;

  // "stretch" (default): media is stretched to exactly fill the fixed area —
  // whole content visible, no bars, no crop (matches the client's previous
  // signage player; the mild distortion is invisible on promo content).
  // "auto": the promo AREA is resized to the media's shape upstream, then
  // object-contain fills it. "contain": whole media on a blurred fill.
  // "cover": fill a fixed area, cropping edges.
  const objectClass =
    fit === "stretch" ? "object-fill" : fit === "cover" ? "object-cover" : "object-contain";
  const useBackdrop = fit === "contain";
  const mediaAnimMs = typeof mediaTransitionSeconds === "number" ? Math.round(mediaTransitionSeconds * 1000) : promoTransitionDurationMs;
  const mediaAnimStyle = { animationDuration: `${mediaAnimMs}ms` } as CSSProperties;
  const mediaAnimClass = slideTransitionClass(mediaTransition);

  const panelStyle: CSSProperties =
    showVideo || showImage ? {} : { backgroundColor: UNIMONI_COLORS.panelBlue };
  if (widthPercent) panelStyle.width = `${widthPercent}%`;

  return (
    <section
      className={`display-promo-panel relative flex h-full w-full min-h-0 shrink-0 flex-col overflow-hidden bg-black transition-[width] duration-500 ease-out lg:w-[65%] xl:w-[68%] ${className}`}
      style={panelStyle}
    >
      {showVideo ? (
        // Native <video> — including Google Drive direct-stream URLs. The full
        // video is visible (contain) over a blurred copy of itself (backdrop),
        // so there is neither cropping nor black/blank space.
        <>
          {useBackdrop ? (
            <video
              key={`${videoUrl}-bg`}
              src={videoUrl ?? undefined}
              className="absolute inset-0 z-0 h-full w-full scale-110 object-cover blur-2xl brightness-[0.5]"
              autoPlay
              muted
              loop
              playsInline
              aria-hidden
            />
          ) : null}
          <video
            key={`${videoUrl}-${mediaKey ?? ""}`}
            src={videoUrl ?? undefined}
            // The entrance animation must start when the navy swap cover lifts
            // (playingUrl === videoUrl), not at mount — otherwise it finishes
            // invisibly UNDER the still-opaque cover while the clip buffers.
            className={`absolute inset-0 z-[1] h-full w-full ${objectClass} ${
              playingUrl === videoUrl ? mediaAnimClass : ""
            }`}
            style={mediaAnimStyle}
            autoPlay
            muted={!soundOn}
            loop={loopVideo}
            playsInline
            // Buffer the next clip ahead of time so switching videos doesn't
            // stall on a not-yet-loaded (paused) frame that paints a play button.
            preload="auto"
            // No native controls / picture-in-picture — this is signage, not a
            // player. Belt-and-suspenders with the global CSS that hides the
            // WebView's play-button overlay on smart TVs.
            controls={false}
            disablePictureInPicture
            onLoadedMetadata={(e) => {
              const v = e.currentTarget;
              if (v.videoWidth && v.videoHeight) onMediaAspectChange?.(v.videoWidth / v.videoHeight);
            }}
            // A paused video is what makes TV browsers paint their own big
            // play button — never stay paused unless the video actually ended.
            onPause={(e) => {
              const v = e.currentTarget;
              if (!v.ended && !v.seeking) {
                void v.play().catch(() => {});
              }
            }}
            onLoadedData={onVideoLoaded}
            onTimeUpdate={onVideoProgress}
            onPlaying={() => setPlayingUrl(videoUrl ?? null)}
            onCanPlay={(e) => {
              // Some TV WebViews leave a freshly-loaded video paused (showing the
              // big play button) until told to play — force it. Try with sound if
              // requested; if the browser blocks unmuted autoplay, fall back to
              // muted so the video always PLAYS (never stranded paused behind a
              // play button). A tap / fullscreen unmutes later.
              const v = e.currentTarget;
              v.muted = !soundOn;
              void v.play().catch(() => {
                v.muted = true;
                void v.play().catch(() => {});
              });
              onVideoLoaded?.();
            }}
            onError={onVideoError}
            onEnded={onVideoEnded}
          />
        </>
      ) : showImage ? (
        <>
          {useBackdrop ? (
            <Image
              key={`${imageUrl}-bg`}
              src={imageUrl!}
              alt=""
              aria-hidden
              fill
              className="absolute inset-0 z-0 scale-110 object-cover blur-2xl brightness-[0.55]"
              unoptimized
            />
          ) : null}
          <div
            key={`${imageUrl}-${mediaKey ?? ""}`}
            className={`absolute inset-0 z-[1] ${mediaAnimClass}`}
            style={mediaAnimStyle}
          >
            <Image
              src={imageUrl!}
              alt="Branch advert"
              fill
              className={objectClass}
              unoptimized
              priority
              onLoad={(e) => {
                const img = e.currentTarget as HTMLImageElement;
                if (img.naturalWidth && img.naturalHeight)
                  onMediaAspectChange?.(img.naturalWidth / img.naturalHeight);
              }}
              onError={() => setFailedImageUrl(imageUrl ?? null)}
            />
          </div>
        </>
      ) : null}

      {/* SWAP COVER — while the next clip loads (between videos / at the end of
          the playlist loop), some TV browsers paint their own giant play button
          over the paused video. CSS can't remove that native overlay, so we
          simply COVER the video with a branded navy panel until the new clip is
          actually playing, then fade it away. Viewers see a clean logo moment,
          never the TV's play button. */}
      {showVideo ? (
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-0 z-[4] flex items-center justify-center bg-[#0B1F3A] transition-opacity duration-500 ${
            videoLoaded && playingUrl === videoUrl ? "opacity-0" : "opacity-100"
          }`}
        >
          {/* The logo chip is optional (admin switch); the navy COVER itself is
              not — it is what keeps the TV's giant play button hidden while the
              next clip loads, so it stays even with the logo turned off. */}
          {showCoverLogo ? (
            <div className="rounded-2xl bg-white px-6 py-4 shadow-lg">
              <Image
                src="/unimoni-logo-full.png"
                alt=""
                width={300}
                height={97}
                className="h-[clamp(2rem,6vh,4rem)] w-auto object-contain"
                unoptimized
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {showPlaceholder ? (
        <div className="absolute inset-0 z-[5] flex flex-col items-center justify-center gap-4 bg-[#0B1F3A]/80 px-6 text-center">
          <div className="rounded-2xl bg-white px-6 py-4 shadow-lg">
            <Image
              src="/unimoni-logo-full.png"
              alt="unimoni"
              width={300}
              height={97}
              className="h-[clamp(2.5rem,7vh,5rem)] w-auto object-contain"
              unoptimized
              priority
            />
          </div>
          <p className="text-[clamp(0.95rem,1.5vw,1.25rem)] font-medium tracking-wide text-white/90">
            Branch promotional video
          </p>
          <p className="max-w-md text-[clamp(0.75rem,1.1vw,0.9rem)] leading-relaxed text-white/55">
            Upload content in Dashboard → Videos for this branch.
          </p>
        </div>
      ) : null}

      {/* The app-added "unimoni.com" caption over adverts was removed per the
          client — uploaded images are already branded, so nothing is drawn on
          top of them. */}

      {children}
    </section>
  );
}
