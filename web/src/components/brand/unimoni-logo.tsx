import { cn } from "@/lib/utils";
import { BRAND } from "@/lib/brand";

const sizeMap = {
  xs: { height: 28, className: "h-7" },
  sm: { height: 36, className: "h-9" },
  md: { height: 48, className: "h-12" },
  lg: { height: 64, className: "h-14 sm:h-16" },
  xl: { height: 88, className: "h-16 sm:h-20 lg:h-24" },
} as const;

const GRADIENT_ID = "unimoney-wordmark-inline";

function UnimoneyWordmarkSvg({
  className,
  height,
  variant = "default",
}: {
  className?: string;
  height: number;
  variant?: "default" | "onDark";
}) {
  const gradientId = variant === "onDark" ? `${GRADIENT_ID}-light` : GRADIENT_ID;
  const width = Math.round(height * 5.2);

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 380 72"
      fill="none"
      role="img"
      aria-label={BRAND.name}
      width={width}
      height={height}
      className={cn("w-auto shrink-0", className)}
    >
      <defs>
        {variant === "onDark" ? (
          <linearGradient id={gradientId} x1="0%" y1="50%" x2="100%" y2="50%">
            <stop offset="0%" stopColor="#F5B942" />
            <stop offset="50%" stopColor="#D4A853" />
            <stop offset="100%" stopColor="#F5B942" />
          </linearGradient>
        ) : (
          <linearGradient id={gradientId} x1="0%" y1="50%" x2="100%" y2="50%">
            <stop offset="0%" stopColor="#1E3A5F" />
            <stop offset="45%" stopColor="#0B1F3A" />
            <stop offset="100%" stopColor="#D4A853" />
          </linearGradient>
        )}
      </defs>
      <text
        x="0"
        y="56"
        fill={`url(#${gradientId})`}
        fontFamily="var(--font-heading), DM Sans, system-ui, sans-serif"
        fontSize="54"
        fontWeight="700"
        letterSpacing="-0.02em"
      >
        Unimoney
      </text>
    </svg>
  );
}

export function UnimoneyLogo({
  size = "md",
  variant = "default",
  showTagline = false,
  className,
}: {
  size?: keyof typeof sizeMap;
  variant?: "default" | "onDark";
  showTagline?: boolean;
  className?: string;
}) {
  const { height, className: heightClass } = sizeMap[size];

  return (
    <div className={cn("min-w-0", className)}>
      <UnimoneyWordmarkSvg height={height} className={heightClass} variant={variant} />
      {showTagline ? (
        <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          {BRAND.tagline}
        </p>
      ) : null}
    </div>
  );
}

export function UnimoneyMark({
  className,
  size = 40,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[var(--brand-primary)] shadow-md ring-1 ring-[var(--brand-accent)]/35 transition-transform group-hover:scale-105",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <span
        className="font-bold leading-none text-[var(--brand-accent)]"
        style={{ fontSize: Math.round(size * 0.42) }}
        aria-hidden
      >
        U
      </span>
    </div>
  );
}

export function UnimoneyLogoImage({
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
  void priority;
  return <UnimoneyWordmarkSvg height={height} variant={variant} className={cn("w-auto", className)} />;
}

export const UnimoniLogo = UnimoneyLogo;
export const UnimoniMark = UnimoneyMark;
export const UnimoniLogoImage = UnimoneyLogoImage;
