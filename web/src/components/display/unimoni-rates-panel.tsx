"use client";

import { useEffect, useState, type CSSProperties } from "react";
import {
  UNIMONI_COLORS,
  formatUnimoniRate,
  getRateFlag,
  resolveSignageRates,
} from "@/lib/unimoni-signage";
import { UnimoniLogoImage } from "@/components/brand/unimoni-logo";
import { FlagChip } from "@/components/display/flag-chip";
import { LiveClock, formatSignageDate, formatSignageTime, useNow } from "@/components/display/live-clock";
import type { ExchangeRate } from "@/lib/types";

interface UnimoniRatesPanelProps {
  rates: ExchangeRate[];
  showBuyRate?: boolean;
  showSellRate?: boolean;
  className?: string;
  /**
   * "panel" = narrow side column next to a video (default).
   * "board" = full-screen fixed grid that fills the whole screen when a branch
   *           has no video, so there is never an empty black area.
   */
  variant?: "panel" | "board";
  branchName?: string | null;
  /** @deprecated use showTransferCard. */
  showRemittance?: boolean;
  /** Rotate in a SEPARATE "TRANSFER EXCHANGE RATES" card with $ + local columns. */
  showTransferCard?: boolean;
  /** Label for the local-currency transfer column (default "UGX"). */
  transferLocalLabel?: string;
  /** Multiplier for the rate-card text/row size (default 1). */
  scale?: number;
  /** Width of the rate card as a % of the screen (desktop/TV only). */
  widthPercent?: number;
}

const BUY_COLOR = "#34d399"; // emerald (board — on dark)
const SELL_COLOR = "#38bdf8"; // sky (board — on dark)
const NAVY_TEXT = "#0D2680"; // Rich Deep Blue (Pantone 2748 C) — codes/values on the light panel
const STRIPE_LIGHT = "#FFFFFF";
const STRIPE_BLUE = "#E4EFF9";

/** Customers read at most this many rows per sheet; extra currencies rotate in. */
const RATES_PER_SHEET = 12;
const SHEET_INTERVAL_MS = 5_000;

interface Sheet {
  kind: "rates" | "transfer";
  rows: ExchangeRate[];
}

function chunkRows(rows: ExchangeRate[], kind: Sheet["kind"]): Sheet[] {
  const sheets: Sheet[] = [];
  for (let i = 0; i < rows.length; i += RATES_PER_SHEET) {
    sheets.push({ kind, rows: rows.slice(i, i + RATES_PER_SHEET) });
  }
  return sheets;
}

/** A currency belongs on the transfer card if it has either transfer rate set. */
function hasTransfer(r: ExchangeRate): boolean {
  return (r.transferUsd ?? 0) > 0 || (r.transferLocal ?? 0) > 0 || (r.remitRate ?? 0) > 0;
}

export function UnimoniRatesPanel({
  rates,
  showBuyRate = true,
  showSellRate = true,
  className = "",
  variant = "panel",
  branchName,
  showTransferCard = false,
  transferLocalLabel = "UGX",
  scale = 1,
  widthPercent,
}: UnimoniRatesPanelProps) {
  const rows = resolveSignageRates(rates);
  // Hooks must run unconditionally (before the board early-return).
  const now = useNow();
  // Transfer is its OWN card (separate rotating screen), never mixed into the
  // forex table — per the client's separate "TRANSFER EXCHANGE RATES" board.
  const transferRows = showTransferCard ? rows.filter(hasTransfer) : [];
  const sheets: Sheet[] = [...chunkRows(rows, "rates"), ...chunkRows(transferRows, "transfer")];
  const sheetCount = Math.max(sheets.length, 1);
  const [sheetIndex, setSheetIndex] = useState(0);

  useEffect(() => {
    if (sheetCount <= 1) return;
    const timer = window.setInterval(
      () => setSheetIndex((i) => (i + 1) % sheetCount),
      SHEET_INTERVAL_MS,
    );
    return () => window.clearInterval(timer);
  }, [sheetCount]);

  const activeSheet: Sheet = sheets[sheetIndex % sheetCount] ?? { kind: "rates", rows: [] };
  // Pad short sheets so every page keeps identical row heights.
  const paddedRows: (ExchangeRate | null)[] =
    sheetCount > 1
      ? [...activeSheet.rows, ...Array(RATES_PER_SHEET - activeSheet.rows.length).fill(null)]
      : activeSheet.rows;
  const isTransferSheet = activeSheet.kind === "transfer";

  if (variant === "board") {
    return (
      <RatesBoard
        rows={rows}
        showBuyRate={showBuyRate}
        showSellRate={showSellRate}
        branchName={branchName}
        className={className}
      />
    );
  }

  // Faithful replica of the client's Al Ansari reference: blue header band
  // (DATE | logo | TIME in white), white rounded table with a light
  // column-header row, alternating stripes, bare flags on the left, and plain
  // navy values with thin column separators. The TRANSFER rates live on their
  // OWN rotating card ($ + local columns). Every currency stays fixed on
  // screen — the panel never scrolls; rows share height and type auto-scales.
  const columnSeparator = { borderLeft: "1px solid #D3E2F0" };

  // Column set depends on the active card: forex (We Buy / We Sell) or the
  // separate transfer card ($ USD / local currency, e.g. UGX). "$" for USD is
  // shown for the transfer sheet only, per the client's transfer board.
  const valueColumns: {
    key: string;
    header: string;
    get: (r: ExchangeRate) => number | null | undefined;
    isTransfer?: boolean;
  }[] = [];
  if (isTransferSheet) {
    valueColumns.push({ key: "usd", header: "$ (USD)", get: (r) => r.transferUsd ?? r.remitRate, isTransfer: true });
    valueColumns.push({ key: "local", header: transferLocalLabel, get: (r) => r.transferLocal, isTransfer: true });
  } else {
    if (showBuyRate) valueColumns.push({ key: "buy", header: "We Buy", get: (r) => r.buyRate });
    if (showSellRate) valueColumns.push({ key: "sell", header: "We Sell", get: (r) => r.sellRate });
  }
  const gridColumns = `1.25fr ${valueColumns.map(() => "1fr").join(" ")}`.trim();
  const headerSubLabel = isTransferSheet ? "Transfer Rates" : "Exchange Rates";

  const asideStyle = {
    background: `linear-gradient(180deg, ${UNIMONI_COLORS.navy} 0%, ${UNIMONI_COLORS.headerBlue} 100%)`,
    width: widthPercent ? `${widthPercent}%` : undefined,
    "--rate-scale": scale,
  } as CSSProperties;

  return (
    <aside
      className={`display-rates-panel flex h-full min-h-0 w-full flex-1 flex-col lg:w-[35%] lg:flex-none lg:shrink-0 xl:w-[32%] ${className}`}
      style={asideStyle}
    >
      <div className="flex shrink-0 items-stretch justify-between gap-2 px-[1vw] py-[1vh] font-[Arial,Helvetica,sans-serif]">
        <div className="flex min-w-0 flex-col items-center justify-center">
          <span className="text-[clamp(0.55rem,0.85vw,0.75rem)] font-bold uppercase tracking-[0.2em] text-white">
            Date
          </span>
          <span className="whitespace-nowrap text-[clamp(0.65rem,1.05vw,0.95rem)] font-semibold tabular-nums text-white/95">
            {now ? formatSignageDate(now) : "—"}
          </span>
        </div>
        <div className="flex min-w-0 flex-col items-center justify-center">
          <UnimoniLogoImage
            variant="onDark"
            width={180}
            height={40}
            className="h-[clamp(1.1rem,2.1vh,1.9rem)] w-auto object-contain"
            priority
          />
          <p className="text-[clamp(0.5rem,0.8vw,0.7rem)] font-bold uppercase tracking-[0.16em] text-white/85">
            {headerSubLabel}
          </p>
        </div>
        <div className="flex min-w-0 flex-col items-center justify-center">
          <span className="text-[clamp(0.55rem,0.85vw,0.75rem)] font-bold uppercase tracking-[0.2em] text-white">
            Time
          </span>
          <span className="whitespace-nowrap text-[clamp(0.65rem,1.05vw,0.95rem)] font-semibold tabular-nums text-white/95">
            {now ? formatSignageTime(now) : "—"}
          </span>
        </div>
      </div>

      {/* White table card hugs its rows (blue shows below when few currencies),
          exactly like the reference; shrinks rows evenly when there are many. */}
      <div className="mx-[0.6vw] mb-[0.8vh] flex min-h-0 flex-col overflow-hidden rounded-[10px] bg-white shadow-[0_2px_10px_rgba(0,0,0,0.25)]">
        <div
          className="grid shrink-0 items-stretch px-2 py-[0.8vh] font-[Arial,Helvetica,sans-serif] text-[clamp(0.6rem,0.95vw,0.85rem)] font-bold uppercase tracking-wide"
          style={{ color: NAVY_TEXT, borderBottom: "2px solid #D3E2F0", gridTemplateColumns: gridColumns }}
        >
          <span className="flex items-center justify-center">Currency</span>
          {valueColumns.map((col) => (
            <span key={col.key} className="flex items-center justify-center" style={columnSeparator}>
              {col.header}
            </span>
          ))}
        </div>

        <div
          key={`${activeSheet.kind}-${sheetIndex}`}
          className="display-rates-body rates-sheet-fade min-h-0 gap-[0.35vh] overflow-hidden px-[0.35vw] py-[0.4vh]"
        >
          {rows.length === 0 ? (
            <div className="flex flex-col items-center gap-1 px-4 py-[4vh] text-center" style={{ color: NAVY_TEXT }}>
              <p className="text-[clamp(0.8rem,1.2vw,1.1rem)] font-bold">Rates are being updated</p>
              <p className="text-[clamp(0.65rem,0.95vw,0.9rem)] opacity-70">Please ask our staff for today&apos;s rates.</p>
            </div>
          ) : null}
          {paddedRows.map((rate, i) =>
            rate === null ? (
              <div key={`pad-${i}`} className="display-rate-row grid min-h-0" aria-hidden />
            ) : (
            <div
              key={rate.id}
              className="display-rate-row grid min-h-0 items-stretch rounded-[6px] font-[Arial,Helvetica,sans-serif]"
              style={{ backgroundColor: i % 2 === 1 ? STRIPE_BLUE : STRIPE_LIGHT, gridTemplateColumns: gridColumns }}
            >
              <span className="display-rate-currency flex min-h-0 min-w-0 items-center gap-[0.6vw] py-[0.25vh] pl-[0.5vw] font-bold uppercase" style={{ color: NAVY_TEXT }}>
                {/* Flag shown bigger and bare (no box) — a thin ring keeps
                    white flags visible on the light row. Globe fallback for
                    custom currencies. */}
                <FlagChip
                  flag={getRateFlag(rate) ?? "🌍"}
                  className="!h-[1.85em] !w-[2.75em] shrink-0 rounded-[3px] shadow-[0_1px_2px_rgba(0,0,0,0.28)] ring-1 ring-black/10"
                />
                <span className="min-w-0 flex-1 truncate text-center">{rate.currencyCode}</span>
              </span>
              {valueColumns.map((col) => {
                const value = col.get(rate);
                // Transfer cells are blank (—) for currencies with no transfer rate.
                const display =
                  col.isTransfer && (value == null || value <= 0)
                    ? "—"
                    : formatUnimoniRate(value ?? 0);
                return (
                  <span
                    key={col.key}
                    className="display-rate-value flex w-full items-center justify-center px-1 text-center font-bold tabular-nums"
                    style={{ color: NAVY_TEXT, ...columnSeparator }}
                  >
                    {display}
                  </span>
                );
              })}
            </div>
            ),
          )}
        </div>

        {sheetCount > 1 ? (
          <div className="flex shrink-0 items-center justify-center gap-[0.5vw] pb-[0.6vh]">
            {sheets.map((sheet, i) => (
              <span
                key={`${sheet.kind}-${i}`}
                className="h-[7px] w-[7px] rounded-full transition-colors"
                style={{
                  backgroundColor:
                    i === sheetIndex % sheetCount ? UNIMONI_COLORS.headerBlue : "#C9D8E8",
                }}
              />
            ))}
          </div>
        ) : null}
      </div>
    </aside>
  );
}

interface RatesBoardProps {
  rows: ExchangeRate[];
  showBuyRate: boolean;
  showSellRate: boolean;
  branchName?: string | null;
  className: string;
}

/**
 * Full-screen exchange-rate board. Every currency is laid out on a fixed grid
 * that fills the whole screen — no scrolling, no empty black area. Used when a
 * branch has no video playing.
 */
function RatesBoard({ rows, showBuyRate, showSellRate, branchName, className }: RatesBoardProps) {
  const columns = rows.length <= 5 ? 1 : 2;
  const rowCount = Math.max(1, Math.ceil(rows.length / columns));

  return (
    <section
      className={`flex h-full min-h-0 w-full flex-1 flex-col ${className}`}
      style={{ backgroundColor: UNIMONI_COLORS.navy }}
    >
      <div
        className="flex shrink-0 items-center justify-between gap-4 px-[3vw] py-[1.6vh]"
        style={{ backgroundColor: UNIMONI_COLORS.headerBlue }}
      >
        <UnimoniLogoImage
          variant="onDark"
          width={240}
          height={52}
          className="h-[clamp(1.5rem,3.6vh,3.25rem)] w-auto object-contain"
          priority
        />
        <div className="flex min-w-0 items-center gap-[2vw]">
          <p
            className="truncate font-[Arial,Helvetica,sans-serif] font-bold uppercase tracking-[0.16em] text-white"
            style={{ fontSize: "clamp(0.9rem,1.9vw,1.7rem)" }}
          >
            {branchName?.trim() ? branchName : "Exchange Rates"}
          </p>
          <LiveClock className="shrink-0" />
        </div>
      </div>

      <div
        className="grid min-h-0 flex-1 basis-0 gap-[1.2vmin] overflow-hidden p-[1.6vmin]"
        style={{
          gridTemplateColumns: `repeat(${columns}, minmax(0,1fr))`,
          gridTemplateRows: `repeat(${rowCount}, minmax(0,1fr))`,
        }}
      >
        {rows.length === 0 ? (
          <div className="col-span-full flex flex-col items-center justify-center gap-2 text-center text-white">
            <p className="text-[clamp(1rem,2.4vmin,2rem)] font-bold">Rates are being updated</p>
            <p className="text-[clamp(0.8rem,1.8vmin,1.4rem)] text-white/70">Please ask our staff for today&apos;s rates.</p>
          </div>
        ) : null}
        {rows.map((rate) => (
          <div
            key={rate.id}
            className="flex min-h-0 items-center justify-between gap-[1.5vmin] rounded-[1.4vmin] border px-[2vmin]"
            style={{ backgroundColor: UNIMONI_COLORS.panelBlue, borderColor: `${UNIMONI_COLORS.gold}33` }}
          >
            <span
              className="flex min-w-0 items-center gap-[1vmin] truncate font-[Arial,Helvetica,sans-serif] font-extrabold uppercase leading-none text-white"
              style={{ fontSize: "clamp(1.1rem,3.2vmin,3.4rem)" }}
            >
              {getRateFlag(rate) ? <span className="shrink-0">{getRateFlag(rate)}</span> : null}
              <span className="truncate">{rate.currencyCode}</span>
            </span>
            <div className="flex shrink-0 items-stretch gap-[1.2vmin]">
              {showBuyRate ? <BoardValue label="Buy" value={rate.buyRate} color={BUY_COLOR} /> : null}
              {showSellRate ? <BoardValue label="Sell" value={rate.sellRate} color={SELL_COLOR} /> : null}
            </div>
          </div>
        ))}
      </div>

      <div className="h-[0.5vh] shrink-0" style={{ backgroundColor: UNIMONI_COLORS.gold }} />
    </section>
  );
}

function BoardValue({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div
      className="flex min-w-[9vmin] flex-col items-center justify-center rounded-[1vmin] px-[1.6vmin] py-[0.6vmin]"
      style={{ backgroundColor: "rgba(255,255,255,0.05)" }}
    >
      <span
        className="font-[Arial,Helvetica,sans-serif] font-semibold uppercase leading-none tracking-wide text-white/55"
        style={{ fontSize: "clamp(0.55rem,1.3vmin,1.05rem)" }}
      >
        {label}
      </span>
      <span
        className="font-[Arial,Helvetica,sans-serif] font-extrabold leading-none tabular-nums"
        style={{ color, fontSize: "clamp(1.2rem,3.6vmin,3.6rem)" }}
      >
        {formatUnimoniRate(value)}
      </span>
    </div>
  );
}
