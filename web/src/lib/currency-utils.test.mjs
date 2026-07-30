import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  countryCodeFromCurrencyCode,
  countryCodeFromFlagEmoji,
  flagFromCurrencyCode,
  isPlaceholderFlag,
} from "./currency-utils.ts";

describe("countryCodeFromCurrencyCode", () => {
  it("maps common ISO codes to flag file stems", () => {
    assert.equal(countryCodeFromCurrencyCode("USD"), "us");
    assert.equal(countryCodeFromCurrencyCode("GBP"), "gb");
    assert.equal(countryCodeFromCurrencyCode("KES"), "ke");
    assert.equal(countryCodeFromCurrencyCode("AED"), "ae");
    assert.equal(countryCodeFromCurrencyCode("CHF"), "ch");
    assert.equal(countryCodeFromCurrencyCode("RWF"), "rw");
  });

  it("maps Zambia ZMW and Zimbabwe ZWL/ZWG to the correct countries", () => {
    assert.equal(countryCodeFromCurrencyCode("ZMW"), "zm");
    assert.equal(countryCodeFromCurrencyCode("ZWL"), "zw");
    assert.equal(countryCodeFromCurrencyCode("ZWG"), "zw");
  });

  it("handles catalog overrides (EUR, CFA, Scotland)", () => {
    assert.equal(countryCodeFromCurrencyCode("EUR"), "eu");
    assert.equal(countryCodeFromCurrencyCode("XOF"), "sn");
    assert.equal(countryCodeFromCurrencyCode("XAF"), "cm");
    assert.equal(countryCodeFromCurrencyCode("SCP"), "gb-sct");
  });

  it("derives flags for new currencies not in the catalog", () => {
    // Bolivian Boliviano — not in CURRENCY_METADATA
    assert.equal(countryCodeFromCurrencyCode("BOB"), "bo");
    // Chilean Peso
    assert.equal(countryCodeFromCurrencyCode("CLP"), "cl");
    // Vietnamese Dong
    assert.equal(countryCodeFromCurrencyCode("VND"), "vn");
  });

  it("returns null for junk", () => {
    assert.equal(countryCodeFromCurrencyCode(""), null);
    assert.equal(countryCodeFromCurrencyCode("1"), null);
    assert.equal(countryCodeFromCurrencyCode("XXY"), null);
  });
});

describe("countryCodeFromFlagEmoji", () => {
  it("decodes regional indicators and Scotland", () => {
    assert.equal(countryCodeFromFlagEmoji("🇺🇸"), "us");
    assert.equal(countryCodeFromFlagEmoji("🇦🇪"), "ae");
    assert.equal(countryCodeFromFlagEmoji("🏴󠁧󠁢󠁳󠁣󠁴󠁿"), "gb-sct");
    assert.equal(countryCodeFromFlagEmoji("🇿🇲"), "zm");
    assert.equal(countryCodeFromFlagEmoji("🇿🇼"), "zw");
  });
});

describe("flagFromCurrencyCode", () => {
  it("returns emoji for ISO countries and catalog EUR", () => {
    assert.equal(flagFromCurrencyCode("KES"), "🇰🇪");
    assert.equal(flagFromCurrencyCode("EUR"), "🇪🇺");
    assert.ok(flagFromCurrencyCode("BOB"));
  });
});

describe("isPlaceholderFlag", () => {
  it("detects stand-in glyphs", () => {
    assert.equal(isPlaceholderFlag("💱"), true);
    assert.equal(isPlaceholderFlag("🌍"), true);
    assert.equal(isPlaceholderFlag("🇺🇸"), false);
  });
});
