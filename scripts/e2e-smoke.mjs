import { chromium } from "playwright";

// Run from web/: CLIENT_ADMIN_PASSWORD=... node ../scripts/e2e-smoke.mjs
const pw = (process.env.CLIENT_ADMIN_PASSWORD ?? "").trim();
if (!pw) {
  console.error("Set CLIENT_ADMIN_PASSWORD env var (the admin@unimoni-signage.com password).");
  process.exit(1);
}
const BASE = "https://unimoni-6va.pages.dev";
const results = [];
const IGNORE_TEXT = [/Cross-Origin-Opener-Policy/i, /favicon/i, /flagcdn/i];
const IGNORE_URL = [/flagcdn/i, /googleusercontent|google\.com\/imgres/i, /gstatic/i];

function track(page, bucket) {
  page.on("console", (m) => {
    if (m.type() === "error" && !IGNORE_TEXT.some((re) => re.test(m.text()))) bucket.push("console: " + m.text().slice(0, 140));
  });
  page.on("pageerror", (e) => bucket.push("pageerror: " + String(e.message).slice(0, 140)));
  page.on("requestfailed", (r) => {
    const err = r.failure()?.errorText ?? "";
    // Navigation aborts + Firestore channel teardowns are normal, not errors.
    if (err.includes("ERR_ABORTED")) return;
    if (/firestore\.googleapis\.com.*(Listen|Write)\/channel/.test(r.url())) return;
    if (IGNORE_URL.some((re) => re.test(r.url()))) return;
    bucket.push(`reqfail(${err}): ` + r.url().slice(0, 100));
  });
}

async function step(name, fn) {
  try {
    await fn();
    results.push(`PASS  ${name}`);
    console.log(`PASS  ${name}`);
  } catch (e) {
    results.push(`FAIL  ${name}: ${String(e.message || e).slice(0, 150)}`);
    console.log(`FAIL  ${name}: ${String(e.message || e).slice(0, 150)}`);
  }
}

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();
const errs = [];
track(page, errs);

await step("admin login", async () => {
  await page.goto(`${BASE}/login/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(3000);
  await page.getByPlaceholder("you@example.com").fill("admin@unimoni-signage.com");
  await page.locator("input[type=password]").fill(pw);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL("**/dashboard/**", { timeout: 20000 });
});

const routes = [
  ["overview", "/dashboard/"],
  ["users", "/dashboard/users/"],
  ["exchange-rates", "/dashboard/exchange-rates/"],
  ["videos", "/dashboard/videos/"],
  ["tickers", "/dashboard/tickers/"],
  ["settings", "/dashboard/settings/"],
  ["notifications", "/dashboard/notifications/"],
  ["profile", "/dashboard/profile/"],
  ["audit-logs", "/dashboard/audit-logs/"],
];
for (const [name, path] of routes) {
  await step(`page ${name}`, async () => {
    errs.length = 0;
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(5000);
    const body = ((await page.textContent("body")) || "").toLowerCase();
    for (const bad of ["insufficient permissions", "something went wrong", "requires an index"]) {
      if (body.includes(bad)) throw new Error(`body contains "${bad}"`);
    }
    if (errs.length) throw new Error(errs.slice(0, 2).join(" | "));
  });
}

await step("branches redirects admin", async () => {
  errs.length = 0;
  await page.goto(`${BASE}/dashboard/branches/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(4000);
  if (!page.url().includes("/dashboard")) throw new Error("unexpected url " + page.url());
  if (errs.length) throw new Error(errs.slice(0, 2).join(" | "));
});

async function pickDemoBranch() {
  const trigger = page.locator("button[role=combobox], [role=combobox]").first();
  await trigger.click();
  await page.waitForTimeout(600);
  await page.getByRole("option", { name: /demo/i }).first().click();
  await page.waitForTimeout(1500);
}

async function findNumberInputByValue(value) {
  const inputs = page.locator("input[type=number]");
  const n = await inputs.count();
  for (let i = 0; i < n; i++) {
    if ((await inputs.nth(i).inputValue()) === value) return inputs.nth(i);
  }
  throw new Error(`no number input with value ${value}`);
}

await step("rates: edit USD buy on DEMO + verify on TV + revert", async () => {
  await page.goto(`${BASE}/dashboard/exchange-rates/`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(5000);
  await pickDemoBranch();
  await page.waitForTimeout(2000);
  const buyInput = await findNumberInputByValue("3625");
  await buyInput.fill("3626");
  const row = buyInput.locator(
    'xpath=ancestor::*[.//button[contains(normalize-space(.), "Publish")]][1]',
  );
  await row.getByRole("button", { name: /publish/i }).first().click();
  await page.waitForTimeout(3000);
  const tv = await ctx.newPage();
  await tv.goto(`${BASE}/display/?branch=DEMO`, { waitUntil: "domcontentloaded" });
  await tv.waitForTimeout(7000);
  const tvBody = (await tv.textContent("body")) || "";
  await tv.close();
  if (!tvBody.includes("3626")) throw new Error("display did not show updated rate 3626");
  const revertInput = await findNumberInputByValue("3626");
  await revertInput.fill("3625");
  const row2 = revertInput.locator(
    'xpath=ancestor::*[.//button[contains(normalize-space(.), "Publish")]][1]',
  );
  await row2.getByRole("button", { name: /publish/i }).first().click();
  await page.waitForTimeout(2500);
});

await step("tickers: create + edit + delete on DEMO", async () => {
  await page.goto(`${BASE}/dashboard/tickers/`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  await pickDemoBranch();
  await page.getByRole("button", { name: /add scrolling text/i }).click();
  await page.locator("textarea").fill("QA CHECK MESSAGE");
  await page.getByRole("button", { name: /publish to displays/i }).click();
  await page.waitForTimeout(2500);
  const row = page.locator("tr,div").filter({ hasText: "QA CHECK MESSAGE" }).last();
  await row.getByRole("button", { name: /^edit$/i }).first().click();
  await page.locator("textarea").fill("QA CHECK EDITED");
  await page.getByRole("button", { name: /save changes/i }).click();
  await page.waitForTimeout(2000);
  const row2 = page.locator("tr,div").filter({ hasText: "QA CHECK EDITED" }).last();
  await row2.getByRole("button", { name: /^delete$/i }).first().click();
  await page.getByRole("button", { name: /^delete$/i }).last().click();
  await page.waitForTimeout(2000);
  const body = (await page.textContent("body")) || "";
  if (body.includes("QA CHECK")) throw new Error("ticker not deleted");
});

await step("users: invite create + delete (role admin)", async () => {
  await page.goto(`${BASE}/dashboard/users/`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  await page.getByRole("button", { name: /invite by gmail/i }).click();
  await page.waitForTimeout(1000);
  const inputs = page.locator("[role=dialog] input");
  await inputs.first().fill("qa-check-e2e@example.com");
  await inputs.nth(1).fill("QA Check");
  // choose role Admin so no branch is required
  await page.locator("[role=dialog] [role=combobox]").first().click();
  await page.waitForTimeout(500);
  await page.getByRole("option", { name: /admin — all branches/i }).click();
  await page.waitForTimeout(500);
  const submit = page.getByRole("button", { name: /send gmail invite/i });
  await submit.click();
  await page.waitForTimeout(3000);
  const done = page.getByRole("button", { name: /^done$/i });
  if (await done.isVisible().catch(() => false)) await done.click();
  await page.waitForTimeout(1500);
  const inviteRow = page.locator("tr,div").filter({ hasText: "qa-check-e2e@example.com" }).last();
  await inviteRow.getByRole("button", { name: /delete/i }).first().click();
  await page.getByRole("button", { name: /^delete$/i }).last().click();
  await page.waitForTimeout(2500);
  const body = (await page.textContent("body")) || "";
  if (body.includes("qa-check-e2e@example.com")) throw new Error("invite not deleted");
});

await step("notifications feed records changes", async () => {
  await page.goto(`${BASE}/dashboard/notifications/`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(5000);
  const body = (await page.textContent("body")) || "";
  if (!/rate updated|display message|user invited|change feed/i.test(body)) {
    throw new Error("feed empty or missing expected entries");
  }
});

for (const br of ["DEMO", "Z3"]) {
  await step(`kiosk ${br} unauthenticated`, async () => {
    const kctx = await b.newContext({ viewport: { width: 1920, height: 1080 } });
    const kp = await kctx.newPage();
    const kerrs = [];
    track(kp, kerrs);
    await kp.goto(`${BASE}/display/?branch=${br}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await kp.waitForTimeout(9000);
    const body = (await kp.textContent("body")) || "";
    if (!/WE BUY/i.test(body)) throw new Error("rate board missing");
    if (kerrs.length) throw new Error(kerrs.slice(0, 3).join(" | "));
    await kctx.close();
  });
}

console.log("\n===== SUMMARY =====");
for (const r of results) console.log(r);
console.log(`${results.filter((r) => r.startsWith("PASS")).length}/${results.length} passed`);
await b.close();
