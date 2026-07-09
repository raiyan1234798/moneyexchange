"use client";

import { useEffect, useState } from "react";
import { Pencil, Plus, TextCursorInput, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { DashboardHeader } from "@/components/layout/dashboard-sidebar";
import { ApplyToAllCheckbox } from "@/components/shared/apply-to-all-checkbox";
import { BranchSelector } from "@/components/shared/branch-selector";
import { PreviewDisplayLink } from "@/components/shared/preview-display-link";
import {
  ContentPanel,
  DataTable,
  EmptyState,
  FirestoreSetupNotice,
  PageActions,
  PageShell,
  StatusBadge,
} from "@/components/shared/page-elements";
import { useAuth } from "@/contexts/auth-context";
import { useBranchScope, useContentPermissions } from "@/lib/hooks/use-branch-scope";
import { useFirestoreNotice } from "@/lib/hooks/use-firestore-notice";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { deleteTicker, subscribeTickers, updateTicker } from "@/lib/services/ticker-service";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { syncTickerToBranches } from "@/lib/services/branch-sync";
import type { TickerMessage } from "@/lib/types";

export default function TickersPage() {
  const { user, profile } = useAuth();
  const { branches, effectiveBranchId, setSelectedBranchId, isSuperAdmin, isAdmin } = useBranchScope();
  const { canManageTickers } = useContentPermissions();
  const [tickers, setTickers] = useState<TickerMessage[]>([]);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState("");
  const [scrollSpeed, setScrollSpeed] = useState(30);
  const [logoUrl, setLogoUrl] = useState("");
  const [fontColor, setFontColor] = useState("#FFFFFF");
  const [applyToAll, setApplyToAll] = useState(false);
  const [editTarget, setEditTarget] = useState<TickerMessage | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TickerMessage | null>(null);

  const branch = branches.find((b) => b.id === effectiveBranchId);
  const canApplyToAll = (isSuperAdmin || isAdmin) && branches.filter((b) => b.status === "active").length > 1;
  const { notice, onError, clearNotice } = useFirestoreNotice("display messages");

  useEffect(() => {
    if (!effectiveBranchId) return;
    return subscribeTickers(
      effectiveBranchId,
      (items) => {
        setTickers(items);
        clearNotice();
      },
      onError,
    );
  }, [clearNotice, effectiveBranchId, onError]);

  function openEdit(ticker: TickerMessage) {
    setMessages(ticker.messages.map((m) => m.text).join("\n"));
    setScrollSpeed(ticker.scrollSpeed || 30);
    setLogoUrl(ticker.logoUrl ?? "");
    setFontColor(ticker.fontColor ?? "#FFFFFF");
    setApplyToAll(false);
    setEditTarget(ticker);
    setOpen(true);
  }

  function closeDialog() {
    setOpen(false);
    setEditTarget(null);
    setMessages("");
    setApplyToAll(false);
  }

  async function handleDeleteTicker() {
    if (!user || !profile || !deleteTarget) return;
    try {
      await deleteTicker(
        deleteTarget.id,
        { userId: user.uid, userName: profile.displayName || profile.email },
        deleteTarget.branchId,
      );
      toast.success("Scrolling messages removed from display");
      setDeleteTarget(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete messages");
    }
  }

  async function handleCreateTicker() {
    if (!user || !profile || !effectiveBranchId) return;

    const lines = messages
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((text, index) => ({ id: String(index), text, priority: index }));

    if (lines.length === 0) {
      toast.error("Enter at least one scrolling message");
      return;
    }

    if (editTarget) {
      try {
        await updateTicker(
          editTarget.id,
          {
            messages: lines,
            scrollSpeed,
            fontColor: fontColor || (branch?.settings?.tickerFontColor ?? "#FFFFFF"),
            logoUrl: logoUrl.trim() || branch?.settings?.tickerLogoUrl || branch?.logoUrl || null,
            branchId: editTarget.branchId,
          },
          { userId: user.uid, userName: profile.displayName || profile.email },
        );
        toast.success("Scrolling messages updated on display");
        closeDialog();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to update messages");
      }
      return;
    }

    try {
      const tickerData = {
        messages: lines,
        scrollSpeed,
        fontSize: branch?.settings?.tickerFontSize ?? 18,
        fontColor: fontColor || (branch?.settings?.tickerFontColor ?? "#FFFFFF"),
        logoUrl: logoUrl.trim() || branch?.settings?.tickerLogoUrl || branch?.logoUrl || null,
        language: "en" as const,
        status: "active" as const,
        createdBy: user.uid,
      };

      const count = await syncTickerToBranches(
        branches,
        effectiveBranchId,
        applyToAll && canApplyToAll,
        tickerData,
        { userId: user.uid, userName: profile.displayName || profile.email },
      );

      toast.success(
        count > 1
          ? `Scrolling messages published to ${count} branches`
          : "Scrolling messages published to displays",
      );
      setOpen(false);
      setMessages("");
      setApplyToAll(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to publish messages");
    }
  }

  return (
    <>
      <DashboardHeader
        title="Display Messages"
        description="Scrolling text shown right-to-left on branch displays. One message per line."
        accent="sky"
      />
      <PageShell accent="sky">
        <FirestoreSetupNotice message={notice} />
        {isSuperAdmin || isAdmin ? (
          <BranchSelector
            branches={branches}
            value={effectiveBranchId}
            onChange={setSelectedBranchId}
            helperText="Messages scroll on the footer of your branch TV display."
          />
        ) : branch ? (
          <p className="text-sm text-muted-foreground">
            Managing messages for: <strong>{branch.name}</strong>
          </p>
        ) : null}

        <PreviewDisplayLink branchCode={branch?.code} />

        {canManageTickers && effectiveBranchId ? (
          <PageActions>
            <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : closeDialog())}>
              <DialogTrigger render={<Button className="rounded-xl"><Plus className="mr-2 h-4 w-4" />Add scrolling text</Button>} />
              <DialogContent className="rounded-2xl sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>{editTarget ? "Edit scrolling text" : "Scrolling display text"}</DialogTitle>
                </DialogHeader>
                <p className="text-sm text-muted-foreground">
                  Type one message per line — they scroll right-to-left on your TV footer.
                </p>
                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <Label>Your messages (one per line)</Label>
                    <Textarea
                      value={messages}
                      onChange={(e) => setMessages(e.target.value)}
                      placeholder={"Best rates in town\nFast service · Trusted exchange\nOpen 7 days a week"}
                      rows={4}
                      className="rounded-xl"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Scroll duration (seconds — lower is faster)</Label>
                    <Input
                      type="number"
                      min={5}
                      value={scrollSpeed}
                      onChange={(e) => setScrollSpeed(Number(e.target.value))}
                      className="rounded-xl"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Ticker Logo URL (optional)</Label>
                    <Input
                      value={logoUrl}
                      onChange={(e) => setLogoUrl(e.target.value)}
                      placeholder={branch?.settings?.tickerLogoUrl ?? "Leave blank for default unimoni logo (/unimoni-logo-on-dark.svg)"}
                      className="rounded-xl"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Font Color</Label>
                    <Input
                      value={fontColor}
                      onChange={(e) => setFontColor(e.target.value)}
                      placeholder="#FFFFFF"
                      className="rounded-xl"
                    />
                  </div>
                  {canApplyToAll && !editTarget ? (
                    <ApplyToAllCheckbox
                      checked={applyToAll}
                      onChange={setApplyToAll}
                      branchCount={branches.filter((b) => b.status === "active").length}
                    />
                  ) : null}
                </div>
                <DialogFooter>
                  <Button
                    onClick={() => void handleCreateTicker()}
                    disabled={!messages.trim()}
                    className="rounded-xl"
                  >
                    {editTarget ? "Save changes" : "Publish to Displays"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </PageActions>
        ) : null}

        {!effectiveBranchId ? (
          <EmptyState title="Select a branch" description="Choose a branch to manage its display messages." icon={TextCursorInput} />
        ) : tickers.length === 0 ? (
          <EmptyState
            title="No scrolling messages"
            description="Add lines of text — they scroll right-to-left on the branch display footer."
            icon={TextCursorInput}
            actionLabel={canManageTickers ? "Add Messages" : undefined}
            onAction={canManageTickers ? () => setOpen(true) : undefined}
          />
        ) : (
          <ContentPanel title="Active Messages">
            <DataTable
              data={tickers}
              keyExtractor={(t) => t.id}
              mobileTitle={(t) => t.messages[0]?.text ?? "Ticker"}
              columns={[
                {
                  key: "messages",
                  header: "Messages",
                  cell: (t) => (
                    <span className="max-w-md truncate">{t.messages.map((m) => m.text).join(" · ")}</span>
                  ),
                },
                { key: "speed", header: "Speed", cell: (t) => `${t.scrollSpeed}s`, hideOnMobile: true },
                { key: "status", header: "Status", cell: (t) => <StatusBadge status={t.status} /> },
                {
                  key: "paused",
                  header: "Scrolling",
                  cell: (t) =>
                    canManageTickers ? (
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={!t.paused}
                          onCheckedChange={(checked) => {
                            if (!user || !profile) return;
                            void updateTicker(
                              t.id,
                              { paused: !checked },
                              { userId: user.uid, userName: profile.displayName || profile.email },
                            )
                              .then(() => toast.success(checked ? "Scrolling resumed" : "Scrolling paused"))
                              .catch((e) =>
                                toast.error(e instanceof Error ? e.message : "Failed to update"),
                              );
                          }}
                        />
                        <span className="text-xs text-muted-foreground">{t.paused ? "Paused" : "Live"}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">{t.paused ? "Paused" : "Live"}</span>
                    ),
                },
                {
                  key: "actions",
                  header: "Actions",
                  className: "text-right",
                  cell: (t) =>
                    canManageTickers ? (
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <Button variant="outline" size="sm" className="rounded-lg" onClick={() => openEdit(t)}>
                          <Pencil className="mr-1 h-3 w-3" />
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-lg text-destructive hover:text-destructive"
                          onClick={() => setDeleteTarget(t)}
                        >
                          <Trash2 className="mr-1 h-3 w-3" />
                          Delete
                        </Button>
                      </div>
                    ) : null,
                },
              ]}
            />
          </ContentPanel>
        )}

        <AlertDialog open={!!deleteTarget} onOpenChange={(next) => !next && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete scrolling messages?</AlertDialogTitle>
              <AlertDialogDescription>
                The messages will disappear from the branch display immediately. The display falls
                back to the branch slogan or default welcome text.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => void handleDeleteTicker()}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </PageShell>
    </>
  );
}
