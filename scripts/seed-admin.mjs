#!/usr/bin/env node
/**
 * Seeds demo admin account and global settings for local testing.
 *
 * Usage:
 *   npm run seed:admin
 *
 * Requires Firebase Admin credentials (firebase login + GOOGLE_APPLICATION_CREDENTIALS
 * or a service account key, or gcloud application-default login).
 */

import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const PROJECT_ID = "moneyexchange-35c33";
const DEMO_EMAIL = "demo@moneyexchange.local";
const DEMO_PASSWORD = "Demo123456!";
const DEMO_DISPLAY_NAME = "Demo Admin";

initializeApp({ projectId: PROJECT_ID });

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

async function main() {
  await ensureDemoUser();
  await ensureGlobalSettings();
  console.log("\nSeed complete.");
  console.log(`Test login: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  console.log("Super admin (Google): abubackerraiyan@gmail.com");
}

main().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
