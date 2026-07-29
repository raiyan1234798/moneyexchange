import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import { collection, deleteDoc, doc, getDocs } from "firebase/firestore";
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

// Admin-chosen order first (displayOrder ascending); anything without an order
// falls back to newest-first, so existing videos keep working until reordered.
function sortByDisplayOrder(videos: VideoAsset[]): VideoAsset[] {
  return [...videos].sort((a, b) => {
    const ao = a.displayOrder;
    const bo = b.displayOrder;
    if (ao != null && bo != null && ao !== bo) return ao - bo;
    if (ao != null && bo == null) return -1;
    if (ao == null && bo != null) return 1;
    return toMillis(b.createdAt) - toMillis(a.createdAt);
  });
}

function sortVideos(videos: VideoAsset[]): VideoAsset[] {
  return sortByDisplayOrder(videos.filter((video) => video.status === "active"));
}

/** Persist a new play order — pass the video ids in the desired order. */
export async function reorderVideos(
  orderedIds: string[],
  actor: { userId: string; userName: string },
): Promise<void> {
  await Promise.all(
    orderedIds.map((id, index) => updateDocument(COLLECTIONS.videos, id, { displayOrder: index })),
  );
  await writeAuditLog({
    action: "video_reorder",
    entityType: "video",
    userId: actor.userId,
    userName: actor.userName,
    branchId: null,
    metadata: { count: orderedIds.length },
  }).catch(() => undefined);
}

export const STORAGE_UNAVAILABLE_MESSAGE =
  "Having trouble uploading? Paste a direct video link instead — it's instant and works on every display.";

export const STORAGE_SETUP_URL =
  "https://console.firebase.google.com/project/moneyexchange-35c33/storage";

let storageBucketAvailable: boolean | null = null;

/**
 * The Spark (free) plan cannot provision the default Storage bucket, so every
 * upload to it fails as a CORS/404 error — but only after the SDK burns ~30s
 * of retries. Probe the bucket once per session (an unauthenticated GET on a
 * missing bucket returns 404; an existing bucket returns 401/403) so uploads
 * can skip straight to the working fallback.
 */
export async function isFirebaseStorageAvailable(): Promise<boolean> {
  if (storageBucketAvailable !== null) return storageBucketAvailable;
  const bucket = storage.app.options.storageBucket;
  if (!bucket) {
    storageBucketAvailable = false;
    return false;
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const resp = await fetch(
      `https://firebasestorage.googleapis.com/v0/b/${bucket}/o?maxResults=1`,
      { signal: controller.signal },
    );
    clearTimeout(timer);
    storageBucketAvailable = resp.status !== 404;
  } catch {
    // Network hiccup — don't cache a verdict; let the SDK try normally.
    return true;
  }
  return storageBucketAvailable;
}

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

async function deactivatePreviousBranchVideos(branchId: string, excludeVideoId?: string): Promise<void> {
  const activeVideos = await listDocuments<VideoAsset>(COLLECTIONS.videos, [
    where("branchId", "==", branchId),
    where("status", "==", "active"),
  ]);

  await Promise.all(
    activeVideos
      // Never deactivate the video that was just uploaded/activated.
      .filter((video) => video.id !== excludeVideoId)
      .map(async (video) => {
        // Soft-deactivate ONLY — never purge chunk bytes here. Accidental
        // replaces used to destroy chunked videos permanently; Restore can
        // bring inactive items back when the bytes are still present. Explicit
        // deleteVideo() is what removes stored/chunked bytes.
        await updateDocument(COLLECTIONS.videos, video.id, { status: "inactive" });
      }),
  );
}

async function removeChunkedVideoData(videoId: string): Promise<void> {
  // Firestore does NOT cascade-delete subcollections: deleting only the meta
  // doc would orphan every ~1MB chunk part forever (and exhaust the free
  // 1 GiB quota). Delete parts first — the parts rules resolve branch access
  // via get() on the parent meta doc, so it must still exist at that point.
  const partsSnap = await getDocs(
    collection(db, COLLECTIONS.videoChunks, videoId, "parts"),
  ).catch(() => null);
  if (partsSnap) {
    await Promise.all(partsSnap.docs.map((part) => deleteDoc(part.ref).catch(() => undefined)));
  }
  await deleteDoc(doc(db, COLLECTIONS.videoChunks, videoId)).catch(() => undefined);
}

/** True when ANOTHER (non-deleted) video doc points at the same stored file —
    cross-branch copies share one object, so deleting one branch's row must
    never destroy the file the other branches still play. */
async function storedFileStillReferenced(video: VideoAsset): Promise<boolean> {
  if (!video.storagePath) return false;
  try {
    const sharers = await listDocuments<VideoAsset>(COLLECTIONS.videos, [
      where("storagePath", "==", video.storagePath),
    ]);
    return sharers.some((v) => v.id !== video.id && v.status !== "inactive");
  } catch {
    // If the check itself fails, err on the side of KEEPING the file.
    return true;
  }
}

async function removeStoredVideoBytes(video: VideoAsset): Promise<void> {
  if (video.sourceType === "r2" && video.storagePath) {
    if (await storedFileStillReferenced(video)) return;
    await deleteR2Object(video.storagePath);
  }
  if (video.sourceType === "storage" && video.storagePath) {
    if (await storedFileStillReferenced(video)) return;
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

  // Adding a link must never hide the branch's existing videos — they all
  // rotate as a playlist. (Removing one is an explicit Remove action.)
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
  // The approved video JOINS the branch playlist — it must not hide the others.
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
  keepExisting?: boolean,
): Promise<string> {
  if (file.size > MAX_CHUNKED_VIDEO_BYTES) {
    throw new Error(
      `File exceeds ${MAX_CHUNKED_VIDEO_BYTES / (1024 * 1024)}MB limit for slow fallback. Paste a direct video link or enable Cloudflare R2.`,
    );
  }

  const mimeType = inferVideoMimeType(file);
  const videoId = `video_${metadata.branchId}_${Date.now()}`;
  
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
      chunkCount: 0,
      status: "uploading",
      createdBy: metadata.createdBy,
    },
    videoId,
  );

  let actualChunkCount: number;
  try {
    actualChunkCount = await uploadVideoChunks(
      file,
      videoId,
      metadata.branchId,
      mimeType,
      onProgress,
    );
  } catch (error) {
    // A mid-upload failure must not strand a half-written video: remove the
    // partial chunks and the 'uploading' doc, then surface the error.
    await removeChunkedVideoData(videoId).catch(() => undefined);
    await deleteDoc(doc(db, COLLECTIONS.videos, videoId)).catch(() => undefined);
    throw error instanceof Error
      ? new Error(`Upload failed partway — nothing was saved. ${error.message}`)
      : new Error("Upload failed partway — nothing was saved. Please try again.");
  }

  await updateDocument(COLLECTIONS.videos, videoId, {
    status: "active",
    chunkCount: actualChunkCount
  });

  // Deactivate the previous video immediately after activation (excluding the
  // new one) so no failure in between can leave two active videos rotating.
  // Skipped for batch uploads (keepExisting) so several videos can rotate.
  if (!keepExisting) {
    await deactivatePreviousBranchVideos(metadata.branchId, videoId);
  }

  // Audit logging must never fail the upload after the video is already live.
  await writeAuditLog({
    action: "video_upload_chunked",
    entityType: "video",
    entityId: videoId,
    userId: actor.userId,
    userName: actor.userName,
    branchId: metadata.branchId,
    metadata: { title: metadata.title, fileSizeBytes: file.size, chunkCount: actualChunkCount },
  }).catch(() => undefined);

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
  opts?: { keepExisting?: boolean },
): Promise<{ id: string; usedChunkFallback: boolean }> {
  validateVideoFile(file);
  onProgress?.(1);
  // Playlist model: uploads ADD to what the branch already plays. Opt out with
  // keepExisting: false only for an intentional replace. Default used to wipe
  // every other active video whenever a caller forgot the flag.
  const keepExisting = opts?.keepExisting !== false;

  if (isR2UploadConfigured()) {
    try {
      const r2 = await uploadVideoToR2(file, metadata.branchId, onProgress);
      if (!keepExisting) await deactivatePreviousBranchVideos(metadata.branchId);
      const id = await saveUploadedVideoDoc(file, metadata, { ...r2, sourceType: "r2" }, actor);
      return { id, usedChunkFallback: false };
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (!isStorageUnavailableError(error) && !/not configured/i.test(message)) {
        console.warn("R2 upload failed, trying Firebase Storage:", error);
      }
    }
  }

  // Skip Firebase Storage entirely when the bucket doesn't exist (free plan) —
  // going straight to the chunked fallback saves ~30s of doomed CORS retries.
  // (uploadVideoViaChunks handles activation + deactivating the previous video.)
  if (!(await isFirebaseStorageAvailable())) {
    const id = await uploadVideoViaChunks(file, metadata, actor, onProgress, keepExisting);
    return { id, usedChunkFallback: true };
  }

  try {
    const firebase = await uploadVideoToStorage(file, metadata.branchId, onProgress);
    if (!keepExisting) await deactivatePreviousBranchVideos(metadata.branchId);
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

    const id = await uploadVideoViaChunks(file, metadata, actor, onProgress, keepExisting);
    return { id, usedChunkFallback: true };
  }
}

/** Deactivate every active video on a branch (used before a multi-file batch). */
export async function deactivateBranchVideos(branchId: string): Promise<void> {
  await deactivatePreviousBranchVideos(assertBranchId(branchId, "deactivateBranchVideos"));
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
  // Soft-delete only. Stored bytes stay so the admin can Restore. Accidental
  // Remove / Remove-all must never permanently erase playlist media.
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

/**
 * Bring soft-deleted (inactive) videos back on a branch when their file/URL is
 * still present. Skips chunked videos whose chunk bytes were already purged.
 * Does NOT touch other branches' playlists.
 */
export async function restoreInactiveVideosOnBranch(
  branchId: string,
  actor: { userId: string; userName: string },
): Promise<number> {
  const scopedBranchId = assertBranchId(branchId, "restoreInactiveVideosOnBranch");
  const inactive = await listDocuments<VideoAsset>(COLLECTIONS.videos, [
    where("branchId", "==", scopedBranchId),
    where("status", "==", "inactive"),
  ]);
  let restored = 0;
  for (const video of inactive) {
    const hasUrl = Boolean(video.downloadUrl?.trim()) && !video.downloadUrl.startsWith("chunked://");
    const isChunkedOk =
      video.sourceType === "chunked" &&
      typeof video.chunkCount === "number" &&
      video.chunkCount > 0;
    if (!hasUrl && !isChunkedOk) continue;
    await updateDocument(COLLECTIONS.videos, video.id, { status: "active" });
    restored += 1;
  }
  if (restored > 0) {
    await writeAuditLog({
      action: "video_restore_inactive",
      entityType: "video",
      entityId: scopedBranchId,
      userId: actor.userId,
      userName: actor.userName,
      branchId: scopedBranchId,
      metadata: { restored },
    });
  }
  return restored;
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
