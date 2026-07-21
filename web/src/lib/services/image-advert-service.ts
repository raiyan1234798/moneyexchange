import { ref, deleteObject } from "firebase/storage";
import {
  createDocument,
  listDocuments,
  subscribeCollection,
  updateDocument,
  where,
  writeAuditLog,
} from "@/lib/firebase/firestore";
import { storage } from "@/lib/firebase/client";
import { ADVERT_IMAGE_OPTIONS, compressImageToDataUrl } from "@/lib/image-utils";
import { deleteR2Object, isR2UploadConfigured, uploadVideoToR2 } from "@/lib/r2-upload";
import { COLLECTIONS } from "@/lib/constants";
import type { ImageAdvert } from "@/lib/types";

async function dataUrlToFile(dataUrl: string, name: string): Promise<File> {
  const blob = await (await fetch(dataUrl)).blob();
  return new File([blob], name, { type: blob.type || "image/webp" });
}

function toMillis(value: ImageAdvert["createdAt"]): number {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate().getTime();
  }
  return 0;
}

function sortImages(images: ImageAdvert[]): ImageAdvert[] {
  return [...images]
    .filter((img) => img.status === "active")
    .sort((a, b) => {
      // Admin-chosen order first; unordered images fall back to newest-first.
      const ao = a.displayOrder;
      const bo = b.displayOrder;
      if (ao != null && bo != null && ao !== bo) return ao - bo;
      if (ao != null && bo == null) return -1;
      if (ao == null && bo != null) return 1;
      return toMillis(b.createdAt) - toMillis(a.createdAt);
    });
}

/** Persist a new rotation order — pass the image ids in the desired order. */
export async function reorderImageAdverts(
  orderedIds: string[],
  actor: { userId: string; userName: string },
): Promise<void> {
  await Promise.all(
    orderedIds.map((id, index) =>
      updateDocument(COLLECTIONS.imageAdverts, id, { displayOrder: index }),
    ),
  );
  await writeAuditLog({
    action: "image_advert_reorder",
    entityType: "image_advert",
    userId: actor.userId,
    userName: actor.userName,
    branchId: null,
    metadata: { count: orderedIds.length },
  }).catch(() => undefined);
}

export function subscribeImageAdverts(
  branchId: string,
  onData: (images: ImageAdvert[]) => void,
  onError?: (error: Error) => void,
) {
  // Public/unauthenticated TV kiosks can only read image_adverts with
  // status == 'active' (firestore.rules). The status filter is required for the
  // listen to be accepted; without it Firestore rejects the whole query and
  // image adverts silently never render on public displays.
  return subscribeCollection<ImageAdvert>(
    COLLECTIONS.imageAdverts,
    [where("branchId", "==", branchId), where("status", "==", "active")],
    (items) => onData(sortImages(items)),
    onError,
  );
}

export async function listImageAdverts(branchId: string): Promise<ImageAdvert[]> {
  const items = await listDocuments<ImageAdvert>(COLLECTIONS.imageAdverts, [
    where("branchId", "==", branchId),
  ]);
  return sortImages(items);
}

async function deactivateBranchImages(branchId: string): Promise<void> {
  const existing = await listImageAdverts(branchId);
  await Promise.all(
    existing.map((img) => updateDocument(COLLECTIONS.imageAdverts, img.id, { status: "inactive" })),
  );
}

export async function addImageAdvertUrl(
  params: {
    title: string;
    branchId: string;
    downloadUrl: string;
    displayDurationSeconds?: number;
    createdBy: string;
  },
  actor: { userId: string; userName: string },
): Promise<string> {
  // Adding an image never hides the existing ones — they all rotate together.
  const id = await createDocument(COLLECTIONS.imageAdverts, {
    title: params.title,
    branchId: params.branchId,
    downloadUrl: params.downloadUrl.trim(),
    storagePath: null,
    displayDurationSeconds: params.displayDurationSeconds ?? 15,
    status: "active",
    createdBy: params.createdBy,
  });
  await writeAuditLog({
    action: "image_advert_add",
    entityType: "image_advert",
    entityId: id,
    userId: actor.userId,
    userName: actor.userName,
    branchId: params.branchId,
    metadata: { title: params.title },
  });
  return id;
}

/** Deactivate every active image advert on a branch (before a multi-file batch). */
export async function deactivateBranchImageAdverts(branchId: string): Promise<void> {
  await deactivateBranchImages(branchId);
}

/** How long ONE image stays on the TV before the next rotates in. */
export async function updateImageAdvertDuration(
  id: string,
  seconds: number,
  actor: { userId: string; userName: string; branchId?: string; title?: string },
): Promise<void> {
  await updateDocument(COLLECTIONS.imageAdverts, id, { displayDurationSeconds: seconds });
  await writeAuditLog({
    action: "image_advert_duration",
    entityType: "image_advert",
    entityId: id,
    userId: actor.userId,
    userName: actor.userName,
    branchId: actor.branchId,
    metadata: { title: actor.title, displayDurationSeconds: seconds },
  });
}

export async function uploadImageAdvert(
  params: {
    title: string;
    branchId: string;
    file: File;
    displayDurationSeconds?: number;
    createdBy: string;
  },
  actor: { userId: string; userName: string },
  opts?: { keepExisting?: boolean },
): Promise<string> {
  // Always optimise first (downscale + WebP) — smaller files, less storage.
  const compressed = await compressImageToDataUrl(params.file, ADVERT_IMAGE_OPTIONS);

  // Prefer Cloudflare R2 when configured (real URL, no Firestore bloat);
  // otherwise store the compressed image INSIDE the Firestore doc as a data URL
  // so displays still render it like any other URL.
  let downloadUrl = compressed.dataUrl;
  let storagePath: string | null = null;
  let fileSizeBytes = compressed.bytes;
  if (isR2UploadConfigured()) {
    try {
      const baseName = params.file.name.replace(/\.[^.]+$/, "") || "advert";
      const optimizedFile = await dataUrlToFile(compressed.dataUrl, `${baseName}.webp`);
      const r2 = await uploadVideoToR2(optimizedFile, params.branchId);
      downloadUrl = r2.downloadUrl;
      storagePath = r2.storagePath;
      fileSizeBytes = r2.fileSizeBytes;
    } catch {
      // Fall back to the inline data URL if the R2 upload fails.
      downloadUrl = compressed.dataUrl;
      storagePath = null;
      fileSizeBytes = compressed.bytes;
    }
  }

  // Batch uploads keep prior images active so several rotate on the display.
  if (opts?.keepExisting !== true) await deactivateBranchImages(params.branchId);
  const id = await createDocument(COLLECTIONS.imageAdverts, {
    title: params.title,
    branchId: params.branchId,
    downloadUrl,
    storagePath,
    fileSizeBytes,
    displayDurationSeconds: params.displayDurationSeconds ?? 15,
    status: "active",
    createdBy: params.createdBy,
  });
  await writeAuditLog({
    action: "image_advert_upload",
    entityType: "image_advert",
    entityId: id,
    userId: actor.userId,
    userName: actor.userName,
    branchId: params.branchId,
    metadata: {
      title: params.title,
      originalBytes: params.file.size,
      storedBytes: compressed.bytes,
      width: compressed.width,
      height: compressed.height,
    },
  });
  return id;
}

/** Cross-branch copies can share one stored file — never destroy a file some
    other (non-deleted) image doc still points at. */
async function imageFileStillReferenced(image: ImageAdvert): Promise<boolean> {
  if (!image.storagePath) return false;
  try {
    const sharers = await listDocuments<ImageAdvert>(COLLECTIONS.imageAdverts, [
      where("storagePath", "==", image.storagePath),
    ]);
    return sharers.some((img) => img.id !== image.id && img.status !== "inactive");
  } catch {
    return true; // keep the file when unsure — cleanup reclaims true orphans
  }
}

export async function deleteImageAdvert(
  image: ImageAdvert,
  actor: { userId: string; userName: string },
): Promise<void> {
  if (image.storagePath?.startsWith("images/")) {
    if (!(await imageFileStillReferenced(image))) {
      await deleteR2Object(image.storagePath);
    }
  } else if (image.storagePath) {
    if (!(await imageFileStillReferenced(image))) {
      await deleteObject(ref(storage, image.storagePath)).catch(() => undefined);
    }
  }
  await updateDocument(COLLECTIONS.imageAdverts, image.id, { status: "inactive" });
  await writeAuditLog({
    action: "image_advert_delete",
    entityType: "image_advert",
    entityId: image.id,
    userId: actor.userId,
    userName: actor.userName,
    branchId: image.branchId,
  });
}
