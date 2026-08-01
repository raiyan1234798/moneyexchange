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

/** Trim surrounding solid white/light border padding from a canvas to crop tight logo bounds. */
export function trimCanvasWhiteBorders(canvas: HTMLCanvasElement, tolerance: number = 15): HTMLCanvasElement {
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const alpha = data[i + 3];
      if (alpha < 30) continue; // Transparent pixel
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      // Check if pixel is NOT plain white or near-white padding
      const isWhite = r >= 255 - tolerance && g >= 255 - tolerance && b >= 255 - tolerance;
      if (!isWhite) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  // If no non-white bounds found or crop would be tiny, return original
  if (maxX < minX || maxY < minY) return canvas;
  const croppedWidth = maxX - minX + 1;
  const croppedHeight = maxY - minY + 1;

  // Don't crop if bounds are already full canvas
  if (minX === 0 && minY === 0 && croppedWidth === width && croppedHeight === height) {
    return canvas;
  }

  const cropped = document.createElement("canvas");
  cropped.width = croppedWidth;
  cropped.height = croppedHeight;
  const croppedCtx = cropped.getContext("2d");
  if (!croppedCtx) return canvas;
  croppedCtx.drawImage(canvas, minX, minY, croppedWidth, croppedHeight, 0, 0, croppedWidth, croppedHeight);
  return cropped;
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
    let canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Image processing is not supported in this browser.");
    ctx.drawImage(img, 0, 0, width, height);

    // NOTE: we deliberately do NOT auto-trim the logo's margins here. Trimming
    // to the tight content bounds removed the logo's natural padding, so it then
    // touched the badge's rounded corner and looked cropped (client 2026-08-01:
    // "logos should not be cropped/altered on upload — only I adjust the size").
    // Upload the logo exactly as given (just proportionally downscaled).

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


/** Flood-clear from the given seed pixels through pixels matching `match`. */
function floodFrom(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  seeds: number[],
  match: (i: number) => boolean,
): number {
  const visited = new Uint8Array(width * height);
  const queue = [...seeds];
  let cleared = 0;
  while (queue.length) {
    const p = queue.pop()!;
    if (visited[p]) continue;
    visited[p] = 1;
    const i = p * 4;
    if (data[i + 3] === 0 || !match(i)) continue;
    data[i + 3] = 0;
    cleared++;
    const x = p % width;
    const y = (p / width) | 0;
    if (x > 0) queue.push(p - 1);
    if (x < width - 1) queue.push(p + 1);
    if (y > 0) queue.push(p - width);
    if (y < height - 1) queue.push(p + width);
  }
  return cleared;
}

/** Peel ONE nested solid background layer: when the pixels bordering the
    already-transparent area are dominated by a single colour (a solid box the
    logo sits on), clear that connected layer too. Reverts itself if it would
    wipe out nearly the whole image. */
function clearNestedLayer(imageData: ImageData, tolerance: number): boolean {
  const { data, width, height } = imageData;
  const seeds: number[] = [];
  const colorCount = new Map<number, number>();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      const i = p * 4;
      if (data[i + 3] === 0) continue;
      const adjTransparent =
        (x > 0 && data[(p - 1) * 4 + 3] === 0) ||
        (x < width - 1 && data[(p + 1) * 4 + 3] === 0) ||
        (y > 0 && data[(p - width) * 4 + 3] === 0) ||
        (y < height - 1 && data[(p + width) * 4 + 3] === 0);
      if (!adjTransparent) continue;
      seeds.push(p);
      const key = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
      colorCount.set(key, (colorCount.get(key) ?? 0) + 1);
    }
  }
  if (seeds.length < 40) return false;
  let bestKey = -1;
  let best = 0;
  let total = 0;
  for (const [k, c] of colorCount) {
    total += c;
    if (c > best) {
      best = c;
      bestKey = k;
    }
  }
  // The border of the cleared area must be mostly ONE colour — otherwise this
  // is real artwork, not a background box.
  if (bestKey < 0 || best < total * 0.55) return false;
  const bg = [(((bestKey >> 8) & 0xf) << 4) + 8, (((bestKey >> 4) & 0xf) << 4) + 8, ((bestKey & 0xf) << 4) + 8];
  const match = (i: number) =>
    Math.abs(data[i] - bg[0]) <= tolerance &&
    Math.abs(data[i + 1] - bg[1]) <= tolerance &&
    Math.abs(data[i + 2] - bg[2]) <= tolerance;
  let opaque = 0;
  for (let p = 0; p < width * height; p++) if (data[p * 4 + 3] !== 0) opaque++;
  const snapshot = new Uint8ClampedArray(data);
  const cleared = floodFrom(data, width, height, seeds.filter((p) => match(p * 4)), match);
  if (cleared === 0) return false;
  // Would leave (almost) nothing → this "background" was the logo itself.
  if (cleared > opaque * 0.9 || opaque - cleared < width * height * 0.02) {
    data.set(snapshot);
    return false;
  }
  return true;
}

/** Mean luminance (0-255) of the VISIBLE pixels — decides readability. */
function meanLuminance(imageData: ImageData): number {
  const { data } = imageData;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 40) continue;
    sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    n++;
  }
  return n === 0 ? 0 : sum / n;
}

/** Would the stripped artwork be unreadable on the destination surface?
    Light surface + near-white artwork, or dark surface + near-black artwork. */
function unreadableOnSurface(imageData: ImageData, surface: "light" | "dark" | "any"): boolean {
  if (surface === "any") return false;
  const lum = meanLuminance(imageData);
  return surface === "light" ? lum > 195 : lum < 70;
}

/**
 * Compress a LOGO to a PNG data URL with its white/solid background removed
 * (transparent). Falls back to the normal compressor when the image has no
 * uniform background (e.g. a photo) — and, when a `surface` is given, KEEPS
 * the background if removing it would make the logo unreadable there (e.g.
 * white lettering on a dark box, destined for a white badge).
 */
export async function compressLogoTransparent(
  file: File,
  options: CompressOptions,
  surface: "light" | "dark" | "any" = "any",
): Promise<{ dataUrl: string; width: number; height: number; bytes: number; backgroundKept?: boolean }> {
  const img = await loadImage(file);
  let scale = Math.min(1, options.maxDimension / Math.max(img.width, img.height));

  for (let attempt = 0; attempt < 4; attempt++) {
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));
    let canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Image processing is not supported in this browser.");
    ctx.drawImage(img, 0, 0, width, height);
    canvas = trimCanvasWhiteBorders(canvas);

    const imageData = ctx.getImageData(0, 0, width, height);
    const removed = floodClearBackground(imageData, 34);
    if (!removed) return compressImageToDataUrl(file, options);
    // Peel up to two NESTED solid layers (e.g. white canvas → brand-colour box)
    // so only the actual logo artwork remains.
    for (let layer = 0; layer < 2; layer++) {
      if (!clearNestedLayer(imageData, 40)) break;
    }
    // The logo NEEDS its background here (it would turn invisible) — keep it.
    if (unreadableOnSurface(imageData, surface)) {
      const kept = await compressImageToDataUrl(file, options);
      return { ...kept, backgroundKept: true };
    }
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

/**
 * Strip the background from an ALREADY-STORED logo (data URL or plain URL) —
 * same white/solid + nested-box removal as uploads, so old logos can be fixed
 * with one click instead of re-uploading. Returns a PNG data URL.
 */
export async function stripLogoBackground(
  src: string,
  surface: "light" | "dark" | "any" = "any",
): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.crossOrigin = "anonymous";
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Could not read the stored logo image."));
    el.src = src;
  });
  const maxDim = LOGO_IMAGE_OPTIONS.maxDimension;
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Image processing is not supported in this browser.");
  ctx.drawImage(img, 0, 0, width, height);
  const imageData = ctx.getImageData(0, 0, width, height);
  const removed = floodClearBackground(imageData, 34);
  if (!removed) throw new Error("No solid background detected on this logo.");
  for (let layer = 0; layer < 2; layer++) {
    if (!clearNestedLayer(imageData, 40)) break;
  }
  if (unreadableOnSurface(imageData, surface)) {
    throw new Error(
      "Removing this background would make the logo unreadable here — keeping it as-is.",
    );
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}
