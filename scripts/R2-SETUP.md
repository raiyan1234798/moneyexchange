# Cloudflare R2 Video Storage Setup

Unimoni stores uploaded signage videos in **Cloudflare R2** (fast, cheap object storage). Firestore only keeps a small metadata document with the public playback URL — no video bytes in the database.

## Storage priority (automatic)

| Method | When used | Speed |
|--------|-----------|-------|
| **Direct URL** | User pastes MP4/WebM link | Instant (recommended) |
| **Cloudflare R2** | File upload when R2 worker is configured | Fast |
| **Firebase Storage** | Fallback if R2 unavailable but Storage enabled | Medium |
| **Firestore chunks** | Last resort, files ≤ 10 MB only | Slow — avoid |

## 1. Create R2 bucket

1. Open [Cloudflare Dashboard](https://dash.cloudflare.com/) → **R2 Object Storage**
2. **Create bucket** → name: `unimoni-videos`
3. Choose a location close to your branches (e.g. APAC / WEUR)

## 2. Enable public playback

Choose **one**:

### Option A — R2 public bucket URL (simplest)

1. Bucket → **Settings** → **Public access** → Allow
2. Note the public URL pattern: `https://pub-<hash>.r2.dev`

### Option B — Custom domain (recommended for production)

1. Bucket → **Settings** → **Custom Domains** → Connect domain  
   e.g. `videos.unimoni.com`
2. Add the CNAME record Cloudflare provides

Set `R2_PUBLIC_URL` to your base URL (no trailing slash), e.g.  
`https://videos.unimoni.com` or `https://pub-xxxxx.r2.dev`

## 3. Deploy the upload worker

```bash
cd workers/upload-video
npm install
npx wrangler login

# Set secrets (Firebase Web API key from Firebase Console → Project settings)
npx wrangler secret put FIREBASE_API_KEY

# Edit wrangler.toml: set R2_PUBLIC_URL and bucket_name if different
npx wrangler deploy
```

Copy the worker URL (e.g. `https://unimoni-video-upload.<account>.workers.dev`).

## 4. Environment variables

### Cloudflare Worker (`wrangler.toml` + secrets)

| Variable | Required | Description |
|----------|----------|-------------|
| `R2_PUBLIC_URL` | Yes | Base URL for playback (custom domain or r2.dev) |
| `FIREBASE_API_KEY` | Yes (secret) | Firebase Web API key for ID token verification |
| R2 bucket binding | Yes | `unimoni-videos` via `[[r2_buckets]]` in wrangler.toml |

### Cloudflare Pages (dashboard app)

Add in **Pages → moneyexchange → Settings → Environment variables**:

| Variable | Example | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_R2_UPLOAD_URL` | `https://unimoni-video-upload.<account>.workers.dev` | Worker endpoint for uploads |

Rebuild and redeploy Pages after setting this variable.

### Local development (optional)

Create `web/.env.local`:

```env
NEXT_PUBLIC_R2_UPLOAD_URL=https://unimoni-video-upload.<account>.workers.dev
```

## 5. Verify

1. Sign in to the dashboard → **Videos** → **File Upload**
2. Upload a small MP4 — progress should move past 0% immediately
3. Open the branch display — video should play from the R2 URL
4. In R2 bucket, object path: `videos/{branchId}/{timestamp}-{filename}`

## 6. Cleanup

When a video is replaced or deleted, the app requests deletion of the old R2 object (best-effort). Orphaned objects can be removed with a lifecycle rule in R2 if needed.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Upload stuck at 0% | Set `NEXT_PUBLIC_R2_UPLOAD_URL` and redeploy; or use **Paste video link** tab |
| 401 Unauthorized | Sign out and back in; check `FIREBASE_API_KEY` secret on worker |
| Video won't play | Confirm `R2_PUBLIC_URL` matches your public/custom domain |
| CORS errors on display | Enable CORS on bucket or use custom domain on same zone |

## Cost notes

- R2 storage: ~$0.015/GB/month; no egress fees to Cloudflare CDN
- Firestore chunk fallback is **deprecated** — each chunk is a paid document write; use R2 or direct URLs instead
