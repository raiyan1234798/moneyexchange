"use client";

import { useState, type CSSProperties } from "react";
import Image from "next/image";
import { UNIMONI_COLORS } from "@/lib/unimoni-signage";

interface UnimoniPromoPanelProps {
  videoUrl?: string | null;
  imageUrl?: string | null;
  videoLoaded?: boolean;
  loopVideo?: boolean;
  /** "contain" = whole video/image visible (letterbox); "cover" = fill & crop. */
  fit?: "contain" | "cover";
  /** Width of the promo area as a % of the screen (desktop/TV only). */
  widthPercent?: number;
  onVideoLoaded?: () => void;
  onVideoError?: () => void;
  onVideoEnded?: () => void;
  className?: string;
}

export function UnimoniPromoPanel({
  videoUrl,
  imageUrl,
  videoLoaded = false,
  loopVideo = true,
  fit = "contain",
  widthPercent,
  onVideoLoaded,
  onVideoError,
  onVideoEnded,
  className = "",
}: UnimoniPromoPanelProps) {
  // A broken advert image URL must fall back to the branded placeholder, not
  // leave two-thirds of the TV black. Tracking the URL that failed (instead of
  // a boolean) means a new/fixed URL retries automatically — no reset effect.
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const imageFailed = Boolean(imageUrl) && failedImageUrl === imageUrl;

  const showVideo = Boolean(videoUrl);
  const showImage = Boolean(imageUrl) && !showVideo && !imageFailed;
  const showPlaceholder = !showVideo && !showImage;
  const showBrandingOverlay = showPlaceholder || (showImage && !videoLoaded);

  // Default ("contain") = show the WHOLE video/image with NO black bars: the
  // full media plays on top (object-contain) over a blurred, zoomed copy that
  // fills the surrounding space. "cover" = a single element that fills & crops
  // the edges (cheapest — no second decode). Chosen per-branch in Settings.
  const useBackdrop = fit !== "cover";

  const panelStyle: CSSProperties =
    showVideo || showImage ? {} : { backgroundColor: UNIMONI_COLORS.panelBlue };
  if (widthPercent) panelStyle.width = `${widthPercent}%`;

  return (
    <section
      className={`display-promo-panel relative flex h-full w-full min-h-0 shrink-0 flex-col overflow-hidden bg-black lg:w-[65%] xl:w-[68%] ${className}`}
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
            key={videoUrl}
            src={videoUrl ?? undefined}
            className={`absolute inset-0 z-[1] h-full w-full ${useBackdrop ? "object-contain" : "object-cover"}`}
            autoPlay
            muted
            loop={loopVideo}
            playsInline
            onLoadedData={onVideoLoaded}
            onCanPlay={onVideoLoaded}
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
          <Image
            key={imageUrl}
            src={imageUrl!}
            alt="Branch advert"
            fill
            className={`absolute inset-0 z-[1] ${useBackdrop ? "object-contain" : "object-cover"}`}
            unoptimized
            priority
            onError={() => setFailedImageUrl(imageUrl ?? null)}
          />
        </>
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

      {showBrandingOverlay && showImage ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/70 to-transparent px-6 py-4">
          <p className="text-center font-[Arial,Helvetica,sans-serif] text-[clamp(0.7rem,1.1vw,0.9rem)] font-medium text-white/90">
            unimoni.com
          </p>
        </div>
      ) : null}
    </section>
  );
}
