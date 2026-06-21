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
import { updateBranch } from "@/lib/services/branch-service";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createTicker, subscribeTickers, updateTicker } from "@/lib/services/ticker-service";
import type { TickerMessage } from "@/lib/types";

function SloganEditor({
  defaultSlogan,
  onSave,
}: {
  defaultSlogan: string;
  onSave: (value: string) => void;
}) {
  const [value, setValue] = useState(defaultSlogan);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      onSave(value);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Your trusted exchange partner"
        className="flex-1 rounded-xl"
      />
      <Button onClick={() => void handleSave()} disabled={saving} className="rounded-xl shrink-0">
        {saving ? "Saving..." : "Save Slogan"}
      </Button>
    </div>
  );
}

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
    return subscribeTickers(effectiveBranchId, setTickers);
  }, [effectiveBranchId]);

  async function saveSlogan(slogan: string) {
    if (!user || !profile || !effectiveBranchId || !branch) return;
    await updateBranch(
      effectiveBranchId,
      { settings: { ...branch.settings, slogan } },
      { userId: user.uid, userName: profile.displayName || profile.email },
    );
    toast.success("Branch slogan updated");
  }

  async function handleCreateTicker() {
    if (!user || !profile || !effectiveBranchId) return;
    const lines = messages
      .split("\n")
      .filter(Boolean)
      .map((text, index) => ({ id: String(index), text, priority: index }));
    const fallbackSlogan = branch?.settings?.slogan ?? "Welcome";
    await createTicker(
      {
        branchId: effectiveBranchId,
        messages: lines.length ? lines : [{ id: "0", text: fallbackSlogan, priority: 0 }],
        scrollSpeed,
        fontSize: 18,
        fontColor: "#FFFFFF",
        language: "en",
        status: "active",
        createdBy: user.uid,
      },
      { userId: user.uid, userName: profile.displayName || profile.email },
    );
    toast.success("Ticker messages published to displays");
    setOpen(false);
    setMessages("");
  }

  return (
    <>
      <DashboardHeader
        title="Tickers & Slogans"
        description="Scrolling footer messages — updates appear on branch displays instantly."
        accent="sky"
      />
      <PageShell accent="sky">
        {isSuperAdmin ? (
          <BranchSelector branches={branches} value={effectiveBranchId} onChange={setSelectedBranchId} />
        ) : null}

        {effectiveBranchId && canManageTickers ? (
          <ContentPanel title="Branch Slogan" description="Default message shown on display when no ticker is active">
            <SloganEditor key={effectiveBranchId} defaultSlogan={branch?.settings?.slogan ?? ""} onSave={(v) => void saveSlogan(v)} />
          </ContentPanel>
        ) : null}

        {canManageTickers && effectiveBranchId ? (
          <PageActions>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger render={<Button className="rounded-xl"><Plus className="mr-2 h-4 w-4" />Add Ticker</Button>} />
              <DialogContent className="rounded-2xl sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Scrolling Messages</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <Label>Messages (one per line)</Label>
                    <Textarea
                      value={messages}
                      onChange={(e) => setMessages(e.target.value)}
                      placeholder={"Best rates in town\nVisit us for fast service"}
                      rows={4}
                      className="rounded-xl"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Scroll duration (seconds — lower is faster)</Label>
                    <Input type="number" value={scrollSpeed} onChange={(e) => setScrollSpeed(Number(e.target.value))} className="rounded-xl" />
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={() => void handleCreateTicker()} className="rounded-xl">Publish to Displays</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </PageActions>
        ) : null}

        {tickers.length === 0 ? (
          <EmptyState title="No ticker messages" description="Set a slogan or add scrolling announcements for this branch." icon={TextCursorInput} />
        ) : (
          <ContentPanel title="Active Tickers">
            <DataTable
              data={tickers}
              keyExtractor={(t) => t.id}
              mobileTitle={(t) => t.messages[0]?.text ?? "Ticker"}
              columns={[
                {
                  key: "messages",
                  header: "Messages",
                  cell: (t) => <span className="max-w-md truncate">{t.messages.map((m) => m.text).join(" · ")}</span>,
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
                            ).then(() => toast.success(checked ? "Ticker resumed" : "Ticker paused"));
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
