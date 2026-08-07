/**
 * Full cutover: export every Firestore collection → Cloudflare D1 `documents`.
 * Firebase Auth is left untouched. Media URLs already on R2 stay as-is.
 *
 * Usage:
 *   BACKFILL_PASSWORD='…' node scripts/migrate-firestore-to-d1-all.mjs
 */
import { chromium } from "playwright-core";

const BASE = (process.env.BACKFILL_BASE_URL || "https://unimoni-6va.pages.dev").replace(/\/$/, "");
const EMAIL = process.env.BACKFILL_EMAIL || "admin@unimoni-signage.com";
const PASSWORD = process.env.BACKFILL_PASSWORD || "";
const PROJECT = process.env.FIREBASE_PROJECT_ID || "moneyexchange-35c33";

const COLLECTIONS = [
  "users",
  "user_invites",
  "branches",
  "currencies",
  "exchange_rates",
  "rate_history",
  "videos",
  "video_playlists",
  "ticker_messages",
  "tv_devices",
  "tv_health",
  "audit_logs",
  "notifications",
  "settings",
  "roles",
  "permissions",
  "activity_logs",
  "scheduled_content",
  "tv_pairing_codes",
  "image_adverts",
  "transfer_rates",
  "branch_display_prefs",
  "pending_approvals",
  "app_config",
];

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
await page.waitForTimeout(3000);

const token = await page.evaluate(async () => {
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
  return rows.find((r) => r.fbase_key?.startsWith("firebase:authUser:"))?.value
    ?.stsTokenManager?.accessToken;
});
if (!token) {
  console.error("No auth token");
  process.exit(1);
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
  return null;
}

async function listCollection(name) {
  const docs = [];
  let pageToken = "";
  const FS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
  for (;;) {
    const url = new URL(`${FS}/${name}`);
    url.searchParams.set("pageSize", "300");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    let data = null;
    for (let a = 0; a < 8; a++) {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      data = await res.json();
      if (data.error?.code === 429) {
        await new Promise((r) => setTimeout(r, 4000 * (a + 1)));
        continue;
      }
      break;
    }
    if (data?.error) {
      // Missing collection is fine
      if (data.error.code === 404 || /not found/i.test(data.error.message || "")) return docs;
      console.warn(`  skip ${name}:`, data.error.message || data.error);
      return docs;
    }
    for (const doc of data.documents || []) {
      const id = doc.name.split("/").pop();
      const row = { id };
      for (const [k, v] of Object.entries(doc.fields || {})) row[k] = fromFs(v);
      docs.push(row);
    }
    pageToken = data.nextPageToken || "";
    if (!pageToken) break;
  }
  return docs;
}

const summary = {};
let totalUpserted = 0;

for (const name of COLLECTIONS) {
  process.stdout.write(`Export ${name}… `);
  const rows = await listCollection(name);
  summary[name] = rows.length;
  console.log(rows.length);

  // Bulk upload in chunks via the signed-in page origin (has cookies + CORS)
  for (let i = 0; i < rows.length; i += 40) {
    const slice = rows.slice(i, i + 40);
    const payload = {
      docs: slice.map((row) => {
        const { id, ...data } = row;
        return { collection: name, id, data };
      }),
    };
    const result = await page.evaluate(async (body) => {
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
      const t = rows.find((r) => r.fbase_key?.startsWith("firebase:authUser:"))?.value
        ?.stsTokenManager?.accessToken;
      const res = await fetch("/api/d1/docs/bulk", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${t}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      return { status: res.status, data };
    }, payload);
    if (result.status !== 200) {
      console.error("Bulk failed", name, result);
      process.exit(1);
    }
    totalUpserted += result.data.upserted || slice.length;
  }
}

// Also refresh dedicated branches mirror
const branches = await listCollection("branches");
for (const b of branches) {
  await page.evaluate(async (branch) => {
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
    const t = rows.find((r) => r.fbase_key?.startsWith("firebase:authUser:"))?.value
      ?.stsTokenManager?.accessToken;
    await fetch("/api/d1/branch-settings", {
      method: "PUT",
      headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        branchId: branch.id,
        settings: branch.settings || {},
        logoUrl: branch.logoUrl || null,
        name: branch.name || null,
        code: branch.code || null,
        status: branch.status || null,
        brandingColor: branch.brandingColor || null,
      }),
    });
  }, b);
}

await browser.close();
console.log(JSON.stringify({ ok: true, summary, totalUpserted }, null, 2));
console.log("✓ Firestore → Cloudflare D1 migration complete (Auth unchanged)");
