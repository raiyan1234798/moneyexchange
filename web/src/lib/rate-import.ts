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

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
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
  const body = rows
    .map((r) => `${r.currencyCode},${r.buyRate},${r.sellRate}`)
    .join("\n");
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
  const sheet = XLSX.utils.json_to_sheet(
    rows.map((r) => ({
      CURRENCY: r.currencyCode,
      "WE BUY": r.buyRate,
      "WE SELL": r.sellRate,
    })),
  );
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Rates");
  XLSX.writeFile(workbook, "exchange-rates-template.xlsx");
}

/** Parse ONE sheet. Returns null when its headers aren't a rates table. */
function parseSheet(sheet: XLSX.WorkSheet, sheetLabel: string): RateImportRow[] | null {
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
  for (let i = headerRowIdx + 1; i < rawRows.length; i++) {
    const row = rawRows[i] as unknown[];
    const rawCurrency = String(row[currencyIdx] ?? "").trim();
    if (!rawCurrency || rawCurrency.toUpperCase() === "CURRENCY") continue;

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

  return parsed;
}

/**
 * Parse EVERY sheet in the workbook and merge rows by currency code — so one
 * Excel file can carry a "Forex Rates" sheet (CURRENCY | WE BUY | WE SELL) AND
 * a "Transfer Rate" sheet (CURRENCY | $ | UGX). A currency on both sheets gets
 * its forex and transfer rates combined into a single row. Sheets whose
 * headers aren't a rates table are skipped.
 */
export function parseRateWorkbook(workbook: XLSX.WorkBook): RateImportRow[] {
  if (workbook.SheetNames.length === 0) throw new Error("File has no sheets");

  const merged = new Map<string, RateImportRow>();
  let parsedAnySheet = false;

  for (const sheetName of workbook.SheetNames) {
    const rows = parseSheet(workbook.Sheets[sheetName], sheetName);
    if (rows === null) continue;
    parsedAnySheet = true;

    for (const row of rows) {
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
    throw new Error(
      "Invalid columns. Use CURRENCY | WE BUY | WE SELL for forex, or CURRENCY | $ | UGX for a transfer table (both sheets can live in one file).",
    );
  }

  const result = [...merged.values()];
  if (result.length === 0) throw new Error("No valid rate rows found");
  return result;
}

export function parseRateFile(file: File): Promise<RateImportRow[]> {
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
