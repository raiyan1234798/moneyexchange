import * as XLSX from "xlsx";

export interface RateImportRow {
  currencyCode: string;
  buyRate: number;
  sellRate: number;
}

const TEMPLATE_CURRENCIES = ["USD", "GBP", "EUR", "KES", "ZAR", "CAD", "AUD", "HKD", "CNY"] as const;

const TEMPLATE_SAMPLE_RATES: Record<string, { buy: number; sell: number }> = {
  USD: { buy: 3625, sell: 3685 },
  GBP: { buy: 4725, sell: 4975 },
  EUR: { buy: 4095, sell: 4315 },
  KES: { buy: 27.3, sell: 30 },
  ZAR: { buy: 195, sell: 350 },
  CAD: { buy: 2200, sell: 3600 },
  AUD: { buy: 2060, sell: 2700 },
  HKD: { buy: 450, sell: 480 },
  CNY: { buy: 500, sell: 520 },
};

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
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

        const sheetName = workbook.SheetNames[0];
        if (!sheetName) {
          reject(new Error("File has no sheets"));
          return;
        }

        const sheet = workbook.Sheets[sheetName];
        const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
        if (rawRows.length < 2) {
          reject(new Error("File must have a header row and at least one data row"));
          return;
        }

        const headers = (rawRows[0] as unknown[]).map(normalizeHeader);
        const currencyIdx = findColumnIndex(headers, ["CURRENCY", "CODE", "CURRENCY CODE"]);
        const buyIdx = findColumnIndex(headers, ["WE BUY", "BUY", "BUY RATE"]);
        const sellIdx = findColumnIndex(headers, ["WE SELL", "SELL", "SELL RATE"]);

        if (currencyIdx < 0 || buyIdx < 0 || sellIdx < 0) {
          reject(
            new Error("Invalid columns. Required: CURRENCY | WE BUY | WE SELL"),
          );
          return;
        }

        const parsed: RateImportRow[] = [];
        for (let i = 1; i < rawRows.length; i++) {
          const row = rawRows[i] as unknown[];
          const currencyCode = String(row[currencyIdx] ?? "")
            .trim()
            .toUpperCase();
          if (!currencyCode || currencyCode === "CURRENCY") continue;

          const buyRate = Number(row[buyIdx]);
          const sellRate = Number(row[sellIdx]);
          if (!Number.isFinite(buyRate) || !Number.isFinite(sellRate)) {
            reject(new Error(`Invalid rates for ${currencyCode} on row ${i + 1}`));
            return;
          }
          if (buyRate <= 0 || sellRate <= 0) {
            reject(new Error(`Rates must be positive for ${currencyCode}`));
            return;
          }

          parsed.push({ currencyCode, buyRate, sellRate });
        }

        if (parsed.length === 0) {
          reject(new Error("No valid rate rows found"));
          return;
        }

        resolve(parsed);
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
