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
import { COLLECTIONS, CHUNKED_UPLOAD_WARNING, MAX_CHUNKED_VIDEO_BYTES } from "@/lib/constants";
import { assertBranchId } from "@/lib/branch-isolation";
import { isChunkedVideo, loadChunkedVideoBlobUrl, uploadVideoChunks } from "@/lib/video-chunk-utils";
import { deleteR2Object, isR2UploadConfigured, uploadVideoToR2 } from "@/lib/r2-upload";
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

function sortByNewest(videos: VideoAsset[]): VideoAsset[] {
  return [...videos].sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
}

function sortVideos(videos: VideoAsset[]): VideoAsset[] {
  return sortByNewest(videos.filter((video) => video.status === "active"));
}

export const STORAGE_UNAVAILABLE_MESSAGE =
  "Having trouble uploading? Paste a direct video link instead — it's instant and works on every display.";

export const STORAGE_SETUP_URL =
  "https://console.firebase.google.com/project/moneyexchange-35c33/storage";

export { CHUNKED_UPLOAD_WARNING };

function uploadTimeoutMs(fileSizeBytes: number): number {
  const minutes = Math.ceil(fileSizeBytes / (1024 * 1024)) * 60_000;
  return Math.min(Math.max(minutes, 60_000), 600_000);
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
    return new Error("Upload timed out. Try a smaller file or paste a direct video link.");
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
    onProgress?.(1);

    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      uploadTask.cancel();
      reject(new Error("Upload timed out. Try a smaller file or paste a direct video link."));
    }, timeoutMs);

    uploadTask.on(
      "state_changed",
      (snapshot) => {
        const pct =
          snapshot.totalBytes > 0
            ? (snapshot.bytesTransferred / snapshot.totalBytes) * 100
            : 1;
        onProgress?.(Math.max(1, pct));
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
        onProgress?.(100);
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

async function removeStoredVideoBytes(video: VideoAsset): Promise<void> {
  if (video.sourceType === "r2" && video.storagePath) {
    await deleteR2Object(video.storagePath);
  }
  if (video.sourceType === "storage" && video.storagePath) {
    await deleteObject(ref(storage, video.storagePath)).catch(() => undefined);
  }
  if (video.sourceType === "chunked") {
    await removeChunkedVideoData(video.id);
  }
}

export async function listVideos(branchId: string): Promise<VideoAsset[]> {
  const scopedBranchId = assertBranchId(branchId, "listVideos");
  const videos = await listDocuments<VideoAsset>(COLLECTIONS.videos, [
    where("branchId", "==", scopedBranchId),
  ]);
  return sortVideos(videos);
}

/** Signage playback: active videos scoped to one branch — no cross-branch bleed. */
export function subscribeVideos(
  branchId: string,
  onData: (videos: VideoAsset[]) => void,
  onError?: (error: Error) => void,
) {
  const scopedBranchId = assertBranchId(branchId, "subscribeVideos");
  return subscribeCollection<VideoAsset>(
    COLLECTIONS.videos,
    [
      where("branchId", "==", scopedBranchId),
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

/**
 * Branch user proposes a video (by link) for their own branch. Saved as
 * "pending" so it does NOT play on the TV and does NOT replace the current
 * active video until a branch manager / admin approves it.
 */
export async function proposeExternalVideo(
  data: { title: string; branchId: string; downloadUrl: string; createdBy: string },
  actor: { userId: string; userName: string },
): Promise<string> {
  const scopedBranchId = assertBranchId(data.branchId, "proposeExternalVideo");
  const normalized = normalizeExternalVideoUrl(data.downloadUrl);

  const id = await createDocument(COLLECTIONS.videos, {
    title: data.title,
    description: "",
    branchId: scopedBranchId,
    sourceType: "external",
    storagePath: null,
    downloadUrl: normalized.url,
    mimeType: "video/mp4",
    status: "pending",
    createdBy: data.createdBy,
  });

  await writeAuditLog({
    action: "video_proposed",
    entityType: "video",
    entityId: id,
    userId: actor.userId,
    userName: actor.userName,
    branchId: scopedBranchId,
    metadata: { title: data.title, videoSource: normalized.source },
  });

  return id;
}

/** Videos awaiting approval for a branch (branch-user proposals). */
export function subscribePendingVideos(
  branchId: string,
  onData: (videos: VideoAsset[]) => void,
  onError?: (error: Error) => void,
) {
  const scopedBranchId = assertBranchId(branchId, "subscribePendingVideos");
  return subscribeCollection<VideoAsset>(
    COLLECTIONS.videos,
    [where("branchId", "==", scopedBranchId), where("status", "==", "pending")],
    // sortByNewest (NOT sortVideos) — sortVideos filters to active-only and would
    // discard every pending doc, leaving the approval queue permanently empty.
    (items) => onData(sortByNewest(items)),
    onError,
  );
}

/** Manager/admin approves a proposed video → it becomes the branch's active video. */
export async function approveVideo(
  video: VideoAsset,
  actor: { userId: string; userName: string },
): Promise<void> {
  const scopedBranchId = assertBranchId(video.branchId, "approveVideo");
  await deactivatePreviousBranchVideos(scopedBranchId);
  await updateDocument(COLLECTIONS.videos, video.id, { status: "active" });
  await writeAuditLog({
    action: "video_approved",
    entityType: "video",
    entityId: video.id,
    userId: actor.userId,
    userName: actor.userName,
    branchId: scopedBranchId,
    metadata: { title: video.title },
  });
}

/** Manager/admin rejects a proposed video (kept off the display). */
export async function rejectVideo(
  video: VideoAsset,
  actor: { userId: string; userName: string },
): Promise<void> {
  const scopedBranchId = assertBranchId(video.branchId, "rejectVideo");
  await updateDocument(COLLECTIONS.videos, video.id, { status: "inactive" });
  await writeAuditLog({
    action: "video_rejected",
    entityType: "video",
    entityId: video.id,
    userId: actor.userId,
    userName: actor.userName,
    branchId: scopedBranchId,
    metadata: { title: video.title },
  });
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
      `File exceeds ${MAX_CHUNKED_VIDEO_BYTES / (1024 * 1024)}MB limit for slow fallback. Paste a direct video link or enable Cloudflare R2.`,
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

async function saveUploadedVideoDoc(
  file: File,
  metadata: {
    title: string;
    branchId: string;
    description?: string;
    createdBy: string;
  },
  upload: {
    sourceType: "r2" | "storage";
    storagePath: string;
    downloadUrl: string;
    mimeType: string;
  },
  actor: { userId: string; userName: string },
): Promise<string> {
  const id = await createDocument(COLLECTIONS.videos, {
    title: metadata.title,
    description: metadata.description ?? "",
    branchId: metadata.branchId,
    sourceType: upload.sourceType,
    storagePath: upload.storagePath,
    downloadUrl: upload.downloadUrl,
    mimeType: upload.mimeType,
    fileSizeBytes: file.size,
    status: "active",
    createdBy: metadata.createdBy,
  });

  await writeAuditLog({
    action: upload.sourceType === "r2" ? "video_upload_r2" : "video_upload",
    entityType: "video",
    entityId: id,
    userId: actor.userId,
    userName: actor.userName,
    branchId: metadata.branchId,
    metadata: { title: metadata.title, fileSizeBytes: file.size, sourceType: upload.sourceType },
  });

  return id;
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
): Promise<{ id: string; usedChunkFallback: boolean }> {
  validateVideoFile(file);
  onProgress?.(1);
  await deactivatePreviousBranchVideos(metadata.branchId);

  if (isR2UploadConfigured()) {
    try {
      const r2 = await uploadVideoToR2(file, metadata.branchId, onProgress);
      const id = await saveUploadedVideoDoc(file, metadata, { ...r2, sourceType: "r2" }, actor);
      return { id, usedChunkFallback: false };
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (!isStorageUnavailableError(error) && !/not configured/i.test(message)) {
        console.warn("R2 upload failed, trying Firebase Storage:", error);
      }
    }
  }

  try {
    const firebase = await uploadVideoToStorage(file, metadata.branchId, onProgress);
    const id = await saveUploadedVideoDoc(
      file,
      metadata,
      { ...firebase, sourceType: "storage" },
      actor,
    );
    return { id, usedChunkFallback: false };
  } catch (error) {
    const shouldFallback =
      isStorageUnavailableError(error) ||
      (error instanceof Error && error.message === STORAGE_UNAVAILABLE_MESSAGE);

    if (!shouldFallback) {
      throw error instanceof Error ? error : new Error("Upload failed");
    }

    const id = await uploadVideoViaChunks(file, metadata, actor, onProgress);
    return { id, usedChunkFallback: true };
  }
}

export async function replaceVideo(
  existing: VideoAsset,
  file: File,
  actor: { userId: string; userName: string },
  onProgress?: (progress: number) => void,
): Promise<void> {
  validateVideoFile(file);
  onProgress?.(1);

  const previous = { ...existing };

  if (isR2UploadConfigured()) {
    try {
      const r2 = await uploadVideoToR2(file, existing.branchId, onProgress);
      await removeStoredVideoBytes(previous);
      await updateDocument(COLLECTIONS.videos, existing.id, {
        sourceType: "r2",
        storagePath: r2.storagePath,
        downloadUrl: r2.downloadUrl,
        mimeType: r2.mimeType,
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
        metadata: { title: existing.title, fileSizeBytes: file.size, sourceType: "r2" },
      });
      return;
    } catch {
      // fall through to Firebase Storage / chunks
    }
  }

  try {
    const firebase = await uploadVideoToStorage(file, existing.branchId, onProgress);
    await removeStoredVideoBytes(previous);
    await updateDocument(COLLECTIONS.videos, existing.id, {
      sourceType: "storage",
      storagePath: firebase.storagePath,
      downloadUrl: firebase.downloadUrl,
      mimeType: firebase.mimeType,
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

    await removeStoredVideoBytes(previous);

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
  await removeStoredVideoBytes(video);
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

export { isChunkedVideo, loadChunkedVideoBlobUrl, isR2UploadConfigured };
