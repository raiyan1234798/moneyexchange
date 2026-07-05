import Image from "next/image";
import { cn } from "@/lib/utils";
import { BRAND } from "@/lib/brand";

const sizeMap = {
  xs: { height: 28, width: 146, className: "h-7" },
  sm: { height: 36, width: 188, className: "h-9" },
  md: { height: 48, width: 250, className: "h-12" },
  lg: { height: 64, width: 334, className: "h-14 sm:h-16" },
  xl: { height: 88, width: 458, className: "h-16 sm:h-20 lg:h-24" },
} as const;

export function UnimoniLogo({
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
  const { height, width, className: heightClass } = sizeMap[size];
  const src = variant === "onDark" ? "/unimoni-logo-on-dark.svg" : "/unimoni-logo.svg";

  return (
    <div className={cn("min-w-0", className)}>
      <Image
        src={src}
        alt={BRAND.name}
        width={width}
        height={height}
        priority={size === "xl" || size === "lg"}
        className={cn("w-auto shrink-0", heightClass)}
      />
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
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[var(--brand-primary)] shadow-md ring-1 ring-[var(--brand-primary-light)]/40 transition-transform duration-200 group-hover:scale-105",
        className,
      )}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <span
        className="font-bold lowercase leading-none text-white"
        style={{ fontSize: Math.round(size * 0.48) }}
      >
        u
      </span>
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
  const src = variant === "onDark" ? "/unimoni-logo-on-dark.svg" : "/unimoni-logo.svg";
  const width = Math.round(height * 5);

  return (
    <Image
      src={src}
      alt={BRAND.name}
      width={width}
      height={height}
      priority={priority}
      className={cn("w-auto shrink-0", className)}
      style={{ height }}
    />
  );
}

/** @deprecated Use UnimoniLogo */
export const UnimoneyLogo = UnimoniLogo;
/** @deprecated Use UnimoniMark */
export const UnimoneyMark = UnimoniMark;
/** @deprecated Use UnimoniLogoImage */
export const UnimoneyLogoImage = UnimoniLogoImage;
