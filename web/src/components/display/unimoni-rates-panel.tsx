"use client";

import {
  UNIMONI_COLORS,
  UNIMONI_USD_NOTE,
  formatUnimoniRate,
  resolveSignageRates,
} from "@/lib/unimoni-signage";
import { UnimoniLogoImage } from "@/components/brand/unimoni-logo";
import type { ExchangeRate } from "@/lib/types";

interface UnimoniRatesPanelProps {
  rates: ExchangeRate[];
  showBuyRate?: boolean;
  showSellRate?: boolean;
}

export function UnimoniRatesPanel({
  rates,
  showBuyRate = true,
  showSellRate = true,
}: UnimoniRatesPanelProps) {
  const rows = resolveSignageRates(rates);

  return (
    <aside
      className="flex h-full w-[30%] shrink-0 flex-col"
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
          className="h-[clamp(1.5rem,2.5vh,2.25rem)] w-auto object-contain"
          priority
        />
        <p className="font-[Arial,Helvetica,sans-serif] text-[clamp(0.65rem,1vw,0.85rem)] font-bold uppercase tracking-[0.14em]" style={{ color: UNIMONI_COLORS.navy }}>
          Exchange Rates
        </p>
      </div>

      <div
        className="grid shrink-0 grid-cols-[1.1fr_1fr_1fr] items-center gap-x-2 border-b px-3 py-2 font-[Arial,Helvetica,sans-serif] text-[clamp(0.7rem,1.1vw,0.95rem)] font-bold uppercase tracking-wide text-white"
        style={{ borderColor: `${UNIMONI_COLORS.gold}40` }}
      >
        <span>Currency</span>
        {showBuyRate ? <span className="text-center">We Buy</span> : <span />}
        {showSellRate ? <span className="text-center">We Sell</span> : <span />}
      </div>

      <div className="min-h-0 flex-1 overflow-hidden px-2 py-1">
        <div className="flex h-full flex-col justify-between gap-[0.15rem]">
          {rows.map((rate) => (
            <div
              key={rate.id}
              className="grid grid-cols-[1.1fr_1fr_1fr] items-center gap-x-2 font-[Arial,Helvetica,sans-serif]"
            >
              <span className="pl-1 text-[clamp(0.85rem,1.35vw,1.15rem)] font-bold uppercase text-white">
                {rate.currencyCode}
              </span>
              {showBuyRate ? (
                <span
                  className="rounded-[3px] px-1 py-[0.15rem] text-center text-[clamp(0.8rem,1.25vw,1.05rem)] font-bold tabular-nums"
                  style={{ backgroundColor: UNIMONI_COLORS.white, color: UNIMONI_COLORS.darkText }}
                >
                  {formatUnimoniRate(rate.buyRate)}
                </span>
              ) : (
                <span />
              )}
              {showSellRate ? (
                <span
                  className="rounded-[3px] px-1 py-[0.15rem] text-center text-[clamp(0.8rem,1.25vw,1.05rem)] font-bold tabular-nums"
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

      <div
        className="h-0.5 shrink-0"
        style={{ backgroundColor: UNIMONI_COLORS.gold }}
      />

      <p className="shrink-0 px-3 py-2 font-[Arial,Helvetica,sans-serif] text-[clamp(0.55rem,0.95vw,0.8rem)] leading-snug text-white/90">
        {UNIMONI_USD_NOTE}
      </p>
    </aside>
  );
}
