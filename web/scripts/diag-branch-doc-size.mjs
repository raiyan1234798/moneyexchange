/**
 * Compare Firestore REST branch doc size vs Promotions form settings.
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
await page.goto(`${BASE}/dashboard/promotions/`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(12000);

const result = await page.evaluate(async (branchId) => {
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
  if (!token) return { error: "no token" };

  const FS = `https://firestore.googleapis.com/v1/projects/moneyexchange-35c33/databases/(default)/documents/branches/${branchId}`;
  let remote = null;
  for (let a = 0; a < 8; a++) {
    const res = await fetch(FS, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (data.error?.code === 429) {
      await new Promise((r) => setTimeout(r, 4000 * (a + 1)));
      continue;
    }
    remote = data;
    break;
  }

  function fromFs(v) {
    if (!v || typeof v !== "object") return v;
    if ("stringValue" in v) return v.stringValue;
    if ("integerValue" in v) return Number(v.integerValue);
    if ("doubleValue" in v) return v.doubleValue;
    if ("booleanValue" in v) return v.booleanValue;
    if ("nullValue" in v) return null;
    if ("timestampValue" in v) return v.timestampValue;
    if ("arrayValue" in v) return (v.arrayValue.values || []).map(fromFs);
    if ("mapValue" in v) {
      const o = {};
      for (const [k, val] of Object.entries(v.mapValue.fields || {})) o[k] = fromFs(val);
      return o;
    }
    return v;
  }

  const fields = remote?.fields ? fromFs({ mapValue: { fields: remote.fields } }) : null;
  const rawJson = fields ? JSON.stringify(fields) : null;
  const bytes = rawJson ? new TextEncoder().encode(rawJson).length : null;
  const top = {};
  const dataUrls = [];
  const largeStrings = [];
  if (fields) {
    for (const [k, v] of Object.entries(fields)) {
      top[k] = JSON.stringify(v).length;
    }
    const walk = (path, val) => {
      if (typeof val === "string") {
        if (val.startsWith("data:")) dataUrls.push({ path, len: val.length });
        else if (val.length > 5000) largeStrings.push({ path, len: val.length, prefix: val.slice(0, 60) });
      } else if (Array.isArray(val)) val.forEach((x, i) => walk(`${path}[${i}]`, x));
      else if (val && typeof val === "object")
        for (const [kk, vv] of Object.entries(val)) walk(`${path}.${kk}`, vv);
    };
    walk("", fields);
  }

  return {
    remoteError: remote?.error || null,
    remoteBytes: bytes,
    topFieldSizes: Object.fromEntries(Object.entries(top).sort((a, b) => b[1] - a[1])),
    remoteDataUrlCount: dataUrls.length,
    remoteDataUrls: dataUrls.slice(0, 40),
    largeStrings: largeStrings.slice(0, 40),
  };
}, BRANCH);

console.log(JSON.stringify(result, null, 2));
await browser.close();
if (result?.error || result?.remoteError) process.exit(1);
