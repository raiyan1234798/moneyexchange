"use client";

import { useState, type CSSProperties } from "react";
import Image from "next/image";
import { UnimoniLogoImage } from "@/components/brand/unimoni-logo";
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
  /** "stretch" = stretch to exactly fill (old-player behaviour); "auto" = area resizes to the media; "contain" = whole media + blurred fill; "cover" = fill & crop. */
  fit?: "contain" | "cover" | "auto" | "stretch";
  /** Width of the promo area as a % of the screen (desktop/TV only). */
  widthPercent?: number;
  /** Play the branch video WITH sound (default muted). */
  soundOn?: boolean;
  /** Custom logo for the glass branding overlay (top-left). Falls back to unimoni. */
  overlayLogoUrl?: string | null;
  /** Optional contact line override (defaults to branch signage line). */
  contactLine?: string | null;
  /** Show the frosted-glass branding overlay (logo, website, locations). */
  showGlassBranding?: boolean;
  /** Reports the current media's aspect ratio (w/h) so "auto" can size the area to it. */
  onMediaAspectChange?: (aspect: number | null) => void;
  onVideoLoaded?: () => void;
  onVideoError?: () => void;
  onVideoEnded?: () => void;
  className?: string;
  /** Overlays scoped to the promo area (e.g. the drop-down announcement). */
  children?: React.ReactNode;
}

function GlassLogoBadge({ logoUrl }: { logoUrl?: string | null }) {
  return (
    <div className="rounded-2xl border border-white/30 bg-white/15 px-[1.2vw] py-[1vh] shadow-[0_8px_32px_rgba(0,0,0,0.35)] backdrop-blur-xl">
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt="Brand logo"
          className="h-[clamp(2rem,4.5vh,3.5rem)] w-auto max-w-[min(18vw,14rem)] object-contain"
        />
      ) : (
        <UnimoniLogoImage
          variant="onDark"
          height={56}
          className="h-[clamp(2rem,4.5vh,3.5rem)] w-auto object-contain drop-shadow-[0_2px_8px_rgba(0,0,0,0.85)]"
          priority
        />
      )}
    </div>
  );
}

export function UnimoniPromoPanel({
  videoUrl,
  imageUrl,
  videoLoaded = false,
  loopVideo = true,
  fit = "stretch",
  widthPercent,
  soundOn = false,
  overlayLogoUrl,
  contactLine,
  showGlassBranding = true,
  onMediaAspectChange,
  onVideoLoaded,
  onVideoError,
  onVideoEnded,
  className = "",
  children,
}: UnimoniPromoPanelProps) {
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const imageFailed = Boolean(imageUrl) && failedImageUrl === imageUrl;

  const showVideo = Boolean(videoUrl);
  const showImage = Boolean(imageUrl) && !showVideo && !imageFailed;
  const showPlaceholder = !showVideo && !showImage;
  const resolvedContact = contactLine?.trim() || UNIMONI_CONTACT_LINE;
  // Full glass branding on idle + video; image adverts get top-left logo + footer only.
  const showGlassOverlay = showGlassBranding && (showPlaceholder || showVideo || showImage);
  const showFullGlassCenter = showPlaceholder;

  const objectClass =
    fit === "stretch" ? "object-fill" : fit === "cover" ? "object-cover" : "object-contain";
  const useBackdrop = fit === "contain";

  const panelStyle: CSSProperties =
    showVideo || showImage ? {} : { backgroundColor: UNIMONI_COLORS.panelBlue };
  if (widthPercent) panelStyle.width = `${widthPercent}%`;

  return (
    <section
      className={`display-promo-panel relative flex h-full w-full min-h-0 shrink-0 flex-col overflow-hidden bg-black transition-[width] duration-500 ease-out lg:w-[65%] xl:w-[68%] ${className}`}
      style={panelStyle}
    >
      {showVideo ? (
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
            className={`absolute inset-0 z-[1] h-full w-full ${objectClass}`}
            autoPlay
            muted={!soundOn}
            loop={loopVideo}
            playsInline
            controls={false}
            disablePictureInPicture
            onLoadedMetadata={(e) => {
              const v = e.currentTarget;
              if (v.videoWidth && v.videoHeight) onMediaAspectChange?.(v.videoWidth / v.videoHeight);
            }}
            onLoadedData={onVideoLoaded}
            onCanPlay={(e) => {
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
          <Image
            key={imageUrl}
            src={imageUrl!}
            alt="Branch advert"
            fill
            className={`absolute inset-0 z-[1] ${objectClass}`}
            unoptimized
            priority
            onLoad={(e) => {
              const img = e.currentTarget as HTMLImageElement;
              if (img.naturalWidth && img.naturalHeight)
                onMediaAspectChange?.(img.naturalWidth / img.naturalHeight);
            }}
            onError={() => setFailedImageUrl(imageUrl ?? null)}
          />
        </>
      ) : null}

      {showPlaceholder ? (
        <div
          className="absolute inset-0 z-[2] bg-[#0D2680]/90 backdrop-blur-[3px]"
          aria-hidden
        />
      ) : null}

      {showGlassOverlay ? (
        <div
          className="pointer-events-none absolute inset-0 z-[12] flex flex-col justify-between font-[Arial,Helvetica,sans-serif] text-white"
          style={{ textShadow: BRANDING_TEXT_SHADOW }}
        >
          <div className="flex justify-start p-[clamp(1rem,2.5vw,2.5rem)] pt-[clamp(1.25rem,3vh,2.75rem)]">
            <GlassLogoBadge logoUrl={overlayLogoUrl} />
          </div>

          {showFullGlassCenter ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-[clamp(0.5rem,1.2vh,1rem)] px-[clamp(1.5rem,4vw,3rem)] text-center">
              <div className="rounded-3xl border border-white/25 bg-white/12 px-[clamp(1.5rem,4vw,3rem)] py-[clamp(1rem,2.5vh,2rem)] shadow-[0_12px_40px_rgba(0,0,0,0.4)] backdrop-blur-2xl">
                {overlayLogoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={overlayLogoUrl}
                    alt="Brand logo"
                    className="mx-auto h-[clamp(3rem,8vh,5.5rem)] w-auto object-contain"
                  />
                ) : (
                  <Image
                    src="/unimoni-logo-full.png"
                    alt="unimoni"
                    width={300}
                    height={97}
                    className="mx-auto h-[clamp(3rem,8vh,5.5rem)] w-auto object-contain"
                    unoptimized
                    priority
                  />
                )}
              </div>
              <p className="text-[clamp(1rem,1.8vw,1.5rem)] font-medium tracking-wide">
                {UNIMONI_WEBSITE}
              </p>
              <p className="text-[clamp(0.85rem,1.4vw,1.15rem)] font-medium leading-snug">
                {resolvedContact}
              </p>
            </div>
          ) : null}

          <div className="mx-[clamp(1rem,2.5vw,2.5rem)] mb-[clamp(1rem,2.5vh,2.5rem)] rounded-2xl border border-white/20 bg-[#0D2680]/45 px-[clamp(1rem,2.5vw,2rem)] py-[clamp(0.75rem,1.5vh,1.25rem)] shadow-[0_8px_32px_rgba(0,0,0,0.35)] backdrop-blur-xl">
            <p className="mb-[clamp(0.25rem,0.6vh,0.5rem)] text-center text-[clamp(0.8rem,1.2vw,1rem)] font-semibold uppercase tracking-wide">
              Visit us at
            </p>
            {UNIMONI_LOCATIONS.map((line) => (
              <p
                key={line}
                className="text-center text-[clamp(0.7rem,1.1vw,0.95rem)] leading-snug text-white/95"
              >
                {line}
              </p>
            ))}
          </div>
        </div>
      ) : null}

      {children}
    </section>
  );
}
