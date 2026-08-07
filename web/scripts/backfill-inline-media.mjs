/**
 * One-shot admin backfill: upload every `data:` media field on all branch docs
 * to Cloudflare R2, then rewrite the docs with HTTPS URLs so Firestore stays
 * under the 1 MiB limit (fixes Save promotions failures).
 *
 * Prefer the Settings page button (runs in-browser with the signed-in admin).
 * This script drives that flow via Playwright for unattended runs:
 *
 *   node scripts/backfill-inline-media.mjs
 *
 * Requires NEXT_PUBLIC_R2_UPLOAD_URL / R2 binding on the target host.
 */

import { chromium } from "playwright-core";

const BASE = process.env.BACKFILL_BASE_URL || "http://localhost:3000";
const EMAIL = process.env.BACKFILL_EMAIL || "admin@unimoni-signage.com";
const PASSWORD = process.env.BACKFILL_PASSWORD || "";

if (!PASSWORD) {
  console.error("Set BACKFILL_PASSWORD (and optionally BACKFILL_BASE_URL, BACKFILL_EMAIL).");
  process.exit(1);
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await (await browser.newContext()).newPage();
page.on("dialog", (d) => d.accept());

try {
  await page.goto(`${BASE}/login/`, { waitUntil: "domcontentloaded" });
  await page.getByRole("textbox", { name: /email/i }).fill(EMAIL);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/dashboard/, { timeout: 60000 });
  await page.goto(`${BASE}/dashboard/settings/`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);

  const btn = page.getByRole("button", { name: /Shrink oversized branch docs/i });
  if ((await btn.count()) === 0) {
    throw new Error('Could not find "Shrink oversized branch docs" on Settings — deploy the Phase 1 UI first.');
  }
  await btn.click();

  await page.waitForTimeout(120000);
  console.log("Backfill UI triggered — check Settings toasts / branch doc sizes.");
} finally {
  await browser.close();
}
