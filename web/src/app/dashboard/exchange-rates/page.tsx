"use client";

import { useEffect, useState, useRef } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Coins,
  Download,
  Eye,
  EyeOff,
  FileSpreadsheet,
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
  FormSection,
  PageShell,
  StatusBadge,
} from "@/components/shared/page-elements";
import { useAuth } from "@/contexts/auth-context";
import { useBranchScope, useContentPermissions } from "@/lib/hooks/use-branch-scope";
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
import { db } from "@/lib/firebase/client";
import { COLLECTIONS, DEFAULT_SYSTEM_SETTINGS } from "@/lib/constants";
import { subscribeCollection, orderBy } from "@/lib/firebase/firestore";
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
  downloadRateTemplateCsv,
  downloadRateTemplateXlsx,
  parseRateFile,
  TEMPLATE_CURRENCIES,
} from "@/lib/rate-import";
import type { AuditLog, Currency, ExchangeRate, PendingApproval, SystemSettings } from "@/lib/types";

const SETTINGS_ID = "global";

const emptyCurrencyForm = {
  currencyCode: "",
  currencyName: "",
  country: "",
  flag: "",
};

export default function ExchangeRatesPage() {
  const { user, profile, hasPermission, isBranchUser, isSuperAdmin, isAdmin } = useAuth();
  const { branches, effectiveBranchId, setSelectedBranchId } = useBranchScope();
  const { canManageRates } = useContentPermissions();
  const [rates, setRates] = useState<ExchangeRate[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [requireApproval, setRequireApproval] = useState<boolean>(
    DEFAULT_SYSTEM_SETTINGS.requireApprovalForChanges,
  );
  const [drafts, setDrafts] = useState<Record<string, { buyRate: number; sellRate: number }>>({});
  const [addOpen, setAddOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [loadingInit, setLoadingInit] = useState(false);
  const [currencyForm, setCurrencyForm] = useState(emptyCurrencyForm);
  const [creating, setCreating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [lastImport, setLastImport] = useState<{ count: number; at: Date } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const branch = branches.find((b) => b.id === effectiveBranchId);
  const canCreateCatalog = hasPermission("manageCurrencies");

  useEffect(() => {
    return subscribeCurrencies(setCurrencies, (error) => {
      toast.error(error.message || "Failed to load currencies");
    });
  }, []);

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
    if (!isSuperAdmin && !isAdmin) return;
    return subscribePendingApprovals(
      isSuperAdmin ? null : effectiveBranchId ?? null,
      setPendingApprovals,
      (error) => toast.error(error.message || "Failed to load pending approvals"),
    );
  }, [isSuperAdmin, isAdmin, effectiveBranchId]);

  useEffect(() => {
    if (!effectiveBranchId) return;
    const unsubscribe = subscribeBranchExchangeRates(
      effectiveBranchId,
      (items) => {
        setRates(items);
        setDrafts(
          Object.fromEntries(
            items.map((rate) => [rate.id, { buyRate: rate.buyRate, sellRate: rate.sellRate }]),
          ),
        );
      },
      (error) => toast.error(error.message || "Failed to load rates"),
    );
    return unsubscribe;
  }, [effectiveBranchId]);

  useEffect(() => {
    if (!effectiveBranchId) return;
    return subscribeCollection<AuditLog>(
      COLLECTIONS.auditLogs,
      [orderBy("timestamp", "desc")],
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
  }, [effectiveBranchId]);

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
    try {
      const result = await updateExchangeRate(rate, draft.buyRate, draft.sellRate, {
        userId: user.uid,
        userName: profile.displayName || profile.email,
        branchName: branch?.name || effectiveBranchId,
      }, "manual", {
        requireApproval,
        actorRole: profile.role,
      });
      if (result === "pending") {
        toast.success(`${rate.currencyCode} submitted for admin approval`);
      } else {
        toast.success(`${rate.currencyCode} rate published to displays`);
      }
      setRates(await listExchangeRates(effectiveBranchId));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to publish rate");
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
    if (!user || !profile || !effectiveBranchId || !currencyForm.currencyCode || !currencyForm.currencyName) {
      return;
    }
    setCreating(true);
    try {
      const currencyId = await createCurrency(
        {
          ...currencyForm,
          currencyCode: currencyForm.currencyCode.toUpperCase(),
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
          currencyCode: currencyForm.currencyCode.toUpperCase(),
          currencyName: currencyForm.currencyName,
          country: currencyForm.country,
          flag: currencyForm.flag,
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
      );
      toast.success(`${currencyForm.currencyCode.toUpperCase()} created and added to branch`);
      setCreateOpen(false);
      setCurrencyForm(emptyCurrencyForm);
      setRates(await listExchangeRates(effectiveBranchId));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create currency");
    } finally {
      setCreating(false);
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
      const rows = await parseRateFile(file);
      const count = await bulkUpdateRates(
        effectiveBranchId,
        rows.map((r) => ({
          currencyCode: r.currencyCode,
          buyRate: r.buyRate,
          sellRate: r.sellRate,
        })),
        {
          userId: user.uid,
          userName: profile.displayName || profile.email,
          branchName: branch?.name || effectiveBranchId,
        },
        {
          autoCreateCurrencies: canCreateCatalog,
          requireApproval,
          actorRole: profile.role,
        },
      );
      toast.success(
        requireApproval && isBranchUser
          ? `Submitted ${count} rates for admin approval`
          : `Updated ${count} rates for branch ${branch?.name ?? effectiveBranchId}`,
      );
      setRates(await listExchangeRates(effectiveBranchId));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to import rates");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

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
        {canManageRates && effectiveBranchId ? (
          <div className="overflow-hidden rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/15 via-emerald-500/5 to-transparent p-5 sm:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-xl">
                <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                  <FileSpreadsheet className="h-5 w-5" />
                  <p className="text-sm font-semibold">Import Rates from Excel</p>
                </div>
                <h2 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">
                  Update all currencies in one upload
                </h2>
                <ol className="mt-3 space-y-1.5 text-sm text-muted-foreground">
                  <li>
                    <strong className="text-foreground">Step 1:</strong> Download the template (14 currencies)
                  </li>
                  <li>
                    <strong className="text-foreground">Step 2:</strong> Fill in <strong>WE BUY</strong> and{" "}
                    <strong>WE SELL</strong> columns in Excel
                  </li>
                  <li>
                    <strong className="text-foreground">Step 3:</strong> Upload the file — rates appear on every
                    display instantly
                  </li>
                </ol>
                <p className="mt-3 text-xs text-muted-foreground">
                  Columns: CURRENCY | WE BUY | WE SELL — {TEMPLATE_CURRENCIES.join(", ")}
                </p>
                {lastImport ? (
                  <p className="mt-3 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                    Last import: {lastImport.count} currencies ·{" "}
                    {safeFormatDistanceToNow(lastImport.at, { addSuffix: true })}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-col gap-3 sm:flex-row lg:flex-col">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleBulkUpload(file);
                  }}
                />
                <Button
                  size="lg"
                  className="h-12 rounded-xl px-6"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="mr-2 h-5 w-5" />
                  {uploading ? "Importing..." : "Upload Excel File"}
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="h-12 rounded-xl px-6"
                  onClick={() => downloadRateTemplateXlsx()}
                >
                  <Download className="mr-2 h-5 w-5" />
                  Download Excel Template
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-xl text-muted-foreground"
                  onClick={() => downloadRateTemplateCsv()}
                >
                  <Download className="mr-2 h-4 w-4" />
                  CSV template (alternative)
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {isSuperAdmin || isAdmin ? (
          <BranchSelector branches={branches} value={effectiveBranchId} onChange={setSelectedBranchId} />
        ) : branch ? (
          <p className="text-sm text-muted-foreground">
            Managing rates for: <strong>{branch.name}</strong>
          </p>
        ) : null}

        <PreviewDisplayLink branchCode={branch?.code} />

        {isAdmin && effectiveBranchId && !canManageRates ? (
          <p className="text-sm text-muted-foreground">
            View-only access — you can see rates but cannot edit them.
          </p>
        ) : null}

        {(isSuperAdmin || isAdmin) && pendingApprovals.length > 0 ? (
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
                </div>
              ))}
            </div>
          </ContentPanel>
        ) : null}

        {canCreateCatalog ? (
          <ContentPanel
            title="Currency Catalog"
            description="Global currencies available to all branches"
          >
            <div className="mb-4 flex flex-wrap gap-2">
              <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogTrigger
                  render={
                    <Button className="rounded-xl" disabled={!effectiveBranchId}>
                      <Plus className="mr-2 h-4 w-4" />
                      New Currency + Branch Rate
                    </Button>
                  }
                />
                <DialogContent className="rounded-2xl sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Add Currency</DialogTitle>
                  </DialogHeader>
                  <FormSection title="Currency Details">
                    <div className="space-y-2">
                      <Label>Code</Label>
                      <Input
                        value={currencyForm.currencyCode}
                        onChange={(e) =>
                          setCurrencyForm((p) => ({ ...p, currencyCode: e.target.value.toUpperCase() }))
                        }
                        placeholder="USD"
                        className="rounded-xl"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Name</Label>
                      <Input
                        value={currencyForm.currencyName}
                        onChange={(e) => setCurrencyForm((p) => ({ ...p, currencyName: e.target.value }))}
                        className="rounded-xl"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Country</Label>
                      <Input
                        value={currencyForm.country}
                        onChange={(e) => setCurrencyForm((p) => ({ ...p, country: e.target.value }))}
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
                  </FormSection>
                  <DialogFooter>
                    <Button
                      onClick={() => void handleCreateCurrency()}
                      disabled={creating || !currencyForm.currencyCode || !currencyForm.currencyName || !effectiveBranchId}
                      className="rounded-xl"
                    >
                      {creating ? "Creating..." : "Create & Add to Branch"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

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
                mobileTitle={(c) => `${c.flag} ${c.currencyCode}`}
                columns={[
                  {
                    key: "code",
                    header: "Code",
                    cell: (c) => (
                      <span className="font-medium">
                        {c.flag} {c.currencyCode}
                      </span>
                    ),
                  },
                  { key: "name", header: "Name", cell: (c) => c.currencyName },
                  { key: "country", header: "Country", cell: (c) => c.country, hideOnMobile: true },
                  { key: "status", header: "Status", cell: (c) => <StatusBadge status={c.status} /> },
                  {
                    key: "actions",
                    header: "Actions",
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

        {canManageRates && rates.length === 0 && effectiveBranchId ? (
          <Button onClick={() => void initRates()} disabled={loadingInit || currencies.length === 0} className="rounded-xl">
            <RefreshCw className={`mr-2 h-4 w-4 ${loadingInit ? "animate-spin" : ""}`} />
            Initialize rates from catalog
          </Button>
        ) : null}

        {canManageRates && effectiveBranchId ? (
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
                  availableCurrencies.map((currency) => (
                    <button
                      key={currency.id}
                      type="button"
                      onClick={() => void handleAddCurrency(currency)}
                      className="flex w-full items-center gap-3 rounded-xl border border-border/30 p-3 text-left transition-colors hover:bg-muted/40"
                    >
                      <span className="text-2xl">{currency.flag}</span>
                      <div>
                        <p className="font-medium">{currency.currencyCode}</p>
                        <p className="text-xs text-muted-foreground">{currency.currencyName}</p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </DialogContent>
          </Dialog>
        ) : null}

        {!effectiveBranchId ? (
          <EmptyState title="Select a branch" description="Choose a branch to manage its exchange rates." />
        ) : rates.length === 0 ? (
          <EmptyState
            title="No rates for this branch"
            description={
              currencies.length === 0
                ? "Step 2: Add currencies using New Currency + Branch Rate above, then set buy/sell values."
                : "Step 2: Click Initialize rates from catalog, edit buy/sell values, then Publish each currency."
            }
          />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>{branch?.name ?? "Branch"} Rates</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {rates.map((rate, index) => {
                  const draft = drafts[rate.id];
                  const isChanged =
                    draft &&
                    (draft.buyRate !== rate.buyRate || draft.sellRate !== rate.sellRate);

                  return (
                    <div
                      key={rate.id}
                      className={`flex flex-col gap-3 rounded-xl border p-4 transition-colors sm:flex-row sm:items-center sm:gap-4 ${
                        rate.isHidden
                          ? "border-dashed border-border/50 bg-muted/25 opacity-60"
                          : "border-border/60 bg-card"
                      }`}
                    >
                      <div className="flex min-w-[100px] items-center gap-2.5">
                        <span className="text-xl">
                          {currencies.find((c) => c.currencyCode === rate.currencyCode)?.flag ?? "💱"}
                        </span>
                        <div>
                          <span className="text-sm font-bold">{rate.currencyCode}</span>
                          <span className="ml-2 text-[10px] text-muted-foreground">v{rate.version}</span>
                        </div>
                      </div>

                      <div className="flex flex-1 gap-3">
                        <div className="flex-1 space-y-1">
                          <Label className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                            Buy
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
                            className="h-10 rounded-lg border-emerald-600/25 bg-emerald-500/5 text-foreground dark:text-emerald-400"
                          />
                        </div>
                        <div className="flex-1 space-y-1">
                          <Label className="text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                            Sell
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
                            className="h-10 rounded-lg border-amber-600/25 bg-amber-500/5 text-foreground dark:text-amber-400"
                          />
                        </div>
                      </div>

                      {canManageRates ? (
                        <div className="flex items-center gap-1.5">
                          <Button
                            size="sm"
                            onClick={() => void saveRate(rate)}
                            disabled={!isChanged}
                            className={`rounded-lg ${isChanged ? "" : "opacity-50"}`}
                          >
                            <TrendingUp className="mr-1 h-3 w-3" />
                            Publish
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            className="rounded-lg"
                            onClick={() => void handleMove(rate, "up")}
                            disabled={index === 0}
                          >
                            <ArrowUp className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            className="rounded-lg"
                            onClick={() => void handleMove(rate, "down")}
                            disabled={index === rates.length - 1}
                          >
                            <ArrowDown className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            className="rounded-lg"
                            onClick={() => void handleToggleVisibility(rate)}
                            title={rate.isHidden ? "Show on display" : "Hide from display"}
                          >
                            {rate.isHidden ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            className="rounded-lg text-destructive hover:text-destructive"
                            onClick={() => void handleRemove(rate.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
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
