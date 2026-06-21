"use client";

import { useEffect, useState } from "react";
import { Plus, TextCursorInput } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createTicker, subscribeTickers, updateTicker } from "@/lib/services/ticker-service";
import type { TickerMessage } from "@/lib/types";

export default function TickersPage() {
  const { user, profile } = useAuth();
  const { branches, effectiveBranchId, setSelectedBranchId, isSuperAdmin } = useBranchScope();
  const { canManageTickers } = useContentPermissions();
  const [tickers, setTickers] = useState<TickerMessage[]>([]);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState("");
  const [scrollSpeed, setScrollSpeed] = useState(30);

  const branch = branches.find((b) => b.id === effectiveBranchId);

  useEffect(() => {
    if (!effectiveBranchId) return;
    return subscribeTickers(
      effectiveBranchId,
      setTickers,
      (error) => toast.error(error.message || "Failed to load messages"),
    );
  }, [effectiveBranchId]);

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

    try {
      await createTicker(
        {
          branchId: effectiveBranchId,
          messages: lines,
          scrollSpeed,
          fontSize: branch?.settings?.tickerFontSize ?? 18,
          fontColor: branch?.settings?.tickerFontColor ?? "#FFFFFF",
          language: "en",
          status: "active",
          createdBy: user.uid,
        },
        { userId: user.uid, userName: profile.displayName || profile.email },
      );
      toast.success("Scrolling messages published to displays");
      setOpen(false);
      setMessages("");
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
        {isSuperAdmin ? (
          <BranchSelector branches={branches} value={effectiveBranchId} onChange={setSelectedBranchId} />
        ) : branch ? (
          <p className="text-sm text-muted-foreground">
            Managing messages for: <strong>{branch.name}</strong>
          </p>
        ) : null}

        {canManageTickers && effectiveBranchId ? (
          <PageActions>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger render={<Button className="rounded-xl"><Plus className="mr-2 h-4 w-4" />Add Scrolling Messages</Button>} />
              <DialogContent className="rounded-2xl sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Scrolling Display Text</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <Label>Messages (one per line)</Label>
                    <Textarea
                      value={messages}
                      onChange={(e) => setMessages(e.target.value)}
                      placeholder={"Best rates in town\nFast service · Trusted exchange"}
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
                </div>
                <DialogFooter>
                  <Button
                    onClick={() => void handleCreateTicker()}
                    disabled={!messages.trim()}
                    className="rounded-xl"
                  >
                    Publish to Displays
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
              ]}
            />
          </ContentPanel>
        )}
      </PageShell>
    </>
  );
}
