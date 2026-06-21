import {
  createDocument,
  listDocuments,
  removeDocument,
  subscribeCollection,
  updateDocument,
  where,
  orderBy,
  writeAuditLog,
} from "@/lib/firebase/firestore";
import { COLLECTIONS } from "@/lib/constants";
import type { VideoPlaylist } from "@/lib/types";

export async function listPlaylists(branchId: string): Promise<VideoPlaylist[]> {
  return listDocuments<VideoPlaylist>(COLLECTIONS.videoPlaylists, [
    where("branchId", "==", branchId),
    orderBy("name", "asc"),
  ]);
}

export function subscribePlaylists(
  branchId: string,
  onData: (playlists: VideoPlaylist[]) => void,
) {
  return subscribeCollection<VideoPlaylist>(
    COLLECTIONS.videoPlaylists,
    [where("branchId", "==", branchId), where("status", "==", "active"), orderBy("name", "asc")],
    onData,
  );
}

export async function createPlaylist(
  data: Omit<VideoPlaylist, "id" | "createdAt" | "updatedAt">,
  actor: { userId: string; userName: string },
): Promise<string> {
  const id = await createDocument(COLLECTIONS.videoPlaylists, data);
  await writeAuditLog({
    action: "create",
    entityType: "playlist",
    entityId: id,
    userId: actor.userId,
    userName: actor.userName,
    branchId: data.branchId ?? null,
  });
  return id;
}

export async function updatePlaylist(
  id: string,
  data: Partial<VideoPlaylist>,
  actor: { userId: string; userName: string },
): Promise<void> {
  await updateDocument(COLLECTIONS.videoPlaylists, id, data);
  await writeAuditLog({
    action: "update",
    entityType: "playlist",
    entityId: id,
    userId: actor.userId,
    userName: actor.userName,
    branchId: data.branchId ?? null,
  });
}

export async function deletePlaylist(
  id: string,
  actor: { userId: string; userName: string },
  branchId?: string | null,
): Promise<void> {
  await removeDocument(COLLECTIONS.videoPlaylists, id);
  await writeAuditLog({
    action: "delete",
    entityType: "playlist",
    entityId: id,
    userId: actor.userId,
    userName: actor.userName,
    branchId: branchId ?? null,
  });
}
