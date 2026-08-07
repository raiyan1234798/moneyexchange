import { chromium } from "playwright-core";
const BASE = "https://unimoni-6va.pages.dev";
const PASSWORD = "Unimoni#Admin-2026!Z3";
const BRANCH = "GSou0BkUygvy6XZREWwM";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await (await browser.newContext()).newPage();
page.setDefaultTimeout(180000);
await page.goto(`${BASE}/login/`, { waitUntil: "domcontentloaded" });
await page.getByRole("textbox", { name: /email/i }).fill("admin@unimoni-signage.com");
await page.locator("input[type=password]").first().fill(PASSWORD);
await page.getByRole("button", { name: /sign in/i }).click();
await page.waitForURL(/dashboard/, { timeout: 90000 });
await page.waitForTimeout(5000);
const result = await page.evaluate(async (branchId) => {
  const dbReq = indexedDB.open("firebaseLocalStorageDb");
  const idb = await new Promise((res, rej) => { dbReq.onsuccess = () => res(dbReq.result); dbReq.onerror = rej; });
  const rows = await new Promise((res, rej) => {
    const tx = idb.transaction("firebaseLocalStorage", "readonly");
    const rq = tx.objectStore("firebaseLocalStorage").getAll();
    rq.onsuccess = () => res(rq.result); rq.onerror = rej;
  });
  const token = rows.find((r) => r.fbase_key?.startsWith("firebase:authUser:"))?.value?.stsTokenManager?.accessToken;
  const FS = `https://firestore.googleapis.com/v1/projects/moneyexchange-35c33/databases/(default)/documents/branches/${branchId}`;
  const attempts = [];
  for (let a = 0; a < 6; a++) {
    const res = await fetch(FS, { headers: { Authorization: `Bearer ${token}` } });
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { data = { parseError: text.slice(0,200) }; }
    attempts.push({ status: res.status, keys: Object.keys(data||{}), err: data.error || null, name: data.name || null, fieldKeys: data.fields ? Object.keys(data.fields) : [], rawLen: text.length });
    if (data.error?.code === 429) { await new Promise(r => setTimeout(r, 5000*(a+1))); continue; }
    if (data.fields) {
      // estimate size from raw REST payload
      return { ok: true, attempts, rawLen: text.length, fieldKeys: Object.keys(data.fields), fieldLens: Object.fromEntries(Object.entries(data.fields).map(([k,v]) => [k, JSON.stringify(v).length]).sort((a,b)=>0)) };
    }
    break;
  }
  // Fallback: use Firebase SDK via window if available — measure from IndexedDB firestore cache
  const caches = [];
  try {
    const dbs = await indexedDB.databases?.() || [];
    for (const d of dbs) caches.push({ name: d.name, version: d.version });
  } catch {}
  return { ok: false, attempts, caches, tokenLen: token?.length };
}, BRANCH);
console.log(JSON.stringify(result, null, 2));
await browser.close();
