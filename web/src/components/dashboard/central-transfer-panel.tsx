"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, FileSpreadsheet, GripVertical, Plus, Save, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { ContentPanel } from "@/components/shared/page-elements";
import { FlagChip } from "@/components/display/flag-chip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  bulkUpsertTransferRates,
  deleteTransferRate,
  setTransferCurrenciesVisibilityOnBranches,
  subscribeTransferRates,
  upsertTransferRate,
  reorderTransferRates,
} from "@/lib/services/transfer-rate-service";
import { parseRateFile } from "@/lib/rate-import";
import { flagFromCurrencyCode, getCurrencyMeta, normalizeCurrencyCode } from "@/lib/currency-utils";
import { saveCurrencyOverride, subscribeCurrencyOverrides } from "@/lib/services/currency-service";
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
import type { Branch, TransferRate } from "@/lib/types";

type Draft = { transferUsd: string; transferLocal: string };

type PendingUpload = {
  rows: Array<{
    currencyCode: string;
    transferUsd: number | null;
    transferLocal: number | null;
    /** Manual flag for a NEW currency the catalog can't auto-flag (set in the review pop-up). */
    flag?: string;
  }>;
  /** Non-USD rows that lacked a readable transfer rate (USD / forex-only rows are not counted). */
  skippedNoTransfer: number;
};

/**
 * ADMIN-ONLY editor for the centralized money-transfer rates — one set from
 * head office, shown identically on every branch's TRANSFER card. Per the
 * client (2026-07-11): branch staff have no rights here.
 */
export function CentralTransferPanel({
  actor,
  localLabel,
  branches = [],
  currentBranchId = null,
  canDeleteCurrency = false,
}: {
  actor: { userId: string; userName: string };
  localLabel: string;
  /** Active branches — enables per-branch hide/show for remittance currencies. */
  branches?: Branch[];
  currentBranchId?: string | null;
  /** Only admins (or an admin-granted "Add new currencies" user) may DELETE a
   *  transfer currency. Everyone else can edit values but never remove rows. */
  canDeleteCurrency?: boolean;
}) {
  const [rows, setRows] = useState<TransferRate[]>([]);
  // Admin flag overrides (beats the built-in catalog) — same source the TV uses.
  const [flagOverrides, setFlagOverrides] = useState<Record<string, { flag?: string }>>({});
  useEffect(() => subscribeCurrencyOverrides((m) => setFlagOverrides(m ?? {})), []);

  // Confirm before removing a transfer currency (avoid accidental delete).
  const [removeConfirm, setRemoveConfirm] = useState<{ code: string } | null>(null);
  const [visibilityDialog, setVisibilityDialog] = useState<{
    codes: string[];
    hide: boolean;
  } | null>(null);
  const [visibilityScope, setVisibilityScope] = useState<"current" | "specific" | "all">("all");
  const [visibilityBranchIds, setVisibilityBranchIds] = useState<string[]>([]);
  const [visibilitySaving, setVisibilitySaving] = useState(false);
  const [selectedVisibilityCodes, setSelectedVisibilityCodes] = useState<string[]>([]);
  // Drag-to-reorder state.
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const activeBranches = branches.filter((b) => b.status === "active");
  const currentBranch = activeBranches.find((b) => b.id === currentBranchId) ?? null;

  /** Hidden on the currently selected branch TV (global flag OR per-branch list). */
  function isHiddenOnCurrentBranch(code: string): boolean {
    const upper = code.toUpperCase();
    const row = rows.find((r) => r.currencyCode.toUpperCase() === upper);
    if (row?.isHidden) return true;
    const list = currentBranch?.settings?.hiddenTransferCodes ?? [];
    return list.some((c) => String(c).toUpperCase() === upper);
  }

  async function confirmTransferVisibility() {
    if (!visibilityDialog) return;
    const codes = visibilityDialog.codes.map((c) => c.trim().toUpperCase()).filter(Boolean);
    if (codes.length === 0) return;
    const hide = visibilityDialog.hide;
    const targets =
      visibilityScope === "all"
        ? activeBranches
        : visibilityScope === "specific"
          ? activeBranches.filter((b) => visibilityBranchIds.includes(b.id))
          : activeBranches.filter((b) => b.id === (currentBranchId ?? ""));
    if (targets.length === 0) {
      toast.error("Pick at least one branch");
      return;
    }
    // Optimistic: close dialog + re-sort immediately.
    setVisibilityDialog(null);
    setSelectedVisibilityCodes([]);
    setVisibilitySaving(true);
    try {
      const updated = await setTransferCurrenciesVisibilityOnBranches(
        codes,
        hide,
        targets,
        actor,
        { allActiveBranchIds: activeBranches.map((b) => b.id) },
      );
      const label =
        codes.length === 1
          ? codes[0]
          : `${codes.length} currencies (${codes.slice(0, 4).join(", ")}${codes.length > 4 ? "…" : ""})`;
      if (updated === 0) {
        toast.message(
          hide
            ? `${label} was already hidden on the chosen branch(es)`
            : `${label} was already visible on the chosen branch(es)`,
        );
      } else {
        toast.success(
          hide
            ? `Hidden ${label} on ${targets.length} branch${targets.length === 1 ? "" : "es"}`
            : `Shown ${label} on ${targets.length} branch${targets.length === 1 ? "" : "es"}`,
          { duration: 5000 },
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to update visibility";
      if (/exceeds the maximum allowed size|1,048,576|1048576/i.test(msg)) {
        toast.error(
          "That branch’s settings file is over Firestore’s 1 MB limit. Remittance hide now saves to a small separate record — please retry. If Settings still won’t save, remove large uploaded images from that branch’s Settings.",
          { duration: 12000 },
        );
      } else {
        toast.error(msg);
      }
    } finally {
      setVisibilitySaving(false);
    }
  }

  function openBulkTransferVisibility(hide: boolean) {
    const codes = selectedVisibilityCodes.map((c) => c.trim().toUpperCase()).filter(Boolean);
    if (codes.length === 0) {
      toast.error("Select at least one currency");
      return;
    }
    setVisibilityScope(activeBranches.length > 1 ? "all" : "current");
    setVisibilityBranchIds(
      currentBranchId ? [currentBranchId] : activeBranches[0] ? [activeBranches[0].id] : [],
    );
    setVisibilityDialog({ codes, hide });
  }

  function toggleTransferVisibilitySelection(code: string) {
    const upper = code.toUpperCase();
    setSelectedVisibilityCodes((prev) =>
      prev.includes(upper) ? prev.filter((c) => c !== upper) : [...prev, upper],
    );
  }

  /** Render order: hidden currencies sink to the bottom so visible ones stay
      grouped at the top. displayOrder is preserved for when they're unhidden. */
  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      const ha = isHiddenOnCurrentBranch(a.currencyCode) ? 1 : 0;
      const hb = isHiddenOnCurrentBranch(b.currencyCode) ? 1 : 0;
      if (ha !== hb) return ha - hb;
      return (a.displayOrder ?? 0) - (b.displayOrder ?? 0) || a.currencyCode.localeCompare(b.currencyCode);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rows + branch hidden codes drive re-sort
  }, [rows, currentBranch?.settings?.hiddenTransferCodes, currentBranch?.id]);

  // Turn a failed reorder write into an honest, actionable message. A denied
  // write means the on-screen reorder never saved — most often a session that
  // can read but not write (re-sign-in as an admin fixes it).
  function reorderErrorMessage(e: unknown): string {
    const raw = e instanceof Error ? e.message : String(e);
    const code = (e as { code?: string })?.code ?? "";
    if (code === "permission-denied" || /permission|insufficient|PERMISSION_DENIED/i.test(raw)) {
      return "Order NOT saved — your account can't edit the transfer card. Sign out and back in as an admin, then try again.";
    }
    return `Order not saved: ${raw}`;
  }

  /** Move a currency up/down on the TRANSFER card only (forex order untouched). */
  function moveTransferRow(row: TransferRate, dir: -1 | 1) {
    // Operate on the DISPLAYED order (sortedRows), not the raw rows — otherwise
    // when a currency is hidden on this branch the two orders differ and up/down
    // moves the wrong currency.
    const codes = sortedRows.map((r) => r.currencyCode);
    const i = codes.indexOf(row.currencyCode);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= codes.length) return;
    [codes[i], codes[j]] = [codes[j], codes[i]];
    void reorderTransferRates(codes, actor)
      .then(() => toast.success(`${row.currencyCode} moved ${dir < 0 ? "up" : "down"} — saved to the transfer card`))
      .catch((e) => toast.error(reorderErrorMessage(e), { duration: 9000 }));
  }

  /** Drag a row onto another to set the new transfer-card order. */
  function dropTransferRow(from: number, to: number) {
    // from/to are indices into the DISPLAYED sortedRows (that's what the drag
    // handlers pass), so reorder sortedRows — not the differently-ordered raw
    // rows — or a hidden-on-this-branch currency shifts the wrong row.
    if (from === to || from < 0 || to < 0 || from >= sortedRows.length || to >= sortedRows.length) return;
    const prev = rows;
    const next = [...sortedRows];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setRows(next); // optimistic — the subscription re-syncs after a successful write
    void reorderTransferRates(next.map((r) => r.currencyCode), actor)
      .then(() => toast.success("Transfer card order saved — the rate card updates within seconds"))
      .catch((e) => {
        setRows(prev); // roll back the optimistic move so the UI can't lie
        toast.error(reorderErrorMessage(e), { duration: 9000 });
      });
  }
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [newCode, setNewCode] = useState("");
  const [newUsd, setNewUsd] = useState("");
  const [newLocal, setNewLocal] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  // Parsed file waiting for the admin's confirmation — nothing goes live yet.
  const [pending, setPending] = useState<PendingUpload | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleTransferUpload(file: File) {
    setUploading(true);
    try {
      const parsed = await parseRateFile(file);
      // USD rows are allowed (client 2026-07-25) — e.g. "USD | 1 | 3785".
      const transferRows = parsed
        .filter((r) => (r.transferUsd ?? 0) > 0 || (r.transferLocal ?? 0) > 0)
        .map((r) => ({
          currencyCode: r.currencyCode,
          transferUsd: r.transferUsd ?? null,
          transferLocal: r.transferLocal ?? null,
        }));
      if (transferRows.length === 0) {
        toast.error(
          `No transfer rates found. The file needs columns: CURRENCY | $ (USD) | ${localLabel}, with a number in at least one rate column.`,
          { duration: 10000 },
        );
        return;
      }
      // Confirm before anything goes live on the TVs.
      setPending({
        rows: transferRows,
        skippedNoTransfer: parsed.length - transferRows.length,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read the transfer file");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function publishPending() {
    if (!pending) return;
    const { rows: transferRows, skippedNoTransfer } = pending;
    setPending(null);
    setUploading(true);
    try {
      const count = await bulkUpsertTransferRates(transferRows, actor);
      // NEW codes the built-in catalog doesn't know: store the auto-picked (or
      // manually chosen) flag so every TV's transfer card shows it right away.
      for (const r of transferRows) {
        const code = normalizeCurrencyCode(r.currencyCode) || r.currencyCode.toUpperCase();
        if (getCurrencyMeta(code)) continue;
        const finalFlag = r.flag?.trim() || flagFromCurrencyCode(code);
        if (finalFlag && finalFlag !== "💱") {
          await saveCurrencyOverride(code, { flag: finalFlag }, actor).catch(() => undefined);
        }
      }
      // Name the currencies so a partial read (e.g. rows the file left blank)
      // is visible immediately instead of looking like "not reflecting".
      const codes = transferRows.map((r) => r.currencyCode).join(", ");
      toast.success(`${count} transfer rate(s) published to ALL branches: ${codes}`, {
        duration: 10000,
      });
      const failed = transferRows.length - count;
      if (failed > 0) {
        toast.warning(
          `${failed} row(s) could not be published (invalid currency code) — check the CURRENCY column.`,
          { duration: 10000 },
        );
      }
      // Only warn for non-USD rows that looked like currencies but had no
      // usable transfer values — never count the USD base row or forex-only noise.
      if (skippedNoTransfer > 0) {
        toast.warning(
          `${skippedNoTransfer} row(s) had no readable transfer rate and were skipped.`,
          { duration: 10000 },
        );
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not publish the transfer rates");
    } finally {
      setUploading(false);
    }
  }

  useEffect(() => {
    return subscribeTransferRates(
      (items) => {
        // USD rows are allowed on the transfer card (client 2026-07-25).
        setRows(items);
        // Merge, keeping in-progress edits.
        setDrafts((prev) => {
          const next: Record<string, Draft> = {};
          for (const item of items) {
            const server: Draft = {
              transferUsd: item.transferUsd != null ? String(item.transferUsd) : "",
              transferLocal: item.transferLocal != null ? String(item.transferLocal) : "",
            };
            const draft = prev[item.id];
            const dirty =
              draft &&
              (draft.transferUsd !== server.transferUsd || draft.transferLocal !== server.transferLocal);
            next[item.id] = dirty ? draft : server;
          }
          return next;
        });
      },
      (error) => toast.error(error.message),
    );
  }, []);

  const num = (v: string): number | null => {
    if (v.trim() === "") return null;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  async function saveRow(row: TransferRate) {
    const draft = drafts[row.id];
    if (!draft) return;
    const usd = num(draft.transferUsd);
    const local = num(draft.transferLocal);
    // At least one real (>0) rate is required — an all-blank/zero row would show
    // nothing (or a stray 0) on every branch's transfer card.
    if (usd === null && local === null) {
      toast.error(
        `Enter a real rate for ${row.currencyCode} — the USD or ${localLabel} value must be greater than 0.`,
        { duration: 8000 },
      );
      return;
    }
    setBusy(true);
    try {
      await upsertTransferRate(
        { currencyCode: row.currencyCode, transferUsd: usd, transferLocal: local },
        actor,
      );
      toast.success(`${row.currencyCode} transfer rate published to ALL branches`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save transfer rate");
    } finally {
      setBusy(false);
    }
  }

  async function addRow() {
    const code = newCode.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(code)) {
      toast.error("Enter a 3-letter currency code (e.g. USD)");
      return;
    }
    const usd = num(newUsd);
    const local = num(newLocal);
    if (!usd && !local) {
      toast.error(`Enter the $ rate, the ${localLabel} rate, or both`);
      return;
    }
    setBusy(true);
    try {
      await upsertTransferRate({ currencyCode: code, transferUsd: usd, transferLocal: local }, actor);
      // Auto-pick the flag from the alphabetic code for currencies the built-in
      // catalog doesn't know (client 2026-08-01) — same as the Excel path.
      if (!getCurrencyMeta(code)) {
        const autoFlag = flagFromCurrencyCode(code);
        if (autoFlag && autoFlag !== "💱") {
          await saveCurrencyOverride(code, { flag: autoFlag }, actor).catch(() => undefined);
        }
      }
      toast.success(`${code} added to the transfer card on ALL branches`);
      setNewCode("");
      setNewUsd("");
      setNewLocal("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add transfer rate");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {/* Same layout as Forex upload: title left, dashed drop box right. */}
      <div className="mb-4 overflow-hidden rounded-2xl border border-border/60 bg-card p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-xl">
            <div className="flex items-center gap-2 text-foreground">
              <FileSpreadsheet className="h-5 w-5" />
              <p className="text-base font-semibold tracking-tight">Money Transfer Rates</p>
            </div>
            <p className="mt-3 text-xs font-medium text-muted-foreground">
              One set for ALL branches — upload an Excel or edit below. T.T rate against USD/
              {localLabel}.
            </p>
          </div>
          <div className="flex w-full shrink-0 flex-col gap-3 lg:max-w-sm">
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              aria-label="Upload transfer rates Excel for all branches"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleTransferUpload(f);
              }}
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const f = e.dataTransfer.files?.[0];
                if (f) void handleTransferUpload(f);
              }}
              className={`flex min-h-[120px] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors ${
                dragOver
                  ? "border-primary bg-primary/10"
                  : "border-border bg-background/60 hover:border-primary/60 hover:bg-primary/5"
              } ${uploading ? "pointer-events-none opacity-60" : "cursor-pointer"}`}
            >
              <Upload className="h-8 w-8 text-primary" />
              <span className="text-sm font-medium">
                {uploading ? "Uploading…" : "Drop the transfer Excel/CSV here"}
              </span>
              <span className="text-xs text-muted-foreground">
                .xlsx, .xls, .csv — CURRENCY | $ (USD) | {localLabel}
              </span>
            </button>
          </div>
        </div>
      </div>

      <ContentPanel
        title="Money Transfer Rates (Remittance)"
        description="Continues from the forex rates above — ONE set shown on every branch's transfer card."
      >
      <div className="space-y-2">
        {sortedRows.length > 0 ? (
          <div className="mb-1 flex flex-wrap items-center gap-2 rounded-xl border border-border/50 bg-muted/20 px-3 py-2">
            <label className="flex cursor-pointer items-center gap-2 text-xs font-medium">
              <input
                type="checkbox"
                className="h-3.5 w-3.5"
                checked={
                  sortedRows.length > 0 &&
                  sortedRows.every((r) => selectedVisibilityCodes.includes(r.currencyCode.toUpperCase()))
                }
                onChange={(e) => {
                  if (e.target.checked) {
                    setSelectedVisibilityCodes(sortedRows.map((r) => r.currencyCode.toUpperCase()));
                  } else {
                    setSelectedVisibilityCodes([]);
                  }
                }}
              />
              Select all
            </label>
            <span className="text-xs text-muted-foreground">
              {selectedVisibilityCodes.length > 0
                ? `${selectedVisibilityCodes.length} selected`
                : "Tick currencies to hide/show several at once"}
            </span>
            <div className="ml-auto flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 rounded-lg"
                disabled={selectedVisibilityCodes.length === 0 || visibilitySaving || busy}
                onClick={() => openBulkTransferVisibility(true)}
              >
                <Eye className="mr-1 h-3 w-3" />
                Hide selected
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 rounded-lg"
                disabled={selectedVisibilityCodes.length === 0 || visibilitySaving || busy}
                onClick={() => openBulkTransferVisibility(false)}
              >
                <EyeOff className="mr-1 h-3 w-3" />
                Show selected
              </Button>
            </div>
          </div>
        ) : null}
        {sortedRows.map((row, index) => {
          const draft = drafts[row.id] ?? { transferUsd: "", transferLocal: "" };
          const meta = getCurrencyMeta(row.currencyCode);
          // Auto-pick by country code when the built-in catalog doesn't know the
          // currency (e.g. TWD -> TW -> Taiwan flag).
          const derivedFlag =
            flagOverrides[row.currencyCode.toUpperCase()]?.flag?.trim() ||
            meta?.flag ||
            flagFromCurrencyCode(row.currencyCode);
          const changed =
            draft.transferUsd !== (row.transferUsd != null ? String(row.transferUsd) : "") ||
            draft.transferLocal !== (row.transferLocal != null ? String(row.transferLocal) : "");
          const codeSelected = selectedVisibilityCodes.includes(row.currencyCode.toUpperCase());
          return (
            <div
              key={row.id}
              onDragOver={(e) => {
                if (dragIndex === null) return;
                e.preventDefault();
                setOverIndex(index);
              }}
              onDrop={(e) => {
                if (dragIndex === null) return;
                e.preventDefault();
                dropTransferRow(dragIndex, index);
                setDragIndex(null);
                setOverIndex(null);
              }}
              onDragEnd={() => {
                setDragIndex(null);
                setOverIndex(null);
              }}
              className={`grid grid-cols-1 items-end gap-3 rounded-xl border p-3 transition-colors sm:grid-cols-[auto_minmax(120px,160px)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:gap-4 ${
                codeSelected ? "border-primary/40 bg-primary/[0.04] " : ""
              }${
                isHiddenOnCurrentBranch(row.currencyCode)
                  ? "border-dashed border-border/50 bg-muted/25 opacity-60"
                  : "border-border/60 bg-card"
              } ${dragIndex === index ? "opacity-50" : ""} ${
                overIndex === index && dragIndex !== null && dragIndex !== index ? "ring-2 ring-primary/50" : ""
              }`}
            >
              <div className="flex shrink-0 items-center gap-1.5 self-center">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5"
                  checked={codeSelected}
                  aria-label={`Select ${row.currencyCode}`}
                  disabled={busy}
                  onChange={() => toggleTransferVisibilitySelection(row.currencyCode)}
                />
                <button
                  type="button"
                  draggable
                  aria-label={`Drag ${row.currencyCode} to reorder`}
                  title="Drag to reorder on the transfer card"
                  disabled={busy}
                  onDragStart={(e) => {
                    setDragIndex(index);
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", String(index));
                  }}
                  onDragEnd={() => {
                    setDragIndex(null);
                    setOverIndex(null);
                  }}
                  className="hidden cursor-grab touch-none rounded-md p-1 text-muted-foreground hover:bg-muted/60 active:cursor-grabbing sm:flex sm:items-center"
                >
                  <GripVertical className="h-4 w-4" />
                </button>
              </div>
              <div className="flex min-w-0 items-center gap-2">
                <FlagChip
                  flag={derivedFlag ?? "🌍"}
                  currencyCode={row.currencyCode}
                  className="text-xl"
                  chipClassName="!h-[1.3em] !w-[2em] shadow-[0_1px_2px_rgba(0,0,0,0.28)]"
                />
                <div className="min-w-0">
                  <p className="font-semibold">{row.currencyCode}</p>
                  {meta?.name ? (
                    <p className="truncate text-[10px] text-muted-foreground">{meta.name}</p>
                  ) : null}
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-sky-700 dark:text-sky-400">
                  USD
                </Label>
                <Input
                  type="number"
                  step="0.0001"
                  placeholder="—"
                  value={draft.transferUsd}
                  onChange={(e) =>
                    setDrafts((prev) => ({ ...prev, [row.id]: { ...draft, transferUsd: e.target.value } }))
                  }
                  className="h-10 rounded-lg tabular-nums"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-sky-700 dark:text-sky-400">
                  {localLabel}
                </Label>
                <Input
                  type="number"
                  step="0.0001"
                  placeholder="—"
                  value={draft.transferLocal}
                  onChange={(e) =>
                    setDrafts((prev) => ({ ...prev, [row.id]: { ...draft, transferLocal: e.target.value } }))
                  }
                  className="h-10 rounded-lg tabular-nums"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                <Button
                  disabled={busy || !changed}
                  onClick={() => void saveRow(row)}
                  className={`h-9 rounded-lg bg-sky-500 px-4 text-sm font-semibold text-white hover:bg-sky-400 ${
                    changed ? "" : "opacity-50"
                  }`}
                >
                  <Save className="mr-1.5 h-4 w-4" />
                  Publish
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy || sortedRows[0]?.id === row.id}
                  className="h-9 w-9 rounded-lg px-0"
                  title="Move up on the transfer card"
                  aria-label={`Move ${row.currencyCode} up`}
                  onClick={() => moveTransferRow(row, -1)}
                >
                  <ArrowUp className="h-3 w-3" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy || sortedRows[sortedRows.length - 1]?.id === row.id}
                  className="h-9 w-9 rounded-lg px-0"
                  title="Move down on the transfer card"
                  aria-label={`Move ${row.currencyCode} down`}
                  onClick={() => moveTransferRow(row, 1)}
                >
                  <ArrowDown className="h-3 w-3" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  className="h-9 w-9 rounded-lg px-0"
                  title={
                    isHiddenOnCurrentBranch(row.currencyCode)
                      ? "Show on transfer card — this branch, selected, or all"
                      : "Hide from transfer card — this branch, selected, or all"
                  }
                  onClick={() => {
                    const currentlyHidden = isHiddenOnCurrentBranch(row.currencyCode);
                    setVisibilityScope(activeBranches.length > 1 ? "all" : "current");
                    setVisibilityBranchIds(
                      currentBranchId ? [currentBranchId] : activeBranches[0] ? [activeBranches[0].id] : [],
                    );
                    setVisibilityDialog({
                      codes: [row.currencyCode.toUpperCase()],
                      hide: !currentlyHidden,
                    });
                  }}
                >
                  {isHiddenOnCurrentBranch(row.currencyCode) ? (
                    <EyeOff className="h-3 w-3" />
                  ) : (
                    <Eye className="h-3 w-3" />
                  )}
                </Button>
                {canDeleteCurrency ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    className="h-9 w-9 rounded-lg px-0 text-destructive hover:text-destructive"
                    title="Remove from the transfer card on all branches"
                    onClick={() => setRemoveConfirm({ code: row.currencyCode })}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                ) : null}
              </div>
            </div>
          );
        })}
        {sortedRows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border/60 p-4 text-sm text-muted-foreground">
            No transfer rates yet — add currencies below, or upload an Excel file with a Transfer
            sheet (CURRENCY | $ | {localLabel}) above.
          </p>
        ) : null}

        <div className="grid grid-cols-1 items-end gap-3 rounded-xl border border-primary/25 bg-primary/[0.03] p-3 sm:grid-cols-[minmax(120px,160px)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:gap-4">
          <div className="space-y-1">
            <Label className="text-[10px] font-semibold uppercase tracking-wider">Currency</Label>
            <Input
              value={newCode}
              onChange={(e) => setNewCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3))}
              placeholder="USD"
              className="h-10 rounded-lg uppercase"
            />
              {newCode.trim().length >= 2 ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {(() => {
                    const c = newCode.trim().toUpperCase();
                    const meta = getCurrencyMeta(c);
                    const flag = meta?.flag ?? flagFromCurrencyCode(c);
                    return meta
                      ? `${flag ?? ""} ${meta.name} — auto-picked`
                      : flag
                        ? `${flag} New currency — flag auto-picked from "${c.slice(0, 2)}"`
                        : "Type a 3-letter code";
                  })()}
                </p>
              ) : null}
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] font-semibold uppercase tracking-wider">USD</Label>
            <Input
              type="number"
              step="0.0001"
              value={newUsd}
              onChange={(e) => setNewUsd(e.target.value)}
              placeholder="1"
              className="h-10 rounded-lg tabular-nums"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] font-semibold uppercase tracking-wider">{localLabel}</Label>
            <Input
              type="number"
              step="0.0001"
              value={newLocal}
              onChange={(e) => setNewLocal(e.target.value)}
              placeholder="3680"
              className="h-10 rounded-lg tabular-nums"
            />
          </div>
          <Button size="sm" disabled={busy} onClick={() => void addRow()} className="rounded-lg">
            <Plus className="mr-1 h-3 w-3" />
            Add
          </Button>
        </div>
      </div>
      </ContentPanel>

      {/* Confirm BEFORE the uploaded file goes live — transfer rates are
          centralized, so this always applies to every branch at once. */}
      <AlertDialog open={Boolean(pending)} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Money Transfer Rates — review &amp; publish to ALL branches</AlertDialogTitle>
            <AlertDialogDescription>
              {pending
                ? `These ${pending.rows.length} transfer rate(s) will go LIVE on every branch's TV immediately. Transfer rates are centralized: the same rate shows on all branches.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {/* Exactly what will be published — and every value is EDITABLE here,
              so last-second corrections don't need a new file. */}
          {pending ? (
            <div className="max-h-64 space-y-1.5 overflow-y-auto rounded-xl border border-border/50 p-2">
              <div className="grid grid-cols-[90px_1fr_1fr_auto] items-center gap-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <span>Currency</span>
                <span>USD</span>
                <span>{localLabel}</span>
                <span />
              </div>
              {pending.rows.map((r, i) => (
                <div
                  key={`${r.currencyCode}-${i}`}
                  className="grid grid-cols-[90px_1fr_1fr_auto] items-center gap-2 rounded-lg bg-muted/20 p-1.5"
                >
                  {(() => {
                    const code = normalizeCurrencyCode(r.currencyCode) || r.currencyCode.toUpperCase();
                    const isNew = !rows.some((t) => t.currencyCode.toUpperCase() === code);
                    const autoFlag = getCurrencyMeta(code)?.flag ?? flagFromCurrencyCode(code);
                    const shownFlag = r.flag?.trim() || autoFlag || "💱";
                    return (
                      <span className="flex flex-col gap-1 px-1">
                        <span className="inline-flex items-center gap-1 font-mono font-semibold">
                          <span className="text-base leading-none">{shownFlag}</span>
                          {r.currencyCode}
                          {isNew ? (
                            <span className="rounded bg-emerald-500/15 px-1 py-0.5 text-[9px] font-bold text-emerald-600 dark:text-emerald-400">
                              NEW
                            </span>
                          ) : (
                            <span className="text-[9px] font-medium text-muted-foreground">saved ✓</span>
                          )}
                        </span>
                        {isNew ? (
                          <Input
                            value={r.flag ?? ""}
                            aria-label={`Flag for ${r.currencyCode}`}
                            placeholder={autoFlag ? `Auto: ${autoFlag}` : "Flag 🏳️"}
                            onChange={(e) =>
                              setPending((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      rows: prev.rows.map((row, idx) =>
                                        idx === i ? { ...row, flag: e.target.value } : row,
                                      ),
                                    }
                                  : prev,
                              )
                            }
                            className="h-7 w-[80px] rounded-md text-center"
                          />
                        ) : null}
                      </span>
                    );
                  })()}
                  <Input
                    type="number"
                    step="0.0001"
                    placeholder="—"
                    aria-label={`${r.currencyCode} transfer rate in USD`}
                    value={r.transferUsd ?? ""}
                    onChange={(e) =>
                      setPending((prev) =>
                        prev
                          ? {
                              ...prev,
                              rows: prev.rows.map((row, idx) =>
                                idx === i
                                  ? { ...row, transferUsd: e.target.value === "" ? null : Number(e.target.value) }
                                  : row,
                              ),
                            }
                          : prev,
                      )
                    }
                    className="h-9 rounded-lg tabular-nums"
                  />
                  <Input
                    type="number"
                    step="0.0001"
                    placeholder="—"
                    aria-label={`${r.currencyCode} transfer rate in ${localLabel}`}
                    value={r.transferLocal ?? ""}
                    onChange={(e) =>
                      setPending((prev) =>
                        prev
                          ? {
                              ...prev,
                              rows: prev.rows.map((row, idx) =>
                                idx === i
                                  ? { ...row, transferLocal: e.target.value === "" ? null : Number(e.target.value) }
                                  : row,
                              ),
                            }
                          : prev,
                      )
                    }
                    className="h-9 rounded-lg tabular-nums"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-lg px-2 text-destructive hover:text-destructive"
                    title={`Remove ${r.currencyCode} from THIS upload only — it does not delete the live transfer currency`}
                    aria-label={`Remove ${r.currencyCode} from this upload (does not delete the live currency)`}
                    onClick={() =>
                      setPending((prev) =>
                        prev ? { ...prev, rows: prev.rows.filter((_, idx) => idx !== i) } : prev,
                      )
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl"
              disabled={!pending || pending.rows.length === 0}
              onClick={() => void publishPending()}
            >
              Yes, publish
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Guard against accidental deletes on the transfer card. */}
      <AlertDialog open={removeConfirm !== null} onOpenChange={(o) => !o && setRemoveConfirm(null)}>
        <AlertDialogContent className="rounded-2xl sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removeConfirm?.code} from the transfer card?</AlertDialogTitle>
            <AlertDialogDescription>
              This takes {removeConfirm?.code} off the money-transfer card on <strong>every</strong> branch&apos;s
              TV. You can add it back later. Forex (exchange) rates are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                const code = removeConfirm?.code;
                setRemoveConfirm(null);
                if (!code) return;
                void deleteTransferRate(code, actor)
                  .then(() => toast.success(`${code} removed from the transfer card`))
                  .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to remove"));
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={visibilityDialog !== null}
        onOpenChange={(o) => !o && setVisibilityDialog(null)}
      >
        <AlertDialogContent className="rounded-2xl sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {visibilityDialog?.hide ? "Hide" : "Show"}{" "}
              {visibilityDialog && visibilityDialog.codes.length === 1
                ? visibilityDialog.codes[0]
                : `${visibilityDialog?.codes.length ?? 0} currencies`}{" "}
              on which branches?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {visibilityDialog && visibilityDialog.codes.length > 1 ? (
                <span className="mb-1 block font-medium text-foreground">
                  {visibilityDialog.codes.join(", ")}
                </span>
              ) : null}
              Remittance rates are shared, but each branch can hide selected currencies on its own TV.
              Choose this branch, specific branches, or every branch.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-1">
            <div className="flex flex-wrap gap-3">
              {(
                [
                  ["current", "This branch"],
                  ["specific", "Selected branches"],
                  ["all", "All branches"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="radio"
                    checked={visibilityScope === key}
                    onChange={() => {
                      setVisibilityScope(key);
                      if (key === "specific" && visibilityBranchIds.length === 0 && currentBranchId) {
                        setVisibilityBranchIds([currentBranchId]);
                      }
                    }}
                    className="h-3.5 w-3.5"
                  />
                  {label}
                </label>
              ))}
            </div>
            {visibilityScope === "specific" ? (
              <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto rounded-xl border border-border/50 p-2">
                {activeBranches.map((b) => {
                  const on = visibilityBranchIds.includes(b.id);
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() =>
                        setVisibilityBranchIds((prev) =>
                          on ? prev.filter((id) => id !== b.id) : [...prev, b.id],
                        )
                      }
                      className={`rounded-lg border px-2.5 py-1 text-xs ${
                        on
                          ? "border-primary/50 bg-primary/10 text-primary"
                          : "border-border/50 text-muted-foreground"
                      }`}
                    >
                      {b.name}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl" disabled={visibilitySaving}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl"
              disabled={
                visibilitySaving ||
                (visibilityScope === "specific" && visibilityBranchIds.length === 0) ||
                (visibilityScope === "current" && !currentBranchId)
              }
              onClick={(e) => {
                e.preventDefault();
                void confirmTransferVisibility();
              }}
            >
              {visibilitySaving
                ? "Saving…"
                : visibilityDialog?.hide
                  ? visibilityDialog.codes.length > 1
                    ? `Hide ${visibilityDialog.codes.length} currencies`
                    : "Hide currency"
                  : visibilityDialog && visibilityDialog.codes.length > 1
                    ? `Show ${visibilityDialog.codes.length} currencies`
                    : "Show currency"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
