# Cloudflare Pages — unimoni (NOT Workers)

The Next.js admin + TV player in `web/` is a **static export** (`web/out`). Deploy it with **Cloudflare Pages**, not a Worker.

## DO NOT use "Create Worker"

In the dashboard: **Workers & Pages** → **Create** → **Pages** → **Connect to Git**

| Field | Value |
|-------|-------|
| Project name | `unimoni-6va` |
| Production branch | `main` |
| **Root directory** | `web` |
| **Build command** | `npm ci && npm run build` |
| **Build output directory** | `out` |
| **Deploy command** | **Leave empty** — remove `npx wrangler deploy` if present |

**Node version:** 20 or 22 (set under Builds → Environment).

**Environment variables:** Add all `NEXT_PUBLIC_FIREBASE_*` (and optional `NEXT_PUBLIC_R2_UPLOAD_URL`) under **Settings → Environment variables** for Production and Preview. See `web/.env.production.example` and `cloudflare.json`.

If CI uses the **repo root** instead of `web`, set build command to:

```bash
npm run build
```

(Root `package.json` runs `npm install --prefix web && npm --prefix web run build`.)

---

## If you already created a Worker project named `unimoni`

Workers and Pages are different products. A Worker deploy (`npx wrangler deploy`) will **not** serve this static site correctly.

Choose one:

1. **Delete** the Worker project `unimoni` in the dashboard, then create a **Pages** project named `unimoni`, or  
2. Keep the Worker and create a **Pages** project named `unimoni-pages` (URL: `https://unimoni-pages.pages.dev`).

Do **not** set a custom deploy command to `npx wrangler deploy` on Pages builds.

---

## CLI deploy (manual / emergency)

From `web/` after a successful build:

```bash
cd web
npm ci && npm run build
npx wrangler pages deploy out --project-name=unimoni-6va --branch=main --no-bundle
```

Create the Pages project if it does not exist:

```bash
npx wrangler pages project create unimoni-6va --production-branch main
```

From repo root:

```bash
npm run deploy:pages
```

Legacy Pages project names (if needed): `unimoni`, `moneyexchange`.

---

## Repo layout (what is NOT the main app)

| Path | Purpose |
|------|---------|
| `wrangler.toml` (repo root) | Pages Git build: `name = "unimoni-6va"`, `pages_build_output_dir = "web/out"`, R2/AI bindings |
| `web/wrangler.toml` | Pages hint when root directory = `web` (`pages_build_output_dir = "out"`) |
| `workers/upload-video/wrangler.toml` | Separate R2 upload **Worker** — deploy only via `npm run deploy:r2-worker` |

---

## Verify build locally

```bash
cd web && npm ci && npm run build
test -f out/index.html && echo "OK"
```

Production URL after deploy: **https://unimoni-6va.pages.dev** (preview URLs look like `https://<hash>.unimoni-6va.pages.dev`).
