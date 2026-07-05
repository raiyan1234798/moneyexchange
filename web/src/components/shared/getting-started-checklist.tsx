"use client";

import Link from "next/link";
import { Building2, FileSpreadsheet, Monitor, TrendingUp, Video } from "lucide-react";
import { ContentPanel } from "@/components/shared/page-elements";
import { Button } from "@/components/ui/button";
import { getDisplayUrl } from "@/lib/display-url";
import { cn } from "@/lib/utils";

type Step = {
  id: string;
  label: string;
  description: string;
  href: string;
  done: boolean;
  external?: boolean;
  icon: typeof Building2;
};

export function GettingStartedChecklist({
  branchCode,
  branchName,
  hasBranch,
  hasRates,
  hasVideos,
}: {
  branchCode?: string;
  branchName?: string;
  hasBranch: boolean;
  hasRates: boolean;
  hasVideos: boolean;
  hasMessages?: boolean;
}) {
  const displayHref = branchCode ? getDisplayUrl(branchCode) : "/display/setup";

  const steps: Step[] = [
    {
      id: "branch",
      label: "Create your branch",
      description: "Add your shop location and branch code",
      href: "/dashboard/branches",
      done: hasBranch,
      icon: Building2,
    },
    {
      id: "rates",
      label: "Import rates from Excel",
      description: "Download template → fill WE BUY / WE SELL → upload",
      href: "/dashboard/exchange-rates",
      done: hasRates,
      icon: TrendingUp,
    },
    {
      id: "video",
      label: "Add a promo video",
      description: "Paste a video link (fastest) or upload a file",
      href: "/dashboard/videos",
      done: hasVideos,
      icon: Video,
    },
    {
      id: "display",
      label: "Open display on your TV",
      description: branchName
        ? `Open ${branchName} on your TV browser and go fullscreen`
        : "Copy your TV link and open it on the screen",
      href: displayHref,
      done: hasRates && hasVideos,
      external: Boolean(branchCode),
      icon: Monitor,
    },
  ];

  const completedCount = steps.filter((s) => s.done).length;
  const allDone = steps.every((s) => s.done);

  if (allDone) return null;

  return (
    <ContentPanel
      title="Getting Started"
      description={`${completedCount} of ${steps.length} steps done — follow this guide to go live`}
      action={
        <Button
          size="sm"
          variant="outline"
          className="rounded-xl"
          render={
            <Link href="/dashboard/exchange-rates">
              <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />
              Excel import
            </Link>
          }
        />
      }
    >
      <ol className="grid gap-3 sm:grid-cols-2">
        {steps.map((step, index) => {
          const Icon = step.icon;
          return (
            <li key={step.id}>
              <div
                className={cn(
                  "flex h-full flex-col gap-3 rounded-xl border p-4 transition-colors",
                  step.done
                    ? "border-[var(--brand-accent)]/25 bg-[var(--brand-accent)]/5"
                    : "border-border/30 bg-muted/20 hover:border-[var(--brand-accent)]/30",
                )}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                      step.done
                        ? "bg-[var(--brand-accent)]/15 text-[var(--brand-accent)]"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      <span className="mr-2 text-xs text-muted-foreground">Step {index + 1}</span>
                      {step.label}
                    </p>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{step.description}</p>
                  </div>
                </div>
                {!step.done ? (
                  step.external ? (
                    <a
                      href={step.href}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-auto w-full rounded-lg bg-primary px-3 py-2 text-center text-xs font-medium text-primary-foreground"
                    >
                      Open TV display
                    </a>
                  ) : (
                    <Link
                      href={step.href}
                      className="mt-auto w-full rounded-lg bg-primary px-3 py-2 text-center text-xs font-medium text-primary-foreground"
                    >
                      {step.id === "rates" ? "Import Excel rates" : "Go to step"}
                    </Link>
                  )
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </ContentPanel>
  );
}
