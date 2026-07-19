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

// Cloudflare rejects a single request body over ~100MB, so anything bigger must
// be uploaded in parts (R2 multipart). 80MB parts keep a safe margin under 100MB.
const SINGLE_SHOT_MAX_BYTES = 80 * 1024 * 1024;
const PART_SIZE_BYTES = 80 * 1024 * 1024;

export function uploadVideoToR2(
  file: File,
  branchId: string,
  onProgress?: (progress: number) => void,
): Promise<R2UploadResult> {
  // Big files can't go in one request (Cloudflare's ~100MB body cap) — split
  // them into parts. Small files take the simpler single-request path.
  return file.size > SINGLE_SHOT_MAX_BYTES
    ? multipartUpload(file, branchId, onProgress)
    : singleShotUpload(file, branchId, onProgress);
}

/** One request: raw file body streamed straight to R2. For files up to ~80MB. */
function singleShotUpload(
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
          reject(new Error("Upload timed out. Try a smaller file or paste a direct video link."));
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

/** Upload one part (chunk) of a multipart upload, reporting bytes sent so far. */
function uploadPart(
  base: string,
  key: string,
  uploadId: string,
  partNumber: number,
  chunk: Blob,
  token: string,
  onChunkProgress: (loaded: number) => void,
): Promise<{ partNumber: number; etag: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(
      "POST",
      `${base}?op=part&key=${encodeURIComponent(key)}&uploadId=${encodeURIComponent(uploadId)}&partNumber=${partNumber}`,
    );
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.timeout = R2_UPLOAD_TIMEOUT_MS;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onChunkProgress(e.loaded);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const j = JSON.parse(xhr.responseText) as { etag: string };
          resolve({ partNumber, etag: j.etag });
        } catch {
          reject(new Error("Upload failed — invalid part response"));
        }
      } else {
        let msg = `Part ${partNumber} failed (${xhr.status})`;
        try {
          msg = (JSON.parse(xhr.responseText) as { error?: string }).error ?? msg;
        } catch {
          /* keep default */
        }
        reject(new Error(msg));
      }
    };
    xhr.onerror = () => reject(new Error("Upload failed — check your connection."));
    xhr.ontimeout = () => reject(new Error("Upload timed out — check your connection."));
    xhr.send(chunk);
  });
}

/** Multipart upload for large files: start → upload each <100MB part → complete. */
async function multipartUpload(
  file: File,
  branchId: string,
  onProgress?: (progress: number) => void,
): Promise<R2UploadResult> {
  onProgress?.(1);
  const token = await getIdToken();
  const base = getR2UploadUrl();
  const contentType = file.type || "application/octet-stream";

  const startRes = await fetch(
    `${base}?op=start&branchId=${encodeURIComponent(branchId)}` +
      `&filename=${encodeURIComponent(file.name || "upload")}` +
      `&contentType=${encodeURIComponent(contentType)}`,
    { method: "POST", headers: { Authorization: `Bearer ${token}` } },
  );
  if (!startRes.ok) {
    throw new Error((await safeError(startRes)) ?? "Could not start the upload");
  }
  const { key, uploadId } = (await startRes.json()) as { key: string; uploadId: string };

  const totalParts = Math.ceil(file.size / PART_SIZE_BYTES);
  const parts: Array<{ partNumber: number; etag: string }> = [];
  let uploadedBytes = 0;
  try {
    for (let i = 0; i < totalParts; i++) {
      const start = i * PART_SIZE_BYTES;
      const chunk = file.slice(start, Math.min(file.size, start + PART_SIZE_BYTES));
      const done = uploadedBytes;
      const part = await uploadPart(base, key, uploadId, i + 1, chunk, token, (loaded) => {
        const pct = Math.min(99, Math.round(((done + loaded) / file.size) * 100));
        onProgress?.(Math.max(1, pct));
      });
      uploadedBytes += chunk.size;
      parts.push(part);
    }
  } catch (error) {
    // Best-effort: tell R2 to drop the partial upload so it doesn't linger.
    void fetch(`${base}?op=abort&key=${encodeURIComponent(key)}&uploadId=${encodeURIComponent(uploadId)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => undefined);
    throw error instanceof Error ? error : new Error("Upload failed");
  }

  const completeRes = await fetch(
    `${base}?op=complete&key=${encodeURIComponent(key)}&uploadId=${encodeURIComponent(uploadId)}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ parts }),
    },
  );
  if (!completeRes.ok) {
    throw new Error((await safeError(completeRes)) ?? "Could not finish the upload");
  }
  onProgress?.(100);
  return (await completeRes.json()) as R2UploadResult;
}

async function safeError(res: Response): Promise<string | null> {
  try {
    return ((await res.json()) as { error?: string }).error ?? null;
  } catch {
    return null;
  }
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
