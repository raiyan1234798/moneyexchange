/**
 * Client-side image compression for Firestore-backed storage (no Storage
 * bucket on this project). Downscales + re-encodes to WebP/JPEG and returns a
 * data URL small enough to live inside a Firestore document (1 MiB limit).
 */

const DATA_URL_OVERHEAD = 4 / 3; // base64 inflation

export interface CompressOptions {
  /** Longest edge after downscale. */
  maxDimension: number;
  /** Target size of the BINARY image in bytes (data URL will be ~4/3 of this). */
  targetBytes: number;
}

export const ADVERT_IMAGE_OPTIONS: CompressOptions = {
  maxDimension: 1600, // plenty for a 65%-width panel on a 1080p TV
  targetBytes: 550_000, // ≈730 KB as base64 — safely inside the 1 MiB doc limit
};

export const LOGO_IMAGE_OPTIONS: CompressOptions = {
  maxDimension: 400,
  targetBytes: 90_000,
};

/** Recommended upload sizes shown in Settings (TV layout reference). */
export const MEDIA_DIMENSION_HINTS = {
  logo: "400 × 120 px — PNG with transparency works best (max ~400 px wide)",
  rateCardPromo: "720 × 1280 px portrait (9:16) — fits the narrow rate-card promo slide",
  mainPromo: "1920 × 1080 px landscape (16:9) — fits the main video / promo area",
} as const;

const LOGO_ACCEPTED_EXT = /\.(png|jpe?g|webp|gif|bmp|svg|ico)$/i;

/**
 * Read any common logo image (PNG, JPG, WebP, SVG, GIF) into a data URL small
 * enough for Firestore. SVG is stored as-is; rasters are compressed.
 */
export async function readLogoFileAsDataUrl(
  file: File,
): Promise<{ dataUrl: string; width?: number; height?: number }> {
  const name = file.name.toLowerCase();
  if (file.type === "image/svg+xml" || name.endsWith(".svg")) {
    const text = await file.text();
    if (text.length > 120_000) {
      throw new Error("SVG is too large — simplify it or use PNG/JPEG instead.");
    }
    return { dataUrl: `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(text)))}` };
  }
  if (!file.type.startsWith("image/") && !LOGO_ACCEPTED_EXT.test(name)) {
    throw new Error("Please choose an image file — PNG, JPG, JPEG, WebP, SVG, or GIF.");
  }
  const { dataUrl, width, height } = await compressImageToDataUrl(file, LOGO_IMAGE_OPTIONS);
  return { dataUrl, width, height };
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read the image file — is it a valid JPG/PNG/WebP?"));
    };
    img.src = url;
  });
}

function encode(canvas: HTMLCanvasElement, type: string, quality: number): string {
  return canvas.toDataURL(type, quality);
}

/**
 * Compress a raster image to a data URL under the target size. Tries WebP at
 * decreasing quality, then shrinks dimensions. Throws when even the smallest
 * attempt won't fit (extremely complex/huge images) — use a URL instead.
 */
export async function compressImageToDataUrl(
  file: File,
  options: CompressOptions,
): Promise<{ dataUrl: string; width: number; height: number; bytes: number }> {
  const img = await loadImage(file);
  let scale = Math.min(1, options.maxDimension / Math.max(img.width, img.height));

  for (let attempt = 0; attempt < 4; attempt++) {
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Image processing is not supported in this browser.");
    ctx.drawImage(img, 0, 0, width, height);

    for (const quality of [0.82, 0.68, 0.55]) {
      const dataUrl = encode(canvas, "image/webp", quality);
      // Some browsers ignore webp and return png — detect and fall back to jpeg.
      const effective = dataUrl.startsWith("data:image/webp")
        ? dataUrl
        : encode(canvas, "image/jpeg", quality);
      const bytes = Math.round((effective.length - effective.indexOf(",") - 1) / DATA_URL_OVERHEAD);
      if (bytes <= options.targetBytes) {
        return { dataUrl: effective, width, height, bytes };
      }
    }
    scale *= 0.7; // shrink and retry
  }

  throw new Error(
    "This image is too large even after compression — please use a smaller image or paste an Image URL.",
  );
}
