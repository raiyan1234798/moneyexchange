"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const fadeIn = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] as const },
};

export type SectionAccent = "violet" | "emerald" | "sky" | "amber" | "rose" | "default";

const accentMap: Record<SectionAccent, string> = {
  default: "from-foreground/8 to-transparent",
  violet: "from-violet-500/18 via-violet-500/5 to-transparent",
  emerald: "from-emerald-500/18 via-emerald-500/5 to-transparent",
  sky: "from-sky-500/18 via-sky-500/5 to-transparent",
  amber: "from-amber-500/18 via-amber-500/5 to-transparent",
  rose: "from-rose-500/18 via-rose-500/5 to-transparent",
};

const sectionAccentClass: Record<SectionAccent, string> = {
  default: "",
  violet: "section-accent-violet",
  emerald: "section-accent-emerald",
  sky: "section-accent-sky",
  amber: "section-accent-amber",
  rose: "section-accent-rose",
};

export function PageShell({
  children,
  accent = "default",
  className,
}: {
  children: React.ReactNode;
  accent?: SectionAccent;
  className?: string;
}) {
  return (
    <motion.div
      className={cn("page-section", sectionAccentClass[accent], className)}
      initial="initial"
      animate="animate"
      variants={{ animate: { transition: { staggerChildren: 0.06 } } }}
    >
      {children}
    </motion.div>
  );
}

export function StatCard({
  title,
  value,
  hint,
  loading,
  accent = "default",
  icon: Icon,
}: {
  title: string;
  value: string | number;
  hint?: string;
  loading?: boolean;
  accent?: SectionAccent;
  icon?: LucideIcon;
}) {
  return (
    <motion.div {...fadeIn}>
      <Card className={cn("glass-panel overflow-hidden bg-gradient-to-br", accentMap[accent])}>
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
          <CardTitle className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {title}
          </CardTitle>
          {Icon ? (
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground/5">
              <Icon className="h-4 w-4 text-muted-foreground" />
            </div>
          ) : null}
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-9 w-24 rounded-lg" />
          ) : (
            <>
              <div className="text-3xl font-semibold tracking-tight tabular-nums lg:text-4xl">{value}</div>
              {hint ? <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p> : null}
            </>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

export function PageLoader({ count = 4 }: { count?: number }) {
  return (
    <div className="page-section grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, index) => (
        <Card key={index} className="glass-panel">
          <CardHeader>
            <Skeleton className="h-4 w-24 rounded-lg" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-9 w-16 rounded-lg" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  actionLabel,
  onAction,
  actionHref,
  icon: Icon,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  actionHref?: string;
  icon?: LucideIcon;
}) {
  return (
    <motion.div {...fadeIn} className="glass-panel-soft flex flex-col items-center justify-center px-6 py-16 text-center sm:py-20">
      {Icon ? (
        <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-foreground/5">
          <Icon className="h-7 w-7 text-muted-foreground" />
        </div>
      ) : null}
      <h3 className="text-xl font-semibold tracking-tight">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">{description}</p>
      {action ?? (actionLabel && (actionHref || onAction) ? (
        actionHref ? (
          <Link href={actionHref} className="mt-6">
            <Button className="rounded-xl">{actionLabel}</Button>
          </Link>
        ) : (
          <Button className="mt-6 rounded-xl" onClick={onAction}>
            {actionLabel}
          </Button>
        )
      ) : null)}
    </motion.div>
  );
}

export function ContentPanel({
  title,
  description,
  children,
  action,
  className,
}: {
  title?: string;
  description?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div {...fadeIn}>
      <Card className={cn("glass-panel", className)}>
        {title ? (
          <CardHeader className="flex flex-col gap-1 border-b border-border/30 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div>
              <CardTitle className="text-lg font-semibold">{title}</CardTitle>
              {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
            </div>
            {action}
          </CardHeader>
        ) : null}
        <CardContent className={cn(title ? "pt-6" : "p-4 sm:p-6", "overflow-x-auto")}>{children}</CardContent>
      </Card>
    </motion.div>
  );
}

export function FormSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-4", className)}>
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </div>
  );
}

export function PageActions({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div {...fadeIn} className={cn("flex flex-wrap items-center justify-end gap-2", className)}>
      {children}
    </motion.div>
  );
}

export type StatusVariant = "success" | "warning" | "danger" | "neutral" | "info";

export function StatusBadge({
  status,
  variant,
  className,
}: {
  status: string;
  variant?: StatusVariant;
  className?: string;
}) {
  const resolved = variant ?? inferVariant(status);
  const styles: Record<StatusVariant, string> = {
    success: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 ring-emerald-500/20",
    warning: "bg-amber-500/12 text-amber-700 dark:text-amber-300 ring-amber-500/20",
    danger: "bg-red-500/12 text-red-700 dark:text-red-300 ring-red-500/20",
    neutral: "bg-muted text-muted-foreground ring-border/50",
    info: "bg-sky-500/12 text-sky-700 dark:text-sky-300 ring-sky-500/20",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ring-1 ring-inset",
        styles[resolved],
        className,
      )}
    >
      {status.replaceAll("_", " ")}
    </span>
  );
}

function inferVariant(status: string): StatusVariant {
  const s = status.toLowerCase();
  if (["active", "online", "published", "approved", "connected", "healthy"].includes(s)) return "success";
  if (["pending", "maintenance", "low", "disconnected"].includes(s)) return "warning";
  if (["inactive", "offline", "disabled", "critical", "draft"].includes(s)) return "danger";
  return "neutral";
}

export type DataTableColumn<T> = {
  key: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  className?: string;
  hideOnMobile?: boolean;
};

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  emptyMessage = "No data",
  mobileTitle,
}: {
  columns: DataTableColumn<T>[];
  data: T[];
  keyExtractor: (row: T) => string;
  emptyMessage?: string;
  mobileTitle?: (row: T) => string;
}) {
  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <>
      <div className="space-y-3 md:hidden">
        {data.map((row) => (
          <div key={keyExtractor(row)} className="glass-panel-soft space-y-2.5 p-4">
            {mobileTitle ? (
              <p className="font-semibold">{mobileTitle(row)}</p>
            ) : null}
            {columns
              .filter((col) => !col.hideOnMobile)
              .map((col) => (
                <div key={col.key} className="flex items-start justify-between gap-3 text-sm">
                  <span className="shrink-0 text-muted-foreground">{col.header}</span>
                  <span className={cn("text-right", col.className)}>{col.cell(row)}</span>
                </div>
              ))}
          </div>
        ))}
      </div>

      <div className="data-table-scroll hidden md:block">
        <table className="w-full min-w-[640px] caption-bottom text-sm">
          <thead>
            <tr className="border-b border-border/40">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    "h-11 px-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground",
                    col.className,
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr
                key={keyExtractor(row)}
                className="border-b border-border/25 transition-colors hover:bg-muted/30"
              >
                {columns.map((col) => (
                  <td key={col.key} className={cn("px-3 py-3.5 align-middle", col.className)}>
                    {col.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function QuickActions({
  actions,
}: {
  actions: Array<{
    label: string;
    description?: string;
    href: string;
    icon: LucideIcon;
    accent?: SectionAccent;
  }>;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {actions.map((action) => {
        const Icon = action.icon;
        return (
          <motion.div key={action.href} {...fadeIn}>
            <Link
              href={action.href}
              className={cn(
                "group flex items-start gap-4 rounded-2xl border border-border/35 bg-card/60 p-4 transition-all hover:border-border/60 hover:bg-card/90 hover:shadow-[var(--shadow-premium)]",
                action.accent && accentMap[action.accent] && "bg-gradient-to-br",
                action.accent ? accentMap[action.accent] : "",
              )}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-foreground text-background transition-transform group-hover:scale-105">
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold">{action.label}</p>
                {action.description ? (
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{action.description}</p>
                ) : null}
              </div>
            </Link>
          </motion.div>
        );
      })}
    </div>
  );
}

export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full rounded-lg" />
      ))}
      <span className="sr-only">{cols} columns</span>
    </div>
  );
}
