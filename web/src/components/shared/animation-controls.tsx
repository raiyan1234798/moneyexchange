"use client";

import { DISPLAY_ANIMATIONS, SLIDE_TRANSITIONS, SLIDE_TRANSITION_DURATION_PRESETS } from "@/lib/constants";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Circular timing chips used next to animation / duration fields (forex pattern). */
export function DurationPresetButtons({
  value,
  onChange,
  presets,
  suffix = "s",
}: {
  value: number;
  onChange: (next: number) => void;
  presets: readonly number[];
  suffix?: string;
}) {
  const active = Number(value);
  return (
    <div className="flex flex-wrap gap-1.5 pt-1">
      {presets.map((preset) => {
        const selected = Math.abs(active - preset) < 0.001;
        return (
          <button
            key={preset}
            type="button"
            onClick={() => onChange(preset)}
            className={`flex h-9 w-9 items-center justify-center rounded-full border text-[11px] font-semibold tabular-nums transition-colors ${
              selected
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border/60 bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground"
            }`}
            aria-pressed={selected}
            aria-label={`${preset}${suffix}`}
          >
            {preset}
            {suffix}
          </button>
        );
      })}
    </div>
  );
}

/** Shared slide/page transition dropdown — always the full SLIDE_TRANSITIONS list. */
export function SlideTransitionSelect({
  value,
  onChange,
  id,
}: {
  value: string;
  onChange: (next: string) => void;
  id?: string;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v ?? "fade")}>
      <SelectTrigger id={id} className="rounded-xl">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {SLIDE_TRANSITIONS.map((t) => (
          <SelectItem key={t.key} value={t.key}>
            {t.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Shared continuous-movement dropdown — always the full DISPLAY_ANIMATIONS list. */
export function DisplayAnimationSelect({
  value,
  onChange,
  id,
  allowInherit,
}: {
  value: string;
  onChange: (next: string) => void;
  id?: string;
  /** When true, prepends an "Same as rate-card logo" inherit option with value `__inherit`. */
  allowInherit?: boolean;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v ?? "none")}>
      <SelectTrigger id={id} className="rounded-xl">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {allowInherit ? (
          <SelectItem value="__inherit">Same as rate-card logo animation (default)</SelectItem>
        ) : null}
        {DISPLAY_ANIMATIONS.map((a) => (
          <SelectItem key={a.key} value={a.key}>
            {a.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Side-by-side layout matching the forex / promotion pattern:
 * transition dropdown | Between pass (seconds) + circular presets.
 */
export function SlideTransitionRow({
  transitionValue,
  onTransitionChange,
  durationValue,
  onDurationChange,
  transitionLabel = "Slide change animation",
  durationLabel = "Between pass (seconds)",
  transitionHint,
  durationHint = "Length of the flip/fade when the rate card or media changes. Try 1.2s if cube/flip was invisible before.",
}: {
  transitionValue: string;
  onTransitionChange: (next: string) => void;
  durationValue: number;
  onDurationChange: (next: number) => void;
  transitionLabel?: string;
  durationLabel?: string;
  transitionHint?: string;
  durationHint?: string;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label>{transitionLabel}</Label>
        <SlideTransitionSelect value={transitionValue} onChange={onTransitionChange} />
        {transitionHint ? (
          <p className="text-xs text-muted-foreground">{transitionHint}</p>
        ) : null}
      </div>
      <div className="space-y-2">
        <Label>{durationLabel}</Label>
        <Input
          type="number"
          min={0.2}
          max={5}
          step={0.1}
          value={durationValue}
          onChange={(event) => {
            const next = Math.max(0.2, Math.min(5, Number(event.target.value) || 0.6));
            onDurationChange(Math.round(next * 10) / 10);
          }}
          className="rounded-xl"
        />
        <DurationPresetButtons
          value={durationValue}
          onChange={onDurationChange}
          presets={SLIDE_TRANSITION_DURATION_PRESETS}
        />
        {durationHint ? (
          <p className="text-xs text-muted-foreground">{durationHint}</p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Number field + circular presets — same chip layout as Between pass / forex timing.
 */
export function SecondsPresetField({
  label,
  value,
  onChange,
  presets,
  min = 0,
  max = 30,
  step = 1,
  hint,
  placeholder,
  allowEmpty,
  emptyDisplay = "",
}: {
  label: string;
  value: number | null;
  onChange: (next: number | null) => void;
  presets: readonly number[];
  min?: number;
  max?: number;
  step?: number;
  hint?: string;
  placeholder?: string;
  allowEmpty?: boolean;
  emptyDisplay?: string;
}) {
  const shown = value == null ? emptyDisplay : String(value);
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input
        type="number"
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        value={shown}
        onChange={(event) => {
          const raw = event.target.value.trim();
          if (allowEmpty && raw === "") {
            onChange(null);
            return;
          }
          const next = Math.max(min, Math.min(max, Number(raw) || min));
          onChange(step < 1 ? Math.round(next * 10) / 10 : Math.round(next));
        }}
        className="rounded-xl"
      />
      <DurationPresetButtons
        value={value ?? presets[0] ?? 0}
        onChange={(next) => onChange(next)}
        presets={presets}
      />
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
