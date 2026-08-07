"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Cloud, Link2, Pencil, RotateCcw, Share2, Upload, Video, Trash2, ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { DashboardHeader } from "@/components/layout/dashboard-sidebar";
import { LiveTvPreview } from "@/components/shared/live-tv-preview";
import { ApplyToAllCheckbox, type BranchTargetScope } from "@/components/shared/apply-to-all-checkbox";
import { estimateUniqueMediaStorageBytes } from "@/lib/media-storage-estimate";
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
import {
  UploadDestinationDialog,
  uploadSkipKey,
} from "@/components/dashboard/upload-destination-dialog";
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
} from "@/lib/constants";
import { PreviewDisplayLink } from "@/components/shared/preview-display-link";
import { Badge } from "@/components/ui/badge";
import {
  approveVideo,
  deleteVideo,
  isR2UploadConfigured,
  proposeExternalVideo,
  rejectVideo,
  reorderVideos,
  restoreInactiveVideosOnBranch,
  subscribePendingVideos,
  subscribeVideos,
  uploadVideo,
} from "@/lib/services/video-service";
import {
  duplicateImageAdvertToBranch,
  duplicateStorageVideoToBranch,
  getActiveBranchTargets,
  pushBranchMediaToAllBranches,
  restoreInactiveMediaOnAllBranches,
  purgeUnreachableMediaOnAllBranches,
  syncExternalVideoToBranches,
  syncImageUrlToBranches,
  dedupeActiveMediaOnBranch,
} from "@/lib/services/branch-sync";
import { isMediaUrlReachable } from "@/lib/media-url-health";
import { mediaIdentityKeys } from "@/lib/media-identity";
import { auth } from "@/lib/firebase/client";
import { getDocument, sumField } from "@/lib/firebase/firestore";
import { COLLECTIONS } from "@/lib/constants";
import { estimateMediaItemBytes } from "@/lib/media-item-bytes";
import {
  deleteImageAdvert,
  reorderImageAdverts,
  restoreInactiveImagesOnBranch,
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

/** Open any image URL in a new tab. Uploaded images are often stored as
 *  data: URLs, which browsers refuse to open via a normal link — convert
 *  those to a temporary blob: URL first so every row can use Open. */
async function openImageInNewTab(url: string, storagePath?: string | null) {
  const href = url?.trim();
  if (!href) {
    toast.error("This image has no preview URL");
    return;
  }
  if (!href.startsWith("data:")) {
    const ok = await isMediaUrlReachable({ downloadUrl: href, storagePath });
    if (!ok) {
      toast.error("This file is missing from storage (404). Remove it and upload again.");
      return;
    }
    window.open(href, "_blank", "noopener,noreferrer");
    return;
  }
  try {
    const r = await fetch(href);
    const blob = await r.blob();
    const blobUrl = URL.createObjectURL(blob);
    const win = window.open(blobUrl, "_blank", "noopener,noreferrer");
    if (!win) {
      URL.revokeObjectURL(blobUrl);
      toast.error("Pop-up blocked — allow pop-ups to view the image");
      return;
    }
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
  } catch {
    toast.error("Could not open this image");
  }
}

async function openHttpMediaInNewTab(url: string, storagePath?: string | null) {
  const href = url?.trim();
  if (!href) {
    toast.error("This file has no URL");
    return;
  }
  const ok = await isMediaUrlReachable({ downloadUrl: href, storagePath });
  if (!ok) {
    toast.error("This file is missing from storage (404). Remove it and upload again.");
    return;
  }
  window.open(href, "_blank", "noopener,noreferrer");
}

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
  // Multi-select delete for videos and images (client 2026-08-07): tick the
  // rows you want gone and remove them in one action, instead of one-by-one or
  // the all-or-nothing "Remove all".
  const [selectedVideoIds, setSelectedVideoIds] = useState<string[]>([]);
  const [selectedImageIds, setSelectedImageIds] = useState<string[]>([]);
  const [deletingSelected, setDeletingSelected] = useState<"videos" | "images" | null>(null);

  const toggleId = (list: string[], id: string) =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

  async function deleteSelectedMedia(kind: "videos" | "images") {
    if (!actor) return;
    const ids = kind === "videos" ? selectedVideoIds : selectedImageIds;
    if (ids.length === 0) return;
    setDeletingSelected(kind);
    let removed = 0;
    let failed = 0;
    try {
      if (kind === "videos") {
        for (const v of videos.filter((x) => ids.includes(x.id))) {
          try {
            await deleteVideo(v, actor);
            removed += 1;
          } catch {
            failed += 1;
          }
        }
        setSelectedVideoIds([]);
      } else {
        for (const img of images.filter((x) => ids.includes(x.id))) {
          try {
            await deleteImageAdvert(img, actor);
            removed += 1;
          } catch {
            failed += 1;
          }
        }
        setSelectedImageIds([]);
      }
      if (failed > 0) {
        toast.warning(`Removed ${removed} — ${failed} could not be removed. Try again shortly.`);
      } else {
        toast.success(`Removed ${removed} ${kind === "videos" ? "video(s)" : "image(s)"} from this branch`);
      }
    } finally {
      setDeletingSelected(null);
    }
  }

  // "Remove all" (videos or images) in progress — disables both buttons.
  const [removingAll, setRemovingAll] = useState<"videos" | "images" | null>(null);
  // TRUE bucket usage from Cloudflare (worker /api/storage-usage) — what R2
  // actually bills, including files the database lost track of.
  const [realStorage, setRealStorage] = useState<{ bytes: number; objects: number } | null>(null);
  // Defer the heavy live-TV iframe so video/image lists paint first on refresh.
  const [showLivePreview, setShowLivePreview] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageDuration, setImageDuration] = useState(15);
  // Bulk "seconds on screen" — applies one value to EVERY image at once.
  const [bulkSeconds, setBulkSeconds] = useState("15");
  const [bulkApplying, setBulkApplying] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  // Admin: copy this branch's playlist to every other branch (add missing only —
  // never removes unique videos/images already on those branches).
  const [pushingPlaylist, setPushingPlaylist] = useState<"all" | "videos" | "images" | null>(null);
  const [restoringMedia, setRestoringMedia] = useState(false);
  const [purgingBroken, setPurgingBroken] = useState(false);
  const [targetScope, setTargetScope] = useState<"current" | "specific" | "all">("current");
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>([effectiveBranchId]);
  const [uploadDestOpen, setUploadDestOpen] = useState<"video" | "image" | null>(null);
  /** Skip sync/upload for branch+file keys chosen in the destination dialog. */
  const [uploadSkipKeys, setUploadSkipKeys] = useState<Set<string>>(new Set());
  /** The branch targets the admin picked in the Apply-to checkbox, in the form
   *  the sync services accept: true = all active branches, string[] = specific
   *  branch ids (+ current is added by the service), false = current only.
   *  Previously "Select specific branches" was silently collapsed to current-
   *  only (audit 2026-08-03) — this makes all three scopes real. */
  const mediaTargets = (): boolean | string[] =>
    !canApplyToAll
      ? false
      : targetScope === "all"
        ? true
        : targetScope === "specific"
          ? selectedBranchIds.filter((id) => id !== effectiveBranchId)
          : false;
  const mediaTargetsWantSync = (t: boolean | string[]): boolean =>
    t === true || (Array.isArray(t) && t.length > 0);
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
    const videoBytes = videos.reduce((sum, v) => sum + estimateMediaItemBytes(v), 0);
    const imageBytes = images.reduce((sum, img) => sum + estimateMediaItemBytes(img), 0);
    return videoBytes + imageBytes;
  }, [videos, images]);

  const gb = (bytes: number) => (bytes / (1024 * 1024 * 1024)).toFixed(2);
  const formatStorage = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${gb(bytes)} GB`;
  };

  // Storage meter: show this branch immediately, then the true unique-file
  // total. Plain sums over every doc were WRONG twice over — they counted
  // deleted (inactive) media and counted a file once per branch that shares
  // it, reporting ~3 GB when only ~0.1 GB was actually in use
  // (client 2026-08-07). estimateUniqueMediaStorageBytes() skips non-active
  // docs and de-duplicates by storage path / URL, and is cheap now that the
  // query projects only the size fields.
  const refreshTotalStorage = useCallback(async () => {
    setTotalStorageBytes((prev) => (prev == null ? usedBytes : Math.max(prev, usedBytes)));
    try {
      const { bytes } = await estimateUniqueMediaStorageBytes();
      setTotalStorageBytes(Math.max(bytes, usedBytes));
    } catch {
      setTotalStorageBytes(usedBytes);
    }
  }, [usedBytes]);

  useEffect(() => {
    // Let the media subscriptions win the first paint, then refresh the meter.
    const t = window.setTimeout(() => {
      void refreshTotalStorage();
    }, 0);
    return () => window.clearTimeout(t);
  }, [refreshTotalStorage]);

  // Live R2 count — once per significant usage change, deferred so lists load first.
  useEffect(() => {
    let alive = true;
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          const token = await auth.currentUser?.getIdToken();
          if (!token || !alive) return;
          const res = await fetch("/api/storage-usage", {
            cache: "no-store",
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!res.ok || !alive) return;
          const data = (await res.json()) as { bytes?: number; objects?: number };
          if (alive && typeof data.bytes === "number") {
            setRealStorage({ bytes: data.bytes, objects: data.objects ?? 0 });
          }
        } catch {
          // Endpoint unavailable — sumField / branch estimate still show.
        }
      })();
    }, 400);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [usedBytes]);

  // Mount the live preview after lists have had a chance to subscribe.
  useEffect(() => {
    if (!branch) {
      setShowLivePreview(false);
      return;
    }
    const t = window.setTimeout(() => setShowLivePreview(true), 500);
    return () => window.clearTimeout(t);
  }, [branch]);

  /** Bytes shown on the meter: R2 live when available, else unique media estimate,
   *  never below this branch's own footprint (so it can't read 0.00 with media present). */
  const displayedStorageBytes = Math.max(
    realStorage?.bytes ?? 0,
    totalStorageBytes ?? 0,
    usedBytes,
  );

  /** Returns false (and toasts) when an upload would exceed the 10 GB budget.
   *  Capacity warnings only surface when storage is nearly full or over the limit —
   *  no toast spam for normal uploads. */
  function withinStorageBudget(addBytes: number): boolean {
    const projected = displayedStorageBytes + addBytes;
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

  /** Size / R2 / Firestore-fallback messages — never toast these; they confused users mid-batch. */
  function isUploadLimitNoise(message: string): boolean {
    return /MB limit|slow fallback|Cloudflare R2|chunk|direct video link|Cloud upload failed|too large for the database|database fallback|Paste a direct/i.test(
      message,
    );
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

  // One-shot: hide active playlist rows whose R2/public file is already gone
  // (common after Restore reactivated soft-deletes whose bytes were purged).
  const purgedBrokenRef = useRef(false);
  useEffect(() => {
    if (!canApplyToAll || !actor || branches.length === 0) return;
    if (purgedBrokenRef.current) return;
    purgedBrokenRef.current = true;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          setPurgingBroken(true);
          const result = await purgeUnreachableMediaOnAllBranches(branches, actor);
          if (result.videosRemoved + result.imagesRemoved > 0) {
            toast.warning(
              `Removed ${result.videosRemoved} video(s) and ${result.imagesRemoved} image(s) with missing files (404). Re-upload to play them again.`,
              { duration: 14000 },
            );
          }
        } catch {
          // Non-blocking — admin can still use the manual Clean button.
        } finally {
          setPurgingBroken(false);
        }
      })();
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [actor, branches, canApplyToAll]);

  // Collapse duplicate active rows (same file copied more than once). Deferred
  // so it never blocks the initial list paint on refresh.
  const dedupingRef = useRef(false);
  const dedupeFailedRef = useRef(false);
  useEffect(() => {
    if (!effectiveBranchId || (!canManageVideos && !canManageImages)) return;
    if (dedupingRef.current) return;

    const hasDupes = (items: { downloadUrl?: string | null; storagePath?: string | null }[]) => {
      const seen = new Set<string>();
      for (const item of items) {
        const keys = mediaIdentityKeys(item.downloadUrl, item.storagePath);
        if (keys.length === 0) continue;
        if (keys.some((k) => seen.has(k))) return true;
        for (const k of keys) seen.add(k);
      }
      return false;
    };

    if (!hasDupes(videos) && !hasDupes(images)) return;

    const t = window.setTimeout(() => {
      // Latch on failure: while writes are unavailable this fired on every
      // poll tick, producing an uncaught rejection every ~20s (2026-08-07).
      if (dedupingRef.current || dedupeFailedRef.current) return;
      dedupingRef.current = true;
      dedupeActiveMediaOnBranch(effectiveBranchId)
        .catch(() => {
          dedupeFailedRef.current = true;
        })
        .finally(() => {
          dedupingRef.current = false;
        });
    }, 1200);
    return () => window.clearTimeout(t);
  }, [canManageImages, canManageVideos, effectiveBranchId, images, videos]);

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
        mediaTargets(),
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
      setTargetScope("current");
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
        mediaTargets(),
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
      setTargetScope("current");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to link Google Drive video");
    }
  }

  async function handleUploadMany(files: File[], skipKeys: Set<string> = uploadSkipKeys) {
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
    const failures: string[] = [];
    const uploadedIds: string[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const fileTitle = videoFileTitles[i]?.trim() || deriveTitleFromFile(f);
        // Skip uploading again on the current branch when the dialog marked it as present.
        if (skipKeys.has(uploadSkipKey(effectiveBranchId, fileTitle))) {
          continue;
        }
        try {
          const { id } = await uploadVideo(
            f,
            {
              title: fileTitle,
              branchId: effectiveBranchId,
              createdBy: user.uid,
            },
            { userId: user.uid, userName: profile.displayName || profile.email },
            (p) => setProgress(Math.round(((i + p / 100) / files.length) * 100)),
            { keepExisting: true },
          );
          uploadedIds.push(id);
          done += 1;
        } catch (error) {
          const msg = error instanceof Error ? error.message : "failed";
          if (!isUploadLimitNoise(msg)) {
            failures.push(`${f.name}: ${msg}`);
          } else {
            console.warn("Upload skipped (limit/fallback):", f.name, msg);
          }
        }
      }

      const uploadTargets = mediaTargets();
      if (mediaTargetsWantSync(uploadTargets) && actor && uploadedIds.length > 0) {
        const otherBranches = getActiveBranchTargets(branches, effectiveBranchId, uploadTargets).filter(
          (b) => b.id !== effectiveBranchId,
        );
        let synced = 0;
        for (let i = 0; i < uploadedIds.length; i++) {
          const uploaded = await getDocument<VideoAsset>(COLLECTIONS.videos, uploadedIds[i]);
          if (!uploaded || uploaded.sourceType === "chunked") continue;
          const fileTitle = uploaded.title;
          const targets = otherBranches.filter(
            (b) => !skipKeys.has(uploadSkipKey(b.id, fileTitle)),
          );
          await Promise.all(
            targets.map((b) => duplicateStorageVideoToBranch(uploaded, b.id, user.uid, actor)),
          );
          synced += targets.length > 0 ? 1 : 0;
        }
        if (synced > 0) {
          toast.success(`${done} video(s) uploaded and copied to other branches (duplicates skipped)`);
        } else if (done > 0) {
          toast.success(`${done} video${done === 1 ? "" : "s"} uploaded — they rotate on the display`);
        }
      } else if (done > 0) {
        toast.success(`${done} video${done === 1 ? "" : "s"} uploaded — they rotate on the display`);
      }
      if (failures.length > 0) {
        toast.error(
          `${failures.length} of ${files.length} failed.\n${failures.slice(0, 3).join("\n")}` +
            (failures.length > 3 ? `\n…and ${failures.length - 3} more` : ""),
          { duration: 14000 },
        );
      }
      setTitle("");
      setFile(null);
      setVideoFiles([]);
      setVideoFileTitles([]);
      setUploadSkipKeys(new Set());
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }

  async function handleUpload(skipKeys: Set<string> = uploadSkipKeys) {
    if (videoFiles.length > 1) {
      await handleUploadMany(videoFiles, skipKeys);
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
    if (skipKeys.has(uploadSkipKey(effectiveBranchId, resolvedTitle))) {
      toast.message(`“${resolvedTitle}” already on this branch — skipped. Other selected branches still update if needed.`);
      // Still sync to other branches if we find an existing local copy to duplicate from.
      const existingLocal = videos.find(
        (v) => v.title.trim().toLowerCase() === resolvedTitle.trim().toLowerCase(),
      );
      if (existingLocal && mediaTargetsWantSync(mediaTargets()) && actor) {
        const otherBranches = getActiveBranchTargets(branches, effectiveBranchId, mediaTargets()).filter(
          (b) => b.id !== effectiveBranchId && !skipKeys.has(uploadSkipKey(b.id, resolvedTitle)),
        );
        if (otherBranches.length > 0 && existingLocal.sourceType !== "chunked") {
          await Promise.all(
            otherBranches.map((b) =>
              duplicateStorageVideoToBranch(existingLocal, b.id, user.uid, actor),
            ),
          );
          toast.success(`Copied existing video to ${otherBranches.length} other branch(es)`);
        }
      }
      setUploadSkipKeys(new Set());
      return;
    }

    setUploading(true);
    setProgress(1);
    try {
      const { id: videoId } = await uploadVideo(
        file,
        { title: resolvedTitle, branchId: effectiveBranchId, createdBy: user.uid },
        { userId: user.uid, userName: profile.displayName || profile.email },
        setProgress,
        { keepExisting: true },
      );

      const uploadTargets = mediaTargets();
      if (mediaTargetsWantSync(uploadTargets) && actor) {
        const uploaded = await getDocument<VideoAsset>(COLLECTIONS.videos, videoId);
        if (uploaded && uploaded.sourceType !== "chunked") {
          const otherBranches = getActiveBranchTargets(branches, effectiveBranchId, uploadTargets).filter(
            (b) => b.id !== effectiveBranchId && !skipKeys.has(uploadSkipKey(b.id, resolvedTitle)),
          );
          await Promise.all(
            otherBranches.map((b) =>
              duplicateStorageVideoToBranch(uploaded, b.id, user.uid, actor),
            ),
          );
          if (otherBranches.length > 0) {
            toast.success(`Video synced to ${otherBranches.length + 1} branches (duplicates skipped)`);
          } else {
            toast.success("Video uploaded — it will appear on the display shortly");
          }
        } else {
          toast.success("Video uploaded — it will appear on the display shortly");
        }
      } else {
        toast.success("Video uploaded — it will appear on the display shortly");
      }

      setTitle("");
      setFile(null);
      setVideoFiles([]);
      setVideoFileTitles([]);
      setProgress(0);
      setTargetScope("current");
      setUploadSkipKeys(new Set());
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed";
      if (isUploadLimitNoise(message)) {
        console.warn("Upload failed (limit/fallback):", message);
      } else {
        toast.error(message, { duration: 8000 });
      }
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
        mediaTargets(),
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
      setTargetScope("current");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add image");
    } finally {
      setImageUploading(false);
    }
  }

  async function handleImageUpload(skipKeys: Set<string> = uploadSkipKeys) {
    const files = imageFiles.length > 0 ? imageFiles : imageFile ? [imageFile] : [];
    if (!user || !profile || !effectiveBranchId || files.length === 0) {
      toast.error("Select an image file");
      return;
    }
    if (!withinStorageBudget(files.reduce((s, f) => s + f.size, 0))) return;
    setImageUploading(true);
    let done = 0;
    try {
      const uploadedIds: { id: string; title: string }[] = [];
      for (let i = 0; i < files.length; i++) {
        const fileTitle =
          imageFileTitles[i]?.trim() || files[i].name.replace(/\.[^.]+$/, "") || files[i].name;
        if (skipKeys.has(uploadSkipKey(effectiveBranchId, fileTitle))) {
          continue;
        }
        const id = await uploadImageAdvert(
          {
            title: fileTitle,
            branchId: effectiveBranchId,
            file: files[i],
            displayDurationSeconds: imageDuration,
            createdBy: user.uid,
          },
          { userId: user.uid, userName: profile.displayName || profile.email },
          { keepExisting: true },
        );
        uploadedIds.push({ id, title: fileTitle });
        done += 1;
      }
      const imageTargets = mediaTargets();
      if (mediaTargetsWantSync(imageTargets) && actor) {
        const otherBranches = getActiveBranchTargets(branches, effectiveBranchId, imageTargets).filter(
          (b) => b.id !== effectiveBranchId,
        );
        if (otherBranches.length > 0) {
          for (const { id, title: fileTitle } of uploadedIds) {
            const src = await getDocument<ImageAdvert>(COLLECTIONS.imageAdverts, id);
            if (!src) continue;
            const targets = otherBranches.filter(
              (b) => !skipKeys.has(uploadSkipKey(b.id, fileTitle)),
            );
            await Promise.all(
              targets.map((b) => duplicateImageAdvertToBranch(src, b.id, user.uid, actor)),
            );
          }
          toast.success(
            `Also copied to other branches where missing (duplicates skipped)`,
          );
        }
      }
      if (done > 0) {
        toast.success(
          files.length > 1
            ? `${done} images uploaded — they take their turns in the TV play order`
            : "Image uploaded — it takes its turn in the TV play order",
        );
      } else {
        toast.message("Nothing new to upload on this branch — already present items were skipped");
      }
      setImageFile(null);
      setImageFiles([]);
      setImageFileTitles([]);
      setTitle("");
      setUploadSkipKeys(new Set());
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

  async function handlePushPlaylistToAll(media: "all" | "videos" | "images" = "all") {
    if (!actor || !effectiveBranchId || !canApplyToAll) {
      toast.error("Only admins can copy a playlist to all branches");
      return;
    }
    const copyableVideos =
      media === "images"
        ? []
        : videos.filter(
            (v) => v.status === "active" && v.sourceType !== "chunked" && Boolean(v.downloadUrl?.trim()),
          );
    const copyableImages =
      media === "videos"
        ? []
        : images.filter((img) => img.status === "active" && Boolean(img.downloadUrl?.trim()));
    if (copyableVideos.length + copyableImages.length === 0) {
      toast.error(
        media === "videos"
          ? "This branch has no copyable videos yet (each needs a playable URL)"
          : media === "images"
            ? "This branch has no copyable images yet (each needs a playable URL)"
            : "This branch has no copyable images or videos yet (each item needs a playable URL)",
      );
      return;
    }

    setPushingPlaylist(media);
    const label =
      media === "videos"
        ? `${copyableVideos.length} video(s)`
        : media === "images"
          ? `${copyableImages.length} image(s)`
          : `${copyableVideos.length} video(s) + ${copyableImages.length} image(s)`;
    const toastId = toast.loading(`Copying ${label} to every other branch…`);
    try {
      const result = await pushBranchMediaToAllBranches(
        branches,
        effectiveBranchId,
        videos,
        images,
        actor,
        { media },
      );
      if (result.targetCount === 0) {
        toast.error("No other active branches to update", { id: toastId });
        return;
      }
      const parts = [`Updated ${result.targetCount} branch${result.targetCount === 1 ? "" : "es"}`];
      if (media !== "images") parts.push(`${result.videosCopied} video copy(ies)`);
      if (media !== "videos") parts.push(`${result.imagesCopied} image copy(ies)`);
      if (result.videosSkipped > 0) {
        parts.push(`${result.videosSkipped} chunked video(s) skipped (branch-only)`);
      }
      if (result.imagesSkippedNoUrl > 0) {
        parts.push(`${result.imagesSkippedNoUrl} image(s) skipped (no URL)`);
      }
      if (result.failures > 0) {
        toast.warning(`${parts.join(" · ")} · ${result.failures} copy(ies) failed — retry`, {
          id: toastId,
          duration: 12000,
        });
      } else {
        toast.success(
          `${parts.join(" · ")}. Existing files on a branch were skipped (no duplicates). Switch branch above to confirm.`,
          { id: toastId, duration: 10000 },
        );
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not copy playlist to all branches", {
        id: toastId,
      });
    } finally {
      setPushingPlaylist(null);
    }
  }

  async function handleRestoreMedia(scope: "branch" | "all") {
    if (!actor || !effectiveBranchId) {
      toast.error("Sign in to restore media");
      return;
    }
    if (scope === "all" && !canApplyToAll) {
      toast.error("Only admins can restore media on every branch");
      return;
    }
    setRestoringMedia(true);
    try {
      if (scope === "branch") {
        const [v, i] = await Promise.all([
          restoreInactiveVideosOnBranch(effectiveBranchId, actor),
          restoreInactiveImagesOnBranch(effectiveBranchId, actor),
        ]);
        toast.success(
          v + i > 0
            ? `Restored ${v} video(s) and ${i} image(s) on this branch`
            : "Nothing to restore on this branch — no soft-deleted media with files left",
          { duration: 8000 },
        );
        return;
      }
      const result = await restoreInactiveMediaOnAllBranches(branches, actor, {
        branchId: effectiveBranchId,
        videos,
        images,
      });
      toast.success(
        `Restored across ${result.branchCount} branches · ${result.videosRestored} video(s) + ${result.imagesRestored} image(s) reactivated · ${result.videosCopied} video + ${result.imagesCopied} image copies added from this branch`,
        { duration: 10000 },
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not restore media");
    } finally {
      setRestoringMedia(false);
    }
  }

  async function handlePurgeBrokenMedia() {
    if (!actor || !canApplyToAll) {
      toast.error("Only admins can clean broken media");
      return;
    }
    setPurgingBroken(true);
    const toastId = toast.loading("Checking which videos/images are missing from storage…");
    try {
      const result = await purgeUnreachableMediaOnAllBranches(branches, actor);
      if (result.videosRemoved + result.imagesRemoved === 0) {
        toast.success(
          `All checked files are reachable (${result.urlsChecked} unique URL${result.urlsChecked === 1 ? "" : "s"})`,
          { id: toastId },
        );
      } else {
        toast.warning(
          `Removed ${result.videosRemoved} video(s) and ${result.imagesRemoved} image(s) whose files are missing from storage (404). Re-upload those files to play them again.`,
          { id: toastId, duration: 14000 },
        );
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not clean broken media", {
        id: toastId,
      });
    } finally {
      setPurgingBroken(false);
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
  /** "Delete selected (N)" — appears once rows are ticked. */
  function deleteSelectedButton(kind: "videos" | "images") {
    const count = kind === "videos" ? selectedVideoIds.length : selectedImageIds.length;
    if (count === 0) return null;
    return (
      <AlertDialog>
        <AlertDialogTrigger
          render={
            <Button
              variant="outline"
              size="sm"
              disabled={deletingSelected !== null}
              className="rounded-lg text-destructive hover:text-destructive"
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              {deletingSelected === kind ? "Removing…" : `Delete selected (${count})`}
            </Button>
          }
        />
        <AlertDialogContent className="rounded-2xl sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove {count} selected {kind === "videos" ? "video(s)" : "image(s)"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              They stop playing on {branch?.name ?? "this branch"}&apos;s TV immediately. Other
              branches and the stored files are untouched.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-destructive text-white hover:bg-destructive/90"
              onClick={() => void deleteSelectedMedia(kind)}
            >
              Remove {count}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

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
              They stop playing on this branch&apos;s TV immediately. Files stay in storage so you
              can use <strong>Restore</strong> to bring them back.
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
        {/* The TV screen FLOATS on the right (xl): option cards narrow beside
            it and expand to FULL WIDTH below it — no blank side column (client
            2026-08-04). Cards establish their own formatting context
            (overflow-hidden), so they wrap around the float cleanly. */}
        {branch ? (
          <div className="hidden xl:block xl:float-right xl:mb-5 xl:ml-6 xl:w-[44%] space-y-3">
              <Label>Live TV preview — {branch.name}</Label>
              {showLivePreview ? (
                <LiveTvPreview
                  branchCode={branch.code}
                  draft={null}
                  label={`Live display preview for ${branch.name}`}
                />
              ) : (
                <div className="flex aspect-video items-center justify-center rounded-2xl border border-border/40 bg-muted/20 text-sm text-muted-foreground">
                  Loading preview…
                </div>
              )}
              {/* The apply-to options live BELOW the screen on wide layouts —
                  one control for both the video and image panels (they share
                  the same target state); the in-panel copies show below xl. */}
              {canApplyToAll ? (
                <ApplyToAllCheckbox
                  id="media-apply-sideways"
                  scope={targetScope}
                  selectedBranchIds={selectedBranchIds}
                  branches={branches}
                  currentBranchId={effectiveBranchId}
                  onScopeChange={(sel) => {
                    setTargetScope(sel.scope);
                    setSelectedBranchIds(sel.selectedBranchIds);
                  }}
                />
              ) : null}
          </div>
        ) : null}
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

        {totalStorageBytes !== null || realStorage !== null || usedBytes > 0
          ? (() => {
              const used = displayedStorageBytes;
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
                        Storage — {formatStorage(used)} occupied
                        <span className="font-normal text-muted-foreground">
                          {" "}
                          of 10 GB R2 capacity (videos + images)
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {realStorage
                          ? `Total in the R2 bucket to date: ${formatStorage(realStorage.bytes)} across ${realStorage.objects} files · ${freeGb} GB remaining.`
                          : `Loading live R2 bucket total… ${freeGb} GB of 10 GB remaining (estimated).`}
                        {usedBytes > 0
                          ? ` This branch’s listed media: ${formatStorage(usedBytes)}.`
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
                  {full ? (
                    <p className="mt-3 text-xs font-medium text-red-600 dark:text-red-400">
                      R2 capacity is full. Remove old videos or images to free space.
                    </p>
                  ) : almostFull ? (
                    <p className="mt-3 text-xs font-medium text-amber-600 dark:text-amber-400">
                      Almost full — only {freeGb} GB left of the 10 GB R2 capacity. Remove old
                      videos/images to free space.
                    </p>
                  ) : null}
                </div>
              );
            })()
          : null}

        <Alert className="rounded-xl border-emerald-500/25 bg-emerald-500/5">
          <AlertDescription className="text-sm leading-relaxed">
            <strong className="text-foreground">Recommended: MP4 (H.264), under 80 MB</strong> — works on every TV
            browser. Larger files need Cloudflare R2; pasting a direct link is still the fastest option.
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
                id="video-apply-all"
                className="mb-4 xl:hidden"
                scope={targetScope}
                selectedBranchIds={selectedBranchIds}
                branches={branches}
                currentBranchId={effectiveBranchId}
                onScopeChange={(sel) => {
                  setTargetScope(sel.scope);
                  setSelectedBranchIds(sel.selectedBranchIds);
                }}
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
                  onClick={() =>
                    uploadAccess.guard(() => {
                      if (canApplyToAll) setUploadDestOpen("video");
                      else void handleUpload(new Set());
                    })
                  }
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
                  cell: (v) =>
                    !v.downloadUrl?.trim() ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <video
                          src={v.downloadUrl}
                          muted
                          playsInline
                          preload="metadata"
                          className="h-10 w-16 shrink-0 rounded-md border border-border/40 bg-muted object-contain"
                        />
                        <button
                          type="button"
                          className="text-sm text-primary underline-offset-4 hover:underline"
                          onClick={() => void openHttpMediaInNewTab(v.downloadUrl, v.storagePath)}
                        >
                          Open
                        </button>
                      </div>
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
                id="image-advert-apply-all"
                className="mb-4 xl:hidden"
                scope={targetScope}
                selectedBranchIds={selectedBranchIds}
                branches={branches}
                currentBranchId={effectiveBranchId}
                onScopeChange={(sel) => {
                  setTargetScope(sel.scope);
                  setSelectedBranchIds(sel.selectedBranchIds);
                }}
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
                  onClick={() =>
                    uploadAccess.guard(() => {
                      if (canApplyToAll) setUploadDestOpen("image");
                      else void handleImageUpload(new Set());
                    })
                  }
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

        {canApplyToAll && effectiveBranchId ? (
          <ContentPanel
            title="Restore images & videos"
            description="Bring back soft-deleted Media Manager files on every branch, then copy this branch’s active playlist onto the others (add-only — nothing is wiped)."
          >
            <div className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                className="rounded-xl"
                disabled={purgingBroken || restoringMedia || !actor}
                onClick={() => void handlePurgeBrokenMedia()}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {purgingBroken ? "Checking files…" : "Remove broken files (404)"}
              </Button>
              <AlertDialog>
                <AlertDialogTrigger
                  render={
                    <Button
                      variant="outline"
                      className="rounded-xl"
                      disabled={restoringMedia || !actor}
                    >
                      <RotateCcw className="mr-2 h-4 w-4" />
                      {restoringMedia ? "Restoring…" : "Restore on this branch"}
                    </Button>
                  }
                />
                <AlertDialogContent className="rounded-2xl sm:max-w-md">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Restore removed media on this branch?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Reactivates soft-deleted videos and images that still have their files. Nothing
                      already playing is removed.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="rounded-xl"
                      onClick={() => void handleRestoreMedia("branch")}
                    >
                      Restore this branch
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <AlertDialog>
                <AlertDialogTrigger
                  render={
                    <Button className="rounded-xl" disabled={restoringMedia || !actor}>
                      <RotateCcw className="mr-2 h-4 w-4" />
                      {restoringMedia ? "Restoring…" : "Restore on every branch"}
                    </Button>
                  }
                />
                <AlertDialogContent className="rounded-2xl sm:max-w-md">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Restore media on every branch?</AlertDialogTitle>
                    <AlertDialogDescription>
                      1) Reactivates soft-deleted videos/images on every active branch when the file is
                      still there. 2) Adds this branch’s current playlist onto the other branches
                      without replacing what they already have. Rate-card promotions are not changed.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="rounded-xl"
                      onClick={() => void handleRestoreMedia("all")}
                    >
                      Restore every branch
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </ContentPanel>
        ) : null}

        {canApplyToAll && effectiveBranchId && videos.length + images.length > 0 ? (
          <ContentPanel
            title="Push this playlist to all branches"
            description={`Copy what “${branch?.name ?? "this branch"}” already plays onto every other active branch. Choose videos only, images only, or both. Files already on a branch are skipped — nothing is duplicated or removed.`}
          >
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Ready:{" "}
                <strong className="text-foreground">
                  {videos.filter((v) => v.status === "active" && v.sourceType !== "chunked").length} video(s)
                </strong>
                {" · "}
                <strong className="text-foreground">
                  {images.filter((img) => img.status === "active").length} image(s)
                </strong>
                {" → "}
                <strong className="text-foreground">
                  {branches.filter((b) => b.status === "active" && b.id !== effectiveBranchId).length} other
                  branch(es)
                </strong>
                . Extra media that only exists on another branch stays there. Chunked (Firestore-only)
                videos stay on this branch.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <AlertDialog>
                  <AlertDialogTrigger
                    render={
                      <Button
                        className="rounded-xl"
                        disabled={pushingPlaylist !== null || !actor || videos.length === 0}
                      >
                        <Share2 className="mr-2 h-4 w-4" />
                        {pushingPlaylist === "videos" ? "Copying videos…" : "Apply videos to all branches"}
                      </Button>
                    }
                  />
                  <AlertDialogContent className="rounded-2xl sm:max-w-md">
                    <AlertDialogHeader>
                      <AlertDialogTitle>Apply videos to all branches?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Adds videos from “{branch?.name ?? "this branch"}” onto every other active
                        branch when they are not already there. Images are not changed. Existing
                        unique media is never removed.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        className="rounded-xl"
                        onClick={() => void handlePushPlaylistToAll("videos")}
                      >
                        Apply videos
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <AlertDialog>
                  <AlertDialogTrigger
                    render={
                      <Button
                        className="rounded-xl"
                        variant="secondary"
                        disabled={pushingPlaylist !== null || !actor || images.length === 0}
                      >
                        <Share2 className="mr-2 h-4 w-4" />
                        {pushingPlaylist === "images" ? "Copying images…" : "Apply images to all branches"}
                      </Button>
                    }
                  />
                  <AlertDialogContent className="rounded-2xl sm:max-w-md">
                    <AlertDialogHeader>
                      <AlertDialogTitle>Apply images to all branches?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Adds image adverts from “{branch?.name ?? "this branch"}” onto every other
                        active branch when they are not already there. Videos are not changed.
                        Existing unique media is never removed.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        className="rounded-xl"
                        onClick={() => void handlePushPlaylistToAll("images")}
                      >
                        Apply images
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <AlertDialog>
                  <AlertDialogTrigger
                    render={
                      <Button
                        className="rounded-xl"
                        variant="outline"
                        disabled={pushingPlaylist !== null || !actor}
                      >
                        <Share2 className="mr-2 h-4 w-4" />
                        {pushingPlaylist === "all" ? "Copying…" : "Apply videos + images"}
                      </Button>
                    }
                  />
                  <AlertDialogContent className="rounded-2xl sm:max-w-md">
                    <AlertDialogHeader>
                      <AlertDialogTitle>Apply videos + images to all branches?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Adds both videos and images from “{branch?.name ?? "this branch"}” onto every
                        other active branch when they are not already there. Existing unique media is
                        never removed.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        className="rounded-xl"
                        onClick={() => void handlePushPlaylistToAll("all")}
                      >
                        Apply both
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
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
              <div className="mb-3 flex flex-wrap justify-end gap-2">
                {deleteSelectedButton("videos")}
                {removeAllButton("videos", videos.length)}
              </div>
            ) : null}
            <SortableDataTable
              data={videos}
              keyExtractor={(v) => v.id}
              mobileTitle={(v) => v.title}
              onReorder={(ordered) => void reorderVideosList(ordered)}
              reorderDisabled={!canManageVideos}
              columns={[
                {
                  key: "select",
                  header: (
                    <input
                      type="checkbox"
                      aria-label="Select all videos"
                      className="h-3.5 w-3.5 cursor-pointer"
                      checked={videos.length > 0 && selectedVideoIds.length === videos.length}
                      onChange={(e) =>
                        setSelectedVideoIds(e.target.checked ? videos.map((x) => x.id) : [])
                      }
                    />
                  ),
                  cell: (v) => (
                    <input
                      type="checkbox"
                      aria-label={`Select ${v.title}`}
                      className="h-3.5 w-3.5 cursor-pointer"
                      checked={selectedVideoIds.includes(v.id)}
                      onChange={() => setSelectedVideoIds(toggleId(selectedVideoIds, v.id))}
                    />
                  ),
                },
                { key: "title", header: "Title", cell: (v) => renameableTitle("video", v.id, v.title) },
                // Source column hidden (client 2026-08-05) — every video is
                // cloud-hosted anyway, so the chip carried no information.
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
                    v.sourceType === "chunked" || !v.downloadUrl?.trim() ? (
                      <span className="text-xs text-muted-foreground">Plays on display</span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <video
                          src={v.downloadUrl}
                          muted
                          playsInline
                          preload="metadata"
                          className="h-10 w-16 shrink-0 rounded-md border border-border/40 bg-muted object-contain"
                        />
                        <button
                          type="button"
                          className="text-sm text-primary underline-offset-4 hover:underline"
                          onClick={() => void openHttpMediaInNewTab(v.downloadUrl, v.storagePath)}
                        >
                          Open
                        </button>
                      </div>
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
          <ContentPanel
            title="Active Image Adverts"
            description="Drag the ⠿ handle to set order, or use ▲ ▼ as a fallback. These images play on THIS branch’s TV only until you copy the playlist to other branches."
          >
            {canManageImages ? (
              <div className="mb-3 flex flex-wrap justify-end gap-2">
                {deleteSelectedButton("images")}
                {removeAllButton("images", images.length)}
              </div>
            ) : null}
            {canApplyToAll ? (
              <div className="mb-4 space-y-3 rounded-xl border border-primary/40 bg-primary/10 p-3">
                <p className="text-sm font-medium text-foreground">
                  Copy this branch’s media to every other branch
                </p>
                <p className="text-xs text-muted-foreground">
                  The “Set seconds…” button below only changes how long each image stays on screen on{" "}
                  <strong>this</strong> branch. Use the buttons below to add videos and/or images to
                  other branches. Files already present are skipped — no duplicates.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <AlertDialog>
                    <AlertDialogTrigger
                      render={
                        <Button
                          size="sm"
                          className="rounded-lg"
                          disabled={pushingPlaylist !== null || !actor || videos.length === 0}
                        >
                          <Share2 className="mr-2 h-3.5 w-3.5" />
                          {pushingPlaylist === "videos" ? "Copying videos…" : "Apply videos"}
                        </Button>
                      }
                    />
                    <AlertDialogContent className="rounded-2xl sm:max-w-md">
                      <AlertDialogHeader>
                        <AlertDialogTitle>Apply videos to all branches?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Adds videos from “{branch?.name ?? "this branch"}” onto every other active
                          branch when they are not already there. Images are not changed.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className="rounded-xl"
                          onClick={() => void handlePushPlaylistToAll("videos")}
                        >
                          Apply videos
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                  <AlertDialog>
                    <AlertDialogTrigger
                      render={
                        <Button
                          size="sm"
                          variant="secondary"
                          className="rounded-lg"
                          disabled={pushingPlaylist !== null || !actor || images.length === 0}
                        >
                          <Share2 className="mr-2 h-3.5 w-3.5" />
                          {pushingPlaylist === "images" ? "Copying images…" : "Apply images"}
                        </Button>
                      }
                    />
                    <AlertDialogContent className="rounded-2xl sm:max-w-md">
                      <AlertDialogHeader>
                        <AlertDialogTitle>Apply images to all branches?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Adds images from “{branch?.name ?? "this branch"}” onto every other active
                          branch when they are not already there. Videos are not changed.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className="rounded-xl"
                          onClick={() => void handlePushPlaylistToAll("images")}
                        >
                          Apply images
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                  <AlertDialog>
                    <AlertDialogTrigger
                      render={
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-lg"
                          disabled={pushingPlaylist !== null || !actor}
                        >
                          <Share2 className="mr-2 h-3.5 w-3.5" />
                          {pushingPlaylist === "all" ? "Copying…" : "Apply videos + images"}
                        </Button>
                      }
                    />
                    <AlertDialogContent className="rounded-2xl sm:max-w-md">
                      <AlertDialogHeader>
                        <AlertDialogTitle>Apply videos + images to all branches?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Adds videos and images from “{branch?.name ?? "this branch"}” onto every
                          other active branch when those files are not already there. Unique media
                          already on other branches is never removed.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className="rounded-xl"
                          onClick={() => void handlePushPlaylistToAll("all")}
                        >
                          Apply both
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            ) : null}
            {/* Change every image duration on THIS branch only — does not sync to other branches. */}
            {images.length > 1 ? (
              <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-border/40 bg-muted/20 p-3">
                <Label className="text-sm">Seconds for ALL {images.length} images on this branch:</Label>
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
                        toast.success(
                          `All ${images.length} images on this branch now show for ${v} seconds each (other branches unchanged)`,
                        );
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : "Could not update every image");
                      } finally {
                        setBulkApplying(false);
                      }
                    });
                  }}
                >
                  {bulkApplying ? "Updating…" : "Set seconds on all images"}
                </Button>
                <span className="text-xs text-muted-foreground">
                  Duration only — does not copy media to other branches.
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
                {
                  key: "select",
                  header: (
                    <input
                      type="checkbox"
                      aria-label="Select all images"
                      className="h-3.5 w-3.5 cursor-pointer"
                      checked={images.length > 0 && selectedImageIds.length === images.length}
                      onChange={(e) =>
                        setSelectedImageIds(e.target.checked ? images.map((x) => x.id) : [])
                      }
                    />
                  ),
                  cell: (img) => (
                    <input
                      type="checkbox"
                      aria-label={`Select ${img.title}`}
                      className="h-3.5 w-3.5 cursor-pointer"
                      checked={selectedImageIds.includes(img.id)}
                      onChange={() => setSelectedImageIds(toggleId(selectedImageIds, img.id))}
                    />
                  ),
                },
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
                  cell: (img) => (
                    <div className="flex items-center gap-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={img.downloadUrl}
                        alt={img.title}
                        className="h-10 w-16 shrink-0 rounded-md border border-border/40 bg-muted object-contain"
                      />
                      <button
                        type="button"
                        className="text-sm text-primary underline-offset-4 hover:underline"
                        onClick={() => void openImageInNewTab(img.downloadUrl, img.storagePath)}
                      >
                        Open
                      </button>
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

      {effectiveBranchId && uploadDestOpen === "video" ? (
        <UploadDestinationDialog
          open
          kind="video"
          fileLabels={
            videoFiles.length > 0
              ? videoFiles.map((f, i) => videoFileTitles[i]?.trim() || deriveTitleFromFile(f))
              : file
                ? [resolveVideoTitle(title, deriveTitleFromFile(file))]
                : []
          }
          fileSizes={
            videoFiles.length > 0 ? videoFiles.map((f) => f.size) : file ? [file.size] : []
          }
          branches={branches}
          currentBranchId={effectiveBranchId}
          canChooseBranches={canApplyToAll}
          initialScope={targetScope}
          initialSelectedBranchIds={selectedBranchIds}
          onOpenChange={(open) => {
            if (!open) setUploadDestOpen(null);
          }}
          onConfirm={({ scope, selectedBranchIds: ids, skipKeys }) => {
            setTargetScope(scope);
            setSelectedBranchIds(ids);
            setUploadSkipKeys(skipKeys);
            void handleUpload(skipKeys);
          }}
        />
      ) : null}

      {effectiveBranchId && uploadDestOpen === "image" ? (
        <UploadDestinationDialog
          open
          kind="image"
          fileLabels={
            (imageFiles.length > 0 ? imageFiles : imageFile ? [imageFile] : []).map(
              (f, i) =>
                imageFileTitles[i]?.trim() || f.name.replace(/\.[^.]+$/, "") || f.name,
            )
          }
          fileSizes={(imageFiles.length > 0 ? imageFiles : imageFile ? [imageFile] : []).map(
            (f) => f.size,
          )}
          branches={branches}
          currentBranchId={effectiveBranchId}
          canChooseBranches={canApplyToAll}
          initialScope={targetScope}
          initialSelectedBranchIds={selectedBranchIds}
          onOpenChange={(open) => {
            if (!open) setUploadDestOpen(null);
          }}
          onConfirm={({ scope, selectedBranchIds: ids, skipKeys }) => {
            setTargetScope(scope);
            setSelectedBranchIds(ids);
            setUploadSkipKeys(skipKeys);
            void handleImageUpload(skipKeys);
          }}
        />
      ) : null}
    </>
  );
}
