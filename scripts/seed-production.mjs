#!/usr/bin/env node
/**
 * Seeds production Firestore + Auth for MoneyExchangeTV.
 *
 * Usage:
 *   npm run seed:production
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json npm run seed:production
 *
 * Prerequisites (one of):
 *   - Service account JSON with Firebase Admin / Firestore + Auth access
 *   - `gcloud auth application-default login` (Application Default Credentials)
 *   - Firebase CLI logged in as project owner (set GOOGLE_APPLICATION_CREDENTIALS from
 *     Firebase Console → Project settings → Service accounts → Generate new private key)
 *
 * Does NOT commit or read secrets from the repo — only uses env ADC.
 */

import { readFileSync } from "node:fs";
import { initializeApp, applicationDefault, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";

const PROJECT_ID = "moneyexchange-35c33";
const SEED_ADMIN_EMAIL = "demo@moneyexchange.local";
const SEED_ADMIN_PASSWORD = "Demo123456!";
const SEED_ADMIN_NAME = "System Admin";

const BRANCH_DOC_ID = "dxb01-main";
const BRANCH_CODE = "DXB01";

const SAMPLE_VIDEO_PATH = "/unimoni-promo.mp4";

const DEFAULT_BRANCH_SETTINGS = {
  timezone: "Africa/Kampala",
  defaultLanguage: "en",
  slogan: "WELCOME TO UNIMONI KISEMENT",
  tickerSpeed: 50,
  tickerFontSize: 18,
  tickerFontColor: "#FFFFFF",
  showBuyRate: true,
  showSellRate: true,
};

const CURRENCIES = [
  { id: "currency_usd", currencyCode: "USD", currencyName: "US Dollar", country: "United States", flag: "🇺🇸", sortOrder: 1 },
  { id: "currency_gbp", currencyCode: "GBP", currencyName: "British Pound", country: "United Kingdom", flag: "🇬🇧", sortOrder: 2 },
  { id: "currency_eur", currencyCode: "EUR", currencyName: "Euro", country: "European Union", flag: "🇪🇺", sortOrder: 3 },
  { id: "currency_aud", currencyCode: "AUD", currencyName: "Australian Dollar", country: "Australia", flag: "🇦🇺", sortOrder: 4 },
  { id: "currency_cad", currencyCode: "CAD", currencyName: "Canadian Dollar", country: "Canada", flag: "🇨🇦", sortOrder: 5 },
  { id: "currency_chf", currencyCode: "CHF", currencyName: "Swiss Franc", country: "Switzerland", flag: "🇨🇭", sortOrder: 6 },
  { id: "currency_kes", currencyCode: "KES", currencyName: "Kenyan Shilling", country: "Kenya", flag: "🇰🇪", sortOrder: 7 },
  { id: "currency_zar", currencyCode: "ZAR", currencyName: "South African Rand", country: "South Africa", flag: "🇿🇦", sortOrder: 8 },
  { id: "currency_tzs", currencyCode: "TZS", currencyName: "Tanzanian Shilling", country: "Tanzania", flag: "🇹🇿", sortOrder: 9 },
  { id: "currency_rwf", currencyCode: "RWF", currencyName: "Rwandan Franc", country: "Rwanda", flag: "🇷🇼", sortOrder: 10 },
  { id: "currency_sar", currencyCode: "SAR", currencyName: "Saudi Riyal", country: "Saudi Arabia", flag: "🇸🇦", sortOrder: 11 },
  { id: "currency_aed", currencyCode: "AED", currencyName: "UAE Dirham", country: "United Arab Emirates", flag: "🇦🇪", sortOrder: 12 },
];

/** Unimoni signage reference rates (UGX quote style). */
const SEED_RATES = {
  USD: { buyRate: 3625, sellRate: 3685 },
  GBP: { buyRate: 4725, sellRate: 4975 },
  EUR: { buyRate: 4095, sellRate: 4315 },
  AUD: { buyRate: 2060, sellRate: 2700 },
  CAD: { buyRate: 2200, sellRate: 3600 },
  CHF: { buyRate: 3010, sellRate: 4500 },
  KES: { buyRate: 27.3, sellRate: 30 },
  ZAR: { buyRate: 195, sellRate: 350 },
  TZS: { buyRate: 1.3, sellRate: 1.65 },
  RWF: { buyRate: 1.55, sellRate: 4.0 },
  SAR: { buyRate: 830, sellRate: 1120 },
  AED: { buyRate: 870, sellRate: 1250 },
};

function initFirebaseAdmin() {
  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (keyPath) {
    const serviceAccount = JSON.parse(readFileSync(keyPath, "utf8"));
    initializeApp({
      credential: cert(serviceAccount),
      projectId: PROJECT_ID,
    });
    return;
  }
  initializeApp({
    credential: applicationDefault(),
    projectId: PROJECT_ID,
  });
}

initFirebaseAdmin();

const auth = getAuth();
const db = getFirestore();

async function ensureAdminUser() {
  let user;
  try {
    user = await auth.getUserByEmail(SEED_ADMIN_EMAIL);
    await auth.updateUser(user.uid, {
      password: SEED_ADMIN_PASSWORD,
      displayName: SEED_ADMIN_NAME,
      disabled: false,
    });
    console.log(`Updated existing auth user: ${SEED_ADMIN_EMAIL}`);
  } catch (error) {
    const code = error?.code;
    if (code !== "auth/user-not-found") throw error;
    user = await auth.createUser({
      email: SEED_ADMIN_EMAIL,
      password: SEED_ADMIN_PASSWORD,
      displayName: SEED_ADMIN_NAME,
      emailVerified: true,
    });
    console.log(`Created auth user: ${SEED_ADMIN_EMAIL}`);
  }

  await db.collection("users").doc(user.uid).set(
    {
      email: SEED_ADMIN_EMAIL,
      displayName: SEED_ADMIN_NAME,
      role: "superAdmin",
      branchId: null,
      isActive: true,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  console.log(`Ensured Firestore profile at users/${user.uid}`);
  return user;
}

async function ensureGlobalSettings() {
  await db.collection("settings").doc("global").set(
    {
      companyName: "Money Exchange Company",
      supportEmail: "support@moneyexchange.com",
      defaultTimezone: "Asia/Dubai",
      emergencyRateEnabled: true,
      offlineCacheEnabled: true,
      tvHeartbeatIntervalSeconds: 60,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  console.log("Ensured settings/global");
}

async function ensureBranch(actorUid, actorName) {
  const ref = db.collection("branches").doc(BRANCH_DOC_ID);
  await ref.set(
    {
      name: "Unimoni Kisement",
      code: BRANCH_CODE,
      address: "Kisement",
      city: "Kampala",
      country: "Uganda",
      phone: "0759207000",
      email: "kisement@unimoni.com",
      managerId: null,
      logoUrl: null,
      brandingColor: "#0078D4",
      workingHours: "Mon–Sat 9:00–21:00",
      status: "active",
      settings: DEFAULT_BRANCH_SETTINGS,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  console.log(`Ensured branch ${BRANCH_CODE} (${BRANCH_DOC_ID})`);
  return BRANCH_DOC_ID;
}

async function ensureCurrencies() {
  for (const c of CURRENCIES) {
    const { id, ...data } = c;
    await db.collection("currencies").doc(id).set(
      {
        ...data,
        status: "active",
        isHidden: false,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }
  console.log(`Ensured ${CURRENCIES.length} currencies`);
}

async function ensureExchangeRates(branchId, actorUid, actorName) {
  let order = 0;
  for (const c of CURRENCIES) {
    order += 1;
    const rates = SEED_RATES[c.currencyCode];
    const docId = `rate_${branchId}_${c.currencyCode.toLowerCase()}`;
    await db.collection("exchange_rates").doc(docId).set(
      {
        branchId,
        currencyCode: c.currencyCode,
        buyRate: rates.buyRate,
        sellRate: rates.sellRate,
        version: 1,
        displayOrder: order,
        isHidden: false,
        status: "published",
        updatedBy: actorUid,
        updatedByName: actorName,
        publishedAt: Timestamp.now(),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }
  console.log(`Ensured published exchange rates for branch ${branchId}`);
}

async function ensureTicker(branchId, actorUid) {
  const docId = `ticker_${branchId}_main`;
  await db.collection("ticker_messages").doc(docId).set(
    {
      branchId,
      messages: [
        { id: "line-1", text: "WELCOME TO UNIMONI KISEMENT", priority: 1 },
      ],
      scrollSpeed: 50,
      fontSize: 18,
      fontColor: "#FFFFFF",
      paused: false,
      language: "en",
      scheduleStart: null,
      scheduleEnd: null,
      status: "active",
      createdBy: actorUid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  console.log("Ensured active ticker message");
}

async function ensureVideoAndPlaylist(branchId, actorUid) {
  const videoId = `video_${branchId}_promo`;
  await db.collection("videos").doc(videoId).set(
    {
      title: "Unimoni promo video",
      description: "Bundled signage promo MP4 served from Firebase Hosting.",
      branchId,
      category: "promo",
      sourceType: "external",
      storagePath: null,
      downloadUrl: SAMPLE_VIDEO_PATH,
      mimeType: "video/mp4",
      durationSeconds: 596,
      status: "active",
      expiresAt: null,
      createdBy: actorUid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  const playlistId = `playlist_${branchId}_default`;
  await db.collection("video_playlists").doc(playlistId).set(
    {
      name: "Default loop",
      branchId,
      videoIds: [videoId],
      loop: true,
      autoSwitch: true,
      scheduleStart: null,
      scheduleEnd: null,
      status: "active",
      createdBy: actorUid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  console.log("Ensured external promo video + active playlist (no Storage upload)");
}

async function verifyBranch() {
  const snap = await db
    .collection("branches")
    .where("code", "==", BRANCH_CODE)
    .where("status", "==", "active")
    .limit(1)
    .get();
  if (snap.empty) {
    throw new Error(`Verification failed: no active branch with code ${BRANCH_CODE}`);
  }
  const doc = snap.docs[0];
  console.log(`Verified branch: code=${doc.get("code")} id=${doc.id} name=${doc.get("name")}`);
}

async function main() {
  const user = await ensureAdminUser();
  await ensureGlobalSettings();
  const branchId = await ensureBranch(user.uid, SEED_ADMIN_NAME);
  await ensureCurrencies();
  await ensureExchangeRates(branchId, user.uid, SEED_ADMIN_NAME);
  await ensureTicker(branchId, user.uid);
  await ensureVideoAndPlaylist(branchId, user.uid);
  await verifyBranch();

  console.log("\nProduction seed complete.");
  console.log(`Display: https://moneyexchange-35c33.web.app/display?branch=${BRANCH_CODE}`);
  console.log(`Admin login: ${SEED_ADMIN_EMAIL} / ${SEED_ADMIN_PASSWORD}`);
  console.log("Super admin (Google): abubackerraiyan@gmail.com");
}

main().catch((error) => {
  console.error("Seed failed:", error?.message ?? error);
  console.error(
    "\nSet credentials then retry:\n" +
      "  export GOOGLE_APPLICATION_CREDENTIALS=\"/path/to/serviceAccount.json\"\n" +
      "  npm run seed:production\n",
  );
  process.exit(1);
});
