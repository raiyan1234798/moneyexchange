/**
 * Smoke: select Lugogo, click Save promotions, assert no 1 MiB / size error.
 */
import { chromium } from "playwright-core";

const BASE = (process.env.BACKFILL_BASE_URL || "https://unimoni-6va.pages.dev").replace(/\/$/, "");
const EMAIL = process.env.BACKFILL_EMAIL || "admin@unimoni-signage.com";
const PASSWORD = process.env.BACKFILL_PASSWORD || "";
const BRANCH_NAME = process.env.BACKFILL_BRANCH_NAME || "Lugogo";

if (!PASSWORD) {
  console.error("Set BACKFILL_PASSWORD");
  process.exit(1);
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await (await browser.newContext()).newPage();
page.setDefaultTimeout(180000);

const toasts = [];
page.on("console", (msg) => {
  const t = msg.text();
  if (/error|fail|1\s*mi|too large|exceed/i.test(t)) toasts.push(`console:${t.slice(0, 200)}`);
});

await page.goto(`${BASE}/login/`, { waitUntil: "domcontentloaded" });
await page.getByRole("textbox", { name: /email/i }).fill(EMAIL);
await page.locator("input[type=password]").first().fill(PASSWORD);
await page.getByRole("button", { name: /sign in/i }).click();
await page.waitForURL(/dashboard/, { timeout: 90000 });

await page.goto(`${BASE}/dashboard/promotions/`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(8000);

// Prefer branch switcher / select if present
const branchTrigger = page
  .getByRole("combobox")
  .or(page.locator("button").filter({ hasText: /branch|lugogo|kampala/i }))
  .first();
try {
  if (await branchTrigger.isVisible({ timeout: 3000 })) {
    await branchTrigger.click();
    const opt = page.getByRole("option", { name: new RegExp(BRANCH_NAME, "i") }).first();
    if (await opt.isVisible({ timeout: 3000 })) await opt.click();
    else {
      const item = page.getByText(new RegExp(BRANCH_NAME, "i")).first();
      if (await item.isVisible({ timeout: 2000 })) await item.click();
    }
    await page.waitForTimeout(3000);
  }
} catch {
  /* branch may already be selected via store */
}

const saveBtn = page.getByRole("button", { name: /save promotions|save to all branches/i }).first();
await saveBtn.waitFor({ state: "visible", timeout: 30000 });
await saveBtn.click();

// Wait for success or error toast
const deadline = Date.now() + 120000;
let outcome = null;
while (Date.now() < deadline) {
  const body = await page.locator("body").innerText();
  if (/promotions saved|live on the branch/i.test(body)) {
    outcome = { ok: true, message: "Promotions saved" };
    break;
  }
  if (/too large|1\s*MiB|exceeds the maximum|RESOURCE_EXHAUSTED|still too large/i.test(body)) {
    outcome = { ok: false, message: body.match(/[^\n]*(too large|1\s*MiB|exceeds|RESOURCE|still too large)[^\n]*/i)?.[0] || "size error" };
    break;
  }
  if (/could not save/i.test(body)) {
    outcome = { ok: false, message: body.match(/[^\n]*could not save[^\n]*/i)?.[0] || "Could not save" };
    break;
  }
  await page.waitForTimeout(1000);
}

if (!outcome) outcome = { ok: false, message: "Timed out waiting for save result", toasts };

console.log(JSON.stringify({ ...outcome, toasts }, null, 2));
await browser.close();
process.exit(outcome.ok ? 0 : 1);
