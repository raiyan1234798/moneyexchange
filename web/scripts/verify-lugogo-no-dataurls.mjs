/**
 * Hard-refresh Settings, load Lugogo from UI fiber, scan for data: URLs,
 * optionally attempt a no-op promotions settings patch path / size estimate.
 */
import { chromium } from "playwright-core";

const BASE = (process.env.BACKFILL_BASE_URL || "https://unimoni-6va.pages.dev").replace(/\/$/, "");
const EMAIL = process.env.BACKFILL_EMAIL || "admin@unimoni-signage.com";
const PASSWORD = process.env.BACKFILL_PASSWORD || "";
const BRANCH = process.env.BACKFILL_BRANCH_ID || "GSou0BkUygvy6XZREWwM";

if (!PASSWORD) {
  console.error("Set BACKFILL_PASSWORD");
  process.exit(1);
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await (await browser.newContext()).newPage();
page.setDefaultTimeout(180000);
await page.goto(`${BASE}/login/`, { waitUntil: "domcontentloaded" });
await page.getByRole("textbox", { name: /email/i }).fill(EMAIL);
await page.locator("input[type=password]").first().fill(PASSWORD);
await page.getByRole("button", { name: /sign in/i }).click();
await page.waitForURL(/dashboard/, { timeout: 90000 });
await page.goto(`${BASE}/dashboard/settings/`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(15000);

const result = await page.evaluate(async (branchId) => {
  const roots = [];
  for (const el of document.querySelectorAll("*")) {
    for (const k of Object.keys(el)) {
      if (k.startsWith("__reactFiber") || k.startsWith("__reactContainer")) roots.push(el[k]);
    }
  }
  let branch = null;
  const seen = new Set();
  function walk(n, d) {
    if (!n || d > 45 || branch) return;
    const cands = [];
    if (n.memoizedProps) cands.push(n.memoizedProps);
    let s = n.memoizedState,
      g = 0;
    while (s && g++ < 60) {
      if (s.memoizedState) cands.push(s.memoizedState);
      s = s.next;
    }
    for (const c of cands) scan(c, 0);
    walk(n.child, d + 1);
    walk(n.sibling, d + 1);
  }
  function scan(v, d) {
    if (branch || !v || d > 8 || typeof v !== "object") return;
    if (seen.has(v)) return;
    seen.add(v);
    if (Array.isArray(v)) {
      for (const i of v) {
        if (i && i.id === branchId && i.settings) {
          branch = i;
          return;
        }
        scan(i, d + 1);
      }
      return;
    }
    if (v.id === branchId && v.settings) {
      branch = v;
      return;
    }
    for (const k of Object.keys(v)) {
      scan(v[k], d + 1);
      if (branch) return;
    }
  }
  for (const r of roots) walk(r, 0);
  if (!branch) return { ok: false, error: "branch not in UI" };

  const remaining = [];
  const sizes = [];
  const visit = (label, val) => {
    if (typeof val === "string") {
      if (val.startsWith("data:")) remaining.push({ label, bytes: val.length });
      else if (val.length > 2000) sizes.push({ label, bytes: val.length, prefix: val.slice(0, 48) });
    } else if (Array.isArray(val)) {
      val.forEach((item, i) => {
        if (typeof item === "string") visit(`${label}[${i}]`, item);
        else if (item && typeof item === "object") {
          if (item.url) visit(`${label}[${i}].url`, item.url);
          else visit(`${label}[${i}]`, JSON.stringify(item));
        }
      });
    } else if (val && typeof val === "object") {
      for (const [k, v] of Object.entries(val)) visit(`${label}.${k}`, v);
    }
  };
  visit("logoUrl", branch.logoUrl);
  visit("settings", branch.settings || {});

  // Rough JSON size of settings (what blows the 1MB doc)
  const approx = JSON.stringify(branch).length;

  // tickerLogoScales sample
  const scales = branch.settings?.tickerLogoScales || [];
  const scaleSample = scales.slice(0, 3).map((x, i) => ({
    i,
    urlPrefix: typeof x?.url === "string" ? x.url.slice(0, 80) : null,
    scale: x?.scale,
  }));

  return {
    ok: true,
    branchName: branch.name || branch.id,
    approxJsonBytes: approx,
    dataUrlCount: remaining.length,
    remaining,
    largeNonData: sizes.filter((s) => s.bytes > 50000).slice(0, 20),
    tickerLogoScalesCount: scales.length,
    scaleSample,
  };
}, BRANCH);

console.log(JSON.stringify(result, null, 2));
await browser.close();
if (!result?.ok || result.dataUrlCount > 0) process.exit(1);
console.log("✓ No data: URLs remaining on Lugogo branch in UI cache");
