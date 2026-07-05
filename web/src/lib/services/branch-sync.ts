import type { Branch } from "@/lib/types";
import { resolveBranchTargets, canApplyToAllBranches } from "@/lib/branch-isolation";
import { addExternalVideo } from "@/lib/services/video-service";
import { createTicker } from "@/lib/services/ticker-service";
import { addImageAdvertUrl } from "@/lib/services/image-advert-service";
import { createDocument, updateDocument, where, listDocuments, writeAuditLog } from "@/lib/firebase/firestore";
import { COLLECTIONS } from "@/lib/constants";
import type { VideoAsset } from "@/lib/types";

type Actor = { userId: string; userName: string };

export function getActiveBranchTargets(
  branches: Branch[],
  sourceBranchId: string,
  applyToAll: boolean,
): Branch[] {
  return resolveBranchTargets(branches, sourceBranchId, applyToAll);
}

export { canApplyToAllBranches };

async function deactivatePreviousBranchVideos(branchId: string): Promise<void> {
  const activeVideos = await listDocuments<VideoAsset>(COLLECTIONS.videos, [
    where("branchId", "==", branchId),
    where("status", "==", "active"),
  ]);
  await Promise.all(
    activeVideos.map((video) => updateDocument(COLLECTIONS.videos, video.id, { status: "inactive" })),
  );
}

export async function duplicateStorageVideoToBranch(
  source: Pick<
    VideoAsset,
    "title" | "description" | "downloadUrl" | "storagePath" | "mimeType" | "fileSizeBytes" | "sourceType"
  >,
  branchId: string,
  createdBy: string,
  actor: Actor,
): Promise<string> {
  await deactivatePreviousBranchVideos(branchId);
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
