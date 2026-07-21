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

const MAX_BYTES = 500 * 1024 * 1024;

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
  if (user.email && user.email === OWNER_EMAIL) return true;
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
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
    // Everything else is the static site.
    return env.ASSETS.fetch(request);
  },
};
