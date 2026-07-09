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
import { COLLECTIONS } from "@/lib/constants";
import type { ImageAdvert } from "@/lib/types";

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
    .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
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
  await deactivateBranchImages(params.branchId);
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

export async function uploadImageAdvert(
  params: {
    title: string;
    branchId: string;
    file: File;
    displayDurationSeconds?: number;
    createdBy: string;
  },
  actor: { userId: string; userName: string },
): Promise<string> {
  // No Storage bucket on this project (free plan): compress in the browser
  // (downscale + WebP) and store the image INSIDE the Firestore doc as a data
  // URL — displays render it like any other URL.
  const compressed = await compressImageToDataUrl(params.file, ADVERT_IMAGE_OPTIONS);

  await deactivateBranchImages(params.branchId);
  const id = await createDocument(COLLECTIONS.imageAdverts, {
    title: params.title,
    branchId: params.branchId,
    downloadUrl: compressed.dataUrl,
    storagePath: null,
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

export async function deleteImageAdvert(
  image: ImageAdvert,
  actor: { userId: string; userName: string },
): Promise<void> {
  if (image.storagePath) {
    await deleteObject(ref(storage, image.storagePath)).catch(() => undefined);
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
