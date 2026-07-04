"use client";

import { useEffect, useState } from "react";
import { Cloud, Link2, Upload, Video, Trash2, ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { DashboardHeader } from "@/components/layout/dashboard-sidebar";
import { BranchSelector } from "@/components/shared/branch-selector";
import {
  ContentPanel,
  DataTable,
  EmptyState,
  PageShell,
  StatusBadge,
} from "@/components/shared/page-elements";
import { useAuth } from "@/contexts/auth-context";
import { useBranchScope, useContentPermissions } from "@/lib/hooks/use-branch-scope";
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
import { DEMO_VIDEO_URL } from "@/lib/demo-content";
import {
  addExternalVideo,
  deleteVideo,
  STORAGE_UNAVAILABLE_MESSAGE,
  STORAGE_SETUP_URL,
  subscribeVideos,
  uploadVideo,
} from "@/lib/services/video-service";
import {
  addImageAdvertUrl,
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
  const { canManageVideos, canManageImages } = useContentPermissions();
  const [videos, setVideos] = useState<VideoAsset[]>([]);
  const [images, setImages] = useState<ImageAdvert[]>([]);
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

  const branch = branches.find((b) => b.id === effectiveBranchId);

  useEffect(() => {
    if (!effectiveBranchId) return;
    const unsubVideos = subscribeVideos(
      effectiveBranchId,
      setVideos,
      (error) => toast.error(error.message || "Failed to load videos"),
    );
    const unsubImages = subscribeImageAdverts(
      effectiveBranchId,
      setImages,
      (error) => toast.error(error.message || "Failed to load images"),
    );
    return () => {
      unsubVideos();
      unsubImages();
    };
  }, [effectiveBranchId]);

  async function handleExternalAdd() {
    if (!user || !profile || !effectiveBranchId || !externalUrl.trim()) {
      toast.error("Video URL is required");
      return;
    }
    const resolvedTitle = resolveVideoTitle(title, deriveTitleFromUrl(externalUrl));
    try {
      const result = await addExternalVideo(
        {
          title: resolvedTitle,
          branchId: effectiveBranchId,
          downloadUrl: externalUrl.trim(),
          createdBy: user.uid,
        },
        { userId: user.uid, userName: profile.displayName || profile.email },
      );
      if (result.source === "google_drive") {
        toast.success("Google Drive link converted and saved", {
          description: "If playback fails on the display, try a direct MP4 URL or file upload.",
          duration: 8000,
        });
      } else {
        toast.success("Video linked — display will play it automatically");
      }
      setTitle("");
      setExternalUrl("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to link video");
    }
  }

  async function handleDriveAdd() {
    if (!user || !profile || !effectiveBranchId || !driveUrl.trim()) {
      toast.error("Google Drive share link is required");
      return;
    }
    if (!isGoogleDriveUrl(driveUrl)) {
      toast.error("Paste a Google Drive share link (drive.google.com/file/d/…)");
      return;
    }
    const resolvedTitle = resolveVideoTitle(title, "Google Drive video");
    try {
      await addExternalVideo(
        {
          title: resolvedTitle,
          branchId: effectiveBranchId,
          downloadUrl: driveUrl.trim(),
          createdBy: user.uid,
        },
        { userId: user.uid, userName: profile.displayName || profile.email },
      );
      toast.success("Google Drive link converted and saved", {
        description: "If playback fails on the display, try a direct MP4 URL or file upload.",
        duration: 8000,
      });
      setTitle("");
      setDriveUrl("");
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
    setProgress(0);
    try {
      await uploadVideo(
        file,
        { title: resolvedTitle, branchId: effectiveBranchId, createdBy: user.uid },
        { userId: user.uid, userName: profile.displayName || profile.email },
        setProgress,
      );
      toast.success("Video uploaded — it will appear on the display shortly");
      setTitle("");
      setFile(null);
      setProgress(0);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed";
      toast.error(message, { duration: 8000 });
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }

  async function handleImageUrlAdd() {
    if (!user || !profile || !effectiveBranchId || !imageUrl.trim()) {
      toast.error("Image URL is required");
      return;
    }
    setImageUploading(true);
    try {
      await addImageAdvertUrl(
        {
          title: title.trim() || "Image advert",
          branchId: effectiveBranchId,
          downloadUrl: imageUrl.trim(),
          displayDurationSeconds: imageDuration,
          createdBy: user.uid,
        },
        { userId: user.uid, userName: profile.displayName || profile.email },
      );
      toast.success("Image advert saved — shows on display when no video is playing");
      setImageUrl("");
      setTitle("");
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
        description="Add branch signage videos by URL, Google Drive, or file upload. The newest active video plays on the display."
        accent="rose"
      />
      <PageShell accent="rose">
        {isSuperAdmin || isAdmin ? (
          <BranchSelector branches={branches} value={effectiveBranchId} onChange={setSelectedBranchId} />
        ) : branch ? (
          <p className="text-sm text-muted-foreground">
            Managing videos for: <strong>{branch.name}</strong>
          </p>
        ) : null}

        <PreviewDisplayLink branchCode={branch?.code} />

        <Alert className="rounded-xl border-border/40 bg-card/50">
          <AlertDescription className="text-sm leading-relaxed">
            <strong className="text-foreground">Best format: MP4 (H.264)</strong> — works on all displays.
            WebM and MOV are also accepted. Paste a direct URL for instant setup, or upload a file (Firebase
            Storage when enabled, otherwise Firestore chunk storage up to{" "}
            {MAX_CHUNKED_VIDEO_BYTES / (1024 * 1024)} MB).
            <span className="mt-1 block text-xs text-muted-foreground">{RECOMMENDED_VIDEO_FORMATS.join(" · ")}</span>
          </AlertDescription>
        </Alert>

        {canManageVideos && effectiveBranchId ? (
          <ContentPanel title="Add Video" description="Choose the fastest option for your video source">
            <Tabs defaultValue="external">
              <TabsList className="rounded-xl">
                <TabsTrigger value="external" className="rounded-lg">Direct URL</TabsTrigger>
                <TabsTrigger value="drive" className="rounded-lg">Google Drive</TabsTrigger>
                <TabsTrigger value="upload" className="rounded-lg">File Upload</TabsTrigger>
              </TabsList>
              <TabsContent value="external" className="mt-4 space-y-4">
                <p className="text-sm text-muted-foreground">
                  Paste a direct MP4/WebM link — works instantly without Firebase Storage.
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
                    placeholder={DEMO_VIDEO_URL}
                    className="rounded-xl"
                  />
                </div>
                <Button
                  onClick={() => void handleExternalAdd()}
                  disabled={!externalUrl.trim()}
                  className="rounded-xl"
                >
                  <Link2 className="mr-2 h-4 w-4" />
                  Add Video URL
                </Button>
              </TabsContent>
              <TabsContent value="drive" className="mt-4 space-y-4">
                <Alert className="rounded-xl border-amber-500/30 bg-amber-500/5">
                  <Cloud className="h-4 w-4 text-amber-600" />
                  <AlertDescription className="text-sm">
                    Paste a Google Drive share link — we&apos;ll convert it automatically. Google may block playback in
                    some browsers (CORS). For reliable signage, prefer a direct MP4 URL or file upload.
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
              <TabsContent value="upload" className="mt-4 space-y-4">
                <Alert className="rounded-xl border-border/40 bg-muted/20">
                  <AlertDescription className="text-sm">
                    Upload tries <strong>Firebase Storage</strong> first. If Storage is not enabled, files up to{" "}
                    {MAX_CHUNKED_VIDEO_BYTES / (1024 * 1024)} MB are stored via Firestore chunks automatically.
                    Enable Storage in the{" "}
                    <a
                      href={STORAGE_SETUP_URL}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      Firebase console
                    </a>{" "}
                    (requires Blaze billing) for larger uploads up to {MAX_VIDEO_UPLOAD_BYTES / (1024 * 1024)} MB.
                  </AlertDescription>
                </Alert>
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
                  <Label>File (MP4, MOV, or WebM — max {MAX_VIDEO_UPLOAD_BYTES / (1024 * 1024)}MB)</Label>
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
                          Large file — compress to under 50 MB for faster uploads and better display performance.
                        </span>
                      ) : null}
                    </p>
                  ) : null}
                </div>
                {uploading ? <Progress value={progress} className="h-2" /> : null}
                <Button
                  disabled={uploading || !file}
                  onClick={() => void handleUpload()}
                  className="rounded-xl"
                >
                  <Upload className="mr-2 h-4 w-4" />
                  {uploading ? `Uploading ${Math.round(progress)}%` : "Upload Video"}
                </Button>
                <p className="text-xs text-muted-foreground">{STORAGE_UNAVAILABLE_MESSAGE}</p>
              </TabsContent>
            </Tabs>
          </ContentPanel>
        ) : null}

        {canManageImages && effectiveBranchId ? (
          <ContentPanel title="Image Adverts" description="Static images rotate on the display when no video is playing">
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
