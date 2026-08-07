import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  effectiveDisplaySafeAreaPercent,
  displaySafeInsetCss,
  isLikelyTvDisplay,
} from "./display-tv-safe-area.ts";

describe("display-tv-safe-area", () => {
  it("clamps configured percent to 0–15", () => {
    assert.equal(effectiveDisplaySafeAreaPercent(-1), 0);
    assert.equal(effectiveDisplaySafeAreaPercent(99), 15);
    assert.equal(effectiveDisplaySafeAreaPercent(null), 0);
  });

  it("displaySafeInsetCss uses vmin", () => {
    assert.equal(displaySafeInsetCss(0), "0px");
    assert.equal(displaySafeInsetCss(3.5), "3.5vmin");
  });

  it("isLikelyTvDisplay is false without window (SSR guard)", () => {
    assert.equal(isLikelyTvDisplay(), false);
  });
});
