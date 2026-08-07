import { auth } from "@/lib/firebase/client";
import { isR2UploadConfigured } from "@/lib/r2-upload";

const R2_PUBLIC_HOST_RE = /\.r2\.dev\//i;

/** Pull `videos/…` or `images/…` key from an R2 public URL when present. */
export function extractR2StorageKey(url: string): string | null {
  const u = url.trim();
  if (!u) return null;
  const hostIdx = u.search(R2_PUBLIC_HOST_RE);
  if (hostIdx >= 0) {
    const after = u.slice(hostIdx).split("/").slice(1).join("/"); // drop host
    const key = after.split("?")[0];
    if (key.startsWith("videos/") || key.startsWith("images/")) return key;
  }
  // Absolute path already a storage key
  if (u.startsWith("videos/") || u.startsWith("images/")) return u.split("?")[0];
  return null;
}

/**
 * True when the file bytes are still reachable.
 * Prefers the Pages worker R2 HEAD (no CORS, checks the bound bucket).
 * Falls back to a ranged GET on the public/download URL.
 */
export async function isMediaUrlReachable(opts: {
  downloadUrl?: string | null;
  storagePath?: string | null;
}): Promise<boolean> {
  const url = opts.downloadUrl?.trim() || "";
  if (!url) return false;
  if (url.startsWith("data:")) return true;
  if (url.startsWith("chunked://")) return false;

  const key = (opts.storagePath?.trim() || extractR2StorageKey(url) || "").replace(/^\//, "");
  if (key && (key.startsWith("videos/") || key.startsWith("images/")) && isR2UploadConfigured()) {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (token) {
        const res = await fetch(`/api/media-exists?key=${encodeURIComponent(key)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const body = (await res.json()) as { exists?: boolean };
          return Boolean(body.exists);
        }
      }
    } catch {
      // Fall through to public URL probe.
    }
  }

  if (!/^https?:\/\//i.test(url)) return false;
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Range: "bytes=0-0" },
      mode: "cors",
    });
    return res.ok || res.status === 206;
  } catch {
    return false;
  }
}
