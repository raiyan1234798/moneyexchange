#!/usr/bin/env node
/**
 * Seeds production/demo Firestore + Auth for MoneyExchangeTV.
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
const DEMO_EMAIL = "demo@moneyexchange.local";
const DEMO_PASSWORD = "Demo123456!";
const DEMO_DISPLAY_NAME = "Demo Admin";

const BRANCH_DOC_ID = "dxb01-main";
const BRANCH_CODE = "DXB01";

const SAMPLE_VIDEO_URL =
  "https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";

const DEFAULT_BRANCH_SETTINGS = {
  timezone: "Asia/Dubai",
  defaultLanguage: "en",
  slogan: "Your trusted exchange partner",
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
  { id: "currency_aed", currencyCode: "AED", currencyName: "UAE Dirham", country: "United Arab Emirates", flag: "🇦🇪", sortOrder: 4 },
];

/** Demo buy/sell vs AED (illustrative only). */
const DEMO_RATES = {
  USD: { buyRate: 3.649, sellRate: 3.669 },
  GBP: { buyRate: 4.549, sellRate: 4.579 },
  EUR: { buyRate: 3.949, sellRate: 3.979 },
  AED: { buyRate: 1.0, sellRate: 1.0 },
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

async function ensureDemoUser() {
  let user;
  try {
    user = await auth.getUserByEmail(DEMO_EMAIL);
    await auth.updateUser(user.uid, {
      password: DEMO_PASSWORD,
      displayName: DEMO_DISPLAY_NAME,
      disabled: false,
    });
    console.log(`Updated existing auth user: ${DEMO_EMAIL}`);
  } catch (error) {
    const code = error?.code;
    if (code !== "auth/user-not-found") throw error;
    user = await auth.createUser({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      displayName: DEMO_DISPLAY_NAME,
      emailVerified: true,
    });
    console.log(`Created auth user: ${DEMO_EMAIL}`);
  }

  await db.collection("users").doc(user.uid).set(
    {
      email: DEMO_EMAIL,
      displayName: DEMO_DISPLAY_NAME,
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
      name: "Dubai Main",
      code: BRANCH_CODE,
      address: "Sheikh Zayed Road",
      city: "Dubai",
      country: "United Arab Emirates",
      phone: "+971 4 000 0000",
      email: "dxb01@moneyexchange.com",
      managerId: null,
      logoUrl: null,
      brandingColor: "#0ea5e9",
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
    const rates = DEMO_RATES[c.currencyCode];
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
        { id: "line-1", text: "Welcome to Dubai Main — competitive rates daily.", priority: 1 },
        { id: "line-2", text: "Ask our team about zero-fee transfers on select corridors.", priority: 2 },
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
  const videoId = `video_${branchId}_demo`;
  await db.collection("videos").doc(videoId).set(
    {
      title: "Demo signage video",
      description: "External sample MP4 (no Firebase Storage upload).",
      branchId,
      category: "promo",
      sourceType: "external",
      storagePath: null,
      downloadUrl: SAMPLE_VIDEO_URL,
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
  console.log("Ensured external demo video + active playlist (no Storage upload)");
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
  const user = await ensureDemoUser();
  await ensureGlobalSettings();
  const branchId = await ensureBranch(user.uid, DEMO_DISPLAY_NAME);
  await ensureCurrencies();
  await ensureExchangeRates(branchId, user.uid, DEMO_DISPLAY_NAME);
  await ensureTicker(branchId, user.uid);
  await ensureVideoAndPlaylist(branchId, user.uid);
  await verifyBranch();

  console.log("\nProduction seed complete.");
  console.log(`Display: https://moneyexchange.pages.dev/display?branch=${BRANCH_CODE}`);
  console.log(`Test login: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
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
