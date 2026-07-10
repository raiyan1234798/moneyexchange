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
    // Everything else is the static site.
    return env.ASSETS.fetch(request);
  },
};
