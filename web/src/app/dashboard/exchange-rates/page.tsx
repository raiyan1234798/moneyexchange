"use client";

import { useEffect, useState } from "react";
import { RefreshCw, Save, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { DashboardHeader } from "@/components/layout/dashboard-sidebar";
import { BranchSelector } from "@/components/shared/branch-selector";
import {
  ContentPanel,
  DataTable,
  EmptyState,
  PageActions,
  PageShell,
} from "@/components/shared/page-elements";
import { useAuth } from "@/contexts/auth-context";
import { useBranchScope, useContentPermissions } from "@/lib/hooks/use-branch-scope";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { subscribeCurrencies } from "@/lib/services/currency-service";
import {
  initializeBranchRates,
  subscribeBranchExchangeRates,
  updateExchangeRate,
} from "@/lib/services/exchange-rate-service";
import type { Currency, ExchangeRate } from "@/lib/types";

export default function ExchangeRatesPage() {
  const { user, profile } = useAuth();
  const { branches, effectiveBranchId, setSelectedBranchId, isSuperAdmin } = useBranchScope();
  const { canManageRates } = useContentPermissions();
  const [rates, setRates] = useState<ExchangeRate[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [drafts, setDrafts] = useState<Record<string, { buyRate: number; sellRate: number }>>({});
  const [bulkSaving, setBulkSaving] = useState(false);
  const [initializing, setInitializing] = useState(false);

  const branch = branches.find((b) => b.id === effectiveBranchId);

  useEffect(() => {
    return subscribeCurrencies(setCurrencies);
  }, []);

  useEffect(() => {
    if (!effectiveBranchId) return;
    return subscribeBranchExchangeRates(effectiveBranchId, (items) => {
      setRates(items);
      setDrafts(
        Object.fromEntries(items.map((rate) => [rate.id, { buyRate: rate.buyRate, sellRate: rate.sellRate }])),
      );
    });
  }, [effectiveBranchId]);

  async function initRates() {
    if (!user || !profile || !effectiveBranchId) return;
    setInitializing(true);
    try {
      await initializeBranchRates(effectiveBranchId, currencies, {
        userId: user.uid,
        userName: profile.displayName || profile.email,
        branchName: branch?.name || effectiveBranchId,
      });
      toast.success("Rates initialized from currency catalog");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to initialize rates");
    } finally {
      setInitializing(false);
    }
  }

  async function saveRate(rate: ExchangeRate) {
    if (!user || !profile || !effectiveBranchId) return;
    const draft = drafts[rate.id];
    if (!draft) return;
    await updateExchangeRate(rate, draft.buyRate, draft.sellRate, {
      userId: user.uid,
      userName: profile.displayName || profile.email,
      branchName: branch?.name || effectiveBranchId,
    });
    toast.success(`${rate.currencyCode} published to display`);
  }

  async function saveAllRates() {
    if (!user || !profile || !effectiveBranchId) return;
    setBulkSaving(true);
    try {
      await Promise.all(
        rates.map((rate) => {
          const draft = drafts[rate.id];
          if (!draft) return Promise.resolve();
          return updateExchangeRate(rate, draft.buyRate, draft.sellRate, {
            userId: user.uid,
            userName: profile.displayName || profile.email,
            branchName: branch?.name || effectiveBranchId,
          });
        }),
      );
      toast.success("All rates published to display");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Bulk publish failed");
    } finally {
      setBulkSaving(false);
    }
  }

  const hasChanges = rates.some((rate) => {
    const draft = drafts[rate.id];
    return draft && (draft.buyRate !== rate.buyRate || draft.sellRate !== rate.sellRate);
  });

  return (
    <>
      <DashboardHeader
        title="Exchange Rates"
        description="Branch-specific buy/sell rates — changes appear on branch displays instantly."
        accent="emerald"
      />
      <PageShell accent="emerald">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          {isSuperAdmin ? (
            <BranchSelector branches={branches} value={effectiveBranchId} onChange={setSelectedBranchId} />
          ) : branch ? (
            <p className="text-sm text-muted-foreground">
              Managing rates for <strong className="text-foreground">{branch.name}</strong>
            </p>
          ) : null}

          {canManageRates && effectiveBranchId ? (
            <PageActions className="sm:justify-end">
              {rates.length === 0 ? (
                <Button onClick={() => void initRates()} disabled={initializing || currencies.length === 0} className="rounded-xl">
                  <RefreshCw className={`mr-2 h-4 w-4 ${initializing ? "animate-spin" : ""}`} />
                  Initialize Rates
                </Button>
              ) : (
                <>
                  <Button variant="outline" onClick={() => void initRates()} disabled={initializing} className="rounded-xl">
                    <RefreshCw className={`mr-2 h-4 w-4 ${initializing ? "animate-spin" : ""}`} />
                    Re-initialize
                  </Button>
                  <Button onClick={() => void saveAllRates()} disabled={bulkSaving || !hasChanges} className="rounded-xl">
                    <Save className="mr-2 h-4 w-4" />
                    {bulkSaving ? "Publishing..." : "Publish All"}
                  </Button>
                </>
              )}
            </PageActions>
          ) : null}
        </div>

        {!effectiveBranchId ? (
          <EmptyState title="Select a branch" description="Choose a branch to manage its exchange rates." icon={TrendingUp} />
        ) : rates.length === 0 ? (
          <EmptyState
            title="No rates for this branch"
            description="Initialize rates from the global currency catalog, then set branch-specific buy/sell values."
            icon={TrendingUp}
            actionLabel="Initialize Rates"
            onAction={canManageRates ? () => void initRates() : undefined}
          />
        ) : (
          <ContentPanel
            title={`${branch?.name ?? "Branch"} Rates`}
            description={`${rates.length} currencies · edits publish instantly to displays`}
          >
            <DataTable
              data={rates}
              keyExtractor={(r) => r.id}
              mobileTitle={(r) => r.currencyCode}
              columns={[
                {
                  key: "currency",
                  header: "Currency",
                  cell: (r) => <span className="font-semibold">{r.currencyCode}</span>,
                },
                {
                  key: "buy",
                  header: "Buy Rate",
                  cell: (r) => (
                    <Input
                      type="number"
                      step="0.0001"
                      value={drafts[r.id]?.buyRate ?? r.buyRate}
                      disabled={!canManageRates}
                      onChange={(event) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [r.id]: { ...prev[r.id], buyRate: Number(event.target.value) },
                        }))
                      }
                      className="h-9 w-28 rounded-lg font-mono text-sm"
                    />
                  ),
                },
                {
                  key: "sell",
                  header: "Sell Rate",
                  cell: (r) => (
                    <Input
                      type="number"
                      step="0.0001"
                      value={drafts[r.id]?.sellRate ?? r.sellRate}
                      disabled={!canManageRates}
                      onChange={(event) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [r.id]: { ...prev[r.id], sellRate: Number(event.target.value) },
                        }))
                      }
                      className="h-9 w-28 rounded-lg font-mono text-sm"
                    />
                  ),
                },
                { key: "version", header: "Version", cell: (r) => <span className="text-muted-foreground">v{r.version}</span>, hideOnMobile: true },
                {
                  key: "actions",
                  header: "Actions",
                  className: "text-right",
                  cell: (r) =>
                    canManageRates ? (
                      <Button size="sm" className="rounded-lg" onClick={() => void saveRate(r)}>
                        Publish
                      </Button>
                    ) : null,
                },
              ]}
            />
          </ContentPanel>
        )}
      </PageShell>
    </>
  );
}
