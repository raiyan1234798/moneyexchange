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
    const uid = data.users && data.users[0] && data.users[0].localId;
    return uid ? { uid } : null;
  } catch {
    return null;
  }
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

  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.includes("multipart/form-data")) {
    return json({ error: "Expected multipart/form-data upload" }, 400);
  }

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

  // Model chain, best first. Meta license-gates Llama until the ACCOUNT OWNER
  // submits a one-time "agree" (Workers AI playground) — never automated here.
  // Gemma 3 and LLaVA are ungated fallbacks.
  const MODELS = [
    "@cf/meta/llama-3.2-11b-vision-instruct",
    "@cf/google/gemma-3-12b-it",
    "@cf/llava-hf/llava-1.5-7b-hf",
  ];
  let llamaGated = false;
  let rows = [];
  for (const model of MODELS) {
    let result;
    try {
      result = await env.AI.run(model, { prompt, image: Array.from(bytes), max_tokens: 1500 });
    } catch (err) {
      const msg = String((err && err.message) || err);
      if (/5016|agree|license/i.test(msg)) llamaGated = true;
      continue; // gated, unknown model, or bad input shape — try the next one
    }
    const text = (result && (result.response ?? result.description ?? result.output_text)) || "";
    rows = extractRateRows(String(text));
    if (rows.length > 0) return json({ rows, model });
  }

  const activation = llamaGated
    ? " For the best reader, activate it once: Cloudflare Dashboard → AI → Workers AI → model llama-3.2-11b-vision-instruct → send the word 'agree'."
    : "";
  return json(
    { error: `Could not read rates from the photo — try a clearer, straight-on photo.${activation}` },
    422,
  );
}

/** Parse model output into rate rows: strict JSON first, then loose line format. */
function extractRateRows(text) {
  const num = (v) => {
    const n = Number(String(v ?? "").replace(/[, ]/g, ""));
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const out = [];
  const push = (currency, buy, sell, transferUsd, transferLocal) => {
    const code = String(currency ?? "").trim().toUpperCase();
    if (!/^[A-Z]{2,5}([ -].*)?$/.test(code)) return;
    const row = { currency: code, buy: num(buy), sell: num(sell), transferUsd: num(transferUsd), transferLocal: num(transferLocal) };
    if (row.buy || row.sell || row.transferUsd || row.transferLocal) out.push(row);
  };

  const match = text.match(/\[[\s\S]*\]/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed)) {
        for (const r of parsed.slice(0, 60)) {
          if (!r || typeof r !== "object") continue;
          push(r.currency ?? r.code, r.buy ?? r.weBuy, r.sell ?? r.weSell, r.transferUsd, r.transferLocal);
        }
      }
    } catch {
      // fall through to line parsing
    }
  }
  if (out.length > 0) return out;

  // Loose fallback: lines like "USD 3650 3680" / "USD: 3650 / 3680".
  for (const line of text.split(/\n+/).slice(0, 80)) {
    const m = line.match(/\b([A-Z]{3})\b[^\d\n]*([\d][\d.,]*)[^\d\n]+([\d][\d.,]*)/);
    if (m) push(m[1], m[2], m[3], null, null);
  }
  return out;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
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
