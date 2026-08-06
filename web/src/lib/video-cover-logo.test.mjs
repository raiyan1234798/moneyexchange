/**
 * Guards the between-clip Android TV cover: plain navy only, no logo chip.
 * (Empty-screen branding when there is no media may still show the logo.)
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const panelPath = path.join(root, "components/display/unimoni-promo-panel.tsx");
const settingsPath = path.join(root, "app/dashboard/settings/page.tsx");
const displayPath = path.join(root, "components/display/display-screen.tsx");
const constantsPath = path.join(root, "lib/constants.ts");

describe("video between-clip cover", () => {
  const panel = fs.readFileSync(panelPath, "utf8");
  const settings = fs.readFileSync(settingsPath, "utf8");
  const display = fs.readFileSync(displayPath, "utf8");
  const constants = fs.readFileSync(constantsPath, "utf8");

  const swapIdx = panel.indexOf("SWAP COVER");
  const emptyIdx = panel.indexOf("{showPlaceholder ?");
  const swapBlock = panel.slice(swapIdx, emptyIdx);

  it("keeps a navy swap cover between clips", () => {
    assert.ok(swapIdx > 0, "SWAP COVER marker missing");
    assert.ok(emptyIdx > swapIdx, "empty placeholder must follow swap cover");
    assert.match(swapBlock, /bg-\[#0B1F3A\]/);
  });

  it("does not render logo/text/image inside the swap cover", () => {
    assert.doesNotMatch(swapBlock, /unimoni-logo-full/);
    assert.doesNotMatch(swapBlock, /placeholderMode/);
    assert.doesNotMatch(swapBlock, /showCoverLogo/);
    assert.doesNotMatch(swapBlock, /<(Image|img|p)\b/);
    assert.match(swapBlock, /bg-\[#0B1F3A\][\s\S]*?\/>/);
  });

  it("removes the showCoverLogo wiring from display + panel", () => {
    assert.doesNotMatch(panel, /showCoverLogo/);
    assert.doesNotMatch(display, /showCoverLogo/);
  });

  it("defaults showVideoCoverLogo off and documents plain navy in settings", () => {
    assert.match(constants, /showVideoCoverLogo:\s*false/);
    assert.match(settings, /Between-video cover/);
    assert.match(settings, /plain navy/i);
    assert.doesNotMatch(settings, /Show the unimoni logo between videos/);
  });

  it("still allows empty-screen logo when there is no media", () => {
    const emptyBlock = panel.slice(emptyIdx);
    assert.match(emptyBlock, /unimoni-logo-full/);
    assert.match(emptyBlock, /Branch promotional video/);
  });
});
