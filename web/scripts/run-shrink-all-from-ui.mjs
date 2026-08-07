/**
 * Shrink ALL branches that still have data: media, using UI-loaded branch list.
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await page.goto(`${BASE}/login/`, { waitUntil: "domcontentloaded" });
await page.getByRole("textbox", { name: /email/i }).fill(EMAIL);
await page.locator('input[type="password"]').first().fill(PASSWORD);
await page.getByRole("button", { name: /sign in/i }).click();
await page.waitForURL(/dashboard/, { timeout: 90000 });
await page.goto(`${BASE}/dashboard/settings/`, { waitUntil: "domcontentloaded" });
await sleep(12000);

const summary = await page.evaluate(async () => {
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

  // Find branches array in React tree
  const roots = [];
  for (const el of document.querySelectorAll("*")) {
    for (const k of Object.keys(el)) {
      if (k.startsWith("__reactFiber") || k.startsWith("__reactContainer")) roots.push(el[k]);
    }
  }
  let branches = null;
  const seen = new Set();
  function walk(node, depth) {
    if (!node || depth > 45 || branches) return;
    const props = node.memoizedProps || node.pendingProps;
    let s = node.memoizedState;
    const cands = [];
    if (props) cands.push(props);
    let g = 0;
    while (s && g++ < 60) {
      if (s.memoizedState) cands.push(s.memoizedState);
      s = s.next;
    }
    for (const c of cands) scan(c, 0);
    walk(node.child, depth + 1);
    walk(node.sibling, depth + 1);
  }
  function scan(v, depth) {
    if (branches || !v || depth > 8) return;
    if (typeof v !== "object") return;
    if (seen.has(v)) return;
    seen.add(v);
    if (
      Array.isArray(v) &&
      v.length >= 2 &&
      v.every((b) => b && typeof b === "object" && b.id && b.settings !== undefined)
    ) {
      branches = v;
      return;
    }
    if (Array.isArray(v)) {
      for (const i of v) scan(i, depth + 1);
      return;
    }
    for (const k of Object.keys(v)) {
      scan(v[k], depth + 1);
      if (branches) return;
    }
  }
  for (const r of roots) walk(r, 0);
  if (!branches) return { ok: false, error: "branches not found in UI" };

  function dataUrlCount(b) {
    let n = 0;
    const hit = (u) => {
      if (typeof u === "string" && u.startsWith("data:")) n++;
    };
    hit(b.logoUrl);
    const s = b.settings || {};
    for (const k of [
      "headerLogoUrl",
      "headerLogoUrl2",
      "promoSlideLogoUrl",
      "tickerLogoUrl",
      "announcementImageUrl",
      "videoPlaceholderImageUrl",
      "ratePromoImageUrl",
    ])
      hit(s[k]);
    for (const k of ["headerLogoUrls", "tickerLogoUrls", "scrollingLogos"])
      (s[k] || []).forEach(hit);
    (s.ratePromoMedia || []).forEach((m) => hit(m?.url));
    (s.scrollingLogoItems || []).forEach((m) => hit(m?.url));
    (s.tickerLogoScales || []).forEach((m) => hit(m?.url));
    return n;
  }

  const PROJECT = "moneyexchange-35c33";
  function toFs(v) {
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
  }
  async function patchField(branchId, path, value) {
    const FS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/branches/${branchId}`;
    const parts = path.split(".");
    let leaf = toFs(value);
    for (let i = parts.length - 1; i >= 0; i--) leaf = { mapValue: { fields: { [parts[i]]: leaf } } };
    const u = `${FS}?updateMask.fieldPaths=${encodeURIComponent(path)}`;
    for (let attempt = 0; attempt < 12; attempt++) {
      const res = await fetch(u, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ fields: leaf.mapValue.fields }),
      });
      const data = await res.json();
      if (data.error?.code === 429) {
        await new Promise((r) => setTimeout(r, 6000 * (attempt + 1)));
        continue;
      }
      if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
      return;
    }
    throw new Error("quota writing " + path);
  }
  async function uploadDataUrl(branchId, dataUrl, label) {
    const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl);
    if (!m) throw new Error("bad data url");
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

  const results = [];
  for (const b of branches) {
    const before = dataUrlCount(b);
    if (before === 0) {
      results.push({ id: b.id, name: b.name, migrated: 0, skipped: true });
      continue;
    }
    let migrated = 0;
    const settings = { ...(b.settings || {}) };
    const fixScalar = async (path, get, set) => {
      const val = get();
      if (typeof val === "string" && val.startsWith("data:")) {
        const url = await uploadDataUrl(b.id, val, path.replace(/\W+/g, "-"));
        set(url);
        await patchField(b.id, path, url);
        migrated++;
      }
    };
    await fixScalar(
      "logoUrl",
      () => b.logoUrl,
      (u) => {
        b.logoUrl = u;
      },
    );
    for (const key of [
      "headerLogoUrl",
      "headerLogoUrl2",
      "promoSlideLogoUrl",
      "tickerLogoUrl",
      "announcementImageUrl",
      "videoPlaceholderImageUrl",
      "ratePromoImageUrl",
    ]) {
      await fixScalar(
        `settings.${key}`,
        () => settings[key],
        (u) => {
          settings[key] = u;
        },
      );
    }
    for (const key of ["headerLogoUrls", "tickerLogoUrls", "scrollingLogos"]) {
      const list = settings[key];
      if (!Array.isArray(list) || !list.some((u) => typeof u === "string" && u.startsWith("data:")))
        continue;
      const next = [];
      for (let i = 0; i < list.length; i++) {
        const u = list[i];
        if (typeof u === "string" && u.startsWith("data:")) {
          next.push(await uploadDataUrl(b.id, u, `${key}-${i}`));
          migrated++;
        } else next.push(u);
      }
      settings[key] = next;
      await patchField(b.id, `settings.${key}`, next);
    }
    if (Array.isArray(settings.ratePromoMedia) && settings.ratePromoMedia.some((m) => m?.url?.startsWith?.("data:"))) {
      const next = [];
      for (let i = 0; i < settings.ratePromoMedia.length; i++) {
        const m = settings.ratePromoMedia[i];
        if (m?.url?.startsWith?.("data:")) {
          next.push({ ...m, url: await uploadDataUrl(b.id, m.url, `promo-${i}`) });
          migrated++;
        } else next.push(m);
      }
      settings.ratePromoMedia = next;
      settings.ratePromoImageUrl = null;
      await patchField(b.id, "settings.ratePromoMedia", next);
      await patchField(b.id, "settings.ratePromoImageUrl", null);
    }
    if (
      Array.isArray(settings.scrollingLogoItems) &&
      settings.scrollingLogoItems.some((m) => m?.url?.startsWith?.("data:"))
    ) {
      const next = [];
      for (let i = 0; i < settings.scrollingLogoItems.length; i++) {
        const m = settings.scrollingLogoItems[i];
        if (m?.url?.startsWith?.("data:")) {
          next.push({ ...m, url: await uploadDataUrl(b.id, m.url, `scroll-${i}`) });
          migrated++;
        } else next.push(m);
      }
      settings.scrollingLogoItems = next;
      await patchField(b.id, "settings.scrollingLogoItems", next);
    }
    if (
      Array.isArray(settings.tickerLogoScales) &&
      settings.tickerLogoScales.some((m) => m?.url?.startsWith?.("data:"))
    ) {
      const next = [];
      for (let i = 0; i < settings.tickerLogoScales.length; i++) {
        const m = settings.tickerLogoScales[i];
        if (m?.url?.startsWith?.("data:")) {
          next.push({ ...m, url: await uploadDataUrl(b.id, m.url, `ticker-scale-${i}`) });
          migrated++;
        } else next.push(m);
      }
      settings.tickerLogoScales = next;
      await patchField(b.id, "settings.tickerLogoScales", next);
    }
    results.push({ id: b.id, name: b.name, before, migrated });
  }
  return { ok: true, branchCount: branches.length, results };
});

console.log(JSON.stringify(summary, null, 2));
await browser.close();
if (!summary?.ok) process.exit(1);
const moved = (summary.results || []).reduce((n, r) => n + (r.migrated || 0), 0);
console.log(`✓ All branches checked — moved ${moved} inline file(s) total`);
