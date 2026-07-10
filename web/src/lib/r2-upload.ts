import { auth } from "@/lib/firebase/client";

// 5 minutes — branch connections can be slow; the old 60s timeout made ~8MB
// videos abort mid-upload and fall back to database (chunked) storage.
export const R2_UPLOAD_TIMEOUT_MS = 300_000;

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
        const form = new FormData();
        form.append("file", file);
        form.append("branchId", branchId);

        const xhr = new XMLHttpRequest();
        xhr.open("POST", getR2UploadUrl());
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);
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

        xhr.send(form);
      } catch (error) {
        if (settled) return;
        settled = true;
        reject(error instanceof Error ? error : new Error("Upload failed"));
      }
    })();
  });
}

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
