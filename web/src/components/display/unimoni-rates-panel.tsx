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
import type { ExchangeRate, TransferRate } from "@/lib/types";

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
  /** Show the FOREX (We Buy / We Sell) card at all. Default true. */
  showForexCard?: boolean;
  /** CENTRALIZED transfer rates (head office) — same for all branches. When
      provided, the transfer card uses these instead of branch-level values. */
  transferRates?: TransferRate[];
  /** Label for the local-currency transfer column (default "UGX"). */
  transferLocalLabel?: string;
  /** Multiplier for the rate-card text/row size (default 1). */
  scale?: number;
  /** Extra size multiplier for the CURRENCY code text only (default 1). */
  currencyScale?: number;
  /** Extra size multiplier for the WE BUY / WE SELL values only (default 1). */
  valueScale?: number;
  /** Width of the rate card as a % of the screen (desktop/TV only). */
  widthPercent?: number;
  /** Custom brand logo (rebrand) for the header — overrides the unimoni logo. */
  headerLogoUrl?: string | null;
  /** Optional second header logo (co-brand). */
  headerLogoUrl2?: string | null;
  /** Show just the first header logo or both side by side on normal slides. */
  headerLogoDisplay?: "single" | "both";
  /** Header logo behaviour on the PROMO slide: keep / hide / show only the 2nd logo. */
  promoLogoMode?: "keep" | "hide" | "second";
  /** Subtitle under the transfer card title (e.g. "T.T : AGAINST USD / UGX"). */
  transferRateSubtitle?: string | null;
  /** Note shown at the bottom of the FIRST rate screen only (e.g. "USD Small Bill BUY @ 3600"). */
  rateCardNote?: string | null;
  /** Which forex page(s) show the note: first forex page ("first") or all forex pages. */
  rateNotePlacement?: "first" | "all";
  /** CSS font-family for the whole rate card (header + table). */
  fontCss?: string;
  /** Seconds each rotating rate screen stays visible. Default 5. */
  sheetIntervalSeconds?: number;
  /** Promotional card: image shown as its own rotating screen. Hidden when empty. */
  promoImageUrl?: string | null;
  /** Promotional gallery: several images/videos, each its own rotating promo screen. */
  promoMedia?: Array<{ type: "image" | "video"; url: string }>;
  /** Promotional card: text ABOVE the image. */
  promoTextTop?: string | null;
  /** Promotional card: text message below the image (alone, or under the image). */
  promoText?: string | null;
  /** Seconds the promotional card stays visible (defaults to sheetIntervalSeconds). */
  promoDurationSeconds?: number;
  /** Order the rotating slides appear in. Missing/absent slides are skipped. */
  rateCardOrder?: Array<"forex" | "transfer" | "promo">;
  /** Play promo videos WITH sound (default muted). */
  videoSoundOn?: boolean;
}

const BUY_COLOR = "#34d399"; // emerald (board — on dark)
const SELL_COLOR = "#38bdf8"; // sky (board — on dark)
const NAVY_TEXT = "#0D2680"; // Rich Deep Blue (Pantone 2748 C) — codes/values on the light panel
const STRIPE_LIGHT = "#FFFFFF";
const STRIPE_BLUE = "#E4EFF9";

/** Customers read at most this many rows per sheet; extra currencies rotate in. */
const RATES_PER_SHEET = 12;

interface Sheet {
  kind: "rates" | "transfer" | "promo";
  rows: ExchangeRate[];
  /** For a promo sheet: the media (image/video) shown on this screen. */
  promoMedia?: { type: "image" | "video"; url: string };
}

function chunkRows(rows: ExchangeRate[], kind: Sheet["kind"]): Sheet[] {
  if (rows.length === 0) return [];
  // Balance currencies evenly across sheets so no page is left mostly empty
  // (e.g. 17 → 9 + 8, not 12 + 5) — each sheet fills the card nicely.
  const numSheets = Math.ceil(rows.length / RATES_PER_SHEET);
  const perSheet = Math.ceil(rows.length / numSheets);
  const sheets: Sheet[] = [];
  for (let i = 0; i < rows.length; i += perSheet) {
    sheets.push({ kind, rows: rows.slice(i, i + perSheet) });
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
  showForexCard = true,
  transferRates,
  transferLocalLabel = "UGX",
  scale = 1,
  currencyScale = 1,
  valueScale = 1,
  widthPercent,
  headerLogoUrl,
  headerLogoUrl2,
  headerLogoDisplay = "single",
  promoLogoMode = "keep",
  transferRateSubtitle,
  rateCardNote,
  rateNotePlacement = "first",
  fontCss,
  sheetIntervalSeconds,
  promoImageUrl,
  promoMedia,
  promoTextTop,
  promoText,
  promoDurationSeconds,
  rateCardOrder,
  videoSoundOn = false,
}: UnimoniRatesPanelProps) {
  const rows = resolveSignageRates(rates);
  // Hooks must run unconditionally (before the board early-return).
  const now = useNow();
  // Transfer is its OWN card (separate rotating screen), never mixed into the
  // forex table. Rates come from the CENTRALIZED head-office set (same for all
  // branches) when provided; legacy branch-level values are the fallback.
  const centralTransferRows: ExchangeRate[] = (transferRates ?? [])
    .filter((t) => !t.isHidden && ((t.transferUsd ?? 0) > 0 || (t.transferLocal ?? 0) > 0))
    .map(
      (t) =>
        ({
          id: `transfer-${t.currencyCode}`,
          branchId: "",
          currencyCode: t.currencyCode,
          displayName: t.currencyCode,
          buyRate: 0,
          sellRate: 0,
          transferUsd: t.transferUsd,
          transferLocal: t.transferLocal,
          version: 1,
          displayOrder: t.displayOrder ?? 0,
          isHidden: false,
          status: "published",
          updatedBy: t.updatedBy ?? "",
          updatedByName: t.updatedByName ?? "",
          createdAt: t.createdAt ?? new Date(),
          updatedAt: t.updatedAt ?? new Date(),
        }) as ExchangeRate,
    );
  const transferRows = showTransferCard
    ? centralTransferRows.length > 0
      ? centralTransferRows
      : rows.filter(hasTransfer)
    : [];
  // The promotional card only joins the rotation when something was uploaded
  // ("if we don't upload, it will not display").
  const promoImage = promoImageUrl?.trim() || "";
  const promoMessage = promoText?.trim() || "";
  const promoTop = promoTextTop?.trim() || "";
  // Gallery: several images/videos each rotate as their own promo screen. Falls
  // back to the single legacy promo image when the gallery is empty.
  const promoItems: Array<{ type: "image" | "video"; url: string }> = (
    promoMedia && promoMedia.length > 0
      ? promoMedia
      : promoImage
        ? [{ type: "image" as const, url: promoImage }]
        : []
  ).filter((m) => m.url?.trim());
  const hasPromoText = Boolean(promoMessage || promoTop);
  // Build each slide group, then lay them out in the admin-chosen order.
  // Forex can be turned off entirely (showForexCard) — then no forex slide shows.
  const forexSheets = showForexCard ? chunkRows(rows, "rates") : [];
  const transferSheets = chunkRows(transferRows, "transfer");
  const promoSheets: Sheet[] =
    promoItems.length > 0
      ? promoItems.map((m) => ({ kind: "promo", rows: [], promoMedia: m }) as Sheet)
      : hasPromoText
        ? [{ kind: "promo", rows: [] } as Sheet]
        : [];
  const baseOrder: Array<"forex" | "transfer" | "promo"> =
    rateCardOrder && rateCardOrder.length > 0
      ? [...rateCardOrder]
      : ["forex", "transfer", "promo"];
  // Safety net: if there ARE transfer rates to show (showTransferCard is on and
  // head office has published rates) but the saved slide order somehow omits
  // "transfer", still include it — otherwise the uploaded transfer rates would
  // never appear on the TV. Slot it before the promo card, matching the default.
  if (transferSheets.length > 0 && !baseOrder.includes("transfer")) {
    const promoAt = baseOrder.indexOf("promo");
    if (promoAt >= 0) baseOrder.splice(promoAt, 0, "transfer");
    else baseOrder.push("transfer");
  }
  const order = baseOrder;
  const groupFor = (slide: "forex" | "transfer" | "promo"): Sheet[] =>
    slide === "forex" ? forexSheets : slide === "transfer" ? transferSheets : promoSheets;
  const sheets: Sheet[] = order.flatMap(groupFor);
  const sheetCount = Math.max(sheets.length, 1);
  const [sheetIndex, setSheetIndex] = useState(0);

  // Manually adjustable sequence timing (per the client: "3 seconds, 6 seconds,
  // 10 seconds — set manually"). The promo card can hold its own duration.
  const rateMs = Math.max(2, sheetIntervalSeconds ?? 5) * 1000;
  const promoMs = Math.max(2, promoDurationSeconds ?? sheetIntervalSeconds ?? 5) * 1000;
  const activeKind = (sheets[sheetIndex % sheetCount] ?? { kind: "rates" }).kind;

  useEffect(() => {
    if (sheetCount <= 1) return;
    const timer = window.setTimeout(
      () => setSheetIndex((i) => (i + 1) % sheetCount),
      activeKind === "promo" ? promoMs : rateMs,
    );
    return () => window.clearTimeout(timer);
  }, [sheetCount, sheetIndex, activeKind, promoMs, rateMs]);

  const activeSheet: Sheet = sheets[sheetIndex % sheetCount] ?? { kind: "rates", rows: [] };
  // No padding: every page's rows share the full card height, so each rotating
  // page fills completely with no empty gap (balanced chunking keeps pages a
  // similar length, so row heights stay consistent across the rotation).
  const paddedRows: (ExchangeRate | null)[] = activeSheet.rows;
  const isTransferSheet = activeSheet.kind === "transfer";
  const isPromoSheet = activeSheet.kind === "promo";
  // The note ("WE BUY US$ small bills @ …") belongs to the FOREX rates. It shows
  // on the first forex page WHEREVER it lands in the chosen slide order (so it
  // still appears even when transfer/promo is set first), or on every forex page
  // when rateNotePlacement === "all".
  const activeIndex = sheetIndex % sheetCount;
  const firstForexIndex = sheets.findIndex((sheet) => sheet.kind === "rates");
  const noteText = rateCardNote?.trim() || "";
  const showNote =
    Boolean(noteText) &&
    activeSheet.kind === "rates" &&
    (rateNotePlacement === "all" || activeIndex === firstForexIndex);

  if (variant === "board") {
    return (
      <RatesBoard
        rows={rows}
        showBuyRate={showBuyRate}
        showSellRate={showSellRate}
        branchName={branchName}
        className={className}
        fontCss={fontCss}
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
  const gridColumns = `1.5fr ${valueColumns.map(() => "1fr").join(" ")}`.trim();
  // No sub-label on the promotion screen (client: remove "SPECIAL OFFER").
  const headerSubLabel = isPromoSheet
    ? ""
    : isTransferSheet
      ? "Transfer Rates"
      : "Exchange Rates";

  const asideStyle = {
    background: `linear-gradient(180deg, ${UNIMONI_COLORS.navy} 0%, ${UNIMONI_COLORS.headerBlue} 100%)`,
    fontFamily: fontCss ?? "Arial, Helvetica, sans-serif",
    width: widthPercent ? `${widthPercent}%` : undefined,
    "--rate-scale": scale,
    "--currency-scale": currencyScale,
    "--value-scale": valueScale,
  } as CSSProperties;

  return (
    <aside
      className={`display-rates-panel flex h-full min-h-0 w-full flex-1 flex-col transition-[width] duration-500 ease-out lg:w-[35%] lg:flex-none lg:shrink-0 xl:w-[32%] ${className}`}
      style={asideStyle}
    >
      {/* Header: a BIG centered logo with date + time stacked in the right
          corner (values only, no labels). Flex — not absolute — so the date
          block can NEVER overlap the logo, even on a narrow card: the logo
          just shifts left when space runs out. */}
      <div className="flex shrink-0 items-center gap-[0.6vw] px-[1vw] py-[1.1vh]">
        {/* Date/time is shrink-0 (it always keeps its corner) and the LOGO is
            the flexible one — it scales down via max-w-full + object-contain
            when the card is narrow. Overlap is impossible at any width. */}
        <div className="min-w-0 flex-1" aria-hidden />
        <div className="flex min-w-0 shrink flex-col items-center justify-center">
          {/* Logo behaviour:
              - normal slide: first logo, or BOTH side by side (headerLogoDisplay).
              - promo slide: keep the normal logo(s), HIDE them, or show only the
                2nd logo (promoLogoMode) — lets a partner/co-brand logo take over
                while the promotion plays, or clear the header entirely. */}
          {(() => {
            const custom1 = headerLogoUrl?.trim() || "";
            const custom2 = headerLogoUrl2?.trim() || "";
            let logos: string[];
            if (isPromoSheet) {
              if (promoLogoMode === "hide") logos = [];
              else if (promoLogoMode === "second") logos = custom2 ? [custom2] : custom1 ? [custom1] : [];
              else logos = headerLogoDisplay === "both" ? [custom1, custom2].filter(Boolean) : custom1 ? [custom1] : [];
            } else {
              logos = headerLogoDisplay === "both" ? [custom1, custom2].filter(Boolean) : custom1 ? [custom1] : [];
            }
            if (isPromoSheet && promoLogoMode === "hide") return null;
            if (logos.length === 0) {
              return (
                <UnimoniLogoImage
                  variant="onDark"
                  width={280}
                  height={72}
                  className="h-[clamp(1.9rem,3.9vh,3.3rem)] w-auto max-w-full object-contain"
                  priority
                />
              );
            }
            return (
              <div className="flex min-w-0 items-center justify-center gap-[0.8vw]">
                {logos.map((src, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={`${src}-${i}`}
                    src={src}
                    alt="Brand logo"
                    className="h-[clamp(2rem,4.2vh,3.6rem)] w-auto max-w-full object-contain"
                  />
                ))}
              </div>
            );
          })()}
          {headerSubLabel ? (
            <p className="whitespace-nowrap text-[clamp(0.75rem,1.3vw,1.2rem)] font-extrabold uppercase tracking-[0.2em] text-white">
              {headerSubLabel}
            </p>
          ) : null}
          {isTransferSheet && transferRateSubtitle?.trim() ? (
            <p className="whitespace-nowrap text-[clamp(0.5rem,0.9vw,0.85rem)] font-semibold uppercase tracking-[0.14em] text-white/80">
              {transferRateSubtitle.trim()}
            </p>
          ) : null}
        </div>
        {/* Date + time — hidden on the promotion screen (client request); the
            balancing spacer keeps the logo centered when it's gone. */}
        {isPromoSheet ? (
          <div className="min-w-0 flex-1" aria-hidden />
        ) : (
          <div className="flex shrink-0 flex-col items-end justify-end self-end pb-[0.2vh] pl-[0.4vw] leading-tight">
            <span className="whitespace-nowrap text-[clamp(0.5rem,0.72vw,0.8rem)] font-semibold tabular-nums text-white/75">
              {now ? formatSignageDate(now) : "—"}
            </span>
            <span className="whitespace-nowrap text-[clamp(0.5rem,0.72vw,0.8rem)] font-medium tabular-nums text-white/65">
              {now ? formatSignageTime(now) : "—"}
            </span>
          </div>
        )}
      </div>

      {/* White table card FILLS the panel height (no empty blue area below the
          last row); rows grow evenly to share the space and the type auto-scales. */}
      <div className="mx-[0.6vw] mb-[0.8vh] flex min-h-0 flex-1 flex-col overflow-hidden rounded-[10px] bg-white shadow-[0_2px_10px_rgba(0,0,0,0.25)]">
        {isPromoSheet ? (
          // Promotional card — its own rotating screen in the rate-card space:
          // uploaded image (whole image visible) and/or a message.
          <div
            key={`promo-${sheetIndex}`}
            className={`rates-sheet-fade flex min-h-0 flex-1 flex-col items-center justify-center ${
              promoTop || promoMessage ? "gap-[1vh] p-[0.8vw]" : ""
            }`}
          >
            {promoTop ? (
              <p
                className="shrink-0 px-2 text-center font-extrabold uppercase leading-tight"
                style={{
                  color: NAVY_TEXT,
                  fontFamily: fontCss ?? "var(--font-brand), 'Trebuchet MS', sans-serif",
                  fontSize: activeSheet.promoMedia ? "clamp(0.8rem,1.3vw,1.3rem)" : "clamp(1.2rem,2.2vw,2.4rem)",
                }}
              >
                {promoTop}
              </p>
            ) : null}
            {activeSheet.promoMedia ? (
              // The WHOLE media shows (object-contain, never cropped) over a
              // blurred fill of itself — so it fills the card with no empty gaps
              // and nothing is cut off.
              <div className="relative min-h-0 w-full flex-1 overflow-hidden rounded-md">
                {activeSheet.promoMedia.type === "video" ? (
                  <video
                    key={activeSheet.promoMedia.url}
                    src={activeSheet.promoMedia.url}
                    autoPlay
                    muted={!videoSoundOn}
                    loop
                    playsInline
                    controls={false}
                    disablePictureInPicture
                    onCanPlay={(e) => {
                      const v = e.currentTarget;
                      // Try to honour the sound setting; if the browser blocks
                      // unmuted autoplay, fall back to muted so it still plays.
                      v.muted = !videoSoundOn;
                      void v.play().catch(() => {
                        v.muted = true;
                        void v.play().catch(() => {});
                      });
                    }}
                    className="relative z-10 h-full w-full object-contain"
                  />
                ) : (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={activeSheet.promoMedia.url}
                      alt=""
                      aria-hidden
                      className="absolute inset-0 h-full w-full scale-110 object-cover blur-xl brightness-95"
                    />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={activeSheet.promoMedia.url}
                      alt="Promotion"
                      className="relative z-10 h-full w-full object-contain"
                    />
                  </>
                )}
              </div>
            ) : null}
            {promoMessage ? (
              <p
                className="shrink-0 px-2 text-center font-extrabold uppercase leading-tight"
                style={{
                  color: NAVY_TEXT,
                  fontFamily: fontCss ?? "var(--font-brand), 'Trebuchet MS', sans-serif",
                  fontSize: activeSheet.promoMedia ? "clamp(0.8rem,1.3vw,1.3rem)" : "clamp(1.2rem,2.2vw,2.4rem)",
                }}
              >
                {promoMessage}
              </p>
            ) : null}
          </div>
        ) : (
        <>
        <div
          className="grid shrink-0 items-stretch px-2 py-[0.8vh] text-[clamp(0.75rem,1.25vw,1.15rem)] font-extrabold uppercase tracking-wide"
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
              className="display-rate-row grid min-h-0 items-stretch rounded-[6px]"
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
        </>
        )}

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

      {/* Per-branch note BELOW the white card, on the blue panel — bold white
          text like the client's reference board ("WE BUY US $ SMALL BILLS …
          @3300"). FIRST rate screen only; editable in Settings per branch. */}
      {showNote ? (
        <div
          className="shrink-0 px-[1vw] pb-[1vh] pt-[0.2vh] text-left font-extrabold uppercase leading-tight text-white"
          style={{ fontSize: "clamp(0.7rem, 1.05vw, 1.05rem)" }}
        >
          {noteText}
        </div>
      ) : null}
    </aside>
  );
}

interface RatesBoardProps {
  rows: ExchangeRate[];
  showBuyRate: boolean;
  showSellRate: boolean;
  branchName?: string | null;
  className: string;
  fontCss?: string;
}

/**
 * Full-screen exchange-rate board. Every currency is laid out on a fixed grid
 * that fills the whole screen — no scrolling, no empty black area. Used when a
 * branch has no video playing.
 */
function RatesBoard({ rows, showBuyRate, showSellRate, branchName, className, fontCss }: RatesBoardProps) {
  const columns = rows.length <= 5 ? 1 : 2;
  const rowCount = Math.max(1, Math.ceil(rows.length / columns));

  return (
    <section
      className={`flex h-full min-h-0 w-full flex-1 flex-col ${className}`}
      style={{ backgroundColor: UNIMONI_COLORS.navy, fontFamily: fontCss }}
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
            className="truncate font-bold uppercase tracking-[0.16em] text-white"
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
              className="flex min-w-0 items-center gap-[1vmin] truncate font-extrabold uppercase leading-none text-white"
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
        className="font-semibold uppercase leading-none tracking-wide text-white/55"
        style={{ fontSize: "clamp(0.55rem,1.3vmin,1.05rem)" }}
      >
        {label}
      </span>
      <span
        className="font-extrabold leading-none tabular-nums"
        style={{ color, fontSize: "clamp(1.2rem,3.6vmin,3.6rem)" }}
      >
        {formatUnimoniRate(value)}
      </span>
    </div>
  );
}
