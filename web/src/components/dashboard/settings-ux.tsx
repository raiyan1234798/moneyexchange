"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Lightbulb, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type SettingsViewMode = "simple" | "all";

const STORAGE_KEY = "unimoni-settings-view";

/** Remember Simple vs All settings across visits (first-time default: Simple). */
export function useSettingsViewMode(): [SettingsViewMode, (mode: SettingsViewMode) => void] {
  const [mode, setMode] = useState<SettingsViewMode>("simple");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === "simple" || saved === "all") setMode(saved);
    } catch {
      /* ignore */
    }
  }, []);

  const update = (next: SettingsViewMode) => {
    setMode(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  };

  return [mode, update];
}

export function SettingsViewToggle({
  mode,
  onChange,
}: {
  mode: SettingsViewMode;
  onChange: (mode: SettingsViewMode) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/50 bg-muted/30 p-2">
      <span className="px-2 text-xs font-medium text-muted-foreground">Show:</span>
      <Button
        type="button"
        size="sm"
        variant={mode === "simple" ? "default" : "outline"}
        className="rounded-lg"
        onClick={() => onChange("simple")}
      >
        Simple — everyday controls
      </Button>
      <Button
        type="button"
        size="sm"
        variant={mode === "all" ? "default" : "outline"}
        className="rounded-lg"
        onClick={() => onChange("all")}
      >
        All settings
      </Button>
      <p className="w-full px-2 text-[11px] text-muted-foreground sm:w-auto sm:flex-1">
        {mode === "simple"
          ? "Best for first-time users. Switch to All settings when you need spin effects, announcements, or fine sizing."
          : "Every control is visible. Switch back to Simple anytime to hide the extras."}
      </p>
    </div>
  );
}

/** Short “what to do first” card for Settings / Promotions. */
export function GettingStartedCard({
  title = "New here? Do these 4 steps",
  steps,
  className,
}: {
  title?: string;
  steps: Array<{ label: string; href?: string; hint?: string }>;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.06] p-4",
        className,
      )}
    >
      <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
        <Lightbulb className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
        {title}
      </p>
      <ol className="grid gap-2 sm:grid-cols-2">
        {steps.map((step, i) => (
          <li key={step.label}>
            {step.href ? (
              <a
                href={step.href}
                className="flex gap-3 rounded-xl border border-border/40 bg-background/70 p-3 transition-colors hover:border-emerald-500/40 hover:bg-background"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">
                  {i + 1}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-foreground">{step.label}</span>
                  {step.hint ? (
                    <span className="mt-0.5 block text-xs text-muted-foreground">{step.hint}</span>
                  ) : null}
                </span>
              </a>
            ) : (
              <div className="flex gap-3 rounded-xl border border-border/40 bg-background/70 p-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">
                  {i + 1}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-foreground">{step.label}</span>
                  {step.hint ? (
                    <span className="mt-0.5 block text-xs text-muted-foreground">{step.hint}</span>
                  ) : null}
                </span>
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Collapsible “more options” so first-timers aren’t flooded. */
export function AdvancedDetails({
  title = "More options (optional)",
  description,
  children,
  defaultOpen = false,
}: {
  title?: string;
  description?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details
      className="group rounded-xl border border-dashed border-border/60 bg-muted/20 open:bg-muted/30"
      open={defaultOpen || undefined}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
        <Sparkles className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="flex-1">{title}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      {description ? (
        <p className="border-t border-border/30 px-4 pb-2 pt-3 text-xs text-muted-foreground">
          {description}
        </p>
      ) : null}
      <div className="space-y-4 border-t border-border/30 p-4">{children}</div>
    </details>
  );
}

/** Tiny numbered step label used inside a section. */
export function StepLabel({
  step,
  title,
  hint,
}: {
  step: number;
  title: string;
  hint?: string;
}) {
  return (
    <div className="mb-2 flex items-start gap-2">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
        {step}
      </span>
      <div>
        <p className="text-sm font-semibold leading-tight">{title}</p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
    </div>
  );
}
