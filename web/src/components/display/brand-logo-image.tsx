"use client";

import { cn } from "@/lib/utils";

interface BrandLogoImageProps {
  src: string;
  alt?: string;
  /** CSS height (e.g. clamp or calc). Width follows aspect ratio. */
  height?: string;
  className?: string;
  /** Motion class (e.g. ticker-logo-spin) applied to the image. */
  animationClass?: string;
  priority?: boolean;
}

/**
 * Custom brand logo on signage — transparent background, soft shadow only.
 * No white/coloured box behind the artwork.
 */
export function BrandLogoImage({
  src,
  alt = "Brand logo",
  height,
  className,
  animationClass,
}: BrandLogoImageProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      style={height ? { height } : undefined}
      className={cn(
        "w-auto max-w-full shrink-0 object-contain object-center",
        "drop-shadow-[0_2px_10px_rgba(0,0,0,0.55)]",
        animationClass,
        className,
      )}
    />
  );
}

/** Frosted pill for promo / ticker text on dark panels. */
export function GlassTextPill({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-white/30 bg-white/12 px-[0.8vw] py-[0.6vh]",
        "shadow-[0_8px_28px_rgba(0,0,0,0.35)] backdrop-blur-xl",
        className,
      )}
    >
      {children}
    </div>
  );
}
