import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveSignageRates } from "./unimoni-signage.ts";

function rate(partial) {
  return {
    id: partial.id,
    currencyCode: partial.currencyCode,
    buyRate: partial.buyRate ?? 100,
    sellRate: partial.sellRate ?? 110,
    displayOrder: partial.displayOrder ?? 0,
    isHidden: partial.isHidden ?? false,
    status: partial.status ?? "published",
  };
}

describe("resolveSignageRates", () => {
  it("dedupes duplicate currency codes, preferring real rates over 1/1 placeholders", () => {
    const rows = resolveSignageRates([
      rate({ id: "a", currencyCode: "SCP", buyRate: 1, sellRate: 1, displayOrder: 1 }),
      rate({ id: "b", currencyCode: "SCP", buyRate: 3500, sellRate: 5000, displayOrder: 2 }),
      rate({ id: "c", currencyCode: "ZMW", buyRate: 20, sellRate: 25, displayOrder: 3 }),
    ]);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].currencyCode, "SCP");
    assert.equal(rows[0].id, "b");
    assert.equal(rows[0].buyRate, 3500);
    assert.equal(rows[1].currencyCode, "ZMW");
  });

  it("hides unpublished and hidden rows", () => {
    const rows = resolveSignageRates([
      rate({ id: "a", currencyCode: "USD", status: "draft" }),
      rate({ id: "b", currencyCode: "GBP", isHidden: true }),
      rate({ id: "c", currencyCode: "EUR" }),
    ]);
    assert.deepEqual(
      rows.map((r) => r.currencyCode),
      ["EUR"],
    );
  });
});
