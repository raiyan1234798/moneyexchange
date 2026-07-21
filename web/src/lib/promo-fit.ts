/**
 * The promotion slide is a TALL area — 3:5 portrait (measured on the live
 * TVs). Media with a very different shape still shows fully (we never crop),
 * but it has to stretch to fill. These helpers measure an upload and produce a
 * friendly, plain-words warning so admins know how to get a perfect fit.
 */

export const PROMO_IDEAL_RATIO = 3 / 5; // width / height
export const PROMO_IDEAL_TEXT = "tall (portrait) 3:5 — e.g. 1080 × 1800 px";

/** How far from 9:16 before we bother the admin (25% keeps small crops quiet). */
const RATIO_TOLERANCE = 0.25;

function fitWarning(width: number, height: number, kind: "picture" | "video"): string | null {
  if (!width || !height) return null;
  const ratio = width / height;
  const off = Math.abs(ratio - PROMO_IDEAL_RATIO) / PROMO_IDEAL_RATIO;
  if (off <= RATIO_TOLERANCE) return null;
  const shape = ratio > 1 ? "wide (landscape)" : ratio > PROMO_IDEAL_RATIO ? "squarish" : "very tall";
  return (
    `This ${kind} is ${width}×${height} (${shape}). The promo area is ${PROMO_IDEAL_TEXT}, ` +
    `so it will stretch to fill. It still shows fully — but for a perfect fit, upload it at 3:5 ` +
    `(1080 × 1800).`
  );
}

/** Measure an image/video file and return a friendly fit warning, or null if it fits well. */
export function checkPromoMediaFit(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const done = (warning: string | null) => {
      URL.revokeObjectURL(url);
      resolve(warning);
    };
    if (file.type.startsWith("video/")) {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => done(fitWarning(video.videoWidth, video.videoHeight, "video"));
      video.onerror = () => done(null);
      video.src = url;
    } else if (file.type.startsWith("image/")) {
      const img = new window.Image();
      img.onload = () => done(fitWarning(img.naturalWidth, img.naturalHeight, "picture"));
      img.onerror = () => done(null);
      img.src = url;
    } else {
      done(null);
    }
  });
}
