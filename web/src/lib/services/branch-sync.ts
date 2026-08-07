import type { Branch, ImageAdvert, VideoAsset } from "@/lib/types";
import { resolveBranchTargets, canApplyToAllBranches } from "@/lib/branch-isolation";
import {
  addExternalVideo,
  restoreInactiveVideosOnBranch,
} from "@/lib/services/video-service";
import { createTicker, listTickers, updateTicker } from "@/lib/services/ticker-service";
import {
  addImageAdvertUrl,
  restoreInactiveImagesOnBranch,
} from "@/lib/services/image-advert-service";
import { createDocument, writeAuditLog, updateDocument } from "@/lib/firebase/firestore";
import { COLLECTIONS } from "@/lib/constants";
import type { TickerMessage } from "@/lib/types";
import { listVideos } from "@/lib/services/video-service";
import { listImageAdverts } from "@/lib/services/image-advert-service";
import { collection, doc, serverTimestamp, setDoc, writeBatch } from "@/lib/d1/firestore-compat";
import { db } from "@/lib/firebase/client";
import {
  mediaIdentityKeys,
  mediaKeysOverlap,
  rememberMediaKeys,
  uniqueByMediaKey,
} from "@/lib/media-identity";
import { isMediaUrlReachable } from "@/lib/media-url-health";

export { mediaIdentityKeys } from "@/lib/media-identity";

type Actor = { userId: string; userName: string };

/** Run async work over items with a fixed concurrency (much faster than serial awaits). */
async function mapPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;
  let next = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const i = next;
      next += 1;
      await worker(items[i]);
    }
  });
  await Promise.all(runners);
}

const BATCH_LIMIT = 400;
/** Parallel create batches — Firestore commits are the bottleneck on big playlists. */
const CREATE_BATCH_SIZE = 400;
const CREATE_BATCH_CONCURRENCY = 3;

async function batchSetInactive(collectionName: string, ids: string[]): Promise<void> {
  for (let i = 0; i < ids.length; i += BATCH_LIMIT) {
    const slice = ids.slice(i, i + BATCH_LIMIT);
    const batch = writeBatch(db);
    for (const id of slice) {
      batch.update(doc(db, collectionName, id), {
        status: "inactive",
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  }
}

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

/**
 * Same as getActiveBranchTargets, but merges remittance hide lists from
 * branch_display_prefs into each branch's settings (TV/dashboard visibility).
 */
export function getActiveBranchTargetsWithDisplayPrefs(
  branches: Branch[],
  sourceBranchId: string,
  applyToAll: boolean | string[],
  prefsByBranchId: Record<string, string[] | undefined>,
): Branch[] {
  return getActiveBranchTargets(branches, sourceBranchId, applyToAll).map((b) => {
    const prefCodes = prefsByBranchId[b.id];
    if (prefCodes === undefined) return b;
    return {
      ...b,
      settings: {
        ...(b.settings ?? {}),
        hiddenTransferCodes: prefCodes,
      },
    };
  });
}

export { canApplyToAllBranches };

/**
 * Soft-deactivate duplicate active videos/images on one branch (same URL or
 * storage path). Keeps the earliest displayOrder entry of each identity.
 */
export async function dedupeActiveMediaOnBranch(branchId: string): Promise<{
  videosRemoved: number;
  imagesRemoved: number;
}> {
  const [videos, images] = await Promise.all([
    listVideos(branchId),
    listImageAdverts(branchId),
  ]);
  const byOrder = <T extends { displayOrder?: number | null }>(a: T, b: T) =>
    (a.displayOrder ?? 9999) - (b.displayOrder ?? 9999);

  const videoDupIds: string[] = [];
  const seenVideos = new Set<string>();
  for (const video of videos.filter((v) => v.status === "active").sort(byOrder)) {
    const keys = mediaIdentityKeys(video.downloadUrl, video.storagePath);
    if (keys.length === 0) continue;
    if (keys.some((k) => seenVideos.has(k))) videoDupIds.push(video.id);
    else for (const k of keys) seenVideos.add(k);
  }

  const imageDupIds: string[] = [];
  const seenImages = new Set<string>();
  for (const image of images.filter((img) => img.status === "active").sort(byOrder)) {
    const keys = mediaIdentityKeys(image.downloadUrl, image.storagePath);
    if (keys.length === 0) continue;
    if (keys.some((k) => seenImages.has(k))) imageDupIds.push(image.id);
    else for (const k of keys) seenImages.add(k);
  }

  await Promise.all([
    batchSetInactive(COLLECTIONS.videos, videoDupIds),
    batchSetInactive(COLLECTIONS.imageAdverts, imageDupIds),
  ]);
  return { videosRemoved: videoDupIds.length, imagesRemoved: imageDupIds.length };
}

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
  // Never create a second active row for the same file on this branch.
  const existing = await listVideos(branchId);
  const sourceKeys = new Set(mediaIdentityKeys(source.downloadUrl, source.storagePath));
  if (sourceKeys.size > 0) {
    const hit = existing.find(
      (video) =>
        video.status === "active" &&
        mediaIdentityKeys(video.downloadUrl, video.storagePath).some((k) => sourceKeys.has(k)),
    );
    if (hit) return hit.id;
  }

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
  const existing = await listImageAdverts(branchId);
  const sourceKeys = new Set(mediaIdentityKeys(source.downloadUrl, source.storagePath));
  if (sourceKeys.size > 0) {
    const hit = existing.find(
      (image) =>
        image.status === "active" &&
        mediaIdentityKeys(image.downloadUrl, image.storagePath).some((k) => sourceKeys.has(k)),
    );
    if (hit) return hit.id;
  }

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
 * Push THIS branch's active videos and/or image adverts to every other active branch.
 *
 * Add-only: checks each target for the same file (URL / storage path) and skips
 * when already present. Never deactivates unique media on other branches —
 * extras that only exist on a target stay there and are never copied elsewhere.
 * Only true duplicate rows (same file twice on one branch) are collapsed.
 */
export async function pushBranchMediaToAllBranches(
  branches: Branch[],
  sourceBranchId: string,
  videos: VideoAsset[],
  images: ImageAdvert[],
  actor: Actor,
  opts?: {
    /** @deprecated Ignored — apply-to-all never wipes other branches' unique media. */
    replaceExisting?: boolean;
    /** Which media to copy. Default: both. */
    media?: "all" | "videos" | "images";
  },
): Promise<{
  targetCount: number;
  videosCopied: number;
  imagesCopied: number;
  videosSkipped: number;
  imagesSkippedNoUrl: number;
  failures: number;
}> {
  const media = opts?.media ?? "all";
  const includeVideos = media === "all" || media === "videos";
  const includeImages = media === "all" || media === "images";

  const targets = getActiveBranchTargets(branches, sourceBranchId, true).filter(
    (b) => b.id !== sourceBranchId,
  );
  if (targets.length === 0) {
    return {
      targetCount: 0,
      videosCopied: 0,
      imagesCopied: 0,
      videosSkipped: 0,
      imagesSkippedNoUrl: 0,
      failures: 0,
    };
  }

  const byOrder = <T extends { displayOrder?: number | null }>(a: T, b: T) =>
    (a.displayOrder ?? 9999) - (b.displayOrder ?? 9999);

  // Collapse duplicate rows on the source only (same file listed twice) — never
  // removes a unique video/image. Targets are not bulk-deduped here (that was
  // the slow path); presence checks below skip files already on each branch.
  await dedupeActiveMediaOnBranch(sourceBranchId);

  const copyableVideos = includeVideos
    ? uniqueByMediaKey(
        videos
          .filter(
            (v) =>
              v.status === "active" &&
              v.sourceType !== "chunked" &&
              Boolean(v.downloadUrl?.trim()),
          )
          .sort(byOrder),
      )
    : [];
  const skipped = includeVideos
    ? videos.filter((v) => v.status === "active" && v.sourceType === "chunked").length
    : 0;
  const imagesNoUrl = includeImages
    ? images.filter((img) => img.status === "active" && !img.downloadUrl?.trim()).length
    : 0;
  const copyableImages = includeImages
    ? uniqueByMediaKey(
        images
          .filter((img) => img.status === "active" && Boolean(img.downloadUrl?.trim()))
          .sort(byOrder),
      )
    : [];

  // Build create jobs only for files missing on each target. Never wipe what
  // the target already plays (including assets this source branch does not have).
  type Job =
    | { kind: "video"; branchId: string; payload: Record<string, unknown> }
    | { kind: "image"; branchId: string; payload: Record<string, unknown> };

  const jobs: Job[] = [];

  // One list pass per target (parallel) — no extra dedupe round-trips.
  const existingByBranch = await Promise.all(
    targets.map(async (branch) => {
      const [existingVideos, existingImages] = await Promise.all([
        includeVideos ? listVideos(branch.id) : Promise.resolve([] as VideoAsset[]),
        includeImages ? listImageAdverts(branch.id) : Promise.resolve([] as ImageAdvert[]),
      ]);
      const videoKeys = new Set<string>();
      const imageKeys = new Set<string>();
      for (const v of existingVideos.filter((item) => item.status === "active")) {
        rememberMediaKeys(v.downloadUrl, v.storagePath, videoKeys);
      }
      for (const img of existingImages.filter((item) => item.status === "active")) {
        rememberMediaKeys(img.downloadUrl, img.storagePath, imageKeys);
      }
      return { branchId: branch.id, videoKeys, imageKeys };
    }),
  );

  const existingMap = new Map(existingByBranch.map((e) => [e.branchId, e] as const));

  for (const branch of targets) {
    const known = existingMap.get(branch.id);
    let order = 0;
    for (const video of copyableVideos) {
      // Already on this branch → do not add again.
      if (known && mediaKeysOverlap(video.downloadUrl, video.storagePath, known.videoKeys)) {
        continue;
      }
      jobs.push({
        kind: "video",
        branchId: branch.id,
        payload: {
          title: video.title,
          description: video.description ?? "",
          branchId: branch.id,
          sourceType: video.sourceType,
          storagePath: video.storagePath ?? null,
          downloadUrl: video.downloadUrl,
          mimeType: video.mimeType ?? null,
          fileSizeBytes: video.fileSizeBytes ?? null,
          playOrder: video.playOrder ?? null,
          playRepeat: video.playRepeat ?? null,
          displayOrder: video.displayOrder ?? order,
          status: "active",
          createdBy: actor.userId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
      });
      order += 1;
      if (known) rememberMediaKeys(video.downloadUrl, video.storagePath, known.videoKeys);
    }
    for (const image of copyableImages) {
      if (known && mediaKeysOverlap(image.downloadUrl, image.storagePath, known.imageKeys)) {
        continue;
      }
      jobs.push({
        kind: "image",
        branchId: branch.id,
        payload: {
          title: image.title,
          branchId: branch.id,
          downloadUrl: image.downloadUrl,
          storagePath: image.storagePath ?? null,
          fileSizeBytes: image.fileSizeBytes ?? null,
          displayDurationSeconds: image.displayDurationSeconds ?? 15,
          playOrder: image.playOrder ?? null,
          playRepeat: image.playRepeat ?? null,
          displayOrder: image.displayOrder ?? order,
          status: "active",
          createdBy: actor.userId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
      });
      order += 1;
      if (known) rememberMediaKeys(image.downloadUrl, image.storagePath, known.imageKeys);
    }
  }

  // Batched writes (up to 400 docs per commit) — far faster than one setDoc each.
  let videosCopied = 0;
  let imagesCopied = 0;
  let failures = 0;

  const batches: Job[][] = [];
  for (let i = 0; i < jobs.length; i += CREATE_BATCH_SIZE) {
    batches.push(jobs.slice(i, i + CREATE_BATCH_SIZE));
  }

  await mapPool(batches, CREATE_BATCH_CONCURRENCY, async (slice) => {
    try {
      const batch = writeBatch(db);
      for (const job of slice) {
        const col =
          job.kind === "video" ? COLLECTIONS.videos : COLLECTIONS.imageAdverts;
        batch.set(doc(collection(db, col)), job.payload);
      }
      await batch.commit();
      for (const job of slice) {
        if (job.kind === "video") videosCopied += 1;
        else imagesCopied += 1;
      }
    } catch {
      // Fall back to per-doc writes so one bad payload doesn't sink the batch.
      for (const job of slice) {
        try {
          const col =
            job.kind === "video" ? COLLECTIONS.videos : COLLECTIONS.imageAdverts;
          await setDoc(doc(collection(db, col)), job.payload);
          if (job.kind === "video") videosCopied += 1;
          else imagesCopied += 1;
        } catch {
          failures += 1;
        }
      }
    }
  });

  // Single summary audit (not one log per copied file).
  void writeAuditLog({
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
      replaceExisting: false,
      mode: "add_missing_only",
      media: media,
      videosSkippedChunked: skipped,
      imagesSkippedNoUrl: imagesNoUrl,
      videosCopied,
      imagesCopied,
      failures,
    },
  }).catch(() => undefined);

  return {
    targetCount: targets.length,
    videosCopied,
    imagesCopied,
    videosSkipped: skipped,
    imagesSkippedNoUrl: imagesNoUrl,
    failures,
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

/**
 * Soft-deactivate active videos/images whose file is gone from R2 / the public
 * URL (404). Keeps playlists and Open/Preview from pointing at dead links.
 * data: and reachable http(s) rows are untouched.
 */
export async function purgeUnreachableMediaOnAllBranches(
  branches: Branch[],
  actor: Actor,
): Promise<{
  branchCount: number;
  videosRemoved: number;
  imagesRemoved: number;
  urlsChecked: number;
}> {
  const activeBranches = branches.filter((b) => b.status === "active");
  type Ref = {
    kind: "video" | "image";
    id: string;
    branchId: string;
    downloadUrl: string;
    storagePath?: string | null;
  };
  const refs: Ref[] = [];
  for (const branch of activeBranches) {
    const [vids, imgs] = await Promise.all([
      listVideos(branch.id),
      listImageAdverts(branch.id),
    ]);
    for (const v of vids) {
      if (v.status !== "active") continue;
      const url = v.downloadUrl?.trim() || "";
      if (!url || url.startsWith("data:") || url.startsWith("chunked://")) continue;
      refs.push({
        kind: "video",
        id: v.id,
        branchId: branch.id,
        downloadUrl: url,
        storagePath: v.storagePath,
      });
    }
    for (const img of imgs) {
      if (img.status !== "active") continue;
      const url = img.downloadUrl?.trim() || "";
      if (!url || url.startsWith("data:")) continue;
      refs.push({
        kind: "image",
        id: img.id,
        branchId: branch.id,
        downloadUrl: url,
        storagePath: img.storagePath,
      });
    }
  }

  // One reachability check per unique URL (+ storage path).
  const reachCache = new Map<string, boolean>();
  async function reachable(ref: Ref): Promise<boolean> {
    const cacheKey = `${ref.storagePath || ""}|${ref.downloadUrl}`;
    const hit = reachCache.get(cacheKey);
    if (hit !== undefined) return hit;
    const ok = await isMediaUrlReachable({
      downloadUrl: ref.downloadUrl,
      storagePath: ref.storagePath,
    });
    reachCache.set(cacheKey, ok);
    return ok;
  }

  let videosRemoved = 0;
  let imagesRemoved = 0;
  const dead: Ref[] = [];
  await mapPool(refs, 6, async (ref) => {
    if (!(await reachable(ref))) dead.push(ref);
  });
  for (const ref of dead) {
    const col = ref.kind === "video" ? COLLECTIONS.videos : COLLECTIONS.imageAdverts;
    await updateDocument(col, ref.id, { status: "inactive" });
    if (ref.kind === "video") videosRemoved += 1;
    else imagesRemoved += 1;
  }

  if (videosRemoved + imagesRemoved > 0) {
    await writeAuditLog({
      action: "media_purge_unreachable",
      entityType: "branch",
      entityId: "all",
      userId: actor.userId,
      userName: actor.userName,
      metadata: {
        branchCount: activeBranches.length,
        videosRemoved,
        imagesRemoved,
        urlsChecked: reachCache.size,
      },
    });
  }

  return {
    branchCount: activeBranches.length,
    videosRemoved,
    imagesRemoved,
    urlsChecked: reachCache.size,
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
  const sourceKeys = new Set(mediaIdentityKeys(data.downloadUrl, null));
  await Promise.all(
    targets.map(async (branch) => {
      if (sourceKeys.size > 0) {
        const existing = await listVideos(branch.id);
        const hit = existing.some(
          (video) =>
            video.status === "active" &&
            mediaIdentityKeys(video.downloadUrl, video.storagePath).some((k) => sourceKeys.has(k)),
        );
        if (hit) return;
      }
      await addExternalVideo({ ...data, branchId: branch.id }, actor);
    }),
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
  const sourceKeys = new Set(mediaIdentityKeys(data.downloadUrl, null));
  await Promise.all(
    targets.map(async (branch) => {
      if (sourceKeys.size > 0) {
        const existing = await listImageAdverts(branch.id);
        const hit = existing.some(
          (image) =>
            image.status === "active" &&
            mediaIdentityKeys(image.downloadUrl, image.storagePath).some((k) => sourceKeys.has(k)),
        );
        if (hit) return;
      }
      await addImageAdvertUrl({ ...data, branchId: branch.id }, actor);
    }),
  );
  return targets.length;
}
