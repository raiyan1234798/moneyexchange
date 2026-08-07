import { listDocuments } from "@/lib/firebase/firestore";
import { COLLECTIONS } from "@/lib/constants";
import { mediaIdentityKeys } from "@/lib/media-identity";
import { estimateMediaItemBytes } from "@/lib/media-item-bytes";

export { estimateMediaItemBytes } from "@/lib/media-item-bytes";

type SizedMedia = {
  fileSizeBytes?: number | null;
  downloadUrl?: string | null;
  storagePath?: string | null;
  status?: string;
};

/**
 * Total unique media footprint across all branches.
 * Shared R2 files (same URL/path on many branches) count once — matches what
 * the bucket actually stores for those assets. Data-URL images count once too.
 */
export async function estimateUniqueMediaStorageBytes(): Promise<{
  bytes: number;
  videoItems: number;
  imageItems: number;
}> {
  const [videos, images] = await Promise.all([
    listDocuments<SizedMedia>(COLLECTIONS.videos, [], ["fileSizeBytes", "storagePath", "downloadUrl", "status"]),
    listDocuments<SizedMedia>(COLLECTIONS.imageAdverts, [], ["fileSizeBytes", "storagePath", "downloadUrl", "status"]),
  ]);

  const seen = new Set<string>();
  let bytes = 0;
  let videoItems = 0;
  let imageItems = 0;

  const add = (item: SizedMedia, kind: "video" | "image") => {
    if (item.status && item.status !== "active") return;
    const keys = mediaIdentityKeys(item.downloadUrl, item.storagePath);
    const idKey = keys[0] ?? `anon:${kind}:${Math.random()}`;
    // Skip if any identity key already counted (same file on another branch).
    if (keys.some((k) => seen.has(k))) return;
    for (const k of keys.length ? keys : [idKey]) seen.add(k);
    const size = estimateMediaItemBytes(item);
    if (size <= 0 && keys.length === 0) return;
    bytes += size;
    if (kind === "video") videoItems += 1;
    else imageItems += 1;
  };

  for (const v of videos) add(v, "video");
  for (const img of images) add(img, "image");

  return { bytes, videoItems, imageItems };
}
