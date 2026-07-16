"use client";

import { cn } from "@/lib/utils";

export interface RateCardPromoMediaProps {
  url: string;
  type: "image" | "video";
  /** Fills the whole rate-card panel (no header / text). */
  fullBleed?: boolean;
  /** Play promo video with sound when branch setting is on. */
  soundOn?: boolean;
  className?: string;
}

function PromoGlassOverlay({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rate-card-promo-glass pointer-events-none absolute inset-0 z-[5]",
        "bg-[#0D2680]/35 backdrop-blur-md",
        className,
      )}
      aria-hidden
    />
  );
}

/** Full-panel frosted glass behind rate-card promo (covers navy gaps above/below media). */
export function RateCardPromoPanelGlass({
  url,
  type,
}: {
  url: string;
  type: "image" | "video";
}) {
  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden>
      {type === "video" ? (
        <video
          key={`${url}-panel-glass`}
          src={url}
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 h-full w-full scale-125 object-cover blur-3xl brightness-[0.42] saturate-[1.2]"
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          className="absolute inset-0 h-full w-full scale-125 object-cover blur-3xl brightness-[0.42] saturate-[1.15]"
        />
      )}
      <div className="absolute inset-0 bg-[#0D2680]/45 backdrop-blur-2xl" />
      <div className="absolute inset-0 bg-gradient-to-b from-white/10 via-transparent to-[#0D2680]/30" />
    </div>
  );
}

/**
 * Rate-card promo media — glassmorphism + distinct animations from main video.
 */
export function RateCardPromoMedia({
  url,
  type,
  fullBleed = false,
  soundOn = false,
  className,
}: RateCardPromoMediaProps) {
  const shellClass = cn(
    "rate-card-promo-shell relative overflow-hidden",
    fullBleed ? "absolute inset-0" : "flex min-h-0 w-full flex-1 items-center justify-center",
    className,
  );

  const mediaGlassCard = cn(
    "relative z-10 overflow-hidden",
    "rounded-2xl border border-white/28 bg-white/10",
    "shadow-[0_12px_40px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.12)]",
    "backdrop-blur-md",
    fullBleed ? "absolute inset-[0.45rem] sm:inset-[0.55rem]" : "max-h-full max-w-full",
  );

  return (
    <div className={shellClass}>
      {/* Blurred glass fill — always on (video, image, full bleed or framed) */}
      {type === "video" ? (
        <video
          key={`${url}-glass-bg`}
          src={url}
          autoPlay
          muted
          loop
          playsInline
          aria-hidden
          className="absolute inset-0 z-0 h-full w-full scale-110 object-cover blur-2xl brightness-[0.48] saturate-[1.15]"
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          aria-hidden
          className="absolute inset-0 z-0 h-full w-full scale-110 object-cover blur-2xl brightness-[0.48] saturate-[1.1]"
        />
      )}

      <PromoGlassOverlay />

      {/* Decorative frame */}
      <div className="rate-card-promo-frame pointer-events-none absolute inset-0 z-20" aria-hidden>
        <span className="rate-card-promo-frame__edge rate-card-promo-frame__edge--top" />
        <span className="rate-card-promo-frame__edge rate-card-promo-frame__edge--bottom" />
        <span className="rate-card-promo-frame__corner rate-card-promo-frame__corner--tl" />
        <span className="rate-card-promo-frame__corner rate-card-promo-frame__corner--tr" />
        <span className="rate-card-promo-frame__corner rate-card-promo-frame__corner--bl" />
        <span className="rate-card-promo-frame__corner rate-card-promo-frame__corner--br" />
        <span className="rate-card-promo-frame__badge">Promo</span>
      </div>

      <div className={mediaGlassCard}>
        {type === "video" ? (
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
              "rate-card-promo-video h-full w-full object-cover object-center",
              fullBleed ? "min-h-full min-w-full" : "max-h-full max-w-full object-contain",
            )}
          />
        ) : (
          <div
            className={cn(
              "rate-card-promo-image-kenburns h-full w-full overflow-hidden",
              fullBleed ? "" : "flex items-center justify-center p-[0.4vw]",
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt="Promotion"
              className={cn(
                "rate-card-promo-image object-center",
                fullBleed
                  ? "h-full w-full object-cover"
                  : "max-h-full max-w-full object-contain",
              )}
            />
          </div>
        )}
      </div>
    </div>
  );
}
