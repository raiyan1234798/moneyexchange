import type { Branch, ImageAdvert, VideoAsset } from "@/lib/types";
import { resolveBranchTargets, canApplyToAllBranches } from "@/lib/branch-isolation";
import { addExternalVideo, deactivateBranchVideos } from "@/lib/services/video-service";
import { createTicker } from "@/lib/services/ticker-service";
import {
  addImageAdvertUrl,
  deactivateBranchImageAdverts,
} from "@/lib/services/image-advert-service";
import { createDocument, writeAuditLog } from "@/lib/firebase/firestore";
import { COLLECTIONS } from "@/lib/constants";

type Actor = { userId: string; userName: string };

export function getActiveBranchTargets(
  branches: Branch[],
  sourceBranchId: string,
  applyToAll: boolean,
): Branch[] {
  return resolveBranchTargets(branches, sourceBranchId, applyToAll);
}

export { canApplyToAllBranches };

export async function duplicateStorageVideoToBranch(
  source: Pick<
    VideoAsset,
    | "title"
    | "description"
    | "downloadUrl"
    | "storagePath"
    | "mimeType"
    | "fileSizeBytes"
    | "sourceType"
    | "playOrder"
    | "playRepeat"
    | "displayOrder"
  >,
  branchId: string,
  createdBy: string,
  actor: Actor,
): Promise<string> {
  // Copying a video to another branch ADDS it to that branch's playlist — it
  // must never hide what the branch already plays.
  const id = await createDocument(COLLECTIONS.videos, {
    title: source.title,
    description: source.description ?? "",
    branchId,
    sourceType: source.sourceType,
    storagePath: source.storagePath,
    downloadUrl: source.downloadUrl,
    mimeType: source.mimeType,
    fileSizeBytes: source.fileSizeBytes ?? null,
    playOrder: source.playOrder ?? null,
    playRepeat: source.playRepeat ?? null,
    displayOrder: source.displayOrder ?? null,
    status: "active",
    createdBy,
  });
  await writeAuditLog({
    action: "video_sync_all_branches",
    entityType: "video",
    entityId: id,
    userId: actor.userId,
    userName: actor.userName,
    branchId,
    metadata: { title: source.title, syncedFrom: "storage" },
  });
  return id;
}

export async function duplicateImageAdvertToBranch(
  source: Pick<
    ImageAdvert,
    | "title"
    | "downloadUrl"
    | "storagePath"
    | "fileSizeBytes"
    | "displayDurationSeconds"
    | "playOrder"
    | "playRepeat"
    | "displayOrder"
  >,
  branchId: string,
  createdBy: string,
  actor: Actor,
): Promise<string> {
  const id = await createDocument(COLLECTIONS.imageAdverts, {
    title: source.title,
    branchId,
    downloadUrl: source.downloadUrl,
    storagePath: source.storagePath ?? null,
    fileSizeBytes: source.fileSizeBytes ?? null,
    displayDurationSeconds: source.displayDurationSeconds ?? 15,
    playOrder: source.playOrder ?? null,
    playRepeat: source.playRepeat ?? null,
    displayOrder: source.displayOrder ?? null,
    status: "active",
    createdBy,
  });
  await writeAuditLog({
    action: "image_sync_all_branches",
    entityType: "image_advert",
    entityId: id,
    userId: actor.userId,
    userName: actor.userName,
    branchId,
    metadata: { title: source.title, syncedFrom: "branch_playlist" },
  });
  return id;
}

/**
 * Push THIS branch's active videos + image adverts to every other active branch.
 * Used when an admin has already built a playlist on one branch and wants every
 * TV to play the same set. Chunked (Firestore-only) videos are skipped — they
 * can't be shared via URL.
 */
export async function pushBranchMediaToAllBranches(
  branches: Branch[],
  sourceBranchId: string,
  videos: VideoAsset[],
  images: ImageAdvert[],
  actor: Actor,
  opts?: { replaceExisting?: boolean },
): Promise<{
  targetCount: number;
  videosCopied: number;
  imagesCopied: number;
  videosSkipped: number;
}> {
  const targets = getActiveBranchTargets(branches, sourceBranchId, true).filter(
    (b) => b.id !== sourceBranchId,
  );
  if (targets.length === 0) {
    return { targetCount: 0, videosCopied: 0, imagesCopied: 0, videosSkipped: 0 };
  }

  const copyableVideos = videos.filter(
    (v) =>
      v.status === "active" &&
      v.sourceType !== "chunked" &&
      Boolean(v.downloadUrl?.trim()),
  );
  const skipped = videos.filter((v) => v.status === "active" && v.sourceType === "chunked").length;
  const copyableImages = images.filter(
    (img) => img.status === "active" && Boolean(img.downloadUrl?.trim()),
  );

  let videosCopied = 0;
  let imagesCopied = 0;

  for (const branch of targets) {
    if (opts?.replaceExisting) {
      await Promise.all([
        deactivateBranchVideos(branch.id),
        deactivateBranchImageAdverts(branch.id),
      ]);
    }
    for (const video of copyableVideos) {
      await duplicateStorageVideoToBranch(video, branch.id, actor.userId, actor);
      videosCopied += 1;
    }
    for (const image of copyableImages) {
      await duplicateImageAdvertToBranch(image, branch.id, actor.userId, actor);
      imagesCopied += 1;
    }
  }

  await writeAuditLog({
    action: "media_push_all_branches",
    entityType: "branch",
    entityId: sourceBranchId,
    userId: actor.userId,
    userName: actor.userName,
    branchId: sourceBranchId,
    metadata: {
      targetCount: targets.length,
      videosPerBranch: copyableVideos.length,
      imagesPerBranch: copyableImages.length,
      replaceExisting: opts?.replaceExisting === true,
      videosSkippedChunked: skipped,
    },
  });

  return {
    targetCount: targets.length,
    videosCopied,
    imagesCopied,
    videosSkipped: skipped,
  };
}

export async function syncExternalVideoToBranches(
  branches: Branch[],
  sourceBranchId: string,
  applyToAll: boolean,
  data: { title: string; downloadUrl: string; createdBy: string },
  actor: Actor,
): Promise<number> {
  const targets = getActiveBranchTargets(branches, sourceBranchId, applyToAll);
  await Promise.all(
    targets.map((branch) =>
      addExternalVideo(
        { ...data, branchId: branch.id },
        actor,
      ),
    ),
  );
  return targets.length;
}

export async function syncTickerToBranches(
  branches: Branch[],
  sourceBranchId: string,
  applyToAll: boolean,
  data: Omit<import("@/lib/types").TickerMessage, "id" | "createdAt" | "updatedAt" | "branchId">,
  actor: Actor,
): Promise<number> {
  const targets = getActiveBranchTargets(branches, sourceBranchId, applyToAll);
  await Promise.all(
    targets.map((branch) =>
      createTicker({ ...data, branchId: branch.id }, actor),
    ),
  );
  return targets.length;
}

export async function syncImageUrlToBranches(
  branches: Branch[],
  sourceBranchId: string,
  applyToAll: boolean,
  data: {
    title: string;
    downloadUrl: string;
    displayDurationSeconds?: number;
    createdBy: string;
  },
  actor: Actor,
): Promise<number> {
  const targets = getActiveBranchTargets(branches, sourceBranchId, applyToAll);
  await Promise.all(
    targets.map((branch) =>
      addImageAdvertUrl({ ...data, branchId: branch.id }, actor),
    ),
  );
  return targets.length;
}
