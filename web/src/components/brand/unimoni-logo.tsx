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

export function UnimoniLogo({
  size = "md",
  showTagline = false,
  showWordmark = false,
  className,
}: {
  size?: keyof typeof sizeMap;
  showTagline?: boolean;
  showWordmark?: boolean;
  className?: string;
}) {
  const { height, className: heightClass } = sizeMap[size];

  return (
    <div className={cn("min-w-0", className)}>
      <Image
        src={BRAND.logoPath}
        alt={BRAND.fullName}
        width={Math.round(height * 3.2)}
        height={height}
        className={cn("w-auto object-contain", heightClass)}
        priority={size === "lg" || size === "xl"}
        unoptimized
      />
      {showWordmark ? (
        <p className="mt-1 text-sm font-semibold tracking-tight text-[var(--unimoni-navy)] dark:text-foreground">
          {BRAND.name}
        </p>
      ) : null}
      {showTagline ? (
        <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          {BRAND.tagline}
        </p>
      ) : null}
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
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white shadow-md ring-1 ring-[var(--unimoni-blue)]/20 transition-transform group-hover:scale-105",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <Image
        src={BRAND.logoPath}
        alt={BRAND.name}
        width={size}
        height={size}
        className="h-[85%] w-[85%] object-contain"
        unoptimized
      />
    </div>
  );
}

/** @deprecated Use UnimoniLogo */
export const UnimoneyLogo = UnimoniLogo;
/** @deprecated Use UnimoniMark */
export const UnimoneyMark = UnimoniMark;
