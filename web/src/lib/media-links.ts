import {
  convertGoogleDriveToDirectUrl,
  extractGoogleDriveFileId,
  isGoogleDriveUrl,
} from "@/lib/video-utils";

/** youtu.be/ID · youtube.com/watch?v=ID · /shorts/ID · /embed/ID */
export function extractYouTubeId(input: string): string | null {
  const url = input.trim();
  const m =
    url.match(/youtu\.be\/([\w-]{6,})/) ??
    url.match(/[?&]v=([\w-]{6,})/) ??
    url.match(/youtube\.com\/(?:shorts|embed)\/([\w-]{6,})/);
  return m ? m[1] : null;
}

export function isYouTubeUrl(input: string): boolean {
  return extractYouTubeId(input) !== null;
}

/**
 * Turn ANY pasted link into something an <img> can render:
 * - YouTube link → the video's thumbnail image
 * - Google Drive share link → direct-view image URL
 * - anything else (direct image URL) → unchanged
 */
export function normalizeImageLink(input: string): string {
  const url = input.trim();
  if (!url) return "";
  const yt = extractYouTubeId(url);
  if (yt) return `https://img.youtube.com/vi/${yt}/hqdefault.jpg`;
  if (isGoogleDriveUrl(url)) {
    const id = extractGoogleDriveFileId(url);
    if (id) return `https://drive.google.com/uc?export=view&id=${id}`;
  }
  return url;
}

/**
 * Turn a pasted link into something a <video src> can play:
 * - Google Drive share link → direct-stream URL
 * - direct MP4/WebM URL → unchanged
 * - YouTube → NOT streamable in a plain <video>; returns "" (caller should
 *   fall back to the thumbnail image via normalizeImageLink).
 */
export function normalizeVideoLink(input: string): string {
  const url = input.trim();
  if (!url) return "";
  if (isYouTubeUrl(url)) return "";
  if (isGoogleDriveUrl(url)) return convertGoogleDriveToDirectUrl(url);
  return url;
}
