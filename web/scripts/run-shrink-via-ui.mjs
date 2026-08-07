/**
 * Drive Settings → "Shrink oversized branch docs" on production.
 * Uses the signed-in admin session so R2 uploads + field patches run in-browser
 * (works even when Firestore REST list/get is quota-exhausted).
 */
import { chromium } from "playwright-core";

const BASE = (process.env.BACKFILL_BASE_URL || "https://unimoni-6va.pages.dev").replace(/\/$/, "");
const EMAIL = process.env.BACKFILL_EMAIL || "admin@unimoni-signage.com";
const PASSWORD = process.env.BACKFILL_PASSWORD || "";

if (!PASSWORD) {
  console.error("Set BACKFILL_PASSWORD");
  process.exit(1);
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext();
const page = await context.newPage();
page.setDefaultTimeout(120000);
page.on("dialog", (d) => d.accept());

const logs = [];
page.on("console", (msg) => {
  const t = msg.text();
  if (/slim|R2|Moved|error|Error|inline|migrat/i.test(t)) logs.push(`[console] ${t}`);
});

try {
  console.log(`Login ${BASE}/login/ …`);
  await page.goto(`${BASE}/login/`, { waitUntil: "domcontentloaded" });
  await page.getByRole("textbox", { name: /email/i }).fill(EMAIL);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/dashboard/, { timeout: 90000 });
  console.log("Signed in — opening Settings…");
  await page.goto(`${BASE}/dashboard/settings/`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(8000);

  const btn = page.getByRole("button", { name: /Shrink oversized branch docs/i });
  if ((await btn.count()) === 0) {
    throw new Error('Button "Shrink oversized branch docs" not found — hard-refresh deploy may be missing.');
  }
  console.log("Clicking Shrink oversized branch docs…");
  await btn.click();

  // Wait for success or error toast
  const deadline = Date.now() + 15 * 60 * 1000;
  let outcome = null;
  while (Date.now() < deadline) {
    const body = await page.locator("body").innerText();
    if (/Moved \d+ inline image/i.test(body) || /no inline images left/i.test(body)) {
      outcome = body.match(/Moved \d+ inline image[^\n]*|Checked \d+ branch[^\n]*|no inline images left[^\n]*/i)?.[0] || "success";
      break;
    }
    if (/Backfill failed|Could not|R2 is not configured|exceeds the maximum/i.test(body)) {
      outcome = "ERROR: " + (body.match(/Backfill failed[^\n]*|Could not[^\n]*|R2 is not configured[^\n]*|exceeds the maximum[^\n]*/i)?.[0] || "failed");
      break;
    }
    await page.waitForTimeout(3000);
    process.stdout.write(".");
  }
  console.log("\nOutcome:", outcome || "TIMEOUT — check Settings toasts manually");
  if (logs.length) console.log(logs.slice(-20).join("\n"));
  if (!outcome || outcome.startsWith("ERROR") || outcome === "TIMEOUT — check Settings toasts manually") {
    process.exit(1);
  }
} finally {
  await browser.close();
}
