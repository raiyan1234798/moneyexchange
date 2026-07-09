"use client";

import { useState } from "react";
import Image from "next/image";
import { UnimoniMark } from "@/components/brand/unimoni-logo";
import { UNIMONI_COLORS } from "@/lib/unimoni-signage";

interface UnimoniPromoPanelProps {
  videoUrl?: string | null;
  imageUrl?: string | null;
  videoLoaded?: boolean;
  loopVideo?: boolean;
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

  return (
    <section
      className={`display-promo-panel relative flex h-full w-full min-h-0 shrink-0 flex-col overflow-hidden bg-black lg:w-[65%] xl:w-[68%] ${className}`}
      style={
        showVideo || showImage ? undefined : { backgroundColor: UNIMONI_COLORS.panelBlue }
      }
    >
      {showVideo ? (
        // Always the native <video> element — including Google Drive links
        // (stored as direct-stream drive.usercontent.google.com URLs). The
        // Drive /preview iframe cannot autoplay or loop, which strands an
        // unattended TV on a play button / end screen.
        <video
          key={videoUrl}
          src={videoUrl ?? undefined}
          className="absolute inset-0 z-0 h-full w-full object-cover"
          autoPlay
          muted
          loop={loopVideo}
          playsInline
          onLoadedData={onVideoLoaded}
          onCanPlay={onVideoLoaded}
          onError={onVideoError}
          onEnded={onVideoEnded}
        />
      ) : showImage ? (
        <Image
          key={imageUrl}
          src={imageUrl!}
          alt="Branch advert"
          fill
          className="absolute inset-0 z-0 object-cover"
          unoptimized
          priority
          onError={() => setFailedImageUrl(imageUrl ?? null)}
        />
      ) : null}

      {showPlaceholder ? (
        <div className="absolute inset-0 z-[5] flex flex-col items-center justify-center gap-3 bg-[#0B1F3A]/80 px-6 text-center">
          <UnimoniMark size={72} className="shadow-lg" />
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
