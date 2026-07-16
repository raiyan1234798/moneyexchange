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

/** Clear the CONNECTED background region (flood fill from every edge pixel that
    matches the corner colour) so only the true background goes transparent —
    white INSIDE the logo artwork is preserved. Skips photos: if the four
    corners aren't a near-uniform colour, the image is left untouched. */
function floodClearBackground(imageData: ImageData, tolerance: number): boolean {
  const { data, width, height } = imageData;
  const px = (x: number, y: number) => (y * width + x) * 4;
  const corners = [px(0, 0), px(width - 1, 0), px(0, height - 1), px(width - 1, height - 1)];
  const bg = [0, 1, 2].map((c) => corners.reduce((s, i) => s + data[i + c], 0) / 4);
  const uniform = corners.every(
    (i) =>
      Math.abs(data[i] - bg[0]) <= tolerance &&
      Math.abs(data[i + 1] - bg[1]) <= tolerance &&
      Math.abs(data[i + 2] - bg[2]) <= tolerance,
  );
  if (!uniform) return false; // photo-like image — don't touch it

  const matches = (i: number) =>
    Math.abs(data[i] - bg[0]) <= tolerance &&
    Math.abs(data[i + 1] - bg[1]) <= tolerance &&
    Math.abs(data[i + 2] - bg[2]) <= tolerance;
  const visited = new Uint8Array(width * height);
  const queue: number[] = [];
  for (let x = 0; x < width; x++) queue.push(x, (height - 1) * width + x);
  for (let y = 0; y < height; y++) queue.push(y * width, y * width + width - 1);
  while (queue.length) {
    const p = queue.pop()!;
    if (visited[p]) continue;
    visited[p] = 1;
    const i = p * 4;
    if (!matches(i)) continue;
    data[i + 3] = 0;
    const x = p % width;
    const y = (p / width) | 0;
    if (x > 0) queue.push(p - 1);
    if (x < width - 1) queue.push(p + 1);
    if (y > 0) queue.push(p - width);
    if (y < height - 1) queue.push(p + width);
  }
  return true;
}

/**
 * Compress a LOGO to a PNG data URL with its white/solid background removed
 * (transparent), so it sits cleanly on the navy TV header. Falls back to the
 * normal compressor when the image has no uniform background (e.g. a photo).
 */
export async function compressLogoTransparent(
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

    const imageData = ctx.getImageData(0, 0, width, height);
    const removed = floodClearBackground(imageData, 34);
    if (!removed) return compressImageToDataUrl(file, options);
    ctx.putImageData(imageData, 0, 0);

    // PNG keeps the transparency (webp/jpeg would flatten it again).
    const dataUrl = canvas.toDataURL("image/png");
    const bytes = Math.round((dataUrl.length - dataUrl.indexOf(",") - 1) / DATA_URL_OVERHEAD);
    if (bytes <= Math.max(options.targetBytes, 150_000)) {
      return { dataUrl, width, height, bytes };
    }
    scale *= 0.7; // shrink and retry
  }

  throw new Error(
    "This image is too large even after compression — please use a smaller image or paste an Image URL.",
  );
}
