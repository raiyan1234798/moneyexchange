import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import {
  createDocument,
  listDocuments,
  subscribeCollection,
  updateDocument,
  where,
  writeAuditLog,
} from "@/lib/firebase/firestore";
import { storage } from "@/lib/firebase/client";
import { COLLECTIONS } from "@/lib/constants";
import {
  inferVideoMimeType,
  isGoogleDriveUrl,
  normalizeExternalVideoUrl,
  validateVideoFile,
} from "@/lib/video-utils";
import type { VideoAsset } from "@/lib/types";

function toMillis(value: VideoAsset["createdAt"]): number {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate().getTime();
  }
  return 0;
}

function sortVideos(videos: VideoAsset[]): VideoAsset[] {
  return [...videos]
    .filter((video) => video.status === "active")
    .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
}

export const STORAGE_UNAVAILABLE_MESSAGE =
  "Enable Firebase Storage in the Firebase console OR use the External URL tab.";

const UPLOAD_TIMEOUT_MS = 30_000;

function mapStorageUploadError(error: unknown): Error {
  const code = (error as { code?: string }).code ?? "";
  const message = (error as { message?: string }).message ?? "";

  if (code === "storage/unauthorized") {
    return new Error(`${STORAGE_UNAVAILABLE_MESSAGE} Upload was denied — check your sign-in and permissions.`);
  }
  if (code === "storage/unauthenticated") {
    return new Error("You must be signed in to upload videos.");
  }
  if (
    code === "storage/unknown" ||
    code === "storage/object-not-found" ||
    code === "storage/bucket-not-found" ||
    /bucket.*not found/i.test(message) ||
    /storage.*not.*enabled/i.test(message)
  ) {
    return new Error(STORAGE_UNAVAILABLE_MESSAGE);
  }
  if (code === "storage/canceled") {
    return new Error(`${STORAGE_UNAVAILABLE_MESSAGE} Upload timed out after 30 seconds.`);
  }
  return error instanceof Error ? error : new Error("Upload failed");
}

function waitForUpload(
  uploadTask: ReturnType<typeof uploadBytesResumable>,
  onProgress?: (progress: number) => void,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let settled = false;

    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      uploadTask.cancel();
      reject(new Error(`${STORAGE_UNAVAILABLE_MESSAGE} Upload timed out after 30 seconds.`));
    }, UPLOAD_TIMEOUT_MS);

    uploadTask.on(
      "state_changed",
      (snapshot) => {
        onProgress?.((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
      },
      (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        reject(mapStorageUploadError(error));
      },
      () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        resolve();
      },
    );
  });
}

export async function listVideos(branchId: string): Promise<VideoAsset[]> {
  const videos = await listDocuments<VideoAsset>(COLLECTIONS.videos, [
    where("branchId", "==", branchId),
  ]);
  return sortVideos(videos);
}

export function subscribeVideos(
  branchId: string,
  onData: (videos: VideoAsset[]) => void,
  onError?: (error: Error) => void,
) {
  return subscribeCollection<VideoAsset>(
    COLLECTIONS.videos,
    [
      where("branchId", "==", branchId),
      where("status", "==", "active"),
    ],
    (items) => onData(sortVideos(items)),
    onError,
  );
}

export async function addExternalVideo(
  data: {
    title: string;
    branchId: string;
    downloadUrl: string;
    description?: string;
    createdBy: string;
  },
  actor: { userId: string; userName: string },
): Promise<{ id: string; source: "direct" | "google_drive" }> {
  const normalized = normalizeExternalVideoUrl(data.downloadUrl);

  const id = await createDocument(COLLECTIONS.videos, {
    title: data.title,
    description: data.description ?? "",
    branchId: data.branchId,
    sourceType: "external",
    storagePath: null,
    downloadUrl: normalized.url,
    mimeType: "video/mp4",
    status: "active",
    createdBy: data.createdBy,
  });

  await writeAuditLog({
    action: normalized.source === "google_drive" ? "video_add_google_drive" : "video_add_external",
    entityType: "video",
    entityId: id,
    userId: actor.userId,
    userName: actor.userName,
    branchId: data.branchId,
    metadata: {
      title: data.title,
      sourceType: "external",
      videoSource: normalized.source,
      ...(normalized.originalUrl ? { originalUrl: normalized.originalUrl } : {}),
    },
  });

  return { id, source: normalized.source };
}

export async function uploadVideo(
  file: File,
  metadata: {
    title: string;
    branchId: string;
    description?: string;
    createdBy: string;
  },
  actor: { userId: string; userName: string },
  onProgress?: (progress: number) => void,
): Promise<string> {
  validateVideoFile(file);

  const mimeType = inferVideoMimeType(file);
  const storagePath = `videos/${metadata.branchId}/${Date.now()}_${file.name.replace(/\s/g, "_")}`;
  const storageRef = ref(storage, storagePath);
  const uploadTask = uploadBytesResumable(storageRef, file, { contentType: mimeType });

  await waitForUpload(uploadTask, onProgress);

  const downloadUrl = await getDownloadURL(storageRef);
  const id = await createDocument(COLLECTIONS.videos, {
    title: metadata.title,
    description: metadata.description ?? "",
    branchId: metadata.branchId,
    sourceType: "storage",
    storagePath,
    downloadUrl,
    mimeType,
    fileSizeBytes: file.size,
    status: "active",
    createdBy: metadata.createdBy,
  });

  await writeAuditLog({
    action: "video_upload",
    entityType: "video",
    entityId: id,
    userId: actor.userId,
    userName: actor.userName,
    branchId: metadata.branchId,
    metadata: { title: metadata.title, fileSizeBytes: file.size },
  });

  return id;
}

export async function replaceVideo(
  existing: VideoAsset,
  file: File,
  actor: { userId: string; userName: string },
  onProgress?: (progress: number) => void,
): Promise<void> {
  validateVideoFile(file);

  const mimeType = inferVideoMimeType(file);
  const storagePath = `videos/${existing.branchId}/${Date.now()}_${file.name.replace(/\s/g, "_")}`;
  const storageRef = ref(storage, storagePath);
  const uploadTask = uploadBytesResumable(storageRef, file, { contentType: mimeType });

  await waitForUpload(uploadTask, onProgress);

  const downloadUrl = await getDownloadURL(storageRef);

  if (existing.sourceType === "storage" && existing.storagePath) {
    await deleteObject(ref(storage, existing.storagePath)).catch(() => undefined);
  }

  await updateDocument(COLLECTIONS.videos, existing.id, {
    sourceType: "storage",
    storagePath,
    downloadUrl,
    mimeType,
    fileSizeBytes: file.size,
    title: existing.title,
  });

  await writeAuditLog({
    action: "video_replace",
    entityType: "video",
    entityId: existing.id,
    userId: actor.userId,
    userName: actor.userName,
    branchId: existing.branchId,
    metadata: { title: existing.title, fileSizeBytes: file.size },
  });
}

export async function deleteVideo(
  video: VideoAsset,
  actor: { userId: string; userName: string },
): Promise<void> {
  if (video.sourceType === "storage" && video.storagePath) {
    await deleteObject(ref(storage, video.storagePath)).catch(() => undefined);
  }
  await updateDocument(COLLECTIONS.videos, video.id, { status: "inactive" });
  await writeAuditLog({
    action: "delete",
    entityType: "video",
    entityId: video.id,
    userId: actor.userId,
    userName: actor.userName,
    branchId: video.branchId,
  });
}

export function resolveVideoPlaybackUrl(video: VideoAsset): string {
  const url = video.downloadUrl?.trim() ?? "";
  if (!url) return url;
  if (isGoogleDriveUrl(url)) {
    try {
      return normalizeExternalVideoUrl(url).url;
    } catch {
      return url;
    }
  }
  return url;
}
