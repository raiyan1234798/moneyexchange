export interface Env {
  BUCKET: R2Bucket;
  R2_PUBLIC_URL: string;
  FIREBASE_API_KEY: string;
}

const MAX_BYTES = 500 * 1024 * 1024;
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^\w.\-]+/g, "_").slice(0, 120) || "video.mp4";
}

async function verifyFirebaseToken(token: string, apiKey: string): Promise<{ uid: string } | null> {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: token }),
    },
  );

  if (!response.ok) return null;

  const data = (await response.json()) as { users?: Array<{ localId?: string }> };
  const uid = data.users?.[0]?.localId;
  return uid ? { uid } : null;
}

function extractBearerToken(request: Request): string | null {
  const header = request.headers.get("Authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

function publicUrl(base: string, key: string): string {
  const normalized = base.replace(/\/$/, "");
  return `${normalized}/${key}`;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const token = extractBearerToken(request);
    if (!token) {
      return jsonResponse({ error: "Missing Authorization Bearer token" }, 401);
    }

    const user = await verifyFirebaseToken(token, env.FIREBASE_API_KEY);
    if (!user) {
      return jsonResponse({ error: "Invalid or expired sign-in token" }, 401);
    }

    const url = new URL(request.url);

    if (request.method === "DELETE") {
      const key = url.searchParams.get("key");
      if (!key || !key.startsWith("videos/")) {
        return jsonResponse({ error: "Invalid storage key" }, 400);
      }
      await env.BUCKET.delete(key);
      return jsonResponse({ deleted: true, key });
    }

    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    const contentType = request.headers.get("Content-Type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return jsonResponse({ error: "Expected multipart/form-data upload" }, 400);
    }

    const form = await request.formData();
    const file = form.get("file");
    const branchId = String(form.get("branchId") ?? "").trim();

    if (!(file instanceof File)) {
      return jsonResponse({ error: "Missing file field" }, 400);
    }
    if (!branchId || !/^[\w-]+$/.test(branchId)) {
      return jsonResponse({ error: "Missing or invalid branchId" }, 400);
    }
    if (file.size <= 0) {
      return jsonResponse({ error: "Empty file" }, 400);
    }
    if (file.size > MAX_BYTES) {
      return jsonResponse({ error: `File exceeds ${MAX_BYTES / (1024 * 1024)}MB limit` }, 413);
    }

    const mimeType = file.type || "video/mp4";
    if (!mimeType.startsWith("video/")) {
      return jsonResponse({ error: "Only video files are allowed" }, 400);
    }

    const key = `videos/${branchId}/${Date.now()}-${sanitizeFilename(file.name)}`;

    await env.BUCKET.put(key, file.stream(), {
      httpMetadata: { contentType: mimeType },
    });

    const downloadUrl = publicUrl(env.R2_PUBLIC_URL, key);

    return jsonResponse({
      storagePath: key,
      downloadUrl,
      mimeType,
      fileSizeBytes: file.size,
    });
  },
};
