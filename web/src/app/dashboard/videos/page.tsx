"use client";

import { useEffect, useState } from "react";
import { Cloud, Link2, Upload, Video, Trash2, ImageIcon } from "lucide-react";
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
import { useAuth } from "@/contexts/auth-context";
import { useBranchScope, useContentPermissions } from "@/lib/hooks/use-branch-scope";
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
import { MAX_VIDEO_UPLOAD_BYTES, MAX_CHUNKED_VIDEO_BYTES, RECOMMENDED_VIDEO_FORMATS, WARN_LARGE_VIDEO_BYTES } from "@/lib/constants";
import { PreviewDisplayLink } from "@/components/shared/preview-display-link";
import { Badge } from "@/components/ui/badge";
import {
  approveVideo,
  CHUNKED_UPLOAD_WARNING,
  deleteVideo,
  isR2UploadConfigured,
  proposeExternalVideo,
  rejectVideo,
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
import { getDocument } from "@/lib/firebase/firestore";
import { COLLECTIONS } from "@/lib/constants";
import {
  deleteImageAdvert,
  subscribeImageAdverts,
  uploadImageAdvert,
} from "@/lib/services/image-advert-service";
import {
  deriveTitleFromFile,
  deriveTitleFromUrl,
  isGoogleDriveUrl,
  resolveVideoTitle,
  validateVideoFile,
} from "@/lib/video-utils";
import type { ImageAdvert, VideoAsset } from "@/lib/types";

export default function VideosPage() {
  const { user, profile } = useAuth();
  const { branches, effectiveBranchId, setSelectedBranchId, isSuperAdmin, isAdmin } = useBranchScope();
  const { canManageVideos, canManageImages, canProposeVideos } = useContentPermissions();
  const [videos, setVideos] = useState<VideoAsset[]>([]);
  const [pendingVideos, setPendingVideos] = useState<VideoAsset[]>([]);
  const [images, setImages] = useState<ImageAdvert[]>([]);
  const [proposeUrl, setProposeUrl] = useState("");
  const [proposing, setProposing] = useState(false);
  const [title, setTitle] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [driveUrl, setDriveUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageDuration, setImageDuration] = useState(15);
  const [imageUploading, setImageUploading] = useState(false);
  const [applyToAll, setApplyToAll] = useState(false);

  const branch = branches.find((b) => b.id === effectiveBranchId);
  const canApplyToAll = (isSuperAdmin || isAdmin) && branches.filter((b) => b.status === "active").length > 1;
  const actor = user && profile ? { userId: user.uid, userName: profile.displayName || profile.email } : null;
  const { notice, onError, clearNotice } = useFirestoreNotice("videos and images");

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

  async function handleUpload() {
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

    const resolvedTitle = resolveVideoTitle(title, deriveTitleFromFile(file));
    setUploading(true);
    setProgress(1);
    try {
      const { id: videoId, usedChunkFallback } = await uploadVideo(
        file,
        { title: resolvedTitle, branchId: effectiveBranchId, createdBy: user.uid },
        { userId: user.uid, userName: profile.displayName || profile.email },
        setProgress,
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
          : "Image advert saved — shows on display when no video is playing",
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
    if (!user || !profile || !effectiveBranchId || !imageFile) {
      toast.error("Select an image file");
      return;
    }
    setImageUploading(true);
    try {
      await uploadImageAdvert(
        {
          title: title.trim() || imageFile.name,
          branchId: effectiveBranchId,
          file: imageFile,
          displayDurationSeconds: imageDuration,
          createdBy: user.uid,
        },
        { userId: user.uid, userName: profile.displayName || profile.email },
      );
      toast.success("Image uploaded — shows on display when no video is playing");
      setImageFile(null);
      setTitle("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to upload image");
    } finally {
      setImageUploading(false);
    }
  }

  return (
    <>
      <DashboardHeader
        title="Videos"
        description="Add a promo video for your shop display. Pasting a direct video link is the fastest, most reliable option."
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

        <Alert className="rounded-xl border-emerald-500/25 bg-emerald-500/5">
          <AlertDescription className="text-sm leading-relaxed">
            <strong className="text-foreground">Recommended: MP4 (H.264), max 50 MB</strong> — works on every TV
            browser. For large files, paste a direct link instead of uploading.
            <span className="mt-1 block text-xs text-muted-foreground">{RECOMMENDED_VIDEO_FORMATS.join(" · ")}</span>
          </AlertDescription>
        </Alert>

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
                  onClick={() => void handleExternalAdd()}
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
                    accept="video/mp4,video/webm,video/quicktime,.mp4,.mov,.webm"
                    onChange={(e) => {
                      const selected = e.target.files?.[0] ?? null;
                      setFile(selected);
                      if (selected && !title.trim()) {
                        setTitle(deriveTitleFromFile(selected));
                      }
                    }}
                    className="rounded-xl"
                  />
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
                  onClick={() => void handleUpload()}
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
                  onClick={() => void handleDriveAdd()}
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
          <ContentPanel title="Image Adverts" description="Static images rotate on the display when no video is playing">
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
                  onClick={() => void handleImageUrlAdd()}
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
                    onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
                    className="rounded-xl"
                  />
                </div>
                <Button
                  onClick={() => void handleImageUpload()}
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
            description="The most recent active video plays on the display (no playlist required)"
          >
            <DataTable
              data={videos}
              keyExtractor={(v) => v.id}
              mobileTitle={(v) => v.title}
              columns={[
                { key: "title", header: "Title", cell: (v) => <span className="font-medium">{v.title}</span> },
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
                    ) : null,
                },
              ]}
            />
          </ContentPanel>
        )}

        {images.length > 0 ? (
          <ContentPanel title="Active Image Adverts" description="Shown on display when video is unavailable">
            <DataTable
              data={images}
              keyExtractor={(img) => img.id}
              mobileTitle={(img) => img.title}
              columns={[
                { key: "title", header: "Title", cell: (img) => img.title },
                {
                  key: "duration",
                  header: "Duration",
                  cell: (img) => `${img.displayDurationSeconds}s`,
                  hideOnMobile: true,
                },
                {
                  key: "preview",
                  header: "Preview",
                  cell: (img) => (
                    <a
                      className="text-sm text-primary underline-offset-4 hover:underline"
                      href={img.downloadUrl}
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
                  cell: (img) =>
                    canManageImages ? (
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
