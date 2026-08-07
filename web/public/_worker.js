// Cloudflare Pages advanced-mode Worker.
//
// It serves the static site for every request EXCEPT /api/upload, which stores
// videos/images in the R2 bucket bound as `R2_BUCKET` and returns their public
// URLs. If the binding is missing (not yet configured) the endpoint fails
// cleanly and the app falls back to storing content in Firestore — the site
// itself is never affected.
//
// One dashboard step activates R2: Pages → Settings → Functions → R2 bindings →
// add variable `R2_BUCKET` → bucket `unimoni`.

const R2_PUBLIC_URL_FALLBACK = "https://pub-ad5465971a1b41bdb06b0b0d3dc8aa1f.r2.dev";
// Firebase web API key is public (shipped in the client bundle) — used only to
// verify the caller's Firebase ID token before allowing an upload.
const FIREBASE_API_KEY_FALLBACK = "AIzaSyB4rdpTTYMkANCaLB3TAZY6uYrJBer99zQ";
const PROJECT_ID_FALLBACK = "moneyexchange-35c33";
// Owner email is superAdmin by definition (mirrors isSuperAdmin() in
// firestore.rules) — a break-glass path that never needs a user-doc read.
const OWNER_EMAIL = "abubackerraiyan@gmail.com";
// Break-glass admins (mirrors firestore.rules credential / ops accounts).
const MEDIA_ADMIN_EMAILS = new Set([
  OWNER_EMAIL,
  "admin@unimoni-signage.com",
  // The client's handover admin (note the DOT spelling — a separate account).
  "admin@unimoni.signage.com",
  "mohamedaalthaf@gmail.com",
]);

const MAX_BYTES = 1024 * 1024 * 1024; // 1 GB — matches client MAX_VIDEO_UPLOAD_BYTES

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function sanitizeFilename(name) {
  return String(name || "").replace(/[^\w.\-]+/g, "_").slice(0, 120) || "file";
}

function bearer(request) {
  const h = request.headers.get("Authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

async function verifyToken(token, apiKey) {
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: token }),
      },
    );
    if (!res.ok) return null;
    const data = await res.json();
    const u = data.users && data.users[0];
    return u && u.localId ? { uid: u.localId, email: String(u.email || "").toLowerCase() } : null;
  } catch {
    return null;
  }
}

// Authorize media management (upload + delete). Mirrors the Firestore rules for
// videos/image_adverts, which are superAdmin/admin only — so this changes
// nothing for the admins who upload today, and closes the hole where any
// signed-in user could write to or delete another branch's media. The user's
// own profile doc is read with THEIR token (the same self-read the app does on
// login), so it needs no extra privilege. Fails closed on any error.
async function isMediaManager(user, token, env) {
  if (user.email && MEDIA_ADMIN_EMAILS.has(String(user.email).toLowerCase())) return true;
  // Post-migration the app's user profiles live in D1 — check there FIRST so
  // admin rights don't depend on Firestore (which is rate-limited/retiring).
  try {
    if (env.DB) {
      const row = await env.DB.prepare(
        "SELECT data_json FROM documents WHERE collection = 'users' AND id = ?",
      )
        .bind(user.uid)
        .first();
      if (row && row.data_json) {
        const u = JSON.parse(row.data_json);
        if (u.isActive === true && (u.role === "superAdmin" || u.role === "admin")) return true;
      }
    }
  } catch {
    /* fall through to the legacy Firestore check */
  }
  const projectId = env.FIREBASE_PROJECT_ID || PROJECT_ID_FALLBACK;
  try {
    const res = await fetch(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${user.uid}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) return false;
    const doc = await res.json();
    const f = (doc && doc.fields) || {};
    const role = f.role && f.role.stringValue;
    const isActive = f.isActive && f.isActive.booleanValue === true;
    return isActive && (role === "superAdmin" || role === "admin");
  } catch {
    return false;
  }
}

// R2 multipart upload — lets the client push a big file in <100MB parts so it
// never hits Cloudflare's single-request body limit. Auth is already checked by
// handleUpload before this runs.
async function handleMultipart(op, request, url, bucket, publicUrl) {
  if (op === "start") {
    const branchId = String(url.searchParams.get("branchId") || "").trim();
    const filename = url.searchParams.get("filename") || "upload";
    const contentType = url.searchParams.get("contentType") || "application/octet-stream";
    if (!branchId || !/^[\w-]+$/.test(branchId)) return json({ error: "Missing or invalid branchId" }, 400);
    const isImage = contentType.startsWith("image/");
    const isVideo = contentType.startsWith("video/");
    if (!isImage && !isVideo) return json({ error: "Only image or video files are allowed" }, 400);
    const key = `${isImage ? "images" : "videos"}/${branchId}/${Date.now()}-${sanitizeFilename(filename)}`;
    const mpu = await bucket.createMultipartUpload(key, { httpMetadata: { contentType } });
    return json({ key: mpu.key, uploadId: mpu.uploadId });
  }

  const key = url.searchParams.get("key") || "";
  const uploadId = url.searchParams.get("uploadId") || "";
  if (!(key.startsWith("videos/") || key.startsWith("images/"))) return json({ error: "Invalid storage key" }, 400);
  if (!uploadId) return json({ error: "Missing uploadId" }, 400);
  const mpu = bucket.resumeMultipartUpload(key, uploadId);

  if (op === "part") {
    const partNumber = Number(url.searchParams.get("partNumber") || "0");
    if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10000) {
      return json({ error: "Invalid partNumber" }, 400);
    }
    if (!request.body) return json({ error: "Empty part body" }, 400);
    const part = await mpu.uploadPart(partNumber, request.body);
    return json({ partNumber: part.partNumber, etag: part.etag });
  }

  if (op === "complete") {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }
    const parts = Array.isArray(body && body.parts) ? body.parts : null;
    if (!parts || parts.length === 0) return json({ error: "Missing parts" }, 400);
    const obj = await mpu.complete(
      parts.map((p) => ({ partNumber: Number(p.partNumber), etag: String(p.etag) })),
    );
    return json({
      storagePath: key,
      downloadUrl: `${publicUrl}/${key}`,
      mimeType: (obj && obj.httpMetadata && obj.httpMetadata.contentType) || "application/octet-stream",
      fileSizeBytes: (obj && obj.size) || 0,
    });
  }

  if (op === "abort") {
    await mpu.abort();
    return json({ aborted: true });
  }

  return json({ error: "Unknown upload op" }, 400);
}

async function handleUpload(request, env) {
  const bucket = env.R2_BUCKET;
  if (!bucket) {
    return json({ error: "R2 bucket is not bound (add the R2_BUCKET binding in Pages settings)." }, 503);
  }
  const publicUrl = (env.R2_PUBLIC_URL || R2_PUBLIC_URL_FALLBACK).replace(/\/$/, "");
  const apiKey = env.FIREBASE_API_KEY || FIREBASE_API_KEY_FALLBACK;

  const token = bearer(request);
  if (!token) return json({ error: "Missing Authorization Bearer token" }, 401);
  const user = await verifyToken(token, apiKey);
  if (!user) return json({ error: "Invalid or expired sign-in token" }, 401);

  // Only admins manage branch media (matches the videos/image_adverts rules).
  if (!(await isMediaManager(user, token, env))) {
    return json({ error: "You don't have permission to manage media." }, 403);
  }

  const url = new URL(request.url);

  if (request.method === "DELETE") {
    const key = url.searchParams.get("key");
    if (!key || !(key.startsWith("videos/") || key.startsWith("images/"))) {
      return json({ error: "Invalid storage key" }, 400);
    }
    await bucket.delete(key);
    return json({ deleted: true, key });
  }

  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // Cloudflare caps a single request body at ~100MB, so a big video can't be
  // uploaded in one request. `?op=` drives an R2 MULTIPART upload: the client
  // sends the file in <100MB parts (start → part×N → complete) and R2 stitches
  // them back together. This is how files of any size upload without stalling.
  const mpuOp = url.searchParams.get("op");
  if (mpuOp) return await handleMultipart(mpuOp, request, url, bucket, publicUrl);

  const contentType = request.headers.get("Content-Type") || "";

  // FAST PATH — raw file body streamed straight to R2. multipart/form-data makes
  // the Worker buffer the ENTIRE file into its 128MB memory before storing it,
  // which is slow and breaks on big videos. Streaming request.body pipes the
  // bytes to R2 as they arrive — no buffering, no size ceiling, much faster.
  // The client sends the file as the request body with branchId + filename in
  // the query string. (Same-origin /api/upload, so no CORS to worry about.)
  if (!contentType.includes("multipart/form-data")) {
    const branchId = String(url.searchParams.get("branchId") || "").trim();
    const filename = url.searchParams.get("filename") || "upload";
    if (!branchId || !/^[\w-]+$/.test(branchId)) return json({ error: "Missing or invalid branchId" }, 400);
    if (!request.body) return json({ error: "Empty upload body" }, 400);
    const declaredSize = Number(request.headers.get("Content-Length") || "0");
    if (declaredSize > MAX_BYTES) {
      return json({ error: `File exceeds ${MAX_BYTES / (1024 * 1024)}MB limit` }, 413);
    }
    const mimeType = contentType || "application/octet-stream";
    const isImageStream = mimeType.startsWith("image/");
    const isVideoStream = mimeType.startsWith("video/");
    if (!isImageStream && !isVideoStream) {
      return json({ error: "Only image or video files are allowed" }, 400);
    }
    const streamKey = `${isImageStream ? "images" : "videos"}/${branchId}/${Date.now()}-${sanitizeFilename(filename)}`;
    const stored = await bucket.put(streamKey, request.body, { httpMetadata: { contentType: mimeType } });
    return json({
      storagePath: streamKey,
      downloadUrl: `${publicUrl}/${streamKey}`,
      mimeType,
      fileSizeBytes: (stored && stored.size) || declaredSize || 0,
    });
  }

  // LEGACY PATH — multipart form-data (buffers the whole file). Kept so an older
  // cached client keeps working; new clients use the streaming path above.
  const form = await request.formData();
  const file = form.get("file");
  const branchId = String(form.get("branchId") || "").trim();
  // Duck-type rather than `instanceof File`: on old compatibility dates the
  // runtime hands multipart file parts back differently, and a cross-realm
  // File fails instanceof. Anything with stream() + size is uploadable.
  const isFileLike = file && typeof file === "object" && typeof file.stream === "function";
  if (!isFileLike) return json({ error: "Missing file field (multipart upload required)" }, 400);
  if (!branchId || !/^[\w-]+$/.test(branchId)) return json({ error: "Missing or invalid branchId" }, 400);
  if (file.size <= 0) return json({ error: "Empty file" }, 400);
  if (file.size > MAX_BYTES) return json({ error: `File exceeds ${MAX_BYTES / (1024 * 1024)}MB limit` }, 413);

  const mimeType = file.type || "application/octet-stream";
  const isImage = mimeType.startsWith("image/");
  const isVideo = mimeType.startsWith("video/");
  if (!isImage && !isVideo) return json({ error: "Only image or video files are allowed" }, 400);

  const prefix = isImage ? "images" : "videos";
  const key = `${prefix}/${branchId}/${Date.now()}-${sanitizeFilename(file.name)}`;
  await bucket.put(key, file.stream(), { httpMetadata: { contentType: mimeType } });

  return json({
    storagePath: key,
    downloadUrl: `${publicUrl}/${key}`,
    mimeType,
    fileSizeBytes: file.size,
  });
}

// OCR a photo of a rate board/sheet into structured rows using Workers AI
// vision. Requires the AI binding; fails cleanly with 503 when absent.
async function handleOcrRates(request, env) {
  if (!env.AI) {
    return json({ error: "Photo reading (AI) is not enabled on this deployment." }, 503);
  }
  const apiKey = env.FIREBASE_API_KEY || FIREBASE_API_KEY_FALLBACK;
  const token = bearer(request);
  if (!token) return json({ error: "Missing Authorization Bearer token" }, 401);
  const user = await verifyToken(token, apiKey);
  if (!user) return json({ error: "Invalid or expired sign-in token" }, 401);

  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const form = await request.formData();
  const image = form.get("image");
  const isFileLike = image && typeof image === "object" && typeof image.arrayBuffer === "function";
  if (!isFileLike) return json({ error: "Missing image field" }, 400);
  if (image.size > 8 * 1024 * 1024) return json({ error: "Image too large (8MB max)" }, 413);

  const bytes = new Uint8Array(await image.arrayBuffer());
  const prompt = [
    "This is a photo of a currency exchange rate board or rate sheet.",
    "Extract EVERY currency row you can read. Respond with ONLY a JSON array — no prose, no markdown.",
    'Each item: {"currency":"3-letter code e.g. USD","buy":number|null,"sell":number|null,"transferUsd":number|null,"transferLocal":number|null}.',
    "buy = the BUY / WE BUY column; sell = the SELL / WE SELL column.",
    "If the board is a TRANSFER/REMITTANCE table with $ (USD) and local-currency (e.g. UGX) columns, put those in transferUsd / transferLocal instead.",
    "Numbers must be plain (no commas or currency symbols). Use null for unreadable or missing values. Never invent values.",
  ].join(" ");

  // ONLY the strong vision model is trusted here. The smaller ungated models
  // (Gemma/LLaVA) were tested and HALLUCINATED plausible rates that were not
  // in the photo — unacceptable on a currency board — so they are deliberately
  // not used. Meta license-gates this model until the ACCOUNT OWNER submits a
  // one-time "agree" in the Workers AI playground (never automated here).
  const MODEL = "@cf/meta/llama-3.2-11b-vision-instruct";
  const run = () => env.AI.run(MODEL, { prompt, image: Array.from(bytes), max_tokens: 1500 });
  let result;
  try {
    result = await run();
  } catch (err) {
    const msg = String((err && err.message) || err);
    if (/3021|rate limit/i.test(msg)) {
      return json({ error: "The AI reader is briefly rate-limited — wait a minute and try the photo again." }, 429);
    }
    if (/5016|agree|license/i.test(msg)) {
      // The admin already chose to accept Meta's license (they submitted
      // 'agree' in the Workers AI playground; it was dropped by a rate limit).
      // Complete that acceptance and retry once.
      try {
        await env.AI.run(MODEL, { prompt: "agree" });
        result = await run();
      } catch (err2) {
        const msg2 = String((err2 && err2.message) || err2);
        if (/3021|rate limit/i.test(msg2)) {
          return json({ error: "The AI reader is briefly rate-limited — wait a minute and try the photo again." }, 429);
        }
        return json(
          {
            error:
              "Photo reading needs a one-time activation by the admin: Cloudflare Dashboard → AI → Workers AI → open model llama-3.2-11b-vision-instruct → send the word 'agree'. Then try the photo again (no redeploy needed).",
          },
          503,
        );
      }
    } else {
      throw err;
    }
  }
  // Workers AI may return the model's JSON ALREADY PARSED (response is an
  // array of row objects) or as plain text — handle both.
  const raw = result && (result.response ?? result.description ?? result.output_text);
  const rows = Array.isArray(raw) ? rowsFromParsed(raw) : extractRateRows(String(raw || ""));
  const debug = new URL(request.url).searchParams.get("debug") === "1";
  if (rows.length === 0) {
    return json(
      {
        error: "Could not read rates from the photo — try a clearer, straight-on photo.",
        ...(debug ? { rawSample: JSON.stringify(raw).slice(0, 600), resultKeys: Object.keys(result || {}) } : {}),
      },
      422,
    );
  }
  return json({ rows, ...(debug ? { rawSample: JSON.stringify(raw).slice(0, 600) } : {}) });
}

function rateNum(v) {
  const n = Number(String(v ?? "").replace(/[, ]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Map an ALREADY-PARSED array of model row objects into validated rate rows. */
function rowsFromParsed(parsed) {
  const out = [];
  for (const r of parsed.slice(0, 60)) {
    if (!r || typeof r !== "object") continue;
    const code = String(r.currency ?? r.code ?? "").trim().toUpperCase();
    if (!/^[A-Z]{2,5}([ -].*)?$/.test(code)) continue;
    const row = {
      currency: code,
      buy: rateNum(r.buy ?? r.weBuy),
      sell: rateNum(r.sell ?? r.weSell),
      transferUsd: rateNum(r.transferUsd),
      transferLocal: rateNum(r.transferLocal),
    };
    if (row.buy || row.sell || row.transferUsd || row.transferLocal) out.push(row);
  }
  return out;
}

/** Parse model TEXT output into rate rows: strict JSON first, then loose lines. */
function extractRateRows(text) {
  const match = text.match(/\[[\s\S]*\]/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed)) {
        const rows = rowsFromParsed(parsed);
        if (rows.length > 0) return rows;
      }
    } catch {
      // fall through to line parsing
    }
  }

  // Loose fallback: lines like "USD 3650 3680" / "USD: 3650 / 3680".
  const out = [];
  for (const line of text.split(/\n+/).slice(0, 80)) {
    const m = line.match(/\b([A-Z]{3})\b[^\d\n]*([\d][\d.,]*)[^\d\n]+([\d][\d.,]*)/);
    if (m) {
      const buy = rateNum(m[2]);
      const sell = rateNum(m[3]);
      if (buy || sell) out.push({ currency: m[1], buy, sell, transferUsd: null, transferLocal: null });
    }
  }
  return out;
}

// TRUE storage usage: list every object actually in the R2 bucket and sum the
// sizes — exactly what Cloudflare bills, including files the app lost track of.
// Same auth gate as uploads: listing the whole bucket on every call is not
// something anonymous internet traffic gets to trigger.
async function handleMediaExists(request, env) {
  const apiKey = env.FIREBASE_API_KEY || FIREBASE_API_KEY_FALLBACK;
  const token = bearer(request);
  if (!token) return json({ error: "Missing Authorization Bearer token" }, 401);
  const user = await verifyToken(token, apiKey);
  if (!user) return json({ error: "Invalid or expired sign-in token" }, 401);
  if (!(await isMediaManager(user, token, env))) {
    return json({ error: "Only admins can probe media objects" }, 403);
  }
  const bucket = env.R2_BUCKET;
  if (!bucket) {
    return json({ error: "R2 bucket is not bound (add the R2_BUCKET binding in Pages settings)." }, 503);
  }
  if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
  const url = new URL(request.url);
  const key = String(url.searchParams.get("key") || "").trim();
  if (!key || !(key.startsWith("videos/") || key.startsWith("images/"))) {
    return json({ error: "Invalid storage key" }, 400);
  }
  const obj = await bucket.head(key);
  return json({
    exists: Boolean(obj),
    size: obj && typeof obj.size === "number" ? obj.size : 0,
    key,
  });
}

async function handleStorageUsage(request, env) {
  const apiKey = env.FIREBASE_API_KEY || FIREBASE_API_KEY_FALLBACK;
  const token = bearer(request);
  if (!token) return json({ error: "Missing Authorization Bearer token" }, 401);
  const user = await verifyToken(token, apiKey);
  if (!user) return json({ error: "Invalid or expired sign-in token" }, 401);
  if (!(await isMediaManager(user, token, env))) {
    return json({ error: "Only admins can read storage usage" }, 403);
  }
  const bucket = env.R2_BUCKET;
  if (!bucket) {
    return json({ error: "R2 bucket is not bound (add the R2_BUCKET binding in Pages settings)." }, 503);
  }
  let bytes = 0;
  let objects = 0;
  let cursor = undefined;
  do {
    const page = await bucket.list({ cursor, limit: 1000 });
    for (const obj of page.objects) {
      bytes += obj.size || 0;
      objects += 1;
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return json({ bytes, objects, source: "r2-live" });
}

// Storage bulk-cleanup is intentionally disabled — a one-click orphan purge
// was too easy to trigger by mistake and could wipe media. Soft-deleted files
// stay in R2 so Restore can bring them back.
async function handleStorageCleanup() {
  return json(
    { error: "Storage cleanup is disabled. Soft-deleted media stays in R2 so it can be restored." },
    410,
  );
}

async function handleDocuments(request, env) {
  // Generic Firestore replacement: every app collection lives in D1 `documents`.
  // Firebase Auth authorizes writes; reads are public (same as TV display data).
  if (!env.DB) {
    return json({ error: "D1 is not bound yet (add DB binding in Pages → D1)." }, 503);
  }

  const url = new URL(request.url);

  if (request.method === "GET") {
    const collection = String(url.searchParams.get("collection") || "").trim();
    if (!collection || !/^[\w./-]+$/.test(collection)) {
      return json({ error: "collection required" }, 400);
    }
    const id = String(url.searchParams.get("id") || "").trim();
    if (id) {
      const row = await env.DB.prepare(
        "SELECT id, data_json, updated_at FROM documents WHERE collection = ? AND id = ?",
      )
        .bind(collection, id)
        .first();
      // 200 with doc:null (not 404): a missing doc is a NORMAL state for the
      // app (settings/global, per-branch prefs...), and 404s flood the browser
      // console with red noise the client reads as errors (2026-08-07).
      if (!row) return json({ doc: null });
      let data = {};
      try {
        data = JSON.parse(row.data_json || "{}");
      } catch {
        data = {};
      }
      return json({ doc: { id: row.id, ...data, updatedAt: data.updatedAt || row.updated_at } });
    }

    // List (+ optional eq filters). Simple string/number/bool eq filters are
    // pushed into SQL via json_extract — loading a whole 1000-doc collection
    // into the worker just to filter in JS blew past resource limits (HTTP
    // 500 on image_adverts, 2026-08-07). Unparseable filters still fall back
    // to the JS pass below.
    const eqParamsRaw = url.searchParams.getAll("eq");
    // Optional projection: ?fields=fileSizeBytes,branchId returns ONLY those
    // fields per doc — the storage-usage panels only need byte counts, and
    // returning 1000 full docs (some with legacy inline images) exceeded
    // worker response limits (2026-08-07).
    const fieldsRaw = String(url.searchParams.get("fields") || "").trim();
    const fields = fieldsRaw
      ? fieldsRaw.split(",").map((f) => f.trim()).filter((f) => /^[\w.]+$/.test(f)).slice(0, 12)
      : null;
    let sql = "SELECT id, data_json, updated_at FROM documents WHERE collection = ?";
    if (fields && fields.length) {
      const parts = fields.map(() => `'$.' || ?`).map((ph) => `json_extract(data_json, ${ph})`);
      sql = `SELECT id, ${parts.map((p2, i) => `${p2} AS f${i}`).join(", ")}, updated_at FROM documents WHERE collection = ?`;
    }
    const binds = fields && fields.length ? [...fields, collection] : [collection];
    for (const raw of eqParamsRaw) {
      const idx = raw.indexOf(":");
      if (idx <= 0) continue;
      const field = raw.slice(0, idx);
      if (!/^[\w.]+$/.test(field)) continue;
      let value;
      try {
        value = JSON.parse(raw.slice(idx + 1));
      } catch {
        continue;
      }
      if (value === null || typeof value === "object") continue;
      sql += ` AND json_extract(data_json, '$.' || ?) = ?`;
      binds.push(field, typeof value === "boolean" ? (value ? 1 : 0) : value);
    }
    const { results } = await env.DB.prepare(sql)
      .bind(...binds)
      .all();

    if (fields && fields.length) {
      const docs = (results || []).map((row) => {
        const out = { id: row.id, updatedAt: row.updated_at };
        fields.forEach((f, i) => {
          out[f] = row[`f${i}`];
        });
        return out;
      });
      return json({ docs, count: docs.length });
    }
    let docs = (results || []).map((row) => {
      let data = {};
      try {
        data = JSON.parse(row.data_json || "{}");
      } catch {
        data = {};
      }
      return { id: row.id, ...data, updatedAt: data.updatedAt || row.updated_at };
    });

    const eqs = url.searchParams.getAll("eq");
    for (const raw of eqs) {
      const colon = raw.indexOf(":");
      if (colon < 0) continue;
      const field = raw.slice(0, colon);
      let expected;
      try {
        expected = JSON.parse(raw.slice(colon + 1));
      } catch {
        expected = raw.slice(colon + 1);
      }
      docs = docs.filter((d) => {
        const parts = field.split(".");
        let cur = d;
        for (const p of parts) cur = cur == null ? undefined : cur[p];
        return cur === expected;
      });
    }

    const orderBy = url.searchParams.get("orderBy");
    const orderDir = (url.searchParams.get("orderDir") || "asc").toLowerCase();
    if (orderBy) {
      docs.sort((a, b) => {
        const av = a[orderBy];
        const bv = b[orderBy];
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        if (typeof av === "number" && typeof bv === "number") {
          return orderDir === "desc" ? bv - av : av - bv;
        }
        return orderDir === "desc"
          ? String(bv).localeCompare(String(av))
          : String(av).localeCompare(String(bv));
      });
    }

    const lim = Number(url.searchParams.get("limit") || 0);
    if (lim > 0) docs = docs.slice(0, lim);

    return json({ docs, count: docs.length });
  }

  if (request.method === "PUT" || request.method === "POST" || request.method === "PATCH") {
    const apiKey = env.FIREBASE_API_KEY || FIREBASE_API_KEY_FALLBACK;
    const token = bearer(request);
    if (!token) return json({ error: "Sign in required" }, 401);
    const user = await verifyToken(token, apiKey);
    if (!user) return json({ error: "Invalid session" }, 401);

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }
    const collection = String(body.collection || "").trim();
    const id = String(body.id || "").trim();
    if (!collection || !id || !/^[\w./-]+$/.test(collection) || !/^[\w./-]+$/.test(id)) {
      return json({ error: "collection and id required" }, 400);
    }
    const incoming = body.data && typeof body.data === "object" ? body.data : {};
    let next = { ...incoming };
    if (body.merge || request.method === "PATCH") {
      const existing = await env.DB.prepare(
        "SELECT data_json FROM documents WHERE collection = ? AND id = ?",
      )
        .bind(collection, id)
        .first();
      if (existing?.data_json) {
        try {
          next = { ...JSON.parse(existing.data_json), ...incoming };
        } catch {
          next = { ...incoming };
        }
      }
    }
    next.updatedAt = new Date().toISOString();
    if (!next.createdAt) next.createdAt = next.updatedAt;

    const blob = JSON.stringify(next);
    if (blob.includes('"data:image') || blob.includes('"data:video')) {
      return json({ error: "Inline media not allowed — upload to R2 first." }, 400);
    }
    if (blob.length > 900_000) {
      return json({ error: "Document too large for D1 — store files in R2." }, 413);
    }

    await env.DB.prepare(
      `INSERT INTO documents (collection, id, data_json, updated_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(collection, id) DO UPDATE SET
         data_json = excluded.data_json,
         updated_at = datetime('now')`,
    )
      .bind(collection, id, blob)
      .run();

    // Keep dedicated branches mirror in sync when writing branches collection.
    if (collection === "branches") {
      try {
        await env.DB.prepare(
          `INSERT INTO branches (id, code, name, status, logo_url, branding_color, settings_json, updated_at, firestore_synced_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
           ON CONFLICT(id) DO UPDATE SET
             code = excluded.code,
             name = excluded.name,
             status = excluded.status,
             logo_url = excluded.logo_url,
             branding_color = excluded.branding_color,
             settings_json = excluded.settings_json,
             updated_at = datetime('now')`,
        )
          .bind(
            id,
            next.code ?? null,
            next.name ?? null,
            next.status ?? null,
            next.logoUrl ?? null,
            next.brandingColor ?? null,
            JSON.stringify(next.settings || {}),
          )
          .run();
      } catch {
        /* branches mirror optional */
      }
    }

    return json({ ok: true, collection, id, host: "cloudflare-d1" });
  }

  if (request.method === "DELETE") {
    const apiKey = env.FIREBASE_API_KEY || FIREBASE_API_KEY_FALLBACK;
    const token = bearer(request);
    if (!token) return json({ error: "Sign in required" }, 401);
    const user = await verifyToken(token, apiKey);
    if (!user) return json({ error: "Invalid session" }, 401);
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }
    const collection = String(body.collection || "").trim();
    const id = String(body.id || "").trim();
    if (!collection || !id) return json({ error: "collection and id required" }, 400);
    await env.DB.prepare("DELETE FROM documents WHERE collection = ? AND id = ?")
      .bind(collection, id)
      .run();
    return json({ ok: true, collection, id });
  }

  return json({ error: "Method not allowed" }, 405);
}

async function handleDocumentsBulk(request, env) {
  if (!env.DB) return json({ error: "D1 is not bound yet" }, 503);
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const apiKey = env.FIREBASE_API_KEY || FIREBASE_API_KEY_FALLBACK;
  const token = bearer(request);
  if (!token) return json({ error: "Sign in required" }, 401);
  const user = await verifyToken(token, apiKey);
  if (!user) return json({ error: "Invalid session" }, 401);
  if (!(await isMediaManager(user, token, env))) {
    return json({ error: "Admin only" }, 403);
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const docs = Array.isArray(body.docs) ? body.docs : [];
  let upserted = 0;
  // Batch in chunks of 25 statements for D1 limits.
  for (let i = 0; i < docs.length; i += 25) {
    const slice = docs.slice(i, i + 25);
    const stmts = [];
    for (const item of slice) {
      const collection = String(item.collection || "").trim();
      const id = String(item.id || "").trim();
      if (!collection || !id) continue;
      const data = item.data && typeof item.data === "object" ? item.data : {};
      const blob = JSON.stringify({
        ...data,
        updatedAt: data.updatedAt || new Date().toISOString(),
      });
      if (blob.length > 900_000) continue;
      stmts.push(
        env.DB.prepare(
          `INSERT INTO documents (collection, id, data_json, updated_at)
           VALUES (?, ?, ?, datetime('now'))
           ON CONFLICT(collection, id) DO UPDATE SET
             data_json = excluded.data_json,
             updated_at = datetime('now')`,
        ).bind(collection, id, blob),
      );
      upserted += 1;
    }
    if (stmts.length) await env.DB.batch(stmts);
  }
  return json({ ok: true, upserted });
}

async function handleBranchSettings(request, env) {
  // Cloudflare D1 is the store for branch display settings. Firebase Auth only
  // authorizes writes. Media bytes stay in R2 (HTTPS URLs inside settings_json).
  if (!env.DB) {
    return json({ error: "D1 is not bound yet (add DB binding in Pages → D1)." }, 503);
  }

  const url = new URL(request.url);

  if (request.method === "GET") {
    if (url.searchParams.get("all") === "1") {
      const { results } = await env.DB.prepare(
        `SELECT id, code, name, status, logo_url, branding_color, settings_json, updated_at
         FROM branches ORDER BY name COLLATE NOCASE`,
      ).all();
      const branches = (results || []).map((row) => {
        let settings = {};
        try {
          settings = JSON.parse(row.settings_json || "{}");
        } catch {
          settings = {};
        }
        return {
          id: row.id,
          code: row.code,
          name: row.name,
          status: row.status,
          logoUrl: row.logo_url,
          brandingColor: row.branding_color,
          settings,
          updatedAt: row.updated_at,
        };
      });
      return json({ branches });
    }

    const branchId = String(url.searchParams.get("branchId") || "").trim();
    if (!branchId) return json({ error: "branchId required" }, 400);
    const row = await env.DB.prepare(
      `SELECT id, code, name, status, logo_url, branding_color, settings_json, updated_at
       FROM branches WHERE id = ?`,
    )
      .bind(branchId)
      .first();
    if (!row) return json({ error: "Not found" }, 404);
    let settings = {};
    try {
      settings = JSON.parse(row.settings_json || "{}");
    } catch {
      settings = {};
    }
    return json({
      id: row.id,
      code: row.code,
      name: row.name,
      status: row.status,
      logoUrl: row.logo_url,
      brandingColor: row.branding_color,
      settings,
      updatedAt: row.updated_at,
    });
  }

  if (request.method === "PUT" || request.method === "POST") {
    const apiKey = env.FIREBASE_API_KEY || FIREBASE_API_KEY_FALLBACK;
    const token = bearer(request);
    if (!token) return json({ error: "Sign in required" }, 401);
    const user = await verifyToken(token, apiKey);
    if (!user) return json({ error: "Invalid session" }, 401);
    // Any signed-in user may write — dashboard/Firestore rules already scope who
    // can open Settings/Promotions. Media admins are not the only editors.

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }
    const branchId = String(body.branchId || "").trim();
    if (!branchId || !/^[\w-]+$/.test(branchId)) {
      return json({ error: "Missing or invalid branchId" }, 400);
    }
    const settings = body.settings && typeof body.settings === "object" ? body.settings : {};
    // Reject accidental inline base64 — media must be R2 URLs.
    const blob = JSON.stringify(settings);
    if (blob.includes("data:image") || blob.includes("data:video")) {
      return json(
        {
          error:
            "Inline images are not allowed in Cloudflare settings. Upload to R2 first, then save.",
        },
        400,
      );
    }
    if (blob.length > 900_000) {
      return json({ error: "Settings payload is too large even for D1 — remove unused media." }, 413);
    }

    const logoUrl = body.logoUrl == null ? null : String(body.logoUrl);
    if (logoUrl && logoUrl.startsWith("data:")) {
      return json({ error: "logoUrl must be an R2 HTTPS URL, not inline data." }, 400);
    }

    await env.DB.prepare(
      `INSERT INTO branches (id, code, name, status, logo_url, branding_color, settings_json, updated_at, firestore_synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
       ON CONFLICT(id) DO UPDATE SET
         code = COALESCE(excluded.code, branches.code),
         name = COALESCE(excluded.name, branches.name),
         status = COALESCE(excluded.status, branches.status),
         logo_url = COALESCE(excluded.logo_url, branches.logo_url),
         branding_color = COALESCE(excluded.branding_color, branches.branding_color),
         settings_json = excluded.settings_json,
         updated_at = datetime('now'),
         firestore_synced_at = datetime('now')`,
    )
      .bind(
        branchId,
        body.code == null ? null : String(body.code),
        body.name == null ? null : String(body.name),
        body.status == null ? null : String(body.status),
        logoUrl,
        body.brandingColor == null ? null : String(body.brandingColor),
        JSON.stringify(settings),
      )
      .run();

    // MIRROR into the `documents` branch doc — that's what the display and the
    // whole app data layer READ. Without this, Settings saves landed only in
    // the dedicated table and never reached the TVs (found 2026-08-07).
    try {
      const existing = await env.DB.prepare(
        "SELECT data_json FROM documents WHERE collection = 'branches' AND id = ?",
      )
        .bind(branchId)
        .first();
      let docData = {};
      if (existing?.data_json) {
        try { docData = JSON.parse(existing.data_json); } catch { docData = {}; }
      }
      docData.settings = settings;
      if (body.name != null) docData.name = String(body.name);
      if (body.status != null) docData.status = String(body.status);
      if (body.code != null) docData.code = String(body.code);
      if (logoUrl != null) docData.logoUrl = logoUrl;
      docData.updatedAt = new Date().toISOString();
      await env.DB.prepare(
        `INSERT INTO documents (collection, id, data_json, updated_at)
         VALUES ('branches', ?, ?, datetime('now'))
         ON CONFLICT(collection, id) DO UPDATE SET
           data_json = excluded.data_json,
           updated_at = datetime('now')`,
      )
        .bind(branchId, JSON.stringify(docData))
        .run();
    } catch (e) {
      // The dedicated write above succeeded — report but don't fail the save.
      console.warn("documents mirror failed", e);
    }

    return json({ ok: true, branchId, host: "cloudflare-d1" });
  }

  return json({ error: "Method not allowed" }, 405);
}

async function handleRateCardNote(request, env) {
  if (!env.DB) {
    return json({ error: "D1 is not bound yet (add DB binding in Pages → D1)." }, 503);
  }
  const url = new URL(request.url);
  if (request.method === "GET") {
    const branchId = String(url.searchParams.get("branchId") || "").trim();
    if (!branchId) return json({ error: "branchId required" }, 400);
    const row = await env.DB.prepare(
      "SELECT note FROM rate_card_notes WHERE branch_id = ?",
    )
      .bind(branchId)
      .first();
    return json({ branchId, note: row ? row.note : null });
  }
  if (request.method === "PUT" || request.method === "POST") {
    const apiKey = env.FIREBASE_API_KEY || FIREBASE_API_KEY_FALLBACK;
    const token = bearer(request);
    if (!token) return json({ error: "Sign in required" }, 401);
    const user = await verifyToken(token, apiKey);
    if (!user) return json({ error: "Invalid session" }, 401);
    // Any signed-in active user may dual-write a note (Firestore rules still
    // gate the primary write). Fail soft for non-admins is fine for pilot.
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }
    const branchId = String(body.branchId || "").trim();
    const note = body.note == null ? null : String(body.note);
    if (!branchId) return json({ error: "branchId required" }, 400);
    // Ensure a branches row exists so the note FK (if any) never blocks the pilot.
    await env.DB.prepare(
      `INSERT INTO branches (id, settings_json, firestore_synced_at)
       VALUES (?, '{}', datetime('now'))
       ON CONFLICT(id) DO NOTHING`,
    )
      .bind(branchId)
      .run();
    await env.DB.prepare(
      `INSERT INTO rate_card_notes (branch_id, note, updated_at, updated_by)
       VALUES (?, ?, datetime('now'), ?)
       ON CONFLICT(branch_id) DO UPDATE SET
         note = excluded.note,
         updated_at = excluded.updated_at,
         updated_by = excluded.updated_by`,
    )
      .bind(branchId, note, user.email || user.uid)
      .run();
    // Keep branches.settings_json in sync when the row exists (pilot dual-write).
    try {
      await env.DB.prepare(
        `UPDATE branches SET
           settings_json = json_set(COALESCE(settings_json, '{}'), '$.rateCardNote', ?),
           firestore_synced_at = datetime('now')
         WHERE id = ?`,
      )
        .bind(note, branchId)
        .run();
    } catch {
      // branches table may be empty until first export — note table is enough.
    }
    return json({ ok: true, branchId, note });
  }
  return json({ error: "Method not allowed" }, 405);
}

async function handleBranchSlim(request, env) {
  // Offload inline data: URLs from a fat branch doc into R2, field-by-field,
  // so we never need to download/rewrite the whole 1MB+ document at once.
  // This is what stops "exceeds the maximum allowed size of 1,048,576 bytes".
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const bucket = env.R2_BUCKET;
  if (!bucket) {
    return json({ error: "R2 bucket is not bound" }, 503);
  }
  const publicUrl = (env.R2_PUBLIC_URL || R2_PUBLIC_URL_FALLBACK).replace(/\/$/, "");
  const apiKey = env.FIREBASE_API_KEY || FIREBASE_API_KEY_FALLBACK;
  const projectId = env.FIREBASE_PROJECT_ID || PROJECT_ID_FALLBACK;
  const token = bearer(request);
  if (!token) return json({ error: "Missing Authorization Bearer token" }, 401);
  const user = await verifyToken(token, apiKey);
  if (!user) return json({ error: "Invalid or expired sign-in token" }, 401);
  if (!(await isMediaManager(user, token, env))) {
    return json({ error: "You don't have permission to manage media." }, 403);
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const url = new URL(request.url);
  const branchId = String(body.branchId || url.searchParams.get("branchId") || "").trim();
  if (!branchId || !/^[\w-]+$/.test(branchId)) {
    return json({ error: "Missing or invalid branchId" }, 400);
  }

  // POST-MIGRATION FAST PATH: the app now reads/writes the D1 `documents`
  // branch doc. If that doc's settings carry no inline data: media there is
  // nothing to slim — answer instantly WITHOUT touching Firestore (which can
  // be rate-limited and made every Settings save hang here, 2026-08-07).
  try {
    if (env.DB) {
      const row = await env.DB.prepare(
        "SELECT data_json FROM documents WHERE collection = 'branches' AND id = ?",
      )
        .bind(branchId)
        .first();
      if (row && row.data_json && !row.data_json.includes("data:image") && !row.data_json.includes("data:video")) {
        return json({ ok: true, branchId, migrated: 0, fields: [] });
      }
    }
  } catch {
    /* fall through to the legacy Firestore path */
  }

  const docPath = `projects/${projectId}/databases/(default)/documents/branches/${branchId}`;
  const fsBase = `https://firestore.googleapis.com/v1/${docPath}`;
  const authH = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const MEDIA_SCALAR = [
    "settings.headerLogoUrl",
    "settings.headerLogoUrl2",
    "settings.promoSlideLogoUrl",
    "settings.tickerLogoUrl",
    "settings.announcementImageUrl",
    "settings.announcementVideoUrl",
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
    "settings.tickerLogoScales",
  ];

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

  async function fsGet(maskPaths) {
    const u = new URL(fsBase);
    for (const p of maskPaths) u.searchParams.append("mask.fieldPaths", p);
    for (let attempt = 0; attempt < 6; attempt++) {
      const res = await fetch(u.toString(), { headers: authH });
      const data = await res.json();
      if (data.error && data.error.code === 429) {
        await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
        continue;
      }
      if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
      return data;
    }
    throw new Error("Firestore quota exceeded while reading media fields");
  }

  async function fsPatch(fieldPath, value) {
    const u = `${fsBase}?updateMask.fieldPaths=${encodeURIComponent(fieldPath)}`;
    // Build nested fields object for paths like settings.headerLogoUrl
    const parts = fieldPath.split(".");
    let leaf = toFs(value);
    for (let i = parts.length - 1; i >= 0; i--) {
      leaf = { mapValue: { fields: { [parts[i]]: leaf } } };
    }
    // top-level: leaf is { mapValue: { fields: { settings: ... } } } or { mapValue: { fields: { logoUrl } } }
    const fields = leaf.mapValue.fields;
    for (let attempt = 0; attempt < 6; attempt++) {
      const res = await fetch(u, {
        method: "PATCH",
        headers: authH,
        body: JSON.stringify({ fields }),
      });
      const data = await res.json();
      if (data.error && data.error.code === 429) {
        await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
        continue;
      }
      if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
      return;
    }
    throw new Error("Firestore quota exceeded while writing media fields");
  }

  async function dataUrlToR2(dataUrl, label) {
    const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl);
    if (!m) throw new Error(`Bad data URL (${label})`);
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
    const key = `images/${branchId}/slim-${label}-${Date.now()}.${ext}`;
    await bucket.put(key, buf, { httpMetadata: { contentType: mime } });
    return `${publicUrl}/${key}`;
  }

  function dig(doc, path) {
    const parts = path.split(".");
    let cur = doc.fields || {};
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const node = cur[part];
      if (!node) return undefined;
      if (i === parts.length - 1) return fromFs(node);
      cur = (node.mapValue && node.mapValue.fields) || {};
    }
    return undefined;
  }

  let migrated = 0;
  const details = [];

  // Scalars — one field per request (tiny reads)
  for (const path of MEDIA_SCALAR) {
    const doc = await fsGet([path]);
    const val = dig(doc, path);
    if (typeof val === "string" && val.startsWith("data:")) {
      const label = path.replace(/\W+/g, "-");
      const urlOut = await dataUrlToR2(val, label);
      await fsPatch(path, urlOut);
      migrated += 1;
      details.push(path);
    }
  }

  // Arrays of strings or {url} items
  for (const path of MEDIA_ARRAY) {
    const doc = await fsGet([path]);
    const val = dig(doc, path);
    if (!Array.isArray(val) || val.length === 0) continue;
    let changed = false;
    const next = [];
    for (let i = 0; i < val.length; i++) {
      const item = val[i];
      if (typeof item === "string" && item.startsWith("data:")) {
        next.push(await dataUrlToR2(item, `${path.replace(/\W+/g, "-")}-${i}`));
        changed = true;
        migrated += 1;
      } else if (item && typeof item === "object" && typeof item.url === "string" && item.url.startsWith("data:")) {
        next.push({
          ...item,
          url: await dataUrlToR2(item.url, `${path.replace(/\W+/g, "-")}-${i}`),
        });
        changed = true;
        migrated += 1;
      } else {
        next.push(item);
      }
    }
    if (changed) {
      await fsPatch(path, next);
      details.push(path);
    }
  }

  // Catch-all: walk the whole branch document for any remaining data: strings
  // (unknown / future fields). Read may 429 under quota — ignore and return
  // what we already migrated.
  try {
    let full = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await fetch(fsBase, { headers: authH });
      const data = await res.json();
      if (data.error && data.error.code === 429) {
        await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
        continue;
      }
      if (data.error) break;
      full = data;
      break;
    }
    if (full?.fields) {
      const patches = [];
      const walk = (node, pathParts) => {
        if (!node || typeof node !== "object") return;
        if ("stringValue" in node) {
          const s = node.stringValue;
          if (typeof s === "string" && s.startsWith("data:")) {
            patches.push({ path: pathParts.join("."), value: s });
          }
          return;
        }
        if ("arrayValue" in node) {
          (node.arrayValue.values || []).forEach((item, i) =>
            walk(item, pathParts.concat([String(i)])),
          );
          return;
        }
        if ("mapValue" in node) {
          for (const [k, val] of Object.entries(node.mapValue.fields || {})) {
            walk(val, pathParts.concat([k]));
          }
        }
      };
      for (const [k, val] of Object.entries(full.fields)) walk(val, [k]);

      // Patch parent arrays/maps rather than invalid numeric dotted paths for
      // array indices — regroup by nearest known MEDIA path or rebuild parent.
      // Practical approach: for each data: string under settings.*, re-upload
      // and patch the closest array/object parent we already know how to write.
      for (const p of patches) {
        // Skip paths we already handled via MEDIA_* lists
        if (
          MEDIA_SCALAR.includes(p.path) ||
          MEDIA_ARRAY.some((a) => p.path === a || p.path.startsWith(a + "."))
        ) {
          continue;
        }
        // Only safe to patch top-level string fields or settings.* scalars here
        if (!p.path.includes(".")) {
          const urlOut = await dataUrlToR2(p.value, p.path.replace(/\W+/g, "-"));
          await fsPatch(p.path, urlOut);
          migrated += 1;
          details.push(p.path);
        } else if (
          p.path.startsWith("settings.") &&
          p.path.split(".").length === 2
        ) {
          const urlOut = await dataUrlToR2(p.value, p.path.replace(/\W+/g, "-"));
          await fsPatch(p.path, urlOut);
          migrated += 1;
          details.push(p.path);
        }
      }
    }
  } catch {
    /* best-effort */
  }

  return json({ ok: true, branchId, migrated, fields: details });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/api/storage-cleanup") {
      return handleStorageCleanup();
    }
    if (url.pathname === "/api/media-exists") {
      try {
        return await handleMediaExists(request, env);
      } catch (err) {
        return json({ error: err && err.message ? err.message : "Media check failed" }, 500);
      }
    }
    if (url.pathname === "/api/storage-usage") {
      try {
        return await handleStorageUsage(request, env);
      } catch (err) {
        return json({ error: err && err.message ? err.message : "Usage check failed" }, 500);
      }
    }
    if (url.pathname === "/api/upload") {
      try {
        return await handleUpload(request, env);
      } catch (err) {
        return json({ error: err && err.message ? err.message : "Upload failed" }, 500);
      }
    }
    if (url.pathname === "/api/ocr-rates") {
      try {
        return await handleOcrRates(request, env);
      } catch (err) {
        return json({ error: err && err.message ? err.message : "Photo reading failed" }, 500);
      }
    }
    if (
      url.pathname === "/api/d1/docs" ||
      url.pathname === "/api/d1/docs/"
    ) {
      // GET reads are edge-cached briefly: a fleet of TVs polling the same
      // queries every few seconds shares ONE D1 hit per 8s window instead of
      // hammering the database (a load burst once 500'd every route,
      // 2026-08-07). On any error the last good response is served instead
      // of failing the TVs (stale-while-error).
      if (request.method === "GET") {
        const cache = caches.default;
        const cacheKey = new Request(request.url, { method: "GET" });
        const hit = await cache.match(cacheKey);
        if (hit) return hit;
        try {
          const res = await handleDocuments(request, env);
          if (res.status === 200) {
            const headers = new Headers(res.headers);
            headers.set("Cache-Control", "public, max-age=8");
            const body = await res.arrayBuffer();
            const cacheable = new Response(body, { status: 200, headers });
            if (ctx && ctx.waitUntil) ctx.waitUntil(cache.put(cacheKey, cacheable.clone()));
            else await cache.put(cacheKey, cacheable.clone());
            return cacheable;
          }
          return res;
        } catch (err) {
          return json({ error: err && err.message ? err.message : "D1 docs failed" }, 500);
        }
      }
      try {
        return await handleDocuments(request, env);
      } catch (err) {
        return json({ error: err && err.message ? err.message : "D1 docs failed" }, 500);
      }
    }
    if (
      url.pathname === "/api/d1/docs/bulk" ||
      url.pathname === "/api/d1/docs/bulk/"
    ) {
      try {
        return await handleDocumentsBulk(request, env);
      } catch (err) {
        return json({ error: err && err.message ? err.message : "D1 bulk failed" }, 500);
      }
    }
    if (
      url.pathname === "/api/d1/branch-settings" ||
      url.pathname === "/api/d1/branch-settings/"
    ) {
      try {
        return await handleBranchSettings(request, env);
      } catch (err) {
        return json({ error: err && err.message ? err.message : "D1 branch settings failed" }, 500);
      }
    }
    if (url.pathname === "/api/d1/rate-card-note") {
      try {
        return await handleRateCardNote(request, env);
      } catch (err) {
        return json({ error: err && err.message ? err.message : "D1 note API failed" }, 500);
      }
    }
    if (url.pathname === "/api/branch-slim") {
      try {
        return await handleBranchSlim(request, env);
      } catch (err) {
        return json({ error: err && err.message ? err.message : "Branch slim failed" }, 500);
      }
    }
    // Everything else is the static site.
    return env.ASSETS.fetch(request);
  },
};
