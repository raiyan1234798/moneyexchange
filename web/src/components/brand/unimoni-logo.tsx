import Image from "next/image";
import { cn } from "@/lib/utils";
import { BRAND } from "@/lib/brand";

const sizeMap = {
  xs: { height: 28, className: "h-7" },
  sm: { height: 36, className: "h-9" },
  md: { height: 48, className: "h-12" },
  lg: { height: 64, className: "h-14 sm:h-16" },
  xl: { height: 88, className: "h-16 sm:h-20 lg:h-24" },
} as const;

const GRADIENT_ID = "unimoni-wordmark-inline";

function UnimoniWordmarkSvg({
  className,
  height,
  variant = "default",
}: {
  className?: string;
  height: number;
  variant?: "default" | "onDark";
}) {
  const gradientId = variant === "onDark" ? `${GRADIENT_ID}-light` : GRADIENT_ID;
  const width = Math.round(height * 5);

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 360 72"
      fill="none"
      role="img"
      aria-label="unimoni"
      width={width}
      height={height}
      className={cn("w-auto shrink-0", className)}
    >
      <defs>
        {variant === "onDark" ? (
          <linearGradient id={gradientId} x1="0%" y1="50%" x2="100%" y2="50%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="45%" stopColor="#e8f6fc" />
            <stop offset="100%" stopColor="#7dd3f0" />
          </linearGradient>
        ) : (
          <linearGradient id={gradientId} x1="0%" y1="50%" x2="100%" y2="50%">
            <stop offset="0%" stopColor="#1a4d8f" />
            <stop offset="55%" stopColor="#0078c8" />
            <stop offset="100%" stopColor="#00a3e0" />
          </linearGradient>
        )}
      </defs>
      <text
        x="0"
        y="56"
        fill={`url(#${gradientId})`}
        fontFamily="var(--font-heading), 'Nunito', 'Varela Round', system-ui, sans-serif"
        fontSize="58"
        fontWeight="700"
        letterSpacing="-0.03em"
      >
        unimoni
      </text>
    </svg>
  );
}

export function UnimoniLogo({
  size = "md",
  variant = "default",
  className,
}: {
  size?: keyof typeof sizeMap;
  variant?: "default" | "onDark";
  className?: string;
}) {
  const { height, className: heightClass } = sizeMap[size];

  return (
    <div className={cn("min-w-0", className)}>
      <UnimoniWordmarkSvg height={height} className={heightClass} variant={variant} />
    </div>
  );
}

export function UnimoniMark({
  className,
  size = 40,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl shadow-md ring-1 ring-[var(--unimoni-blue)]/20 transition-transform group-hover:scale-105",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <Image
        src={BRAND.faviconPath}
        alt="unimoni"
        width={size}
        height={size}
        className="h-full w-full object-cover"
        unoptimized
      />
    </div>
  );
}

export function UnimoniLogoImage({
  variant = "onDark",
  className,
  height = 72,
  priority = false,
}: {
  variant?: "default" | "onDark";
  className?: string;
  width?: number;
  height?: number;
  priority?: boolean;
}) {
  const src = variant === "onDark" ? BRAND.logoOnDarkPath : BRAND.logoPath;

  return (
    <Image
      src={src}
      alt="unimoni"
      width={Math.round(height * 5)}
      height={height}
      className={className}
      priority={priority}
      unoptimized
    />
  );
}

/** @deprecated Use UnimoniLogo */
export const UnimoneyLogo = UnimoniLogo;
/** @deprecated Use UnimoniMark */
export const UnimoneyMark = UnimoniMark;
/** @deprecated Use UnimoniLogoImage */
export const UnimoneyLogoImage = UnimoniLogoImage;
