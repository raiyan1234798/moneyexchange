"use client";

import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, Plus, Save, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { ContentPanel } from "@/components/shared/page-elements";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  bulkUpsertTransferRates,
  deleteTransferRate,
  setTransferRateHidden,
  subscribeTransferRates,
  upsertTransferRate,
} from "@/lib/services/transfer-rate-service";
import { parseRateFile } from "@/lib/rate-import";
import { getCurrencyMeta } from "@/lib/currency-utils";
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
import type { TransferRate } from "@/lib/types";

type Draft = { transferUsd: string; transferLocal: string };

type PendingUpload = {
  rows: Array<{ currencyCode: string; transferUsd: number | null; transferLocal: number | null }>;
  parsedTotal: number;
};

/**
 * ADMIN-ONLY editor for the centralized money-transfer rates — one set from
 * head office, shown identically on every branch's TRANSFER card. Per the
 * client (2026-07-11): branch staff have no rights here.
 */
export function CentralTransferPanel({
  actor,
  localLabel,
}: {
  actor: { userId: string; userName: string };
  localLabel: string;
}) {
  const [rows, setRows] = useState<TransferRate[]>([]);
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
      setPending({ rows: transferRows, parsedTotal: parsed.length });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read the transfer file");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function publishPending() {
    if (!pending) return;
    const { rows: transferRows, parsedTotal } = pending;
    setPending(null);
    setUploading(true);
    try {
      const count = await bulkUpsertTransferRates(transferRows, actor);
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
      const skipped = parsedTotal - transferRows.length;
      if (skipped > 0) {
        toast.warning(
          `${skipped} row(s) in the file had no readable transfer rate and were skipped.`,
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
    setBusy(true);
    try {
      await upsertTransferRate(
        { currencyCode: row.currencyCode, transferUsd: num(draft.transferUsd), transferLocal: num(draft.transferLocal) },
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
    <ContentPanel
      title="Money Transfer Rate — Update & Upload"
      description="One remittance rate for ALL branches — upload a file or edit below."
    >
      {/* ONE Excel/CSV upload updates the transfer rates on ALL branches at once —
          a BIG drop zone matching the forex upload. */}
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-xl">
          <p className="text-sm font-semibold">Upload one file for ALL branches</p>
          <p className="text-xs text-muted-foreground">
            Excel/CSV with columns CURRENCY | $ (USD) | {localLabel} — updates the transfer card on
            every branch at once. Rates are <strong>T.T Rate : Against USD/{localLabel}</strong> (telegraphic
            transfer against USD and local currency).
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
                ? "border-sky-500 bg-sky-500/10"
                : "border-sky-500/40 bg-background/60 hover:border-sky-500/60 hover:bg-sky-500/5"
            } ${uploading ? "pointer-events-none opacity-60" : "cursor-pointer"}`}
          >
            <Upload className="h-8 w-8 text-sky-600 dark:text-sky-400" />
            <span className="text-sm font-medium">
              {uploading ? "Uploading…" : "Drop the transfer Excel/CSV file here"}
            </span>
            <span className="text-xs text-muted-foreground">
              .xlsx, .xls, .csv — CURRENCY | $ (USD) | {localLabel}
            </span>
            <span className="text-[11px] text-muted-foreground/90">
              T.T Rate : Against USD/{localLabel}
            </span>
          </button>
        </div>
      </div>
      <div className="space-y-2">
        {rows.map((row) => {
          const draft = drafts[row.id] ?? { transferUsd: "", transferLocal: "" };
          const meta = getCurrencyMeta(row.currencyCode);
          const changed =
            draft.transferUsd !== (row.transferUsd != null ? String(row.transferUsd) : "") ||
            draft.transferLocal !== (row.transferLocal != null ? String(row.transferLocal) : "");
          return (
            <div
              key={row.id}
              className={`grid grid-cols-1 items-center gap-3 rounded-xl border p-3 sm:grid-cols-[minmax(120px,160px)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:gap-4 ${
                row.isHidden ? "border-dashed border-border/50 bg-muted/25 opacity-60" : "border-border/60 bg-card"
              }`}
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="shrink-0 text-xl leading-none">{meta?.flag ?? "🌍"}</span>
                <div className="min-w-0">
                  <p className="font-semibold">{row.currencyCode}</p>
                  {meta?.name ? (
                    <p className="truncate text-[10px] text-muted-foreground">{meta.name}</p>
                  ) : null}
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-sky-700 dark:text-sky-400">
                  $ (USD)
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
              <div className="flex items-center gap-1.5 sm:justify-end">
                <Button
                  disabled={busy || !changed}
                  onClick={() => void saveRow(row)}
                  className={`h-10 rounded-lg bg-sky-500 px-5 text-sm font-semibold text-white hover:bg-sky-400 ${
                    changed ? "" : "opacity-50"
                  }`}
                >
                  <Save className="mr-1.5 h-4 w-4" />
                  Publish
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  className="rounded-lg px-2"
                  title={row.isHidden ? "Show on the transfer card" : "Hide from the transfer card"}
                  onClick={() =>
                    void setTransferRateHidden(row.currencyCode, !row.isHidden, actor)
                      .then(() =>
                        toast.success(
                          row.isHidden
                            ? `${row.currencyCode} shown on the transfer card`
                            : `${row.currencyCode} hidden from the transfer card`,
                        ),
                      )
                      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to update"))
                  }
                >
                  {row.isHidden ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  className="rounded-lg px-2"
                  title="Remove from the transfer card on all branches"
                  onClick={() =>
                    void deleteTransferRate(row.currencyCode, actor)
                      .then(() => toast.success(`${row.currencyCode} removed from the transfer card`))
                      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to remove"))
                  }
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          );
        })}
        {rows.length === 0 ? (
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
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] font-semibold uppercase tracking-wider">$ (USD)</Label>
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

      {/* Confirm BEFORE the uploaded file goes live — transfer rates are
          centralized, so this always applies to every branch at once. */}
      <AlertDialog open={Boolean(pending)} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Publish transfer rates to ALL branches?</AlertDialogTitle>
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
                <span>$ (USD)</span>
                <span>{localLabel}</span>
                <span />
              </div>
              {pending.rows.map((r, i) => (
                <div
                  key={`${r.currencyCode}-${i}`}
                  className="grid grid-cols-[90px_1fr_1fr_auto] items-center gap-2 rounded-lg bg-muted/20 p-1.5"
                >
                  <span className="px-1 font-mono font-semibold">{r.currencyCode}</span>
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
                    aria-label={`Remove ${r.currencyCode} from this upload`}
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
    </ContentPanel>
  );
}
