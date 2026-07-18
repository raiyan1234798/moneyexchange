/** Shared motion styles for signage logos and rate-table cells. */
export type SignageMotionStyle =
  | "spin"
  | "pulse"
  | "none"
  | "flip"
  | "bounce"
  | "float"
  | "swing";

export const SIGNAGE_MOTION_OPTIONS: Array<{ value: SignageMotionStyle; label: string }> = [
  { value: "spin", label: "Rotating flip (Y)" },
  { value: "flip", label: "Flip (X)" },
  { value: "bounce", label: "Bounce" },
  { value: "float", label: "Float" },
  { value: "swing", label: "Swing" },
  { value: "pulse", label: "Gentle pulse" },
  { value: "none", label: "No animation" },
];

/** CSS class for ticker / rate-card logo images. */
export function logoMotionClass(style: SignageMotionStyle | null | undefined): string {
  switch (style) {
    case "spin":
      return "ticker-logo-spin";
    case "flip":
      return "ticker-logo-flipx";
    case "bounce":
      return "ticker-logo-bounce";
    case "float":
      return "ticker-logo-float";
    case "swing":
      return "ticker-logo-swing";
    case "pulse":
      return "ticker-logo-pulse";
    default:
      return "";
  }
}

/** CSS class for rate-table flags, currency codes, and numbers. */
export function rateCellMotionClass(style: SignageMotionStyle | null | undefined): string {
  switch (style) {
    case "spin":
      return "rate-cell-spin";
    case "flip":
      return "rate-cell-flipx";
    case "bounce":
      return "rate-cell-bounce";
    case "float":
      return "rate-cell-float";
    case "swing":
      return "rate-cell-swing";
    case "pulse":
      return "rate-cell-pulse";
    default:
      return "";
  }
}
