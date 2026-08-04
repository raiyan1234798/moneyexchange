import type { Branch, ImageAdvert, VideoAsset } from "@/lib/types";
import { resolveBranchTargets, canApplyToAllBranches } from "@/lib/branch-isolation";
import {
  addExternalVideo,
  deactivateBranchVideos,
  restoreInactiveVideosOnBranch,
} from "@/lib/services/video-service";
import { createTicker, listTickers, updateTicker } from "@/lib/services/ticker-service";
import {
  addImageAdvertUrl,
  deactivateBranchImageAdverts,
  restoreInactiveImagesOnBranch,
} from "@/lib/services/image-advert-service";
import { createDocument, writeAuditLog } from "@/lib/firebase/firestore";
import { COLLECTIONS } from "@/lib/constants";
import type { TickerMessage } from "@/lib/types";
import { listVideos } from "@/lib/services/video-service";
import { listImageAdverts } from "@/lib/services/image-advert-service";

type Actor = { userId: string; userName: string };

export function getActiveBranchTargets(
  branches: Branch[],
  sourceBranchId: string,
  /** true = every active branch; false = source only; string[] = these branch
      ids (+ the source), so "Select specific branches" actually works. */
  applyToAll: boolean | string[],
): Branch[] {
  if (Array.isArray(applyToAll)) {
    const wanted = new Set([...applyToAll, sourceBranchId]);
    return branches.filter((b) => b.status === "active" && wanted.has(b.id));
  }
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
 *
 * Default is ADD (replaceExisting false) so other branches keep what they have
 * unless the admin explicitly ticks Replace.
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
    if (opts?.replaceExisting === true) {
      await Promise.all([
        deactivateBranchVideos(branch.id),
        deactivateBranchImageAdverts(branch.id),
      ]);
    }
    // Skip files this branch already plays (same URL or storage path) so
    // Restore / Push can be re-run without duplicating the playlist.
    const [existingVideos, existingImages] = opts?.replaceExisting
      ? [[], []]
      : await Promise.all([listVideos(branch.id), listImageAdverts(branch.id)]);
    const knownVideoKeys = new Set(
      existingVideos
        .filter((v) => v.status === "active")
        .flatMap((v) => [v.downloadUrl?.trim(), v.storagePath?.trim()].filter(Boolean) as string[]),
    );
    const knownImageKeys = new Set(
      existingImages
        .filter((img) => img.status === "active")
        .flatMap((img) =>
          [img.downloadUrl?.trim(), img.storagePath?.trim()].filter(Boolean) as string[],
        ),
    );

    for (const video of copyableVideos) {
      const keys = [video.downloadUrl?.trim(), video.storagePath?.trim()].filter(Boolean) as string[];
      if (keys.some((k) => knownVideoKeys.has(k))) continue;
      await duplicateStorageVideoToBranch(video, branch.id, actor.userId, actor);
      for (const k of keys) knownVideoKeys.add(k);
      videosCopied += 1;
    }
    for (const image of copyableImages) {
      const keys = [image.downloadUrl?.trim(), image.storagePath?.trim()].filter(Boolean) as string[];
      if (keys.some((k) => knownImageKeys.has(k))) continue;
      await duplicateImageAdvertToBranch(image, branch.id, actor.userId, actor);
      for (const k of keys) knownImageKeys.add(k);
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

/**
 * Soft-deleted media (inactive but file still present) → active again on EVERY
 * active branch. Then, if a source branch still has a full playlist, copy any
 * missing active items onto the others (add-only, never replace).
 */
export async function restoreInactiveMediaOnAllBranches(
  branches: Branch[],
  actor: Actor,
  source?: {
    branchId: string;
    videos: VideoAsset[];
    images: ImageAdvert[];
  },
): Promise<{
  branchCount: number;
  videosRestored: number;
  imagesRestored: number;
  videosCopied: number;
  imagesCopied: number;
}> {
  const activeBranches = branches.filter((b) => b.status === "active");
  let videosRestored = 0;
  let imagesRestored = 0;
  for (const branch of activeBranches) {
    videosRestored += await restoreInactiveVideosOnBranch(branch.id, actor);
    imagesRestored += await restoreInactiveImagesOnBranch(branch.id, actor);
  }

  let videosCopied = 0;
  let imagesCopied = 0;
  if (source?.branchId) {
    const push = await pushBranchMediaToAllBranches(
      branches,
      source.branchId,
      source.videos,
      source.images,
      actor,
      { replaceExisting: false },
    );
    videosCopied = push.videosCopied;
    imagesCopied = push.imagesCopied;
  }

  await writeAuditLog({
    action: "media_restore_all_branches",
    entityType: "branch",
    entityId: source?.branchId ?? "all",
    userId: actor.userId,
    userName: actor.userName,
    branchId: source?.branchId,
    metadata: {
      branchCount: activeBranches.length,
      videosRestored,
      imagesRestored,
      videosCopied,
      imagesCopied,
    },
  });

  return {
    branchCount: activeBranches.length,
    videosRestored,
    imagesRestored,
    videosCopied,
    imagesCopied,
  };
}

export async function syncExternalVideoToBranches(
  branches: Branch[],
  sourceBranchId: string,
  /** true = all active; false = source only; string[] = these ids (+ source). */
  applyToAll: boolean | string[],
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
  applyToAll: boolean | string[],
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

/**
 * Publish scrolling message content to one branch or every active branch.
 * Updates the latest active ticker on each target; creates one when missing.
 */
export async function upsertTickerContentToBranches(
  branches: Branch[],
  sourceBranchId: string,
  applyToAll: boolean | string[],
  data: Omit<TickerMessage, "id" | "createdAt" | "updatedAt" | "branchId" | "createdBy"> & {
    createdBy?: string;
  },
  actor: Actor,
  /** When editing the source branch ticker, update this id there instead of creating. */
  sourceTickerId?: string | null,
): Promise<number> {
  const targets = getActiveBranchTargets(branches, sourceBranchId, applyToAll);
  await Promise.all(
    targets.map(async (branch) => {
      const payload = {
        messages: data.messages,
        scrollSpeed: data.scrollSpeed,
        fontSize: data.fontSize,
        fontColor: data.fontColor,
        logoUrl: data.logoUrl,
        logoText: data.logoText,
        logoFont: data.logoFont,
        messageFont: data.messageFont,
        language: data.language,
        status: data.status ?? ("active" as const),
        branchId: branch.id,
      };
      if (branch.id === sourceBranchId && sourceTickerId) {
        await updateTicker(sourceTickerId, payload, actor);
        return;
      }
      const existing = await listTickers(branch.id);
      if (existing[0]) {
        await updateTicker(existing[0].id, payload, actor);
        return;
      }
      await createTicker(
        {
          ...payload,
          createdBy: data.createdBy ?? actor.userId,
        },
        actor,
      );
    }),
  );
  return targets.length;
}

export async function syncImageUrlToBranches(
  branches: Branch[],
  sourceBranchId: string,
  /** true = all active; false = source only; string[] = these ids (+ source). */
  applyToAll: boolean | string[],
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
