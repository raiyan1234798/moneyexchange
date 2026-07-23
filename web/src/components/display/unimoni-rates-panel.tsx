"use client";

import { useEffect, useState, type CSSProperties } from "react";
import {
  UNIMONI_COLORS,
  formatUnimoniRate,
  getRateFlag,
  resolveSignageRates,
} from "@/lib/unimoni-signage";
import { displayAnimationClass, slideTransitionClass } from "@/lib/constants";
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
  /** Dedicated logo for the PROMOTION slide's logo bar (different logo during promo). */
  promoSlideLogoUrl?: string | null;
  /** Size multiplier for the promo-slide logo (1 = normal). */
  promoSlideLogoScale?: number;
  /** Size multiplier for the header logo on NORMAL slides (1 = normal). */
  headerLogoScale?: number;
  /** Size multiplier for the promotion text messages (1 = normal). */
  promoTextScale?: number;
  /** Continuous movement of the promotion text messages (none by default). */
  promoTextAnimation?: string | null;
  /** Font for the promotion text messages (falls back to the card font). */
  promoFontCss?: string;
  /** Animated effect for the header logo (default none). */
  headerLogoAnimation?: string;
  /** Animation for the promo-slide logo — undefined/null follows headerLogoAnimation. */
  promoSlideLogoAnimation?: string | null;
  /** Show just the first header logo or both side by side on normal slides. */
  headerLogoDisplay?: "single" | "both";
  /** Header logo behaviour on the PROMO slide: keep / hide / show only the 2nd logo. */
  promoLogoMode?: "keep" | "hide" | "second";
  /** When true, never fall back to the default Unimoni logo when a custom logo is expected. */
  replaceDefaultLogo?: boolean;
  /** Alternate between header logo 1 and 2 on normal slides. */
  headerLogoRotationEnabled?: boolean;
  /** Seconds each logo stays visible when rotation is enabled. */
  headerLogoRotationIntervalSeconds?: number;
  /** EXTRA rate-card header logos (any number) — they join the rotation and every
      one of them moves with the saved header-logo animation. */
  headerLogoUrls?: string[] | null;
  /** Note shown at the bottom of the FIRST rate screen only (e.g. "USD Small Bill BUY @ 3600"). */
  rateCardNote?: string | null;
  /** Which forex page(s) show the note: first forex page ("first") or all forex pages. */
  rateNotePlacement?: "first" | "all";
  /** Size multiplier for the WE BUY note (1 = normal). */
  rateNoteScale?: number;
  /** CSS font-family for the WE BUY note (falls back to rate-card font). */
  rateNoteFontCss?: string;
  /** Align rate-card sheets to wall-clock so multiple TVs stay in sync. */
  syncPlayback?: boolean;
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
  /** Seconds the TRANSFER card stays visible (defaults to sheetIntervalSeconds). */
  transferDurationSeconds?: number | null;
  /** How promo media fits its card: fill (stretch), cover (crop), contain (whole). */
  promoMediaFit?: "fill" | "cover" | "contain";
  /** Order the rotating slides appear in. Missing/absent slides are skipped. */
  rateCardOrder?: Array<"forex" | "transfer" | "promo">;
  /** Play promo videos WITH sound (default muted). */
  videoSoundOn?: boolean;
  /** Transition when the rotating sheet changes. Default fade. */
  sheetTransition?: string;
  /** Continuous movement applied to every WE BUY / WE SELL value. */
  valueTextAnimation?: string | null;
  /** Continuous movement applied to every currency CODE (USD, EUR, …). */
  currencyTextAnimation?: string | null;
  /** Continuous movement applied to every country FLAG in the table. */
  flagAnimation?: string | null;
  /** Continuous movement for the card heading (EXCHANGE RATES / TRANSFER RATES). */
  headingAnimation?: string | null;
  /** Admin edits to how currencies look (flag emoji by code) — beats the catalog. */
  currencyOverrides?: Record<string, { flag?: string; name?: string }> | null;
  /** Fires each time a FULL rotation (all sheets, incl. promo) completes. */
  onRotationComplete?: () => void;
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

/**
 * Would the rate card have ANYTHING to show (a forex sheet, a transfer sheet or
 * a promo slide)? Mirrors the sheet-building below — the display uses it to
 * HIDE the whole card (video takes the full screen) instead of cycling a
 * "Rates are being updated" placeholder on branches with no rates yet.
 */
export function rateCardHasContent(args: {
  rates: ExchangeRate[];
  transferRates?: TransferRate[] | null;
  showForexCard: boolean;
  showTransferCard: boolean;
  promoMedia?: Array<{ type: "image" | "video"; url: string }>;
  promoImageUrl?: string | null;
  promoText?: string | null;
  promoTextTop?: string | null;
}): boolean {
  const rows = resolveSignageRates(args.rates);
  if (args.showForexCard && rows.length > 0) return true;
  const centralTransfer = (args.transferRates ?? []).filter(
    (t) => !t.isHidden && ((t.transferUsd ?? 0) > 0 || (t.transferLocal ?? 0) > 0),
  );
  if (args.showTransferCard && (centralTransfer.length > 0 || rows.some(hasTransfer))) return true;
  const promoItems = (args.promoMedia && args.promoMedia.length > 0
    ? args.promoMedia
    : args.promoImageUrl?.trim()
      ? [{ url: args.promoImageUrl }]
      : []
  ).filter((m) => m.url?.trim());
  if (promoItems.length > 0) return true;
  return Boolean(args.promoText?.trim() || args.promoTextTop?.trim());
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
  promoSlideLogoUrl,
  promoSlideLogoScale = 1,
  headerLogoScale = 1,
  promoTextScale = 1,
  promoTextAnimation = null,
  promoFontCss,
  headerLogoAnimation = "none",
  promoSlideLogoAnimation = null,
  headerLogoDisplay = "single",
  promoLogoMode = "hide",
  replaceDefaultLogo = false,
  headerLogoRotationEnabled = false,
  headerLogoRotationIntervalSeconds = 10,
  headerLogoUrls = null,
  rateCardNote,
  rateNotePlacement = "first",
  rateNoteScale = 0.85,
  rateNoteFontCss,
  syncPlayback = false,
  fontCss,
  sheetIntervalSeconds,
  promoImageUrl,
  promoMedia,
  promoTextTop,
  promoText,
  promoDurationSeconds,
  transferDurationSeconds = null,
  promoMediaFit = "fill",
  rateCardOrder,
  videoSoundOn = false,
  sheetTransition = "fade",
  valueTextAnimation = null,
  currencyTextAnimation = null,
  flagAnimation = null,
  headingAnimation = null,
  currencyOverrides = null,
  onRotationComplete,
}: UnimoniRatesPanelProps) {
  const rows = resolveSignageRates(rates);
  // Hooks must run unconditionally (before the board early-return).
  const now = useNow();
  // Transfer is its OWN card (separate rotating screen), never mixed into the
  // forex table. Rates come from the CENTRALIZED head-office set (same for all
  // branches) when provided; legacy branch-level values are the fallback.
  const centralTransferRows: ExchangeRate[] = (transferRates ?? [])
    // USD is the base currency the card quotes against — never a row itself.
    .filter((t) => t.currencyCode?.toUpperCase() !== "USD")
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
  const [logoRotationIndex, setLogoRotationIndex] = useState(0);

  const customLogo1 = headerLogoUrl?.trim() || "";
  const customLogo2 = headerLogoUrl2?.trim() || "";
  const extraHeaderLogos = (headerLogoUrls ?? []).map((u) => u?.trim() ?? "").filter(Boolean);
  // Every uploaded header logo takes a turn when rotation is on — primary,
  // alternate AND the extra gallery (any number). Whichever one is showing
  // gets the saved header-logo animation, exactly like the default logo.
  const logoRotationPool = [customLogo1, customLogo2, ...extraHeaderLogos].filter(Boolean);
  const isPromoSheetEarly = (sheets[sheetIndex % sheetCount] ?? { kind: "rates" }).kind === "promo";
  // Promo fills the panel: hide logo + clock. Default is "hide". Legacy saved
  // "keep" (previous default) is also treated as hide so existing TVs pick up
  // the full-bleed promo without a settings change; "second" still shows the
  // alternate logo bar. Admins who want logos back can use "second", or we
  // re-enable "keep" via an explicit opt-in if needed later.
  const hidePromoHeader = isPromoSheetEarly && promoLogoMode !== "second";

  const logoRotationPoolSize = logoRotationPool.length;
  // The interval keeps ticking straight through promo slides (the header is
  // merely hidden there): tearing it down and restarting from zero meant short
  // rate sheets NEVER reached the logo interval, so logos never took turns.
  useEffect(() => {
    if (!headerLogoRotationEnabled || logoRotationPoolSize < 2) return;
    const ms = Math.max(2, headerLogoRotationIntervalSeconds ?? 10) * 1000;
    const timer = window.setInterval(
      () => setLogoRotationIndex((i) => (i + 1) % logoRotationPoolSize),
      ms,
    );
    return () => window.clearInterval(timer);
  }, [headerLogoRotationEnabled, headerLogoRotationIntervalSeconds, logoRotationPoolSize]);

  // Manually adjustable sequence timing (per the client: "3 seconds, 6 seconds,
  // 10 seconds — set manually"). The promo card can hold its own duration.
  const rateMs = Math.max(2, sheetIntervalSeconds ?? 5) * 1000;
  const promoMs = Math.max(2, promoDurationSeconds ?? sheetIntervalSeconds ?? 5) * 1000;
  // The transfer card can hold its own seconds too (three independent timers:
  // forex / transfer / promotion). Unset = same as the forex slides.
  const transferMs = Math.max(2, transferDurationSeconds ?? sheetIntervalSeconds ?? 5) * 1000;
  const activeKind = (sheets[sheetIndex % sheetCount] ?? { kind: "rates" }).kind;

  // Sheet durations in order — used for both free-running and wall-clock sync.
  const sheetDurationsMs = sheets.map((s) =>
    s.kind === "promo" ? promoMs : s.kind === "transfer" ? transferMs : rateMs,
  );
  const cycleMs = sheetDurationsMs.reduce((sum, ms) => sum + ms, 0);

  function sheetIndexAtWallClock(nowMs: number): number {
    if (sheetCount <= 1 || cycleMs <= 0) return 0;
    let t = nowMs % cycleMs;
    for (let i = 0; i < sheetDurationsMs.length; i++) {
      if (t < sheetDurationsMs[i]) return i;
      t -= sheetDurationsMs[i];
    }
    return 0;
  }

  useEffect(() => {
    if (sheetCount <= 1) return;

    // Synchronized mode: all TVs with the same timings land on the same sheet
    // from wall-clock time — useful when promotions are copied to every branch.
    if (syncPlayback) {
      const tick = () => {
        const next = sheetIndexAtWallClock(Date.now());
        setSheetIndex((prev) => {
          if (prev !== next && next === 0) onRotationComplete?.();
          return next;
        });
      };
      tick();
      const timer = window.setInterval(tick, 250);
      return () => window.clearInterval(timer);
    }

    const timer = window.setTimeout(
      () => {
        setSheetIndex((i) => {
          const next = (i + 1) % sheetCount;
          // A full pass over EVERY sheet (incl. the promotion) just finished.
          if (next === 0) onRotationComplete?.();
          return next;
        });
      },
      activeKind === "promo" ? promoMs : activeKind === "transfer" ? transferMs : rateMs,
    );
    return () => window.clearTimeout(timer);
    // sheetDurationsMs / cycleMs are derived from the timing deps below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetCount, sheetIndex, activeKind, promoMs, transferMs, rateMs, onRotationComplete, syncPlayback, cycleMs]);

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
  // separate transfer card (USD / local currency, e.g. UGX). Plain "USD" —
  // no "$" symbol and no parentheses, per the client.
  const valueColumns: {
    key: string;
    header: string;
    get: (r: ExchangeRate) => number | null | undefined;
    isTransfer?: boolean;
  }[] = [];
  if (isTransferSheet) {
    valueColumns.push({ key: "usd", header: "USD", get: (r) => r.transferUsd ?? r.remitRate, isTransfer: true });
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

  /** Which logo URLs to render in the rate-card header, or null to hide the logo area. */
  function resolveHeaderLogos(): string[] | null {
    if (isPromoSheet) {
      if (hidePromoHeader) return null;
      if (promoLogoMode === "second") {
        // Logo bar ENABLED for the promo slide: always show something — the
        // dedicated promo-slide logo first, then the alternate, then the
        // primary, else the default unimoni logo (never an empty navy band).
        const promoLogo = promoSlideLogoUrl?.trim();
        if (promoLogo) return [promoLogo];
        if (customLogo2) return [customLogo2];
        if (customLogo1) return [customLogo1];
        if (extraHeaderLogos.length) return [extraHeaderLogos[0]];
        return [];
      }
      if (headerLogoDisplay === "both") return [customLogo1, customLogo2].filter(Boolean);
      if (customLogo1) return [customLogo1];
      if (customLogo2 && replaceDefaultLogo) return [customLogo2];
      return [];
    }

    if (headerLogoRotationEnabled && logoRotationPool.length >= 2) {
      return [logoRotationPool[logoRotationIndex % logoRotationPool.length]];
    }
    if (headerLogoDisplay === "both") return [customLogo1, customLogo2].filter(Boolean);
    if (customLogo1) return [customLogo1];
    if (customLogo2 && replaceDefaultLogo) return [customLogo2];
    // A logo uploaded ONLY to the extra gallery still shows (no dead end when
    // rotation is off or it is the sole logo).
    if (extraHeaderLogos.length) return [extraHeaderLogos[0]];
    return [];
  }

  const headerLogos = resolveHeaderLogos();
  // No custom logo resolved but the header is visible → default unimoni logo.
  // (Even with "Replace Unimoni default" on: an empty band is always worse.)
  const showDefaultLogo = headerLogos !== null && headerLogos.length === 0;
  const showCustomLogos = headerLogos !== null && headerLogos.length > 0;
  const showHeaderBar = !hidePromoHeader;

  // Animation class for whichever logo shows in the header (default or custom).
  const animClassFor = (name: string): string => displayAnimationClass(name);
  // The promo slide can carry its OWN animation; unset follows the rate-card one.
  const headerAnimClass = isPromoSheet
    ? animClassFor(promoSlideLogoAnimation ?? headerLogoAnimation)
    : animClassFor(headerLogoAnimation);
  // Each logo is sizable separately: promo-slide logo vs normal-slide header logo.
  const headerSizeScale = isPromoSheet ? promoSlideLogoScale : headerLogoScale;

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
      // The active slide type — the display re-times spin/flip per slide with it.
      data-anim-kind={activeKind}
    >
      {/* Header: logo + date/time. Hidden entirely on promo slides when logos are hidden
          so the promotion can fill the full panel. */}
      {showHeaderBar ? (
      <div className="flex shrink-0 items-center gap-[0.6vw] px-[1vw] py-[1.1vh]">
        <div className="min-w-0 flex-1" aria-hidden />
        <div className="flex min-w-0 shrink flex-col items-center justify-center">
          {headerLogos === null ? null : showCustomLogos ? (
            <div className="flex min-w-0 items-center justify-center gap-[0.8vw]">
              {headerLogos!.map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={`${src}-${i}`}
                  src={src}
                  alt="Brand logo"
                  className={`h-[clamp(2rem,4.2vh,3.6rem)] w-auto max-w-full object-contain ${headerAnimClass}`}
                  style={
                    headerSizeScale !== 1
                      ? { height: `calc(clamp(2rem,4.2vh,3.6rem) * ${headerSizeScale})` }
                      : undefined
                  }
                />
              ))}
            </div>
          ) : showDefaultLogo ? (
            <UnimoniLogoImage
              variant="onDark"
              width={280}
              height={72}
              className={`h-[clamp(1.9rem,3.9vh,3.3rem)] w-auto max-w-full object-contain ${headerAnimClass}`}
              style={
                headerSizeScale !== 1
                  ? { height: `calc(clamp(1.9rem,3.9vh,3.3rem) * ${headerSizeScale})` }
                  : undefined
              }
              priority
            />
          ) : null}
          {headerSubLabel ? (
            <p className="whitespace-nowrap text-[clamp(0.75rem,1.3vw,1.2rem)] font-extrabold uppercase tracking-[0.2em] text-white">
              {/* Inner span so the movement effect never shifts the header layout. */}
              <span className={`display-text-anim inline-block ${displayAnimationClass(headingAnimation)}`}>
                {headerSubLabel}
              </span>
            </p>
          ) : null}
        </div>
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
      ) : null}

      {/* Rate table / promo card FILLS the panel height. On promo the media is
          stretched to fill the whole card — nothing cropped, no empty bands. */}
      <div
        className={`flex min-h-0 flex-1 flex-col overflow-hidden shadow-[0_2px_10px_rgba(0,0,0,0.25)] ${
          hidePromoHeader
            ? "mx-0 mb-0 rounded-none"
            : "mx-[0.6vw] mb-[0.8vh] rounded-[10px] bg-white"
        }`}
        style={
          hidePromoHeader
            ? { backgroundColor: UNIMONI_COLORS.navy }
            : undefined
        }
      >
        {isPromoSheet ? (
          <div
            key={`promo-${sheetIndex}`}
            className={`${slideTransitionClass(sheetTransition)} flex min-h-0 flex-1 flex-col ${
              activeSheet.promoMedia && !promoTop && !promoMessage
                ? "overflow-hidden"
                : `items-center justify-center ${promoTop || promoMessage ? "gap-[1vh] p-[0.8vw]" : ""}`
            }`}
          >
            {promoTop ? (
              <p
                className={`display-text-anim shrink-0 px-2 text-center font-extrabold uppercase leading-tight ${displayAnimationClass(promoTextAnimation)}`}
                style={{
                  color: hidePromoHeader ? "#FFFFFF" : NAVY_TEXT,
                  fontFamily: promoFontCss ?? fontCss ?? "var(--font-brand), 'Trebuchet MS', sans-serif",
                  fontSize: `calc(${activeSheet.promoMedia ? "clamp(0.8rem,1.3vw,1.3rem)" : "clamp(1.2rem,2.2vw,2.4rem)"} * ${promoTextScale})`,
                }}
              >
                {promoTop}
              </p>
            ) : null}
            {activeSheet.promoMedia ? (
              <div
                className={`relative flex min-h-0 w-full items-center justify-center overflow-hidden ${
                  activeSheet.promoMedia && !promoTop && !promoMessage
                    ? "flex-1"
                    : "flex-1 rounded-md"
                }`}
                style={{ backgroundColor: UNIMONI_COLORS.navy }}
              >
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
                      v.muted = !videoSoundOn;
                      void v.play().catch(() => {
                        v.muted = true;
                        void v.play().catch(() => {});
                      });
                    }}
                    onPause={(e) => {
                      const v = e.currentTarget;
                      if (!v.ended && !v.seeking) void v.play().catch(() => {});
                    }}
                    // Stretch to exactly FILL the card: the whole frame stays
                    // visible (nothing cropped) and there are no navy bands.
                    // Same trade-off the client chose for the main video area.
                    className={`h-full w-full ${promoMediaFit === "cover" ? "object-cover" : promoMediaFit === "contain" ? "object-contain" : "object-fill"}`}
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={activeSheet.promoMedia.url}
                    alt="Promotion"
                    // Admin-chosen fit: fill=stretch (no gaps, nothing cut),
                    // cover=zoom (edges crop), contain=whole picture (bands).
                    className={`h-full w-full ${promoMediaFit === "cover" ? "object-cover" : promoMediaFit === "contain" ? "object-contain" : "object-fill"}`}
                  />
                )}
              </div>
            ) : null}
            {promoMessage ? (
              <p
                className={`display-text-anim shrink-0 px-2 text-center font-extrabold uppercase leading-tight ${displayAnimationClass(promoTextAnimation)}`}
                style={{
                  color: hidePromoHeader ? "#FFFFFF" : NAVY_TEXT,
                  fontFamily: promoFontCss ?? fontCss ?? "var(--font-brand), 'Trebuchet MS', sans-serif",
                  fontSize: `calc(${activeSheet.promoMedia ? "clamp(0.8rem,1.3vw,1.3rem)" : "clamp(1.2rem,2.2vw,2.4rem)"} * ${promoTextScale})`,
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
          className={`display-rates-body ${slideTransitionClass(sheetTransition)} min-h-0 gap-[0.35vh] overflow-hidden px-[0.35vw] py-[0.4vh]`}
        >
          {/* Empty-state for THIS slide's rows — checking the forex list here
              wrongly printed "being updated" on top of a full TRANSFER slide
              whenever a branch had no forex rates yet. */}
          {activeSheet.rows.length === 0 ? (
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
                  flag={
                    currencyOverrides?.[rate.currencyCode?.toUpperCase() ?? ""]?.flag?.trim() ||
                    getRateFlag(rate) ||
                    "🌍"
                  }
                  className={`!h-[1.85em] !w-[2.75em] shrink-0 rounded-[3px] shadow-[0_1px_2px_rgba(0,0,0,0.28)] ring-1 ring-black/10 ${displayAnimationClass(flagAnimation)}`}
                />
                <span className={`min-w-0 flex-1 truncate text-center ${displayAnimationClass(currencyTextAnimation)}`}>
                  {rate.currencyCode}
                </span>
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
                    className={`display-rate-value flex w-full items-center justify-center px-1 text-center font-bold tabular-nums ${displayAnimationClass(valueTextAnimation)}`}
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

        {/* Pagination dots stay on forex/transfer pages only — hidden while a
            promotion image/video is showing so the artwork is uninterrupted. */}
        {sheetCount > 1 && !isPromoSheet ? (
          <div
            className={`flex shrink-0 items-center justify-center gap-[0.5vw] pb-[0.6vh] ${
              hidePromoHeader ? "pt-[0.4vh]" : ""
            }`}
          >
            {sheets.map((sheet, i) => (
              <span
                key={`${sheet.kind}-${i}`}
                className="h-[7px] w-[7px] rounded-full transition-colors"
                style={{
                  backgroundColor:
                    i === sheetIndex % sheetCount
                      ? UNIMONI_COLORS.headerBlue
                      : "#C9D8E8",
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
          style={{
            fontSize: `calc(clamp(0.55rem, 0.85vw, 0.9rem) * ${rateNoteScale})`,
            fontFamily: rateNoteFontCss ?? fontCss ?? "Arial, Helvetica, sans-serif",
          }}
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
