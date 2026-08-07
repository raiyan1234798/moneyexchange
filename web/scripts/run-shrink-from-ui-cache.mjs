/**
 * Shrink a fat branch using data already loaded into the live dashboard
 * (Firestore onSnapshot / UI state), so we do not need REST document reads
 * when the project is under 429 quota.
 *
 * Flow:
 *  1) Sign in on Cloudflare Pages
 *  2) Open Settings and wait until branch names render
 *  3) Pull branch.settings from the React tree / window hooks if present
 *  4) Upload each data: URL to /api/upload (R2)
 *  5) PATCH only those fields via Firestore REST (writes that SHRINK the doc)
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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

try {
  console.log("1) Sign in…");
  await page.goto(`${BASE}/login/`, { waitUntil: "domcontentloaded" });
  await page.getByRole("textbox", { name: /email/i }).fill(EMAIL);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/dashboard/, { timeout: 90000 });

  console.log("2) Warm Settings (load branches into UI)…");
  await page.goto(`${BASE}/dashboard/settings/`, { waitUntil: "networkidle" }).catch(() => undefined);
  // Give realtime listeners time — may serve from persistence cache under quota.
  for (let i = 0; i < 40; i++) {
    const text = await page.locator("body").innerText();
    if (/Lugogo|branch|Shrink oversized/i.test(text) && !/Loading|PageLoader/i.test(text.slice(0, 200))) {
      break;
    }
    await sleep(2000);
    process.stdout.write(".");
  }
  console.log("\n3) Extract branch + auth from page…");

  const extracted = await page.evaluate(async (branchId) => {
    // Auth token
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
    const token = authRow?.value?.stsTokenManager?.accessToken || null;

    // Walk React fiber roots for a branch object with matching id + settings
    function fiberRoots() {
      const roots = [];
      const all = document.querySelectorAll("*");
      for (const el of all) {
        const keys = Object.keys(el).filter((k) => k.startsWith("__reactFiber") || k.startsWith("__reactContainer"));
        for (const k of keys) roots.push(el[k]);
      }
      return roots;
    }

    let branch = null;
    const seen = new Set();
    function walk(node, depth) {
      if (!node || depth > 40 || branch) return;
      const props = node.memoizedProps || node.pendingProps;
      const state = node.memoizedState;
      const candidates = [];
      if (props) candidates.push(props);
      // hooks linked list
      let s = state;
      let guard = 0;
      while (s && guard++ < 50) {
        if (s.memoizedState) candidates.push(s.memoizedState);
        s = s.next;
      }
      for (const c of candidates) {
        scanValue(c, 0);
      }
      walk(node.child, depth + 1);
      walk(node.sibling, depth + 1);
    }
    function scanValue(v, depth) {
      if (branch || !v || depth > 8) return;
      if (typeof v !== "object") return;
      if (seen.has(v)) return;
      seen.add(v);
      if (Array.isArray(v)) {
        for (const item of v) {
          if (
            item &&
            typeof item === "object" &&
            item.id === branchId &&
            item.settings &&
            typeof item.settings === "object"
          ) {
            branch = item;
            return;
          }
          scanValue(item, depth + 1);
        }
        return;
      }
      if (v.id === branchId && v.settings && typeof v.settings === "object") {
        branch = v;
        return;
      }
      // maps keyed by id
      if (v[branchId] && v[branchId].settings) {
        branch = { id: branchId, ...v[branchId] };
        return;
      }
      for (const key of Object.keys(v)) {
        scanValue(v[key], depth + 1);
        if (branch) return;
      }
    }
    for (const root of fiberRoots()) walk(root, 0);

    // Fallback: Firestore IndexedDB persistence (remoteDocChanges / documents)
    let cacheHit = null;
    if (!branch) {
      const dbs = await indexedDB.databases();
      for (const info of dbs) {
        const name = info.name || "";
        if (!/firestore/i.test(name)) continue;
        try {
          const db = await new Promise((res, rej) => {
            const r = indexedDB.open(name);
            r.onsuccess = () => res(r.result);
            r.onerror = () => rej(r.error);
          });
          for (const store of [...db.objectStoreNames]) {
            const rows2 = await new Promise((res, rej) => {
              try {
                const tx = db.transaction(store, "readonly");
                const rq = tx.objectStore(store).getAll();
                rq.onsuccess = () => res(rq.result);
                rq.onerror = () => rej(rq.error);
              } catch (e) {
                res([]);
              }
            });
            for (const row of rows2) {
              const s = JSON.stringify(row);
              if (s.includes(branchId) && (s.includes("data:image") || s.includes("ratePromo"))) {
                cacheHit = { store, keys: Object.keys(row || {}), bytes: s.length };
              }
            }
          }
          db.close();
        } catch {}
      }
    }

    return {
      token: token ? "yes" : "no",
      hasBranch: Boolean(branch),
      branchName: branch?.name || null,
      logoUrlIsData: typeof branch?.logoUrl === "string" && branch.logoUrl.startsWith("data:"),
      settingsKeys: branch?.settings ? Object.keys(branch.settings).length : 0,
      dataUrlFields: branch
        ? summarizeDataUrls(branch)
        : [],
      cacheHit,
      // pass full branch back only if found (may be large)
      branch,
    };

    function summarizeDataUrls(b) {
      const out = [];
      const s = b.settings || {};
      const check = (label, val) => {
        if (typeof val === "string" && val.startsWith("data:")) out.push(`${label}:${Math.round(val.length / 1024)}KB`);
      };
      check("logoUrl", b.logoUrl);
      for (const k of [
        "headerLogoUrl",
        "headerLogoUrl2",
        "promoSlideLogoUrl",
        "tickerLogoUrl",
        "announcementImageUrl",
        "videoPlaceholderImageUrl",
        "ratePromoImageUrl",
      ]) check(k, s[k]);
      for (const k of ["headerLogoUrls", "tickerLogoUrls", "scrollingLogos"]) {
        (s[k] || []).forEach((u, i) => check(`${k}[${i}]`, u));
      }
      (s.ratePromoMedia || []).forEach((m, i) => check(`ratePromoMedia[${i}]`, m?.url));
      (s.scrollingLogoItems || []).forEach((m, i) => check(`scrollingLogoItems[${i}]`, m?.url));
      return out;
    }
  }, ONLY);

  console.log({
    token: extracted.token,
    hasBranch: extracted.hasBranch,
    branchName: extracted.branchName,
    settingsKeys: extracted.settingsKeys,
    dataUrlFields: extracted.dataUrlFields,
    cacheHit: extracted.cacheHit,
  });

  if (!extracted.hasBranch || !extracted.branch) {
    throw new Error(
      "Could not load branch into the UI (Firestore quota still blocking reads). Try again later.",
    );
  }

  console.log("4) Upload data: URLs to R2 and PATCH fields…");
  const shrink = await page.evaluate(
    async ({ branch, token }) => {
      const branchId = branch.id;
      const PROJECT = "moneyexchange-35c33";
      const FS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/branches/${branchId}`;
      const H = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

      async function patchField(path, value) {
        const parts = path.split(".");
        let leaf = toFs(value);
        for (let i = parts.length - 1; i >= 0; i--) {
          leaf = { mapValue: { fields: { [parts[i]]: leaf } } };
        }
        const fields = leaf.mapValue.fields;
        const u = `${FS}?updateMask.fieldPaths=${encodeURIComponent(path)}`;
        for (let attempt = 0; attempt < 15; attempt++) {
          const res = await fetch(u, { method: "PATCH", headers: H, body: JSON.stringify({ fields }) });
          const data = await res.json();
          if (data.error?.code === 429) {
            await sleep(8000 * (attempt + 1));
            continue;
          }
          if (data.error) throw new Error(path + ": " + (data.error.message || JSON.stringify(data.error)));
          return;
        }
        throw new Error("quota writing " + path);
      }

      async function uploadDataUrl(dataUrl, label) {
        const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl);
        if (!m) throw new Error("bad data url " + label);
        const mime = m[1] || "image/png";
        let buf;
        if (m[2]) {
          const bin = atob(m[3]);
          buf = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
        } else {
          buf = new TextEncoder().encode(decodeURIComponent(m[3]));
        }
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

      let migrated = 0;
      const details = [];
      const settings = { ...(branch.settings || {}) };

      async function fixScalar(path, getter, setter) {
        const val = getter();
        if (typeof val === "string" && val.startsWith("data:")) {
          const url = await uploadDataUrl(val, path.replace(/\W+/g, "-"));
          setter(url);
          await patchField(path, url);
          migrated++;
          details.push(path);
        }
      }

      await fixScalar(
        "logoUrl",
        () => branch.logoUrl,
        (u) => {
          branch.logoUrl = u;
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
        if (!Array.isArray(list) || !list.some((u) => typeof u === "string" && u.startsWith("data:"))) continue;
        const next = [];
        for (let i = 0; i < list.length; i++) {
          const u = list[i];
          if (typeof u === "string" && u.startsWith("data:")) {
            next.push(await uploadDataUrl(u, `${key}-${i}`));
            migrated++;
          } else next.push(u);
        }
        settings[key] = next;
        await patchField(`settings.${key}`, next);
        details.push(`settings.${key}`);
      }

      if (Array.isArray(settings.ratePromoMedia)) {
        const list = settings.ratePromoMedia;
        if (list.some((m) => m?.url?.startsWith?.("data:"))) {
          const next = [];
          for (let i = 0; i < list.length; i++) {
            const m = list[i];
            if (m?.url?.startsWith?.("data:")) {
              next.push({ ...m, url: await uploadDataUrl(m.url, `promo-${i}`) });
              migrated++;
            } else next.push(m);
          }
          settings.ratePromoMedia = next;
          settings.ratePromoImageUrl = null;
          await patchField("settings.ratePromoMedia", next);
          await patchField("settings.ratePromoImageUrl", null);
          details.push("settings.ratePromoMedia");
        }
      }

      if (Array.isArray(settings.scrollingLogoItems)) {
        const list = settings.scrollingLogoItems;
        if (list.some((m) => m?.url?.startsWith?.("data:"))) {
          const next = [];
          for (let i = 0; i < list.length; i++) {
            const m = list[i];
            if (m?.url?.startsWith?.("data:")) {
              next.push({ ...m, url: await uploadDataUrl(m.url, `scroll-${i}`) });
              migrated++;
            } else next.push(m);
          }
          settings.scrollingLogoItems = next;
          await patchField("settings.scrollingLogoItems", next);
          details.push("settings.scrollingLogoItems");
        }
      }

      return { ok: true, migrated, details };
    },
    {
      branch: extracted.branch,
      token: await page.evaluate(async () => {
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
        return rows.find((r) => r.fbase_key?.startsWith("firebase:authUser:"))?.value?.stsTokenManager
          ?.accessToken;
      }),
    },
  );

  console.log(JSON.stringify(shrink, null, 2));
  if (!shrink?.ok) process.exit(1);
  console.log(`✓ Migrated ${shrink.migrated} inline file(s) on ${ONLY}`);
} catch (e) {
  console.error(e);
  process.exit(1);
} finally {
  await browser.close();
}
