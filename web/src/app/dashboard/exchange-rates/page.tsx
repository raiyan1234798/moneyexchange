"use client";

import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Coins,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  TrendingUp,
  RefreshCw,
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
import {
  createCurrency,
  subscribeCurrencies,
  toggleCurrencyStatus,
} from "@/lib/services/currency-service";
import {
  addBranchRate,
  initializeBranchRates,
  listExchangeRates,
  reorderRates,
  subscribeBranchExchangeRates,
  toggleRateVisibility,
  removeBranchRate,
  updateExchangeRate,
} from "@/lib/services/exchange-rate-service";
import type { Currency, ExchangeRate } from "@/lib/types";

const emptyCurrencyForm = {
  currencyCode: "",
  currencyName: "",
  country: "",
  flag: "",
};

export default function ExchangeRatesPage() {
  const { user, profile, hasPermission } = useAuth();
  const { branches, effectiveBranchId, setSelectedBranchId, isSuperAdmin } = useBranchScope();
  const { canManageRates } = useContentPermissions();
  const [rates, setRates] = useState<ExchangeRate[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [drafts, setDrafts] = useState<Record<string, { buyRate: number; sellRate: number }>>({});
  const [addOpen, setAddOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [loadingInit, setLoadingInit] = useState(false);
  const [currencyForm, setCurrencyForm] = useState(emptyCurrencyForm);
  const [creating, setCreating] = useState(false);

  const branch = branches.find((b) => b.id === effectiveBranchId);
  const canCreateCatalog = hasPermission("manageCurrencies");

  useEffect(() => {
    return subscribeCurrencies(setCurrencies, (error) => {
      toast.error(error.message || "Failed to load currencies");
    });
  }, []);

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
      await updateExchangeRate(rate, draft.buyRate, draft.sellRate, {
        userId: user.uid,
        userName: profile.displayName || profile.email,
        branchName: branch?.name || effectiveBranchId,
      });
      toast.success(`${rate.currencyCode} rate published to displays`);
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

  const availableCurrencies = currencies.filter((c) => {
    if (c.status !== "active" || c.isHidden) return false;
    const existing = rates.find((r) => r.currencyCode === c.currencyCode);
    return !existing || existing.isHidden;
  });

  return (
    <>
      <DashboardHeader
        title="Exchange Rates"
        description="Manage the global currency catalog and branch-specific buy/sell rates for displays."
        accent="emerald"
      />
      <PageShell accent="emerald">
        {isSuperAdmin ? (
          <BranchSelector branches={branches} value={effectiveBranchId} onChange={setSelectedBranchId} />
        ) : branch ? (
          <p className="text-sm text-muted-foreground">
            Managing rates for: <strong>{branch.name}</strong>
          </p>
        ) : null}

        <PreviewDisplayLink branchCode={branch?.code} />

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
                          ? "border-dashed border-white/5 bg-white/[0.02] opacity-60"
                          : "border-white/10 bg-white/[0.03]"
                      }`}
                    >
                      <div className="flex min-w-[100px] items-center gap-2.5">
                        <span className="text-xl">
                          {currencies.find((c) => c.currencyCode === rate.currencyCode)?.flag ?? "💱"}
                        </span>
                        <div>
                          <span className="text-sm font-bold">{rate.currencyCode}</span>
                          <span className="ml-2 text-[10px] text-zinc-600">v{rate.version}</span>
                        </div>
                      </div>

                      <div className="flex flex-1 gap-3">
                        <div className="flex-1 space-y-1">
                          <Label className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400/80">
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
                            className="h-10 rounded-lg border-emerald-500/20 bg-emerald-500/5 text-emerald-400"
                          />
                        </div>
                        <div className="flex-1 space-y-1">
                          <Label className="text-[10px] font-semibold uppercase tracking-wider text-amber-400/80">
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
                            className="h-10 rounded-lg border-amber-500/20 bg-amber-500/5 text-amber-400"
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
                            className="rounded-lg text-red-400 hover:text-red-300"
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
