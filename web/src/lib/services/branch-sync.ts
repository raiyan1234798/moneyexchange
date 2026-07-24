import type { Branch } from "@/lib/types";
import { resolveBranchTargets, canApplyToAllBranches } from "@/lib/branch-isolation";
import { addExternalVideo } from "@/lib/services/video-service";
import { createTicker, listTickers, updateTicker } from "@/lib/services/ticker-service";
import { addImageAdvertUrl } from "@/lib/services/image-advert-service";
import { createDocument, writeAuditLog } from "@/lib/firebase/firestore";
import { COLLECTIONS } from "@/lib/constants";
import type { VideoAsset } from "@/lib/types";
import type { TickerMessage } from "@/lib/types";

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
    "title" | "description" | "downloadUrl" | "storagePath" | "mimeType" | "fileSizeBytes" | "sourceType"
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

/**
 * Publish scrolling message content to one branch or every active branch.
 * Updates the latest active ticker on each target; creates one when missing.
 */
export async function upsertTickerContentToBranches(
  branches: Branch[],
  sourceBranchId: string,
  applyToAll: boolean,
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
