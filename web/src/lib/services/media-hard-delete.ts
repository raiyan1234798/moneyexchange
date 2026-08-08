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

/** Only the fields the reference check needs — keeps the query tiny. */
const REF_FIELDS = ["storagePath", "downloadUrl", "branchId"];

/**
 * Every document pointing at the SAME stored file, across both collections.
 *
 * Uses an indexed equality query on storagePath (falling back to downloadUrl)
 * and projects just three fields. The first version listed EVERY video and
 * image document in full — 1,200+ docs per click — which is why Remove
 * appeared to hang and nothing was deleted (client 2026-08-08).
 */
async function findSiblings(item: Media): Promise<Media[]> {
  const path = item.storagePath?.trim();
  const url = item.downloadUrl?.trim();
  if (!path && !url) return [];

  const found: Media[] = [];
  for (const collection of [COLLECTIONS.videos, COLLECTIONS.imageAdverts]) {
    if (path) {
      found.push(
        ...(await listDocuments<Media>(collection, [where("storagePath", "==", path)], REF_FIELDS)),
      );
    }
    if (url) {
      const byUrl = await listDocuments<Media>(
        collection,
        [where("downloadUrl", "==", url)],
        REF_FIELDS,
      );
      for (const row of byUrl) if (!found.some((f) => f.id === row.id)) found.push(row);
    }
  }
  // Belt and braces: normalised URL forms (query/hash variants) still match.
  const keys = new Set(mediaIdentityKeys(url, path));
  return found.filter((row) => {
    if (row.id === item.id) return true;
    const other = mediaIdentityKeys(row.downloadUrl, row.storagePath);
    return other.some((k) => keys.has(k));
  });
}

/**
 * PERMANENTLY delete a video or image: the document goes from the database and,
 * when nothing else points at it, the file goes from R2 too.
 *
 * scope "all" (default) removes the file from EVERY branch that has it;
 * "branch" removes only this branch's entry and keeps the file if other
 * branches still use it.
 */
export async function hardDeleteMedia(
  kind: "video" | "image",
  item: Media,
  actor: { userId: string; userName: string },
  scope: "all" | "branch" = "all",
): Promise<{ fileRemoved: boolean; branchesAffected: number }> {
  const collection = kind === "video" ? COLLECTIONS.videos : COLLECTIONS.imageAdverts;
  const siblings = await findSiblings(item);
  let fileRemoved = false;
  let branchesAffected = 1;

  if (scope === "all") {
    const targets = siblings.length > 0 ? siblings : [item];
    await Promise.all(targets.map((row) => removeDocument(collection, row.id)));
    branchesAffected = new Set(targets.map((t) => t.branchId ?? "")).size || 1;
    if (item.storagePath) {
      await deleteR2Object(item.storagePath);
      fileRemoved = true;
    }
  } else {
    const usedElsewhere = siblings.some((row) => row.id !== item.id);
    await removeDocument(collection, item.id);
    if (!usedElsewhere && item.storagePath) {
      await deleteR2Object(item.storagePath);
      fileRemoved = true;
    }
  }

  // Fire-and-forget: the audit entry must never delay the UI.
  void writeAuditLog({
    action: kind === "video" ? "video_hard_delete" : "image_advert_hard_delete",
    entityType: kind === "video" ? "video" : "image_advert",
    entityId: item.id,
    userId: actor.userId,
    userName: actor.userName,
    branchId: item.branchId,
    metadata: {
      title: item.title ?? "",
      fileRemoved,
      scope,
      branchesAffected,
      storagePath: item.storagePath ?? "",
    },
  }).catch(() => undefined);

  return { fileRemoved, branchesAffected };
}
