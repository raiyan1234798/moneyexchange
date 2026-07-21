import { doc, serverTimestamp, writeBatch } from "firebase/firestore";

import { COLLECTIONS } from "@/lib/constants";
import { db } from "@/lib/firebase/client";
import { updateDocument, writeAuditLog } from "@/lib/firebase/firestore";
import type { ImageAdvert, VideoAsset } from "@/lib/types";

/**
 * ONE combined play order for the TV: videos and images mixed in whatever
 * sequence the admin drags (video → image → video → …), each item optionally
 * repeated several times in a row.
 */
export type BranchMediaItem =
  | { kind: "video"; video: VideoAsset }
  | { kind: "image"; image: ImageAdvert };

export function mediaItemId(item: BranchMediaItem): string {
  return item.kind === "video" ? item.video.id : item.image.id;
}

export function mediaItemTitle(item: BranchMediaItem): string {
  return item.kind === "video" ? item.video.title : item.image.title;
}

export function mediaItemRepeat(item: BranchMediaItem): number {
  const raw = item.kind === "video" ? item.video.playRepeat : item.image.playRepeat;
  return Math.max(1, Math.min(10, raw ?? 1));
}

/**
 * Merge the (already individually sorted) video and image lists into the TV
 * sequence. Items the admin has arranged (playOrder set) come first in that
 * order; everything else keeps the legacy order: videos, then images.
 */
export function sortBranchMedia(videos: VideoAsset[], images: ImageAdvert[]): BranchMediaItem[] {
  const entries = [
    ...videos.map((video, i) => ({
      item: { kind: "video" as const, video },
      playOrder: video.playOrder,
      fallbackKey: i,
    })),
    ...images.map((image, i) => ({
      item: { kind: "image" as const, image },
      playOrder: image.playOrder,
      fallbackKey: videos.length + i,
    })),
  ];
  return entries
    .sort((a, b) => {
      const ao = typeof a.playOrder === "number" ? a.playOrder : Number.MAX_SAFE_INTEGER;
      const bo = typeof b.playOrder === "number" ? b.playOrder : Number.MAX_SAFE_INTEGER;
      if (ao !== bo) return ao - bo;
      return a.fallbackKey - b.fallbackKey;
    })
    .map((entry) => entry.item);
}

/** The sequence the TV actually steps through — repeats expanded in place. */
export function expandMediaSequence(items: BranchMediaItem[]): BranchMediaItem[] {
  return items.flatMap((item) => Array.from({ length: mediaItemRepeat(item) }, () => item));
}

function collectionFor(kind: BranchMediaItem["kind"]): string {
  return kind === "video" ? COLLECTIONS.videos : COLLECTIONS.imageAdverts;
}

/** Persist a new combined order (position index written to BOTH collections).
    ONE atomic batch — a half-applied order (network drop mid-save) would leave
    the TV playing a scrambled sequence. */
export async function reorderBranchMedia(
  ordered: Array<{ kind: BranchMediaItem["kind"]; id: string }>,
  actor: { userId: string; userName: string },
): Promise<void> {
  const batch = writeBatch(db);
  ordered.forEach((entry, index) => {
    batch.update(doc(db, collectionFor(entry.kind), entry.id), {
      playOrder: index,
      updatedAt: serverTimestamp(),
    });
  });
  await batch.commit();
  // Audit is best-effort — a logging hiccup must not report the reorder failed.
  await writeAuditLog({
    action: "update",
    entityType: "video",
    entityId: "tv-play-order",
    userId: actor.userId,
    userName: actor.userName,
    metadata: { order: ordered.map((e) => `${e.kind}:${e.id}`) },
  }).catch(() => undefined);
}

/** How many times in a row an item plays each loop (1–10). */
export async function setMediaPlayRepeat(
  kind: BranchMediaItem["kind"],
  id: string,
  repeat: number,
  actor: { userId: string; userName: string },
): Promise<void> {
  const clamped = Math.max(1, Math.min(10, Math.round(repeat) || 1));
  await updateDocument(collectionFor(kind), id, { playRepeat: clamped });
  await writeAuditLog({
    action: "update",
    entityType: kind === "video" ? "video" : "image_advert",
    entityId: id,
    userId: actor.userId,
    userName: actor.userName,
    metadata: { playRepeat: clamped },
  }).catch(() => undefined);
}

/** Rename a video or image advert (shown in lists and used on the TV overlay). */
export async function renameMediaItem(
  kind: BranchMediaItem["kind"],
  id: string,
  title: string,
  actor: { userId: string; userName: string },
): Promise<void> {
  const trimmed = title.trim();
  if (!trimmed) throw new Error("Title cannot be empty");
  await updateDocument(collectionFor(kind), id, { title: trimmed });
  await writeAuditLog({
    action: "update",
    entityType: kind === "video" ? "video" : "image_advert",
    entityId: id,
    userId: actor.userId,
    userName: actor.userName,
    metadata: { title: trimmed },
  }).catch(() => undefined);
}
