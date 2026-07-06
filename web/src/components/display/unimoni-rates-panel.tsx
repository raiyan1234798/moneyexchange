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
}

export function UnimoniRatesPanel({
  rates,
  showBuyRate = true,
  showSellRate = true,
  className = "",
}: UnimoniRatesPanelProps) {
  const rows = resolveSignageRates(rates);
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
        <p
          className="font-[Arial,Helvetica,sans-serif] text-[clamp(0.6rem,0.95vw,0.8rem)] font-bold uppercase tracking-[0.14em] text-white"
        >
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
            className="display-rate-row grid min-h-0 flex-1 basis-0 grid-cols-[1.1fr_1fr_1fr] items-stretch gap-x-2 font-[Arial,Helvetica,sans-serif]"
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
