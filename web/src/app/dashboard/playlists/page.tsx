"use client";

import { useEffect, useState } from "react";
import { Plus, ListVideo } from "lucide-react";
import { toast } from "sonner";
import { DashboardHeader } from "@/components/layout/dashboard-sidebar";
import { BranchSelector } from "@/components/shared/branch-selector";
import {
  ContentPanel,
  DataTable,
  EmptyState,
  PageActions,
  PageShell,
  StatusBadge,
} from "@/components/shared/page-elements";
import { useAuth } from "@/contexts/auth-context";
import { useBranchScope, useContentPermissions } from "@/lib/hooks/use-branch-scope";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { createPlaylist, subscribePlaylists } from "@/lib/services/playlist-service";
import { subscribeVideos } from "@/lib/services/video-service";
import type { VideoAsset, VideoPlaylist } from "@/lib/types";

export default function PlaylistsPage() {
  const { user, profile } = useAuth();
  const { branches, effectiveBranchId, setSelectedBranchId, isSuperAdmin } = useBranchScope();
  const { canManagePlaylists } = useContentPermissions();
  const [playlists, setPlaylists] = useState<VideoPlaylist[]>([]);
  const [videos, setVideos] = useState<VideoAsset[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [loop, setLoop] = useState(true);
  const [selectedVideoIds, setSelectedVideoIds] = useState<string[]>([]);

  useEffect(() => {
    if (!effectiveBranchId) return;
    const unsubPlaylists = subscribePlaylists(effectiveBranchId, setPlaylists);
    const unsubVideos = subscribeVideos(effectiveBranchId, setVideos);
    return () => {
      unsubPlaylists();
      unsubVideos();
    };
  }, [effectiveBranchId]);

  async function handleCreate() {
    if (!user || !profile || !effectiveBranchId || !name) return;
    await createPlaylist(
      {
        name,
        branchId: effectiveBranchId,
        videoIds: selectedVideoIds,
        loop,
        autoSwitch: true,
        status: "active",
        createdBy: user.uid,
      },
      { userId: user.uid, userName: profile.displayName || profile.email },
    );
    toast.success("Playlist created — display will play these videos");
    setOpen(false);
    setName("");
    setSelectedVideoIds([]);
  }

  function toggleVideo(id: string) {
    setSelectedVideoIds((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
  }

  return (
    <>
      <DashboardHeader title="Playlists" description="Assign video rotation per branch for browser displays." accent="violet" />
      <PageShell accent="violet">
        {isSuperAdmin ? (
          <BranchSelector branches={branches} value={effectiveBranchId} onChange={setSelectedBranchId} />
        ) : null}

        {canManagePlaylists && effectiveBranchId ? (
          <PageActions>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger render={<Button className="rounded-xl"><Plus className="mr-2 h-4 w-4" />Create Playlist</Button>} />
              <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Create Branch Playlist</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <Label>Playlist Name</Label>
                    <Input value={name} onChange={(e) => setName(e.target.value)} className="rounded-xl" />
                  </div>
                  <div className="flex items-center gap-3 rounded-xl border border-border/30 p-3">
                    <Switch checked={loop} onCheckedChange={setLoop} />
                    <Label>Loop videos continuously</Label>
                  </div>
                  <div className="space-y-2">
                    <Label>Select Videos ({selectedVideoIds.length} selected)</Label>
                    {videos.length === 0 ? (
                      <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">Add videos first in the Videos section</p>
                    ) : (
                      <div className="max-h-48 space-y-2 overflow-y-auto">
                        {videos.map((video) => (
                          <label key={video.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-border/30 p-3 transition-colors hover:bg-muted/30">
                            <Checkbox checked={selectedVideoIds.includes(video.id)} onCheckedChange={() => toggleVideo(video.id)} />
                            {video.title}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={() => void handleCreate()} disabled={!name || selectedVideoIds.length === 0} className="rounded-xl">
                    Save Playlist
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </PageActions>
        ) : null}

        {playlists.length === 0 ? (
          <EmptyState
            title="No playlists"
            description="Create a playlist to control video rotation on the branch display."
            icon={ListVideo}
            actionLabel={canManagePlaylists ? "Create Playlist" : undefined}
            onAction={canManagePlaylists ? () => setOpen(true) : undefined}
          />
        ) : (
          <ContentPanel title="Branch Playlists" description={`${playlists.length} playlist${playlists.length === 1 ? "" : "s"}`}>
            <DataTable
              data={playlists}
              keyExtractor={(p) => p.id}
              mobileTitle={(p) => p.name}
              columns={[
                { key: "name", header: "Name", cell: (p) => <span className="font-medium">{p.name}</span> },
                { key: "videos", header: "Videos", cell: (p) => `${p.videoIds.length} video${p.videoIds.length === 1 ? "" : "s"}` },
                { key: "loop", header: "Loop", cell: (p) => (p.loop ? "Yes" : "No"), hideOnMobile: true },
                { key: "status", header: "Status", cell: (p) => <StatusBadge status={p.status} /> },
              ]}
            />
          </ContentPanel>
        )}
      </PageShell>
    </>
  );
}
