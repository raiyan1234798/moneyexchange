"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Coins,
  Eye,
  EyeOff,
  FileSpreadsheet,
  GripVertical,
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
  saveCurrencyOverride,
} from "@/lib/services/currency-service";
import {
  addBranchRate,
  bulkUpdateRates,
  initializeBranchRates,
  listExchangeRates,
  reorderRates,
  subscribeBranchExchangeRates,
  setForexCurrenciesVisibilityOnBranches,
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
import { BranchCurrencyVisibilityOverview } from "@/components/dashboard/branch-currency-visibility-overview";
import { getRateDisplayLabel } from "@/lib/unimoni-signage";
import {
  buildCurrencyPayload,
  flagFromCurrencyCode,
  getCurrencyMeta,
  isValidCurrencyCode,
  normalizeCurrencyCode,
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
  const { user, profile, hasPermission, hasModule, isBranchUser, isSuperAdmin, isAdmin, isBranchManager } = useAuth();
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
  // Edit-currency-look dialog (flag emoji / name / country) — admins only.
  const [editCurrencyTarget, setEditCurrencyTarget] = useState<Currency | null>(null);
  const [editCurrencyForm, setEditCurrencyForm] = useState({ flag: "", name: "", country: "" });
  const [savingCurrencyEdit, setSavingCurrencyEdit] = useState(false);
  const [loadingInit, setLoadingInit] = useState(false);
  const [currencyForm, setCurrencyForm] = useState(emptyCurrencyForm);
  const [creating, setCreating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [importPreview, setImportPreview] = useState<RateImportRow[] | null>(null);
  const [importMode, setImportMode] = useState<"forex" | "transfer" | "all-in-one">("forex");
  const [dragOver, setDragOver] = useState(false);
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const { notice: loadNotice, onError, clearNotice } = useFirestoreNotice("exchange rates");
  const [lastImport, setLastImport] = useState<{ count: number; at: Date } | null>(null);
  // Scope for the uploaded sheet (admin checkbox in the review pop-up):
  // selected branch only (default) or the same forex rates on ALL branches.
  const [publishScope, setPublishScope] = useState<"branch" | "all">("branch");
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Hide / Show dialog: this branch · selected branches · all branches.
  // Supports one currency (eye button) or many (checkbox multi-select).
  const [visibilityDialog, setVisibilityDialog] = useState<{
    codes: string[];
    hide: boolean;
  } | null>(null);
  const [visibilityScope, setVisibilityScope] = useState<"current" | "specific" | "all">("current");
  const [visibilityBranchIds, setVisibilityBranchIds] = useState<string[]>([]);
  const [visibilitySaving, setVisibilitySaving] = useState(false);
  const [selectedVisibilityCodes, setSelectedVisibilityCodes] = useState<string[]>([]);

  const branch = branches.find((b) => b.id === effectiveBranchId);
  const canCreateCatalog = hasPermission("manageCurrencies");
  // Only users with the "Add new currencies" module (Users page checkbox /
  // feature board) may create currencies — manually or via file upload.
  // Super admins always can. Branch staff without that module cannot.
  const canAddNewCurrencies = isSuperAdmin || hasModule("addBranchCurrencies");
  // For the catalog's "On branches" column: every branch's rates (admins only).
  const [allRates, setAllRates] = useState<ExchangeRate[]>([]);
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
    if (!canCreateCatalog) return;
    return subscribeCollection<ExchangeRate>(
      COLLECTIONS.exchangeRates,
      [],
      (items) => setAllRates(items),
      () => setAllRates([]),
    );
  }, [canCreateCatalog]);

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
    if (!user || !profile || !effectiveBranchId || !canAddNewCurrencies) return;
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

  async function saveRate(rate: ExchangeRate, opts?: { skipGuards?: boolean }) {
    if (!user || !profile || !effectiveBranchId) return;
    const draft = drafts[rate.id];
    if (!draft) return;
    const label = getRateDisplayLabel(rate);
    const hasRateChange = draft.buyRate !== rate.buyRate || draft.sellRate !== rate.sellRate;
    const hasNameChange = draft.displayName.trim() !== label;
    if (!hasRateChange && !hasNameChange) return;

    // SAFETY GUARDS on the customer-facing rate before it goes live on the TV.
    if (hasRateChange && !opts?.skipGuards) {
      const buy = draft.buyRate;
      const sell = draft.sellRate;
      // HARD BLOCK: a blank field becomes 0; zero/negative is never a real rate.
      if (!Number.isFinite(buy) || buy <= 0 || !Number.isFinite(sell) || sell <= 0) {
        toast.error(
          `Enter a real We Buy and We Sell for ${label} — both must be greater than 0. (An empty box counts as 0.)`,
          { duration: 9000 },
        );
        return;
      }
      // WARN + CONFIRM: inverted spread (buy ≥ sell = losing money each deal),
      // or a big jump from the current live rate (likely a typo / decimal slip).
      const warnings: string[] = [];
      if (buy >= sell) {
        warnings.push(
          `We Buy (${buy}) is not lower than We Sell (${sell}). Normally We Sell is higher — otherwise the shop loses money on every exchange.`,
        );
      }
      const pctOff = (next: number, prev: number) =>
        prev > 0 ? Math.abs(next - prev) / prev : 0;
      const buyJump = pctOff(buy, rate.buyRate);
      const sellJump = pctOff(sell, rate.sellRate);
      if (buyJump >= 0.25 || sellJump >= 0.25) {
        const worst = Math.round(Math.max(buyJump, sellJump) * 100);
        warnings.push(
          `This is about ${worst}% different from the current rate (was ${rate.buyRate} / ${rate.sellRate}). Please double-check for a typo.`,
        );
      }
      if (warnings.length > 0) {
        setRateGuardConfirm({ rate, label, warnings });
        return;
      }
    }

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

  /** Newest REAL rates for a code on any branch — so a newly-added branch copy
      starts with live values instead of the 1/1 placeholder. Without this,
      "Add to branch" created rows at 1/1 that went straight to the TV
      (client found SCP/ZMW showing 1/1, 2026-07-27). */
  function seedRatesFor(code: string) {
    const ms = (t: unknown): number => {
      if (!t) return 0;
      const withMillis = t as { toMillis?: () => number };
      if (typeof withMillis.toMillis === "function") return withMillis.toMillis();
      const d = new Date(t as string | number | Date).getTime();
      return Number.isFinite(d) ? d : 0;
    };
    const donor = allRates
      .filter((r) => (r.currencyCode ?? "").toUpperCase() === code.toUpperCase())
      .filter((r) => !(Number(r.buyRate) === 1 && Number(r.sellRate) === 1))
      .sort((a, b) => ms(b.updatedAt) - ms(a.updatedAt))[0];
    return donor
      ? {
          buyRate: donor.buyRate,
          sellRate: donor.sellRate,
          transferUsd: donor.transferUsd ?? null,
          transferLocal: donor.transferLocal ?? null,
        }
      : undefined;
  }

  async function handleAddCurrency(currency: Currency) {
    if (!user || !profile || !effectiveBranchId || !canAddNewCurrencies) return;
    try {
      const seed = seedRatesFor(currency.currencyCode);
      await addBranchRate(
        effectiveBranchId,
        currency,
        {
          userId: user.uid,
          userName: profile.displayName || profile.email,
          branchName: branch?.name || effectiveBranchId,
        },
        seed,
      );
      toast.success(
        seed
          ? `${currency.currencyCode} added with rates ${seed.buyRate}/${seed.sellRate} (copied from another branch) — adjust if needed`
          : `${currency.currencyCode} added to branch rates`,
      );
      setRates(await listExchangeRates(effectiveBranchId));
      setAddOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add currency");
    }
  }

  async function handleCreateCurrency() {
    const code = currencyForm.currencyCode.trim().toUpperCase();
    if (!user || !profile || !effectiveBranchId || !canAddNewCurrencies) return;
    if (!isValidCurrencyCode(code) || !currencyForm.currencyName.trim()) {
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
          { autoCreateCurrencies: false, requireApproval, actorRole: profile.role, allowCreateRates: true },
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

  // The catalog must list EVERY currency that exists anywhere — including
  // codes that only live on some branch's rate list and never got a catalog
  // doc. Those show as "branch-only" rows (name/flag resolved automatically).
  const catalogRows = useMemo(() => {
    const known = new Set(
      currencies.map((c) => (normalizeCurrencyCode(c.currencyCode) || c.currencyCode).toUpperCase()),
    );
    const extras = new Map<string, Currency>();
    for (const r of allRates) {
      const code = (r.currencyCode ?? "").toUpperCase();
      if (!code || known.has(code) || extras.has(code)) continue;
      extras.set(code, {
        id: `branch-only-${code}`,
        currencyCode: code,
        currencyName: "",
        country: "",
        flag: r.flag ?? "",
        sortOrder: 999,
        status: "active",
        isHidden: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    return [
      ...currencies,
      ...[...extras.values()].sort((a, b) => a.currencyCode.localeCompare(b.currencyCode)),
    ].filter(
      // Hide any legacy "ghost" doc that was saved with a blank code (it renders
      // as a broken spinner/— row). Display-only — the doc is left in the DB.
      (c) => ((normalizeCurrencyCode(c.currencyCode) || c.currencyCode) ?? "").trim() !== "",
    );
  }, [currencies, allRates]);
  const isBranchOnlyRow = (c: Currency) => c.id.startsWith("branch-only-");
  // "Manage branches" dialog: remove ONE currency from chosen branches.
  const [manageBranchesFor, setManageBranchesFor] = useState<Currency | null>(null);
  // Publish safety confirm (inverted spread / big jump) — set to open the dialog.
  const [rateGuardConfirm, setRateGuardConfirm] = useState<{
    rate: ExchangeRate;
    label: string;
    warnings: string[];
  } | null>(null);
  // Confirm before removing a currency from the branch (avoid accidental delete).
  const [removeConfirm, setRemoveConfirm] = useState<{ rateId: string; label: string } | null>(null);
  // Drag-to-reorder state for the "Edit rates" list.
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  async function handleReorderDrop(from: number, to: number) {
    if (!user || !profile || !effectiveBranchId) return;
    if (from === to || from < 0 || to < 0 || from >= rates.length || to >= rates.length) return;
    const next = [...rates];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setRates(next); // optimistic — snaps to server order after the write
    try {
      await reorderRates(
        effectiveBranchId,
        next.map((r) => r.id),
        { userId: user.uid, userName: profile.displayName || profile.email },
      );
      toast.success("Order updated");
      setRates(await listExchangeRates(effectiveBranchId));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to reorder");
      setRates(await listExchangeRates(effectiveBranchId));
    }
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
    // Open scope picker for a single currency (eye button).
    const hide = !rate.isHidden;
    setVisibilityScope("current");
    setVisibilityBranchIds(effectiveBranchId ? [effectiveBranchId] : []);
    setVisibilityDialog({ codes: [rate.currencyCode.toUpperCase()], hide });
  }

  function openBulkVisibility(hide: boolean) {
    const codes = selectedVisibilityCodes
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean);
    if (codes.length === 0) {
      toast.error("Select at least one currency");
      return;
    }
    setVisibilityScope("current");
    setVisibilityBranchIds(effectiveBranchId ? [effectiveBranchId] : []);
    setVisibilityDialog({ codes, hide });
  }

  function toggleVisibilitySelection(code: string) {
    const upper = code.toUpperCase();
    setSelectedVisibilityCodes((prev) =>
      prev.includes(upper) ? prev.filter((c) => c !== upper) : [...prev, upper],
    );
  }

  async function confirmVisibilityChange() {
    if (!user || !profile || !visibilityDialog) return;
    const codes = visibilityDialog.codes.map((c) => c.trim().toUpperCase()).filter(Boolean);
    if (codes.length === 0) return;
    const hide = visibilityDialog.hide;
    const active = branches.filter((b) => b.status === "active");
    const targets =
      visibilityScope === "all"
        ? active.map((b) => b.id)
        : visibilityScope === "specific"
          ? visibilityBranchIds.filter(Boolean)
          : effectiveBranchId
            ? [effectiveBranchId]
            : [];
    if (targets.length === 0) {
      toast.error("Pick at least one branch");
      return;
    }
    setVisibilitySaving(true);
    const codeSet = new Set(codes);
    // Optimistic: flip local rows immediately so the dialog can close,
    // then re-sort so hidden currencies sink to the bottom.
    if (effectiveBranchId && targets.includes(effectiveBranchId)) {
      setRates((prev) =>
        [...prev.map((r) =>
          codeSet.has(r.currencyCode.toUpperCase()) ? { ...r, isHidden: hide } : r,
        )].sort((a, b) => {
          const ha = a.isHidden ? 1 : 0;
          const hb = b.isHidden ? 1 : 0;
          if (ha !== hb) return ha - hb;
          return (a.displayOrder ?? 0) - (b.displayOrder ?? 0) || a.currencyCode.localeCompare(b.currencyCode);
        }),
      );
    }
    try {
      const updated = await setForexCurrenciesVisibilityOnBranches(
        codes,
        hide,
        targets,
        { userId: user.uid, userName: profile.displayName || profile.email },
      );
      const label =
        codes.length === 1
          ? codes[0]
          : `${codes.length} currencies (${codes.slice(0, 4).join(", ")}${codes.length > 4 ? "…" : ""})`;
      toast.success(
        hide
          ? `Hidden ${label} on ${targets.length} branch${targets.length === 1 ? "" : "es"} (${updated} rate row${updated === 1 ? "" : "s"})`
          : `Shown ${label} on ${targets.length} branch${targets.length === 1 ? "" : "es"} (${updated} rate row${updated === 1 ? "" : "s"})`,
        { duration: 7000 },
      );
      setVisibilityDialog(null);
      setSelectedVisibilityCodes([]);
      // Refresh in the background — subscribe may already cover it.
      if (effectiveBranchId) {
        void listExchangeRates(effectiveBranchId).then(setRates).catch(() => undefined);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update visibility");
      if (effectiveBranchId) {
        void listExchangeRates(effectiveBranchId).then(setRates).catch(() => undefined);
      }
    } finally {
      setVisibilitySaving(false);
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

  async function handleBulkUpload(file: File, mode: "forex" | "transfer" | "all-in-one" = "forex") {
    if (!user || !profile || !effectiveBranchId) return;
    setUploading(true);
    setImportMode(mode);
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
      if (importMode === "forex" && !hasForex && !hasTransfer) {
        toast.error(`Enter We Buy / We Sell for ${row.currencyCode}`);
        return;
      }
      if (importMode === "transfer" && !hasTransfer) {
        toast.error(`Enter a transfer rate for ${row.currencyCode}`);
        return;
      }
      if (importMode === "all-in-one" && !hasForex && !hasTransfer) {
        toast.error(`Enter We Buy / We Sell or a transfer rate for ${row.currencyCode}`);
        return;
      }
    }
    setUploading(true);
    try {
      const rows = importPreview;
      let forexRows = importMode === "transfer" ? [] : rows.filter((r) => r.buyRate > 0 && r.sellRate > 0);
      const transferRows = importMode === "forex" ? [] : rows.filter((r) => (r.transferUsd ?? 0) > 0 || (r.transferLocal ?? 0) > 0);
      const canEditCentralTransfer = isSuperAdmin || isAdmin;

      // Staff without "Add new currencies" may ONLY update codes already on
      // this branch — they may never introduce brand-new currencies via upload.
      // Unknown codes are rejected (not saved) and named back; known ones still publish.
      if (!canAddNewCurrencies) {
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
            `Not added — ${rejected.join(", ")} ${rejected.length === 1 ? "is" : "are"} not set up on this branch. Only currencies already on this branch can be updated; ask an admin to add ${rejected.length === 1 ? "it" : "them"} or grant Add new currencies.`,
            { duration: 11000 },
          );
        }
        forexRows = forexRows.filter((r) => known.has(r.currencyCode.toUpperCase()));
        if (forexRows.length === 0) {
          // Nothing this user is allowed to publish (transfer is admin-only here).
          setUploading(false);
          setImportPreview(null);
          return;
        }
      }

      // Scope (admin-only choice in the confirm pop-up): the selected branch
      // only, or the SAME forex rates on ALL branches at once.
      const applyAll = scope === "all" && (isSuperAdmin || isAdmin || hasModule("forexRatesAllBranches"));
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
              allowCreateRates: canAddNewCurrencies,
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
          `${result.skippedNeedApproval} new currenc${result.skippedNeedApproval === 1 ? "y" : "ies"} skipped — ask an admin to add them or grant Add new currencies.`,
          { duration: 9000 },
        );
      }
      // NEW currencies whose code the built-in catalog doesn't know: persist the
      // auto-picked (or manually chosen) flag so every TV shows it immediately.
      const knownCatalog = new Set(currencies.map((c) => c.currencyCode.toUpperCase()));
      for (const r of rows) {
        const code = normalizeCurrencyCode(r.currencyCode) || r.currencyCode.toUpperCase();
        if (knownCatalog.has(code) || getCurrencyMeta(code)) continue;
        const finalFlag = r.flag?.trim() || flagFromCurrencyCode(code);
        if (finalFlag && finalFlag !== "💱") {
          await saveCurrencyOverride(code, { flag: finalFlag }, {
            userId: user.uid,
            userName: profile.displayName || profile.email,
          }).catch(() => undefined);
        }
      }

      setRates(await listExchangeRates(effectiveBranchId));
      setImportPreview(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not publish the imported rates");
    } finally {
      setUploading(false);
    }
  }

  // What the publish confirm pop-up will actually publish. Users without
  // "Add new currencies" can only UPDATE codes already on their branch —
  // new codes are rejected (shown in the pop-up) and never added.
  const knownBranchCodes = new Set(rates.map((r) => r.currencyCode.toUpperCase()));
  const importAllowedRows = (importPreview ?? []).filter(
    (r) => canAddNewCurrencies || knownBranchCodes.has(r.currencyCode.toUpperCase()),
  );
  const importRejectedCodes = !canAddNewCurrencies
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

        {isSuperAdmin || isAdmin || hasModule("forexRatesAllBranches") ? (
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
                    if (file) void handleBulkUpload(file, "forex");
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
                    if (file) void handleBulkUpload(file, "forex");
                  }}
                  className={`flex min-h-[110px] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-5 text-center transition-colors ${
                    dragOver
                      ? "border-primary bg-primary/10"
                      : "border-border bg-background/60 hover:border-primary/60 hover:bg-primary/5"
                  } ${uploading ? "pointer-events-none opacity-60" : "cursor-pointer"}`}
                >
                  <Upload className="h-7 w-7 text-primary" />
                  <span className="text-sm font-semibold">
                    {uploading ? "Reading file..." : "Upload Forex Rates (Buy & Sell)"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Excel (.xlsx, .csv) or Photo — shows Forex Buy/Sell rates only
                  </span>
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {/* Pop-up card (Forex Rate Upload Review): review, EDIT,
            choose branch scope and publish — all in one place. */}
        {importPreview ? (
          <Dialog
            open
            onOpenChange={(open) => {
              if (!open) setImportPreview(null);
            }}
          >
            <DialogContent className="max-h-[85vh] overflow-y-auto rounded-2xl sm:max-w-4xl">
              <DialogHeader>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-border/40 pb-3">
                  <DialogTitle>
                    {importMode === "forex"
                      ? "Foreign Exchange Rates — review & publish"
                      : importMode === "transfer"
                        ? "Money Transfer Rates — review & publish"
                        : "All-in-One Exchange & Transfer Rates — review & publish"}
                  </DialogTitle>
                  <div className="flex items-center gap-1 rounded-xl border border-border/50 bg-muted/40 p-1 text-xs shrink-0">
                    <button
                      type="button"
                      onClick={() => setImportMode("forex")}
                      className={`rounded-lg px-2.5 py-1 font-semibold transition-colors ${
                        importMode === "forex"
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      💱 Forex Only
                    </button>
                    <button
                      type="button"
                      onClick={() => setImportMode("transfer")}
                      className={`rounded-lg px-2.5 py-1 font-semibold transition-colors ${
                        importMode === "transfer"
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      💸 Transfer Only
                    </button>
                    <button
                      type="button"
                      onClick={() => setImportMode("all-in-one")}
                      className={`rounded-lg px-2.5 py-1 font-semibold transition-colors ${
                        importMode === "all-in-one"
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      📊 All-in-One
                    </button>
                  </div>
                </div>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                Nothing is live yet — edit or remove rows below; rates go LIVE on the TV immediately after you publish.
                {importMode === "forex"
                  ? " Displaying Forex Buy & Sell rates only."
                  : importMode === "transfer"
                    ? " Displaying Money Transfer rates only."
                    : " Displaying All-in-One rates (Forex + Transfer)."}
                {canAddNewCurrencies
                  ? " New currencies in the file will be added to the selected branch."
                  : " You can update existing currencies only — an upload never adds new currencies to your branch."}
              </p>
            <div className="space-y-2">
              {/* Dynamic column headers based on importMode */}
              <div
                className={`hidden gap-2 px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:grid ${
                  importMode === "forex"
                    ? "sm:grid-cols-[110px_1fr_1fr_1fr_auto]"
                    : importMode === "transfer"
                      ? "sm:grid-cols-[110px_1fr_1fr_auto]"
                      : "sm:grid-cols-[100px_1fr_1fr_1fr_1fr_1fr_auto]"
                }`}
              >
                <span>Currency</span>
                {importMode !== "transfer" ? <span>Name on TV</span> : null}
                {importMode !== "transfer" ? <span>We Buy</span> : null}
                {importMode !== "transfer" ? <span>We Sell</span> : null}
                {importMode !== "forex" ? <span>Transfer USD</span> : null}
                {importMode !== "forex" ? <span>Transfer ({transferLocalLabel})</span> : null}
                <span className="text-right">Remove</span>
              </div>
              {importPreview.map((row, index) => (
                <div
                  key={`${row.currencyCode}-${index}`}
                  className={`grid grid-cols-2 items-center gap-2 rounded-xl border border-border/40 bg-muted/10 p-3 ${
                    importMode === "forex"
                      ? "sm:grid-cols-[110px_1fr_1fr_1fr_auto]"
                      : importMode === "transfer"
                        ? "sm:grid-cols-[110px_1fr_1fr_auto]"
                        : "sm:grid-cols-[100px_1fr_1fr_1fr_1fr_1fr_auto]"
                  }`}
                >
                  {(() => {
                    const code =
                      normalizeCurrencyCode(row.currencyCode) || row.currencyCode.toUpperCase();
                    const isNew = !currencies.some(
                      (c) => c.currencyCode.toUpperCase() === code,
                    );
                    const autoFlag = getCurrencyMeta(code)?.flag ?? flagFromCurrencyCode(code);
                    const shownFlag = row.flag?.trim() || autoFlag || "💱";
                    return (
                      <span className="flex flex-col gap-1">
                        <span className="inline-flex items-center gap-1.5 font-mono font-semibold">
                          <span className="text-base leading-none">{shownFlag}</span>
                          {row.currencyCode}
                          {isNew ? (
                            <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                              NEW
                            </span>
                          ) : (
                            <span className="text-[10px] font-medium text-muted-foreground">saved ✓</span>
                          )}
                        </span>
                        {isNew ? (
                          <Input
                            value={row.flag ?? ""}
                            aria-label={`Flag for ${row.currencyCode}`}
                            placeholder={autoFlag ? `Auto: ${autoFlag}` : "Paste flag 🏳️"}
                            onChange={(e) =>
                              setImportPreview((prev) =>
                                prev
                                  ? prev.map((r, i) => (i === index ? { ...r, flag: e.target.value } : r))
                                  : prev,
                              )
                            }
                            className="h-7 w-[100px] rounded-md text-center"
                          />
                        ) : null}
                      </span>
                    );
                  })()}
                  {importMode !== "transfer" ? (
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
                  ) : null}
                  {importMode !== "transfer" ? (
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
                  ) : null}
                  {importMode !== "transfer" ? (
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
                  ) : null}
                  {importMode !== "forex" ? (
                    <Input
                      type="number"
                      step="0.0001"
                      value={row.transferUsd ?? ""}
                      aria-label="Transfer USD"
                      placeholder="Transfer USD"
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
                  ) : null}
                  {importMode !== "forex" ? (
                    <Input
                      type="number"
                      step="0.0001"
                      value={row.transferLocal ?? ""}
                      aria-label={`Transfer ${transferLocalLabel}`}
                      placeholder={`Transfer ${transferLocalLabel}`}
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

            {/* Users without add permission: currencies not on the branch are named and NEVER added. */}
            {importRejectedCodes.length > 0 ? (
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
                <p className="font-semibold text-amber-600 dark:text-amber-400">
                  Not on your branch — will NOT be published: {importRejectedCodes.join(", ")}
                </p>
                <p className="mt-1 text-muted-foreground">
                  You can only edit or update currencies already on this branch. Ask an admin to
                  add new ones, or grant you the &quot;Add new currencies&quot; permission.
                </p>
              </div>
            ) : null}

            {/* OPTIONAL branch target selector — admins and users granted the
                "Forex rates — ALL branches" module. */}
            {isSuperAdmin || isAdmin || hasModule("forexRatesAllBranches") ? (
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
        {hasModule("transferRates") && user && profile ? (
          <div id="transfer-rates" className="scroll-mt-20">
            <CentralTransferPanel
              actor={{ userId: user.uid, userName: profile.displayName || profile.email }}
              localLabel={transferLocalLabel}
              branches={branches}
              currentBranchId={effectiveBranchId}
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

        {canManageRates && canAddNewCurrencies && effectiveBranchId ? (
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

        {canManageRates && canAddNewCurrencies && effectiveBranchId ? (
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
          <>
            <BranchCurrencyVisibilityOverview branches={branches} rates={allRates} />
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
                data={catalogRows}
                keyExtractor={(c) => c.id}
                // Compact enough to fit the screen: name capped, branches shown
                // as a count (hover/click to expand), and the action buttons stack
                // downward instead of forcing sideways scroll.
                tableClassName="min-w-[780px]"
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
                    width: "w-[180px]",
                    cell: (c) => (
                      <span className="block truncate font-medium">{getCatalogCurrency(c).name}</span>
                    ),
                  },
                  {
                    key: "country",
                    header: "Country",
                    width: "w-[150px]",
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
                    key: "branches",
                    header: "On branches",
                    width: "w-[140px]",
                    hideOnMobile: true,
                    cell: (c) => {
                      const code = getCatalogCurrency(c).code;
                      // Count EVERY branch that carries this currency (including
                      // hidden-on-TV). The old filter skipped isHidden rows, so
                      // "1 branch" appeared while the dialog listed 8.
                      const byBranch = new Map<string, { name: string; hidden: boolean }>();
                      for (const r of allRates) {
                        if ((r.currencyCode ?? "").toUpperCase() !== code) continue;
                        const b = branches.find((x) => x.id === r.branchId);
                        if (!b) continue;
                        const prev = byBranch.get(b.id);
                        if (!prev) {
                          byBranch.set(b.id, { name: b.name, hidden: Boolean(r.isHidden) });
                        } else if (!r.isHidden) {
                          byBranch.set(b.id, { name: b.name, hidden: false });
                        }
                      }
                      const list = [...byBranch.values()];
                      if (list.length === 0) {
                        return <span className="text-xs text-muted-foreground">—</span>;
                      }
                      const hiddenCount = list.filter((x) => x.hidden).length;
                      const title = list
                        .map((x) => (x.hidden ? `${x.name} (hidden)` : x.name))
                        .join(", ");
                      return (
                        <button
                          type="button"
                          onClick={() => setManageBranchesFor(c)}
                          title={title}
                          className="rounded-md px-2 py-0.5 text-left text-xs font-medium text-primary underline-offset-2 hover:bg-primary/10 hover:underline"
                        >
                          <span>
                            {list.length} {list.length === 1 ? "branch" : "branches"}
                          </span>
                          {hiddenCount > 0 ? (
                            <span className="mt-0.5 block text-[10px] font-normal text-amber-600 dark:text-amber-400">
                              {hiddenCount} hidden on TV
                            </span>
                          ) : null}
                        </button>
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
                    width: "w-[132px]",
                    headerClassName: "text-right",
                    className: "text-right",
                    cell: (c) => (
                      <span className="flex flex-col items-stretch gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-lg"
                          onClick={() => {
                            const row = getCatalogCurrency(c);
                            setEditCurrencyTarget(c);
                            setEditCurrencyForm({ flag: row.flag, name: row.name, country: row.country });
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-lg"
                          onClick={() => setManageBranchesFor(c)}
                        >
                          Branches
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-lg"
                          onClick={() => {
                            const actor = { userId: user!.uid, userName: profile!.displayName || profile!.email };
                            const nextStatus = c.status === "active" ? ("inactive" as const) : ("active" as const);
                            void (async () => {
                              if (isBranchOnlyRow(c)) {
                                // Branch-only rows (e.g. SCP) have no catalog doc, so
                                // there is nothing to toggle yet. Materialize a real
                                // catalog entry with the desired status — the row then
                                // becomes a normal catalog row with a working toggle.
                                const resolved = getCatalogCurrency(c);
                                const existing = currencies.find(
                                  (x) => x.currencyCode.toUpperCase() === c.currencyCode.toUpperCase(),
                                );
                                if (existing) {
                                  await toggleCurrencyStatus(existing.id, nextStatus, actor);
                                } else {
                                  await createCurrency(
                                    {
                                      ...buildCurrencyPayload({
                                        currencyCode: c.currencyCode,
                                        currencyName: resolved.name,
                                        country: resolved.country,
                                        flag: resolved.flag,
                                      }),
                                      sortOrder: currencies.length + 1,
                                      status: nextStatus,
                                      isHidden: false,
                                    },
                                    actor,
                                  );
                                }
                              } else {
                                await toggleCurrencyStatus(c.id, nextStatus, actor);
                              }
                            })()
                              .then(() => toast.success(`${c.currencyCode} status updated`))
                              .catch((e) =>
                                toast.error(e instanceof Error ? e.message : "Failed to update status"),
                              );
                          }}
                        >
                          {c.status === "active" ? "Turn off" : "Turn on"}
                        </Button>
                      </span>
                    ),
                  },
                ]}
              />
            )}
          </ContentPanel>
          </>
        ) : null}

        {/* Publish safety net: confirm an inverted spread or a big rate jump
            before it goes live on the customer-facing TV. */}
        <AlertDialog open={rateGuardConfirm !== null} onOpenChange={(o) => !o && setRateGuardConfirm(null)}>
          <AlertDialogContent className="rounded-2xl sm:max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle>Double-check {rateGuardConfirm?.label} before it goes live?</AlertDialogTitle>
              <AlertDialogDescription>
                This shows on your shop TV immediately.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-2">
              {rateGuardConfirm?.warnings.map((w, i) => (
                <p key={i} className="text-sm text-amber-600 dark:text-amber-400">
                  • {w}
                </p>
              ))}
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel className="rounded-xl">Go back &amp; fix</AlertDialogCancel>
              <AlertDialogAction
                className="rounded-xl"
                onClick={() => {
                  const target = rateGuardConfirm?.rate;
                  setRateGuardConfirm(null);
                  if (target) void saveRate(target, { skipGuards: true });
                }}
              >
                Publish anyway
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Guard against accidental deletes — a clear yes/no before a currency
            is pulled from this branch's rate card. */}
        <AlertDialog open={removeConfirm !== null} onOpenChange={(o) => !o && setRemoveConfirm(null)}>
          <AlertDialogContent className="rounded-2xl sm:max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle>Remove {removeConfirm?.label} from this branch?</AlertDialogTitle>
              <AlertDialogDescription>
                This takes {removeConfirm?.label} off this branch&apos;s rate card on the TV. You can add
                it back later from the currency catalog. Rates on other branches are not affected.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="rounded-xl">Keep it</AlertDialogCancel>
              <AlertDialogAction
                className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  const id = removeConfirm?.rateId;
                  setRemoveConfirm(null);
                  if (id) void handleRemove(id);
                }}
              >
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Hide / Show forex currencies on this branch, chosen branches, or all. */}
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
                {visibilityDialog?.hide
                  ? "Hidden currencies stay saved but do not appear on that branch’s TV rate card."
                  : "Shown currencies reappear on the selected branches’ TV rate cards."}
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
                        if (key === "specific" && visibilityBranchIds.length === 0 && effectiveBranchId) {
                          setVisibilityBranchIds([effectiveBranchId]);
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
                  {branches
                    .filter((b) => b.status === "active")
                    .map((b) => {
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
                  (visibilityScope === "specific" && visibilityBranchIds.length === 0)
                }
                onClick={(e) => {
                  e.preventDefault();
                  void confirmVisibilityChange();
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

        {/* Per-branch presence: see every branch carrying this currency and
            remove it from chosen branches (deletes that branch's rate row). */}
        <Dialog open={manageBranchesFor !== null} onOpenChange={(o) => !o && setManageBranchesFor(null)}>
          <DialogContent className="rounded-2xl sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {manageBranchesFor ? getCatalogCurrency(manageBranchesFor).code : ""} — on which branches?
              </DialogTitle>
            </DialogHeader>
            <div className="max-h-80 space-y-2 overflow-y-auto py-2">
              {(() => {
                if (!manageBranchesFor) return null;
                const code = getCatalogCurrency(manageBranchesFor).code;
                // EVERY branch, each with Add or Remove — fully editable here.
                return branches.map((b) => {
                  const carried = allRates.filter(
                    (r) => (r.currencyCode ?? "").toUpperCase() === code && r.branchId === b.id,
                  );
                  const on = carried.length > 0;
                  return (
                    <div
                      key={b.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-border/30 p-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{b.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {b.code}
                          {on
                            ? carried.some((r) => r.isHidden)
                              ? " · on this branch (hidden on TV)"
                              : " · on this branch"
                            : " · not on this branch"}
                        </p>
                      </div>
                      {on ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-lg text-destructive hover:text-destructive"
                          onClick={() => {
                            if (!user || !profile) return;
                            for (const r of carried) {
                              void removeBranchRate(
                                r.id,
                                { userId: user.uid, userName: profile.displayName || profile.email },
                                r.branchId,
                              )
                                .then(() => toast.success(`${code} removed from ${b.name}`))
                                .catch((e) =>
                                  toast.error(e instanceof Error ? e.message : "Failed to remove"),
                                );
                            }
                          }}
                        >
                          Remove
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-lg"
                          onClick={() => {
                            if (!user || !profile) return;
                            const seed = seedRatesFor(code);
                            void addBranchRate(
                              b.id,
                              manageBranchesFor,
                              {
                                userId: user.uid,
                                userName: profile.displayName || profile.email,
                                branchName: b.name,
                              },
                              seed,
                            )
                              .then(() =>
                                toast.success(
                                  seed
                                    ? `${code} added to ${b.name} with rates ${seed.buyRate}/${seed.sellRate} — adjust on that branch if needed`
                                    : `${code} added to ${b.name} — set its rates on that branch`,
                                ),
                              )
                              .catch((e) =>
                                toast.error(e instanceof Error ? e.message : "Failed to add"),
                              );
                          }}
                        >
                          Add
                        </Button>
                      )}
                    </div>
                  );
                });
              })()}
            </div>
          </DialogContent>
        </Dialog>

        {/* Edit how a currency LOOKS everywhere: flag emoji, name, country. */}
        <Dialog open={editCurrencyTarget !== null} onOpenChange={(o) => !o && setEditCurrencyTarget(null)}>
          <DialogContent className="rounded-2xl sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                Edit currency — {editCurrencyTarget ? getCatalogCurrency(editCurrencyTarget).code : ""}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Flag emoji</Label>
                <Input
                  value={editCurrencyForm.flag}
                  onChange={(e) => setEditCurrencyForm((p) => ({ ...p, flag: e.target.value }))}
                  placeholder="🇺🇸"
                  className="rounded-xl"
                />
                <p className="text-xs text-muted-foreground">
                  Shown on the TV rate card and everywhere else. Paste any flag emoji.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={editCurrencyForm.name}
                  onChange={(e) => setEditCurrencyForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="US Dollar"
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label>Country</Label>
                <Input
                  value={editCurrencyForm.country}
                  onChange={(e) => setEditCurrencyForm((p) => ({ ...p, country: e.target.value }))}
                  placeholder="United States"
                  className="rounded-xl"
                />
              </div>
              <Button
                className="w-full rounded-xl"
                disabled={savingCurrencyEdit}
                onClick={() => {
                  if (!editCurrencyTarget || !user || !profile) return;
                  const code = getCatalogCurrency(editCurrencyTarget).code;
                  setSavingCurrencyEdit(true);
                  void saveCurrencyOverride(code, editCurrencyForm, {
                    userId: user.uid,
                    userName: profile.displayName || profile.email,
                  })
                    .then(() => {
                      toast.success(`${code} updated — the TV shows the new look right away`);
                      setEditCurrencyTarget(null);
                    })
                    .catch((e) => toast.error(e instanceof Error ? e.message : "Could not save"))
                    .finally(() => setSavingCurrencyEdit(false));
                }}
              >
                {savingCurrencyEdit ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {canManageRates && canAddNewCurrencies && rates.length === 0 && effectiveBranchId ? (
          <Button onClick={() => void initRates()} disabled={loadingInit || currencies.length === 0} className="rounded-xl">
            <RefreshCw className={`mr-2 h-4 w-4 ${loadingInit ? "animate-spin" : ""}`} />
            Initialize rates from catalog
          </Button>
        ) : null}

        {/* Adding currencies curates the branch list — requires add permission. */}
        {canManageRates && canAddNewCurrencies && effectiveBranchId ? (
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
                ? canAddNewCurrencies
                  ? "Add currencies using New Currency above, then set buy/sell values and click Publish."
                  : "Ask an admin to add currencies to this branch, then set buy/sell values and click Publish."
                : canAddNewCurrencies
                  ? "Upload your Excel file above, or click Initialize from catalog."
                  : "Upload your Excel file above to update rates (existing currencies only)."
            }
          />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Step 3: Forex Rates — edit for {branch?.name ?? "branch"}</CardTitle>
              <p className="text-sm text-muted-foreground">
                Click the pencil to rename how a currency appears on your TV (e.g. change &quot;CANADA CAD&quot; to &quot;CAD&quot;).
                Edit buy/sell values, then click Publish.
              </p>
            </CardHeader>
            <CardContent className="pt-4">
              {!isBranchUser && rates.length > 0 ? (
                <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-border/50 bg-muted/20 px-3 py-2">
                  <label className="flex cursor-pointer items-center gap-2 text-xs font-medium">
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5"
                      checked={
                        rates.length > 0 &&
                        rates.every((r) =>
                          selectedVisibilityCodes.includes(r.currencyCode.toUpperCase()),
                        )
                      }
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedVisibilityCodes(
                            rates.map((r) => r.currencyCode.toUpperCase()),
                          );
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
                      disabled={selectedVisibilityCodes.length === 0 || visibilitySaving}
                      onClick={() => openBulkVisibility(true)}
                    >
                      <Eye className="mr-1 h-3 w-3" />
                      Hide selected
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 rounded-lg"
                      disabled={selectedVisibilityCodes.length === 0 || visibilitySaving}
                      onClick={() => openBulkVisibility(false)}
                    >
                      <EyeOff className="mr-1 h-3 w-3" />
                      Show selected
                    </Button>
                  </div>
                </div>
              ) : null}
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
                  const codeSelected = selectedVisibilityCodes.includes(
                    rate.currencyCode.toUpperCase(),
                  );

                  return (
                    <div
                      key={rate.id}
                      onDragOver={(e) => {
                        if (dragIndex === null) return;
                        e.preventDefault();
                        setOverIndex(index);
                      }}
                      onDrop={(e) => {
                        if (dragIndex === null) return;
                        e.preventDefault();
                        void handleReorderDrop(dragIndex, index);
                      }}
                      onDragEnd={() => {
                        setDragIndex(null);
                        setOverIndex(null);
                      }}
                      className={`grid grid-cols-1 items-end gap-3 rounded-xl border p-3 transition-colors sm:gap-4 ${
                        codeSelected ? "border-primary/40 bg-primary/[0.04]" : ""
                      } ${
                        canManageRates && !isBranchUser
                          ? "sm:grid-cols-[auto_minmax(140px,180px)_minmax(0,1fr)_minmax(0,1fr)_auto]"
                          : "sm:grid-cols-[minmax(140px,180px)_minmax(0,1fr)_minmax(0,1fr)_auto]"
                      } ${
                        rate.isHidden
                          ? "border-dashed border-border/50 bg-muted/25 opacity-60"
                          : "border-border/60 bg-card"
                      } ${dragIndex === index ? "opacity-50" : ""} ${
                        overIndex === index && dragIndex !== null && dragIndex !== index
                          ? "ring-2 ring-primary/50"
                          : ""
                      }`}
                    >
                      {canManageRates && !isBranchUser ? (
                        <div className="flex shrink-0 items-center gap-1.5 self-center">
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5"
                            checked={codeSelected}
                            aria-label={`Select ${rate.currencyCode}`}
                            onChange={() => toggleVisibilitySelection(rate.currencyCode)}
                          />
                          <button
                            type="button"
                            draggable
                            aria-label="Drag to reorder"
                            title="Drag to reorder how this shows on the TV"
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
                      ) : null}
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
                        // Fixed mini-grid: buttons line up in tidy columns instead
                        // of a ragged wrap (client: "UI looks congested").
                        <div className={`grid gap-1.5 ${isBranchUser ? "grid-cols-2 sm:w-[180px]" : "grid-cols-3 sm:w-[250px]"}`}>
                          <Button
                            size="sm"
                            onClick={() => void saveRate(rate)}
                            disabled={!isChanged}
                            title="Save changes to TV displays"
                            className={`h-8 w-full rounded-lg ${isChanged ? "" : "opacity-50"}`}
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
                                className="h-8 w-full rounded-lg px-2"
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
                                className="h-8 w-full rounded-lg px-2"
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
                                className="h-8 w-full rounded-lg px-2"
                                onClick={() => void handleToggleVisibility(rate)}
                                title={
                                  rate.isHidden
                                    ? "Show on TV — this branch, selected, or all"
                                    : "Hide from TV — this branch, selected, or all"
                                }
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
                              className="h-8 w-full rounded-lg px-2 text-destructive hover:text-destructive"
                              onClick={() => setRemoveConfirm({ rateId: rate.id, label: primary })}
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
