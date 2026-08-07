/**
 * One-shot: copy current branch settings from the dashboard UI into Cloudflare D1.
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
const page = await (await browser.newContext()).newPage();
page.setDefaultTimeout(180000);
await page.goto(`${BASE}/login/`, { waitUntil: "domcontentloaded" });
await page.getByRole("textbox", { name: /email/i }).fill(EMAIL);
await page.locator("input[type=password]").first().fill(PASSWORD);
await page.getByRole("button", { name: /sign in/i }).click();
await page.waitForURL(/dashboard/, { timeout: 90000 });
await page.goto(`${BASE}/dashboard/settings/`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(12000);

const result = await page.evaluate(async () => {
  const dbReq = indexedDB.open("firebaseLocalStorageDb");
  const idb = await new Promise((res, rej) => {
    dbReq.onsuccess = () => res(dbReq.result);
    dbReq.onerror = rej;
  });
  const rows = await new Promise((res, rej) => {
    const tx = idb.transaction("firebaseLocalStorage", "readonly");
    const rq = tx.objectStore("firebaseLocalStorage").getAll();
    rq.onsuccess = () => res(rq.result);
    rq.onerror = rej;
  });
  const token = rows.find((r) => r.fbase_key?.startsWith("firebase:authUser:"))?.value
    ?.stsTokenManager?.accessToken;
  if (!token) return { ok: false, error: "no token" };

  const roots = [];
  for (const el of document.querySelectorAll("*")) {
    for (const k of Object.keys(el)) {
      if (k.startsWith("__reactFiber") || k.startsWith("__reactContainer")) roots.push(el[k]);
    }
  }
  const branches = [];
  const seen = new Set();
  function scan(v, d) {
    if (!v || d > 8 || typeof v !== "object" || seen.has(v)) return;
    seen.add(v);
    if (Array.isArray(v)) {
      for (const i of v) {
        if (i && i.id && i.settings && i.name) branches.push(i);
        else scan(i, d + 1);
      }
      return;
    }
    for (const k of Object.keys(v)) scan(v[k], d + 1);
  }
  function walk(n, d) {
    if (!n || d > 40) return;
    if (n.memoizedProps) scan(n.memoizedProps, 0);
    let s = n.memoizedState,
      g = 0;
    while (s && g++ < 50) {
      if (s.memoizedState) scan(s.memoizedState, 0);
      s = s.next;
    }
    walk(n.child, d + 1);
    walk(n.sibling, d + 1);
  }
  for (const r of roots) walk(r, 0);

  const unique = new Map();
  for (const b of branches) if (!unique.has(b.id)) unique.set(b.id, b);
  const list = [...unique.values()];
  const out = [];
  for (const b of list) {
    const res = await fetch("/api/d1/branch-settings", {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        branchId: b.id,
        settings: b.settings || {},
        logoUrl: b.logoUrl || null,
        name: b.name || null,
        code: b.code || null,
        status: b.status || null,
        brandingColor: b.brandingColor || null,
      }),
    });
    const data = await res.json().catch(() => ({}));
    out.push({ id: b.id, name: b.name, status: res.status, ok: res.ok, error: data.error });
  }
  return { ok: true, count: list.length, results: out };
});

console.log(JSON.stringify(result, null, 2));
await browser.close();
if (!result?.ok) process.exit(1);
const failed = (result.results || []).filter((r) => !r.ok);
if (failed.length) {
  console.error("Some branches failed to seed");
  process.exit(1);
}
console.log(`✓ Seeded ${result.count} branch(es) into Cloudflare D1`);
