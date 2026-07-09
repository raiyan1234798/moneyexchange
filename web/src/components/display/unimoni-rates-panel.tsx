"use client";

import {
  UNIMONI_COLORS,
  formatUnimoniRate,
  getRateFlag,
  resolveSignageRates,
} from "@/lib/unimoni-signage";
import { UnimoniLogoImage } from "@/components/brand/unimoni-logo";
import { LiveClock } from "@/components/display/live-clock";
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

const BUY_COLOR = "#34d399"; // emerald (board — on dark)
const SELL_COLOR = "#38bdf8"; // sky (board — on dark)
const BUY_TEXT = "#047857"; // emerald-700 (panel — on white box)
const SELL_TEXT = "#0B3B7A"; // deep brand blue (panel — on white box)

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
        className="relative flex shrink-0 flex-col items-center gap-1 px-3 py-2"
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
        <LiveClock className="absolute right-3 top-1/2 -translate-y-1/2" />
      </div>

      <div
        className="grid shrink-0 grid-cols-[1.1fr_1fr_1fr] items-center gap-x-2 border-b-2 px-3 py-1.5 font-[Arial,Helvetica,sans-serif] text-[clamp(0.65rem,1vw,0.85rem)] font-bold uppercase tracking-wide text-white"
        style={{ borderColor: UNIMONI_COLORS.gold }}
      >
        <span className="pl-1">Currency</span>
        {showBuyRate ? <span className="text-center">We Buy</span> : <span />}
        {showSellRate ? <span className="text-center">We Sell</span> : <span />}
      </div>

      <div className="display-rates-body min-h-0 flex-1 basis-0 overflow-hidden px-2 py-1">
        {rows.map((rate, i) => (
          <div
            key={rate.id}
            className="display-rate-row grid min-h-0 flex-1 basis-0 grid-cols-[1.1fr_1fr_1fr] items-center gap-x-2 rounded-[5px] px-1 py-[0.4vh] font-[Arial,Helvetica,sans-serif]"
            style={{ backgroundColor: i % 2 === 1 ? "rgba(255,255,255,0.06)" : "transparent" }}
          >
            <span className="display-rate-currency flex min-h-0 min-w-0 items-center gap-[0.5vw] pl-1 font-bold uppercase text-white">
              {getRateFlag(rate) ? (
                <span className="shrink-0 leading-none">{getRateFlag(rate)}</span>
              ) : (
                <span
                  className="hidden h-[1.4em] w-[3px] shrink-0 rounded-full sm:block"
                  style={{ backgroundColor: UNIMONI_COLORS.gold }}
                />
              )}
              <span className="truncate">{rate.currencyCode}</span>
            </span>
            {showBuyRate ? (
              <span
                className="display-rate-value flex w-full items-center justify-center rounded-[5px] py-[0.4vh] px-1 text-center font-extrabold tabular-nums shadow-[0_1px_2px_rgba(0,0,0,0.25)] ring-1 ring-black/5"
                style={{ backgroundColor: UNIMONI_COLORS.white, color: BUY_TEXT }}
              >
                {formatUnimoniRate(rate.buyRate)}
              </span>
            ) : (
              <span />
            )}
            {showSellRate ? (
              <span
                className="display-rate-value flex w-full items-center justify-center rounded-[5px] py-[0.4vh] px-1 text-center font-extrabold tabular-nums shadow-[0_1px_2px_rgba(0,0,0,0.25)] ring-1 ring-black/5"
                style={{ backgroundColor: UNIMONI_COLORS.white, color: SELL_TEXT }}
              >
                {formatUnimoniRate(rate.sellRate)}
              </span>
            ) : (
              <span />
            )}
          </div>
        ))}
      </div>

      <div className="h-1 shrink-0" style={{ backgroundColor: UNIMONI_COLORS.gold }} />
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
