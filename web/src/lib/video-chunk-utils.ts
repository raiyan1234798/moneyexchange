import { collection, doc, getDoc, getDocs, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { COLLECTIONS, VIDEO_CHUNK_BINARY_BYTES } from "@/lib/constants";
import type { VideoAsset } from "@/lib/types";

export function isChunkedVideo(video: VideoAsset): boolean {
  return video.sourceType === "chunked";
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file chunk"));
    reader.readAsDataURL(blob);
  });
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function uploadVideoChunks(
  file: File,
  videoId: string,
  branchId: string,
  mimeType: string,
  onProgress?: (progress: number) => void,
): Promise<number> {
  const chunkCount = Math.ceil(file.size / VIDEO_CHUNK_BINARY_BYTES);

  await setDoc(doc(db, COLLECTIONS.videoChunks, videoId), {
    branchId,
    mimeType,
    chunkCount,
    fileSizeBytes: file.size,
    createdAt: new Date(),
  });

  for (let index = 0; index < chunkCount; index += 1) {
    const start = index * VIDEO_CHUNK_BINARY_BYTES;
    const end = Math.min(start + VIDEO_CHUNK_BINARY_BYTES, file.size);
    const data = await blobToBase64(file.slice(start, end));
    await setDoc(doc(db, COLLECTIONS.videoChunks, videoId, "parts", String(index)), {
      index,
      data,
    });
    onProgress?.(((index + 1) / chunkCount) * 100);
  }

  return chunkCount;
}

export async function loadChunkedVideoBlobUrl(video: VideoAsset): Promise<string> {
  const metaSnap = await getDoc(doc(db, COLLECTIONS.videoChunks, video.id));
  if (!metaSnap.exists()) {
    throw new Error("Chunked video metadata not found");
  }

  const chunkCount = video.chunkCount ?? (metaSnap.data().chunkCount as number);
  const mimeType = video.mimeType || (metaSnap.data().mimeType as string) || "video/mp4";

  const partsSnap = await getDocs(collection(db, COLLECTIONS.videoChunks, video.id, "parts"));
  const parts = partsSnap.docs
    .map((part) => ({
      index: part.data().index as number,
      data: part.data().data as string,
    }))
    .sort((a, b) => a.index - b.index);

  if (parts.length !== chunkCount) {
    throw new Error(`Video chunks incomplete (${parts.length}/${chunkCount})`);
  }

  const totalBytes = parts.reduce((sum, part) => sum + base64ToUint8Array(part.data).length, 0);
  const merged = new Uint8Array(totalBytes);
  let offset = 0;
  for (const part of parts) {
    const bytes = base64ToUint8Array(part.data);
    merged.set(bytes, offset);
    offset += bytes.length;
  }

  const blob = new Blob([merged], { type: mimeType });
  return URL.createObjectURL(blob);
}
