"use client";

import Link from "next/link";
import { CheckCircle2, Circle, Rocket } from "lucide-react";
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
};

export function GettingStartedChecklist({
  branchCode,
  branchName,
  hasBranch,
  hasRates,
  hasVideos,
  hasMessages,
}: {
  branchCode?: string;
  branchName?: string;
  hasBranch: boolean;
  hasRates: boolean;
  hasVideos: boolean;
  hasMessages: boolean;
}) {
  const displayHref = branchCode ? getDisplayUrl(branchCode) : "/display/setup";

  const steps: Step[] = [
    {
      id: "branch",
      label: "Create or select a branch",
      description: "Set up your location in Branches",
      href: "/dashboard/branches",
      done: hasBranch,
    },
    {
      id: "rates",
      label: "Add currencies & rates",
      description: "Publish buy/sell rates for the display",
      href: "/dashboard/exchange-rates",
      done: hasRates,
    },
    {
      id: "video",
      label: "Add a video URL",
      description: "Paste a direct MP4 link for signage",
      href: "/dashboard/videos",
      done: hasVideos,
    },
    {
      id: "messages",
      label: "Add display messages",
      description: "Scrolling text on the display footer",
      href: "/dashboard/tickers",
      done: hasMessages,
    },
    {
      id: "display",
      label: "Open display & go fullscreen",
      description: branchName
        ? `Launch ${branchName} signage on your TV`
        : "Open the display URL on your screen",
      href: displayHref,
      done: hasRates && hasVideos,
      external: Boolean(branchCode),
    },
  ];

  const contentSteps = steps.slice(1, 4);
  const allContentReady = contentSteps.every((s) => s.done);
  const completedCount = steps.filter((s) => s.done).length;

  if (allContentReady && hasBranch) return null;

  return (
    <ContentPanel
      title="Getting Started"
      description={`${completedCount} of ${steps.length} steps complete — follow this checklist to launch your first display`}
      action={
        branchCode ? (
          <Button
            size="sm"
            className="rounded-xl"
            render={
              <a href={displayHref} target="_blank" rel="noreferrer">
                <Rocket className="mr-1.5 h-3.5 w-3.5" />
                Open Display
              </a>
            }
          />
        ) : null
      }
    >
      <ol className="space-y-3">
        {steps.map((step, index) => {
          const Icon = step.done ? CheckCircle2 : Circle;
          const content = (
            <div
              className={cn(
                "flex items-start gap-3 rounded-xl border p-4 transition-colors",
                step.done
                  ? "border-emerald-500/20 bg-emerald-500/5"
                  : "border-border/30 bg-muted/20 hover:border-border/50 hover:bg-muted/30",
              )}
            >
              <Icon
                className={cn(
                  "mt-0.5 h-5 w-5 shrink-0",
                  step.done ? "text-emerald-500" : "text-muted-foreground",
                )}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  <span className="mr-2 text-xs text-muted-foreground">Step {index + 1}</span>
                  {step.label}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">{step.description}</p>
              </div>
              {!step.done ? (
                step.external ? (
                  <a
                    href={step.href}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
                  >
                    Open
                  </a>
                ) : (
                  <Link
                    href={step.href}
                    className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
                  >
                    Go
                  </Link>
                )
              ) : null}
            </div>
          );

          return <li key={step.id}>{content}</li>;
        })}
      </ol>
    </ContentPanel>
  );
}
