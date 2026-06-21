# MoneyExchangeTV

Enterprise-grade money exchange management platform with centralized administration, branch-wise management, Android TV digital signage, real-time exchange rate updates, offline playback, and Firebase backend.

## Stack

- **Frontend:** Next.js, TypeScript, ShadCN UI, Tailwind CSS, Framer Motion
- **Backend:** Firebase Authentication, Firestore, Storage, Cloud Functions, Hosting
- **Project:** `moneyexchange-35c33`

## Repository Structure

```text
MoneyExchange/
├── web/                  Next.js admin dashboard + Android TV web player
├── functions/            Firebase Cloud Functions
├── firestore.rules       Firestore security rules
├── firestore.indexes.json
├── storage.rules
├── firebase.json
└── README.md
```

## Features

- Super Admin and Branch Manager role-based dashboards
- Branch, currency, exchange rate, video, playlist, and ticker management
- Real-time Firestore listeners for sub-second TV synchronization
- Offline TV cache for rates, tickers, playlists, and downloaded videos
- TV monitoring, audit logs, analytics, and notifications
- Enterprise Firestore and Storage security rules

## Video Storage Strategy (Low Firebase Cost)

Firebase Storage is expensive for large signage videos. This platform uses a **hybrid model**:

| Method | Storage cost | Best for |
|--------|--------------|----------|
| **External URL** (recommended) | Zero Firebase storage | CDN, S3, Cloudflare R2, or compressed WebM/MP4 hosted elsewhere |
| **Small upload** (max 25 MB) | Minimal | Short promos only |

Recommended formats for Android TV: **WebM (VP9)** or **MP4 (H.264)** at 1080p with optimized bitrate (~2–5 Mbps).

Each **branch** has its own video library, playlists, rates, and slogans — branch managers only manage their branch.

## Android TV Connection Flow

```
Admin/Branch Manager                    Android TV
        │                                    │
        ├─ Dashboard → TV Devices            │
        ├─ Register TV for branch            │
        ├─ Get pairing code + QR             │
        │                                    │
        └────────────────────────────────────┼─ Open http://localhost:3000/tv/setup
                                             ├─ Enter pairing code
                                             └─ Redirects to /tv/player
                                                (70% video | 30% rates | ticker)
```

**Kiosk setup:** Set the TV browser home URL to `/tv/setup` or `/tv/player?branchId=…&deviceId=…` after first pairing.

## Local Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) (or the next available port shown in the terminal, e.g. 3001).

### Test flow locally

1. Create super admin in Firebase Auth + `users/{uid}` Firestore doc
2. Login → **Branches** → create branches with slogans and working hours
3. **Currencies** → add USD, EUR, etc.
4. **Exchange Rates** → select branch → **Initialize rates** → edit & publish
5. **Videos** → link external URL (e.g. a sample `.mp4` from a public CDN)
6. **Playlists** → assign videos to the branch
7. **Tickers** → set slogan and scrolling messages
8. **TV Devices** → register TV → copy pairing code
9. Open **http://localhost:3000/tv/setup** → enter code → TV player shows video + rates + slogan

Sample external video URL for testing:
`https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4`


## Production / demo data seed

The hosted display (`/display?branch=DXB01`) and email/password demo login require Firestore data and an Auth user. **Do not commit service account keys.**

### One-command seed (recommended)

1. Download a Firebase **service account JSON** (Console → Project settings → Service accounts → Generate new private key). Store it **outside** the repo.
2. Enable **Email/Password** sign-in in Firebase Authentication.
3. Run from the repo root:

```bash
export GOOGLE_APPLICATION_CREDENTIALS="/absolute/path/to/serviceAccount.json"
npm run seed:production
```

`npm run seed:admin` runs the same script.

This creates:

| Item | Details |
|------|---------|
| Demo super admin | `demo@moneyexchange.local` / `Demo123456!` |
| Branch | `DXB01` — Dubai Main (`branches/dxb01-main`) |
| Currencies | USD, GBP, EUR, AED |
| Exchange rates | Published buy/sell per currency for `DXB01` |
| Ticker | Active scrolling messages for `DXB01` |
| Video + playlist | **External** sample MP4 URL (no Firebase Storage upload) |
| Settings | `settings/global` |

**Videos:** Storage binaries are not uploaded by the seed script. A public **external** MP4 URL is used so signage video works without Storage cost. Upload branch videos later via Dashboard → Videos (external URL or small Storage upload).

### Verify after seeding

```bash
# Firestore (requires ADC or service account — same env as seed)
node --input-type=module -e "
import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { readFileSync } from 'node:fs';
import { getFirestore } from 'firebase-admin/firestore';
const key = process.env.GOOGLE_APPLICATION_CREDENTIALS;
initializeApp(key ? { credential: cert(JSON.parse(readFileSync(key,'utf8'))), projectId: 'moneyexchange-35c33' } : { credential: applicationDefault(), projectId: 'moneyexchange-35c33' });
const snap = await getFirestore().collection('branches').where('code','==','DXB01').get();
console.log(snap.empty ? 'MISSING' : snap.docs[0].data());
"

# Public display (client resolves branch in browser)
curl -sI "https://moneyexchange.pages.dev/display?branch=DXB01" | head -5
```

Open [https://moneyexchange.pages.dev/display?branch=DXB01](https://moneyexchange.pages.dev/display?branch=DXB01) — you should see rates, ticker, and demo video (not “Branch not found”).

### Manual seed (no script)

If you cannot run Admin SDK locally, create the same documents in Firebase Console:

1. **Authentication** → Add user `demo@moneyexchange.local` with password `Demo123456!`.
2. **Firestore** → `users/{that-uid}` with `role: superAdmin`, `isActive: true`, `branchId: null`.
3. **Firestore** → `branches/dxb01-main` with `code: DXB01`, `status: active`, and branch fields from `scripts/seed-production.mjs`.
4. Add `currencies/*`, `exchange_rates/*` (`status: published`, `branchId: dxb01-main`), `ticker_messages/*` (`status: active`), optional `videos` + `video_playlists` with an external `downloadUrl`.


## Initial Firebase Setup

### Enable Authentication

1. Open Firebase Console for `moneyexchange-35c33`
2. Enable **Email/Password** authentication
3. Create the first super admin user

### Create the super admin profile

After creating the Auth user, add a Firestore document at `users/{uid}`:

```json
{
  "email": "admin@moneyexchange.com",
  "displayName": "Super Admin",
  "role": "superAdmin",
  "branchId": null,
  "isActive": true,
  "createdAt": "<server timestamp>",
  "updatedAt": "<server timestamp>"
}
```

### Seed global settings

Create `settings/global`:

```json
{
  "companyName": "Money Exchange Company",
  "supportEmail": "support@moneyexchange.com",
  "defaultTimezone": "Asia/Dubai",
  "emergencyRateEnabled": true,
  "offlineCacheEnabled": true,
  "tvHeartbeatIntervalSeconds": 30,
  "updatedAt": "<server timestamp>"
}
```

## Dashboard Pages

- Overview Dashboard
- Branches
- Managers
- Currencies
- Exchange Rates
- Videos
- Playlists
- Tickers
- TV Devices
- TV Monitoring
- Analytics
- Notifications
- Audit Logs
- Settings

## Android TV Deployment

1. Build the static frontend:

```bash
npm run build
```

2. Deploy to Firebase Hosting:

```bash
npm run deploy:hosting
```

3. Install a kiosk browser on Android TV and set the start URL to:

```text
https://<your-hosting-domain>/tv/player?branchId=<branch-id>&deviceId=<device-id>
```

The player will:

- Register the TV device in Firestore
- Subscribe to rates, tickers, and playlists in real time
- Cache content locally for offline playback
- Send heartbeat updates every 30 seconds

## Deploy Backend Rules and Functions

```bash
npm run deploy:rules
npm run deploy:functions
```

Or deploy everything:

```bash
npm run deploy:all
```

## Security Rules

Prototype Firestore and Storage rules are included for authenticated admin access, branch-scoped manager permissions, TV device heartbeats, and published content reads for signage players.

Review and verify the rules before broad production rollout. They are designed for:

- Default deny with explicit role checks
- Super Admin full control
- Branch Manager branch-scoped writes
- TV player read access to published content
- Immutable audit logs

## Cloud Functions

- `onExchangeRateChange` — creates rate change notifications
- `markOfflineTvs` — marks stale TVs offline every 5 minutes
- `onAuditLogCreate` — mirrors audit entries into activity logs

## CI/CD

Use GitHub Actions or your preferred pipeline to:

1. Install dependencies
2. Run `npm run lint`
3. Run `npm run build`
4. Deploy with `firebase deploy`

## Scalability Notes

- Branch IDs and collection queries are designed for 100+ branches without code changes
- Firestore composite indexes are defined in `firestore.indexes.json`
- TV content uses branch-scoped listeners to minimize fan-out per device

## License

Proprietary — MoneyExchangeTV v1.0.0
