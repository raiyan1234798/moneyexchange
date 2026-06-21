"use client";

import { useEffect, useState } from "react";
import { Link2, Upload, Video, Trash2 } from "lucide-react";
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
import { MAX_VIDEO_UPLOAD_BYTES, RECOMMENDED_VIDEO_FORMATS } from "@/lib/constants";
import { addExternalVideo, deleteVideo, subscribeVideos, uploadVideo } from "@/lib/services/video-service";
import type { VideoAsset } from "@/lib/types";

export default function VideosPage() {
  const { user, profile } = useAuth();
  const { branches, effectiveBranchId, setSelectedBranchId, isSuperAdmin } = useBranchScope();
  const { canManageVideos } = useContentPermissions();
  const [videos, setVideos] = useState<VideoAsset[]>([]);
  const [title, setTitle] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!effectiveBranchId) return;
    return subscribeVideos(effectiveBranchId, setVideos);
  }, [effectiveBranchId]);

  async function handleExternalAdd() {
    if (!user || !profile || !effectiveBranchId || !title || !externalUrl) return;
    await addExternalVideo(
      { title, branchId: effectiveBranchId, downloadUrl: externalUrl, createdBy: user.uid },
      { userId: user.uid, userName: profile.displayName || profile.email },
    );
    toast.success("External video linked");
    setTitle("");
    setExternalUrl("");
  }

  async function handleUpload() {
    if (!user || !profile || !effectiveBranchId || !file || !title) return;
    setUploading(true);
    try {
      await uploadVideo(
        file,
        { title, branchId: effectiveBranchId, createdBy: user.uid },
        { userId: user.uid, userName: profile.displayName || profile.email },
        setProgress,
      );
      toast.success("Video uploaded");
      setTitle("");
      setFile(null);
      setProgress(0);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <DashboardHeader
        title="Videos"
        description="Upload branch signage videos to Firebase Storage. Displays update in real time."
        accent="rose"
      />
      <PageShell accent="rose">
        {isSuperAdmin ? (
          <BranchSelector branches={branches} value={effectiveBranchId} onChange={setSelectedBranchId} />
        ) : null}

        <Alert className="rounded-xl border-border/40 bg-card/50">
          <AlertDescription className="text-sm leading-relaxed">
            <strong className="text-foreground">Primary upload:</strong> MP4, MOV, or WebM to Firebase Storage (up to{" "}
            {MAX_VIDEO_UPLOAD_BYTES / (1024 * 1024)}MB). Displays pick up new videos instantly.
            <span className="mt-1 block text-xs text-muted-foreground">{RECOMMENDED_VIDEO_FORMATS.join(" · ")}</span>
          </AlertDescription>
        </Alert>

        {canManageVideos && effectiveBranchId ? (
          <ContentPanel title="Add Video" description="Upload to Firebase Storage or link an external URL">
            <Tabs defaultValue="upload">
              <TabsList className="rounded-xl">
                <TabsTrigger value="upload" className="rounded-lg">Upload</TabsTrigger>
                <TabsTrigger value="external" className="rounded-lg">External URL</TabsTrigger>
              </TabsList>
              <TabsContent value="external" className="mt-4 space-y-4">
                <div className="space-y-2">
                  <Label>Title</Label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Promo video" className="rounded-xl" />
                </div>
                <div className="space-y-2">
                  <Label>Video URL (MP4/WebM)</Label>
                  <Input
                    value={externalUrl}
                    onChange={(e) => setExternalUrl(e.target.value)}
                    placeholder="https://cdn.example.com/signage/promo.webm"
                    className="rounded-xl"
                  />
                </div>
                <Button onClick={() => void handleExternalAdd()} disabled={!title || !externalUrl} className="rounded-xl">
                  <Link2 className="mr-2 h-4 w-4" />
                  Link External Video
                </Button>
              </TabsContent>
              <TabsContent value="upload" className="mt-4 space-y-4">
                <div className="space-y-2">
                  <Label>Title</Label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} className="rounded-xl" />
                </div>
                <div className="space-y-2">
                  <Label>File (MP4, MOV, or WebM — max {MAX_VIDEO_UPLOAD_BYTES / (1024 * 1024)}MB)</Label>
                  <Input
                    type="file"
                    accept="video/mp4,video/webm,video/quicktime"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    className="rounded-xl"
                  />
                </div>
                {uploading ? <Progress value={progress} className="h-2" /> : null}
                <Button disabled={uploading || !file || !title} onClick={() => void handleUpload()} className="rounded-xl">
                  <Upload className="mr-2 h-4 w-4" />
                  {uploading ? `Uploading ${progress}%` : "Upload to Firebase"}
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
            description="Upload a video to Firebase Storage to show on branch displays."
            icon={Video}
          />
        ) : (
          <ContentPanel title="Video Library" description={`${videos.length} video${videos.length === 1 ? "" : "s"} assigned`}>
            <DataTable
              data={videos}
              keyExtractor={(v) => v.id}
              mobileTitle={(v) => v.title}
              columns={[
                { key: "title", header: "Title", cell: (v) => <span className="font-medium">{v.title}</span> },
                {
                  key: "source",
                  header: "Source",
                  cell: (v) => <StatusBadge status={v.sourceType} variant={v.sourceType === "external" ? "info" : "neutral"} />,
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
                  cell: (v) => (
                    <a className="text-sm text-primary underline-offset-4 hover:underline" href={v.downloadUrl} target="_blank" rel="noreferrer">
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
                        <AlertDialogTrigger render={<Button variant="outline" size="sm" className="rounded-lg"><Trash2 className="mr-1 h-3 w-3" />Remove</Button>} />
                        <AlertDialogContent className="rounded-2xl">
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remove {v.title}?</AlertDialogTitle>
                            <AlertDialogDescription>This video will be removed from the branch library and TV playlists.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              className="rounded-xl"
                              onClick={() =>
                                void deleteVideo(v, {
                                  userId: user!.uid,
                                  userName: profile!.displayName || profile!.email,
                                }).then(() => toast.success("Video removed"))
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
      </PageShell>
    </>
  );
}
