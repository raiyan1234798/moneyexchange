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
import { COLLECTIONS, MAX_VIDEO_UPLOAD_BYTES } from "@/lib/constants";
import type { VideoAsset } from "@/lib/types";

function sortVideos(videos: VideoAsset[]): VideoAsset[] {
  return [...videos]
    .filter((video) => video.status === "active")
    .sort((a, b) => {
      const aTime = a.createdAt instanceof Date ? a.createdAt.getTime() : 0;
      const bTime = b.createdAt instanceof Date ? b.createdAt.getTime() : 0;
      return bTime - aTime;
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
    [where("branchId", "==", branchId)],
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
): Promise<string> {
  const id = await createDocument(COLLECTIONS.videos, {
    title: data.title,
    description: data.description ?? "",
    branchId: data.branchId,
    sourceType: "external",
    storagePath: null,
    downloadUrl: data.downloadUrl,
    mimeType: "video/mp4",
    status: "active",
    createdBy: data.createdBy,
  });

  await writeAuditLog({
    action: "video_add_external",
    entityType: "video",
    entityId: id,
    userId: actor.userId,
    userName: actor.userName,
    branchId: data.branchId,
    metadata: { title: data.title, sourceType: "external" },
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
): Promise<string> {
  if (file.size > MAX_VIDEO_UPLOAD_BYTES) {
    throw new Error(
      `File exceeds ${MAX_VIDEO_UPLOAD_BYTES / (1024 * 1024)}MB limit. Use External URL for large signage videos.`,
    );
  }

  const storagePath = `videos/${metadata.branchId}/${Date.now()}_${file.name.replace(/\s/g, "_")}`;
  const storageRef = ref(storage, storagePath);
  const uploadTask = uploadBytesResumable(storageRef, file, { contentType: file.type });

  await new Promise<void>((resolve, reject) => {
    uploadTask.on(
      "state_changed",
      (snapshot) => {
        onProgress?.((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
      },
      reject,
      () => resolve(),
    );
  });

  const downloadUrl = await getDownloadURL(storageRef);
  const id = await createDocument(COLLECTIONS.videos, {
    title: metadata.title,
    description: metadata.description ?? "",
    branchId: metadata.branchId,
    sourceType: "storage",
    storagePath,
    downloadUrl,
    mimeType: file.type,
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
  if (file.size > MAX_VIDEO_UPLOAD_BYTES) {
    throw new Error(
      `File exceeds ${MAX_VIDEO_UPLOAD_BYTES / (1024 * 1024)}MB limit.`,
    );
  }

  const storagePath = `videos/${existing.branchId}/${Date.now()}_${file.name.replace(/\s/g, "_")}`;
  const storageRef = ref(storage, storagePath);
  const uploadTask = uploadBytesResumable(storageRef, file, { contentType: file.type });

  await new Promise<void>((resolve, reject) => {
    uploadTask.on(
      "state_changed",
      (snapshot) => {
        onProgress?.((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
      },
      reject,
      () => resolve(),
    );
  });

  const downloadUrl = await getDownloadURL(storageRef);

  if (existing.sourceType === "storage" && existing.storagePath) {
    await deleteObject(ref(storage, existing.storagePath)).catch(() => undefined);
  }

  await updateDocument(COLLECTIONS.videos, existing.id, {
    sourceType: "storage",
    storagePath,
    downloadUrl,
    mimeType: file.type,
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
  return video.downloadUrl;
}
