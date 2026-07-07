"use client";

import {
  UNIMONI_COLORS,
  UNIMONI_USD_NOTE,
  formatUnimoniRate,
  getRateDisplayLabel,
  resolveSignageRates,
} from "@/lib/unimoni-signage";
import { UnimoniLogoImage } from "@/components/brand/unimoni-logo";
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
}

const BUY_COLOR = "#34d399"; // emerald
const SELL_COLOR = "#38bdf8"; // sky

export function UnimoniRatesPanel({
  rates,
  showBuyRate = true,
  showSellRate = true,
  className = "",
  variant = "panel",
  branchName,
}: UnimoniRatesPanelProps) {
  const rows = resolveSignageRates(rates);

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

  // Android TV signage: every currency stays fixed on screen — the panel never
  // scrolls. Rows share the panel height equally and the type auto-scales down
  // (container-query units) so all currencies always fit, however many there are.
  return (
    <aside
      className={`display-rates-panel flex h-full min-h-0 w-full flex-1 flex-col lg:w-[35%] lg:flex-none lg:shrink-0 xl:w-[32%] ${className}`}
      style={{ backgroundColor: UNIMONI_COLORS.navy }}
    >
      <div
        className="flex shrink-0 flex-col items-center gap-1 px-3 py-2"
        style={{ backgroundColor: UNIMONI_COLORS.headerBlue }}
      >
        <UnimoniLogoImage
          variant="onDark"
          width={180}
          height={40}
          className="h-[clamp(1.25rem,2.2vh,2rem)] w-auto object-contain"
          priority
        />
        <p className="font-[Arial,Helvetica,sans-serif] text-[clamp(0.6rem,0.95vw,0.8rem)] font-bold uppercase tracking-[0.14em] text-white">
          Exchange Rates
        </p>
      </div>

      <div
        className="grid shrink-0 grid-cols-[1.1fr_1fr_1fr] items-center gap-x-2 border-b px-3 py-1.5 font-[Arial,Helvetica,sans-serif] text-[clamp(0.65rem,1vw,0.85rem)] font-bold uppercase tracking-wide text-white"
        style={{ borderColor: `${UNIMONI_COLORS.gold}40` }}
      >
        <span>Currency</span>
        {showBuyRate ? <span className="text-center">We Buy</span> : <span />}
        {showSellRate ? <span className="text-center">We Sell</span> : <span />}
      </div>

      <div className="display-rates-body min-h-0 flex-1 basis-0 overflow-hidden px-2 py-1">
        {rows.map((rate) => (
          <div
            key={rate.id}
            className="display-rate-row grid min-h-0 flex-1 basis-0 grid-cols-[1.1fr_1fr_1fr] items-stretch gap-x-2 border-b border-white/15 py-1 last:border-0 font-[Arial,Helvetica,sans-serif]"
          >
            <span className="display-rate-currency flex min-h-0 min-w-0 items-center pl-1 font-bold uppercase text-white">
              <span className="truncate">{getRateDisplayLabel(rate)}</span>
            </span>
            {showBuyRate ? (
              <span
                className="display-rate-value flex h-full w-full items-center justify-center rounded-[3px] px-1 text-center font-bold tabular-nums"
                style={{ backgroundColor: UNIMONI_COLORS.white, color: UNIMONI_COLORS.darkText }}
              >
                {formatUnimoniRate(rate.buyRate)}
              </span>
            ) : (
              <span />
            )}
            {showSellRate ? (
              <span
                className="display-rate-value flex h-full w-full items-center justify-center rounded-[3px] px-1 text-center font-bold tabular-nums"
                style={{ backgroundColor: UNIMONI_COLORS.white, color: UNIMONI_COLORS.darkText }}
              >
                {formatUnimoniRate(rate.sellRate)}
              </span>
            ) : (
              <span />
            )}
          </div>
        ))}
      </div>

      <div className="h-0.5 shrink-0" style={{ backgroundColor: UNIMONI_COLORS.gold }} />

      <p className="shrink-0 px-3 py-1.5 font-[Arial,Helvetica,sans-serif] text-[clamp(0.5rem,0.85vw,0.72rem)] leading-snug text-white/85">
        {UNIMONI_USD_NOTE}
      </p>
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
        <p
          className="truncate font-[Arial,Helvetica,sans-serif] font-bold uppercase tracking-[0.16em] text-white"
          style={{ fontSize: "clamp(0.9rem,1.9vw,1.7rem)" }}
        >
          {branchName?.trim() ? branchName : "Exchange Rates"}
        </p>
      </div>

      <div
        className="grid min-h-0 flex-1 basis-0 gap-[1.2vmin] overflow-hidden p-[1.6vmin]"
        style={{
          gridTemplateColumns: `repeat(${columns}, minmax(0,1fr))`,
          gridTemplateRows: `repeat(${rowCount}, minmax(0,1fr))`,
        }}
      >
        {rows.map((rate) => (
          <div
            key={rate.id}
            className="flex min-h-0 items-center justify-between gap-[1.5vmin] rounded-[1.4vmin] border px-[2vmin]"
            style={{ backgroundColor: UNIMONI_COLORS.panelBlue, borderColor: `${UNIMONI_COLORS.gold}33` }}
          >
            <span
              className="min-w-0 truncate font-[Arial,Helvetica,sans-serif] font-extrabold uppercase leading-none text-white"
              style={{ fontSize: "clamp(1.1rem,3.2vmin,3.4rem)" }}
            >
              {getRateDisplayLabel(rate)}
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
