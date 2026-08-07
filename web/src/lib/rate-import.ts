import * as XLSX from "xlsx";
import { buildCurrencyPayload, getCurrencyMeta, normalizeCurrencyCode } from "@/lib/currency-utils";

export interface RateImportRow {
  currencyCode: string;
  /** Label from the CURRENCY column — shown on signage (e.g. "CANADA CAD" or "USD"). */
  displayName: string;
  /** Catalog name derived from metadata when available. */
  currencyName?: string;
  country?: string;
  flag?: string;
  buyRate: number;
  sellRate: number;
  /** @deprecated single-value remittance rate. */
  remitRate?: number | null;
  /** Money-transfer rate in USD — the "$" column of a TRANSFER table. */
  transferUsd?: number | null;
  /** Money-transfer rate in local currency — the "UGX" column of a TRANSFER table. */
  transferLocal?: number | null;
}

/** Derive ISO-style code and human label from an Excel CURRENCY cell. */
export function parseCurrencyCell(raw: string): {
  currencyCode: string;
  displayName: string;
  currencyName?: string;
  country?: string;
  flag?: string;
} {
  const trimmed = raw.trim();
  if (!trimmed) return { currencyCode: "", displayName: "" };

  const currencyCode = normalizeCurrencyCode(trimmed);
  if (!currencyCode || !/^[A-Z]{3}$/.test(currencyCode)) {
    return { currencyCode: currencyCode || trimmed.toUpperCase(), displayName: trimmed };
  }

  const meta = getCurrencyMeta(currencyCode);
  const catalog = buildCurrencyPayload({ currencyCode, currencyName: meta?.name });

  const upper = trimmed.toUpperCase();
  const displayName =
    upper === currencyCode || (TEMPLATE_CURRENCIES as readonly string[]).includes(upper as (typeof TEMPLATE_CURRENCIES)[number])
      ? currencyCode
      : trimmed;

  return {
    currencyCode,
    displayName,
    currencyName: catalog.currencyName,
    country: catalog.country,
    flag: catalog.flag,
  };
}

/** Default 14 currencies for Unimoni branch signage template. */
export const TEMPLATE_CURRENCIES = [
  "USD",
  "GBP",
  "EUR",
  "KES",
  "ZAR",
  "CAD",
  "AUD",
  "HKD",
  "CNY",
  "INR",
  "SAR",
  "QAR",
  "OMR",
  "BHD",
] as const;

const TEMPLATE_SAMPLE_RATES: Record<string, { buy: number; sell: number }> = {
  USD: { buy: 3650, sell: 3680 },
  GBP: { buy: 4725, sell: 4975 },
  EUR: { buy: 4095, sell: 4315 },
  KES: { buy: 27.3, sell: 30 },
  ZAR: { buy: 195, sell: 350 },
  CAD: { buy: 2200, sell: 3600 },
  AUD: { buy: 2060, sell: 2700 },
  HKD: { buy: 450, sell: 480 },
  CNY: { buy: 500, sell: 520 },
  INR: { buy: 44, sell: 46 },
  SAR: { buy: 830, sell: 1120 },
  QAR: { buy: 900, sell: 1180 },
  OMR: { buy: 9200, sell: 9600 },
  BHD: { buy: 9600, sell: 9900 },
};

/** Labels that are never currencies — skip so leftover note rows don't break imports. */
const SKIP_ROW_LABELS = new Set([
  "SMALL BILLS",
  "SMALL BILL",
  "BILLS NOTE",
  "BILL NOTE",
  "RATE CARD NOTE",
  "RATE NOTE",
  "NOTE",
  "BILLS",
]);

const SKIP_SHEET_NAME_RE = /^(rate\s*card\s*note|small\s*bills?|note)$/i;

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

export function isSkippedRateImportLabel(raw: string): boolean {
  return SKIP_ROW_LABELS.has(normalizeHeader(raw));
}

/** Excel/CSV cells often arrive as TEXT with thousand separators ("3,680") or
    a stray "$" — read those as plain numbers instead of silently dropping the
    row (the classic "uploaded but not reflecting" failure). */
function toNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v ?? "").replace(/[$,\s]/g, "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function findColumnIndex(headers: string[], candidates: string[]): number {
  for (const candidate of candidates) {
    const idx = headers.findIndex((h) => h === candidate || h.includes(candidate));
    if (idx >= 0) return idx;
  }
  return -1;
}

export function buildRateTemplateRows(): RateImportRow[] {
  return TEMPLATE_CURRENCIES.map((code) => ({
    currencyCode: code,
    displayName: code,
    buyRate: TEMPLATE_SAMPLE_RATES[code]?.buy ?? 1,
    sellRate: TEMPLATE_SAMPLE_RATES[code]?.sell ?? 1,
  }));
}

export function downloadRateTemplateCsv(): void {
  const rows = buildRateTemplateRows();
  const header = "CURRENCY,WE BUY,WE SELL";
  const body = [
    ...rows.map((r) => `${r.currencyCode},${r.buyRate},${r.sellRate}`),
    // Not a currency — published as the branch small-bills note on Excel Publish.
    `SMALL BILLS,"*WE BUY USD SMALL BILLS $20, $10, $5, $2, $1 @ 3300",`,
  ].join("\n");
  const blob = new Blob([`${header}\n${body}\n`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "exchange-rates-template.csv";
  link.click();
  URL.revokeObjectURL(url);
}

export function downloadRateTemplateXlsx(): void {
  const rows = buildRateTemplateRows();
  const sheet = XLSX.utils.json_to_sheet([
    ...rows.map((r) => ({
      CURRENCY: r.currencyCode,
      "WE BUY": r.buyRate,
      "WE SELL": r.sellRate,
    })),
    {
      CURRENCY: "SMALL BILLS",
      "WE BUY": "*WE BUY USD SMALL BILLS $20, $10, $5, $2, $1 @ 3300",
      "WE SELL": "",
    },
  ]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Rates");
  XLSX.writeFile(workbook, "exchange-rates-template.xlsx");
}

function extractNoteTextFromCells(row: unknown[], currencyIdx: number, buyIdx: number, sellIdx: number): string | null {
  // Prefer WE BUY / WE SELL text cells; otherwise join remaining non-empty cells.
  const candidates: string[] = [];
  if (buyIdx >= 0) candidates.push(String(row[buyIdx] ?? "").trim());
  if (sellIdx >= 0) candidates.push(String(row[sellIdx] ?? "").trim());
  for (let c = 0; c < row.length; c++) {
    if (c === currencyIdx) continue;
    const t = String(row[c] ?? "").trim();
    if (t) candidates.push(t);
  }
  const note = candidates.find((t) => t.length > 0 && toNumber(t) == null) ?? candidates.find((t) => t.length > 0);
  return note?.trim() || null;
}

function extractNoteFromSheet(sheet: XLSX.WorkSheet): string | null {
  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  let fallback: string | null = null;
  for (const raw of rawRows) {
    const row = raw as unknown[];
    const joined = row.map((c) => String(c ?? "").trim()).filter(Boolean);
    if (joined.length === 0) continue;
    // Skip header-only rows like "RATE CARD NOTE".
    if (joined.length === 1 && isSkippedRateImportLabel(joined[0])) continue;
    if (joined.length === 1) {
      if (/small\s*bills|we\s*buy\s*usd|@\s*\d+/i.test(joined[0])) return joined[0];
      fallback = fallback ?? joined[0];
      continue;
    }
    if (isSkippedRateImportLabel(joined[0])) {
      const rest = joined.slice(1).join(" ").trim();
      if (rest) return rest;
      continue;
    }
    const asLine = joined.join(" ");
    if (/small\s*bills|we\s*buy\s*usd|@\s*\d+/i.test(asLine)) return asLine;
    fallback = fallback ?? asLine;
  }
  return fallback;
}

/** Parse ONE sheet. Returns null when its headers aren't a rates table. */
function parseSheet(
  sheet: XLSX.WorkSheet,
  sheetLabel: string,
): { rows: RateImportRow[]; rateCardNote: string | null } | null {
  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  if (rawRows.length < 2) return null;

  // The header row isn't always row 1 — real files often carry a title row
  // ("MONEY TRANSFER RATES") or a blank line above it. Scan the first rows for
  // one that has a CURRENCY column plus at least one rate column.
  let headerRowIdx = -1;
  let currencyIdx = -1;
  let buyIdx = -1;
  let sellIdx = -1;
  let transferUsdIdx = -1;
  let transferLocalIdx = -1;
  for (let r = 0; r < Math.min(rawRows.length - 1, 10); r++) {
    const headers = (rawRows[r] as unknown[]).map(normalizeHeader);
    const cIdx = findColumnIndex(headers, ["CURRENCY", "CODE", "CURRENCY CODE"]);
    const bIdx = findColumnIndex(headers, ["WE BUY", "BUY", "BUY RATE"]);
    const sIdx = findColumnIndex(headers, ["WE SELL", "SELL", "SELL RATE"]);
    // Separate TRANSFER table columns: "$" (USD) and "UGX"/local. Also accept
    // a single legacy TRANSFER/REMITTANCE column as the local transfer rate.
    const tuIdx = findColumnIndex(headers, ["USD $", "$ USD", "US$", "USD", "$", "DOLLAR"]);
    const tlIdx = findColumnIndex(headers, [
      "UGX",
      "LOCAL",
      "SHILLING",
      "TRANSFER",
      "REMITTANCE",
      "REMIT",
      "TT RATE",
      "T.T RATE",
      "T.T",
    ]);
    if (cIdx >= 0 && ((bIdx >= 0 && sIdx >= 0) || tuIdx >= 0 || tlIdx >= 0)) {
      headerRowIdx = r;
      currencyIdx = cIdx;
      buyIdx = bIdx;
      sellIdx = sIdx;
      transferUsdIdx = tuIdx;
      transferLocalIdx = tlIdx;
      break;
    }
  }
  if (headerRowIdx < 0) return null;

  const hasForex = buyIdx >= 0 && sellIdx >= 0;

  const num = (v: unknown): number | null => {
    const n = toNumber(v);
    return n != null && n > 0 ? n : null;
  };

  const parsed: RateImportRow[] = [];
  let rateCardNote: string | null = null;
  for (let i = headerRowIdx + 1; i < rawRows.length; i++) {
    const row = rawRows[i] as unknown[];
    const rawCurrency = String(row[currencyIdx] ?? "").trim();
    if (!rawCurrency || rawCurrency.toUpperCase() === "CURRENCY") continue;
    // Capture small-bills / note rows — never create a currency from them.
    if (isSkippedRateImportLabel(rawCurrency)) {
      const note = extractNoteTextFromCells(row, currencyIdx, buyIdx, sellIdx);
      if (note) rateCardNote = note;
      continue;
    }

    const { currencyCode, displayName, currencyName, country, flag } = parseCurrencyCell(rawCurrency);
    if (!currencyCode) continue;

    let buyRate = 0;
    let sellRate = 0;
    if (hasForex) {
      const b = toNumber(row[buyIdx]);
      const s = toNumber(row[sellIdx]);
      // A blank forex row inside a transfer-only sheet is fine — skip it.
      const blank = String(row[buyIdx] ?? "").trim() === "" && String(row[sellIdx] ?? "").trim() === "";
      if (!blank) {
        if (b == null || s == null) {
          throw new Error(`Invalid rates for ${displayName} on ${sheetLabel} row ${i + 1}`);
        }
        if (b <= 0 || s <= 0) {
          throw new Error(`Rates must be positive for ${displayName} (${sheetLabel})`);
        }
        buyRate = b;
        sellRate = s;
      }
    }

    const transferUsd = transferUsdIdx >= 0 ? num(row[transferUsdIdx]) : null;
    const transferLocal = transferLocalIdx >= 0 ? num(row[transferLocalIdx]) : null;

    // Skip empty rows (no forex and no transfer values).
    if (buyRate <= 0 && sellRate <= 0 && !transferUsd && !transferLocal) continue;

    parsed.push({
      currencyCode,
      displayName,
      currencyName,
      country,
      flag,
      buyRate,
      sellRate,
      transferUsd,
      transferLocal,
    });
  }

  return { rows: parsed, rateCardNote };
}

export type RateImportResult = {
  rows: RateImportRow[];
  /** Optional small-bills / rate-card note extracted from the file (not a currency). */
  rateCardNote: string | null;
};

/**
 * Parse EVERY sheet in the workbook and merge rows by currency code — so one
 * Excel file can carry a "Forex Rates" sheet (CURRENCY | WE BUY | WE SELL) AND
 * a "Transfer Rate" sheet (CURRENCY | $ | UGX). A currency on both sheets gets
 * its forex and transfer rates combined into a single row. Sheets whose
 * headers aren't a rates table are skipped. Note sheets / SMALL BILLS rows
 * populate rateCardNote without creating currencies.
 */
export function parseRateWorkbook(workbook: XLSX.WorkBook): RateImportResult {
  if (workbook.SheetNames.length === 0) throw new Error("File has no sheets");

  const merged = new Map<string, RateImportRow>();
  let parsedAnySheet = false;
  let rateCardNote: string | null = null;

  for (const sheetName of workbook.SheetNames) {
    if (SKIP_SHEET_NAME_RE.test(sheetName.trim())) {
      const fromNoteSheet = extractNoteFromSheet(workbook.Sheets[sheetName]);
      // Prefer an explicit note-sheet value, but never overwrite a better
      // SMALL BILLS row already captured from a rates sheet with a header-only miss.
      if (fromNoteSheet && (!rateCardNote || /@\s*\d+/i.test(fromNoteSheet))) {
        rateCardNote = fromNoteSheet;
      }
      continue;
    }

    const parsed = parseSheet(workbook.Sheets[sheetName], sheetName);
    if (parsed === null) continue;
    parsedAnySheet = true;
    if (parsed.rateCardNote) rateCardNote = parsed.rateCardNote;

    for (const row of parsed.rows) {
      const existing = merged.get(row.currencyCode);
      if (!existing) {
        merged.set(row.currencyCode, row);
        continue;
      }
      // Merge: forex values win where present; transfer values fill in from
      // whichever sheet carries them. Keep the richer display name.
      if (row.buyRate > 0 && row.sellRate > 0) {
        existing.buyRate = row.buyRate;
        existing.sellRate = row.sellRate;
        existing.displayName = row.displayName || existing.displayName;
      }
      if (row.transferUsd != null) existing.transferUsd = row.transferUsd;
      if (row.transferLocal != null) existing.transferLocal = row.transferLocal;
      existing.currencyName = existing.currencyName ?? row.currencyName;
      existing.country = existing.country ?? row.country;
      existing.flag = existing.flag ?? row.flag;
    }
  }

  if (!parsedAnySheet) {
    // Show what the file ACTUALLY starts with — "invalid columns" alone leaves
    // the user staring at a file that looks fine to them.
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(firstSheet, { header: 1, defval: "" });
    const firstFilled = rows.find((r) => (r as unknown[]).some((c) => String(c).trim() !== "")) as
      | unknown[]
      | undefined;
    const preview = firstFilled
      ?.map((c) => String(c).trim())
      .filter(Boolean)
      .slice(0, 6)
      .join(" | ");
    throw new Error(
      `Could not find the rate columns — your file starts with: "${preview ?? "(empty)"}". ` +
        "Use CURRENCY | WE BUY | WE SELL for forex, or CURRENCY | $ (USD) | UGX for transfer (both sheets can live in one file).",
    );
  }

  const result = [...merged.values()];
  if (result.length === 0) throw new Error("No valid rate rows found");
  return { rows: result, rateCardNote };
}

export function parseRateFile(file: File): Promise<RateImportResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = event.target?.result;
        if (!data) {
          reject(new Error("Could not read file"));
          return;
        }

        const workbook =
          file.name.toLowerCase().endsWith(".csv")
            ? XLSX.read(data, { type: "binary" })
            : XLSX.read(data, { type: "array" });

        resolve(parseRateWorkbook(workbook));
      } catch (error) {
        reject(error instanceof Error ? error : new Error("Failed to parse file"));
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file"));

    if (file.name.toLowerCase().endsWith(".csv")) {
      reader.readAsBinaryString(file);
    } else {
      reader.readAsArrayBuffer(file);
    }
  });
}
