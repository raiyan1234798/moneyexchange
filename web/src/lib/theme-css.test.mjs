import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyThemeCssVars, clearThemeCssVars, darkenHex, lightenHex } from "./theme-css.ts";

describe("theme-css helpers", () => {
  it("lightens and darkens hex colours", () => {
    assert.equal(lightenHex("#000000", 1), "#ffffff");
    assert.equal(darkenHex("#ffffff", 1), "#000000");
    assert.match(lightenHex("#0066B3", 0.12), /^#[0-9a-f]{6}$/i);
  });

  it("sets and clears derived brand CSS vars", () => {
    const store = new Map();
    const root = {
      setProperty(name, value) {
        store.set(name, value);
      },
      removeProperty(name) {
        store.delete(name);
      },
    };

    applyThemeCssVars(root, {
      dashboardPrimary: "#112233",
      dashboardAccent: "#445566",
      dashboardGold: "#778899",
    });
    assert.equal(store.get("--brand-primary"), "#112233");
    assert.ok(store.get("--brand-primary-light"));
    assert.ok(store.get("--brand-surface"));
    assert.equal(store.get("--brand-accent"), "#445566");
    assert.ok(store.get("--brand-accent-bright"));
    assert.equal(store.get("--brand-gold"), "#778899");
    assert.ok(store.get("--brand-gold-bright"));

    clearThemeCssVars(root);
    assert.equal(store.size, 0);
  });
});
