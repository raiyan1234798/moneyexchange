# Firebase Storage setup for MoneyExchange

## Why uploads may fail

Video file upload uses **Firebase Storage** first. On project `moneyexchange-35c33`, Storage is **not provisioned** and the GCP project has **no billing account** linked. Until both are fixed, uploads automatically fall back to **Firestore chunk storage** (files up to 25 MB).

## Enable Firebase Storage (recommended for production)

1. Open [Firebase Console → Storage](https://console.firebase.google.com/project/moneyexchange-35c33/storage)
2. Click **Get started**
3. Upgrade to the **Blaze (pay as you go)** plan if prompted — Storage requires billing
4. Choose a bucket location (e.g. `us-central1`)
5. Deploy storage rules from the repo root:

```bash
npm run deploy:rules
```

6. Ensure your Cloudflare Pages build env includes:

```
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=moneyexchange-35c33.firebasestorage.app
```

(If omitted, the app defaults to `{projectId}.firebasestorage.app`.)

## Branch-scoped upload paths

- Storage path: `videos/{branchId}/{timestamp}_{filename}`
- Branch managers can upload only to their `branchId` (enforced in `storage.rules` + Firestore rules)
- Super admins can upload to any branch

## Fallback: Firestore chunks

When Storage is unavailable, the dashboard uploads files ≤ 25 MB as chunked Firestore documents (`video_chunks/{videoId}/parts/*`). Displays reassemble chunks in the browser. Suitable for short promos (e.g. 4 MB WhatsApp clips).

For large signage videos, use **Direct URL** (CDN, R2, S3) or enable Firebase Storage.
