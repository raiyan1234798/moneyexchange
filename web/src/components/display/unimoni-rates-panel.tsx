"use client";

import {
  UNIMONI_COLORS,
  UNIMONI_USD_NOTE,
  SIGNAGE_MAX_VISIBLE_RATES,
  formatUnimoniRate,
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
  const hasScroll = rows.length > SIGNAGE_MAX_VISIBLE_RATES;

  return (
    <aside
      className={`display-rates-panel flex h-full w-full min-h-0 shrink-0 flex-col lg:w-[35%] xl:w-[32%] ${className}`}
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

      <div
        className={`min-h-0 flex-1 px-2 py-1 ${hasScroll ? "overflow-y-auto overscroll-contain" : "overflow-hidden"}`}
        style={
          hasScroll
            ? { maxHeight: `calc(${SIGNAGE_MAX_VISIBLE_RATES} * clamp(1.6rem, 2.4vh, 2.1rem))` }
            : undefined
        }
      >
        <div className="flex flex-col gap-[0.12rem]">
          {rows.map((rate) => (
            <div
              key={rate.id}
              className="grid grid-cols-[1.1fr_1fr_1fr] items-center gap-x-2 font-[Arial,Helvetica,sans-serif]"
            >
              <span className="pl-1 text-[clamp(0.8rem,1.25vw,1.05rem)] font-bold uppercase text-white">
                {rate.currencyCode}
              </span>
              {showBuyRate ? (
                <span
                  className="rounded-[3px] px-1 py-[0.1rem] text-center text-[clamp(0.75rem,1.15vw,0.95rem)] font-bold tabular-nums"
                  style={{ backgroundColor: UNIMONI_COLORS.white, color: UNIMONI_COLORS.darkText }}
                >
                  {formatUnimoniRate(rate.buyRate)}
                </span>
              ) : (
                <span />
              )}
              {showSellRate ? (
                <span
                  className="rounded-[3px] px-1 py-[0.1rem] text-center text-[clamp(0.75rem,1.15vw,0.95rem)] font-bold tabular-nums"
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
      </div>

      <div className="h-0.5 shrink-0" style={{ backgroundColor: UNIMONI_COLORS.gold }} />

      <p className="shrink-0 px-3 py-1.5 font-[Arial,Helvetica,sans-serif] text-[clamp(0.5rem,0.85vw,0.72rem)] leading-snug text-white/85">
        {UNIMONI_USD_NOTE}
      </p>
    </aside>
  );
}
