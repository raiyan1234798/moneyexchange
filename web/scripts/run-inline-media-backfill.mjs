/**
 * Production-safe backfill: for every branch, upload inline `data:` media to R2
 * and rewrite ONLY those URL fields. All other settings/options are preserved.
 *
 * Never deletes branches, rates, logos content (bytes move to R2), or non-media keys.
 *
 * Usage:
 *   BACKFILL_PASSWORD='…' node scripts/run-inline-media-backfill.mjs
 * Optional:
 *   BACKFILL_EMAIL=admin@unimoni-signage.com
 *   BACKFILL_BASE_URL=https://unimoni-6va.pages.dev
 *   BACKFILL_BRANCH_ID=GSou0BkUygvy6XZREWwM   # limit to one branch
 *   DRY_RUN=1                                 # report sizes only, no writes
 */

const BASE = (process.env.BACKFILL_BASE_URL || "https://unimoni-6va.pages.dev").replace(/\/$/, "");
const EMAIL = process.env.BACKFILL_EMAIL || "admin@unimoni-signage.com";
const PASSWORD = process.env.BACKFILL_PASSWORD || "";
const PROJECT = process.env.FIREBASE_PROJECT_ID || "moneyexchange-35c33";
const ONLY = process.env.BACKFILL_BRANCH_ID || "";
const DRY = process.env.DRY_RUN === "1";
const API_KEY = process.env.FIREBASE_API_KEY || "AIzaSyB4rdpTTYMkANCaLB3TAZY6uYrJBer99zQ";

if (!PASSWORD) {
  console.error("Set BACKFILL_PASSWORD (admin account that can manage media).");
  process.exit(1);
}

function isDataUrl(v) {
  return typeof v === "string" && v.startsWith("data:");
}

function estimateBytes(obj) {
  try {
    return Buffer.byteLength(JSON.stringify(obj), "utf8");
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

function fromFsValue(v) {
  if (v == null) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("nullValue" in v) return null;
  if ("timestampValue" in v) return v.timestampValue;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(fromFsValue);
  if ("mapValue" in v) {
    const out = {};
    for (const [k, val] of Object.entries(v.mapValue.fields || {})) out[k] = fromFsValue(val);
    return out;
  }
  return null;
}

function toFsValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFsValue) } };
  if (typeof v === "object") {
    const fields = {};
    for (const [k, val] of Object.entries(v)) fields[k] = toFsValue(val);
    return { mapValue: { fields } };
  }
  return { stringValue: String(v) };
}

async function signIn() {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD, returnSecureToken: true }),
    },
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "Sign-in failed");
  return data.idToken;
}

async function listBranches(token) {
  const FS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/branches`;
  const docs = [];
  let pageToken = "";
  do {
    const url = new URL(FS);
    url.searchParams.set("pageSize", "20");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    let data;
    for (let attempt = 0; attempt < 8; attempt++) {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      data = await res.json();
      if (data.error?.code === 429) {
        const wait = 5000 * (attempt + 1);
        console.log(`  rate limited — wait ${wait / 1000}s…`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      break;
    }
    if (data.error) throw new Error(JSON.stringify(data.error));
    for (const doc of data.documents || []) {
      const id = doc.name.split("/").pop();
      const fields = {};
      for (const [k, v] of Object.entries(doc.fields || {})) fields[k] = fromFsValue(v);
      docs.push({ id, name: doc.name, ...fields });
    }
    pageToken = data.nextPageToken || "";
    if (pageToken) await new Promise((r) => setTimeout(r, 1500));
  } while (pageToken);
  return docs;
}

async function getBranch(token, branchId) {
  const name = `projects/${PROJECT}/databases/(default)/documents/branches/${branchId}`;
  let data;
  for (let attempt = 0; attempt < 20; attempt++) {
    const res = await fetch(`https://firestore.googleapis.com/v1/${name}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    data = await res.json();
    if (data.error?.code === 429) {
      const wait = Math.min(120_000, 10_000 * (attempt + 1));
      console.log(`  Firestore quota — retry in ${Math.round(wait / 1000)}s (attempt ${attempt + 1}/20)…`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    break;
  }
  if (data.error) throw new Error(JSON.stringify(data.error));
  const fields = {};
  for (const [k, v] of Object.entries(data.fields || {})) fields[k] = fromFsValue(v);
  return { id: branchId, name: data.name, ...fields };
}

async function uploadDataUrl(token, branchId, dataUrl, label) {
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl);
  if (!m) throw new Error(`Bad data URL for ${label}`);
  const mime = m[1] || "image/png";
  const isB64 = Boolean(m[2]);
  const raw = m[3];
  const buf = isB64 ? Buffer.from(raw, "base64") : Buffer.from(decodeURIComponent(raw), "utf8");
  const ext = (mime.split("/")[1] || "png").replace("+xml", "");
  const filename = `${label}-${Date.now()}.${ext}`;
  const uploadUrl =
    `${BASE}/api/upload?branchId=${encodeURIComponent(branchId)}` +
    `&filename=${encodeURIComponent(filename)}`;
  const res = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": mime,
    },
    body: buf,
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.error || `Upload failed ${res.status} for ${label}`);
  return payload.downloadUrl;
}

async function migrateSettings(token, branchId, settings, logoUrl) {
  let migrated = 0;
  const next = structuredClone(settings || {});
  let nextLogo = logoUrl;

  const bump = async (label, dataUrl) => {
    migrated += 1;
    process.stdout.write(`    ↑ ${label} (${Math.round(dataUrl.length / 1024)} KB)… `);
    const url = await uploadDataUrl(token, branchId, dataUrl, label);
    console.log("ok");
    return url;
  };

  // Promo gallery + legacy
  const promo = [];
  if (isDataUrl(next.ratePromoImageUrl)) {
    promo.push({ type: "image", url: await bump("promo-legacy", next.ratePromoImageUrl) });
    next.ratePromoImageUrl = null;
  } else if (next.ratePromoImageUrl) {
    promo.push({ type: "image", url: next.ratePromoImageUrl });
    next.ratePromoImageUrl = null;
  }
  for (let i = 0; i < (next.ratePromoMedia || []).length; i++) {
    const item = next.ratePromoMedia[i];
    if (isDataUrl(item.url)) {
      promo.push({ type: item.type || "image", url: await bump(`promo-${i + 1}`, item.url) });
    } else {
      promo.push(item);
    }
  }
  if (promo.length) next.ratePromoMedia = promo;

  for (const key of [
    "headerLogoUrl",
    "headerLogoUrl2",
    "promoSlideLogoUrl",
    "tickerLogoUrl",
    "announcementImageUrl",
    "videoPlaceholderImageUrl",
  ]) {
    if (isDataUrl(next[key])) next[key] = await bump(key, next[key]);
  }

  for (const key of ["headerLogoUrls", "tickerLogoUrls", "scrollingLogos"]) {
    if (!Array.isArray(next[key])) continue;
    const out = [];
    for (let i = 0; i < next[key].length; i++) {
      const u = next[key][i];
      out.push(isDataUrl(u) ? await bump(`${key}-${i + 1}`, u) : u);
    }
    next[key] = out;
  }

  if (Array.isArray(next.scrollingLogoItems)) {
    const items = [];
    for (let i = 0; i < next.scrollingLogoItems.length; i++) {
      const item = { ...next.scrollingLogoItems[i] };
      if (isDataUrl(item.url)) item.url = await bump(`scroll-item-${i + 1}`, item.url);
      items.push(item);
    }
    next.scrollingLogoItems = items;
  }

  if (isDataUrl(nextLogo)) nextLogo = await bump("logoUrl", nextLogo);

  return { settings: next, logoUrl: nextLogo, migrated };
}

async function patchBranch(token, branchName, settings, logoUrl) {
  // PATCH only settings + logoUrl — never touch code/name/status/hours/etc.
  const fields = {
    settings: toFsValue(settings),
  };
  if (logoUrl !== undefined) fields.logoUrl = toFsValue(logoUrl ?? null);
  const mask = ["settings", "logoUrl"].filter((k) => k in fields || k === "settings");
  const url =
    `https://firestore.googleapis.com/v1/${branchName}?` +
    mask.map((p) => `updateMask.fieldPaths=${encodeURIComponent(p)}`).join("&");
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data.error || data));
  return data;
}

console.log(`Signing in as ${EMAIL}…`);
const token = await signIn();
console.log("Loading branches…");
let branches;
if (ONLY) {
  branches = [await getBranch(token, ONLY)];
} else {
  branches = await listBranches(token);
}
console.log(`Branches to check: ${branches.length}${DRY ? " (DRY RUN)" : ""}`);

const results = [];
for (const b of branches) {
  const label = `${b.name || b.id} (${b.id})`;
  const before = estimateBytes({ logoUrl: b.logoUrl, settings: b.settings });
  const hasInline =
    isDataUrl(b.logoUrl) ||
    JSON.stringify(b.settings || {}).includes('"data:');
  console.log(`\n• ${label} — ~${Math.round(before / 1024)} KB${hasInline ? " [has inline media]" : ""}`);
  if (!hasInline) {
    results.push({ id: b.id, label, before, after: before, migrated: 0 });
    continue;
  }
  if (DRY) {
    results.push({ id: b.id, label, before, after: before, migrated: -1 });
    continue;
  }
  try {
    const { settings, logoUrl, migrated } = await migrateSettings(
      token,
      b.id,
      b.settings || {},
      b.logoUrl,
    );
    const after = estimateBytes({ logoUrl, settings });
    if (after > 900_000) {
      throw new Error(`Still too large after migrate (~${Math.round(after / 1024)} KB)`);
    }
    await patchBranch(token, b.name, settings, logoUrl);
    console.log(`  ✓ wrote ${Math.round(before / 1024)} → ${Math.round(after / 1024)} KB (${migrated} file(s))`);
    results.push({ id: b.id, label, before, after, migrated });
  } catch (e) {
    console.error(`  ✗ ${e instanceof Error ? e.message : e}`);
    results.push({
      id: b.id,
      label,
      before,
      after: before,
      migrated: 0,
      error: String(e instanceof Error ? e.message : e),
    });
  }
}

console.log("\n=== Summary ===");
for (const r of results) {
  console.log(
    `${r.label}: ${Math.round(r.before / 1024)}→${Math.round(r.after / 1024)} KB` +
      (r.error ? ` ERROR: ${r.error}` : r.migrated ? ` (+${r.migrated})` : ""),
  );
}
const failed = results.filter((r) => r.error);
process.exit(failed.length ? 1 : 0);
