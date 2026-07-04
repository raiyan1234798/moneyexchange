"use client";

import Image from "next/image";
import {
  UNIMONI_COLORS,
  UNIMONI_CONTACT_LINE,
  UNIMONI_LOCATIONS,
  UNIMONI_WEBSITE,
} from "@/lib/unimoni-signage";

const BRANDING_TEXT_SHADOW =
  "0 1px 2px rgba(0,0,0,0.9), 0 2px 8px rgba(0,0,0,0.75), 0 0 20px rgba(0,0,0,0.5)";

interface UnimoniPromoPanelProps {
  videoUrl?: string | null;
  imageUrl?: string | null;
  videoLoaded?: boolean;
  loopVideo?: boolean;
  onVideoLoaded?: () => void;
  onVideoError?: () => void;
  onVideoEnded?: () => void;
}

export function UnimoniPromoPanel({
  videoUrl,
  imageUrl,
  loopVideo = true,
  onVideoLoaded,
  onVideoError,
  onVideoEnded,
}: UnimoniPromoPanelProps) {
  const showVideo = Boolean(videoUrl);
  const showImage = Boolean(imageUrl) && !showVideo;

  return (
    <section
      className="relative flex h-full w-[70%] shrink-0 flex-col overflow-hidden bg-black"
      style={
        showVideo || showImage
          ? undefined
          : { backgroundColor: UNIMONI_COLORS.panelBlue }
      }
    >
      {showVideo ? (
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
        />
      ) : null}

      <div
        className="pointer-events-none relative z-10 flex h-full flex-col items-center justify-between px-[clamp(1.5rem,4vw,3rem)] py-[clamp(1.5rem,3vh,2.5rem)] text-center font-[Arial,Helvetica,sans-serif] text-white"
        style={{ textShadow: BRANDING_TEXT_SHADOW }}
      >
        <div className="flex w-full max-w-[min(90%,42rem)] flex-col items-center gap-[clamp(0.5rem,1.2vh,1rem)]">
          <Image
            src="/unimoni-logo.svg"
            alt="unimoni"
            width={420}
            height={90}
            className="h-[clamp(3rem,8vh,5.5rem)] w-auto drop-shadow-[0_2px_8px_rgba(0,0,0,0.85)]"
            priority
            unoptimized
          />
          <p className="text-[clamp(1rem,1.8vw,1.5rem)] font-medium tracking-wide">
            {UNIMONI_WEBSITE}
          </p>
          <p className="text-[clamp(0.85rem,1.4vw,1.15rem)] font-medium leading-snug">
            {UNIMONI_CONTACT_LINE}
          </p>
        </div>

        <div className="w-full max-w-[min(95%,48rem)] space-y-[clamp(0.35rem,0.8vh,0.65rem)]">
          <p className="text-[clamp(0.9rem,1.35vw,1.1rem)] font-semibold uppercase tracking-wide">
            Visit us at
          </p>
          {UNIMONI_LOCATIONS.map((line) => (
            <p
              key={line}
              className="text-[clamp(0.75rem,1.15vw,0.95rem)] leading-snug"
            >
              {line}
            </p>
          ))}
        </div>
      </div>
    </section>
  );
}
