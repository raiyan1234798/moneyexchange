/**
 * Fix tickerLogoScales data: URLs on one branch (missed by earlier slim).
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
  if (!token) return { ok: false, error: "no token" };

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

  const PROJECT = "moneyexchange-35c33";
  const FS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/branches/${branchId}`;
  const H = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const toFs = (v) => {
    if (v === null || v === undefined) return { nullValue: null };
    if (typeof v === "string") return { stringValue: v };
    if (typeof v === "boolean") return { booleanValue: v };
    if (typeof v === "number")
      return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    if (Array.isArray(v)) return { arrayValue: { values: v.map(toFs) } };
    if (typeof v === "object") {
      const fields = {};
      for (const [k, val] of Object.entries(v)) fields[k] = toFs(val);
      return { mapValue: { fields } };
    }
    return { stringValue: String(v) };
  };
  async function patchField(path, value) {
    const parts = path.split(".");
    let leaf = toFs(value);
    for (let i = parts.length - 1; i >= 0; i--) leaf = { mapValue: { fields: { [parts[i]]: leaf } } };
    const u = `${FS}?updateMask.fieldPaths=${encodeURIComponent(path)}`;
    for (let attempt = 0; attempt < 12; attempt++) {
      const res = await fetch(u, {
        method: "PATCH",
        headers: H,
        body: JSON.stringify({ fields: leaf.mapValue.fields }),
      });
      const data = await res.json();
      if (data.error?.code === 429) {
        await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
        continue;
      }
      if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
      return;
    }
    throw new Error("quota writing " + path);
  }
  async function uploadDataUrl(dataUrl, label) {
    const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl);
    if (!m) throw new Error("bad data");
    const mime = m[1] || "image/png";
    let buf;
    if (m[2]) {
      const bin = atob(m[3]);
      buf = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    } else buf = new TextEncoder().encode(decodeURIComponent(m[3]));
    const ext = (mime.split("/")[1] || "png").replace("+xml", "");
    const filename = `${label}-${Date.now()}.${ext}`;
    const url =
      `/api/upload?branchId=${encodeURIComponent(branchId)}` +
      `&filename=${encodeURIComponent(filename)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": mime },
      body: buf,
    });
    const payload = await res.json();
    if (!res.ok) throw new Error(payload.error || `upload ${res.status}`);
    return payload.downloadUrl;
  }

  // Migrate every remaining data: field we know about
  const settings = { ...(branch.settings || {}) };
  let migrated = 0;
  const details = [];

  const scales = settings.tickerLogoScales || [];
  if (scales.some((x) => typeof x?.url === "string" && x.url.startsWith("data:"))) {
    const next = [];
    for (let i = 0; i < scales.length; i++) {
      const item = scales[i];
      if (typeof item?.url === "string" && item.url.startsWith("data:")) {
        next.push({ ...item, url: await uploadDataUrl(item.url, `ticker-scale-${i}`) });
        migrated++;
      } else next.push(item);
    }
    await patchField("settings.tickerLogoScales", next);
    details.push("tickerLogoScales");
  }

  // Final scan
  const remaining = [];
  const check = (label, val) => {
    if (typeof val === "string" && val.startsWith("data:")) remaining.push(label);
  };
  check("logoUrl", branch.logoUrl);
  for (const k of Object.keys(settings)) {
    const v = settings[k];
    if (typeof v === "string") check(k, v);
    else if (Array.isArray(v))
      v.forEach((item, i) => {
        if (typeof item === "string") check(`${k}[${i}]`, item);
        else if (item && typeof item === "object" && item.url) check(`${k}[${i}].url`, item.url);
      });
  }

  return { ok: true, migrated, details, remainingAfterLocalScan: remaining };
}, BRANCH);

console.log(JSON.stringify(result, null, 2));
await browser.close();
if (!result?.ok) process.exit(1);
console.log(`✓ Migrated ${result.migrated} tickerLogoScales image(s)`);
