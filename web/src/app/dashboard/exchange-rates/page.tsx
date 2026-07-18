"use client";

import { useEffect, useState, useRef } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Coins,
  Eye,
  EyeOff,
  FileSpreadsheet,
  Pencil,
  Plus,
  Trash2,
  TrendingUp,
  RefreshCw,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { DashboardHeader } from "@/components/layout/dashboard-sidebar";
import { BranchSelector } from "@/components/shared/branch-selector";
import { PreviewDisplayLink } from "@/components/shared/preview-display-link";
import {
  ContentPanel,
  DataTable,
  EmptyState,
  FirestoreSetupNotice,
  FormSection,
  PageShell,
  StatusBadge,
} from "@/components/shared/page-elements";
import { useAuth } from "@/contexts/auth-context";
import { useBranchScope, useContentPermissions } from "@/lib/hooks/use-branch-scope";
import { useFirestoreNotice } from "@/lib/hooks/use-firestore-notice";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { db } from "@/lib/firebase/client";
import { COLLECTIONS, DEFAULT_SYSTEM_SETTINGS } from "@/lib/constants";
import { subscribeCollection, orderBy, where } from "@/lib/firebase/firestore";
import { safeFormatDistanceToNow } from "@/lib/utils/date";
import {
  createCurrency,
  subscribeCurrencies,
  toggleCurrencyStatus,
} from "@/lib/services/currency-service";
import {
  addBranchRate,
  bulkUpdateRates,
  initializeBranchRates,
  listExchangeRates,
  reorderRates,
  subscribeBranchExchangeRates,
  toggleRateVisibility,
  removeBranchRate,
  updateExchangeRate,
} from "@/lib/services/exchange-rate-service";
import {
  approvePendingRate,
  rejectPendingRate,
  subscribePendingApprovals,
} from "@/lib/services/pending-approval-service";
import {
  parseRateFile,
  type RateImportRow,
} from "@/lib/rate-import";
import { ocrRatesFromImage } from "@/lib/ocr-rates";
import { bulkUpsertTransferRates, upsertTransferRate } from "@/lib/services/transfer-rate-service";
import { CentralTransferPanel } from "@/components/dashboard/central-transfer-panel";
import { getRateDisplayLabel } from "@/lib/unimoni-signage";
import {
  buildCurrencyPayload,
  getCurrencyMeta,
  isValidCurrencyCode,
  resolveCurrencyFields,
  titleCaseName,
} from "@/lib/currency-utils";
import type { AuditLog, Currency, ExchangeRate, PendingApproval, SystemSettings } from "@/lib/types";

type RateDraft = { buyRate: number; sellRate: number; displayName: string };

const SETTINGS_ID = "global";

const emptyCurrencyForm = {
  currencyCode: "",
  currencyName: "",
  country: "",
  flag: "",
  buyRate: "",
  sellRate: "",
  transferUsd: "",
  transferLocal: "",
};

export default function ExchangeRatesPage() {
  const { user, profile, hasPermission, isBranchUser, isSuperAdmin, isAdmin, isBranchManager } = useAuth();
  const { branches, effectiveBranchId, setSelectedBranchId } = useBranchScope();
  const { canManageRates } = useContentPermissions();
  const [rates, setRates] = useState<ExchangeRate[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [requireApproval, setRequireApproval] = useState<boolean>(
    DEFAULT_SYSTEM_SETTINGS.requireApprovalForChanges,
  );
  const [drafts, setDrafts] = useState<Record<string, RateDraft>>({});
  const [addOpen, setAddOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [loadingInit, setLoadingInit] = useState(false);
  const [currencyForm, setCurrencyForm] = useState(emptyCurrencyForm);
  const [creating, setCreating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [importPreview, setImportPreview] = useState<RateImportRow[] | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const { notice: loadNotice, onError, clearNotice } = useFirestoreNotice("exchange rates");
  const [lastImport, setLastImport] = useState<{ count: number; at: Date } | null>(null);
  // Scope for the uploaded sheet (admin checkbox in the review pop-up):
  // selected branch only (default) or the same forex rates on ALL branches.
  const [publishScope, setPublishScope] = useState<"branch" | "all">("branch");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const branch = branches.find((b) => b.id === effectiveBranchId);
  const canCreateCatalog = hasPermission("manageCurrencies");
  const transferLocalLabel = branch?.settings?.transferLocalLabel?.trim() || "UGX";

  useEffect(() => {
    return subscribeCurrencies(
      (items) => {
        setCurrencies(items);
        clearNotice();
      },
      onError,
    );
  }, [clearNotice, onError]);

  useEffect(() => {
    const ref = doc(db, COLLECTIONS.settings, SETTINGS_ID);
    return onSnapshot(ref, (snapshot) => {
      const data = snapshot.data() as SystemSettings | undefined;
      setRequireApproval(
        data?.requireApprovalForChanges ?? DEFAULT_SYSTEM_SETTINGS.requireApprovalForChanges,
      );
    });
  }, []);

  useEffect(() => {
    if (!isSuperAdmin && !isAdmin && !isBranchManager) return;
    return subscribePendingApprovals(
      isSuperAdmin ? null : effectiveBranchId ?? null,
      setPendingApprovals,
      onError,
    );
  }, [isSuperAdmin, isAdmin, isBranchManager, effectiveBranchId, onError]);

  useEffect(() => {
    if (!effectiveBranchId) return;
    const unsubscribe = subscribeBranchExchangeRates(
      effectiveBranchId,
      (items) => {
        setRates(items);
        clearNotice();
        // Merge instead of overwrite: keep in-progress edits (draft differs
        // from the incoming server value) so a background snapshot can't wipe
        // what the user is typing.
        setDrafts((prev) =>
          Object.fromEntries(
            items.map((rate) => {
              const server: RateDraft = {
                buyRate: rate.buyRate,
                sellRate: rate.sellRate,
                displayName: getRateDisplayLabel(rate),
              };
              const draft = prev[rate.id];
              const dirty =
                draft &&
                (draft.buyRate !== server.buyRate ||
                  draft.sellRate !== server.sellRate ||
                  draft.displayName !== server.displayName);
              return [rate.id, dirty ? draft : server];
            }),
          ),
        );
      },
      onError,
    );
    return unsubscribe;
  }, [effectiveBranchId, clearNotice, onError]);

  useEffect(() => {
    if (!effectiveBranchId) return;
    // Firestore rules deny audit_logs reads to branch users — skip the listen
    // so their rates page doesn't toast a permission error.
    if (isBranchUser) return;
    return subscribeCollection<AuditLog>(
      COLLECTIONS.auditLogs,
      effectiveBranchId
        ? [where("branchId", "==", effectiveBranchId), orderBy("timestamp", "desc")]
        : [orderBy("timestamp", "desc")],
      (logs) => {
        const hit = logs.find(
          (log) => log.action === "rate_bulk_import" && log.branchId === effectiveBranchId,
        );
        if (!hit) {
          setLastImport(null);
          return;
        }
        const at =
          hit.timestamp instanceof Date
            ? hit.timestamp
            : typeof hit.timestamp === "object" &&
                hit.timestamp !== null &&
                "toDate" in hit.timestamp &&
                typeof hit.timestamp.toDate === "function"
              ? hit.timestamp.toDate()
              : new Date();
        setLastImport({
          count: Number(hit.metadata?.count ?? 0),
          at,
        });
      },
      () => undefined,
    );
  }, [effectiveBranchId, isBranchUser]);

  async function initRates() {
    if (!user || !profile || !effectiveBranchId) return;
    setLoadingInit(true);
    try {
      await initializeBranchRates(effectiveBranchId, currencies, {
        userId: user.uid,
        userName: profile.displayName || profile.email,
        branchName: branch?.name || effectiveBranchId,
      });
      toast.success("Rates initialized for this branch");
      setRates(await listExchangeRates(effectiveBranchId));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to initialize rates");
    } finally {
      setLoadingInit(false);
    }
  }

  async function saveRate(rate: ExchangeRate) {
    if (!user || !profile || !effectiveBranchId) return;
    const draft = drafts[rate.id];
    if (!draft) return;
    const label = getRateDisplayLabel(rate);
    const hasRateChange = draft.buyRate !== rate.buyRate || draft.sellRate !== rate.sellRate;
    const hasNameChange = draft.displayName.trim() !== label;
    if (!hasRateChange && !hasNameChange) return;

    try {
      const result = await updateExchangeRate(rate, draft.buyRate, draft.sellRate, {
        userId: user.uid,
        userName: profile.displayName || profile.email,
        branchName: branch?.name || effectiveBranchId,
      }, "manual", {
        requireApproval,
        actorRole: profile.role,
        displayName: draft.displayName.trim(),
      });
      const name = draft.displayName.trim() || rate.currencyCode;
      if (result === "pending") {
        toast.success(`${name} submitted for manager approval`);
      } else if (hasNameChange && !hasRateChange) {
        toast.success(`Display name updated to "${name}" — visible on TV now`);
      } else {
        toast.success(`${name} published to your TV displays`);
      }
      setEditingNameId(null);
      setRates(await listExchangeRates(effectiveBranchId));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save changes — please try again");
    }
  }

  async function handleAddCurrency(currency: Currency) {
    if (!user || !profile || !effectiveBranchId) return;
    try {
      await addBranchRate(effectiveBranchId, currency, {
        userId: user.uid,
        userName: profile.displayName || profile.email,
        branchName: branch?.name || effectiveBranchId,
      });
      toast.success(`${currency.currencyCode} added to branch rates`);
      setRates(await listExchangeRates(effectiveBranchId));
      setAddOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add currency");
    }
  }

  async function handleCreateCurrency() {
    const code = currencyForm.currencyCode.trim().toUpperCase();
    if (!user || !profile || !effectiveBranchId || !isValidCurrencyCode(code) || !currencyForm.currencyName.trim()) {
      if (!isValidCurrencyCode(code)) {
        toast.error("Currency code must be exactly 3 letters (e.g. USD, CAD)");
      }
      return;
    }
    const buyRate = Number(currencyForm.buyRate);
    const sellRate = Number(currencyForm.sellRate);
    if (!Number.isFinite(buyRate) || buyRate <= 0 || !Number.isFinite(sellRate) || sellRate <= 0) {
      toast.error("Enter positive We Buy and We Sell values");
      return;
    }
    const transferUsd = currencyForm.transferUsd.trim() === "" ? null : Number(currencyForm.transferUsd);
    const transferLocal = currencyForm.transferLocal.trim() === "" ? null : Number(currencyForm.transferLocal);
    if (rates.some((r) => r.currencyCode.toUpperCase() === code)) {
      toast.error(`${code} is already on this branch — edit its rates below instead`);
      return;
    }
    setCreating(true);

    // Transfer values are CENTRALIZED — admins publish them to the shared set
    // used by every branch's transfer card.
    const publishCentralTransfer = async () => {
      if (!(isSuperAdmin || isAdmin) || (!transferUsd && !transferLocal)) return;
      await upsertTransferRate(
        { currencyCode: code, transferUsd, transferLocal },
        { userId: user.uid, userName: profile.displayName || profile.email },
      );
      toast.success(`${code} transfer rate published to ALL branches`);
    };

    // Admins and branch managers can't write the global catalog (superAdmin
    // only) — create the branch rate directly instead; the flag/name resolve
    // from currency metadata on the display.
    if (!canCreateCatalog) {
      try {
        await bulkUpdateRates(
          effectiveBranchId,
          [
            {
              currencyCode: code,
              displayName: code,
              currencyName: currencyForm.currencyName,
              country: currencyForm.country,
              flag: currencyForm.flag,
              buyRate,
              sellRate,
            },
          ],
          {
            userId: user.uid,
            userName: profile.displayName || profile.email,
            branchName: branch?.name || effectiveBranchId,
          },
          { autoCreateCurrencies: false, requireApproval, actorRole: profile.role },
        );
        await publishCentralTransfer();
        toast.success(`${code} published — live on your display at Buy ${buyRate} / Sell ${sellRate}`);
        setCreateOpen(false);
        setCurrencyForm(emptyCurrencyForm);
        setRates(await listExchangeRates(effectiveBranchId));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to add currency");
      } finally {
        setCreating(false);
      }
      return;
    }

    try {
      const payload = buildCurrencyPayload({
        currencyCode: code,
        currencyName: currencyForm.currencyName,
        country: currencyForm.country,
        flag: currencyForm.flag,
      });
      const currencyId = await createCurrency(
        {
          ...payload,
          sortOrder: currencies.length + 1,
          status: "active",
          isHidden: false,
        },
        { userId: user.uid, userName: profile.displayName || profile.email },
      );
      await addBranchRate(
        effectiveBranchId,
        {
          id: currencyId,
          ...payload,
          sortOrder: currencies.length + 1,
          status: "active",
          isHidden: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          userId: user.uid,
          userName: profile.displayName || profile.email,
          branchName: branch?.name || effectiveBranchId,
        },
        { buyRate, sellRate },
      );
      await publishCentralTransfer();
      toast.success(
        `${payload.currencyCode} published — live on your display at Buy ${buyRate} / Sell ${sellRate}`,
      );
      setCreateOpen(false);
      setCurrencyForm(emptyCurrencyForm);
      setRates(await listExchangeRates(effectiveBranchId));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create currency");
    } finally {
      setCreating(false);
    }
  }

  function handleCurrencyCodeChange(raw: string) {
    const code = raw.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3);
    const meta = getCurrencyMeta(code);
    setCurrencyForm((prev) => ({
      ...prev,
      currencyCode: code,
      ...(meta && code.length === 3
        ? {
            currencyName: prev.currencyName || meta.name,
            country: prev.country || meta.country,
            flag: prev.flag || meta.flag,
          }
        : {}),
    }));
  }

  function getCatalogCurrency(currency: Currency) {
    return resolveCurrencyFields(currency);
  }

  function getBranchRateLabel(rate: ExchangeRate) {
    const catalog = currencies.find((c) => c.currencyCode === rate.currencyCode);
    const resolved = catalog
      ? resolveCurrencyFields(catalog)
      : resolveCurrencyFields({
          currencyCode: rate.currencyCode,
          currencyName: "",
          country: "",
          flag: "",
        });
    const displayLabel = rate.displayName?.trim() || getRateDisplayLabel(rate);
    const primary =
      displayLabel && displayLabel.toUpperCase() !== rate.currencyCode
        ? displayLabel
        : resolved.name;
    return { primary, resolved, displayLabel };
  }

  async function handleRemove(rateId: string) {
    if (!user || !profile || !effectiveBranchId) return;
    try {
      await removeBranchRate(
        rateId,
        { userId: user.uid, userName: profile.displayName || profile.email },
        effectiveBranchId,
      );
      toast.success("Currency removed from branch rates");
      setRates(await listExchangeRates(effectiveBranchId));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove currency");
    }
  }

  async function handleToggleVisibility(rate: ExchangeRate) {
    if (!user || !profile || !effectiveBranchId) return;
    try {
      await toggleRateVisibility(
        rate.id,
        !rate.isHidden,
        { userId: user.uid, userName: profile.displayName || profile.email },
        effectiveBranchId,
      );
      toast.success(rate.isHidden ? "Currency shown on display" : "Currency hidden from display");
      setRates(await listExchangeRates(effectiveBranchId));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update visibility");
    }
  }

  async function handleMove(rate: ExchangeRate, direction: "up" | "down") {
    if (!user || !profile || !effectiveBranchId) return;
    const currentOrder = [...rates];
    const idx = currentOrder.findIndex((r) => r.id === rate.id);
    if (idx === -1) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= currentOrder.length) return;

    [currentOrder[idx], currentOrder[swapIdx]] = [currentOrder[swapIdx], currentOrder[idx]];
    try {
      await reorderRates(
        effectiveBranchId,
        currentOrder.map((r) => r.id),
        { userId: user.uid, userName: profile.displayName || profile.email },
      );
      toast.success("Order updated");
      setRates(await listExchangeRates(effectiveBranchId));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to reorder");
    }
  }

  async function handleBulkUpload(file: File) {
    if (!user || !profile || !effectiveBranchId) return;
    setUploading(true);
    try {
      // Nothing is published yet — the parsed rows go to a review table where
      // the user can edit or remove lines before publishing. Photos of a rate
      // board go through the AI reader; Excel/CSV through the sheet parser.
      const isImage = file.type.startsWith("image/") || /\.(png|jpe?g|webp)$/i.test(file.name);
      if (isImage) {
        toast.info(
          "Reading the photo… the AI can take up to a minute — please wait, don't re-upload. (An Excel/CSV file is instant.)",
          { duration: 60000 },
        );
      }
      const rows = isImage ? await ocrRatesFromImage(file) : await parseRateFile(file);
      setPublishScope("branch");
      setImportPreview(rows);
      toast.success(
        `${rows.length} rows read — review${isImage ? " carefully (photo import)" : ""} and edit below, then Publish`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not import file — check the template columns");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handlePublishImport(scope: "branch" | "all" = "branch") {
    if (!user || !profile || !effectiveBranchId || !importPreview) return;
    for (const row of importPreview) {
      const hasForex = row.buyRate > 0 && row.sellRate > 0;
      const hasTransfer = (row.transferUsd ?? 0) > 0 || (row.transferLocal ?? 0) > 0;
      // Allow transfer-only rows (buy/sell blank) — they update only the transfer card.
      if (!hasForex && !hasTransfer) {
        toast.error(`Enter We Buy / We Sell, or a transfer rate — check ${row.currencyCode}`);
        return;
      }
      if ((row.buyRate > 0) !== (row.sellRate > 0)) {
        toast.error(`Enter BOTH We Buy and We Sell (or leave both blank) — check ${row.currencyCode}`);
        return;
      }
    }
    setUploading(true);
    try {
      const rows = importPreview;
      // FOREX rows go to THIS branch. TRANSFER values are CENTRALIZED (head
      // office, same for all branches): admins publish them to the shared set;
      // branch staff imports simply skip them.
      let forexRows = rows.filter((r) => r.buyRate > 0 && r.sellRate > 0);
      const transferRows = rows.filter((r) => (r.transferUsd ?? 0) > 0 || (r.transferLocal ?? 0) > 0);
      const canEditCentralTransfer = isSuperAdmin || isAdmin;

      // Branch users can ONLY update currencies the admin has already added to
      // this branch — they may never introduce brand-new currencies via an
      // upload (per client). Any code not already on the branch is rejected
      // (not saved) and named back to them; the known ones still publish.
      if (isBranchUser) {
        const known = new Set(rates.map((r) => r.currencyCode.toUpperCase()));
        const rejected = [
          ...new Set(
            forexRows
              .filter((r) => !known.has(r.currencyCode.toUpperCase()))
              .map((r) => r.currencyCode.toUpperCase()),
          ),
        ];
        if (rejected.length > 0) {
          toast.error(
            `Not added — ${rejected.join(", ")} ${rejected.length === 1 ? "is" : "are"} not set up on this branch. Only currencies your admin has added can be updated; ask your admin to add ${rejected.length === 1 ? "it" : "them"} first.`,
            { duration: 11000 },
          );
        }
        forexRows = forexRows.filter((r) => known.has(r.currencyCode.toUpperCase()));
        if (forexRows.length === 0) {
          // Nothing a branch user is allowed to publish (transfer is admin-only).
          setUploading(false);
          setImportPreview(null);
          return;
        }
      }

      // Scope (admin-only choice in the confirm pop-up): the selected branch
      // only, or the SAME forex rates on ALL branches at once.
      const applyAll = scope === "all" && (isSuperAdmin || isAdmin);
      const targetBranches = applyAll
        ? branches
        : branches.filter((b) => b.id === effectiveBranchId);
      if (targetBranches.length === 0) {
        targetBranches.push({ id: effectiveBranchId, name: branch?.name ?? effectiveBranchId } as (typeof branches)[number]);
      }

      const mappedForex = forexRows.map((r) => ({
        currencyCode: r.currencyCode,
        displayName: r.displayName,
        currencyName: r.currencyName,
        country: r.country,
        flag: r.flag,
        buyRate: r.buyRate,
        sellRate: r.sellRate,
      }));
      const result = { processed: 0, created: 0, skippedNeedApproval: 0 };
      if (forexRows.length > 0) {
        for (const target of targetBranches) {
          const r = await bulkUpdateRates(
            target.id,
            mappedForex,
            {
              userId: user.uid,
              userName: profile.displayName || profile.email,
              branchName: target.name || target.id,
            },
            {
              autoCreateCurrencies: canCreateCatalog,
              requireApproval,
              actorRole: profile.role,
            },
          );
          result.processed += r.processed;
          result.created += r.created;
          result.skippedNeedApproval += r.skippedNeedApproval;
        }
      }

      if (transferRows.length > 0 && canEditCentralTransfer) {
        const count = await bulkUpsertTransferRates(
          transferRows.map((r) => ({
            currencyCode: r.currencyCode,
            transferUsd: r.transferUsd ?? null,
            transferLocal: r.transferLocal ?? null,
          })),
          { userId: user.uid, userName: profile.displayName || profile.email },
        );
        toast.success(`${count} transfer rates published to ALL branches`);
      } else if (transferRows.length > 0 && !canEditCentralTransfer) {
        toast.info(
          "Transfer rates are set centrally by the admins — the Transfer sheet was skipped.",
          { duration: 8000 },
        );
      }

      const branchLabel = branch?.name ?? effectiveBranchId;
      const updatedCount = result.processed - result.skippedNeedApproval;
      if (forexRows.length > 0) {
        toast.success(
          requireApproval && isBranchUser
            ? `${updatedCount} rate change${updatedCount === 1 ? "" : "s"} submitted for approval`
            : applyAll
              ? `${forexRows.length} currencies updated on ALL ${targetBranches.length} branches — live on every TV`
              : `${result.processed} currencies updated for ${branchLabel} — live on your displays`,
          { duration: 8000 },
        );
      }
      if (result.skippedNeedApproval > 0) {
        toast.warning(
          `${result.skippedNeedApproval} new currenc${result.skippedNeedApproval === 1 ? "y" : "ies"} skipped — ask your branch manager to add new currencies.`,
          { duration: 9000 },
        );
      }
      setRates(await listExchangeRates(effectiveBranchId));
      setImportPreview(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not publish the imported rates");
    } finally {
      setUploading(false);
    }
  }

  // What the publish confirm pop-up will actually publish. Branch users can
  // only UPDATE currencies already on their branch — new codes are rejected
  // (shown in the pop-up) and never added.
  const knownBranchCodes = new Set(rates.map((r) => r.currencyCode.toUpperCase()));
  const importAllowedRows = (importPreview ?? []).filter(
    (r) => !isBranchUser || knownBranchCodes.has(r.currencyCode.toUpperCase()),
  );
  const importRejectedCodes = isBranchUser
    ? [
        ...new Set(
          (importPreview ?? [])
            .filter((r) => !knownBranchCodes.has(r.currencyCode.toUpperCase()))
            .map((r) => r.currencyCode.toUpperCase()),
        ),
      ]
    : [];
  const availableCurrencies = currencies.filter((c) => {
    if (c.status !== "active" || c.isHidden) return false;
    const existing = rates.find((r) => r.currencyCode === c.currencyCode);
    return !existing || existing.isHidden;
  });

  return (
    <>
      <DashboardHeader
        title="Exchange Rates"
        description="Import rates from Excel or edit buy/sell values — changes appear on your TV display instantly."
        accent="emerald"
      />
      <PageShell accent="emerald">
        <FirestoreSetupNotice message={loadNotice} />

        {isSuperAdmin || isAdmin ? (
          <BranchSelector
            branches={branches}
            value={effectiveBranchId}
            onChange={setSelectedBranchId}
            label="Step 1: Select branch"
            helperText="Choose which shop location you are updating — rates are saved per branch."
          />
        ) : branch ? (
          <p className="text-sm text-muted-foreground">
            Managing rates for: <strong>{branch.name}</strong>
          </p>
        ) : null}

        {canManageRates && effectiveBranchId ? (
          <div className="overflow-hidden rounded-2xl border border-border/60 bg-card p-5 sm:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-xl">
                <div className="flex items-center gap-2 text-foreground">
                  <FileSpreadsheet className="h-5 w-5" />
                  <p className="text-base font-semibold tracking-tight">Foreign Exchange Rate: Update &amp; Upload</p>
                </div>
                {lastImport ? (
                  <p className="mt-3 text-xs font-medium text-muted-foreground">
                    Last import: {lastImport.count} currencies for {branch?.name ?? "this branch"} ·{" "}
                    {safeFormatDistanceToNow(lastImport.at, { addSuffix: true })}
                  </p>
                ) : null}
              </div>
              <div className="flex w-full shrink-0 flex-col gap-3 lg:max-w-sm">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls,image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
                  aria-label="Import rates from Excel, CSV, or a photo of a rate board"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleBulkUpload(file);
                  }}
                />
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file) void handleBulkUpload(file);
                  }}
                  className={`flex min-h-[120px] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors ${
                    dragOver
                      ? "border-primary bg-primary/10"
                      : "border-border bg-background/60 hover:border-primary/60 hover:bg-primary/5"
                  } ${uploading ? "pointer-events-none opacity-60" : "cursor-pointer"}`}
                >
                  <Upload className="h-8 w-8 text-primary" />
                  <span className="text-sm font-medium">
                    {uploading ? "Working… photos take up to a minute — please wait" : "Drop Excel file OR a photo of your rate board"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    .xlsx, .xls, .csv — or a .jpg/.png photo (AI reads the rates)
                  </span>
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {/* Pop-up card (same style as the Money Transfer upload): review, EDIT,
            choose scope and publish — all in one place. */}
        {importPreview ? (
          <Dialog
            open
            onOpenChange={(open) => {
              if (!open) setImportPreview(null);
            }}
          >
            <DialogContent className="max-h-[85vh] overflow-y-auto rounded-2xl sm:max-w-4xl">
              <DialogHeader>
                <DialogTitle>Foreign Exchange Rate — review &amp; publish</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                Nothing is live yet — edit or remove rows below; the rates go LIVE on the TV
                immediately after you publish.
                {isSuperAdmin || isAdmin
                  ? " Transfer-rate columns always apply to every branch (centralized)."
                  : " You can update existing currencies only — an upload never adds new currencies to your branch."}
              </p>
            <div className="space-y-2">
              {/* Column headers so you can tell which box is which while editing. */}
              <div
                className={`hidden gap-2 px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:grid ${
                  isSuperAdmin || isAdmin
                    ? "sm:grid-cols-[110px_1fr_1fr_1fr_1fr_1fr_auto]"
                    : "sm:grid-cols-[110px_1fr_1fr_1fr_auto]"
                }`}
              >
                <span>Currency</span>
                <span>Name on TV</span>
                <span>We Buy</span>
                <span>We Sell</span>
                {isSuperAdmin || isAdmin ? (
                  <>
                    <span>Transfer USD</span>
                    <span>Transfer ({transferLocalLabel})</span>
                  </>
                ) : null}
                <span className="text-right">Remove</span>
              </div>
              {importPreview.map((row, index) => (
                <div
                  key={`${row.currencyCode}-${index}`}
                  className={`grid grid-cols-2 items-center gap-2 rounded-xl border border-border/40 bg-muted/10 p-3 ${
                    isSuperAdmin || isAdmin
                      ? "sm:grid-cols-[110px_1fr_1fr_1fr_1fr_1fr_auto]"
                      : "sm:grid-cols-[110px_1fr_1fr_1fr_auto]"
                  }`}
                >
                  <span className="font-mono font-semibold">{row.currencyCode}</span>
                  <Input
                    value={row.displayName}
                    aria-label="Name shown on TV"
                    placeholder="Name on TV"
                    onChange={(e) =>
                      setImportPreview((prev) =>
                        prev ? prev.map((r, i) => (i === index ? { ...r, displayName: e.target.value } : r)) : prev,
                      )
                    }
                    className="rounded-lg"
                  />
                  <Input
                    type="number"
                    value={Number.isFinite(row.buyRate) ? row.buyRate : ""}
                    aria-label="We buy"
                    placeholder="We buy"
                    onChange={(e) =>
                      setImportPreview((prev) =>
                        prev ? prev.map((r, i) => (i === index ? { ...r, buyRate: Number(e.target.value) } : r)) : prev,
                      )
                    }
                    className="rounded-lg tabular-nums"
                  />
                  <Input
                    type="number"
                    value={Number.isFinite(row.sellRate) ? row.sellRate : ""}
                    aria-label="We sell"
                    placeholder="We sell"
                    onChange={(e) =>
                      setImportPreview((prev) =>
                        prev ? prev.map((r, i) => (i === index ? { ...r, sellRate: Number(e.target.value) } : r)) : prev,
                      )
                    }
                    className="rounded-lg tabular-nums"
                  />
                  {/* Transfer values are centralized (all branches) — admin-only. */}
                  {isSuperAdmin || isAdmin ? (
                    <>
                      <Input
                        type="number"
                        value={row.transferUsd ?? ""}
                        aria-label="Transfer rate in USD — all branches (optional)"
                        placeholder="$ transfer"
                        onChange={(e) =>
                          setImportPreview((prev) =>
                            prev
                              ? prev.map((r, i) =>
                                  i === index
                                    ? { ...r, transferUsd: e.target.value === "" ? null : Number(e.target.value) }
                                    : r,
                                )
                              : prev,
                          )
                        }
                        className="rounded-lg tabular-nums"
                      />
                      <Input
                        type="number"
                        value={row.transferLocal ?? ""}
                        aria-label="Transfer rate in local currency — all branches (optional)"
                        placeholder="UGX transfer"
                        onChange={(e) =>
                          setImportPreview((prev) =>
                            prev
                              ? prev.map((r, i) =>
                                  i === index
                                    ? { ...r, transferLocal: e.target.value === "" ? null : Number(e.target.value) }
                                    : r,
                                )
                              : prev,
                          )
                        }
                        className="rounded-lg tabular-nums"
                      />
                    </>
                  ) : null}
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-lg text-destructive hover:text-destructive"
                    onClick={() =>
                      setImportPreview((prev) => (prev ? prev.filter((_, i) => i !== index) : prev))
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>

            {/* Branch users: currencies not on the branch are named and NEVER added. */}
            {importRejectedCodes.length > 0 ? (
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
                <p className="font-semibold text-amber-600 dark:text-amber-400">
                  Not on your branch — will NOT be published: {importRejectedCodes.join(", ")}
                </p>
                <p className="mt-1 text-muted-foreground">
                  You can only edit or update the currencies your admin has added. Ask your
                  admin to add new currencies first.
                </p>
              </div>
            ) : null}

            {/* OPTIONAL all-branches checkbox — ADMINS ONLY. Unchecked (default)
                publishes to the selected branch only. */}
            {isSuperAdmin || isAdmin ? (
              <div className="flex items-start gap-3 rounded-xl border border-border/50 bg-muted/30 p-3">
                <Checkbox
                  id="publish-all-branches"
                  checked={publishScope === "all"}
                  onCheckedChange={(value) => setPublishScope(value === true ? "all" : "branch")}
                />
                <div className="space-y-0.5">
                  <Label
                    htmlFor="publish-all-branches"
                    className="cursor-pointer text-sm font-medium"
                  >
                    Also apply these forex rates to ALL branches
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Unchecked: rates change only on{" "}
                    <strong>{branch?.name ?? "the selected branch"}</strong>. Checked: the
                    same rates go live on every branch&apos;s TV at once.
                  </p>
                </div>
              </div>
            ) : null}

            <DialogFooter className="pt-1">
              <Button variant="outline" className="rounded-xl" onClick={() => setImportPreview(null)}>
                Cancel import
              </Button>
              <Button
                className="rounded-xl"
                disabled={uploading || importAllowedRows.length === 0}
                onClick={() => void handlePublishImport(publishScope)}
              >
                <Upload className="mr-2 h-4 w-4" />
                {uploading
                  ? "Publishing…"
                  : `Publish ${importAllowedRows.length} rate${importAllowedRows.length === 1 ? "" : "s"}${
                      publishScope === "all" ? " to ALL branches" : ""
                    }`}
              </Button>
            </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : null}

        {/* Money Transfer card sits DIRECTLY under the Forex card — its own
            separate upload (one file → ALL branches), per the client. */}
        {(isSuperAdmin || isAdmin) && user && profile ? (
          <div id="transfer-rates" className="scroll-mt-20">
            <CentralTransferPanel
              actor={{ userId: user.uid, userName: profile.displayName || profile.email }}
              localLabel={transferLocalLabel}
            />
          </div>
        ) : null}

        <PreviewDisplayLink branchCode={branch?.code} />

        {isAdmin && effectiveBranchId && !canManageRates ? (
          <p className="text-sm text-muted-foreground">
            View-only access — you can see rates but cannot edit them.
          </p>
        ) : null}

        {(isSuperAdmin || isAdmin || isBranchManager) && pendingApprovals.length > 0 ? (
          <ContentPanel
            title="Pending Rate Approvals"
            description={`${pendingApprovals.length} change${pendingApprovals.length === 1 ? "" : "s"} awaiting review`}
          >
            <div className="space-y-2">
              {pendingApprovals.map((approval) => (
                <div
                  key={approval.id}
                  className="flex flex-col gap-3 rounded-xl border border-border/50 bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium">
                      {approval.currencyCode} — {approval.branchName ?? approval.branchId}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Buy {approval.previousBuyRate} → {approval.proposedBuyRate} · Sell{" "}
                      {approval.previousSellRate} → {approval.proposedSellRate}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Requested by {approval.requestedByName}
                    </p>
                  </div>
                  {isSuperAdmin || isAdmin || isBranchManager ? (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="rounded-lg"
                      onClick={() =>
                        void approvePendingRate(approval, {
                          userId: user!.uid,
                          userName: profile!.displayName || profile!.email,
                        })
                          .then(() => toast.success(`${approval.currencyCode} approved`))
                          .catch((e) =>
                            toast.error(e instanceof Error ? e.message : "Approval failed"),
                          )
                      }
                    >
                      <Check className="mr-1 h-3.5 w-3.5" />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-lg"
                      onClick={() =>
                        void rejectPendingRate(approval, {
                          userId: user!.uid,
                          userName: profile!.displayName || profile!.email,
                        })
                          .then(() => toast.success(`${approval.currencyCode} rejected`))
                          .catch((e) =>
                            toast.error(e instanceof Error ? e.message : "Reject failed"),
                          )
                      }
                    >
                      <X className="mr-1 h-3.5 w-3.5" />
                      Reject
                    </Button>
                  </div>
                  ) : (
                    <span className="shrink-0 rounded-lg bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                      Awaiting branch manager
                    </span>
                  )}
                </div>
              ))}
            </div>
          </ContentPanel>
        ) : null}

        {canManageRates && !isBranchUser && effectiveBranchId ? (
          <ContentPanel
            title="Add New Currency"
            description="Two ways: create one manually here, or upload the Excel file above and review before publishing"
            action={
              <Button className="rounded-xl" size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                New Currency
              </Button>
            }
          >
            <p className="text-sm text-muted-foreground">
              Enter a 3-letter code (e.g. JPY), its name, and your We Buy / We Sell values — one
              click saves and publishes it straight to this branch&apos;s display.
            </p>
          </ContentPanel>
        ) : null}

        {canManageRates && !isBranchUser && effectiveBranchId ? (
              <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogContent className="rounded-2xl sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Add Currency</DialogTitle>
                  </DialogHeader>
                  <FormSection title="Currency Details" className="sm:grid-cols-1">
                    <div className="space-y-2 sm:col-span-2">
                      <Label>Code</Label>
                      <Input
                        value={currencyForm.currencyCode}
                        onChange={(e) => handleCurrencyCodeChange(e.target.value)}
                        placeholder="USD"
                        maxLength={3}
                        className="rounded-xl uppercase"
                      />
                      <p className="text-xs text-muted-foreground">Exactly 3 letters (ISO code)</p>
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label>Name</Label>
                      <Input
                        value={currencyForm.currencyName}
                        onChange={(e) => setCurrencyForm((p) => ({ ...p, currencyName: e.target.value }))}
                        onBlur={(e) =>
                          setCurrencyForm((p) => ({ ...p, currencyName: titleCaseName(e.target.value) }))
                        }
                        placeholder="US Dollar"
                        className="rounded-xl"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Country</Label>
                      <Input
                        value={currencyForm.country}
                        onChange={(e) => setCurrencyForm((p) => ({ ...p, country: e.target.value }))}
                        placeholder="United States"
                        className="rounded-xl"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Flag Emoji</Label>
                      <Input
                        value={currencyForm.flag}
                        onChange={(e) => setCurrencyForm((p) => ({ ...p, flag: e.target.value }))}
                        placeholder="🇺🇸"
                        className="rounded-xl"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>We Buy</Label>
                      <Input
                        type="number"
                        min={0}
                        value={currencyForm.buyRate}
                        onChange={(e) => setCurrencyForm((p) => ({ ...p, buyRate: e.target.value }))}
                        placeholder="e.g. 3625"
                        className="rounded-xl tabular-nums"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>We Sell</Label>
                      <Input
                        type="number"
                        min={0}
                        value={currencyForm.sellRate}
                        onChange={(e) => setCurrencyForm((p) => ({ ...p, sellRate: e.target.value }))}
                        placeholder="e.g. 3685"
                        className="rounded-xl tabular-nums"
                      />
                    </div>
                    {/* Transfer rates are centralized: admins only, publish to ALL branches. */}
                    {isSuperAdmin || isAdmin ? (
                      <>
                        <div className="space-y-2">
                          <Label>Transfer USD — all branches, optional</Label>
                          <Input
                            type="number"
                            min={0}
                            value={currencyForm.transferUsd}
                            onChange={(e) => setCurrencyForm((p) => ({ ...p, transferUsd: e.target.value }))}
                            placeholder="Money-transfer rate in USD"
                            className="rounded-xl tabular-nums"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Transfer {transferLocalLabel} — all branches, optional</Label>
                          <Input
                            type="number"
                            min={0}
                            value={currencyForm.transferLocal}
                            onChange={(e) => setCurrencyForm((p) => ({ ...p, transferLocal: e.target.value }))}
                            placeholder="Money-transfer rate in local currency"
                            className="rounded-xl tabular-nums"
                          />
                        </div>
                      </>
                    ) : null}
                  </FormSection>
                  <DialogFooter>
                    <Button
                      onClick={() => void handleCreateCurrency()}
                      disabled={
                        creating ||
                        !isValidCurrencyCode(currencyForm.currencyCode) ||
                        !currencyForm.currencyName.trim() ||
                        !(Number(currencyForm.buyRate) > 0) ||
                        !(Number(currencyForm.sellRate) > 0) ||
                        !effectiveBranchId
                      }
                      className="rounded-xl"
                    >
                      {creating ? "Publishing…" : "Save & Publish to Branch"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
        ) : null}

        {canCreateCatalog ? (
          <ContentPanel
            title="Currency Catalog"
            description="Global currencies available to all branches"
          >
            {currencies.length === 0 ? (
              <EmptyState
                title="No currencies yet"
                description="Create your first currency — it will be added to the selected branch automatically."
                icon={Coins}
              />
            ) : (
              <DataTable
                data={currencies}
                keyExtractor={(c) => c.id}
                mobileTitle={(c) => {
                  const row = getCatalogCurrency(c);
                  return `${row.flag} ${row.code}`;
                }}
                columns={[
                  {
                    key: "code",
                    header: "Code",
                    width: "w-[88px]",
                    cell: (c) => {
                      const row = getCatalogCurrency(c);
                      return (
                        <span className="inline-flex items-center gap-1.5 font-mono font-semibold tabular-nums">
                          <span className="text-base leading-none">{row.flag}</span>
                          {row.code}
                        </span>
                      );
                    },
                  },
                  {
                    key: "name",
                    header: "Name",
                    cell: (c) => (
                      <span className="block truncate font-medium">{getCatalogCurrency(c).name}</span>
                    ),
                  },
                  {
                    key: "country",
                    header: "Country",
                    width: "w-[160px]",
                    hideOnMobile: true,
                    cell: (c) => {
                      const country = getCatalogCurrency(c).country;
                      return (
                        <span className="block truncate text-muted-foreground">
                          {country || "—"}
                        </span>
                      );
                    },
                  },
                  {
                    key: "status",
                    header: "Status",
                    width: "w-[100px]",
                    cell: (c) => <StatusBadge status={c.status} />,
                  },
                  {
                    key: "actions",
                    header: "Actions",
                    width: "w-[100px]",
                    headerClassName: "text-right",
                    className: "text-right",
                    cell: (c) => (
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-lg"
                        onClick={() =>
                          void toggleCurrencyStatus(
                            c.id,
                            c.status === "active" ? "inactive" : "active",
                            { userId: user!.uid, userName: profile!.displayName || profile!.email },
                          )
                            .then(() => toast.success(`${c.currencyCode} status updated`))
                            .catch((e) =>
                              toast.error(e instanceof Error ? e.message : "Failed to update status"),
                            )
                        }
                      >
                        Toggle
                      </Button>
                    ),
                  },
                ]}
              />
            )}
          </ContentPanel>
        ) : null}

        {canManageRates && !isBranchUser && rates.length === 0 && effectiveBranchId ? (
          <Button onClick={() => void initRates()} disabled={loadingInit || currencies.length === 0} className="rounded-xl">
            <RefreshCw className={`mr-2 h-4 w-4 ${loadingInit ? "animate-spin" : ""}`} />
            Initialize rates from catalog
          </Button>
        ) : null}

        {/* Adding currencies curates the branch list — not for branch users. */}
        {canManageRates && !isBranchUser && effectiveBranchId ? (
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger
              render={
                <Button variant="outline" className="rounded-xl">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Existing Currency to Branch
                </Button>
              }
            />
            <DialogContent className="rounded-2xl sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Add Currency to Branch</DialogTitle>
              </DialogHeader>
              <div className="max-h-72 space-y-2 overflow-y-auto py-2">
                {availableCurrencies.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    All catalog currencies are already on this branch.
                  </p>
                ) : (
                  availableCurrencies.map((currency) => {
                    const row = resolveCurrencyFields(currency);
                    return (
                    <button
                      key={currency.id}
                      type="button"
                      onClick={() => void handleAddCurrency(currency)}
                      className="flex w-full items-center gap-3 rounded-xl border border-border/30 p-3 text-left transition-colors hover:bg-muted/40"
                    >
                      <span className="text-2xl">{row.flag}</span>
                      <div>
                        <p className="font-medium">{row.code}</p>
                        <p className="text-xs text-muted-foreground">{row.name}</p>
                      </div>
                    </button>
                    );
                  })
                )}
              </div>
            </DialogContent>
          </Dialog>
        ) : null}

        {!effectiveBranchId ? (
          <EmptyState
            title="Select a branch first"
            description="Choose your shop location above, then upload Excel rates or edit buy/sell values below."
          />
        ) : rates.length === 0 ? (
          <EmptyState
            title="No rates for this branch yet"
            description={
              currencies.length === 0
                ? "Add currencies using New Currency above, then set buy/sell values and click Publish."
                : "Upload your Excel file above, or click Initialize from catalog."
            }
          />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Step 3: Edit rates for {branch?.name ?? "branch"}</CardTitle>
              <p className="text-sm text-muted-foreground">
                Click the pencil to rename how a currency appears on your TV (e.g. change &quot;CANADA CAD&quot; to &quot;CAD&quot;).
                Edit buy/sell values, then click Publish.
              </p>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="space-y-2">
                {rates.map((rate, index) => {
                  const draft = drafts[rate.id];
                  const savedLabel = getRateDisplayLabel(rate);
                  const { primary, resolved } = getBranchRateLabel(rate);
                  const isChanged =
                    draft &&
                    (draft.buyRate !== rate.buyRate ||
                      draft.sellRate !== rate.sellRate ||
                      draft.displayName.trim() !== savedLabel);
                  const isEditingName = editingNameId === rate.id;

                  return (
                    <div
                      key={rate.id}
                      className={`grid grid-cols-1 items-center gap-3 rounded-xl border p-3 transition-colors sm:grid-cols-[minmax(140px,180px)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:gap-4 ${
                        rate.isHidden
                          ? "border-dashed border-border/50 bg-muted/25 opacity-60"
                          : "border-border/60 bg-card"
                      }`}
                    >
                      <div className="flex min-w-0 items-start gap-2">
                        <span className="shrink-0 text-xl leading-none">{resolved.flag}</span>
                        <div className="min-w-0 flex-1">
                          {isEditingName && canManageRates ? (
                            <div className="space-y-1">
                              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                Display name
                              </Label>
                              <Input
                                value={draft?.displayName ?? savedLabel}
                                autoFocus
                                onChange={(e) =>
                                  setDrafts((prev) => ({
                                    ...prev,
                                    [rate.id]: { ...prev[rate.id], displayName: e.target.value },
                                  }))
                                }
                                onBlur={() => setEditingNameId(null)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") setEditingNameId(null);
                                  if (e.key === "Escape") {
                                    setDrafts((prev) => ({
                                      ...prev,
                                      [rate.id]: { ...prev[rate.id], displayName: savedLabel },
                                    }));
                                    setEditingNameId(null);
                                  }
                                }}
                                className="h-9 rounded-lg text-sm font-bold uppercase"
                              />
                              <p className="text-[10px] text-muted-foreground">Code: {rate.currencyCode}</p>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1">
                              <span className="truncate text-sm font-bold">{primary}</span>
                              {/* Renaming curates the display — not for branch users. */}
                              {canManageRates && !isBranchUser ? (
                                <button
                                  type="button"
                                  title="Edit display name on TV"
                                  aria-label="Edit display name"
                                  onClick={() => setEditingNameId(rate.id)}
                                  className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                                >
                                  <Pencil className="h-3 w-3" />
                                </button>
                              ) : null}
                            </div>
                          )}
                          {!isEditingName ? (
                            <span className="text-[10px] text-muted-foreground">
                              {rate.currencyCode}
                              {resolved.name !== primary ? ` · ${resolved.name}` : ""} · v{rate.version}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                          We Buy
                        </Label>
                        <Input
                          type="number"
                          step="0.0001"
                          value={draft?.buyRate ?? rate.buyRate}
                          disabled={!canManageRates}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [rate.id]: { ...prev[rate.id], buyRate: Number(e.target.value) },
                            }))
                          }
                          className="h-10 w-full rounded-lg border-emerald-600/25 bg-emerald-500/5 text-foreground tabular-nums dark:text-emerald-400"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                          We Sell
                        </Label>
                        <Input
                          type="number"
                          step="0.0001"
                          value={draft?.sellRate ?? rate.sellRate}
                          disabled={!canManageRates}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [rate.id]: { ...prev[rate.id], sellRate: Number(e.target.value) },
                            }))
                          }
                          className="h-10 w-full rounded-lg border-amber-600/25 bg-amber-500/5 text-foreground tabular-nums dark:text-amber-400"
                        />
                      </div>
                      {canManageRates ? (
                        <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
                          <Button
                            size="sm"
                            onClick={() => void saveRate(rate)}
                            disabled={!isChanged}
                            title="Save changes to TV displays"
                            className={`rounded-lg ${isChanged ? "" : "opacity-50"}`}
                          >
                            <TrendingUp className="mr-1 h-3 w-3" />
                            Publish
                          </Button>
                          {/* Reorder/Hide curate the display — branch users get
                              ONLY forex edit + publish (per client, 2026-07-11). */}
                          {!isBranchUser ? (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                className="rounded-lg px-2"
                                onClick={() => void handleMove(rate, "up")}
                                disabled={index === 0}
                                title="Move up on display"
                              >
                                <ArrowUp className="mr-1 h-3 w-3" />
                                Up
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="rounded-lg px-2"
                                onClick={() => void handleMove(rate, "down")}
                                disabled={index === rates.length - 1}
                                title="Move down on display"
                              >
                                <ArrowDown className="mr-1 h-3 w-3" />
                                Down
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="rounded-lg px-2"
                                onClick={() => void handleToggleVisibility(rate)}
                                title={rate.isHidden ? "Show on TV display" : "Hide from TV display"}
                              >
                                {rate.isHidden ? (
                                  <>
                                    <EyeOff className="mr-1 h-3 w-3" />
                                    Show
                                  </>
                                ) : (
                                  <>
                                    <Eye className="mr-1 h-3 w-3" />
                                    Hide
                                  </>
                                )}
                              </Button>
                            </>
                          ) : null}
                          {isSuperAdmin || isAdmin || isBranchManager ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="rounded-lg px-2 text-destructive hover:text-destructive"
                              onClick={() => void handleRemove(rate.id)}
                              title="Remove from branch rates"
                            >
                              <Trash2 className="mr-1 h-3 w-3" />
                              Remove
                            </Button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </PageShell>
    </>
  );
}
