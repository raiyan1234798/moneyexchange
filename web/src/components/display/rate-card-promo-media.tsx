"use client";

import { cn } from "@/lib/utils";

export interface RateCardPromoMediaProps {
  url: string;
  type: "image" | "video";
  /** Fills the whole rate-card panel (no header / text). */
  fullBleed?: boolean;
  /** Play promo video with sound when branch setting is on. */
  soundOn?: boolean;
}

/**
 * Rate-card promo media — visually distinct from the main video panel:
 * framed chrome, slide-in sheet, Ken Burns on images, zoom-reveal on video.
 */
export function RateCardPromoMedia({
  url,
  type,
  fullBleed = false,
  soundOn = false,
}: RateCardPromoMediaProps) {
  const shellClass = cn(
    "rate-card-promo-shell relative overflow-hidden",
    fullBleed ? "absolute inset-0" : "flex min-h-0 w-full flex-1 items-center justify-center",
  );

  return (
    <div className={shellClass}>
      {/* Decorative frame — makes the promo read as a "card" not the main cinema player */}
      <div className="rate-card-promo-frame pointer-events-none absolute inset-0 z-20" aria-hidden>
        <span className="rate-card-promo-frame__edge rate-card-promo-frame__edge--top" />
        <span className="rate-card-promo-frame__edge rate-card-promo-frame__edge--bottom" />
        <span className="rate-card-promo-frame__corner rate-card-promo-frame__corner--tl" />
        <span className="rate-card-promo-frame__corner rate-card-promo-frame__corner--tr" />
        <span className="rate-card-promo-frame__corner rate-card-promo-frame__corner--bl" />
        <span className="rate-card-promo-frame__corner rate-card-promo-frame__corner--br" />
        <span className="rate-card-promo-frame__badge">Promo</span>
      </div>

      {type === "video" ? (
        <>
          {!fullBleed ? (
            <video
              key={`${url}-bg`}
              src={url}
              autoPlay
              muted
              loop
              playsInline
              aria-hidden
              className="absolute inset-0 z-0 h-full w-full scale-110 object-cover blur-2xl brightness-[0.42]"
            />
          ) : null}
          <video
            key={url}
            src={url}
            autoPlay
            muted={!soundOn}
            loop
            playsInline
            controls={false}
            disablePictureInPicture
            data-signage-role="rate-card-promo"
            onCanPlay={(e) => {
              const v = e.currentTarget;
              v.muted = !soundOn;
              void v.play().catch(() => {
                v.muted = true;
                void v.play().catch(() => {});
              });
            }}
            className={cn(
              "rate-card-promo-video z-10 object-center",
              fullBleed
                ? "absolute inset-0 h-full w-full object-cover"
                : "relative max-h-full max-w-full object-contain",
            )}
          />
        </>
      ) : fullBleed ? (
        <div className="rate-card-promo-image-kenburns absolute inset-0 z-0 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt="Promotion"
            className="rate-card-promo-image rate-card-promo-image--bleed h-full w-full object-cover object-center"
          />
        </div>
      ) : (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt=""
            aria-hidden
            className="absolute inset-0 z-0 h-full w-full scale-110 object-cover blur-2xl brightness-[0.42]"
          />
          <div className="rate-card-promo-image-kenburns relative z-10 max-h-full max-w-full overflow-hidden rounded-lg">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt="Promotion"
              className="rate-card-promo-image rate-card-promo-image--framed max-h-full max-w-full object-contain object-center"
            />
          </div>
        </>
      )}
    </div>
  );
}
