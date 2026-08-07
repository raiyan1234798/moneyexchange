/**
 * In-browser shrink of branch GSou0BkUygvy6XZREWwM (and optionally all branches):
 * uses the live dashboard session + R2 upload API + Firestore field patches.
 */
import { chromium } from "playwright-core";

const BASE = (process.env.BACKFILL_BASE_URL || "https://unimoni-6va.pages.dev").replace(/\/$/, "");
const EMAIL = process.env.BACKFILL_EMAIL || "admin@unimoni-signage.com";
const PASSWORD = process.env.BACKFILL_PASSWORD || "";
const ONLY = process.env.BACKFILL_BRANCH_ID || "GSou0BkUygvy6XZREWwM";

if (!PASSWORD) {
  console.error("Set BACKFILL_PASSWORD");
  process.exit(1);
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await (await browser.newContext()).newPage();
page.setDefaultTimeout(180000);

try {
  console.log("Signing in…");
  await page.goto(`${BASE}/login/`, { waitUntil: "domcontentloaded" });
  await page.getByRole("textbox", { name: /email/i }).fill(EMAIL);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/dashboard/, { timeout: 90000 });

  // Open settings so branch subscription is warm
  await page.goto(`${BASE}/dashboard/settings/`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(10000);

  console.log(`Shrinking branch ${ONLY} from in-page Firebase + R2…`);
  const result = await page.evaluate(async (branchId) => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    // Firebase auth from IndexedDB
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
    const authRow = rows.find((r) => r.fbase_key?.startsWith("firebase:authUser:"));
    const token = authRow?.value?.stsTokenManager?.accessToken;
    if (!token) return { ok: false, error: "No auth token in IndexedDB" };

    const PROJECT = "moneyexchange-35c33";
    const API_KEY = "AIzaSyB4rdpTTYMkANCaLB3TAZY6uYrJBer99zQ";
    const FS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/branches/${branchId}`;
    const H = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

    function fromFs(v) {
      if (!v) return null;
      if ("stringValue" in v) return v.stringValue;
      if ("arrayValue" in v) return (v.arrayValue.values || []).map(fromFs);
      if ("mapValue" in v) {
        const o = {};
        for (const [k, val] of Object.entries(v.mapValue.fields || {})) o[k] = fromFs(val);
        return o;
      }
      if ("nullValue" in v) return null;
      if ("integerValue" in v) return Number(v.integerValue);
      if ("doubleValue" in v) return v.doubleValue;
      if ("booleanValue" in v) return v.booleanValue;
      return null;
    }
    function toFs(v) {
      if (v === null || v === undefined) return { nullValue: null };
      if (typeof v === "string") return { stringValue: v };
      if (typeof v === "boolean") return { booleanValue: v };
      if (typeof v === "number") {
        return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
      }
      if (Array.isArray(v)) return { arrayValue: { values: v.map(toFs) } };
      if (typeof v === "object") {
        const fields = {};
        for (const [k, val] of Object.entries(v)) fields[k] = toFs(val);
        return { mapValue: { fields } };
      }
      return { stringValue: String(v) };
    }

    async function getMasked(paths) {
      for (let attempt = 0; attempt < 12; attempt++) {
        const u = new URL(FS);
        for (const p of paths) u.searchParams.append("mask.fieldPaths", p);
        const res = await fetch(u.toString(), { headers: H });
        const data = await res.json();
        if (data.error?.code === 429) {
          await sleep(5000 * (attempt + 1));
          continue;
        }
        if (data.error) throw new Error(JSON.stringify(data.error));
        return data;
      }
      throw new Error("Quota exceeded reading fields");
    }

    async function patchField(path, value) {
      const parts = path.split(".");
      let leaf = toFs(value);
      for (let i = parts.length - 1; i >= 0; i--) {
        leaf = { mapValue: { fields: { [parts[i]]: leaf } } };
      }
      const fields = leaf.mapValue.fields;
      const u = `${FS}?updateMask.fieldPaths=${encodeURIComponent(path)}`;
      for (let attempt = 0; attempt < 12; attempt++) {
        const res = await fetch(u, { method: "PATCH", headers: H, body: JSON.stringify({ fields }) });
        const data = await res.json();
        if (data.error?.code === 429) {
          await sleep(5000 * (attempt + 1));
          continue;
        }
        // Shrinking patches can still hit size errors if OTHER fields are huge —
        // but replacing a data: URL with https should shrink. Surface the error.
        if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
        return;
      }
      throw new Error("Quota exceeded writing field " + path);
    }

    async function uploadDataUrl(dataUrl, label) {
      const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl);
      if (!m) throw new Error("bad data url " + label);
      const mime = m[1] || "image/png";
      const bin = m[2] ? atob(m[3]) : decodeURIComponent(m[3]);
      const buf = new Uint8Array(bin.length);
      if (m[2]) for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
      else {
        const enc = new TextEncoder().encode(bin);
        return uploadBytes(enc, mime, label);
      }
      return uploadBytes(buf, mime, label);
    }

    async function uploadBytes(buf, mime, label) {
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

    function dig(doc, path) {
      const parts = path.split(".");
      let cur = doc.fields || {};
      for (let i = 0; i < parts.length; i++) {
        const node = cur[parts[i]];
        if (!node) return undefined;
        if (i === parts.length - 1) return fromFs(node);
        cur = (node.mapValue && node.mapValue.fields) || {};
      }
      return undefined;
    }

    const MEDIA_SCALAR = [
      "settings.headerLogoUrl",
      "settings.headerLogoUrl2",
      "settings.promoSlideLogoUrl",
      "settings.tickerLogoUrl",
      "settings.announcementImageUrl",
      "settings.videoPlaceholderImageUrl",
      "settings.ratePromoImageUrl",
      "logoUrl",
    ];
    const MEDIA_ARRAY = [
      "settings.headerLogoUrls",
      "settings.tickerLogoUrls",
      "settings.scrollingLogos",
      "settings.ratePromoMedia",
      "settings.scrollingLogoItems",
    ];

    let migrated = 0;
    const details = [];

    for (const path of MEDIA_SCALAR) {
      const doc = await getMasked([path]);
      const val = dig(doc, path);
      if (typeof val === "string" && val.startsWith("data:")) {
        const url = await uploadDataUrl(val, path.replace(/\W+/g, "-"));
        await patchField(path, url);
        migrated++;
        details.push(path);
      }
    }

    for (const path of MEDIA_ARRAY) {
      const doc = await getMasked([path]);
      const val = dig(doc, path);
      if (!Array.isArray(val) || !val.length) continue;
      let changed = false;
      const next = [];
      for (let i = 0; i < val.length; i++) {
        const item = val[i];
        if (typeof item === "string" && item.startsWith("data:")) {
          next.push(await uploadDataUrl(item, `${path}-${i}`));
          changed = true;
          migrated++;
        } else if (item && typeof item === "object" && typeof item.url === "string" && item.url.startsWith("data:")) {
          next.push({
            ...item,
            url: await uploadDataUrl(item.url, `${path}-${i}`),
          });
          changed = true;
          migrated++;
        } else next.push(item);
      }
      if (changed) {
        await patchField(path, next);
        details.push(path);
      }
    }

    return { ok: true, migrated, details };
  }, ONLY);

  console.log(JSON.stringify(result, null, 2));
  if (!result?.ok) process.exit(1);

  // Verify: try a tiny no-op settings touch is not needed — check masked fields no longer data:
  console.log("Done. Migrated", result.migrated, "inline file(s).");
} catch (e) {
  console.error(e);
  process.exit(1);
} finally {
  await browser.close();
}
