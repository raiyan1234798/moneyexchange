import { MAX_VIDEO_UPLOAD_BYTES, RECOMMENDED_VIDEO_FORMATS } from "@/lib/constants";

const ALLOWED_VIDEO_MIMES = new Set(["video/mp4", "video/webm", "video/quicktime"]);

const EXTENSION_MIME: Record<string, string> = {
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
};

export function inferVideoMimeType(file: File): string {
  if (file.type && ALLOWED_VIDEO_MIMES.has(file.type)) {
    return file.type;
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSION_MIME[ext] ?? file.type ?? "video/mp4";
}

export function validateVideoFile(file: File): void {
  const mimeType = inferVideoMimeType(file);

  if (!ALLOWED_VIDEO_MIMES.has(mimeType)) {
    throw new Error(
      `Unsupported format. Use ${RECOMMENDED_VIDEO_FORMATS.map((f) => f.split(" ")[0]).join(", ")} only.`,
    );
  }

  if (file.size > MAX_VIDEO_UPLOAD_BYTES) {
    throw new Error(
      `File exceeds ${MAX_VIDEO_UPLOAD_BYTES / (1024 * 1024)}MB limit. Use External URL for large signage videos.`,
    );
  }

  if (file.size === 0) {
    throw new Error("Selected file is empty. Choose a valid video file.");
  }
}

export function deriveTitleFromFile(file: File): string {
  const base = file.name.replace(/\.[^.]+$/, "").trim();
  return base || "Uploaded video";
}

export function deriveTitleFromUrl(url: string): string {
  try {
    const pathname = new URL(url.trim()).pathname;
    const filename = pathname.split("/").pop() ?? "";
    const base = decodeURIComponent(filename.replace(/\.[^.]+$/, "").trim());
    return base || "External video";
  } catch {
    return "External video";
  }
}

export function validateExternalVideoUrl(url: string): void {
  const trimmed = url.trim();
  if (!trimmed) {
    throw new Error("Video URL is required");
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("Enter a valid URL (https://…)");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Video URL must use http or https");
  }
}

export function resolveVideoTitle(title: string | undefined, fallback: string): string {
  const trimmed = title?.trim();
  return trimmed || fallback;
}
