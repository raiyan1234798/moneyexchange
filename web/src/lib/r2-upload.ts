import { auth } from "@/lib/firebase/client";

// 20 minutes — a large video (e.g. 300 MB+) on a normal branch connection can
// take well over 5 minutes; the previous 5-minute cap made those big uploads
// abort near the end. This is only an upper bound — a fast upload still finishes
// as soon as the bytes are sent.
export const R2_UPLOAD_TIMEOUT_MS = 1_200_000;

export function isR2UploadConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_R2_UPLOAD_URL?.trim();
  return Boolean(url);
}

function getR2UploadUrl(): string {
  const url = process.env.NEXT_PUBLIC_R2_UPLOAD_URL?.trim();
  if (!url) {
    throw new Error("R2 upload is not configured. Use Paste video link or ask your admin to enable R2.");
  }
  return url.replace(/\/$/, "");
}

async function getIdToken(): Promise<string> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("You must be signed in to upload videos.");
  }
  return user.getIdToken();
}

export interface R2UploadResult {
  storagePath: string;
  downloadUrl: string;
  mimeType: string;
  fileSizeBytes: number;
}

export function uploadVideoToR2(
  file: File,
  branchId: string,
  onProgress?: (progress: number) => void,
): Promise<R2UploadResult> {
  onProgress?.(1);

  return new Promise((resolve, reject) => {
    let settled = false;

    void (async () => {
      try {
        const token = await getIdToken();

        // Send the RAW file as the request body (not multipart form-data): the
        // server streams it straight to R2 instead of buffering the whole file
        // in memory first, so large videos upload much faster and don't stall.
        // branchId + filename ride in the query string. Same-origin, so no CORS.
        const uploadUrl =
          `${getR2UploadUrl()}?branchId=${encodeURIComponent(branchId)}` +
          `&filename=${encodeURIComponent(file.name || "upload")}`;

        const xhr = new XMLHttpRequest();
        xhr.open("POST", uploadUrl);
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);
        xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
        xhr.timeout = R2_UPLOAD_TIMEOUT_MS;

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable && event.total > 0) {
            const pct = Math.min(99, Math.round((event.loaded / event.total) * 100));
            onProgress?.(Math.max(1, pct));
          } else {
            onProgress?.(5);
          }
        };

        xhr.onload = () => {
          if (settled) return;
          settled = true;

          let payload: R2UploadResult & { error?: string };
          try {
            payload = JSON.parse(xhr.responseText) as R2UploadResult & { error?: string };
          } catch {
            reject(new Error("Upload failed — invalid server response"));
            return;
          }

          if (xhr.status < 200 || xhr.status >= 300) {
            reject(new Error(payload.error ?? `Upload failed (${xhr.status})`));
            return;
          }

          onProgress?.(100);
          resolve(payload);
        };

        xhr.onerror = () => {
          if (settled) return;
          settled = true;
          reject(new Error("Upload failed — check your connection or use Paste video link."));
        };

        xhr.ontimeout = () => {
          if (settled) return;
          settled = true;
          reject(new Error("Upload timed out after 5 minutes. Try a smaller file or paste a direct video link."));
        };

        xhr.onabort = () => {
          if (settled) return;
          settled = true;
          reject(new Error("Upload cancelled."));
        };

        xhr.send(file);
      } catch (error) {
        if (settled) return;
        settled = true;
        reject(error instanceof Error ? error : new Error("Upload failed"));
      }
    })();
  });
}

/**
 * Upload any file (image OR video) to R2. The Cloudflare worker routes by MIME
 * type (images/… vs videos/…). Use this for promo images so they are NOT stored
 * as base64 data URLs in the Firestore branch doc (which blows past the 1MB
 * document limit once you add a few images).
 */
export const uploadFileToR2 = uploadVideoToR2;

export async function deleteR2Object(storagePath: string): Promise<void> {
  if (!isR2UploadConfigured()) return;
  if (!storagePath.startsWith("videos/") && !storagePath.startsWith("images/")) return;

  try {
    const token = await getIdToken();
    const url = `${getR2UploadUrl()}?key=${encodeURIComponent(storagePath)}`;
    await fetch(url, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    // Best-effort cleanup — orphaned objects can be removed via R2 lifecycle rules
  }
}
