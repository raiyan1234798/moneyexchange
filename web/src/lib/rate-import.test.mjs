import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as XLSX from "xlsx";
import { isSkippedRateImportLabel, parseRateWorkbook } from "./rate-import.ts";

describe("rate-import skips leftover note rows", () => {
  it("recognises note labels to skip", () => {
    assert.equal(isSkippedRateImportLabel("SMALL BILLS"), true);
    assert.equal(isSkippedRateImportLabel("USD"), false);
  });

  it("extracts SMALL BILLS note and never creates a currency from it", () => {
    const rates = XLSX.utils.aoa_to_sheet([
      ["CURRENCY", "WE BUY", "WE SELL"],
      ["USD", 3650, 3680],
      ["SMALL BILLS", "*WE BUY USD SMALL BILLS $20, $10, $5, $2, $1 @ 3300", ""],
    ]);
    const note = XLSX.utils.aoa_to_sheet([
      ["RATE CARD NOTE"],
      ["*WE BUY USD SMALL BILLS $20, $10, $5, $2, $1 @ 3300"],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, rates, "Rates");
    XLSX.utils.book_append_sheet(wb, note, "Rate card note");
    const { rows, rateCardNote } = parseRateWorkbook(wb);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].currencyCode, "USD");
    assert.match(rateCardNote ?? "", /SMALL BILLS|@ 3300/i);
  });
});
