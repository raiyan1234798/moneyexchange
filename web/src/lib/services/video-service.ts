import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import { deleteDoc, doc } from "firebase/firestore";
import {
  createDocument,
  listDocuments,
  subscribeCollection,
  updateDocument,
  where,
  writeAuditLog,
} from "@/lib/firebase/firestore";
import { db, storage } from "@/lib/firebase/client";
import { COLLECTIONS, MAX_CHUNKED_VIDEO_BYTES } from "@/lib/constants";
import { isChunkedVideo, loadChunkedVideoBlobUrl, uploadVideoChunks } from "@/lib/video-chunk-utils";
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
  "Firebase Storage is not enabled on this project. Uploads use Firestore chunk storage (up to 25 MB) or use the Direct URL tab.";

export const STORAGE_SETUP_URL =
  "https://console.firebase.google.com/project/moneyexchange-35c33/storage";

function uploadTimeoutMs(fileSizeBytes: number): number {
  const minutes = Math.ceil(fileSizeBytes / (1024 * 1024)) * 60_000;
  return Math.min(Math.max(minutes, 120_000), 600_000);
}

function isStorageUnavailableError(error: unknown): boolean {
  const code = (error as { code?: string }).code ?? "";
  const message = (error as { message?: string }).message ?? "";
  return (
    code === "storage/unknown" ||
    code === "storage/object-not-found" ||
    code === "storage/bucket-not-found" ||
    /bucket.*not found/i.test(message) ||
    /storage.*not.*enabled/i.test(message) ||
    /billing account/i.test(message)
  );
}

function mapStorageUploadError(error: unknown): Error {
  const code = (error as { code?: string }).code ?? "";

  if (code === "storage/unauthorized") {
    return new Error("Upload was denied — check your sign-in and branch permissions.");
  }
  if (code === "storage/unauthenticated") {
    return new Error("You must be signed in to upload videos.");
  }
  if (isStorageUnavailableError(error)) {
    return new Error(STORAGE_UNAVAILABLE_MESSAGE);
  }
  if (code === "storage/canceled") {
    return new Error("Upload timed out. Try a smaller file or use Direct URL.");
  }
  return error instanceof Error ? error : new Error("Upload failed");
}

function waitForUpload(
  uploadTask: ReturnType<typeof uploadBytesResumable>,
  timeoutMs: number,
  onProgress?: (progress: number) => void,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let settled = false;

    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      uploadTask.cancel();
      reject(new Error("Upload timed out. Try a smaller file or use Direct URL."));
    }, timeoutMs);

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

async function deactivatePreviousBranchVideos(branchId: string): Promise<void> {
  const activeVideos = await listDocuments<VideoAsset>(COLLECTIONS.videos, [
    where("branchId", "==", branchId),
    where("status", "==", "active"),
  ]);

  await Promise.all(
    activeVideos.map((video) => updateDocument(COLLECTIONS.videos, video.id, { status: "inactive" })),
  );
}

async function removeChunkedVideoData(videoId: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTIONS.videoChunks, videoId)).catch(() => undefined);
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

  await deactivatePreviousBranchVideos(data.branchId);

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

async function uploadVideoToStorage(
  file: File,
  branchId: string,
  onProgress?: (progress: number) => void,
): Promise<{ storagePath: string; downloadUrl: string; mimeType: string }> {
  const mimeType = inferVideoMimeType(file);
  const storagePath = `videos/${branchId}/${Date.now()}_${file.name.replace(/\s/g, "_")}`;
  const storageRef = ref(storage, storagePath);
  const uploadTask = uploadBytesResumable(storageRef, file, { contentType: mimeType });

  await waitForUpload(uploadTask, uploadTimeoutMs(file.size), onProgress);

  const downloadUrl = await getDownloadURL(storageRef);
  return { storagePath, downloadUrl, mimeType };
}

async function uploadVideoViaChunks(
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
  if (file.size > MAX_CHUNKED_VIDEO_BYTES) {
    throw new Error(
      `File exceeds ${MAX_CHUNKED_VIDEO_BYTES / (1024 * 1024)}MB Firestore fallback limit. Use Direct URL or enable Firebase Storage.`,
    );
  }

  const mimeType = inferVideoMimeType(file);
  const videoId = `video_${metadata.branchId}_${Date.now()}`;
  const chunkCount = await uploadVideoChunks(
    file,
    videoId,
    metadata.branchId,
    mimeType,
    onProgress,
  );

  await createDocument(
    COLLECTIONS.videos,
    {
      title: metadata.title,
      description: metadata.description ?? "",
      branchId: metadata.branchId,
      sourceType: "chunked",
      storagePath: null,
      downloadUrl: `chunked://${videoId}`,
      mimeType,
      fileSizeBytes: file.size,
      chunkCount,
      status: "active",
      createdBy: metadata.createdBy,
    },
    videoId,
  );

  await writeAuditLog({
    action: "video_upload_chunked",
    entityType: "video",
    entityId: videoId,
    userId: actor.userId,
    userName: actor.userName,
    branchId: metadata.branchId,
    metadata: { title: metadata.title, fileSizeBytes: file.size, chunkCount },
  });

  return videoId;
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
  await deactivatePreviousBranchVideos(metadata.branchId);

  try {
    const { storagePath, downloadUrl, mimeType } = await uploadVideoToStorage(
      file,
      metadata.branchId,
      onProgress,
    );

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
      metadata: { title: metadata.title, fileSizeBytes: file.size, sourceType: "storage" },
    });

    return id;
  } catch (error) {
    if (!isStorageUnavailableError(error)) {
      throw error instanceof Error ? error : new Error("Upload failed");
    }

    return uploadVideoViaChunks(file, metadata, actor, onProgress);
  }
}

export async function replaceVideo(
  existing: VideoAsset,
  file: File,
  actor: { userId: string; userName: string },
  onProgress?: (progress: number) => void,
): Promise<void> {
  validateVideoFile(file);

  try {
    const { storagePath, downloadUrl, mimeType } = await uploadVideoToStorage(
      file,
      existing.branchId,
      onProgress,
    );

    if (existing.sourceType === "storage" && existing.storagePath) {
      await deleteObject(ref(storage, existing.storagePath)).catch(() => undefined);
    }
    if (existing.sourceType === "chunked") {
      await removeChunkedVideoData(existing.id);
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
  } catch (error) {
    if (!isStorageUnavailableError(error)) {
      throw error instanceof Error ? error : new Error("Replace failed");
    }

    if (existing.sourceType === "chunked") {
      await removeChunkedVideoData(existing.id);
    }

    const chunkCount = await uploadVideoChunks(
      file,
      existing.id,
      existing.branchId,
      inferVideoMimeType(file),
      onProgress,
    );

    await updateDocument(COLLECTIONS.videos, existing.id, {
      sourceType: "chunked",
      storagePath: null,
      downloadUrl: `chunked://${existing.id}`,
      mimeType: inferVideoMimeType(file),
      fileSizeBytes: file.size,
      chunkCount,
      title: existing.title,
    });
  }
}

export async function deleteVideo(
  video: VideoAsset,
  actor: { userId: string; userName: string },
): Promise<void> {
  if (video.sourceType === "storage" && video.storagePath) {
    await deleteObject(ref(storage, video.storagePath)).catch(() => undefined);
  }
  if (video.sourceType === "chunked") {
    await removeChunkedVideoData(video.id);
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
  if (isChunkedVideo(video)) {
    return "";
  }

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

export { isChunkedVideo, loadChunkedVideoBlobUrl };
