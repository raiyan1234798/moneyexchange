"use client";

import { useEffect, useState } from "react";
import { Pencil, Plus, TextCursorInput, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { DashboardHeader } from "@/components/layout/dashboard-sidebar";
import { ApplyToAllCheckbox } from "@/components/shared/apply-to-all-checkbox";
import { BranchSelector } from "@/components/shared/branch-selector";
import { LiveTvPreview } from "@/components/shared/live-tv-preview";
import type { BranchSettings } from "@/lib/types";
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
import { UNIMONI_DEFAULT_TICKER } from "@/lib/unimoni-signage";
import { LOGO_IMAGE_OPTIONS, compressLogoTransparent } from "@/lib/image-utils";
import { LOGO_FONTS, MESSAGE_FONTS, logoFontCss, messageFontCss } from "@/lib/constants";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { syncTickerToBranches, upsertTickerContentToBranches } from "@/lib/services/branch-sync";
import { TickerDisplaySettings } from "@/components/dashboard/ticker-display-settings";
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
  const [logoMode, setLogoMode] = useState<"image" | "text">("image");
  const [logoText, setLogoText] = useState("");
  const [logoFont, setLogoFont] = useState(LOGO_FONTS[0].key);
  const [messageFont, setMessageFont] = useState(MESSAGE_FONTS[0].key);
  const [fontColor, setFontColor] = useState("#FFFFFF");
  const [targetScope, setTargetScope] = useState<"current" | "specific" | "all">("current");
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>([effectiveBranchId]);
  const [editTarget, setEditTarget] = useState<TickerMessage | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TickerMessage | null>(null);
  // Slot under the live TV preview that hosts the panel's save bar (xl screens).
  const [tickerSaveSlot, setTickerSaveSlot] = useState<HTMLElement | null>(null);
  // Unsaved ticker settings, surfaced by TickerDisplaySettings for the live preview.
  const [tickerDraft, setTickerDraft] = useState<BranchSettings | null>(null);

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
    setLogoText(ticker.logoText ?? "");
    setLogoFont(ticker.logoFont ?? LOGO_FONTS[0].key);
    setMessageFont(ticker.messageFont ?? MESSAGE_FONTS[0].key);
    setLogoMode(ticker.logoText ? "text" : "image");
    setFontColor(ticker.fontColor ?? "#FFFFFF");
    setTargetScope("current");
    setEditTarget(ticker);
    setOpen(true);
  }

  function closeDialog() {
    setOpen(false);
    setEditTarget(null);
    setMessages("");
    setLogoUrl("");
    setLogoText("");
    setLogoMode("image");
    setMessageFont(MESSAGE_FONTS[0].key);
    setTargetScope("current");
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

  // Publishing state — the multi-branch save takes a few seconds; without this
  // the button looked dead and gave no sign whether anything applied.
  const [publishing, setPublishing] = useState(false);

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

    // The chosen target scope — "specific" passes the picked branch ids so it
    // actually publishes there (it was silently ignored before, 2026-07-27).
    const scopeSel: boolean | string[] = !canApplyToAll
      ? false
      : targetScope === "all"
        ? true
        : targetScope === "specific"
          ? selectedBranchIds
          : false;

    const sharedFields = {
      messages: lines,
      scrollSpeed,
      fontSize: branch?.settings?.tickerFontSize ?? 18,
      fontColor: fontColor || (branch?.settings?.tickerFontColor ?? "#FFFFFF"),
      logoUrl: logoMode === "text" ? null : logoUrl.trim() || branch?.settings?.tickerLogoUrl || branch?.logoUrl || null,
      logoText: logoMode === "text" ? logoText.trim() || null : null,
      logoFont: logoMode === "text" ? logoFont : null,
      messageFont,
      language: "en" as const,
      status: "active" as const,
    };

    setPublishing(true);
    try {
      if (editTarget && scopeSel === false) {
        await updateTicker(
          editTarget.id,
          { ...sharedFields, branchId: editTarget.branchId },
          { userId: user.uid, userName: profile.displayName || profile.email },
        );
        toast.success("✓ Saved — the scrolling text updates on this branch's TV within seconds", {
          duration: 8000,
        });
        closeDialog();
        return;
      }

      // Create, or edit with a wider scope: upsert the same messages on each target.
      const count = editTarget
        ? await upsertTickerContentToBranches(
            branches,
            effectiveBranchId,
            scopeSel,
            { ...sharedFields, createdBy: user.uid },
            { userId: user.uid, userName: profile.displayName || profile.email },
            editTarget.id,
          )
        : await syncTickerToBranches(
            branches,
            effectiveBranchId,
            scopeSel,
            { ...sharedFields, createdBy: user.uid },
            { userId: user.uid, userName: profile.displayName || profile.email },
          );

      toast.success(
        count > 1
          ? `✓ Applied to ${count} branches — the scrolling text is live on their TVs within seconds`
          : "✓ Saved — the scrolling text updates on this branch's TV within seconds",
        { duration: 10000 },
      );
      closeDialog();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to publish messages");
    } finally {
      setPublishing(false);
    }
  }

  // Per client (2026-07-11): scrolling messages are ADMIN-ONLY.
  if (!isSuperAdmin && !isAdmin) {
    return (
      <>
        <DashboardHeader
          title="Display Ticker Messages & Settings"
          description="Scrolling text shown on branch displays."
          accent="sky"
        />
        <PageShell accent="sky">
          <ContentPanel title="Admins only" description="Display content is managed centrally by the admins.">
            <p className="text-sm text-muted-foreground">
              Your account manages exchange rates. Scrolling messages and the ticker logo are
              controlled by the admin team.
            </p>
          </ContentPanel>
        </PageShell>
      </>
    );
  }

  return (
    <>
      <DashboardHeader
        title="Display Ticker Messages & Settings"
        description="Scrolling messages AND every ticker setting — corner logo, scrolling logos, yellow headline box, bar size — all in one place."
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


        {canManageTickers && effectiveBranchId ? (
          <PageActions>
            <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : closeDialog())}>
              <DialogTrigger render={<Button className="rounded-xl"><Plus className="mr-2 h-4 w-4" />Add scrolling text</Button>} />
              <DialogContent className="max-h-[85vh] overflow-y-auto overflow-x-hidden rounded-2xl sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>{editTarget ? "Edit scrolling text" : "Scrolling display text"}</DialogTitle>
                </DialogHeader>
                <p className="text-sm text-muted-foreground">
                  Type one message per line — they scroll right-to-left on your TV footer.
                </p>
                <div className="min-w-0 space-y-4 py-2">
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
                    <Label>Message font style (scrolling text only)</Label>
                    <Select value={messageFont} onValueChange={(v) => setMessageFont(v ?? MESSAGE_FONTS[0].key)}>
                      <SelectTrigger className="rounded-xl">
                        <SelectValue placeholder="Font style" />
                      </SelectTrigger>
                      <SelectContent>
                        {MESSAGE_FONTS.map((f) => (
                          <SelectItem key={f.key} value={f.key} style={{ fontFamily: f.css }}>
                            {f.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="flex min-w-0 items-center rounded-lg bg-slate-900 px-3 py-2">
                      <span
                        className="min-w-0 truncate text-sm font-bold tracking-[0.08em] text-white"
                        style={{ fontFamily: messageFontCss(messageFont) }}
                      >
                        {messages.split("\n").find((l) => l.trim()) ?? "Best rates in town"}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Applies only to the scrolling message — the logo, headline and rate card keep
                      their own styles.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Logo on the bar (optional)</Label>
                    <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted/40 p-1">
                      <Button
                        type="button"
                        variant={logoMode === "image" ? "default" : "ghost"}
                        size="sm"
                        className="rounded-lg"
                        onClick={() => setLogoMode("image")}
                      >
                        Image logo
                      </Button>
                      <Button
                        type="button"
                        variant={logoMode === "text" ? "default" : "ghost"}
                        size="sm"
                        className="rounded-lg"
                        onClick={() => setLogoMode("text")}
                      >
                        Text logo
                      </Button>
                    </div>

                    {logoMode === "text" ? (
                      <div className="space-y-2">
                        <Input
                          value={logoText}
                          onChange={(e) => setLogoText(e.target.value)}
                          placeholder="e.g. UNIMONI"
                          className="rounded-xl"
                        />
                        <Select value={logoFont} onValueChange={(v) => setLogoFont(v ?? LOGO_FONTS[0].key)}>
                          <SelectTrigger className="rounded-xl">
                            <SelectValue placeholder="Font style" />
                          </SelectTrigger>
                          <SelectContent>
                            {LOGO_FONTS.map((f) => (
                              <SelectItem key={f.key} value={f.key} style={{ fontFamily: f.css }}>
                                {f.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {logoText.trim() ? (
                          <div className="flex min-w-0 items-center justify-center rounded-lg bg-slate-900 px-3 py-3">
                            <span
                              className="max-w-full truncate text-xl font-extrabold uppercase tracking-tight text-white"
                              style={{ fontFamily: logoFontCss(logoFont) }}
                            >
                              {logoText}
                            </span>
                          </div>
                        ) : null}
                        <p className="text-xs text-muted-foreground">
                          Shows as a bigger pop-out badge on the left, separate from the scrolling text.
                        </p>
                      </div>
                    ) : (
                    <>
                    <Input
                      value={logoUrl.startsWith("data:") ? "" : logoUrl}
                      onChange={(e) => setLogoUrl(e.target.value)}
                      placeholder={branch?.settings?.tickerLogoUrl ?? "Paste a logo URL — or upload a file below"}
                      className="rounded-xl"
                      disabled={logoUrl.startsWith("data:")}
                    />
                    <div className="flex items-center gap-2">
                      <Input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/svg+xml,.png,.jpg,.jpeg,.webp,.svg"
                        aria-label="Upload logo image"
                        className="rounded-xl"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          void (async () => {
                            try {
                              if (file.type === "image/svg+xml") {
                                // SVGs are tiny vectors — store as-is.
                                const text = await file.text();
                                if (text.length > 120_000) throw new Error("SVG is too large — simplify it or use PNG.");
                                setLogoUrl(`data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(text)))}`);
                              } else {
                                const { dataUrl } = await compressLogoTransparent(file, LOGO_IMAGE_OPTIONS, "light");
                                setLogoUrl(dataUrl);
                              }
                              toast.success("Logo ready — it shows on the badge when you save");
                            } catch (error) {
                              toast.error(error instanceof Error ? error.message : "Could not read the logo file");
                            } finally {
                              e.target.value = "";
                            }
                          })();
                        }}
                      />
                      {logoUrl.startsWith("data:") ? (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element -- tiny data-URL preview */}
                          <img src={logoUrl} alt="Logo preview" className="h-9 w-9 shrink-0 rounded-md bg-slate-800 object-contain p-1" />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="shrink-0 rounded-lg"
                            onClick={() => setLogoUrl("")}
                          >
                            Clear
                          </Button>
                        </>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Shows in the pop-out badge at the left of the scrolling bar. Leave empty for the
                      unimoni logo.
                    </p>
                    </>
                    )}
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
                </div>
                {canApplyToAll ? (
                  <ApplyToAllCheckbox
                    id="ticker-message-apply-all"
                    scope={targetScope}
                    selectedBranchIds={selectedBranchIds}
                    branches={branches}
                    currentBranchId={effectiveBranchId}
                    onScopeChange={(sel) => {
                      setTargetScope(sel.scope);
                      setSelectedBranchIds(sel.selectedBranchIds);
                    }}
                    className="mt-2"
                    description={
                      editTarget
                        ? `Publishes these scrolling text changes to the selected target branches.`
                        : `Publishes these scrolling messages to the selected target branches.`
                    }
                  />
                ) : null}
                <DialogFooter>
                  <Button
                    onClick={() => void handleCreateTicker()}
                    disabled={!messages.trim() || publishing}
                    className="rounded-xl"
                  >
                    {publishing
                      ? "Publishing…"
                      : editTarget
                        ? targetScope === "all" && canApplyToAll
                          ? "Save to all branches"
                          : targetScope === "specific" && canApplyToAll
                            ? "Save to chosen branches"
                            : "Save changes"
                        : targetScope === "all" && canApplyToAll
                          ? "Publish to all branches"
                          : targetScope === "specific" && canApplyToAll
                            ? "Publish to chosen branches"
                            : "Publish to Displays"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </PageActions>
        ) : null}

        {/* Two-column layout like Settings: content left, LIVE TV sticky on the
            right — nothing overlaps the settings while editing. */}
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,40%)]">
        <div className="min-w-0 space-y-6">
        {!effectiveBranchId ? (
          <EmptyState title="Select a branch" description="Choose a branch to manage its display messages." icon={TextCursorInput} />
        ) : tickers.length === 0 ? (
          <>
            {/* The TV never scrolls nothing: with no messages saved it falls back
                to the branch slogan (or the default line). Show that HERE too —
                otherwise the dashboard says "No scrolling messages" while the TV
                is clearly scrolling one, which looks broken. */}
            <ContentPanel
              title="Currently scrolling on this TV"
              description="No messages are saved for this branch, so the display scrolls this automatic text instead."
            >
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/40 bg-muted/20 p-4">
                <div className="min-w-0">
                  <p className="truncate font-semibold">
                    {branch?.settings?.slogan?.trim() ? branch.settings.slogan : UNIMONI_DEFAULT_TICKER}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {branch?.settings?.slogan?.trim()
                      ? "Source: this branch's slogan (Settings). Add a real message below to replace it."
                      : "Source: built-in default line. Add a real message below to replace it."}
                  </p>
                </div>
                {canManageTickers ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-lg"
                    onClick={() => {
                      // Pre-fill the editor with what's on screen so the admin can
                      // keep it, tweak it, or replace it — one click.
                      setMessages(branch?.settings?.slogan?.trim() ?? "");
                      setOpen(true);
                    }}
                  >
                    <Pencil className="mr-1 h-3 w-3" />
                    Make it editable
                  </Button>
                ) : null}
              </div>
            </ContentPanel>
            <EmptyState
              title="No scrolling messages"
              description="Add lines of text — they scroll right-to-left on the branch display footer."
              icon={TextCursorInput}
              actionLabel={canManageTickers ? "Add Messages" : undefined}
              onAction={canManageTickers ? () => setOpen(true) : undefined}
            />
          </>
        ) : (
          <ContentPanel title="Active Messages">
            <DataTable
              data={tickers}
              keyExtractor={(t) => t.id}
              mobileTitle={(t) => t.messages[0]?.text ?? "Ticker"}
              // This table sits in the ~560px LEFT column of the xl two-column
              // layout, so keep the floor low enough to fit there without the
              // sideways scroll (messages truncates; hover shows the full text).
              tableClassName="min-w-[480px]"
              columns={[
                {
                  key: "messages",
                  header: "Messages",
                  // table-fixed + overflow-hidden keeps long copy in this column
                  className: "min-w-0 overflow-hidden align-middle",
                  cell: (t) => {
                    const text = t.messages.map((m) => m.text).join(" · ");
                    return (
                      <span className="block min-w-0 truncate" title={text}>
                        {text}
                      </span>
                    );
                  },
                },
                {
                  key: "speed",
                  header: "Speed",
                  width: "w-[72px]",
                  className: "whitespace-nowrap align-middle",
                  cell: (t) => `${t.scrollSpeed}s`,
                  hideOnMobile: true,
                },
                {
                  key: "status",
                  header: "Status",
                  width: "w-[100px]",
                  className: "align-middle",
                  cell: (t) => <StatusBadge status={t.status} />,
                },
                {
                  key: "paused",
                  header: "Scrolling",
                  width: "w-[130px]",
                  className: "align-middle",
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
                  width: "w-[110px]",
                  className: "align-middle text-right",
                  cell: (t) =>
                    canManageTickers ? (
                      <div className="inline-flex flex-col items-end gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-lg text-destructive hover:text-destructive"
                          onClick={() => setDeleteTarget(t)}
                        >
                          <Trash2 className="mr-1 h-3 w-3" />
                          Delete
                        </Button>
                        <Button variant="outline" size="sm" className="rounded-lg" onClick={() => openEdit(t)}>
                          <Pencil className="mr-1 h-3 w-3" />
                          Edit
                        </Button>
                      </div>
                    ) : null,
                },
              ]}
            />
          </ContentPanel>
        )}

        {/* ALL ticker display settings live here with the messages (per client). */}
        {branch && user && profile ? (
          <TickerDisplaySettings
            branch={branch}
            branches={branches}
            actor={{ userId: user.uid, userName: profile.displayName || profile.email }}
            saveSlot={tickerSaveSlot}
            onDraftChange={setTickerDraft}
          />
        ) : null}
        </div>

        {/* Sticky LIVE TV preview — follows while you edit, never covers anything. */}
        {/* Preview on TOP, save below (client 2026-08-01). The stack scrolls
            within itself on short screens so Save is always reachable. */}
        <div className="hidden xl:block">
          {branch ? (
            <div className="sticky top-6 max-h-[calc(100vh-3rem)] space-y-2 overflow-y-auto pr-1">
              <p className="text-sm font-medium">
                Live TV preview — {branch.name}
              </p>
              <LiveTvPreview
                branchCode={branch.code}
                draft={tickerDraft ?? branch.settings ?? null}
                label={`Live TV preview for ${branch.name}`}
              />
              <div id="ticker-save-slot" ref={setTickerSaveSlot} className="pt-1" />
            </div>
          ) : null}
        </div>
        </div>

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
