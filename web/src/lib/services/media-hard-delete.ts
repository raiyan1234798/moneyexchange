import { listDocuments, removeDocument, writeAuditLog, where } from "@/lib/firebase/firestore";
import { COLLECTIONS } from "@/lib/constants";
import { deleteR2Object } from "@/lib/r2-upload";
import { mediaIdentityKeys } from "@/lib/media-identity";

type Media = {
  id: string;
  branchId?: string;
  title?: string;
  downloadUrl?: string | null;
  storagePath?: string | null;
};

/**
 * Is this stored file still used by any OTHER media document?
 *
 * The same R2 object is shared when a playlist is copied to other branches, so
 * removing one branch's entry must never delete a file another branch is still
 * playing.
 */
async function fileStillUsedElsewhere(item: Media): Promise<boolean> {
  const keys = new Set(mediaIdentityKeys(item.downloadUrl, item.storagePath));
  if (keys.size === 0) return true; // unknown identity — never delete the file
  for (const collection of [COLLECTIONS.videos, COLLECTIONS.imageAdverts]) {
    const rows = await listDocuments<Media>(collection, []);
    for (const row of rows) {
      if (row.id === item.id) continue;
      const otherKeys = mediaIdentityKeys(row.downloadUrl, row.storagePath);
      if (otherKeys.some((k) => keys.has(k))) return true;
    }
  }
  return false;
}

/**
 * PERMANENTLY delete one video or image: the document goes from the database
 * and, when no other branch still points at it, the file goes from R2 too.
 *
 * The old behaviour only set status="inactive": the item vanished from the list
 * while the record and the file stayed forever, so nothing was ever really
 * removed and storage never went down (client 2026-08-08).
 */
export async function hardDeleteMedia(
  kind: "video" | "image",
  item: Media,
  actor: { userId: string; userName: string },
): Promise<{ fileRemoved: boolean }> {
  const collection = kind === "video" ? COLLECTIONS.videos : COLLECTIONS.imageAdverts;
  let fileRemoved = false;

  // Order matters: check references BEFORE removing this document, otherwise
  // the item's own row is already gone and every file looks unused.
  const shared = await fileStillUsedElsewhere(item);
  await removeDocument(collection, item.id);
  if (!shared && item.storagePath) {
    await deleteR2Object(item.storagePath);
    fileRemoved = true;
  }

  await writeAuditLog({
    action: kind === "video" ? "video_hard_delete" : "image_advert_hard_delete",
    entityType: kind === "video" ? "video" : "image_advert",
    entityId: item.id,
    userId: actor.userId,
    userName: actor.userName,
    branchId: item.branchId,
    metadata: { title: item.title ?? "", fileRemoved, storagePath: item.storagePath ?? "" },
  });
  return { fileRemoved };
}
