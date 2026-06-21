"use client";

import { useEffect, useState } from "react";
import { Plus, Coins } from "lucide-react";
import { toast } from "sonner";
import { DashboardHeader } from "@/components/layout/dashboard-sidebar";
import {
  ContentPanel,
  DataTable,
  EmptyState,
  FormSection,
  PageActions,
  PageShell,
  StatusBadge,
} from "@/components/shared/page-elements";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createCurrency, subscribeCurrencies, toggleCurrencyStatus } from "@/lib/services/currency-service";
import type { Currency } from "@/lib/types";

export default function CurrenciesPage() {
  const { user, profile, hasPermission } = useAuth();
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    currencyCode: "",
    currencyName: "",
    country: "",
    flag: "",
    sortOrder: 1,
  });

  useEffect(() => {
    return subscribeCurrencies(setCurrencies);
  }, []);

  async function handleCreate() {
    if (!user || !profile) return;
    await createCurrency(
      { ...form, status: "active", isHidden: false },
      { userId: user.uid, userName: profile.displayName || profile.email },
    );
    toast.success("Currency added to catalog");
    setOpen(false);
    setForm({ currencyCode: "", currencyName: "", country: "", flag: "", sortOrder: currencies.length + 1 });
  }

  return (
    <>
      <DashboardHeader title="Currencies" description="Manage supported currencies and display order for all branches." accent="amber" />
      <PageShell accent="amber">
        {hasPermission("manageCurrencies") ? (
          <PageActions>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger render={<Button className="rounded-xl"><Plus className="mr-2 h-4 w-4" />Add Currency</Button>} />
              <DialogContent className="rounded-2xl sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Add Currency</DialogTitle>
                </DialogHeader>
                <FormSection title="Currency Details">
                  <div className="space-y-2">
                    <Label>Code</Label>
                    <Input value={form.currencyCode} onChange={(e) => setForm((p) => ({ ...p, currencyCode: e.target.value.toUpperCase() }))} placeholder="USD" className="rounded-xl" />
                  </div>
                  <div className="space-y-2">
                    <Label>Name</Label>
                    <Input value={form.currencyName} onChange={(e) => setForm((p) => ({ ...p, currencyName: e.target.value }))} className="rounded-xl" />
                  </div>
                  <div className="space-y-2">
                    <Label>Country</Label>
                    <Input value={form.country} onChange={(e) => setForm((p) => ({ ...p, country: e.target.value }))} className="rounded-xl" />
                  </div>
                  <div className="space-y-2">
                    <Label>Flag Emoji</Label>
                    <Input value={form.flag} onChange={(e) => setForm((p) => ({ ...p, flag: e.target.value }))} placeholder="🇺🇸" className="rounded-xl" />
                  </div>
                  <div className="space-y-2">
                    <Label>Sort Order</Label>
                    <Input type="number" value={form.sortOrder} onChange={(e) => setForm((p) => ({ ...p, sortOrder: Number(e.target.value) }))} className="rounded-xl" />
                  </div>
                </FormSection>
                <DialogFooter>
                  <Button onClick={() => void handleCreate()} disabled={!form.currencyCode || !form.currencyName} className="rounded-xl">
                    Save Currency
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </PageActions>
        ) : null}

        {currencies.length === 0 ? (
          <EmptyState
            title="No currencies configured"
            description="Add currencies to publish exchange rates on branch TVs."
            icon={Coins}
            actionLabel={hasPermission("manageCurrencies") ? "Add Currency" : undefined}
            onAction={hasPermission("manageCurrencies") ? () => setOpen(true) : undefined}
          />
        ) : (
          <ContentPanel title="Currency Catalog" description={`${currencies.length} currencies available globally`}>
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
                { key: "order", header: "Order", cell: (c) => c.sortOrder, hideOnMobile: true },
                { key: "status", header: "Status", cell: (c) => <StatusBadge status={c.status} /> },
                {
                  key: "actions",
                  header: "Actions",
                  className: "text-right",
                  cell: (c) =>
                    hasPermission("manageCurrencies") ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-lg"
                        onClick={() =>
                          void toggleCurrencyStatus(
                            c.id,
                            c.status === "active" ? "inactive" : "active",
                            { userId: user!.uid, userName: profile!.displayName || profile!.email },
                          ).then(() => toast.success(`${c.currencyCode} status updated`))
                        }
                      >
                        Toggle
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
