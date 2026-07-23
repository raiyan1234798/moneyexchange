"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Cloud, Link2, Pencil, Upload, Video, Trash2, ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { DashboardHeader } from "@/components/layout/dashboard-sidebar";
import { ApplyToAllCheckbox } from "@/components/shared/apply-to-all-checkbox";
import { BranchSelector } from "@/components/shared/branch-selector";
import {
  ContentPanel,
  DataTable,
  EmptyState,
  FirestoreSetupNotice,
  PageShell,
  StatusBadge,
} from "@/components/shared/page-elements";
import { SortableDataTable } from "@/components/shared/sortable-data-table";
import { useAuth } from "@/contexts/auth-context";
import { useBranchScope, useContentPermissions } from "@/lib/hooks/use-branch-scope";
import { UploadAccessPanel, UploadPasswordDialog, useUploadAccess } from "@/components/dashboard/upload-access";
import { useFirestoreNotice } from "@/lib/hooks/use-firestore-notice";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  MAX_VIDEO_UPLOAD_BYTES,
  MAX_CHUNKED_VIDEO_BYTES,
  MAX_TOTAL_STORAGE_BYTES,
  STORAGE_WARN_BYTES,
  RECOMMENDED_VIDEO_FORMATS,
  WARN_LARGE_VIDEO_BYTES,
} from "@/lib/constants";
import { PreviewDisplayLink } from "@/components/shared/preview-display-link";
import { Badge } from "@/components/ui/badge";
import {
  approveVideo,
  CHUNKED_UPLOAD_WARNING,
  deleteVideo,
  isR2UploadConfigured,
  proposeExternalVideo,
  rejectVideo,
  reorderVideos,
  subscribePendingVideos,
  subscribeVideos,
  uploadVideo,
} from "@/lib/services/video-service";
import {
  duplicateStorageVideoToBranch,
  getActiveBranchTargets,
  syncExternalVideoToBranches,
  syncImageUrlToBranches,
} from "@/lib/services/branch-sync";
import { auth } from "@/lib/firebase/client";
import { getDocument, listDocuments, sumField } from "@/lib/firebase/firestore";
import { COLLECTIONS } from "@/lib/constants";
import {
  deleteImageAdvert,
  reorderImageAdverts,
  subscribeImageAdverts,
  updateImageAdvertDuration,
  uploadImageAdvert,
} from "@/lib/services/image-advert-service";
import {
  mediaItemId,
  mediaItemTitle,
  renameMediaItem,
  reorderBranchMedia,
  setMediaPlayRepeat,
  sortBranchMedia,
  type BranchMediaItem,
} from "@/lib/services/media-order-service";
import {
  deriveTitleFromFile,
  deriveTitleFromUrl,
  isGoogleDriveUrl,
  resolveVideoTitle,
  validateVideoFile,
} from "@/lib/video-utils";
import type { ImageAdvert, VideoAsset } from "@/lib/types";

export default function VideosPage() {
  const { user, profile, hasModule } = useAuth();
  const { branches, effectiveBranchId, setSelectedBranchId, isSuperAdmin, isAdmin } = useBranchScope();
  const { canManageVideos, canManageImages, canProposeVideos } = useContentPermissions();
  const uploadAccess = useUploadAccess();
  const [videos, setVideos] = useState<VideoAsset[]>([]);
  const [pendingVideos, setPendingVideos] = useState<VideoAsset[]>([]);
  const [images, setImages] = useState<ImageAdvert[]>([]);
  const [proposeUrl, setProposeUrl] = useState("");
  const [proposing, setProposing] = useState(false);
  const [title, setTitle] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [driveUrl, setDriveUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [videoFiles, setVideoFiles] = useState<File[]>([]);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  // Editable titles for the files picked above (index-aligned) — set BEFORE upload.
  const [videoFileTitles, setVideoFileTitles] = useState<string[]>([]);
  const [imageFileTitles, setImageFileTitles] = useState<string[]>([]);
  // Inline rename of an EXISTING video/image row.
  const [editingMedia, setEditingMedia] = useState<{ kind: "video" | "image"; id: string; value: string } | null>(null);
  // "Remove all" (videos or images) in progress — disables both buttons.
  const [removingAll, setRemovingAll] = useState<"videos" | "images" | null>(null);
  // TRUE bucket usage from Cloudflare (worker /api/storage-usage) — what R2
  // actually bills, including files the database lost track of.
  const [realStorage, setRealStorage] = useState<{ bytes: number; objects: number } | null>(null);
  const [cleaningStorage, setCleaningStorage] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageDuration, setImageDuration] = useState(15);
  // Bulk "seconds on screen" — applies one value to EVERY image at once.
  const [bulkSeconds, setBulkSeconds] = useState("15");
  const [bulkApplying, setBulkApplying] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [applyToAll, setApplyToAll] = useState(false);
  // TOTAL storage across ALL branches (R2's 10 GB free tier is shared), summed
  // server-side so we never download every doc. Null until the first load.
  const [totalStorageBytes, setTotalStorageBytes] = useState<number | null>(null);

  const branch = branches.find((b) => b.id === effectiveBranchId);
  const canApplyToAll = (isSuperAdmin || isAdmin) && branches.filter((b) => b.status === "active").length > 1;
  const actor = user && profile ? { userId: user.uid, userName: profile.displayName || profile.email } : null;
  const { notice, onError, clearNotice } = useFirestoreNotice("videos and images");

  // Rough storage used for this branch (videos + image adverts). Cloudflare R2's
  // free tier is 10 GB total, so warn before an upload would push over the cap.
  const usedBytes = useMemo(() => {
    const videoBytes = videos.reduce((sum, v) => sum + (v.fileSizeBytes ?? 0), 0);
    const imageBytes = images.reduce(
      (sum, img) =>
        sum +
        (img.fileSizeBytes ??
          (img.downloadUrl?.startsWith("data:") ? Math.ceil(img.downloadUrl.length * 0.75) : 0)),
      0,
    );
    return videoBytes + imageBytes;
  }, [videos, images]);

  const gb = (bytes: number) => (bytes / (1024 * 1024 * 1024)).toFixed(2);

  // Recompute the total (all branches) whenever this branch's content changes —
  // uploads/deletes here are the usual trigger. Cheap server-side SUM.
  const refreshTotalStorage = useCallback(async () => {
    const [videoBytes, imageBytes] = await Promise.all([
      sumField(COLLECTIONS.videos, "fileSizeBytes"),
      sumField(COLLECTIONS.imageAdverts, "fileSizeBytes"),
    ]);
    setTotalStorageBytes(videoBytes + imageBytes);
  }, []);

  useEffect(() => {
    // Defer so we don't setState synchronously inside the effect body (lint).
    const id = window.setTimeout(() => {
      void refreshTotalStorage();
    }, 0);
    return () => window.clearTimeout(id);
  }, [refreshTotalStorage, videos, images]);

  // Prefer the REAL bucket total (live from Cloudflare) over the Firestore sum.
  // Admin-authenticated, and re-fetched only when the tracked byte total moves
  // (each call lists the whole bucket — not something to spam per snapshot).
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        if (!token) return;
        const res = await fetch("/api/storage-usage", {
          cache: "no-store",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = (await res.json()) as { bytes?: number; objects?: number };
        if (alive && typeof data.bytes === "number") {
          setRealStorage({ bytes: data.bytes, objects: data.objects ?? 0 });
        }
      } catch {
        // Endpoint unavailable (e.g. old deploy) — the Firestore sum still shows.
      }
    })();
    return () => {
      alive = false;
    };
  }, [usedBytes]);

  /** Returns false (and toasts) when an upload would exceed the 10 GB budget. */
  function withinStorageBudget(addBytes: number): boolean {
    const projected = usedBytes + addBytes;
    if (projected > MAX_TOTAL_STORAGE_BYTES) {
      toast.error(
        `This upload would exceed the 10 GB storage limit (${gb(projected)} GB). Remove old videos/images, or paste a direct video link instead.`,
        { duration: 10000 },
      );
      return false;
    }
    if (projected > STORAGE_WARN_BYTES) {
      toast.warning(
        `Storage is filling up — about ${gb(projected)} GB of 10 GB used after this upload. Consider removing old content.`,
        { duration: 8000 },
      );
    }
    return true;
  }

  useEffect(() => {
    if (!effectiveBranchId) return;
    const unsubVideos = subscribeVideos(
      effectiveBranchId,
      (items) => {
        setVideos(items);
        clearNotice();
      },
      onError,
    );
    const unsubImages = subscribeImageAdverts(
      effectiveBranchId,
      (items) => {
        setImages(items);
        clearNotice();
      },
      onError,
    );
    const unsubPending = subscribePendingVideos(
      effectiveBranchId,
      (items) => {
        setPendingVideos(items);
        clearNotice();
      },
      onError,
    );
    return () => {
      unsubVideos();
      unsubImages();
      unsubPending();
    };
  }, [clearNotice, effectiveBranchId, onError]);

  async function handlePropose() {
    if (!user || !profile || !effectiveBranchId || !proposeUrl.trim() || !actor) {
      toast.error("Paste a video link to propose");
      return;
    }
    setProposing(true);
    try {
      await proposeExternalVideo(
        {
          title: resolveVideoTitle(title, deriveTitleFromUrl(proposeUrl)),
          branchId: effectiveBranchId,
          downloadUrl: proposeUrl.trim(),
          createdBy: user.uid,
        },
        actor,
      );
      toast.success("Sent to your branch manager for approval");
      setProposeUrl("");
      setTitle("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send for approval");
    } finally {
      setProposing(false);
    }
  }

  async function handleExternalAdd() {
    if (!user || !profile || !effectiveBranchId || !externalUrl.trim() || !actor) {
      toast.error("Video URL is required");
      return;
    }
    const resolvedTitle = resolveVideoTitle(title, deriveTitleFromUrl(externalUrl));
    try {
      const count = await syncExternalVideoToBranches(
        branches,
        effectiveBranchId,
        applyToAll && canApplyToAll,
        {
          title: resolvedTitle,
          downloadUrl: externalUrl.trim(),
          createdBy: user.uid,
        },
        actor,
      );
      toast.success(
        count > 1
          ? `Video linked to ${count} branches`
          : "Video linked — display will play it automatically",
      );
      setTitle("");
      setExternalUrl("");
      setApplyToAll(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to link video");
    }
  }

  async function handleDriveAdd() {
    if (!user || !profile || !effectiveBranchId || !driveUrl.trim() || !actor) {
      toast.error("Google Drive share link is required");
      return;
    }
    if (!isGoogleDriveUrl(driveUrl)) {
      toast.error("Paste a Google Drive share link (drive.google.com/file/d/…)");
      return;
    }
    const resolvedTitle = resolveVideoTitle(title, "Google Drive video");
    try {
      const count = await syncExternalVideoToBranches(
        branches,
        effectiveBranchId,
        applyToAll && canApplyToAll,
        {
          title: resolvedTitle,
          downloadUrl: driveUrl.trim(),
          createdBy: user.uid,
        },
        actor,
      );
      toast.success(
        count > 1
          ? `Google Drive video linked to ${count} branches`
          : "Google Drive link converted and saved",
        { duration: 8000 },
      );
      setTitle("");
      setDriveUrl("");
      setApplyToAll(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to link Google Drive video");
    }
  }

  async function handleUploadMany(files: File[]) {
    if (!user || !profile || !effectiveBranchId || !actor) return;
    for (const f of files) {
      try {
        validateVideoFile(f);
      } catch (error) {
        toast.error(`${f.name}: ${error instanceof Error ? error.message : "invalid video"}`);
        return;
      }
    }
    if (!withinStorageBudget(files.reduce((s, f) => s + f.size, 0))) return;
    setUploading(true);
    setProgress(1);
    let done = 0;
    let chunked = false;
    try {
      // ADD every selected video to the branch playlist — never touch what is
      // already there. (This used to "replace the set" first, which silently
      // wiped every existing video and even purged chunked-video data.)
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const { usedChunkFallback } = await uploadVideo(
          f,
          {
            title: videoFileTitles[i]?.trim() || deriveTitleFromFile(f),
            branchId: effectiveBranchId,
            createdBy: user.uid,
          },
          { userId: user.uid, userName: profile.displayName || profile.email },
          (p) => setProgress(Math.round(((i + p / 100) / files.length) * 100)),
          { keepExisting: true },
        );
        chunked = chunked || usedChunkFallback;
        done += 1;
      }
      toast.success(`${done} videos uploaded — they rotate on the display`);
      if (chunked) toast.warning(CHUNKED_UPLOAD_WARNING, { duration: 9000 });
      setTitle("");
      setFile(null);
      setVideoFiles([]);
      setVideoFileTitles([]);
    } catch (error) {
      toast.error(
        `${done} of ${files.length} uploaded before an error: ${error instanceof Error ? error.message : "failed"}`,
        { duration: 9000 },
      );
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }

  async function handleUpload() {
    if (videoFiles.length > 1) {
      await handleUploadMany(videoFiles);
      return;
    }
    if (!user || !profile || !effectiveBranchId || !file) {
      toast.error("Select a video file to upload");
      return;
    }

    try {
      validateVideoFile(file);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Invalid video file");
      return;
    }
    if (!withinStorageBudget(file.size)) return;

    const resolvedTitle = resolveVideoTitle(title, deriveTitleFromFile(file));
    setUploading(true);
    setProgress(1);
    try {
      const { id: videoId, usedChunkFallback } = await uploadVideo(
        file,
        { title: resolvedTitle, branchId: effectiveBranchId, createdBy: user.uid },
        { userId: user.uid, userName: profile.displayName || profile.email },
        setProgress,
        // ALWAYS keep what is already there — this page is a playlist. Without
        // this the upload silently deactivated every existing branch video.
        { keepExisting: true },
      );

      if (usedChunkFallback) {
        toast.warning(CHUNKED_UPLOAD_WARNING, { duration: 10000 });
      }

      if (applyToAll && canApplyToAll && actor) {
        const uploaded = await getDocument<VideoAsset>(COLLECTIONS.videos, videoId);
        if (uploaded?.sourceType === "chunked") {
          toast.warning("This upload is branch-only. Paste a video link to sync the same video to all branches.");
        } else if (uploaded) {
          const otherBranches = getActiveBranchTargets(branches, effectiveBranchId, true).filter(
            (b) => b.id !== effectiveBranchId,
          );
          await Promise.all(
            otherBranches.map((b) =>
              duplicateStorageVideoToBranch(uploaded, b.id, user.uid, actor),
            ),
          );
          if (otherBranches.length > 0) {
            toast.success(`Video synced to ${otherBranches.length + 1} branches`);
          }
        }
      } else {
        toast.success("Video uploaded — it will appear on the display shortly");
      }

      setTitle("");
      setFile(null);
      setProgress(0);
      setApplyToAll(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed";
      toast.error(message, { duration: 8000 });
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }

  async function handleImageUrlAdd() {
    if (!user || !profile || !effectiveBranchId || !imageUrl.trim() || !actor) {
      toast.error("Image URL is required");
      return;
    }
    setImageUploading(true);
    try {
      const count = await syncImageUrlToBranches(
        branches,
        effectiveBranchId,
        applyToAll && canApplyToAll,
        {
          title: title.trim() || "Image advert",
          downloadUrl: imageUrl.trim(),
          displayDurationSeconds: imageDuration,
          createdBy: user.uid,
        },
        actor,
      );
      toast.success(
        count > 1
          ? `Image advert saved to ${count} branches`
          : "Image advert saved — it takes its turn in the TV play order",
      );
      setImageUrl("");
      setTitle("");
      setApplyToAll(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add image");
    } finally {
      setImageUploading(false);
    }
  }

  async function handleImageUpload() {
    const files = imageFiles.length > 0 ? imageFiles : imageFile ? [imageFile] : [];
    if (!user || !profile || !effectiveBranchId || files.length === 0) {
      toast.error("Select an image file");
      return;
    }
    if (!withinStorageBudget(files.reduce((s, f) => s + f.size, 0))) return;
    setImageUploading(true);
    let done = 0;
    try {
      for (let i = 0; i < files.length; i++) {
        await uploadImageAdvert(
          {
            title: imageFileTitles[i]?.trim() || files[i].name.replace(/\.[^.]+$/, "") || files[i].name,
            branchId: effectiveBranchId,
            file: files[i],
            displayDurationSeconds: imageDuration,
            createdBy: user.uid,
          },
          { userId: user.uid, userName: profile.displayName || profile.email },
          // Adding images must never wipe the existing ones — they all rotate.
          { keepExisting: true },
        );
        done += 1;
      }
      toast.success(
        files.length > 1
          ? `${done} images uploaded — they take their turns in the TV play order`
          : "Image uploaded — it takes its turn in the TV play order",
      );
      setImageFile(null);
      setImageFiles([]);
      setImageFileTitles([]);
      setTitle("");
    } catch (error) {
      toast.error(
        `${done} of ${files.length} uploaded before an error: ${error instanceof Error ? error.message : "failed"}`,
      );
    } finally {
      setImageUploading(false);
    }
  }

  // Reorder/upload actions are wrapped in uploadAccess.guard: it runs them
  // straight away when unlocked, otherwise it pops the password prompt and runs
  // them once the correct password is entered (no "you have no access" wall).
  // Once the admin has arranged the COMBINED play order (playOrder set), a drag
  // in the per-type tables must keep affecting the TV: rebuild the combined
  // order with the videos/images re-sequenced INSIDE their existing slots.
  const unifiedOrderActive = useMemo(
    () =>
      [...videos, ...images].some((m) => typeof (m as { playOrder?: number }).playOrder === "number"),
    [videos, images],
  );

  function withReseqKind(kind: "video" | "image", orderedIds: string[]) {
    const queue = [...orderedIds];
    return sortBranchMedia(videos, images).map((slot) =>
      slot.kind === kind ? { kind, id: queue.shift() ?? mediaItemId(slot) } : { kind: slot.kind, id: mediaItemId(slot) },
    );
  }

  async function reorderVideosList(ordered: VideoAsset[]) {
    const a = actor;
    if (!a) return;
    uploadAccess.guard(async () => {
      try {
        await reorderVideos(ordered.map((x) => x.id), a);
        if (unifiedOrderActive) {
          await reorderBranchMedia(withReseqKind("video", ordered.map((x) => x.id)), a);
        }
        toast.success("Play order updated");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not reorder videos");
      }
    });
  }

  async function reorderImagesList(ordered: ImageAdvert[]) {
    const a = actor;
    if (!a) return;
    uploadAccess.guard(async () => {
      try {
        await reorderImageAdverts(ordered.map((x) => x.id), a);
        if (unifiedOrderActive) {
          await reorderBranchMedia(withReseqKind("image", ordered.map((x) => x.id)), a);
        }
        toast.success("Image order updated");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not reorder images");
      }
    });
  }

  // ONE combined videos+images play order for the TV (drag in the panel below).
  const mediaOrder = useMemo(() => sortBranchMedia(videos, images), [videos, images]);

  function reorderMediaList(ordered: BranchMediaItem[]) {
    const a = actor;
    if (!a) return;
    uploadAccess.guard(async () => {
      try {
        await reorderBranchMedia(
          ordered.map((m) => ({ kind: m.kind, id: mediaItemId(m) })),
          a,
        );
        toast.success("TV play order updated");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not save the play order");
      }
    });
  }

  function moveMediaItem(item: BranchMediaItem, dir: "up" | "down") {
    const ordered = [...mediaOrder];
    const idx = ordered.findIndex((m) => mediaItemId(m) === mediaItemId(item) && m.kind === item.kind);
    const swap = dir === "up" ? idx - 1 : idx + 1;
    if (idx < 0 || swap < 0 || swap >= ordered.length) return;
    [ordered[idx], ordered[swap]] = [ordered[swap], ordered[idx]];
    reorderMediaList(ordered);
  }

  function commitRepeat(item: BranchMediaItem, raw: string, revert: () => void) {
    const a = actor;
    if (!a) return;
    const value = Math.max(1, Math.min(10, Number(raw) || 1));
    uploadAccess.guard(
      async () => {
        try {
          await setMediaPlayRepeat(item.kind, mediaItemId(item), value, a);
          toast.success(value > 1 ? `Plays ${value} times in a row` : "Plays once per loop");
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Could not save");
          revert();
        }
      },
      revert,
    );
  }

  function commitRename() {
    const a = actor;
    const editing = editingMedia;
    if (!a || !editing) return;
    setEditingMedia(null);
    if (!editing.value.trim()) return;
    uploadAccess.guard(async () => {
      try {
        await renameMediaItem(editing.kind, editing.id, editing.value, a);
        toast.success("Renamed");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not rename");
      }
    });
  }

  /** Title cell with a pencil — click to rename in place (videos AND images). */
  function renameableTitle(kind: "video" | "image", id: string, currentTitle: string) {
    if (editingMedia && editingMedia.kind === kind && editingMedia.id === id) {
      return (
        <Input
          autoFocus
          value={editingMedia.value}
          onChange={(e) =>
            setEditingMedia((prev) => (prev ? { ...prev, value: e.target.value } : prev))
          }
          onBlur={() => commitRename()}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename();
            if (e.key === "Escape") setEditingMedia(null);
          }}
          className="h-8 rounded-lg text-sm"
        />
      );
    }
    return (
      <span className="flex items-center gap-1.5">
        <span className="truncate font-medium">{currentTitle}</span>
        <button
          type="button"
          title="Rename"
          aria-label={`Rename ${currentTitle}`}
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
          onClick={() => setEditingMedia({ kind, id, value: currentTitle })}
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </span>
    );
  }

  // Reclaim space: delete every stored file that no current (non-deleted)
  // video/image references — across ALL branches. This is what actually frees
  // the space of removed videos when their file delete had silently failed.
  async function handleStorageCleanup() {
    setCleaningStorage(true);
    try {
      const [allVideos, allImages, allBranchDocs, allTickerDocs] = await Promise.all([
        listDocuments<VideoAsset>(COLLECTIONS.videos, []),
        listDocuments<ImageAdvert>(COLLECTIONS.imageAdverts, []),
        // Branch settings + tickers reference stored files DIRECTLY by URL
        // (promo gallery, logos, announcement media) — those must be kept too.
        listDocuments<Record<string, unknown>>(COLLECTIONS.branches, []),
        listDocuments<Record<string, unknown>>(COLLECTIONS.tickerMessages, []),
      ]);
      const inUse = [
        ...allVideos.filter((v) => v.status !== "inactive"),
        ...allImages.filter((img) => img.status !== "inactive"),
      ];
      // Protect BOTH reference styles: the stored key AND the key inside the
      // public download URL (cross-branch copies sometimes carry only the URL).
      const keep = new Set<string>();
      for (const m of inUse) {
        if (typeof m.storagePath === "string" && m.storagePath) keep.add(m.storagePath);
        const u = m.downloadUrl ?? "";
        const match = u.match(/\/((?:videos|images)\/[^?#]+)/);
        if (match) keep.add(decodeURIComponent(match[1]));
      }
      // EVERY file URL that appears anywhere in branch settings or tickers.
      for (const docObj of [...allBranchDocs, ...allTickerDocs]) {
        const json = JSON.stringify(docObj);
        for (const m of json.matchAll(/\/((?:videos|images)\/[^"?#\\\s]+)/g)) {
          keep.add(decodeURIComponent(m[1]));
        }
      }
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Not signed in");
      const res = await fetch("/api/storage-cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ keep: [...keep] }),
      });
      const data = (await res.json()) as { deleted?: number; freedBytes?: number; error?: string };
      if (!res.ok) throw new Error(data.error || "Cleanup failed");
      toast.success(
        data.deleted
          ? `Removed ${data.deleted} unused file${data.deleted === 1 ? "" : "s"} — freed ${gb(data.freedBytes ?? 0)} GB`
          : "Nothing to clean — every stored file is in use",
        { duration: 8000 },
      );
      setRealStorage(null); // re-measure below
      const usage = await fetch("/api/storage-usage", {
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (usage.ok) {
        const u = (await usage.json()) as { bytes: number; objects: number };
        setRealStorage({ bytes: u.bytes, objects: u.objects });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Cleanup failed");
    } finally {
      setCleaningStorage(false);
    }
  }

  function removeAllMedia(kind: "videos" | "images") {
    const a = actor;
    if (!a) return;
    const items = kind === "videos" ? videos : images;
    if (items.length === 0) return;
    uploadAccess.guard(async () => {
      setRemovingAll(kind);
      let done = 0;
      try {
        if (kind === "videos") {
          for (const v of videos) {
            await deleteVideo(v, a);
            done += 1;
          }
        } else {
          for (const img of images) {
            await deleteImageAdvert(img, a);
            done += 1;
          }
        }
        toast.success(`Removed all ${done} ${kind} from this branch`);
      } catch (e) {
        toast.error(
          `${done} of ${items.length} removed before an error: ${e instanceof Error ? e.message : "failed"}`,
        );
      } finally {
        setRemovingAll(null);
      }
    });
  }

  /** Confirm-then-remove-everything button used by both tables below. */
  function removeAllButton(kind: "videos" | "images", count: number) {
    if (count === 0) return null;
    return (
      <AlertDialog>
        <AlertDialogTrigger
          render={
            <Button
              variant="outline"
              size="sm"
              disabled={removingAll !== null}
              className="rounded-lg text-destructive hover:text-destructive"
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              {removingAll === kind ? "Removing…" : `Remove all ${count}`}
            </Button>
          }
        />
        <AlertDialogContent className="rounded-2xl sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove all {count} {kind} from {branch?.name ?? "this branch"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              They stop playing on the TV immediately and their files are removed from storage.
              This cannot be undone — you would need to upload them again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-destructive text-white hover:bg-destructive/90"
              onClick={() => removeAllMedia(kind)}
            >
              Yes, remove all {kind}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  async function moveVideo(v: VideoAsset, dir: "up" | "down") {
    if (!actor) return;
    const ordered = [...videos];
    const idx = ordered.findIndex((x) => x.id === v.id);
    const swap = dir === "up" ? idx - 1 : idx + 1;
    if (idx < 0 || swap < 0 || swap >= ordered.length) return;
    [ordered[idx], ordered[swap]] = [ordered[swap], ordered[idx]];
    await reorderVideosList(ordered);
  }

  async function moveImage(img: ImageAdvert, dir: "up" | "down") {
    if (!actor) return;
    const ordered = [...images];
    const idx = ordered.findIndex((x) => x.id === img.id);
    const swap = dir === "up" ? idx - 1 : idx + 1;
    if (idx < 0 || swap < 0 || swap >= ordered.length) return;
    [ordered[idx], ordered[swap]] = [ordered[swap], ordered[idx]];
    await reorderImagesList(ordered);
  }

  // Media module: admins by default; other users only when granted the
  // "Media Manager" module in Users.
  if (!isSuperAdmin && !isAdmin && !hasModule("media")) {
    return (
      <>
        <DashboardHeader title="Media Manager" description="Branch display videos and image adverts." accent="rose" />
        <PageShell accent="rose">
          <ContentPanel title="Admins only" description="Display content is managed centrally by the admins.">
            <p className="text-sm text-muted-foreground">
              Your account manages exchange rates. Videos and advert images are controlled by the
              admin team.
            </p>
          </ContentPanel>
        </PageShell>
      </>
    );
  }

  return (
    <>
      <DashboardHeader
        title="Media Manager"
        description="All branch media in one place — videos and image adverts for the shop display."
        accent="rose"
      />
      <PageShell accent="rose">
        <FirestoreSetupNotice message={notice} />
        {isSuperAdmin || isAdmin ? (
          <BranchSelector
            branches={branches}
            value={effectiveBranchId}
            onChange={setSelectedBranchId}
            helperText="Each branch has its own videos and display content."
          />
        ) : branch ? (
          <p className="text-sm text-muted-foreground">
            Managing videos for: <strong>{branch.name}</strong>
          </p>
        ) : null}

        <PreviewDisplayLink branchCode={branch?.code} />

        {totalStorageBytes !== null || realStorage !== null
          ? (() => {
              const used = realStorage?.bytes ?? totalStorageBytes ?? 0;
              const pct = Math.min(100, Math.round((used / MAX_TOTAL_STORAGE_BYTES) * 100));
              const freeGb = gb(Math.max(0, MAX_TOTAL_STORAGE_BYTES - used));
              const almostFull = used >= STORAGE_WARN_BYTES;
              const full = used >= MAX_TOTAL_STORAGE_BYTES;
              return (
                <div
                  className={`rounded-2xl border p-4 ${
                    full
                      ? "border-red-500/40 bg-red-500/5"
                      : almostFull
                        ? "border-amber-500/40 bg-amber-500/5"
                        : "border-border/40 bg-muted/20"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">
                        Storage — {gb(used)} GB of 10 GB used
                        <span className="font-normal text-muted-foreground"> (all branches together)</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {freeGb} GB free · Cloudflare R2 gives 10 GB free, then charges per GB.
                        {realStorage
                          ? ` Counted live from the storage itself (${realStorage.objects} files) — this is the real number Cloudflare sees.`
                          : ""}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 text-sm font-bold ${
                        full
                          ? "text-red-600 dark:text-red-400"
                          : almostFull
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-muted-foreground"
                      }`}
                    >
                      {pct}%
                    </span>
                  </div>
                  <Progress value={pct} className="mt-3" />
                  {canManageVideos ? (
                    <div className="mt-3 flex justify-end">
                      <AlertDialog>
                        <AlertDialogTrigger
                          render={
                            <Button variant="outline" size="sm" className="rounded-lg" disabled={cleaningStorage}>
                              {cleaningStorage ? "Cleaning…" : "Clean up unused files"}
                            </Button>
                          }
                        />
                        <AlertDialogContent className="rounded-2xl sm:max-w-md">
                          <AlertDialogHeader>
                            <AlertDialogTitle>Free up storage space?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This deletes stored files that no current video or image uses — including
                              files left behind by videos you removed earlier. Everything still in any
                              branch&apos;s lists stays untouched.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
                            <AlertDialogAction className="rounded-xl" onClick={() => void handleStorageCleanup()}>
                              Yes, clean up
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  ) : null}
                  {full ? (
                    <p className="mt-3 text-xs font-medium text-red-600 dark:text-red-400">
                      Storage is full. New uploads will be billed by Cloudflare (or may fail) — remove
                      old videos or images to free space.
                    </p>
                  ) : almostFull ? (
                    <p className="mt-3 text-xs font-medium text-amber-600 dark:text-amber-400">
                      Heads up — your storage is almost full, only {freeGb} GB left of the 10 GB free
                      space. Beyond 10 GB, Cloudflare R2 starts charging. Remove old videos/images to
                      stay within the free tier.
                    </p>
                  ) : null}
                </div>
              );
            })()
          : null}

        <Alert className="rounded-xl border-emerald-500/25 bg-emerald-500/5">
          <AlertDescription className="text-sm leading-relaxed">
            <strong className="text-foreground">Recommended: MP4 (H.264), max 50 MB</strong> — works on every TV
            browser. For large files, paste a direct link instead of uploading.
            <span className="mt-1 block text-xs text-muted-foreground">{RECOMMENDED_VIDEO_FORMATS.join(" · ")}</span>
          </AlertDescription>
        </Alert>

        {canManageVideos || canManageImages ? (
          <>
            <UploadAccessPanel state={uploadAccess} actor={actor} />
            <UploadPasswordDialog state={uploadAccess} />
          </>
        ) : null}

        {canManageVideos && effectiveBranchId ? (
          <ContentPanel title="Add Video" description="Pick the easiest option — pasting a link is usually fastest">
            {canApplyToAll ? (
              <ApplyToAllCheckbox
                checked={applyToAll}
                onChange={setApplyToAll}
                branchCount={branches.filter((b) => b.status === "active").length}
                className="mb-4"
              />
            ) : null}
            <Tabs defaultValue="external">
              <TabsList className="rounded-xl">
                <TabsTrigger value="external" className="gap-2 rounded-lg">
                  Paste link
                  <Badge className="bg-emerald-600 text-[10px] text-white hover:bg-emerald-600">Easiest</Badge>
                </TabsTrigger>
                <TabsTrigger value="upload" className="rounded-lg">Upload file</TabsTrigger>
                <TabsTrigger value="drive" className="rounded-lg">Google Drive</TabsTrigger>
              </TabsList>
              <TabsContent value="external" className="mt-4 space-y-4">
                <p className="text-sm text-muted-foreground">
                  <strong className="text-foreground">Step 1:</strong> Copy a direct MP4 or WebM link from your hosting.
                  <br />
                  <strong className="text-foreground">Step 2:</strong> Paste below and click Save — your TV starts playing it immediately.
                </p>
                <div className="space-y-2">
                  <Label>Title (optional)</Label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Defaults to filename from URL"
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Video URL (direct MP4/WebM)</Label>
                  <Input
                    value={externalUrl}
                    onChange={(e) => setExternalUrl(e.target.value)}
                    placeholder="https://example.com/promo.mp4"
                    className="rounded-xl"
                  />
                </div>
                <Button
                  onClick={() => uploadAccess.guard(() => handleExternalAdd())}
                  disabled={!externalUrl.trim()}
                  className="rounded-xl"
                >
                  <Link2 className="mr-2 h-4 w-4" />
                  Save video link
                </Button>
              </TabsContent>
              <TabsContent value="upload" className="mt-4 space-y-4">
                <p className="text-sm text-muted-foreground">
                  Upload a video file from your computer. Having trouble? Paste a direct video link instead.
                </p>
                <div className="space-y-2">
                  <Label>Title (optional)</Label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Defaults to filename"
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label>
                    Video file (MP4 recommended — max{" "}
                    {(isR2UploadConfigured() ? MAX_VIDEO_UPLOAD_BYTES : MAX_CHUNKED_VIDEO_BYTES) / (1024 * 1024)}{" "}
                    MB)
                  </Label>
                  <Input
                    type="file"
                    multiple
                    accept="video/mp4,video/webm,video/quicktime,.mp4,.mov,.webm"
                    onChange={(e) => {
                      const list = Array.from(e.target.files ?? []);
                      setVideoFiles(list);
                      setVideoFileTitles(list.map((f) => deriveTitleFromFile(f)));
                      const selected = list[0] ?? null;
                      setFile(selected);
                      if (selected && !title.trim()) {
                        setTitle(deriveTitleFromFile(selected));
                      }
                    }}
                    className="rounded-xl"
                  />
                  {videoFiles.length > 1 ? (
                    <div className="space-y-2">
                      <p className="text-xs text-emerald-600 dark:text-emerald-400">
                        {videoFiles.length} videos selected — all will play in rotation on the display.
                        Edit the names below before uploading.
                      </p>
                      {videoFiles.map((f, i) => (
                        <div key={`${f.name}-${i}`} className="flex items-center gap-2">
                          <span className="w-24 shrink-0 truncate text-xs text-muted-foreground" title={f.name}>
                            {f.name}
                          </span>
                          <Input
                            value={videoFileTitles[i] ?? ""}
                            onChange={(e) =>
                              setVideoFileTitles((prev) =>
                                prev.map((t, ti) => (ti === i ? e.target.value : t)),
                              )
                            }
                            placeholder="Name shown in lists"
                            className="h-8 rounded-lg text-sm"
                          />
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {file ? (
                    <p className="text-xs text-muted-foreground">
                      Selected: {file.name} ({(file.size / (1024 * 1024)).toFixed(1)} MB)
                      {file.size > WARN_LARGE_VIDEO_BYTES ? (
                        <span className="mt-1 block text-amber-600 dark:text-amber-400">
                          Large file — compress to under 50 MB or paste a direct link for faster setup.
                        </span>
                      ) : null}
                      {file.size > MAX_CHUNKED_VIDEO_BYTES && !isR2UploadConfigured() ? (
                        <span className="mt-1 block text-amber-600 dark:text-amber-400">
                          This file is too large to upload ({MAX_CHUNKED_VIDEO_BYTES / (1024 * 1024)} MB max).
                          Compress it or paste a direct video link instead.
                        </span>
                      ) : null}
                    </p>
                  ) : null}
                </div>
                {uploading ? (
                  <div className="space-y-2">
                    <Progress value={uploading ? Math.max(progress, 1) : progress} className="h-2" />
                    <p className="text-xs text-muted-foreground">Uploading {Math.round(progress)}%…</p>
                  </div>
                ) : null}
                <Button
                  disabled={uploading || !file}
                  onClick={() => uploadAccess.guard(() => handleUpload())}
                  className="rounded-xl"
                >
                  <Upload className="mr-2 h-4 w-4" />
                  {uploading ? `Uploading ${Math.round(progress)}%` : "Upload Video"}
                </Button>
              </TabsContent>
              <TabsContent value="drive" className="mt-4 space-y-4">
                <Alert className="rounded-xl border-amber-500/30 bg-amber-500/5">
                  <Cloud className="h-4 w-4 text-amber-600" />
                  <AlertDescription className="text-sm">
                    Paste a Google Drive share link. For the most reliable playback, use a direct MP4 link instead.
                  </AlertDescription>
                </Alert>
                <div className="space-y-2">
                  <Label>Title (optional)</Label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Defaults to Google Drive video"
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Google Drive share link</Label>
                  <Input
                    value={driveUrl}
                    onChange={(e) => setDriveUrl(e.target.value)}
                    placeholder="https://drive.google.com/file/d/FILE_ID/view"
                    className="rounded-xl"
                  />
                  <p className="text-xs text-muted-foreground">
                    Paste Google Drive share link — we&apos;ll convert it automatically
                  </p>
                </div>
                <Button
                  onClick={() => uploadAccess.guard(() => handleDriveAdd())}
                  disabled={!driveUrl.trim()}
                  className="rounded-xl"
                >
                  <Cloud className="mr-2 h-4 w-4" />
                  Add from Google Drive
                </Button>
              </TabsContent>
            </Tabs>
          </ContentPanel>
        ) : null}

        {canProposeVideos && !canManageVideos && effectiveBranchId ? (
          <ContentPanel
            title="Propose a Video"
            description="Paste a video link — your branch manager approves it before it plays on the TV"
          >
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Title (optional)</Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Defaults to filename from URL"
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label>Video URL (direct MP4/WebM)</Label>
                <Input
                  value={proposeUrl}
                  onChange={(e) => setProposeUrl(e.target.value)}
                  placeholder="https://example.com/promo.mp4"
                  className="rounded-xl"
                />
              </div>
              <Button
                onClick={() => void handlePropose()}
                disabled={proposing || !proposeUrl.trim()}
                className="rounded-xl"
              >
                <Link2 className="mr-2 h-4 w-4" />
                {proposing ? "Sending…" : "Send for approval"}
              </Button>
            </div>
          </ContentPanel>
        ) : null}

        {pendingVideos.length > 0 ? (
          <ContentPanel
            title="Pending Approval"
            description={
              canManageVideos
                ? "Videos proposed by branch users — approve to play them on the display"
                : "Waiting for your branch manager to approve"
            }
          >
            <DataTable
              data={pendingVideos}
              keyExtractor={(v) => v.id}
              mobileTitle={(v) => v.title}
              columns={[
                { key: "title", header: "Title", cell: (v) => <span className="font-medium">{v.title}</span> },
                {
                  key: "status",
                  header: "Status",
                  cell: () => (
                    <Badge className="bg-amber-500/15 text-amber-600 hover:bg-amber-500/15 dark:text-amber-400">
                      Pending
                    </Badge>
                  ),
                },
                {
                  key: "preview",
                  header: "Preview",
                  cell: (v) => (
                    <a
                      className="text-sm text-primary underline-offset-4 hover:underline"
                      href={v.downloadUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open
                    </a>
                  ),
                  hideOnMobile: true,
                },
                {
                  key: "actions",
                  header: "Actions",
                  className: "text-right",
                  cell: (v) =>
                    canManageVideos && actor ? (
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          className="rounded-lg"
                          onClick={() =>
                            void approveVideo(v, actor)
                              .then(() => toast.success("Approved — now playing on the display"))
                              .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to approve"))
                          }
                        >
                          Approve
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-lg"
                          onClick={() =>
                            void rejectVideo(v, actor)
                              .then(() => toast.success("Rejected"))
                              .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to reject"))
                          }
                        >
                          Reject
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">Awaiting approval</span>
                    ),
                },
              ]}
            />
          </ContentPanel>
        ) : null}

        {canManageImages && effectiveBranchId ? (
          <ContentPanel title="Image Adverts" description="Images play in the TV play order together with the videos — arrange them in the panel above">
            {canApplyToAll ? (
              <ApplyToAllCheckbox
                checked={applyToAll}
                onChange={setApplyToAll}
                branchCount={branches.filter((b) => b.status === "active").length}
                className="mb-4"
              />
            ) : null}
            <Tabs defaultValue="image-url">
              <TabsList className="rounded-xl">
                <TabsTrigger value="image-url" className="rounded-lg">Image URL</TabsTrigger>
                <TabsTrigger value="image-upload" className="rounded-lg">Upload Image</TabsTrigger>
              </TabsList>
              <TabsContent value="image-url" className="mt-4 space-y-4">
                <div className="space-y-2">
                  <Label>Title (optional)</Label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} className="rounded-xl" />
                </div>
                <div className="space-y-2">
                  <Label>Image URL</Label>
                  <Input
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    placeholder="https://example.com/promo.jpg"
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Display duration (seconds)</Label>
                  <Input
                    type="number"
                    min={5}
                    value={imageDuration}
                    onChange={(e) => setImageDuration(Number(e.target.value))}
                    className="rounded-xl"
                  />
                </div>
                <Button
                  onClick={() => uploadAccess.guard(() => handleImageUrlAdd())}
                  disabled={imageUploading || !imageUrl.trim()}
                  className="rounded-xl"
                >
                  <ImageIcon className="mr-2 h-4 w-4" />
                  Add Image URL
                </Button>
              </TabsContent>
              <TabsContent value="image-upload" className="mt-4 space-y-4">
                <div className="space-y-2">
                  <Label>Image file (JPG, PNG, WebP)</Label>
                  <Input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                    multiple
                    onChange={(e) => {
                      const list = Array.from(e.target.files ?? []);
                      setImageFiles(list);
                      setImageFile(list[0] ?? null);
                      setImageFileTitles(list.map((f) => f.name.replace(/\.[^.]+$/, "") || f.name));
                    }}
                    className="rounded-xl"
                  />
                  {imageFiles.length > 0 ? (
                    <div className="space-y-2">
                      {imageFiles.length > 1 ? (
                        <p className="text-xs text-emerald-600 dark:text-emerald-400">
                          {imageFiles.length} images selected — edit the names below before uploading.
                        </p>
                      ) : null}
                      {imageFiles.map((f, i) => (
                        <div key={`${f.name}-${i}`} className="flex items-center gap-2">
                          <span className="w-24 shrink-0 truncate text-xs text-muted-foreground" title={f.name}>
                            {f.name}
                          </span>
                          <Input
                            value={imageFileTitles[i] ?? ""}
                            onChange={(e) =>
                              setImageFileTitles((prev) =>
                                prev.map((t, ti) => (ti === i ? e.target.value : t)),
                              )
                            }
                            placeholder="Name shown in lists"
                            className="h-8 rounded-lg text-sm"
                          />
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
                <Button
                  onClick={() => uploadAccess.guard(() => handleImageUpload())}
                  disabled={imageUploading || !imageFile}
                  className="rounded-xl"
                >
                  <Upload className="mr-2 h-4 w-4" />
                  {imageUploading ? "Uploading..." : "Upload Image"}
                </Button>
              </TabsContent>
            </Tabs>
          </ContentPanel>
        ) : null}

        {effectiveBranchId && videos.length + images.length > 0 ? (
          <ContentPanel
            title="TV play order — videos & images together"
            description="This is the EXACT sequence the TV plays, top to bottom, then repeats. Drag rows to mix videos and images any way you like (video → image → video …). “Repetition” plays an item that many times in a row before moving on (1 = once)."
          >
            <SortableDataTable
              data={mediaOrder}
              keyExtractor={(m) => `${m.kind}:${mediaItemId(m)}`}
              mobileTitle={(m) => mediaItemTitle(m)}
              onReorder={(ordered) => reorderMediaList(ordered)}
              reorderDisabled={!canManageVideos}
              columns={[
                {
                  key: "position",
                  header: "#",
                  cell: (m) => (
                    <span className="text-sm font-semibold tabular-nums text-muted-foreground">
                      {mediaOrder.findIndex((x) => x.kind === m.kind && mediaItemId(x) === mediaItemId(m)) + 1}
                    </span>
                  ),
                },
                {
                  key: "type",
                  header: "Type",
                  cell: (m) =>
                    m.kind === "video" ? (
                      <Badge className="bg-sky-500/15 text-sky-600 dark:text-sky-400">Video</Badge>
                    ) : (
                      <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">Image</Badge>
                    ),
                },
                {
                  key: "title",
                  header: "Title",
                  cell: (m) => <span className="truncate font-medium">{mediaItemTitle(m)}</span>,
                },
                {
                  key: "shows",
                  header: "Shows for",
                  hideOnMobile: true,
                  cell: (m) =>
                    m.kind === "video" ? (
                      <span className="text-xs text-muted-foreground">full video</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {m.image.displayDurationSeconds ?? 15}s
                      </span>
                    ),
                },
                {
                  key: "repeat",
                  header: "Repetition",
                  cell: (m) => {
                    const id = mediaItemId(m);
                    const current = (m.kind === "video" ? m.video.playRepeat : m.image.playRepeat) ?? 1;
                    return (
                      <Input
                        key={`${id}-${current}`}
                        type="number"
                        min={1}
                        max={10}
                        defaultValue={current}
                        disabled={!canManageVideos}
                        onBlur={(e) => {
                          const input = e.target;
                          // Echo the CLAMPED value back immediately — typing "0"
                          // or clearing must never leave a stale number visible.
                          const value = Math.max(1, Math.min(10, Number(input.value) || 1));
                          input.value = String(value);
                          if (value === current) return;
                          commitRepeat(m, String(value), () => {
                            input.value = String(current);
                          });
                        }}
                        className="h-8 w-16 rounded-lg text-sm"
                      />
                    );
                  },
                },
                {
                  key: "order",
                  header: "Order",
                  className: "text-right",
                  cell: (m) => (
                    <div className="flex justify-end gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 w-8 rounded-lg p-0"
                        disabled={!canManageVideos}
                        aria-label="Move earlier"
                        onClick={() => moveMediaItem(m, "up")}
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 w-8 rounded-lg p-0"
                        disabled={!canManageVideos}
                        aria-label="Move later"
                        onClick={() => moveMediaItem(m, "down")}
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ),
                },
              ]}
            />
          </ContentPanel>
        ) : null}

        {!effectiveBranchId ? (
          <EmptyState title="Select a branch" description="Choose a branch to manage its display videos." icon={Video} />
        ) : videos.length === 0 ? (
          <EmptyState
            title="No videos for this branch"
            description="Paste a video URL above — it will play on the branch display immediately."
            icon={Video}
          />
        ) : (
          <ContentPanel
            title="Branch Videos"
            description="Drag rows to set play order, or use ▲ ▼ as a fallback."
          >
            {canManageVideos ? (
              <div className="mb-3 flex justify-end">{removeAllButton("videos", videos.length)}</div>
            ) : null}
            <SortableDataTable
              data={videos}
              keyExtractor={(v) => v.id}
              mobileTitle={(v) => v.title}
              onReorder={(ordered) => void reorderVideosList(ordered)}
              reorderDisabled={!canManageVideos}
              columns={[
                { key: "title", header: "Title", cell: (v) => renameableTitle("video", v.id, v.title) },
                {
                  key: "source",
                  header: "Source",
                  cell: (v) => (
                    <StatusBadge
                      status={
                        v.sourceType === "chunked"
                          ? "chunked"
                          : v.sourceType === "r2"
                            ? "cloud"
                            : v.downloadUrl.includes("drive.google.com")
                              ? "google_drive"
                              : v.sourceType
                      }
                      variant={v.sourceType === "external" ? "info" : "neutral"}
                    />
                  ),
                },
                {
                  key: "size",
                  header: "Size",
                  cell: (v) => (v.fileSizeBytes ? `${(v.fileSizeBytes / (1024 * 1024)).toFixed(1)} MB` : "—"),
                  hideOnMobile: true,
                },
                {
                  key: "preview",
                  header: "Preview",
                  cell: (v) =>
                    v.sourceType === "chunked" ? (
                      <span className="text-xs text-muted-foreground">Plays on display</span>
                    ) : (
                      <a
                        className="text-sm text-primary underline-offset-4 hover:underline"
                        href={v.downloadUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open
                      </a>
                    ),
                },
                {
                  key: "actions",
                  header: "Actions",
                  className: "text-right",
                  cell: (v) =>
                    canManageVideos ? (
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-lg px-2"
                          title="Play earlier"
                          disabled={videos.findIndex((x) => x.id === v.id) === 0}
                          onClick={() => void moveVideo(v, "up")}
                        >
                          <ArrowUp className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-lg px-2"
                          title="Play later"
                          disabled={videos.findIndex((x) => x.id === v.id) === videos.length - 1}
                          onClick={() => void moveVideo(v, "down")}
                        >
                          <ArrowDown className="h-3 w-3" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger
                            render={
                              <Button variant="outline" size="sm" className="rounded-lg">
                                <Trash2 className="mr-1 h-3 w-3" />
                                Remove
                              </Button>
                            }
                          />
                          <AlertDialogContent className="rounded-2xl">
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remove {v.title}?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This video will be removed from the branch display.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                className="rounded-xl"
                                onClick={() =>
                                  void deleteVideo(v, {
                                    userId: user!.uid,
                                    userName: profile!.displayName || profile!.email,
                                  })
                                    .then(() => toast.success("Video removed"))
                                    .catch((e) =>
                                      toast.error(e instanceof Error ? e.message : "Failed to remove video"),
                                    )
                                }
                              >
                                Remove
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    ) : null,
                },
              ]}
            />
          </ContentPanel>
        )}

        {images.length > 0 ? (
          <ContentPanel title="Active Image Adverts" description="Drag rows to set order, or use ▲ ▼ as a fallback">
            {canManageImages ? (
              <div className="mb-3 flex justify-end">{removeAllButton("images", images.length)}</div>
            ) : null}
            {/* Change every image in one go — with many images, setting each row
                one by one takes ages. Per-image boxes below still work too. */}
            {images.length > 1 ? (
              <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-border/40 bg-muted/20 p-3">
                <Label className="text-sm">Seconds for ALL {images.length} images:</Label>
                <Input
                  type="number"
                  min={3}
                  max={600}
                  value={bulkSeconds}
                  onChange={(e) => setBulkSeconds(e.target.value)}
                  aria-label="Seconds for all images"
                  className="h-9 w-24 rounded-lg"
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-lg"
                  disabled={bulkApplying}
                  onClick={() => {
                    const v = Math.round(Number(bulkSeconds));
                    if (!Number.isFinite(v) || v < 3 || v > 600) {
                      toast.error("Seconds must be between 3 and 600");
                      return;
                    }
                    uploadAccess.guard(async () => {
                      setBulkApplying(true);
                      try {
                        for (const img of images) {
                          if (img.displayDurationSeconds === v) continue;
                          await updateImageAdvertDuration(img.id, v, {
                            userId: user?.uid ?? "",
                            userName: profile?.displayName || profile?.email || "",
                            branchId: img.branchId,
                            title: img.title,
                          });
                        }
                        toast.success(`All ${images.length} images now show for ${v} seconds each`);
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : "Could not update every image");
                      } finally {
                        setBulkApplying(false);
                      }
                    });
                  }}
                >
                  {bulkApplying ? "Applying…" : "Apply to all"}
                </Button>
                <span className="text-xs text-muted-foreground">
                  Or fine-tune single images in the list below.
                </span>
              </div>
            ) : null}
            <SortableDataTable
              data={images}
              keyExtractor={(img) => img.id}
              mobileTitle={(img) => img.title}
              onReorder={(ordered) => void reorderImagesList(ordered)}
              reorderDisabled={!canManageImages}
              columns={[
                { key: "title", header: "Title", cell: (img) => renameableTitle("image", img.id, img.title) },
                {
                  key: "duration",
                  header: "Seconds on screen",
                  // Editable per image: type a number and click away (or press
                  // Enter) to save — that one image then stays this many seconds.
                  cell: (img) => (
                    <div className="flex items-center gap-1.5">
                      <Input
                        type="number"
                        min={3}
                        max={600}
                        // Re-mount when the saved value changes so the box always
                        // shows what is actually stored.
                        key={`${img.id}-${img.displayDurationSeconds}`}
                        defaultValue={img.displayDurationSeconds}
                        aria-label={`Seconds on screen for ${img.title}`}
                        className="h-8 w-20 rounded-lg"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                        }}
                        onBlur={(e) => {
                          const input = e.target as HTMLInputElement;
                          const v = Math.round(Number(input.value));
                          const revert = () => {
                            input.value = String(img.displayDurationSeconds);
                          };
                          if (!Number.isFinite(v) || v < 3 || v > 600) {
                            toast.error("Seconds must be between 3 and 600");
                            revert();
                            return;
                          }
                          if (v === img.displayDurationSeconds) return;
                          uploadAccess.guard(
                            async () => {
                              try {
                                await updateImageAdvertDuration(img.id, v, {
                                  userId: user?.uid ?? "",
                                  userName: profile?.displayName || profile?.email || "",
                                  branchId: img.branchId,
                                  title: img.title,
                                });
                                toast.success(`"${img.title}" now shows for ${v} seconds`);
                              } catch (err) {
                                toast.error(err instanceof Error ? err.message : "Could not save the seconds");
                                revert();
                              }
                            },
                            // Password prompt cancelled — nothing saved, show the real value.
                            revert,
                          );
                        }}
                      />
                      <span className="text-xs text-muted-foreground">sec</span>
                    </div>
                  ),
                },
                {
                  key: "preview",
                  header: "Preview",
                  // Uploaded images are stored as data: URLs, which browsers block
                  // from opening in a new tab — show an inline thumbnail instead.
                  cell: (img) => (
                    <div className="flex items-center gap-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={img.downloadUrl}
                        alt={img.title}
                        className="h-10 w-16 shrink-0 rounded-md border border-border/40 bg-muted object-contain"
                      />
                      {!img.downloadUrl.startsWith("data:") ? (
                        <a
                          className="text-sm text-primary underline-offset-4 hover:underline"
                          href={img.downloadUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open
                        </a>
                      ) : null}
                    </div>
                  ),
                },
                {
                  key: "actions",
                  header: "Actions",
                  className: "text-right",
                  cell: (img) =>
                    canManageImages ? (
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-lg px-2"
                          title="Show earlier"
                          disabled={images.findIndex((x) => x.id === img.id) === 0}
                          onClick={() => void moveImage(img, "up")}
                        >
                          <ArrowUp className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-lg px-2"
                          title="Show later"
                          disabled={images.findIndex((x) => x.id === img.id) === images.length - 1}
                          onClick={() => void moveImage(img, "down")}
                        >
                          <ArrowDown className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-lg"
                          onClick={() =>
                            void deleteImageAdvert(img, {
                              userId: user!.uid,
                              userName: profile!.displayName || profile!.email,
                            })
                              .then(() => toast.success("Image removed"))
                              .catch((e) =>
                                toast.error(e instanceof Error ? e.message : "Failed to remove image"),
                              )
                          }
                        >
                          <Trash2 className="mr-1 h-3 w-3" />
                          Remove
                        </Button>
                      </div>
                    ) : null,
                },
              ]}
            />
          </ContentPanel>
        ) : null}
      </PageShell>
    </>
  );
}
