# AGENTS.md

## Cursor Cloud specific instructions

This is a light npm monorepo: `web/` (Next.js 16 dashboard + TV signage player — the primary app), `functions/` (Firebase Cloud Functions), and `workers/upload-video/` (optional Cloudflare Worker). Standard commands live in the root and `web/` `package.json` scripts and in `README.md`; don't duplicate them here.

### Services and how to run them
- Web app (the only service needed for most work): `npm run dev` at the repo root (delegates to `web/` `next dev`), served at http://localhost:3000. Dashboard at `/dashboard`, public signage at `/display?branch=<CODE>`.
- There is no Firebase emulator wired up. In every environment (including local dev) the client talks directly to the live Firebase project `moneyexchange-35c33`. Firestore/Auth are real, so writes affect real data — prefer create-then-delete for test actions.
- Firebase Cloud Functions (`functions/`) and `workers/upload-video/` are optional for web development; run them only when working on those pieces (see `README.md`).

### Non-obvious gotchas
- `next dev` does NOT load `web/.env.production` (Next only loads `.env.production` for production builds). The committed public Firebase web config lives there, so without action dev fails at startup with `auth/invalid-api-key`. The fix is a `web/.env.local` (gitignored, loaded in all environments) copied from the committed `web/.env.production`. The startup update script creates it automatically; if you ever see `auth/invalid-api-key` in dev, run `cp web/.env.production web/.env.local` and restart the dev server.
- Seeded demo super-admin on the live project: `demo@moneyexchange.local` / `Demo123456!` (email/password login). Use it to reach the dashboard.
- Real seeded branch codes are `UG001`–`UG008` (e.g. `/display?branch=UG001`). The `DXB01` code referenced in `README.md` is not present and yields "Branch not found".
- `npm run build` in `web/` uses the webpack builder (`next build --webpack`), not Turbopack; `next dev` uses Turbopack.
- `npm run lint` currently reports pre-existing errors/warnings in `web/src/components/display/*` (React Compiler / hooks rules). These are not caused by environment setup.
- Seed/admin scripts (`npm run seed:production`) need a Firebase service-account JSON via `GOOGLE_APPLICATION_CREDENTIALS` (not committed); not required to run the web app since the live project is already seeded.
